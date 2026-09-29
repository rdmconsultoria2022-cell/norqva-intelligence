import { Pool } from 'pg';
import { CreativePerformanceService, normalizeDateRangeBoundaries } from './creativePerformanceService';
import { resolveCampaignProducts } from '../finance/productMediaAllocation';
import { breakevenByProduct } from '../alerts/adAlertService';

// NORQVA-0017 (fase 1): "Base de campanhas" — ranks niches, products, campaigns, ad sets and ads
// of OUR Meta account. Sales truth = paid NORQVA orders attributed deterministically (D-0006);
// Meta-reported purchases are kept only as a reference.

// Same verified-media rule as the financial dashboard (controllers/api.ts getMediaSpendProvenanceClause)
function getMediaSpendProvenanceClause(isDemo: boolean): string {
  return isDemo
    ? `(mi.is_demo = TRUE OR mi.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE') OR mac.is_demo = TRUE OR mconn.is_demo = TRUE)`
    : `(mi.is_demo = FALSE AND mac.is_demo = FALSE AND mac.connection_id IS NOT NULL AND mconn.id IS NOT NULL
        AND mconn.is_demo = FALSE AND mconn.status IN ('CONNECTED', 'EXPIRED')
        AND mi.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION'))`;
}

export type IntelLevel = 'niche' | 'product' | 'campaign' | 'adset' | 'ad';
export const INTEL_LEVELS: IntelLevel[] = ['niche', 'product', 'campaign', 'adset', 'ad'];

export type IntelClass = 'VENCEDOR' | 'PROMISSOR' | 'TESTANDO' | 'PERDEDOR' | 'SEM_DADOS';

export interface BaseTotals {
  spend: number;
  impressions: number;
  reach: number;
  link_clicks: number;
  outbound_clicks: number;
  landing_page_views: number;
  initiate_checkouts: number;
  meta_purchases: number;
  meta_purchase_value: number;
  video_3s_views: number;
  thruplays: number;
  video_p25: number;
  video_p50: number;
  video_p75: number;
  video_p100: number;
  sales: number;
  revenue: number;
  checkouts_norqva: number;
  breakeven_weighted: number; // Σ spend × breakeven, to derive a spend-weighted breakeven
  breakeven_spend: number; // Σ spend where breakeven is known
}

export interface DerivedMetrics {
  ctr_link: number | null;
  cpc_link: number | null;
  cpm: number | null;
  frequency: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  completion_rate: number | null;
  lpv_rate: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  breakeven_cpa: number | null;
}

export interface ScoreResult {
  score: number;
  confidence: number;
  classification: IntelClass;
  reason: string;
}

const EMPTY: BaseTotals = {
  spend: 0, impressions: 0, reach: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0, initiate_checkouts: 0,
  meta_purchases: 0, meta_purchase_value: 0, video_3s_views: 0, thruplays: 0, video_p25: 0, video_p50: 0, video_p75: 0,
  video_p100: 0, sales: 0, revenue: 0, checkouts_norqva: 0, breakeven_weighted: 0, breakeven_spend: 0
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const f = (v: any) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function addTotals(a: BaseTotals, b: BaseTotals): BaseTotals {
  const out = { ...a };
  for (const k of Object.keys(EMPTY) as (keyof BaseTotals)[]) out[k] = a[k] + b[k];
  return out;
}

export function deriveMetrics(t: BaseTotals): DerivedMetrics {
  const be = t.breakeven_spend > 0 ? t.breakeven_weighted / t.breakeven_spend : null;
  const pct = (x: number | null) => (x === null ? null : r4(x * 100));
  const money = (x: number | null) => (x === null ? null : r2(x));
  return {
    ctr_link: pct(div(t.link_clicks, t.impressions)),
    cpc_link: money(div(t.spend, t.link_clicks)),
    cpm: money(div(t.spend * 1000, t.impressions)),
    frequency: t.reach > 0 ? r2(t.impressions / t.reach) : null,
    hook_rate: pct(div(t.video_3s_views, t.impressions)),
    hold_rate: pct(div(t.thruplays, t.video_3s_views)),
    completion_rate: pct(div(t.video_p100, t.video_3s_views)),
    lpv_rate: pct(div(t.landing_page_views, t.link_clicks)),
    cvr: pct(div(t.sales, t.landing_page_views > 0 ? t.landing_page_views : t.link_clicks)),
    cpa: t.sales > 0 ? r2(t.spend / t.sales) : null,
    roas: t.spend > 0 ? r2(t.revenue / t.spend) : null,
    breakeven_cpa: be === null ? null : r2(be)
  };
}

/** Percentile rank (0..1) of value within a sorted ascending sample. */
export function percentileRank(sorted: number[], value: number | null): number | null {
  if (value === null || sorted.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return (below + equal / 2) / sorted.length;
}

/**
 * Score 0–100 and classification.
 * - Profitability (70%): expected CPA with a one-sale-at-breakeven prior, (spend + B) / (sales + 1), vs breakeven B.
 * - Top-of-funnel quality (30%): percentile of link CTR and hook rate among the account's ads.
 * - Confidence = min(1, spend / 3B); low confidence pulls the score toward an "unproven" prior (0.35).
 * Classification follows the BB-B01 test plan (section 7).
 */
export function scoreEntity(
  t: BaseTotals,
  m: DerivedMetrics,
  quality: { ctrPct: number | null; hookPct: number | null },
  // Aggregates (campaign, product, niche) test several ads at once: the "no sale" budget scales with them (max 5)
  adsInTest = 1
): ScoreResult {
  const k = Math.max(1, Math.min(5, Math.floor(adsInTest)));
  const B = m.breakeven_cpa;
  const qs = [quality.ctrPct, quality.hookPct].filter((x): x is number => x !== null);
  const q = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 0.5;

  let prof: number;
  let confidence: number;
  if (B && B > 0) {
    const expectedCpa = (t.spend + B) / (t.sales + 1);
    prof = clamp(B / expectedCpa / 1.5);
    confidence = clamp(t.spend / (3 * B));
  } else {
    // No breakeven known: fall back to ROAS (1.5× = full marks) and a spend-based confidence
    prof = clamp((m.roas ?? 0) / 1.5);
    confidence = clamp(t.spend / 80);
  }
  // Top-of-funnel quality matters while money data is thin; with confidence, profitability dominates
  const qWeight = 0.3 - 0.2 * confidence;
  const raw = (1 - qWeight) * prof + qWeight * q;
  let score = Math.round(100 * (confidence * raw + (1 - confidence) * 0.35));

  const ctr = m.ctr_link;
  let classification: IntelClass = 'TESTANDO';
  let reason = 'Em teste: ainda sem sinal suficiente para decidir.';
  if (B && B > 0) {
    const cpa = m.cpa;
    if (t.sales >= 3 && cpa !== null && cpa <= B * 0.66) {
      classification = 'VENCEDOR';
      reason = `${t.sales} vendas com CPA R$ ${cpa.toFixed(2)} (até 66% do equilíbrio R$ ${B.toFixed(2)}): escalar 20% a cada 2 dias.`;
    } else if (t.sales >= 1 && cpa !== null && cpa <= B) {
      classification = 'PROMISSOR';
      reason = `CPA R$ ${cpa.toFixed(2)} dentro do equilíbrio (R$ ${B.toFixed(2)}): manter.`;
    } else if (t.sales === 0 && t.spend >= 2 * B * k) {
      classification = 'PERDEDOR';
      reason =
        k === 1
          ? `Gastou R$ ${t.spend.toFixed(2)} (2× o CPA de equilíbrio) sem venda: pausar.`
          : `Gastou R$ ${t.spend.toFixed(2)} em ${k} anúncios (2× o CPA de equilíbrio por anúncio) sem venda: rever a oferta ou o público.`;
    } else if (t.sales === 0 && t.spend >= 15 * k && ctr !== null && ctr < 0.6) {
      classification = 'PERDEDOR';
      reason = `CTR de link ${ctr.toFixed(2)}% abaixo de 0,6% depois de R$ 15: o gancho não prende.`;
    } else if (t.sales >= 1 && cpa !== null && cpa > B * 1.5 && t.spend >= 2 * B * k) {
      classification = 'PERDEDOR';
      reason = `CPA R$ ${cpa.toFixed(2)} acima de 1,5× o equilíbrio com gasto relevante: pausar ou refazer.`;
    } else if (t.sales === 0 && t.spend < B * 0.5) {
      classification = 'SEM_DADOS';
      reason = `Gastou menos de metade do CPA de equilíbrio (R$ ${(B * 0.5).toFixed(2)}): esperar.`;
    }
  } else if (t.spend < 5 && t.sales === 0) {
    classification = 'SEM_DADOS';
    reason = 'Investimento baixo e sem CPA de equilíbrio cadastrado para o produto.';
  } else if (t.sales >= 3 && (m.roas ?? 0) >= 1.5) {
    classification = 'VENCEDOR';
    reason = `ROAS ${m.roas} com ${t.sales} vendas (sem CPA de equilíbrio cadastrado).`;
  }
  // A proven loser never ranks above something still being tested
  if (classification === 'PERDEDOR') score = Math.min(score, 25);
  return { score, confidence: r2(confidence), classification, reason };
}

export interface IntelRow {
  key: string;
  level: IntelLevel;
  name: string;
  meta_id: string | null;
  status: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  product_id: string | null;
  product_name: string | null;
  niche: string | null;
  ads_count: number;
  winners_count: number;
  products?: string[];
  creative?: { title: string | null; body: string | null; cta: string | null; thumbnail_url: string | null; video_id: string | null } | null;
  targeting?: any;
  totals: BaseTotals;
  metrics: DerivedMetrics;
  score: number;
  confidence: number;
  classification: IntelClass;
  reason: string;
}

export interface CampaignBaseResponse {
  level: IntelLevel;
  period: { date_from: string | null; date_to: string | null };
  rows: IntelRow[];
  summary: { entities: number; spend: number; sales: number; revenue: number; roas: number | null; by_class: Record<IntelClass, number> };
  data: { ads_with_data: number; latest_insight_date: string | null; unattributed_sales: number };
}

interface AdFacts {
  metaAdId: string;
  name: string;
  status: string | null;
  adsetKey: string;
  adsetName: string;
  adsetMetaId: string;
  adsetStatus: string | null;
  campaignKey: string;
  campaignName: string;
  campaignMetaId: string;
  campaignStatus: string | null;
  productId: string | null;
  productName: string | null;
  niche: string | null;
  creative: IntelRow['creative'];
  targeting: any;
  totals: BaseTotals;
}

export class CampaignIntelligenceService {
  constructor(private perf = new CreativePerformanceService()) {}

  async getCampaignBase(pool: Pool, opts: { level: IntelLevel; date_from?: string; date_to?: string; is_demo: boolean }): Promise<CampaignBaseResponse> {
    const { level, is_demo } = opts;
    const { dateFromMeta, dateToMeta } = normalizeDateRangeBoundaries(opts.date_from, opts.date_to);
    const provenance = getMediaSpendProvenanceClause(is_demo);

    const [adsRes, insRes, perf, campaignProduct, breakeven, productsRes] = await Promise.all([
      pool.query(
        `SELECT ma.id, ma.meta_ad_id, ma.name, ma.effective_status, ma.creative_title, ma.creative_body, ma.creative_cta,
                ma.thumbnail_url, ma.video_id,
                mas.id AS adset_id, mas.meta_adset_id, mas.name AS adset_name, mas.effective_status AS adset_status, mas.targeting_summary,
                mc.id AS campaign_id, mc.meta_campaign_id, mc.name AS campaign_name, mc.effective_status AS campaign_status
         FROM meta_ads ma
         JOIN meta_ad_sets mas ON mas.id = ma.adset_id
         JOIN meta_campaigns mc ON mc.id = mas.campaign_id
         WHERE ma.is_demo = $1`,
        [is_demo]
      ),
      pool.query(
        `SELECT mi.ad_id,
                SUM(mi.spend) spend, SUM(mi.impressions) impressions, SUM(COALESCE(mi.reach,0)) reach,
                SUM(COALESCE(mi.link_clicks,0)) link_clicks, SUM(mi.outbound_clicks) outbound_clicks,
                SUM(mi.landing_page_views) landing_page_views, SUM(mi.initiate_checkouts) initiate_checkouts,
                SUM(mi.purchases) purchases, SUM(mi.purchase_value) purchase_value,
                SUM(mi.video_3s_views) video_3s_views, SUM(mi.thruplays) thruplays,
                SUM(mi.video_p25) video_p25, SUM(mi.video_p50) video_p50, SUM(mi.video_p75) video_p75, SUM(mi.video_p100) video_p100,
                MAX(mi.date_start) latest
         FROM meta_insights mi
         JOIN meta_ad_accounts mac ON mac.id = mi.ad_account_id
         LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
         WHERE ${provenance}
           AND mi.entity_level = 'AD' AND mi.ad_id IS NOT NULL
           AND mi.date_start = mi.date_stop
           AND ($1::date IS NULL OR mi.date_start >= $1::date)
           AND ($2::date IS NULL OR mi.date_start <= $2::date)
         GROUP BY mi.ad_id`,
        [dateFromMeta, dateToMeta]
      ),
      this.perf.getCreativePerformance(pool, { date_from: opts.date_from, date_to: opts.date_to, is_demo }),
      resolveCampaignProducts(pool, is_demo),
      breakevenByProduct(pool, is_demo),
      pool.query(`SELECT id, name, category FROM products`)
    ]);

    // Campaigns without an identified product use the median breakeven of the account's products (estimate)
    const knownBe = [...breakeven.values()].sort((a, b) => a - b);
    const fallbackBe = knownBe.length ? knownBe[Math.floor((knownBe.length - 1) / 2)] : null;

    const products = new Map<string, { name: string; category: string | null }>();
    for (const p of productsRes.rows) products.set(String(p.id), { name: p.name, category: p.category || null });

    const salesByAd = new Map<string, { sales: number; revenue: number; checkouts: number }>();
    for (const c of perf.creatives) {
      salesByAd.set(String(c.ad_id), { sales: c.paid_orders, revenue: c.gross_revenue, checkouts: c.checkout_started });
    }
    const insByAd = new Map<string, any>();
    let latest: string | null = null;
    for (const r of insRes.rows) {
      insByAd.set(String(r.ad_id), r);
      const d = r.latest ? new Date(r.latest).toISOString().slice(0, 10) : null;
      if (d && (!latest || d > latest)) latest = d;
    }

    const facts: AdFacts[] = [];
    for (const a of adsRes.rows) {
      const ins = insByAd.get(String(a.id));
      const s = salesByAd.get(String(a.meta_ad_id));
      const productId = campaignProduct.get(String(a.campaign_id)) || null;
      const be = (productId ? breakeven.get(productId) ?? null : null) ?? fallbackBe;
      const spend = f(ins?.spend);
      const totals: BaseTotals = {
        spend,
        impressions: f(ins?.impressions),
        reach: f(ins?.reach),
        link_clicks: f(ins?.link_clicks),
        outbound_clicks: f(ins?.outbound_clicks),
        landing_page_views: f(ins?.landing_page_views),
        initiate_checkouts: f(ins?.initiate_checkouts),
        meta_purchases: f(ins?.purchases),
        meta_purchase_value: f(ins?.purchase_value),
        video_3s_views: f(ins?.video_3s_views),
        thruplays: f(ins?.thruplays),
        video_p25: f(ins?.video_p25),
        video_p50: f(ins?.video_p50),
        video_p75: f(ins?.video_p75),
        video_p100: f(ins?.video_p100),
        sales: s?.sales || 0,
        revenue: s?.revenue || 0,
        checkouts_norqva: s?.checkouts || 0,
        breakeven_weighted: be !== null ? spend * be : 0,
        breakeven_spend: be !== null ? spend : 0
      };
      // A campaign with a known breakeven but no spend yet still needs B for classification
      if (be !== null && spend === 0) {
        totals.breakeven_weighted = be;
        totals.breakeven_spend = 1;
      }
      const product = productId ? products.get(productId) : undefined;
      facts.push({
        metaAdId: String(a.meta_ad_id),
        name: a.name,
        status: a.effective_status || null,
        adsetKey: String(a.adset_id),
        adsetName: a.adset_name,
        adsetMetaId: String(a.meta_adset_id),
        adsetStatus: a.adset_status || null,
        campaignKey: String(a.campaign_id),
        campaignName: a.campaign_name,
        campaignMetaId: String(a.meta_campaign_id),
        campaignStatus: a.campaign_status || null,
        productId,
        productName: product?.name || null,
        niche: product?.category || null,
        creative: {
          title: a.creative_title || null,
          body: a.creative_body || null,
          cta: a.creative_cta || null,
          thumbnail_url: a.thumbnail_url || null,
          video_id: a.video_id || null
        },
        targeting: a.targeting_summary || null,
        totals
      });
    }

    // Quality reference: ads with at least 500 impressions in the period
    const ref = facts.filter(x => x.totals.impressions >= 500).map(x => deriveMetrics(x.totals));
    const ctrSorted = ref.map(m => m.ctr_link).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const hookSorted = ref.map(m => m.hook_rate).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
    const scoreOf = (t: BaseTotals, adsInTest = 1) => {
      const m = deriveMetrics(t);
      const sc = scoreEntity(
        t,
        m,
        {
          ctrPct: percentileRank(ctrSorted, m.ctr_link),
          hookPct: m.hook_rate && m.hook_rate > 0 ? percentileRank(hookSorted, m.hook_rate) : null
        },
        adsInTest
      );
      return { m, sc };
    };

    // Ad-level classification feeds winners_count at every level
    const adWinner = new Map<string, boolean>();
    for (const x of facts) adWinner.set(x.metaAdId, scoreOf(x.totals).sc.classification === 'VENCEDOR');

    const keyOf = (x: AdFacts): { key: string; name: string; metaId: string | null; status: string | null } => {
      switch (level) {
        case 'ad':
          return { key: x.metaAdId, name: x.name, metaId: x.metaAdId, status: x.status };
        case 'adset':
          return { key: x.adsetKey, name: x.adsetName, metaId: x.adsetMetaId, status: x.adsetStatus };
        case 'campaign':
          return { key: x.campaignKey, name: x.campaignName, metaId: x.campaignMetaId, status: x.campaignStatus };
        case 'product':
          return { key: x.productId || 'sem-produto', name: x.productName || 'Sem produto identificado', metaId: null, status: null };
        case 'niche':
        default:
          return { key: (x.niche || 'sem-nicho').toLowerCase(), name: x.niche || 'Sem nicho', metaId: null, status: null };
      }
    };

    const groups = new Map<string, { head: ReturnType<typeof keyOf>; facts: AdFacts[]; totals: BaseTotals }>();
    for (const x of facts) {
      const head = keyOf(x);
      const g = groups.get(head.key) || { head, facts: [], totals: { ...EMPTY } };
      g.facts.push(x);
      // breakeven fallback rows (spend 0, weight 1) must not double-count when grouped
      g.totals = addTotals(g.totals, x.totals);
      groups.set(head.key, g);
    }

    const rows: IntelRow[] = [];
    for (const g of groups.values()) {
      const { m, sc } = scoreOf(g.totals, level === 'ad' ? 1 : g.facts.filter(x => x.totals.spend > 0).length);
      const first = g.facts[0];
      const productNames = [...new Set(g.facts.map(x => x.productName).filter((n): n is string => !!n))];
      rows.push({
        key: g.head.key,
        level,
        name: g.head.name,
        meta_id: g.head.metaId,
        status: g.head.status,
        campaign_name: level === 'ad' || level === 'adset' ? first.campaignName : null,
        adset_name: level === 'ad' ? first.adsetName : null,
        product_id: level === 'niche' ? null : first.productId,
        product_name: level === 'niche' ? null : first.productName,
        niche: first.niche,
        ads_count: g.facts.length,
        winners_count: g.facts.filter(x => adWinner.get(x.metaAdId)).length,
        products: level === 'niche' ? productNames : undefined,
        creative: level === 'ad' ? first.creative : undefined,
        targeting: level === 'adset' ? first.targeting : undefined,
        totals: { ...g.totals, spend: r2(g.totals.spend), revenue: r2(g.totals.revenue), meta_purchase_value: r2(g.totals.meta_purchase_value) },
        metrics: m,
        score: sc.score,
        confidence: sc.confidence,
        classification: sc.classification,
        reason: sc.reason
      });
    }
    rows.sort((a, b) => b.score - a.score || b.totals.revenue - a.totals.revenue || b.totals.spend - a.totals.spend);

    const byClass: Record<IntelClass, number> = { VENCEDOR: 0, PROMISSOR: 0, TESTANDO: 0, PERDEDOR: 0, SEM_DADOS: 0 };
    for (const r of rows) byClass[r.classification]++;
    const spend = r2(rows.reduce((s, r) => s + r.totals.spend, 0));
    const revenue = r2(rows.reduce((s, r) => s + r.totals.revenue, 0));
    return {
      level,
      period: { date_from: dateFromMeta, date_to: dateToMeta },
      rows,
      summary: {
        entities: rows.length,
        spend,
        sales: rows.reduce((s, r) => s + r.totals.sales, 0),
        revenue,
        roas: spend > 0 ? r2(revenue / spend) : null,
        by_class: byClass
      },
      data: {
        ads_with_data: insRes.rows.length,
        latest_insight_date: latest,
        unattributed_sales: perf.unattributed?.unattributed_paid_orders ?? 0
      }
    };
  }
}
