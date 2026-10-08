/**
 * NORQVA-0027: tela Campanhas — completar o plano de lançamento com os criativos aprovados,
 * modo manual campo a campo e criação de campanha a partir de uma oferta.
 *
 * Nada aqui fala com a Meta: só edita o RASCUNHO do plano (DRAFT/FAILED sem nenhum objeto criado).
 * A criação na Meta continua em LaunchPlanService.createOnMeta (tudo PAUSADO) e a ativação só com o Sim.
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { OFFICIAL_NORQVA_PIXEL_ID } from '../meta/metaMutatingClient';
import {
  LaunchPlanError,
  ALLOWED_CTA_TYPES,
  VIDEO_URL_PLACEHOLDER,
  normalizeMetaIds,
  serializeLaunchPlan,
  validateLaunchPlanInput
} from './launchPlanService';
import { urlTagsFor, DEFAULT_OFFER_BASE_URL } from '../aiTeam/launchSheet';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Campos que o operador pode editar (modo manual)
const AD_FIELDS = ['primary_text', 'headline', 'cta', 'destination_url'] as const;
const FIELD_RE = /^(?:ads\.(0|[1-9]\d?)\.(primary_text|headline|cta|destination_url)|adsets\.(0|[1-9]\d?)\.daily_budget_brl|max_spend_brl|hypothesis)$/;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const parse = (v: unknown) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return {}; } })() : v);
const obj = (v: unknown): Record<string, any> => {
  const p = parse(v);
  return isObj(p) ? { ...p } : {};
};
const httpsUrl = (v: unknown) => {
  try {
    const u = new URL(String(v || ''));
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
};

const audit = (pool: Pool, userId: string | null, event: string, desc: string, value: unknown = null) =>
  writeAuditLog(pool, userId, event, desc, null, value === null ? null : JSON.stringify(value), false, false).catch(() => {});

export interface CreativeCheck {
  ok: boolean;
  reason?: string;
  creative?: any;
}

/** Plano só é editável enquanto é rascunho (ou falhou) e nada foi criado na Meta. */
function assertEditable(row: any) {
  const ids = normalizeMetaIds(row.meta_ids);
  const created = Object.values(ids).some(m => Object.keys(m).length > 0);
  if (!['DRAFT', 'FAILED'].includes(row.status) || created) {
    throw new LaunchPlanError(409, 'Esta campanha já existe na Meta: só dá para pausar, mudar orçamento e teto pela tela de controle.');
  }
}

async function loadPlanRow(pool: Pool, id: string) {
  if (!UUID_RE.test(String(id || ''))) throw new LaunchPlanError(404, 'Campanha não encontrada.');
  const r = await pool.query('SELECT * FROM launch_plans WHERE id = $1', [id]);
  if (r.rows.length === 0) throw new LaunchPlanError(404, 'Campanha não encontrada.');
  return r.rows[0];
}

async function offerOf(pool: Pool, offerHumanId: string) {
  const r = await pool.query(
    `SELECT o.id, o.human_id, o.name, o.product_id, p.brand_id
     FROM offers o JOIN products p ON p.id = o.product_id
     WHERE o.human_id = $1 AND o.is_demo = FALSE AND COALESCE(o.is_deleted, FALSE) = FALSE`,
    [offerHumanId]
  );
  return r.rows[0] || null;
}

/** Versão aprovada mais nova da linhagem do criativo (revisões criam KEY-V2, KEY-V3...). */
async function latestApprovedInLineage(pool: Pool, creativeId: string) {
  const r = await pool.query(
    `WITH base AS (SELECT COALESCE(root_creative_id, id) AS root FROM creatives WHERE id = $1)
     SELECT c.* FROM creatives c, base
     WHERE (c.id = base.root OR c.root_creative_id = base.root)
       AND c.is_deleted = FALSE AND c.is_demo = FALSE AND c.approval_status = 'APPROVED'
     ORDER BY c.version DESC, c.created_at DESC
     LIMIT 1`,
    [creativeId]
  );
  return r.rows[0] || null;
}

/**
 * Criativo pode entrar no anúncio? Aprovado, vídeo, link https e com o MESMO conteúdo que foi aprovado
 * (trocar o arquivo depois da aprovação mantém o status, mas não deixa o arquivo ir para a Meta).
 */
export async function checkCreativeForAd(pool: Pool, creative: any, productId: string): Promise<CreativeCheck> {
  if (!creative) return { ok: false, reason: 'Nenhum criativo aprovado encontrado para este anúncio.' };
  if (String(creative.product_id) !== String(productId)) return { ok: false, reason: 'O criativo é de outro produto.' };
  if (creative.approval_status !== 'APPROVED') return { ok: false, reason: 'O criativo ainda não foi aprovado.' };
  if (creative.format !== 'VIDEO') return { ok: false, reason: 'Só vídeo pode ir para o anúncio por enquanto.' };
  if (!httpsUrl(creative.file_url)) return { ok: false, reason: 'O criativo não tem link https do vídeo.' };
  const review = await pool.query(
    `SELECT content_hash FROM creative_reviews WHERE creative_id = $1 AND decision = 'APPROVED' ORDER BY created_at DESC LIMIT 1`,
    [creative.id]
  );
  const approvedHash = review.rows[0]?.content_hash;
  if (!approvedHash || approvedHash !== creative.content_hash) {
    return { ok: false, reason: 'O arquivo mudou depois da aprovação: aprove o criativo de novo na tela Criativos.' };
  }
  return { ok: true, creative };
}

async function findCreativeForAd(pool: Pool, adName: string, chosenId: string | null) {
  if (chosenId) {
    return latestApprovedInLineage(pool, chosenId);
  }
  const byName = await pool.query(
    `SELECT id FROM creatives
     WHERE is_deleted = FALSE AND is_demo = FALSE AND (UPPER(utm_content_key) = UPPER($1) OR UPPER(human_id) = UPPER($1))
     ORDER BY version DESC LIMIT 1`,
    [adName]
  );
  if (byName.rows.length === 0) return null;
  return latestApprovedInLineage(pool, byName.rows[0].id);
}

/** Valida e grava a spec do rascunho (mesma validação de sempre). */
async function saveSpec(pool: Pool, row: any, spec: any, maxSpend: number, extra: { manual?: any; auto?: any; adCreatives?: any }) {
  const input = validateLaunchPlanInput({
    code: row.code,
    offer_human_id: row.offer_human_id,
    max_spend_brl: maxSpend,
    question_text: row.question_text,
    spec
  });
  const upd = await pool.query(
    `UPDATE launch_plans
     SET spec = $2, daily_budget_brl = $3, max_spend_brl = $4,
         manual_fields = COALESCE($5::jsonb, manual_fields),
         auto_values = COALESCE($6::jsonb, auto_values),
         ad_creatives = COALESCE($7::jsonb, ad_creatives),
         last_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status IN ('DRAFT', 'FAILED')
       AND NOT EXISTS (SELECT 1 FROM jsonb_each(meta_ids) e WHERE e.value <> '{}'::jsonb)
     RETURNING *`,
    [
      row.id,
      JSON.stringify(input.spec),
      input.daily_budget_brl,
      input.max_spend_brl,
      extra.manual ? JSON.stringify(extra.manual) : null,
      extra.auto ? JSON.stringify(extra.auto) : null,
      extra.adCreatives ? JSON.stringify(extra.adCreatives) : null
    ]
  );
  if (upd.rows.length === 0) throw new LaunchPlanError(409, 'A campanha mudou de situação; recarregue e tente de novo.');
  return upd.rows[0];
}

export function serializeCampaign(row: any) {
  const plan = serializeLaunchPlan(row);
  return {
    ...plan,
    manual_fields: obj(row.manual_fields),
    ad_creatives: obj(row.ad_creatives),
    auto_values: undefined,
    editable: (() => {
      try {
        assertEditable(row);
        return true;
      } catch {
        return false;
      }
    })()
  };
}

export class CampaignEditorService {
  async get(pool: Pool, id: string) {
    return serializeCampaign(await loadPlanRow(pool, id));
  }

  async list(pool: Pool) {
    const r = await pool.query('SELECT * FROM launch_plans ORDER BY created_at DESC LIMIT 200');
    return r.rows.map(serializeCampaign);
  }

  /** Criativos aprovados de vídeo do produto da campanha, com o motivo quando não servem. */
  async creativeOptions(pool: Pool, id: string) {
    const row = await loadPlanRow(pool, id);
    const offer = await offerOf(pool, row.offer_human_id);
    if (!offer) return { options: [] };
    const r = await pool.query(
      `SELECT * FROM creatives
       WHERE product_id = $1 AND is_deleted = FALSE AND is_demo = FALSE AND approval_status = 'APPROVED'
       ORDER BY human_id`,
      [offer.product_id]
    );
    const options = [];
    for (const c of r.rows) {
      const check = await checkCreativeForAd(pool, c, offer.product_id);
      options.push({ id: c.id, human_id: c.human_id, key: c.utm_content_key || c.human_id, format: c.format, file_url: c.file_url, ok: check.ok, reason: check.reason || null });
    }
    return { options };
  }

  /**
   * Preenche vídeo, texto e título de cada anúncio com a versão aprovada do criativo.
   * Campos marcados como manuais não são tocados. Devolve o resultado por anúncio.
   */
  async fillFromCreatives(pool: Pool, id: string, userId: string | null) {
    const row = await loadPlanRow(pool, id);
    assertEditable(row);
    const offer = await offerOf(pool, row.offer_human_id);
    if (!offer) throw new LaunchPlanError(409, `Oferta ${row.offer_human_id} não encontrada.`);
    const spec = obj(row.spec);
    const manual = obj(row.manual_fields);
    const chosen = obj(row.ad_creatives);
    const ads: any[] = Array.isArray(spec.ads) ? spec.ads.map((a: any) => ({ ...a })) : [];
    const results: { index: number; ad: string; status: 'FILLED' | 'SKIPPED'; creative?: string; reason?: string }[] = [];

    for (let i = 0; i < ads.length; i++) {
      const ad = ads[i];
      const creative = await findCreativeForAd(pool, ad.name, chosen[String(i)] || null);
      const check = await checkCreativeForAd(pool, creative, offer.product_id);
      if (!check.ok) {
        // Sem criativo aprovado e igual ao aprovado, o anúncio volta a "a preencher" (não pode ir para a Meta)
        ad.video_url = VIDEO_URL_PLACEHOLDER;
        results.push({ index: i, ad: ad.name, status: 'SKIPPED', reason: check.reason });
        continue;
      }
      const c = check.creative;
      const newName = String(c.utm_content_key || c.human_id);
      if (ads.some((other, j) => j !== i && other.name === newName)) {
        results.push({ index: i, ad: ad.name, status: 'SKIPPED', reason: `O criativo ${newName} já está em outro anúncio desta campanha.` });
        continue;
      }
      ad.video_url = c.file_url;
      if (!manual[`ads.${i}.primary_text`]) ad.primary_text = c.primary_text || c.copy || ad.primary_text;
      if (!manual[`ads.${i}.headline`]) ad.headline = (c.headline || ad.headline || String(c.hook || '')).slice(0, 255);
      ad.name = newName;
      ad.url_tags = urlTagsFor(row.code, newName);
      results.push({ index: i, ad: newName, status: 'FILLED', creative: c.human_id });
    }

    const updated = await saveSpec(pool, row, { ...spec, ads }, Number(row.max_spend_brl), {});
    await audit(pool, userId, 'CAMPAIGN_FILLED_FROM_CREATIVES', `Campanha ${row.code}: ${results.filter(r => r.status === 'FILLED').length} anúncio(s) preenchido(s) com criativos aprovados.`, { id: row.id, results });
    return { campaign: serializeCampaign(updated), results };
  }

  /** Edição manual: grava os campos e marca cada um como manual (o automático não sobrescreve mais). */
  async saveFields(pool: Pool, id: string, fields: Record<string, unknown>, userId: string | null) {
    const row = await loadPlanRow(pool, id);
    assertEditable(row);
    if (!isObj(fields) || Object.keys(fields).length === 0) throw new LaunchPlanError(400, 'Nenhum campo para salvar.');
    const spec = obj(row.spec);
    spec.ads = Array.isArray(spec.ads) ? spec.ads.map((a: any) => ({ ...a })) : [];
    spec.adsets = Array.isArray(spec.adsets) ? spec.adsets.map((a: any) => ({ ...a })) : [];
    const manual = obj(row.manual_fields);
    const auto = obj(row.auto_values);
    let maxSpend = Number(row.max_spend_brl);

    for (const [path, value] of Object.entries(fields)) {
      const m = path.match(FIELD_RE);
      if (!m) throw new LaunchPlanError(400, `Campo não editável: ${path}.`);
      let current: unknown;
      if (m[1] !== undefined) {
        const ad = spec.ads[Number(m[1])];
        if (!ad) throw new LaunchPlanError(400, `Anúncio ${Number(m[1]) + 1} não existe.`);
        const field = m[2] as (typeof AD_FIELDS)[number];
        current = ad[field];
        let v = String(value ?? '').trim();
        if (field === 'cta') {
          v = v.toUpperCase();
          if (!ALLOWED_CTA_TYPES.includes(v)) throw new LaunchPlanError(400, `Botão inválido (${ALLOWED_CTA_TYPES.join(', ')}).`);
        }
        ad[field] = v;
      } else if (m[3] !== undefined) {
        const adset = spec.adsets[Number(m[3])];
        if (!adset) throw new LaunchPlanError(400, `Conjunto ${Number(m[3]) + 1} não existe.`);
        current = adset.daily_budget_brl;
        adset.daily_budget_brl = Number(value);
      } else if (path === 'max_spend_brl') {
        current = maxSpend;
        maxSpend = Number(value);
      } else {
        current = spec.hypothesis ?? null;
        spec.hypothesis = value === null || value === undefined ? null : String(value);
      }
      if (!manual[path]) auto[path] = current === undefined ? null : current;
      manual[path] = true;
    }

    const updated = await saveSpec(pool, row, spec, maxSpend, { manual, auto });
    await audit(pool, userId, 'CAMPAIGN_FIELDS_EDITED', `Campanha ${row.code}: campos editados à mão (${Object.keys(fields).join(', ')}).`, { id: row.id, fields: Object.keys(fields) });
    return serializeCampaign(updated);
  }

  /** Escolhe à mão o criativo de um anúncio (null = volta a escolher pelo nome do anúncio). */
  async chooseCreative(pool: Pool, id: string, adIndex: number, creativeId: string | null, userId: string | null) {
    const row = await loadPlanRow(pool, id);
    assertEditable(row);
    const spec = obj(row.spec);
    if (!Array.isArray(spec.ads) || !spec.ads[adIndex]) throw new LaunchPlanError(400, 'Anúncio não existe.');
    const chosen = obj(row.ad_creatives);
    const manual = obj(row.manual_fields);
    const auto = obj(row.auto_values);
    const original = spec.ads[adIndex];
    if (creativeId) {
      if (!UUID_RE.test(creativeId)) throw new LaunchPlanError(400, 'Criativo inválido.');
      const offer = await offerOf(pool, row.offer_human_id);
      const c = await latestApprovedInLineage(pool, creativeId);
      const check = await checkCreativeForAd(pool, c, offer?.product_id);
      if (!check.ok) throw new LaunchPlanError(409, check.reason || 'Criativo não pode ir para o anúncio.');
      chosen[String(adIndex)] = creativeId;
      // guarda o anúncio automático (nome, vídeo, tags) para "Voltar ao automático"
      if (!manual[`ads.${adIndex}.creative`]) {
        auto[`ads.${adIndex}.creative`] = { name: original.name, video_url: original.video_url, url_tags: original.url_tags };
      }
      manual[`ads.${adIndex}.creative`] = true;
    } else {
      delete chosen[String(adIndex)];
      delete manual[`ads.${adIndex}.creative`];
      const prev = auto[`ads.${adIndex}.creative`];
      if (isObj(prev)) {
        spec.ads[adIndex] = { ...original, name: prev.name, video_url: prev.video_url, url_tags: prev.url_tags };
        delete auto[`ads.${adIndex}.creative`];
        await saveSpec(pool, row, spec, Number(row.max_spend_brl), {});
      }
    }
    const upd = await pool.query(
      `UPDATE launch_plans SET ad_creatives = $2, manual_fields = $3, auto_values = $4, updated_at = NOW()
       WHERE id = $1 AND status IN ('DRAFT', 'FAILED')
         AND NOT EXISTS (SELECT 1 FROM jsonb_each(meta_ids) e WHERE e.value <> '{}'::jsonb)`,
      [row.id, JSON.stringify(chosen), JSON.stringify(manual), JSON.stringify(auto)]
    );
    if (!upd.rowCount) throw new LaunchPlanError(409, 'A campanha mudou de situação; recarregue e tente de novo.');
    await audit(pool, userId, 'CAMPAIGN_CREATIVE_CHOSEN', `Campanha ${row.code}: anúncio ${adIndex + 1} com criativo ${creativeId || 'automático'}.`, { id: row.id, ad: adIndex, creative: creativeId });
    return this.fillFromCreatives(pool, id, userId);
  }

  /** Voltar ao automático: desfaz as edições manuais e preenche de novo com os criativos aprovados. */
  async resetToAuto(pool: Pool, id: string, userId: string | null) {
    const row = await loadPlanRow(pool, id);
    assertEditable(row);
    const spec = obj(row.spec);
    spec.ads = Array.isArray(spec.ads) ? spec.ads.map((a: any) => ({ ...a })) : [];
    spec.adsets = Array.isArray(spec.adsets) ? spec.adsets.map((a: any) => ({ ...a })) : [];
    const auto = obj(row.auto_values);
    let maxSpend = Number(row.max_spend_brl);
    for (const [path, value] of Object.entries(auto)) {
      const pick = path.match(/^ads\.(\d+)\.creative$/);
      if (pick && isObj(value) && spec.ads[Number(pick[1])]) {
        Object.assign(spec.ads[Number(pick[1])], { name: value.name, video_url: value.video_url, url_tags: value.url_tags });
        continue;
      }
      const m = path.match(FIELD_RE);
      if (!m) continue;
      if (m[1] !== undefined && spec.ads[Number(m[1])]) spec.ads[Number(m[1])][m[2]] = value;
      else if (m[3] !== undefined && spec.adsets[Number(m[3])]) spec.adsets[Number(m[3])].daily_budget_brl = value;
      else if (path === 'max_spend_brl') maxSpend = Number(value);
      else if (path === 'hypothesis') spec.hypothesis = value;
    }
    await saveSpec(pool, row, spec, maxSpend, { manual: {}, auto: {}, adCreatives: {} });
    await audit(pool, userId, 'CAMPAIGN_RESET_TO_AUTO', `Campanha ${row.code}: voltou ao preenchimento automático.`, { id: row.id });
    return this.fillFromCreatives(pool, id, userId);
  }

  /**
   * Nova campanha a partir de uma oferta e dos criativos aprovados escolhidos. Padrões: Brasil,
   * 25–65 anos, público Advantage, pixel oficial, destino /p/:oferta. Fica em rascunho.
   */
  async createFromOffer(
    pool: Pool,
    body: { offer_human_id?: string; creative_ids?: string[]; daily_budget_brl?: number; max_spend_brl?: number; campaign_name?: string; hypothesis?: string },
    userId: string | null
  ) {
    const offerHumanId = String(body?.offer_human_id || '').trim();
    const offer = offerHumanId ? await offerOf(pool, offerHumanId) : null;
    if (!offer) throw new LaunchPlanError(404, 'Oferta não encontrada.');
    const ids = Array.isArray(body?.creative_ids) ? body.creative_ids.map(String).filter(x => UUID_RE.test(x)) : [];
    if (ids.length < 1 || ids.length > 10) throw new LaunchPlanError(400, 'Escolha de 1 a 10 criativos aprovados.');

    const creatives = [];
    for (const cid of ids) {
      const c = await latestApprovedInLineage(pool, cid);
      const check = await checkCreativeForAd(pool, c, offer.product_id);
      if (!check.ok) throw new LaunchPlanError(409, `${c?.human_id || 'Criativo'}: ${check.reason}`);
      if (creatives.some(x => x.id === c.id)) continue;
      creatives.push(c);
    }

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(2, 14) + crypto.randomBytes(1).toString('hex').toUpperCase();
    const code = `CMP-${offer.human_id}-${stamp}`.toUpperCase().slice(0, 40);
    const campaignName = String(body?.campaign_name || '').trim() || `NORQVA_${offer.human_id.replace(/-/g, '_')}_${stamp}`;
    const daily = Number(body?.daily_budget_brl ?? 20);
    const maxSpend = Number(body?.max_spend_brl ?? daily * 7);
    const adsetName = `${code}_AS01`;
    const destination = `${DEFAULT_OFFER_BASE_URL}/p/${offer.human_id}`;
    const spec = {
      campaign: { name: campaignName, objective: 'OUTCOME_SALES' },
      pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
      custom_event_type: 'PURCHASE',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      adsets: [{ name: adsetName, daily_budget_brl: daily, targeting: { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true }, targeting_summary: 'Brasil, 25–65, público Advantage' }],
      ads: creatives.map(c => {
        const key = String(c.utm_content_key || c.human_id);
        return {
          name: key,
          adset_name: adsetName,
          video_url: c.file_url,
          thumbnail_url: null,
          primary_text: c.primary_text || c.copy,
          headline: (c.headline || String(c.hook || offer.name)).slice(0, 255),
          cta: 'SEE_DETAILS',
          destination_url: destination,
          url_tags: urlTagsFor(code, key)
        };
      }),
      pause_rules: ['Pausar anúncio com 2× o CPA de equilíbrio gasto sem venda.', 'Pausar tudo ao atingir o teto de gasto do plano.'],
      hypothesis: body?.hypothesis ? String(body.hypothesis).slice(0, 1000) : null
    };
    const input = validateLaunchPlanInput({
      code,
      offer_human_id: offer.human_id,
      max_spend_brl: maxSpend,
      question_text: `Ativar a campanha ${campaignName} com R$ ${daily.toFixed(2)}/dia e teto de R$ ${maxSpend.toFixed(2)}?`,
      spec
    });
    const ins = await pool.query(
      `INSERT INTO launch_plans (id, code, brand_id, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        crypto.randomUUID(), input.code, offer.brand_id || null, input.offer_human_id, JSON.stringify(input.spec),
        JSON.stringify(normalizeMetaIds({})), input.daily_budget_brl, input.max_spend_brl, input.question_text, userId
      ]
    );
    await audit(pool, userId, 'CAMPAIGN_CREATED_FROM_OFFER', `Campanha ${input.code} criada em rascunho a partir da oferta ${offer.human_id}.`, { id: ins.rows[0].id });
    return serializeCampaign(ins.rows[0]);
  }
}

/**
 * Trava da criação na Meta (chamada antes de LaunchPlanService.createOnMeta): cada anúncio precisa de um
 * criativo APROVADO, com o mesmo conteúdo da aprovação, e o vídeo do anúncio tem que ser o arquivo dele.
 */
export async function assertAdsReadyForMeta(pool: Pool, planId: string): Promise<void> {
  const row = await loadPlanRow(pool, planId);
  if (!['DRAFT', 'FAILED', 'CREATING'].includes(row.status)) return; // já criado: nada novo vai para a Meta
  const offer = await offerOf(pool, row.offer_human_id);
  if (!offer) throw new LaunchPlanError(409, `Oferta ${row.offer_human_id} não encontrada.`);
  const spec = obj(row.spec);
  const chosen = obj(row.ad_creatives);
  const ads: any[] = Array.isArray(spec.ads) ? spec.ads : [];
  for (let i = 0; i < ads.length; i++) {
    const creative = await findCreativeForAd(pool, ads[i].name, chosen[String(i)] || null);
    const check = await checkCreativeForAd(pool, creative, offer.product_id);
    if (!check.ok) throw new LaunchPlanError(409, `Anúncio ${i + 1} (${ads[i].name}): ${check.reason}`);
    if (String(ads[i].video_url) !== String(check.creative.file_url)) {
      throw new LaunchPlanError(409, `Anúncio ${i + 1} (${ads[i].name}): o vídeo não é o arquivo aprovado do criativo. Use "Preencher com os criativos aprovados".`);
    }
  }
}
