// NORQVA-0117 (D-0117): campanha PAUSADA a partir de uma página gerada e publicada (NORQVA-0116).
// Reaproveita o plano de lançamento de sempre (launch_plans, LaunchPlanService.createOnMeta): o plano nasce em
// RASCUNHO, ligado à página (um plano só por página), e a criação na Meta faz campanha, conjunto e anúncios de
// imagem, tudo PAUSADO. Ativar e gastar continua só com o dono, pelo "Sim" do plano (com o código, NORQVA-0094).
// Travas próprias: toda chamada à Graph API desta criação passa por assertOnlyPausedPayload (lista fechada de
// endereços, só PAUSED); antes de criar, a página tem que estar no ar, a oferta à venda, e cada anúncio aprovado,
// igual ao aprovado, com a checagem (cópia, números, promessas, preço) refeita na hora e sem preço no texto.
import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { LaunchPlanError, validateLaunchPlanInput, normalizeMetaIds, serializeLaunchPlan, generatedSlugFromUrl } from './launchPlanService';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID, META_MIN_DAILY_BUDGET_BRL, getMaxDailyBudgetBRL, getGeneratedPageHosts } from '../meta/metaMutatingClient';
import { checkGeneratedAd } from '../creative/creativeFactoryService';
import { findPriceInFields, priceErrorMessage } from '../creative/priceInCopy';
import { STORAGE_PREFIX, storageRef } from '../creative/generatedImages';
import { livePriceBlock, GenerationService } from '../creative/generationService';
import { urlTagsFor } from '../aiTeam/launchSheet';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_DAILY_BUDGET_BRL = 30;
export const DEFAULT_CAP_DAYS = 7;
export const GENERATED_CTA = 'LEARN_MORE';
export const MUTATION_DISABLED_MESSAGE = 'Cadastro na Meta desligado (META_MUTATION_ENABLED): o plano ficou só em rascunho no NORQVA.';
export const REBUILD_HINT = 'Use "Montar de novo" na seção Campanha da tela de geração.';
/** Situações em que o plano pode ser montado de novo (se nada foi criado na Meta). */
const REBUILDABLE = ['DRAFT', 'FAILED', 'REJECTED'];

// ---------------------------------------------------------------------------------------------
// Trava: só PAUSED, só os endereços de criação
// ---------------------------------------------------------------------------------------------

const STATUS_KEYS = new Set(['status', 'configured_status', 'effective_status']);
const ALLOWED_POST = /^\/act_\d+\/(campaigns|adsets|ads|adcreatives|adimages)$/;

/**
 * Lança se o POST não for de criação na conta (lista fechada: campanhas, conjuntos, anúncios, peças, imagens),
 * se levar qualquer situação diferente de PAUSED ou se criar campanha/conjunto/anúncio sem PAUSED explícito.
 */
export function assertOnlyPausedPayload(endpoint: string, payload: Record<string, any>): void {
  const ep = String(endpoint || '');
  const fail = (why: string) => {
    throw new Error(`[SECURITY EXCEPTION]: NORQVA-0117 só cria PAUSADO: ${why} (${ep}).`);
  };
  const m = ALLOWED_POST.exec(ep);
  if (!m) fail('endereço fora da lista de criação');
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (STATUS_KEYS.has(k.toLowerCase()) && String(val).toUpperCase() !== 'PAUSED') fail(`${path}${k} = ${String(val)}`);
      walk(val, `${path}${k}.`);
    }
  };
  walk(payload, '');
  if (m && ['campaigns', 'adsets', 'ads'].includes(m[1]) && String(payload?.status || '').toUpperCase() !== 'PAUSED') fail('criação sem status PAUSED');
}

/** Cópia do cliente da Meta com a trava acima em todos os POSTs (o original não muda). */
export function pausedOnlyClient(client: MetaMutatingClient): MetaMutatingClient {
  return client.withPayloadGuard(assertOnlyPausedPayload);
}

// ---------------------------------------------------------------------------------------------
// Endereços, UTMs e imagens
// ---------------------------------------------------------------------------------------------

/** Site do comprador (onde está /v/:slug). PUBLIC_SITE_URL tem que ser https num host permitido. */
export function publicSiteUrl(): string {
  const hosts = getGeneratedPageHosts();
  const raw = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && hosts.includes(u.hostname.toLowerCase())) return `https://${u.hostname.toLowerCase()}`;
  } catch {
    /* usa o padrão */
  }
  return `https://${hosts[0] || 'acesso.norqva.com.br'}`;
}

export const pageUrl = (slug: string) => `${publicSiteUrl()}/v/${slug}`;

/** UTMs iguais às de todo plano (urlTagsFor): venda atribuída por anúncio. */
export const utmTags = (planCode: string, contentKey: string) => urlTagsFor(planCode, contentKey);

const IMAGE_ROLE_ORDER = ['HERO_HOOK', 'PRODUCT_REVEAL', 'CONTENTS', 'BENEFITS', 'MECHANISM'];
const NO_IMAGE_ROLES = new Set(['OFFER_PRICE', 'CTA', 'GUARANTEE', 'FAQ']);

/**
 * Imagens da página para os anúncios: abertura e produto primeiro, nunca a seção de preço/chamada.
 * As do site viram endereço completo; as novas ficam como "storage:..." e são assinadas na hora de enviar.
 */
export function pageImageRefs(sections: any[]): string[] {
  const list = (sections || [])
    .filter(s => s && s.image_url && !NO_IMAGE_ROLES.has(String(s.role)))
    .map((s, i) => ({ s, i, rank: IMAGE_ROLE_ORDER.includes(String(s.role)) ? IMAGE_ROLE_ORDER.indexOf(String(s.role)) : IMAGE_ROLE_ORDER.length }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const out: string[] = [];
  for (const { s } of list) {
    const raw = String(s.image_url).trim();
    if (raw.startsWith('/images/')) out.push(`${publicSiteUrl()}${raw}`);
    else if (raw.startsWith(STORAGE_PREFIX) && storageRef(raw)) out.push(raw);
  }
  return Array.from(new Set(out));
}

const parseJson = (v: any, fb: any) => {
  if (v === null || v === undefined) return fb;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return fb;
  }
};

const isMutationEnabled = () => process.env.META_MUTATION_ENABLED === 'true';

/** Algo do plano já existe na Meta? (hash de imagem não conta: é só o arquivo enviado) */
export function hasMetaObjects(metaIds: unknown): boolean {
  const ids = normalizeMetaIds(metaIds);
  return [ids.campaign, ids.adsets, ids.ads, ids.creatives, ids.videos].some(m => Object.keys(m).length > 0);
}

export const isRebuildable = (plan: any) => !!plan && REBUILDABLE.includes(String(plan.status)) && !hasMetaObjects(plan.meta_ids);

// ---------------------------------------------------------------------------------------------
// Conferência antes de criar (também chamada pela rota genérica de criação do plano)
// ---------------------------------------------------------------------------------------------

async function pageRow(pool: Pool, pageId: string) {
  if (!UUID_RE.test(String(pageId || ''))) throw new LaunchPlanError(404, 'Página gerada não encontrada.');
  const r = (await pool.query('SELECT * FROM generated_pages WHERE id = $1', [pageId])).rows[0];
  if (!r || r.deleted_at) throw new LaunchPlanError(404, 'Página gerada não encontrada.');
  r.sections = parseJson(r.sections, []);
  return r;
}

async function liveOffer(pool: Pool, offerId: string) {
  return (
    await pool.query(
      `SELECT id, human_id, name, status, price, promotional_price, card_enabled, card_max_installments, card_free_installments,
              card_interest_monthly, card_total_price
       FROM offers WHERE id = $1 AND deleted_at IS NULL AND COALESCE(is_deleted, FALSE) = FALSE AND is_demo = FALSE`,
      [offerId]
    )
  ).rows[0] || null;
}

async function assertPageLive(pool: Pool, page: any) {
  if (page.status !== 'PUBLISHED') throw new LaunchPlanError(409, 'A página precisa estar no ar (publicada) para criar a campanha.');
  const offer = await liveOffer(pool, page.offer_id);
  if (!offer || (offer.status !== 'ATIVA' && offer.status !== 'TESTE')) throw new LaunchPlanError(409, 'A oferta da página não está à venda (ativa ou em teste).');
  if (!(livePriceBlock(offer).value > 0)) throw new LaunchPlanError(409, 'A oferta da página está sem preço.');
  return offer;
}

/** Aprovado, igual ao aprovado, checagem refeita agora, sem preço e sem promessa de preço. Motivo do bloqueio ou null. */
export async function adBlockReason(pool: Pool, c: any, opts: { persist?: boolean } = {}): Promise<string | null> {
  if (!c) return 'anúncio não encontrado.';
  if (c.is_deleted) return 'anúncio na lixeira.';
  if (c.approval_status !== 'APPROVED') return 'ainda não foi aprovado.';
  const review = await pool.query(
    `SELECT content_hash FROM creative_reviews WHERE creative_id = $1 AND decision = 'APPROVED' ORDER BY created_at DESC LIMIT 1`,
    [c.id]
  );
  if (!review.rows[0] || review.rows[0].content_hash !== c.content_hash) return 'o texto mudou depois da aprovação: aprove de novo.';
  const priceClaim = await pool.query(
    `SELECT cr.human_id FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id WHERE cc.creative_id = $1 AND cr.claim_type = 'PRICE' LIMIT 1`,
    [c.id]
  );
  if (priceClaim.rows.length) return `usa promessa de preço (${priceClaim.rows[0].human_id}). Anúncio sem preço.`;
  const chk = await checkGeneratedAd(pool, c, opts);
  if (chk.blocked) return chk.message || 'bloqueado pela checagem.';
  const hits = findPriceInFields({
    hook: c.hook, primary_text: c.primary_text || c.copy, headline: c.headline, description: c.ad_description, cta: c.cta, script: c.script
  });
  if (hits.length) return priceErrorMessage(hits, 'preço no texto');
  return null;
}

const headlineOf = (c: any) => String(c.headline || c.hook || '').trim().slice(0, 255);

async function rootLinked(pool: Pool, c: any, pageId: string) {
  if (!c?.root_creative_id) return false;
  const r = (await pool.query('SELECT generated_page_id FROM creatives WHERE id = $1', [c.root_creative_id])).rows[0];
  return String(r?.generated_page_id || '') === String(pageId);
}

/** Conferência completa do plano de uma página gerada, logo antes de criar na Meta. Lança se algo falhar. */
export async function assertGeneratedPlanReady(pool: Pool, planId: string): Promise<void> {
  const row = (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [planId])).rows[0];
  if (!row) throw new LaunchPlanError(404, 'Plano não encontrado.');
  if (!row.generated_page_id) return;
  if (!['DRAFT', 'FAILED', 'CREATING'].includes(row.status)) return; // já criado: nada novo vai para a Meta
  const page = await pageRow(pool, row.generated_page_id);
  const offer = await assertPageLive(pool, page);
  if (String(offer.human_id) !== String(row.offer_human_id)) throw new LaunchPlanError(409, `A oferta da página mudou depois de montar a campanha. ${REBUILD_HINT}`);
  const spec = parseJson(row.spec, {});
  const ads: any[] = Array.isArray(spec.ads) ? spec.ads : [];
  if (!ads.length) throw new LaunchPlanError(409, 'O plano não tem anúncios.');
  // nome único entre os planos (nada de dois planos disputando o mesmo nome na Meta)
  const dupName = await pool.query(`SELECT code FROM launch_plans WHERE id <> $1 AND spec->'campaign'->>'name' = $2 LIMIT 1`, [row.id, String(spec?.campaign?.name || '')]);
  if (dupName.rows.length) throw new LaunchPlanError(409, `O plano ${dupName.rows[0].code} já usa o nome "${spec.campaign.name}". ${REBUILD_HINT}`);
  const url = pageUrl(page.slug);
  for (const ad of ads) {
    const label = `Anúncio ${ad.name}`;
    if (!ad.image_url) throw new LaunchPlanError(409, `${label}: sem imagem.`);
    if (generatedSlugFromUrl(ad.destination_url) !== page.slug || String(ad.destination_url) !== url) throw new LaunchPlanError(409, `${label}: o destino não é a página ${url}.`);
    if (!ad.factory_creative || !UUID_RE.test(String(ad.factory_creative))) throw new LaunchPlanError(409, `${label}: sem o criativo de origem. ${REBUILD_HINT}`);
    const c = (await pool.query('SELECT * FROM creatives WHERE id = $1', [ad.factory_creative])).rows[0];
    if (!c || c.approval_status === 'SUPERSEDED') throw new LaunchPlanError(409, `${label}: o criativo mudou (versão nova). ${REBUILD_HINT}`);
    const why = await adBlockReason(pool, c);
    if (why) throw new LaunchPlanError(409, `${label}: ${why}`);
    if (String(c.generated_page_id || '') !== String(page.id) && !(await rootLinked(pool, c, page.id))) {
      throw new LaunchPlanError(409, `${label}: não é um anúncio desta página.`);
    }
    if (String(ad.primary_text) !== String(c.primary_text || c.copy || '').trim() || String(ad.headline) !== headlineOf(c) || String(ad.description || '') !== String(c.ad_description || '').trim().slice(0, 255)) {
      throw new LaunchPlanError(409, `${label}: o texto do anúncio mudou depois de montar a campanha. ${REBUILD_HINT}`);
    }
    const hits = findPriceInFields({ primary_text: ad.primary_text, headline: ad.headline, description: ad.description });
    if (hits.length) throw new LaunchPlanError(409, priceErrorMessage(hits, label));
  }
}

/** Depois de criar: liga o criativo de cada anúncio (o que foi montado no plano) ao anúncio da Meta. Falhas vão para o histórico. */
export async function linkGeneratedPlanAds(pool: Pool, planId: string, userId: string | null) {
  const row = (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [planId])).rows[0];
  if (!row?.generated_page_id) return;
  const ids = normalizeMetaIds(row.meta_ids);
  const spec = parseJson(row.spec, {});
  const actor = userId && UUID_RE.test(userId) ? userId : null;
  for (const ad of Array.isArray(spec.ads) ? spec.ads : []) {
    const metaAdId = ids.ads[ad.name];
    if (!metaAdId || !ad.factory_creative) continue;
    try {
      await pool.query(
        `INSERT INTO creative_meta_ads (creative_id, meta_ad_id, link_method, linked_by) VALUES ($1, $2, 'API_PUBLISH', $3) ON CONFLICT (creative_id, meta_ad_id) DO NOTHING`,
        [ad.factory_creative, metaAdId, actor]
      );
    } catch (err: any) {
      await writeAuditLog(pool, actor, 'GENERATED_CAMPAIGN_LINK_FAILED', `Plano ${row.code}: não deu para ligar o criativo ao anúncio ${metaAdId}: ${String(err?.message || err).slice(0, 300)}`, null, null, false, false);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

export interface GeneratedCampaignInput {
  campaign_name?: unknown;
  daily_budget_brl?: unknown;
  max_spend_brl?: unknown;
  age_min?: unknown;
  age_max?: unknown;
  creative_ids?: unknown;
}

export class GeneratedCampaignService {
  constructor(private pool: Pool) {}

  async planForPage(pageId: string) {
    const r = (await this.pool.query('SELECT * FROM launch_plans WHERE generated_page_id = $1', [pageId])).rows[0];
    return r ? serializeLaunchPlan(r) : null;
  }

  private async names(page: any) {
    const r = (
      await this.pool.query(
        `SELECT p.name AS product_name, p.brand_id, ref.human_id AS ref_human_id
         FROM products p LEFT JOIN creative_references ref ON ref.id = $2 WHERE p.id = $1`,
        [page.product_id, page.reference_id]
      )
    ).rows[0] || {};
    return { product: String(r.product_name || 'Produto'), brandId: r.brand_id || null, ref: String(r.ref_human_id || page.human_id) };
  }

  private async nameTaken(name: string, exceptPlanId: string | null = null): Promise<boolean> {
    const a = await this.pool.query('SELECT 1 FROM meta_campaigns WHERE name = $1 AND is_demo = FALSE LIMIT 1', [name]);
    if (a.rows.length) return true;
    const b = await this.pool.query(`SELECT 1 FROM launch_plans WHERE spec->'campaign'->>'name' = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`, [name, exceptPlanId]);
    return b.rows.length > 0;
  }

  /** Nome sugerido; se já existir (outra página da mesma referência), leva o código da página no fim. */
  private async defaultName(page: any, n: { product: string; ref: string }, exceptPlanId: string | null = null): Promise<string> {
    const base = `NQ – ${n.product} – Ref ${n.ref} – Vendas`.slice(0, 180);
    return (await this.nameTaken(base, exceptPlanId)) ? `${base} – ${page.human_id}`.slice(0, 200) : base;
  }

  /** Anúncios da página com a situação de cada um. Só leitura (não grava a checagem). */
  async adsWithReasons(page: any, opts: { persist?: boolean } = { persist: false }) {
    const ads = await new GenerationService(this.pool).ads(page.id);
    const out: any[] = [];
    for (const a of ads) {
      const full = (await this.pool.query('SELECT * FROM creatives WHERE id = $1', [a.id])).rows[0];
      const reason = await adBlockReason(this.pool, full, opts);
      out.push({ id: a.id, human_id: a.human_id, headline: a.headline, approval_status: a.approval_status, ready: !reason, reason });
    }
    return out;
  }

  /** Para a tela: plano existente, sugestões e anúncios que podem ir. Só leitura. */
  async overview(pageId: string) {
    const page = await pageRow(this.pool, pageId);
    const plan = await this.planForPage(page.id);
    const n = await this.names(page);
    const images = pageImageRefs(page.sections);
    const max = getMaxDailyBudgetBRL();
    const daily = Math.min(DEFAULT_DAILY_BUDGET_BRL, max);
    const rebuildable = isRebuildable(plan);
    return {
      plan,
      rebuildable,
      page: { id: page.id, human_id: page.human_id, status: page.status, url: pageUrl(page.slug) },
      mutation_enabled: isMutationEnabled(),
      images: images.length,
      ads: !plan || rebuildable ? await this.adsWithReasons(page) : [],
      defaults: {
        campaign_name: await this.defaultName(page, n, plan?.id || null),
        daily_budget_brl: daily,
        max_spend_brl: daily * DEFAULT_CAP_DAYS,
        age_min: 25,
        age_max: 65,
        min_daily_budget_brl: META_MIN_DAILY_BUDGET_BRL,
        max_daily_budget_brl: max
      }
    };
  }

  /**
   * Monta o plano RASCUNHO da página (um só por página). Se já existe:
   * - nada criado na Meta e situação RASCUNHO, FALHOU ou RECUSADO: monta de novo na mesma linha (mesmo código,
   *   imagens já enviadas continuam valendo);
   * - algo criado na Meta: devolve o plano como está (retomar ou responder em Campanhas).
   */
  async draft(pageId: string, body: GeneratedCampaignInput, userId: string | null): Promise<{ plan: any; existing: boolean; rebuilt?: boolean; message?: string }> {
    const page = await pageRow(this.pool, pageId);
    const existing = await this.planForPage(page.id);
    if (existing && !isRebuildable(existing)) {
      const created = hasMetaObjects(existing.meta_ids);
      return {
        plan: existing,
        existing: true,
        message: created ? `Esta página já tem a campanha ${existing.code} na Meta: continue em Campanhas.` : `Esta página já tem o plano ${existing.code} (${existing.status}).`
      };
    }
    const offer = await assertPageLive(this.pool, page);
    const n = await this.names(page);

    const max = getMaxDailyBudgetBRL();
    const daily = body.daily_budget_brl === undefined || body.daily_budget_brl === null || body.daily_budget_brl === '' ? Math.min(DEFAULT_DAILY_BUDGET_BRL, max) : Number(body.daily_budget_brl);
    if (!Number.isFinite(daily) || daily < META_MIN_DAILY_BUDGET_BRL || daily > max) {
      throw new LaunchPlanError(400, `Orçamento diário entre R$ ${META_MIN_DAILY_BUDGET_BRL.toFixed(2)} e R$ ${max.toFixed(2)}.`);
    }
    const cap = body.max_spend_brl === undefined || body.max_spend_brl === null || body.max_spend_brl === '' ? daily * DEFAULT_CAP_DAYS : Number(body.max_spend_brl);
    const ageMin = body.age_min === undefined ? 25 : Number(body.age_min);
    const ageMax = body.age_max === undefined ? 65 : Number(body.age_max);
    const name = String(body.campaign_name || '').trim().slice(0, 200) || (await this.defaultName(page, n, existing?.id || null));

    // anúncios: os aprovados e liberados (ou os escolhidos, que também precisam estar liberados)
    const all = await this.adsWithReasons(page, { persist: true });
    const chosen = Array.isArray(body.creative_ids) ? body.creative_ids.map(String) : null;
    const picked = chosen ? all.filter(a => chosen.includes(a.id)) : all.filter(a => a.ready);
    if (chosen) {
      const bad = picked.find(a => !a.ready);
      if (bad) throw new LaunchPlanError(409, `Anúncio ${bad.human_id}: ${bad.reason}`);
    }
    if (!picked.length) throw new LaunchPlanError(409, 'Nenhum anúncio aprovado e liberado pela checagem para esta página.');
    if (picked.length > 10) throw new LaunchPlanError(400, 'No máximo 10 anúncios por campanha.');

    const images = pageImageRefs(page.sections);
    const code = existing ? existing.code : `CMP-${page.human_id}`.toUpperCase().slice(0, 40);
    const adsetName = `${code}_AS01`;
    const ads = [];
    for (let i = 0; i < picked.length; i++) {
      const c = (await this.pool.query('SELECT * FROM creatives WHERE id = $1', [picked[i].id])).rows[0];
      const image = images.length ? images[i % images.length] : null;
      if (!image) throw new LaunchPlanError(409, `Anúncio ${c.human_id} sem imagem: a página não tem imagem na abertura nem no produto. Use as imagens do produto ou gere imagens novas.`);
      const key = String(c.utm_content_key || c.human_id);
      ads.push({
        name: key,
        adset_name: adsetName,
        image_url: image,
        factory_creative: c.id,
        thumbnail_url: null,
        primary_text: String(c.primary_text || c.copy || '').trim(),
        headline: headlineOf(c),
        description: String(c.ad_description || '').trim().slice(0, 255) || undefined,
        cta: GENERATED_CTA,
        destination_url: pageUrl(page.slug),
        url_tags: utmTags(code, key)
      });
    }
    const spec = {
      campaign: { name, objective: 'OUTCOME_SALES' },
      pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
      custom_event_type: 'PURCHASE',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      adsets: [{
        name: adsetName,
        daily_budget_brl: daily,
        targeting: { countries: ['BR'], age_min: ageMin, age_max: ageMax, advantage_audience: true },
        targeting_summary: `Brasil, ${ageMin}–${ageMax}, público Advantage`
      }],
      ads,
      pause_rules: ['Pausar anúncio com 2× o CPA de equilíbrio gasto sem venda.', 'Pausar tudo ao atingir o teto de gasto do plano.'],
      hypothesis: `Página gerada ${page.human_id} (referência ${n.ref}) com ${ads.length} anúncio(s) de imagem.`
    };
    const input = validateLaunchPlanInput(
      {
        code,
        offer_human_id: offer.human_id,
        max_spend_brl: cap,
        question_text: `Ativar a campanha ${name} com R$ ${daily.toFixed(2)}/dia e teto de R$ ${Number(cap).toFixed(2)}?`,
        spec
      },
      { allowGeneratedPage: true }
    );
    if (await this.nameTaken(input.spec.campaign.name, existing?.id || null)) {
      throw new LaunchPlanError(409, `Já existe na conta ou em outro plano uma campanha chamada "${input.spec.campaign.name}". Use outro nome.`);
    }
    const actor = userId && UUID_RE.test(userId) ? userId : null;

    if (existing) {
      // monta de novo na mesma linha: mesmo código; hashes de imagem já enviados continuam (meta_ids.images)
      const ids = normalizeMetaIds(existing.meta_ids);
      const upd = await this.pool.query(
        `UPDATE launch_plans SET spec = $2, daily_budget_brl = $3, max_spend_brl = $4, question_text = $5, offer_human_id = $6, brand_id = $7,
                status = 'DRAFT', last_error = NULL, answer = NULL, answered_by = NULL, answered_at = NULL,
                meta_ids = $8, updated_at = NOW()
         WHERE id = $1 AND status IN ('DRAFT', 'FAILED', 'REJECTED') RETURNING *`,
        [existing.id, JSON.stringify(input.spec), input.daily_budget_brl, input.max_spend_brl, input.question_text, input.offer_human_id, n.brandId,
         JSON.stringify(normalizeMetaIds({ images: ids.images }))]
      );
      if (!upd.rows.length) throw new LaunchPlanError(409, 'O plano mudou de situação enquanto era montado de novo. Recarregue.');
      if (hasMetaObjects(upd.rows[0].meta_ids)) throw new LaunchPlanError(409, 'O plano já tem objetos na Meta.');
      await writeAuditLog(
        this.pool, actor, 'GENERATED_CAMPAIGN_REBUILT',
        `Campanha ${code} montada de novo (era ${existing.status}) a partir da página ${page.human_id} (${ads.length} anúncio(s), R$ ${input.daily_budget_brl.toFixed(2)}/dia, teto R$ ${input.max_spend_brl.toFixed(2)}).`,
        existing.status, 'DRAFT', false, false
      );
      return { plan: serializeLaunchPlan(upd.rows[0]), existing: true, rebuilt: true };
    }

    try {
      const ins = await this.pool.query(
        `INSERT INTO launch_plans (id, code, brand_id, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, created_by, generated_page_id)
         VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          crypto.randomUUID(), input.code, n.brandId, input.offer_human_id, JSON.stringify(input.spec), JSON.stringify(normalizeMetaIds({})),
          input.daily_budget_brl, input.max_spend_brl, input.question_text, actor, page.id
        ]
      );
      await writeAuditLog(
        this.pool, actor, 'GENERATED_CAMPAIGN_DRAFTED',
        `Campanha ${input.code} montada em rascunho a partir da página ${page.human_id} (${ads.length} anúncio(s), R$ ${input.daily_budget_brl.toFixed(2)}/dia, teto R$ ${input.max_spend_brl.toFixed(2)}).`,
        null, JSON.stringify({ plan_id: ins.rows[0].id, page_id: page.id }), false, false
      );
      return { plan: serializeLaunchPlan(ins.rows[0]), existing: false };
    } catch (err: any) {
      // segundo clique ao mesmo tempo: o índice único deixa um plano só; devolve o que ficou
      if (err?.code === '23505') {
        const again = await this.planForPage(page.id);
        if (again) return { plan: again, existing: true };
        throw new LaunchPlanError(409, `Já existe um plano com o código ${input.code}.`);
      }
      throw err;
    }
  }

  /** O plano já tem objetos na Meta ou não está mais em rascunho/falha? (nada a criar por aqui) */
  static nothingToCreate(plan: any): boolean {
    return !['DRAFT', 'FAILED'].includes(String(plan?.status));
  }

  static mutationEnabled(): boolean {
    return isMutationEnabled();
  }
}
