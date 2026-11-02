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
import { isDbInMemory } from '../../db/db';
import { LaunchPlanError, validateLaunchPlanInput, normalizeMetaIds, serializeLaunchPlan, generatedSlugFromUrl, BR_STATES, ADVANTAGE_MAX_AGE_MIN, validateEndDate } from './launchPlanService';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID, META_MIN_DAILY_BUDGET_BRL, getMaxDailyBudgetBRL, getGeneratedPageHosts } from '../meta/metaMutatingClient';
import { checkGeneratedAd } from '../creative/creativeFactoryService';
import { findPriceInFields, priceErrorMessage } from '../creative/priceInCopy';
import { STORAGE_PREFIX, storageRef, productImages } from '../creative/generatedImages';
import { livePriceBlock, GenerationService } from '../creative/generationService';
import { urlTagsFor, DEFAULT_OFFER_BASE_URL } from '../aiTeam/launchSheet';
import { isKitOffer } from './campaignEditorService';

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
// NORQVA-0160: advideos = envio do vídeo da Fábrica (anúncio de vídeo); nada de situação no payload
const ALLOWED_POST = /^\/act_\d+\/(campaigns|adsets|ads|adcreatives|adimages|advideos)$/;

/**
 * Lança se o POST não for de criação na conta (lista fechada: campanhas, conjuntos, anúncios, peças, imagens, vídeos),
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

/** NORQVA-0121: página da oferta de sempre (/p ou /kit), a mesma das outras campanhas. */
export const offerPageUrl = (offer: { human_id: string; name?: string | null }) =>
  `${DEFAULT_OFFER_BASE_URL}/${isKitOffer(offer) ? 'kit' : 'p'}/${offer.human_id}`;

export type GeneratedDestination = 'PAGE' | 'OFFER_PAGE';

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

/**
 * NORQVA-0128: imagens dos anúncios. As da página primeiro; se a página não tem nenhuma (gerada sem KIE e
 * sem imagens do produto na hora), usa as imagens do produto que já estão no site.
 */
export function adImageRefs(sections: any[], product: { name?: unknown; collection_key?: unknown }): string[] {
  const fromPage = pageImageRefs(sections);
  if (fromPage.length) return fromPage;
  return Array.from(new Set(productImages(product).filter(u => u.startsWith('/images/')).map(u => `${publicSiteUrl()}${u}`)));
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

/** Algo do plano já existe na Meta? (hash de imagem e vídeo enviado não contam: são só arquivos) */
export function hasMetaObjects(metaIds: unknown): boolean {
  const ids = normalizeMetaIds(metaIds);
  return [ids.campaign, ids.adsets, ids.ads, ids.creatives].some(m => Object.keys(m).length > 0);
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

/**
 * NORQVA-0160: link de vídeo final da Fábrica de vídeo (mesmo host de FABRICA_VIDEO_URL, caminho assinado
 * /publico/producoes/...). Só esse vira anúncio de vídeo: o arquivo é versionado e assinado, então o que foi
 * aprovado é o que a Meta baixa (link de outro site poderia mudar o vídeo depois da aprovação).
 */
export function isFactoryVideoUrl(raw: unknown): boolean {
  const base = String(process.env.FABRICA_VIDEO_URL || '').trim();
  if (!base) return false;
  try {
    const u = new URL(String(raw || '').trim());
    const b = new URL(base);
    return u.protocol === 'https:' && u.host === b.host && u.pathname.startsWith('/publico/producoes/') && !u.pathname.includes('..');
  } catch {
    return false;
  }
}

/** NORQVA-0160: criativo de vídeo com o vídeo da Fábrica de vídeo (os outros continuam como anúncio de imagem). */
export const isVideoAd = (c: any) => String(c?.format || '') === 'VIDEO' && isFactoryVideoUrl(c?.file_url);

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
  // NORQVA-0121: destino = a página gerada (padrão) ou a página da oferta de sempre, todos iguais
  const url = pageUrl(page.slug);
  const offerUrl = offerPageUrl(offer);
  const okDest = (d: string) => (generatedSlugFromUrl(d) === page.slug && d === url) || d === offerUrl;
  if (new Set(ads.map(a => String(a.destination_url))).size > 1) throw new LaunchPlanError(409, `Os anúncios levam a destinos diferentes. ${REBUILD_HINT}`);
  for (const ad of ads) {
    const label = `Anúncio ${ad.name}`;
    if (!ad.image_url && !ad.video_url) throw new LaunchPlanError(409, `${label}: sem imagem nem vídeo.`);
    if (!okDest(String(ad.destination_url))) throw new LaunchPlanError(409, `${label}: o destino não é a página ${url} nem a da oferta ${offerUrl}.`);
    if (!ad.factory_creative || !UUID_RE.test(String(ad.factory_creative))) throw new LaunchPlanError(409, `${label}: sem o criativo de origem. ${REBUILD_HINT}`);
    const c = (await pool.query('SELECT * FROM creatives WHERE id = $1', [ad.factory_creative])).rows[0];
    if (!c || c.approval_status === 'SUPERSEDED') throw new LaunchPlanError(409, `${label}: o criativo mudou (versão nova). ${REBUILD_HINT}`);
    // NORQVA-0160: anúncio de vídeo só com o vídeo aprovado no criativo (o mesmo link)
    if (ad.video_url && (!isVideoAd(c) || String(ad.video_url) !== String(c.file_url).trim())) {
      throw new LaunchPlanError(409, `${label}: o vídeo do anúncio mudou depois de montar a campanha. ${REBUILD_HINT}`);
    }
    if (ad.image_url && isVideoAd(c)) throw new LaunchPlanError(409, `${label}: o anúncio agora é de vídeo. ${REBUILD_HINT}`);
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
  /** NORQVA-0121: ajustes de publicação (contrato NORQVA-0118, etapa C). */
  destination?: unknown;
  regions?: unknown;
  genders?: unknown;
  placements?: unknown;
  advantage_audience?: unknown;
  end_date?: unknown;
}

/** NORQVA-0121: livro da coleção de cozinha = público 45+ (o do Trattoria). */
export const isCookbook = (p: { collection_key?: string | null } | null | undefined) => !!p?.collection_key;

/** Texto do público para a tela e o plano. */
export function audienceSummary(t: { regions?: string[]; age_min: number; age_max: number; advantage_audience: boolean; genders?: string; placements?: string }): string {
  const where = t.regions && t.regions.length ? t.regions.join(', ') : 'Brasil';
  const hint = t.advantage_audience ? ' (sugestão)' : '';
  const sex = t.genders === 'FEMALE' ? `, mulheres${hint}` : t.genders === 'MALE' ? `, homens${hint}` : '';
  const age = t.advantage_audience && (t.age_min > ADVANTAGE_MAX_AGE_MIN || t.age_max < 65) ? `${t.age_min}–${t.age_max} (sugestão)` : `${t.age_min}–${t.age_max}`;
  const adv = t.advantage_audience ? ', público Advantage' : ', público fechado';
  const where2 = t.placements === 'FACEBOOK_INSTAGRAM' ? ', só Facebook e Instagram' : '';
  return `${where}, ${age}${sex}${adv}${where2}`;
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
        `SELECT p.name AS product_name, p.brand_id, p.collection_key, ref.human_id AS ref_human_id
         FROM products p LEFT JOIN creative_references ref ON ref.id = $2 WHERE p.id = $1`,
        [page.product_id, page.reference_id]
      )
    ).rows[0] || {};
    return { product: String(r.product_name || 'Produto'), collectionKey: r.collection_key || null, brandId: r.brand_id || null, ref: String(r.ref_human_id || page.human_id), cookbook: isCookbook(r) };
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
    const images = adImageRefs(page.sections, { name: n.product, collection_key: n.collectionKey });
    const max = getMaxDailyBudgetBRL();
    const daily = Math.min(DEFAULT_DAILY_BUDGET_BRL, max);
    const rebuildable = isRebuildable(plan);
    const offer = await liveOffer(this.pool, page.offer_id);
    return {
      plan,
      rebuildable,
      page: { id: page.id, human_id: page.human_id, status: page.status, url: pageUrl(page.slug) },
      destinations: [
        { value: 'PAGE', label: 'Página gerada', url: pageUrl(page.slug), available: true },
        { value: 'OFFER_PAGE', label: 'Página da oferta', url: offer ? offerPageUrl(offer) : null, available: !!offer },
        { value: 'WHATSAPP', label: 'WhatsApp', url: null, available: false, reason: 'Fica disponível quando o número oficial estiver ativo.' }
      ],
      states: BR_STATES,
      mutation_enabled: isMutationEnabled(),
      images: images.length,
      ads: !plan || rebuildable ? await this.adsWithReasons(page) : [],
      defaults: {
        campaign_name: await this.defaultName(page, n, plan?.id || null),
        daily_budget_brl: daily,
        max_spend_brl: daily * DEFAULT_CAP_DAYS,
        age_min: n.cookbook ? 45 : 25,
        age_max: 65,
        destination: 'PAGE',
        regions: [],
        genders: 'ALL',
        placements: 'AUTOMATIC',
        advantage_audience: true,
        end_date: null,
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
    const ageMin = body.age_min === undefined || body.age_min === null || body.age_min === '' ? (n.cookbook ? 45 : 25) : Number(body.age_min);
    const ageMax = body.age_max === undefined || body.age_max === null || body.age_max === '' ? 65 : Number(body.age_max);
    // NORQVA-0121: ajustes de publicação
    const destination: GeneratedDestination = body.destination === undefined || body.destination === null || body.destination === '' ? 'PAGE' : (String(body.destination) as GeneratedDestination);
    if (destination !== 'PAGE' && destination !== 'OFFER_PAGE') throw new LaunchPlanError(400, 'Destino inválido: página gerada ou página da oferta. WhatsApp fica para quando o número oficial estiver ativo.');
    const destinationUrl = destination === 'PAGE' ? pageUrl(page.slug) : offerPageUrl(offer);
    const advantage = body.advantage_audience === undefined || body.advantage_audience === null ? true : body.advantage_audience === true || body.advantage_audience === 'true';
    const targeting: Record<string, any> = { countries: ['BR'], age_min: ageMin, age_max: ageMax, advantage_audience: advantage };
    if (body.regions !== undefined && body.regions !== null) targeting.regions = body.regions;
    if (body.genders !== undefined && body.genders !== null && body.genders !== '') targeting.genders = String(body.genders);
    if (body.placements !== undefined && body.placements !== null && body.placements !== '') targeting.placements = String(body.placements);
    const endDate = validateEndDate(body.end_date, 'Campanha');
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

    const images = adImageRefs(page.sections, { name: n.product, collection_key: n.collectionKey });
    const code = existing ? existing.code : `CMP-${page.human_id}`.toUpperCase().slice(0, 40);
    const adsetName = `${code}_AS01`;
    const ads = [];
    for (let i = 0; i < picked.length; i++) {
      const c = (await this.pool.query('SELECT * FROM creatives WHERE id = $1', [picked[i].id])).rows[0];
      const key = String(c.utm_content_key || c.human_id);
      // NORQVA-0160: anúncio com o vídeo da Fábrica vai como anúncio de vídeo (a Meta baixa pelo link)
      if (isVideoAd(c)) {
        ads.push({
          name: key,
          adset_name: adsetName,
          video_url: String(c.file_url).trim(),
          factory_creative: c.id,
          thumbnail_url: null,
          primary_text: String(c.primary_text || c.copy || '').trim(),
          headline: headlineOf(c),
          description: String(c.ad_description || '').trim().slice(0, 255) || undefined,
          cta: GENERATED_CTA,
          destination_url: destinationUrl,
          url_tags: utmTags(code, key)
        });
        continue;
      }
      const image = images.length ? images[i % images.length] : null;
      if (!image) throw new LaunchPlanError(409, `Anúncio ${c.human_id} sem imagem: a página não tem imagem na abertura nem no produto. Use as imagens do produto ou gere imagens novas.`);
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
        destination_url: destinationUrl,
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
        targeting,
        targeting_summary: 'Brasil',
        ...(endDate ? { end_date: endDate } : {})
      }],
      ads,
      pause_rules: ['Pausar anúncio com 2× o CPA de equilíbrio gasto sem venda.', 'Pausar tudo ao atingir o teto de gasto do plano.'],
      hypothesis: `Página gerada ${page.human_id} (referência ${n.ref}) com ${ads.length} anúncio(s) (${ads.filter((a: any) => a.video_url).length} de vídeo).`
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
    // resumo do público a partir do que foi validado (estados, idade, sexo, Advantage, posicionamento)
    input.spec.adsets[0].targeting_summary = audienceSummary(input.spec.adsets[0].targeting);
    // a pergunta do "Sim" mostra também o público e o término (o que vai rodar de fato)
    const endTxt = input.spec.adsets[0].end_date ? ` até ${input.spec.adsets[0].end_date.split('-').reverse().join('/')}` : '';
    input.question_text = `${input.question_text.replace(/\?$/, '')}${endTxt}? Público: ${input.spec.adsets[0].targeting_summary}.`.slice(0, 500);
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

  /**
   * NORQVA-0160 (etapa C, parte 2): anúncio de vídeo (aprovado, da Fábrica de vídeo) num plano desta página que JÁ
   * está na Meta. Cria vídeo, peça e anúncio PAUSADO no primeiro conjunto do plano, pela mesma trava "só PAUSED".
   * Não ativa nada: o anúncio fica pausado até alguém ativar (gasto continua com o dono). Retomável: cada ID é
   * gravado na hora; o anúncio só entra no plano (spec) quando existe na Meta, para não quebrar pausas e ativação.
   */
  async addVideoAd(pageId: string, creativeId: unknown, user: { id: string | null; role: string }, client: MetaMutatingClient) {
    if (user.role !== 'ADMIN') throw new LaunchPlanError(403, 'Somente ADMIN pode adicionar anúncio na Meta.');
    if (!isMutationEnabled()) throw new LaunchPlanError(409, MUTATION_DISABLED_MESSAGE);
    const page = await pageRow(this.pool, pageId);
    const plan = await this.planForPage(page.id);
    if (!plan) throw new LaunchPlanError(404, 'Esta página ainda não tem campanha.');
    if (['DRAFT', 'FAILED', 'REJECTED', 'CREATING'].includes(String(plan.status)) || !hasMetaObjects(plan.meta_ids)) {
      throw new LaunchPlanError(409, 'A campanha ainda não está na Meta: monte de novo com o anúncio de vídeo (seção Campanha).');
    }
    const spec = parseJson(plan.spec, {});
    const ids = normalizeMetaIds(plan.meta_ids);
    const adset = Array.isArray(spec.adsets) ? spec.adsets[0] : null;
    const campaignId = ids.campaign[String(spec?.campaign?.name || '')];
    const adsetId = adset ? ids.adsets[adset.name] : null;
    if (!campaignId || !adsetId) throw new LaunchPlanError(409, 'A campanha não tem o conjunto criado na Meta.');
    const cid = String(creativeId || '');
    if (!UUID_RE.test(cid)) throw new LaunchPlanError(404, 'Anúncio não encontrado.');
    const c = (await this.pool.query('SELECT * FROM creatives WHERE id = $1', [cid])).rows[0];
    if (!c || (String(c.generated_page_id || '') !== String(page.id) && !(await rootLinked(this.pool, c, page.id)))) {
      throw new LaunchPlanError(404, 'Anúncio não encontrado nesta página.');
    }
    if (!isVideoAd(c)) throw new LaunchPlanError(409, 'Este anúncio não é de vídeo.');
    const why = await adBlockReason(this.pool, c, { persist: true });
    if (why) throw new LaunchPlanError(409, `Anúncio ${c.human_id}: ${why}`);
    const ads: any[] = Array.isArray(spec.ads) ? spec.ads : [];
    const key = String(c.utm_content_key || c.human_id);
    if (ads.some(a => a.name === key || a.factory_creative === c.id)) {
      throw new LaunchPlanError(409, `O anúncio ${c.human_id} já está nesta campanha.`);
    }
    if (ads.length >= 20) throw new LaunchPlanError(409, 'A campanha já tem 20 anúncios.');
    const destination = String(ads[0]?.destination_url || pageUrl(page.slug));
    const candidate = {
      name: key,
      adset_name: adset.name,
      video_url: String(c.file_url).trim(),
      factory_creative: c.id,
      thumbnail_url: null,
      primary_text: String(c.primary_text || c.copy || '').trim(),
      headline: headlineOf(c),
      description: String(c.ad_description || '').trim().slice(0, 255) || undefined,
      cta: GENERATED_CTA,
      destination_url: destination,
      url_tags: utmTags(String(plan.code), key)
    };
    // validação de sempre (destino permitido, UTMs, CTA, textos) com o anúncio novo junto
    const checked = validateLaunchPlanInput(
      { code: plan.code, offer_human_id: plan.offer_human_id, max_spend_brl: plan.max_spend_brl, question_text: plan.question_text, spec: { ...spec, ads: [...ads, candidate] } },
      { forCreation: true, allowGeneratedPage: true }
    );
    const ad = checked.spec.ads[checked.spec.ads.length - 1] as any;
    const hits = findPriceInFields({ primary_text: ad.primary_text, headline: ad.headline, description: ad.description });
    if (hits.length) throw new LaunchPlanError(409, priceErrorMessage(hits, `Anúncio ${key}`));

    const brandAsset = async (type: 'FACEBOOK_PAGE' | 'INSTAGRAM') => {
      if (!plan.brand_id) return null;
      const r = await this.pool.query(
        `SELECT external_id FROM brand_meta_assets WHERE brand_id = $1 AND asset_type = $2 AND external_id IS NOT NULL AND status IN ('LINKED', 'VERIFIED') LIMIT 1`,
        [plan.brand_id, type]
      );
      return r.rows[0]?.external_id ? String(r.rows[0].external_id) : null;
    };
    const fbPage = spec.page_id || (await brandAsset('FACEBOOK_PAGE'));
    const instagramId = spec.instagram_id || (await brandAsset('INSTAGRAM'));
    if (!fbPage) throw new LaunchPlanError(400, 'O plano precisa da Página do Facebook.');

    const ctx = { userId: user.id || 'unknown', userRole: user.role, isDemo: false } as any;
    await client.assertFeatureFlagAndPreflight(ctx);
    const guarded = pausedOnlyClient(client);
    const actor = user.id && UUID_RE.test(user.id) ? user.id : null;

    // um de cada vez por plano (dois cliques não criam dois anúncios); no pg-mem dos testes não há advisory lock
    const lock = isDbInMemory() ? null : await this.pool.connect();
    const lockKey = `norqva-add-video-ad:${plan.id}`;
    let unlockFailed = false;
    try {
      if (lock) {
        const got = await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [lockKey]);
        if (!got.rows[0]?.ok) throw new LaunchPlanError(409, 'Já existe um anúncio sendo adicionado a esta campanha. Espere terminar.');
      }
      try {
        // relê o plano dentro da trava (outra execução pode ter avançado ou a situação mudado)
        const fresh = (await this.pool.query('SELECT spec, meta_ids, status FROM launch_plans WHERE id = $1', [plan.id])).rows[0];
        if (!fresh || ['DRAFT', 'FAILED', 'REJECTED', 'CREATING'].includes(String(fresh.status))) {
          throw new LaunchPlanError(409, 'A situação da campanha mudou. Recarregue a tela.');
        }
        const freshSpec = parseJson(fresh.spec, {});
        if ((freshSpec.ads || []).some((a: any) => a.name === key)) throw new LaunchPlanError(409, `O anúncio ${c.human_id} já está nesta campanha.`);
        const cur = normalizeMetaIds(fresh.meta_ids);
        // grava só as chaves deste anúncio, relendo o plano na hora (orçamento, troca de peça etc. de outras
        // telas no meio do processamento do vídeo não são desfeitos)
        const merge = async (appendAd: boolean) => {
          const tx = await this.pool.connect();
          try {
            await tx.query('BEGIN');
            const row = (await tx.query('SELECT spec, meta_ids FROM launch_plans WHERE id = $1 FOR UPDATE', [plan.id])).rows[0];
            const ids2 = normalizeMetaIds(row.meta_ids);
            for (const kind of ['videos', 'creatives', 'ads'] as const) if (cur[kind][key]) ids2[kind][key] = cur[kind][key];
            const spec2 = parseJson(row.spec, {});
            if (appendAd && !(spec2.ads || []).some((a: any) => a.name === key)) spec2.ads = [...(spec2.ads || []), ad];
            await tx.query('UPDATE launch_plans SET spec = $2, meta_ids = $3, updated_at = NOW() WHERE id = $1', [plan.id, JSON.stringify(spec2), JSON.stringify(ids2)]);
            await tx.query('COMMIT');
          } catch (e) {
            await tx.query('ROLLBACK').catch(() => {});
            throw e;
          } finally {
            tx.release();
          }
        };
        const save = () => merge(false);
        await writeAuditLog(this.pool, actor, 'GENERATED_CAMPAIGN_VIDEO_AD_STARTED', `Campanha ${plan.code}: adicionando o anúncio de vídeo ${key} (PAUSADO).`, null, null, false, false);
        if (!cur.videos[key]) {
          const v = await guarded.uploadVideoFromUrl(this.pool, { fileUrl: ad.video_url, name: `${plan.code}_${key}` }, ctx);
          cur.videos[key] = v.id;
          await save();
        }
        if (!cur.creatives[key]) {
          const ready = await guarded.waitForVideoReady(cur.videos[key]);
          const piece = await guarded.createAdCreative(
            this.pool,
            {
              name: `${key}_CREATIVE`,
              title: ad.headline,
              body: ad.primary_text,
              destinationUrl: ad.destination_url,
              callToAction: ad.cta,
              videoId: cur.videos[key],
              thumbnailUrl: ready.picture || undefined,
              pageId: fbPage,
              instagramUserId: instagramId || undefined,
              urlTags: ad.url_tags,
              description: ad.description || undefined
            },
            ctx
          );
          cur.creatives[key] = piece.externalId;
          await save();
        }
        if (!cur.ads[key]) {
          await guarded.createPausedAd(this.pool, { adsetId, creativeId: cur.creatives[key], name: key }, ctx, async (extId: string) => {
            cur.ads[key] = extId;
            await save();
          });
        }
        // só agora o anúncio entra no plano (todas as rotinas de pausa/ativação passam a enxergá-lo)
        await merge(true);
        await this.pool.query(
          `INSERT INTO creative_meta_ads (creative_id, meta_ad_id, link_method, linked_by) VALUES ($1, $2, 'API_PUBLISH', $3) ON CONFLICT (creative_id, meta_ad_id) DO NOTHING`,
          [c.id, cur.ads[key], actor]
        );
        await writeAuditLog(
          this.pool, actor, 'GENERATED_CAMPAIGN_VIDEO_AD_ADDED',
          `Campanha ${plan.code}: anúncio de vídeo ${key} criado PAUSADO na Meta (${cur.ads[key]}). Ativar continua com o dono.`,
          null, JSON.stringify({ plan_id: plan.id, ad: cur.ads[key], video: cur.videos[key] }), false, true
        );
        const after = (await this.pool.query('SELECT * FROM launch_plans WHERE id = $1', [plan.id])).rows[0];
        // NORQVA-0160: o "Sim" do plano ativa todos os anúncios dele, inclusive este (aviso na tela)
        const awaitingYes = ['CREATED_PAUSED', 'AWAITING_OPERATOR', 'APPROVED'].includes(String(after?.status));
        return { plan: serializeLaunchPlan(after), ad_id: cur.ads[key], ad_name: key, activates_with_yes: awaitingYes };
      } finally {
        if (lock) {
          await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => {
            unlockFailed = true;
          });
        }
      }
    } finally {
      // conexão que não soltou a trava não volta para o pool (descartada)
      lock?.release(unlockFailed ? true : undefined);
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
