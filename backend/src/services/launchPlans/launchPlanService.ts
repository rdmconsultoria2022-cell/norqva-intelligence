import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';
import {
  MetaMutatingClient,
  MetaMutatingSecurityContext,
  OFFICIAL_NORQVA_PIXEL_ID,
  META_MIN_DAILY_BUDGET_BRL,
  getMaxDailyBudgetBRL
} from '../meta/metaMutatingClient';

// NORQVA-0019 (D-0010): o Claude prepara a campanha inteira na Meta, sempre PAUSADA; só a resposta
// "Sim" de um ADMIN humano no NORQVA cria a decisão, autoriza o capital e ativa os objetos do plano.
//
// Travas:
// - criação: META_MUTATION_ENABLED + preflight, conta REAL configurada, tudo PAUSED, audit_logs;
// - a spec só cria objetos novos: nenhum campo pode apontar para IDs existentes (protege o CONTROL);
// - ativação: só objetos cujo ID está em launch_plans.meta_ids; decisão APROVADA por ADMIN (HITL) e
//   capital reservado no experimento antes de qualquer ACTIVE; teto diário META_MAX_DAILY_BUDGET_BRL.

export const LAUNCH_PLAN_STATUSES = [
  'DRAFT',
  'CREATING',
  'CREATED_PAUSED',
  'AWAITING_OPERATOR',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'FAILED'
] as const;
export type LaunchPlanStatus = (typeof LAUNCH_PLAN_STATUSES)[number];

export const VIDEO_URL_PLACEHOLDER = 'TO_BE_FILLED';
export const ALLOWED_CTA_TYPES = ['SEE_DETAILS', 'LEARN_MORE', 'SHOP_NOW', 'BUY_NOW', 'ORDER_NOW', 'GET_OFFER', 'SIGN_UP', 'DOWNLOAD'];
const CREATING_STALE_MS = 15 * 60 * 1000;

// Campos que apontariam para objetos que o plano não criou. Recusados em qualquer nível da spec.
const FORBIDDEN_ID_KEYS = new Set([
  'id',
  'campaign_id',
  'adset_id',
  'ad_id',
  'creative_id',
  'video_id',
  'post_id',
  'object_story_id',
  'effective_object_story_id',
  'source_ad_id',
  'source_campaign_id',
  'source_adset_id',
  'existing_id',
  'meta_id',
  'meta_ids'
]);
// Únicos campos que podem conter IDs numéricos da Meta (ativos da marca, não objetos de campanha).
const ASSET_ID_KEYS = new Set(['pixel_id', 'page_id', 'instagram_id']);

export class LaunchPlanError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Before creating a campaign/ad set/ad, look it up live on Meta by its exact name under the parent.
 * - none found  -> null (safe to create)
 * - one PAUSED  -> adopt its id (a previous POST succeeded but its id was lost)
 * - one not PAUSED or several -> stop: manual reconciliation (never touch or duplicate it)
 */
async function adoptExistingLaunchObject(
  client: MetaMutatingClient,
  ctx: MetaMutatingSecurityContext,
  parent: 'ACCOUNT' | string,
  edge: 'campaigns' | 'adsets' | 'ads',
  name: string
): Promise<string | null> {
  const found = await client.findLaunchObjectsByName(ctx, parent, edge, name);
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new LaunchPlanError(409, `Encontrados ${found.length} objetos "${name}" em ${edge}; reconciliação manual necessária (nada foi criado).`);
  }
  if (found[0].status !== 'PAUSED') {
    throw new LaunchPlanError(409, `Já existe "${name}" (${found[0].id}) com status ${found[0].status || 'desconhecido'}; reconciliação manual necessária (nada foi criado).`);
  }
  return found[0].id;
}

export interface LaunchPlanTargeting {
  countries: string[];
  age_min: number;
  age_max: number;
  advantage_audience: boolean;
}

export interface LaunchPlanAdSetSpec {
  name: string;
  daily_budget_brl: number;
  targeting: LaunchPlanTargeting;
  targeting_summary: string | null;
}

export interface LaunchPlanAdSpec {
  name: string;
  adset_name: string;
  video_url: string;
  thumbnail_url: string | null;
  primary_text: string;
  headline: string;
  cta: string;
  destination_url: string;
  url_tags: string;
}

export interface LaunchPlanSpec {
  campaign: { name: string; objective: 'OUTCOME_SALES' };
  pixel_id: string;
  custom_event_type: 'PURCHASE';
  optimization_goal: 'OFFSITE_CONVERSIONS';
  page_id: string | null;
  instagram_id: string | null;
  adsets: LaunchPlanAdSetSpec[];
  ads: LaunchPlanAdSpec[];
  pause_rules: string[];
  hypothesis: string | null;
}

export interface LaunchPlanInput {
  code: string;
  brand_code: string | null;
  brand_id: string | null;
  offer_human_id: string;
  max_spend_brl: number;
  question_text: string;
  daily_budget_brl: number;
  spec: LaunchPlanSpec;
}

export interface LaunchPlanMetaIds {
  campaign: Record<string, string>;
  adsets: Record<string, string>;
  videos: Record<string, string>;
  creatives: Record<string, string>;
  ads: Record<string, string>;
}

export interface LaunchPlanUser {
  id: string;
  role: string;
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const httpsUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname;
  } catch {
    return false;
  }
};
const money = (n: number) => Math.round(n * 100) / 100;

/** Recusa qualquer referência a objetos existentes da Meta (o plano só cria objetos novos). */
export function assertSpecCreatesOnlyNewObjects(value: unknown, path = 'spec'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertSpecCreatesOnlyNewObjects(v, `${path}[${i}]`));
    return;
  }
  if (!isObj(value)) return;
  for (const [key, v] of Object.entries(value)) {
    const k = key.toLowerCase();
    if (FORBIDDEN_ID_KEYS.has(k) || /(^|_)(campaign|adset|ad|creative|post)_?ids?$/.test(k)) {
      throw new LaunchPlanError(400, `A spec não pode referenciar objetos existentes da Meta (campo "${path}.${key}"). O plano só cria objetos novos.`);
    }
    if (!ASSET_ID_KEYS.has(k)) {
      if ((typeof v === 'string' && /^[0-9]{12,}$/.test(v.trim())) || (typeof v === 'number' && Math.abs(v) >= 1e11)) {
        throw new LaunchPlanError(400, `A spec não pode conter IDs da Meta fora de pixel_id/page_id/instagram_id (campo "${path}.${key}").`);
      }
    }
    assertSpecCreatesOnlyNewObjects(v, `${path}.${key}`);
  }
}

function validateTargeting(raw: unknown, adsetName: string): LaunchPlanTargeting {
  const t = isObj(raw) ? raw : {};
  const countries = Array.isArray(t.countries) ? t.countries.map((c: unknown) => String(c || '').trim().toUpperCase()) : [];
  if (countries.length < 1 || countries.length > 25 || countries.some((c: string) => !/^[A-Z]{2}$/.test(c))) {
    throw new LaunchPlanError(400, `Conjunto "${adsetName}": informe os países (códigos de 2 letras, ex.: BR).`);
  }
  const ageMin = Number(t.age_min);
  const ageMax = Number(t.age_max);
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 18 || ageMax > 65 || ageMin > ageMax) {
    throw new LaunchPlanError(400, `Conjunto "${adsetName}": faixa de idade inválida (18 a 65).`);
  }
  return { countries: Array.from(new Set(countries)), age_min: ageMin, age_max: ageMax, advantage_audience: t.advantage_audience !== false };
}

/** Meta targeting do conjunto. Posicionamentos Advantage+: nenhum publisher_platforms definido. */
export function toMetaTargeting(t: LaunchPlanTargeting): Record<string, any> {
  const out: Record<string, any> = {
    geo_locations: { countries: t.countries },
    age_min: t.age_min,
    age_max: t.age_max
  };
  out.targeting_automation = { advantage_audience: t.advantage_audience ? 1 : 0 };
  return out;
}

const humanIdFromUrl = (url: string): string | null => {
  try {
    const m = new URL(url).pathname.match(/^\/p\/([A-Za-z0-9_-]+)$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

/**
 * Valida e normaliza o plano. `forCreation` exige o que só é necessário para criar na Meta
 * (vídeos com URL https real em vez do marcador TO_BE_FILLED).
 */
export function validateLaunchPlanInput(body: unknown, opts: { forCreation?: boolean } = {}): LaunchPlanInput {
  const b = isObj(body) ? body : {};
  const code = String(b.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new LaunchPlanError(400, 'Código do plano inválido (ex.: TR-EXP02).');
  }
  const rawSpec = b.spec;
  if (!isObj(rawSpec)) throw new LaunchPlanError(400, 'Informe a spec do plano.');
  assertSpecCreatesOnlyNewObjects(rawSpec);

  const campaign = isObj(rawSpec.campaign) ? rawSpec.campaign : {};
  const campaignName = str(campaign.name, 200);
  if (!campaignName) throw new LaunchPlanError(400, 'Informe o nome da campanha.');
  if ((campaign.objective || 'OUTCOME_SALES') !== 'OUTCOME_SALES') {
    throw new LaunchPlanError(400, 'O objetivo da campanha deve ser OUTCOME_SALES (Vendas).');
  }

  const pixelId = String(rawSpec.pixel_id || '').trim();
  if (pixelId !== OFFICIAL_NORQVA_PIXEL_ID) {
    throw new LaunchPlanError(400, `O pixel do plano deve ser o pixel oficial do NORQVA (${OFFICIAL_NORQVA_PIXEL_ID}).`);
  }
  if ((rawSpec.custom_event_type || 'PURCHASE') !== 'PURCHASE') {
    throw new LaunchPlanError(400, 'O evento de conversão deve ser PURCHASE (Compra).');
  }
  if ((rawSpec.optimization_goal || 'OFFSITE_CONVERSIONS') !== 'OFFSITE_CONVERSIONS') {
    throw new LaunchPlanError(400, 'A otimização deve ser OFFSITE_CONVERSIONS.');
  }
  const assetId = (v: unknown, label: string): string | null => {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v).trim();
    if (!/^[0-9]{5,30}$/.test(s)) throw new LaunchPlanError(400, `${label} inválido.`);
    return s;
  };
  const pageId = assetId(rawSpec.page_id, 'page_id');
  const instagramId = assetId(rawSpec.instagram_id, 'instagram_id');

  const max = getMaxDailyBudgetBRL();
  if (!Array.isArray(rawSpec.adsets) || rawSpec.adsets.length < 1 || rawSpec.adsets.length > 10) {
    throw new LaunchPlanError(400, 'Informe de 1 a 10 conjuntos de anúncios.');
  }
  const adsetNames = new Set<string>();
  const adsets: LaunchPlanAdSetSpec[] = rawSpec.adsets.map((raw: unknown) => {
    const a = isObj(raw) ? raw : {};
    const name = str(a.name, 200);
    if (!name) throw new LaunchPlanError(400, 'Todo conjunto precisa de nome.');
    if (adsetNames.has(name)) throw new LaunchPlanError(400, `Nome de conjunto repetido: "${name}".`);
    adsetNames.add(name);
    const budget = money(Number(a.daily_budget_brl));
    if (!Number.isFinite(budget) || budget < META_MIN_DAILY_BUDGET_BRL || budget > max) {
      throw new LaunchPlanError(400, `Conjunto "${name}": orçamento diário deve ficar entre R$ ${META_MIN_DAILY_BUDGET_BRL.toFixed(2)} e R$ ${max.toFixed(2)}.`);
    }
    return { name, daily_budget_brl: budget, targeting: validateTargeting(a.targeting, name), targeting_summary: str(a.targeting_summary, 300) };
  });

  if (!Array.isArray(rawSpec.ads) || rawSpec.ads.length < 1 || rawSpec.ads.length > 50) {
    throw new LaunchPlanError(400, 'Informe de 1 a 50 anúncios.');
  }
  const urlGuard = new MetaMutatingClient();
  const adNames = new Set<string>();
  const ads: LaunchPlanAdSpec[] = rawSpec.ads.map((raw: unknown) => {
    const a = isObj(raw) ? raw : {};
    const name = str(a.name, 200);
    if (!name) throw new LaunchPlanError(400, 'Todo anúncio precisa de nome.');
    if (adNames.has(name)) throw new LaunchPlanError(400, `Nome de anúncio repetido: "${name}".`);
    adNames.add(name);
    const adsetName = str(a.adset_name, 200);
    if (!adsetName || !adsetNames.has(adsetName)) throw new LaunchPlanError(400, `Anúncio "${name}": conjunto "${adsetName || ''}" não está no plano.`);

    const videoUrl = String(a.video_url || '').trim();
    if (videoUrl === VIDEO_URL_PLACEHOLDER) {
      if (opts.forCreation) throw new LaunchPlanError(400, `Anúncio "${name}": preencha video_url (está "${VIDEO_URL_PLACEHOLDER}") antes de criar na Meta.`);
    } else if (!httpsUrl(videoUrl)) {
      throw new LaunchPlanError(400, `Anúncio "${name}": video_url deve ser uma URL https pública (ou "${VIDEO_URL_PLACEHOLDER}" no rascunho).`);
    }
    const thumb = a.thumbnail_url === undefined || a.thumbnail_url === null || a.thumbnail_url === '' ? null : String(a.thumbnail_url).trim();
    if (thumb !== null && !httpsUrl(thumb)) throw new LaunchPlanError(400, `Anúncio "${name}": thumbnail_url deve ser https.`);

    const primaryText = str(a.primary_text, 2000);
    const headline = str(a.headline, 255);
    if (!primaryText || !headline) throw new LaunchPlanError(400, `Anúncio "${name}": informe texto principal e título.`);
    const cta = String(a.cta || '').trim().toUpperCase();
    if (!ALLOWED_CTA_TYPES.includes(cta)) throw new LaunchPlanError(400, `Anúncio "${name}": CTA inválido (${ALLOWED_CTA_TYPES.join(', ')}).`);

    const destination = String(a.destination_url || '').trim();
    try {
      urlGuard.assertUrlWhitelisted(destination);
    } catch {
      throw new LaunchPlanError(400, `Anúncio "${name}": destino não permitido (${destination}). Use a página pública da oferta (/p/:humanId) no domínio do NORQVA ou de uma marca verificada.`);
    }
    const urlTags = String(a.url_tags || '').trim();
    try {
      if (!urlTags) throw new Error('empty');
      MetaMutatingClient.assertValidUrlTags(urlTags);
    } catch {
      throw new LaunchPlanError(400, `Anúncio "${name}": url_tags inválido.`);
    }
    return {
      name,
      adset_name: adsetName,
      video_url: videoUrl,
      thumbnail_url: thumb,
      primary_text: primaryText,
      headline,
      cta,
      destination_url: destination,
      url_tags: urlTags
    };
  });
  for (const s of adsets) {
    if (!ads.some((a) => a.adset_name === s.name)) throw new LaunchPlanError(400, `Conjunto "${s.name}" não tem anúncio.`);
  }

  const destHumanIds = Array.from(new Set(ads.map((a) => humanIdFromUrl(a.destination_url))));
  const offerHumanId = str(b.offer_human_id, 50) || (destHumanIds.length === 1 ? destHumanIds[0] : null);
  if (!offerHumanId || destHumanIds.length !== 1 || destHumanIds[0] !== offerHumanId) {
    throw new LaunchPlanError(400, 'Todos os anúncios devem levar à página da mesma oferta (offer_human_id).');
  }

  const dailyTotal = money(adsets.reduce((s, a) => s + a.daily_budget_brl, 0));
  const maxSpend = money(Number(b.max_spend_brl));
  if (!Number.isFinite(maxSpend) || maxSpend <= 0 || maxSpend > 100000) throw new LaunchPlanError(400, 'Informe o teto de gasto (max_spend_brl).');
  if (maxSpend < dailyTotal) throw new LaunchPlanError(400, 'O teto de gasto não cobre nem um dia do orçamento do plano.');
  const question = str(b.question_text, 500);
  if (!question || question.length < 5) throw new LaunchPlanError(400, 'Informe a pergunta para o operador (question_text).');

  return {
    code,
    brand_code: str(b.brand_code, 40),
    brand_id: str(b.brand_id, 40),
    offer_human_id: offerHumanId,
    max_spend_brl: maxSpend,
    question_text: question,
    daily_budget_brl: dailyTotal,
    spec: {
      campaign: { name: campaignName, objective: 'OUTCOME_SALES' },
      pixel_id: pixelId,
      custom_event_type: 'PURCHASE',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      page_id: pageId,
      instagram_id: instagramId,
      adsets,
      ads,
      pause_rules: Array.isArray(rawSpec.pause_rules) ? rawSpec.pause_rules.map((r: unknown) => str(r, 300)).filter((r: string | null): r is string => !!r).slice(0, 20) : [],
      hypothesis: str(rawSpec.hypothesis, 1000)
    }
  };
}

export function normalizeMetaIds(raw: unknown): LaunchPlanMetaIds {
  const r = isObj(raw) ? raw : typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
  const m = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (isObj(v)) for (const [k, val] of Object.entries(v)) if (val !== null && val !== undefined && String(val)) out[k] = String(val);
    return out;
  };
  return { campaign: m(r.campaign), adsets: m(r.adsets), videos: m(r.videos), creatives: m(r.creatives), ads: m(r.ads) };
}

const parseJson = (v: unknown) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v);

export function serializeLaunchPlan(row: any) {
  if (!row) return row;
  const num = (v: any) => (v === null || v === undefined ? null : parseFloat(v));
  return {
    ...row,
    spec: parseJson(row.spec),
    meta_ids: normalizeMetaIds(row.meta_ids),
    daily_budget_brl: num(row.daily_budget_brl),
    max_spend_brl: num(row.max_spend_brl)
  };
}

async function nextHumanId(db: Pool | PoolClient, table: 'decisions' | 'experiments', prefix: string): Promise<string> {
  try {
    for (;;) {
      const res = await db.query(`SELECT nextval('seq_${table}_human_id') AS num`);
      const candidate = `${prefix}-${String(parseInt(res.rows[0].num, 10)).padStart(6, '0')}`;
      const taken = await db.query(`SELECT 1 FROM ${table} WHERE human_id = $1 LIMIT 1`, [candidate]);
      if (taken.rows.length === 0) return candidate;
    }
  } catch {
    const res = await db.query(`SELECT human_id FROM ${table} WHERE human_id LIKE $1 ORDER BY human_id DESC LIMIT 1`, [`${prefix}-%`]);
    const last = res.rows[0]?.human_id;
    const n = last ? parseInt(String(last).replace(`${prefix}-`, ''), 10) : 0;
    return `${prefix}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, '0')}`;
  }
}

const audit = (pool: Pool, userId: string | null, event: string, desc: string, value: unknown = null) =>
  writeAuditLog(pool, userId, event, desc, null, value === null ? null : JSON.stringify(value), false, false).catch(() => {});

const errorText = (err: any) => String(err?.message || err || 'erro desconhecido').slice(0, 1000);

export class LaunchPlanService {
  async list(pool: Pool, filter: { status?: string } = {}) {
    const status = filter.status ? String(filter.status).toUpperCase() : null;
    if (status && !(LAUNCH_PLAN_STATUSES as readonly string[]).includes(status)) throw new LaunchPlanError(400, 'Status inválido.');
    const res = status
      ? await pool.query('SELECT * FROM launch_plans WHERE status = $1 ORDER BY created_at DESC', [status])
      : await pool.query('SELECT * FROM launch_plans ORDER BY created_at DESC LIMIT 200');
    return res.rows.map(serializeLaunchPlan);
  }

  async get(pool: Pool, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new LaunchPlanError(404, 'Plano não encontrado.');
    const res = await pool.query('SELECT * FROM launch_plans WHERE id = $1', [id]);
    if (res.rows.length === 0) throw new LaunchPlanError(404, 'Plano não encontrado.');
    return serializeLaunchPlan(res.rows[0]);
  }

  private async resolveBrandId(pool: Pool, input: LaunchPlanInput): Promise<string | null> {
    if (input.brand_id) {
      const r = await pool.query('SELECT id FROM brands WHERE id::text = $1', [input.brand_id]);
      if (r.rows.length === 0) throw new LaunchPlanError(400, 'Marca não encontrada.');
      return r.rows[0].id;
    }
    if (input.brand_code) {
      const r = await pool.query('SELECT id FROM brands WHERE code = $1', [input.brand_code.toUpperCase()]);
      if (r.rows.length === 0) throw new LaunchPlanError(400, `Marca ${input.brand_code} não encontrada.`);
      return r.rows[0].id;
    }
    return null;
  }

  /** Grava (ou substitui, enquanto DRAFT e sem nada criado na Meta) o plano. Nada é enviado à Meta. */
  async createDraft(pool: Pool, body: unknown, userId: string | null) {
    const input = validateLaunchPlanInput(body);
    const brandId = await this.resolveBrandId(pool, input);
    const existing = (await pool.query('SELECT * FROM launch_plans WHERE code = $1', [input.code])).rows[0];
    if (existing) {
      const ids = normalizeMetaIds(existing.meta_ids);
      const created = Object.values(ids).some((m) => Object.keys(m).length > 0);
      if (existing.status !== 'DRAFT' || created) {
        throw new LaunchPlanError(409, `O plano ${input.code} já existe (status ${existing.status}) e não pode mais ser substituído.`);
      }
      const upd = await pool.query(
        `UPDATE launch_plans SET brand_id = $2, offer_human_id = $3, spec = $4, daily_budget_brl = $5, max_spend_brl = $6,
                question_text = $7, last_error = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'DRAFT' RETURNING *`,
        [existing.id, brandId, input.offer_human_id, JSON.stringify(input.spec), input.daily_budget_brl, input.max_spend_brl, input.question_text]
      );
      if (upd.rows.length === 0) throw new LaunchPlanError(409, 'O plano mudou de status; tente de novo.');
      await audit(pool, userId, 'LAUNCH_PLAN_UPDATED', `Plano ${input.code} atualizado (rascunho).`, { id: existing.id, code: input.code });
      return { plan: serializeLaunchPlan(upd.rows[0]), created: false };
    }
    const ins = await pool.query(
      `INSERT INTO launch_plans (id, code, brand_id, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        crypto.randomUUID(),
        input.code,
        brandId,
        input.offer_human_id,
        JSON.stringify(input.spec),
        JSON.stringify(normalizeMetaIds({})),
        input.daily_budget_brl,
        input.max_spend_brl,
        input.question_text,
        userId
      ]
    );
    await audit(pool, userId, 'LAUNCH_PLAN_DRAFTED', `Plano ${input.code} gravado como rascunho.`, { id: ins.rows[0].id, code: input.code });
    return { plan: serializeLaunchPlan(ins.rows[0]), created: true };
  }

  private async brandAsset(pool: Pool, brandId: string | null, type: 'FACEBOOK_PAGE' | 'INSTAGRAM'): Promise<string | null> {
    if (!brandId) return null;
    const r = await pool.query(
      `SELECT external_id FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = $2 AND external_id IS NOT NULL
         AND status IN ('LINKED', 'VERIFIED') LIMIT 1`,
      [brandId, type]
    );
    return r.rows[0]?.external_id ? String(r.rows[0].external_id) : null;
  }

  /**
   * Cria na Meta tudo PAUSADO. Idempotente e retomável: cada ID criado é gravado em meta_ids
   * (por nome do objeto) na hora; uma nova execução pula o que já existe.
   */
  async createOnMeta(pool: Pool, id: string, user: LaunchPlanUser, client: MetaMutatingClient) {
    if (user.role !== 'ADMIN') throw new LaunchPlanError(403, 'Somente ADMIN pode criar o plano na Meta.');
    const plan = await this.get(pool, id);
    if (plan.status === 'AWAITING_OPERATOR') return { plan, alreadyCreated: true };
    if (plan.status === 'CREATED_PAUSED') {
      const r = await pool.query(`UPDATE launch_plans SET status = 'AWAITING_OPERATOR', updated_at = NOW() WHERE id = $1 AND status = 'CREATED_PAUSED' RETURNING *`, [id]);
      return { plan: r.rows[0] ? serializeLaunchPlan(r.rows[0]) : await this.get(pool, id), alreadyCreated: true };
    }
    const stale = plan.status === 'CREATING' && new Date(plan.updated_at).getTime() < Date.now() - CREATING_STALE_MS;
    if (!['DRAFT', 'FAILED'].includes(plan.status) && !stale) {
      throw new LaunchPlanError(409, `O plano está em ${plan.status} e não pode ser criado agora.`);
    }

    const input = validateLaunchPlanInput(
      { code: plan.code, offer_human_id: plan.offer_human_id, max_spend_brl: plan.max_spend_brl, question_text: plan.question_text, spec: plan.spec },
      { forCreation: true }
    );
    const spec = input.spec;
    const pageId = spec.page_id || (await this.brandAsset(pool, plan.brand_id, 'FACEBOOK_PAGE'));
    const instagramId = spec.instagram_id || (await this.brandAsset(pool, plan.brand_id, 'INSTAGRAM'));
    if (!pageId) throw new LaunchPlanError(400, 'O plano precisa da Página do Facebook (page_id ou ativo FACEBOOK_PAGE da marca).');

    // Nunca reaproveitar/encostar em campanha que o plano não criou (ex.: CONTROL com o mesmo nome).
    const known = normalizeMetaIds(plan.meta_ids);
    const clash = await pool.query('SELECT meta_campaign_id FROM meta_campaigns WHERE name = $1 AND is_demo = FALSE', [spec.campaign.name]);
    if (clash.rows.some((r: any) => String(r.meta_campaign_id) !== known.campaign[spec.campaign.name])) {
      throw new LaunchPlanError(409, `Já existe na conta uma campanha chamada "${spec.campaign.name}" que este plano não criou. Use outro nome.`);
    }

    const ctx: MetaMutatingSecurityContext = { userId: user.id, userRole: user.role, isDemo: false };
    // Trava global antes de mudar o status: sem META_MUTATION_ENABLED/preflight nada acontece.
    await client.assertFeatureFlagAndPreflight(ctx);

    const claim = await pool.query(
      `UPDATE launch_plans SET status = 'CREATING', last_error = NULL, updated_at = NOW()
       WHERE id = $1 AND (status IN ('DRAFT', 'FAILED') OR (status = 'CREATING' AND updated_at < $2))
       RETURNING *`,
      [id, new Date(Date.now() - CREATING_STALE_MS)]
    );
    if (claim.rows.length === 0) throw new LaunchPlanError(409, 'O plano já está sendo criado por outra execução.');
    const ids = normalizeMetaIds(claim.rows[0].meta_ids);
    const save = async () => {
      await pool.query('UPDATE launch_plans SET meta_ids = $2, updated_at = NOW() WHERE id = $1', [id, JSON.stringify(ids)]);
    };
    await audit(pool, user.id, 'LAUNCH_PLAN_CREATE_STARTED', `Plano ${plan.code}: criação na Meta iniciada (tudo PAUSADO).`, { id, resume: Object.keys(ids.campaign).length > 0 });

    try {
      const cName = spec.campaign.name;
      if (!ids.campaign[cName]) {
        const adopted = await adoptExistingLaunchObject(client, ctx, 'ACCOUNT', 'campaigns', cName);
        if (adopted) {
          ids.campaign[cName] = adopted;
          await save();
          await audit(pool, user.id, 'LAUNCH_PLAN_OBJECT_ADOPTED', `Plano ${plan.code}: campanha "${cName}" já existia PAUSADA (${adopted}); adotada sem novo POST.`, { id, campaign: adopted });
        }
      }
      if (!ids.campaign[cName]) {
        await client.createPausedCampaign(pool, { name: cName, objective: 'OUTCOME_SALES' }, ctx, async (extId) => {
          ids.campaign[cName] = extId;
          await save();
        });
      }
      const campaignId = ids.campaign[cName];

      for (const s of spec.adsets) {
        if (ids.adsets[s.name]) continue;
        const adoptedSet = await adoptExistingLaunchObject(client, ctx, campaignId, 'adsets', s.name);
        if (adoptedSet) {
          ids.adsets[s.name] = adoptedSet;
          await save();
          await audit(pool, user.id, 'LAUNCH_PLAN_OBJECT_ADOPTED', `Plano ${plan.code}: conjunto "${s.name}" já existia PAUSADO (${adoptedSet}); adotado sem novo POST.`, { id, adset: adoptedSet });
          continue;
        }
        await client.createPausedAdSet(
          pool,
          {
            campaignId,
            name: s.name,
            dailyBudget: s.daily_budget_brl,
            pixelId: spec.pixel_id,
            customEventType: 'PURCHASE',
            optimizationGoal: 'OFFSITE_CONVERSIONS',
            targeting: toMetaTargeting(s.targeting)
          },
          ctx,
          async (extId) => {
            ids.adsets[s.name] = extId;
            await save();
          }
        );
      }

      for (const ad of spec.ads) {
        if (ids.ads[ad.name]) continue;
        const adoptedAd = await adoptExistingLaunchObject(client, ctx, ids.adsets[ad.adset_name], 'ads', ad.name);
        if (adoptedAd) {
          ids.ads[ad.name] = adoptedAd;
          await save();
          await audit(pool, user.id, 'LAUNCH_PLAN_OBJECT_ADOPTED', `Plano ${plan.code}: anúncio "${ad.name}" já existia PAUSADO (${adoptedAd}); adotado sem novo POST.`, { id, ad: adoptedAd });
          continue;
        }
        if (!ids.creatives[ad.name]) {
          if (!ids.videos[ad.name]) {
            const v = await client.uploadVideoFromUrl(pool, { fileUrl: ad.video_url, name: `${plan.code}_${ad.name}` }, ctx);
            ids.videos[ad.name] = v.id;
            await save();
          }
          const ready = await client.waitForVideoReady(ids.videos[ad.name]);
          const creative = await client.createAdCreative(
            pool,
            {
              name: `${ad.name}_CREATIVE`,
              title: ad.headline,
              body: ad.primary_text,
              destinationUrl: ad.destination_url,
              callToAction: ad.cta,
              videoId: ids.videos[ad.name],
              thumbnailUrl: ad.thumbnail_url || ready.picture || undefined,
              pageId,
              instagramUserId: instagramId || undefined,
              urlTags: ad.url_tags
            },
            ctx
          );
          ids.creatives[ad.name] = creative.externalId;
          await save();
        }
        await client.createPausedAd(
          pool,
          { adsetId: ids.adsets[ad.adset_name], creativeId: ids.creatives[ad.name], name: ad.name },
          ctx,
          async (extId) => {
            ids.ads[ad.name] = extId;
            await save();
          }
        );
      }

      await pool.query(`UPDATE launch_plans SET status = 'CREATED_PAUSED', meta_ids = $2, last_error = NULL, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(ids)]);
      await audit(pool, user.id, 'LAUNCH_PLAN_CREATED_PAUSED', `Plano ${plan.code}: campanha, ${spec.adsets.length} conjunto(s) e ${spec.ads.length} anúncio(s) criados PAUSADOS.`, ids);
      const done = await pool.query(`UPDATE launch_plans SET status = 'AWAITING_OPERATOR', updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
      await audit(pool, user.id, 'LAUNCH_PLAN_AWAITING_OPERATOR', `Plano ${plan.code}: aguardando a resposta do operador — ${plan.question_text}`, { id });
      return { plan: serializeLaunchPlan(done.rows[0]), alreadyCreated: false };
    } catch (err: any) {
      await pool.query(`UPDATE launch_plans SET status = 'FAILED', meta_ids = $2, last_error = $3, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(ids), errorText(err)]);
      await audit(pool, user.id, 'LAUNCH_PLAN_CREATE_FAILED', `Plano ${plan.code}: falha na criação (retomável): ${errorText(err)}`, ids);
      throw err;
    }
  }

  /** IDs do plano por tipo; recusa plano incompleto. */
  private ownedObjects(spec: LaunchPlanSpec, ids: LaunchPlanMetaIds) {
    const campaignId = ids.campaign[spec.campaign.name];
    const adsets = spec.adsets.map((s) => ({ name: s.name, id: ids.adsets[s.name], budget: s.daily_budget_brl }));
    const ads = spec.ads.map((a) => ({ name: a.name, id: ids.ads[a.name] }));
    if (!campaignId || adsets.some((s) => !s.id) || ads.some((a) => !a.id)) {
      throw new LaunchPlanError(409, 'O plano não tem todos os objetos criados na Meta.');
    }
    const all = new Set<string>([campaignId, ...adsets.map((s) => s.id), ...ads.map((a) => a.id)]);
    return { campaignId, adsets, ads, all };
  }

  /**
   * Resposta do operador. NO: REJECTED, nada é ativado. YES: decisão APROVADA (responsável = o ADMIN
   * que respondeu) + experimento AUTORIZADO com capital = teto; orçamento aplicado e ACTIVE só nos
   * objetos do plano (anúncios → conjuntos → campanha por último), com HITL e reserva de capital.
   */
  async answer(pool: Pool, id: string, rawAnswer: unknown, user: LaunchPlanUser, client: MetaMutatingClient) {
    const answer = String(rawAnswer || '').trim().toUpperCase();
    if (answer !== 'YES' && answer !== 'NO') throw new LaunchPlanError(400, 'Resposta inválida. Use YES ou NO.');
    if (user.role !== 'ADMIN') throw new LaunchPlanError(403, 'Somente um ADMIN pode responder.');
    const human = await pool.query(`SELECT id FROM users WHERE id::text = $1 AND role = 'ADMIN' AND status = 'ACTIVE'`, [String(user.id || '')]);
    if (human.rows.length === 0) throw new LaunchPlanError(403, 'Somente um ADMIN com sessão própria no NORQVA pode responder.');

    const plan = await this.get(pool, id);

    if (answer === 'NO') {
      const r = await pool.query(
        `UPDATE launch_plans SET status = 'REJECTED', answer = 'NO', answered_by = $2, answered_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'AWAITING_OPERATOR' RETURNING *`,
        [id, user.id]
      );
      if (r.rows.length === 0) throw new LaunchPlanError(409, `O plano está em ${plan.status}; só é possível responder quando aguarda o operador.`);
      await audit(pool, user.id, 'LAUNCH_PLAN_REJECTED', `Plano ${plan.code}: operador respondeu NÃO. Nada foi ativado.`, { id });
      return { plan: serializeLaunchPlan(r.rows[0]) };
    }

    const resuming = plan.status === 'APPROVED' && !!plan.decision_id && !!plan.experiment_id;
    if (plan.status !== 'AWAITING_OPERATOR' && !resuming) {
      throw new LaunchPlanError(409, `O plano está em ${plan.status}; só é possível responder quando aguarda o operador.`);
    }
    const input = validateLaunchPlanInput({
      code: plan.code,
      offer_human_id: plan.offer_human_id,
      max_spend_brl: plan.max_spend_brl,
      question_text: plan.question_text,
      spec: plan.spec
    });
    const owned = this.ownedObjects(input.spec, normalizeMetaIds(plan.meta_ids));
    const baseCtx: MetaMutatingSecurityContext = { userId: user.id, userRole: 'ADMIN', isDemo: false };
    await client.assertFeatureFlagAndPreflight(baseCtx, { requirePixel: false });

    let decisionId: string = plan.decision_id;
    let experimentId: string = plan.experiment_id;
    if (!resuming) {
      const offer = (await pool.query('SELECT id, product_id FROM offers WHERE human_id = $1 AND is_demo = FALSE LIMIT 1', [plan.offer_human_id])).rows[0];
      if (!offer) throw new LaunchPlanError(400, `Oferta ${plan.offer_human_id} não encontrada; não é possível registrar o experimento.`);

      const tx = await pool.connect();
      try {
        await tx.query('BEGIN');
        const claim = await tx.query(
          `UPDATE launch_plans SET status = 'APPROVED', answer = 'YES', answered_by = $2, answered_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'AWAITING_OPERATOR' RETURNING id`,
          [id, user.id]
        );
        if (claim.rows.length === 0) throw new LaunchPlanError(409, 'O plano já foi respondido.');
        decisionId = crypto.randomUUID();
        await tx.query(
          `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, responsible_id, justification, available_data, status, is_demo)
           VALUES ($1, $2, $3, 'LAUNCH_PLAN', 'APROVAR_CAPITAL', $4, $5, $6, $7, 'APPROVED', FALSE)`,
          [
            decisionId,
            await nextHumanId(tx, 'decisions', 'DEC'),
            id,
            `Ativar ${input.spec.campaign.name}: R$ ${input.daily_budget_brl.toFixed(2)}/dia, teto R$ ${input.max_spend_brl.toFixed(2)}.`,
            user.id,
            `Resposta SIM do operador à pergunta do plano ${plan.code}: ${plan.question_text}`,
            JSON.stringify({ launch_plan: plan.code, meta_ids: plan.meta_ids })
          ]
        );
        experimentId = crypto.randomUUID();
        await tx.query(
          `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, responsible_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'AUTORIZADO', $8, $8, 0, FALSE)`,
          [
            experimentId,
            await nextHumanId(tx, 'experiments', 'EXP'),
            `${plan.code} · ${input.spec.campaign.name}`.slice(0, 255),
            input.spec.hypothesis || plan.question_text,
            offer.product_id,
            offer.id,
            user.id,
            input.max_spend_brl
          ]
        );
        await tx.query('UPDATE launch_plans SET decision_id = $2, experiment_id = $3, updated_at = NOW() WHERE id = $1', [id, decisionId, experimentId]);
        await tx.query('COMMIT');
      } catch (err) {
        await tx.query('ROLLBACK');
        throw err;
      } finally {
        tx.release();
      }
      await audit(pool, user.id, 'LAUNCH_PLAN_APPROVED', `Plano ${plan.code}: operador respondeu SIM. Decisão e experimento registrados (teto R$ ${input.max_spend_brl.toFixed(2)}).`, { id, decisionId, experimentId });
    }

    const ctx: MetaMutatingSecurityContext = { ...baseCtx, decisionId, experimentId };
    const assertOwned = (metaId: string) => {
      if (!owned.all.has(metaId)) throw new LaunchPlanError(403, `O ID ${metaId} não pertence ao plano ${plan.code}.`);
    };
    try {
      await client.assertHITLApproval(pool, ctx);

      // Capital em risco: reserva o orçamento diário do plano no experimento uma única vez.
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const exp = (await conn.query('SELECT capital_used FROM experiments WHERE id = $1', [experimentId])).rows[0];
        if (exp && parseFloat(exp.capital_used || 0) === 0) {
          await client.assertAndReserveBudget(conn, ctx, input.daily_budget_brl);
        }
        await conn.query('COMMIT');
      } catch (err) {
        await conn.query('ROLLBACK');
        throw err;
      } finally {
        conn.release();
      }

      for (const s of owned.adsets) {
        assertOwned(s.id);
        const row = (await pool.query('SELECT daily_budget FROM meta_ad_sets WHERE meta_adset_id = $1 AND is_demo = FALSE LIMIT 1', [s.id])).rows[0];
        const current = row && row.daily_budget !== null && row.daily_budget !== undefined ? parseFloat(row.daily_budget) : null;
        if (current === null || Math.abs(current - s.budget) > 0.001) {
          await client.setDailyBudget(pool, 'ADSET', s.id, s.budget, ctx);
        }
      }
      // Campanha por último: enquanto ela estiver pausada nada veicula.
      for (const a of owned.ads) {
        assertOwned(a.id);
        await client.setEntityStatus(pool, 'AD', a.id, 'ACTIVE', ctx);
      }
      for (const s of owned.adsets) {
        assertOwned(s.id);
        await client.setEntityStatus(pool, 'ADSET', s.id, 'ACTIVE', ctx);
      }
      assertOwned(owned.campaignId);
      await client.setEntityStatus(pool, 'CAMPAIGN', owned.campaignId, 'ACTIVE', ctx);

      const r = await pool.query(`UPDATE launch_plans SET status = 'ACTIVE', last_error = NULL, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
      await audit(pool, user.id, 'LAUNCH_PLAN_ACTIVATED', `Plano ${plan.code}: ${owned.ads.length} anúncio(s), ${owned.adsets.length} conjunto(s) e a campanha ativados (R$ ${input.daily_budget_brl.toFixed(2)}/dia).`, { id, decisionId, experimentId });
      return { plan: serializeLaunchPlan(r.rows[0]) };
    } catch (err: any) {
      await pool.query('UPDATE launch_plans SET last_error = $2, updated_at = NOW() WHERE id = $1', [id, errorText(err)]);
      await audit(pool, user.id, 'LAUNCH_PLAN_ACTIVATION_FAILED', `Plano ${plan.code}: falha na ativação (responda SIM de novo para retomar): ${errorText(err)}`, { id });
      throw err;
    }
  }
}
