import { Pool } from 'pg';

// NORQVA-0008: media spend per product.
// Before: all spend was split by revenue share, so a product with no sales yet (Bolso Blindado)
// showed R$ 0 of media and its spend landed on the product that sells (Trattoria).
// Now: each Meta campaign is tied to ONE product by deterministic evidence; its spend goes
// straight to that product. Spend of campaigns without evidence (or with conflicting evidence)
// is still split by revenue share, and reported separately.
//
// Evidence, all exact (no substring or name guessing):
//   1. an ad of the campaign is linked to a Factory creative (creative_meta_ads), or its name
//      equals the creative key (utm_content_key / human_id)  → creative.product_id
//   2. a funnel event carries the campaign id, one of its ad ids, or utm_content = ad name,
//      and an offer                                             → offer.product_id

export interface CampaignSpendRow {
  campaignDbId: string;
  metaCampaignId: string;
  spend: number;
}

export interface ProductSpendAllocation {
  directByProduct: Map<string, number>;
  proratedByProduct: Map<string, number>;
  campaignProduct: Map<string, string | null>;
  mappedSpend: number;
  unmappedSpend: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: any) => String(s ?? '').trim().toLowerCase();

function metaField(meta: any, key: string): string | null {
  if (!meta) return null;
  let obj = meta;
  if (typeof meta === 'string') {
    try {
      obj = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  const v = obj?.[key];
  return v === undefined || v === null || v === '' ? null : String(v);
}

/** Map each Meta campaign (by DB id) to a single product id, or null when there is no / conflicting evidence. */
export async function resolveCampaignProducts(pool: Pool, isDemo: boolean): Promise<Map<string, string | null>> {
  const [adsRes, creativesRes, linksRes, offersRes, eventsRes] = await Promise.all([
    pool.query(
      `SELECT ma.meta_ad_id, ma.name, mc.id AS campaign_id, mc.meta_campaign_id
       FROM meta_ads ma
       JOIN meta_ad_sets mas ON mas.id = ma.adset_id
       JOIN meta_campaigns mc ON mc.id = mas.campaign_id
       WHERE ma.is_demo = $1`,
      [isDemo]
    ),
    pool.query(
      `SELECT id, human_id, utm_content_key, product_id FROM creatives
       WHERE is_demo = $1 AND is_deleted = FALSE AND product_id IS NOT NULL`,
      [isDemo]
    ),
    pool.query(`SELECT creative_id, meta_ad_id FROM creative_meta_ads`),
    pool.query(`SELECT id, product_id FROM offers WHERE product_id IS NOT NULL`),
    pool.query(
      `SELECT offer_id, utm_content, metadata FROM commercial_funnel_events
       WHERE is_demo = $1 AND offer_id IS NOT NULL`,
      [isDemo]
    )
  ]);

  const offerProduct = new Map<string, string>();
  for (const o of offersRes.rows) offerProduct.set(String(o.id), String(o.product_id));

  const creativeById = new Map<string, string>();
  const creativeByKey = new Map<string, string>();
  for (const c of creativesRes.rows) {
    creativeById.set(String(c.id), String(c.product_id));
    if (c.utm_content_key) creativeByKey.set(norm(c.utm_content_key), String(c.product_id));
    if (c.human_id) creativeByKey.set(norm(c.human_id), String(c.product_id));
  }
  const linkedProductByAd = new Map<string, string>();
  for (const l of linksRes.rows) {
    const p = creativeById.get(String(l.creative_id));
    if (p) linkedProductByAd.set(String(l.meta_ad_id), p);
  }

  const evidence = new Map<string, Set<string>>(); // campaignDbId -> products
  const add = (campaignDbId: string, productId: string | undefined | null) => {
    if (!productId) return;
    if (!evidence.has(campaignDbId)) evidence.set(campaignDbId, new Set());
    evidence.get(campaignDbId)!.add(productId);
  };

  const campaignByMetaId = new Map<string, string>();
  const campaignByAdId = new Map<string, string>();
  const campaignByAdName = new Map<string, string | null>(); // null = ad name used in >1 campaign
  const allCampaigns = new Set<string>();

  for (const a of adsRes.rows) {
    const cid = String(a.campaign_id);
    allCampaigns.add(cid);
    campaignByMetaId.set(String(a.meta_campaign_id), cid);
    campaignByAdId.set(String(a.meta_ad_id), cid);
    const n = norm(a.name);
    if (n) {
      const prev = campaignByAdName.get(n);
      campaignByAdName.set(n, prev === undefined || prev === cid ? cid : null);
    }
    // 1. Factory creatives
    add(cid, linkedProductByAd.get(String(a.meta_ad_id)));
    add(cid, creativeByKey.get(n));
  }

  // 2. Funnel events with an offer
  for (const e of eventsRes.rows) {
    const productId = offerProduct.get(String(e.offer_id));
    if (!productId) continue;
    const byCampaign = metaField(e.metadata, 'campaign_id');
    const byAd = metaField(e.metadata, 'ad_id');
    const targets = new Set<string>();
    if (byCampaign && campaignByMetaId.has(byCampaign)) targets.add(campaignByMetaId.get(byCampaign)!);
    if (byAd && campaignByAdId.has(byAd)) targets.add(campaignByAdId.get(byAd)!);
    const uc = norm(e.utm_content);
    if (uc) {
      const byName = campaignByAdName.get(uc);
      if (byName) targets.add(byName);
      if (campaignByAdId.has(String(e.utm_content).trim())) targets.add(campaignByAdId.get(String(e.utm_content).trim())!);
    }
    for (const t of targets) add(t, productId);
  }

  const out = new Map<string, string | null>();
  for (const cid of allCampaigns) {
    const set = evidence.get(cid);
    out.set(cid, set && set.size === 1 ? [...set][0] : null);
  }
  for (const [cid, set] of evidence) {
    if (!out.has(cid)) out.set(cid, set.size === 1 ? [...set][0] : null);
  }
  return out;
}

/**
 * Pure allocation. `totalSpend` is the verified media total of the period (it may include spend
 * that has no campaign row); whatever is not tied to a product is split by revenue share.
 */
export function allocateSpendToProducts(input: {
  products: { productId: string; grossRevenue: number }[];
  campaigns: CampaignSpendRow[];
  campaignProduct: Map<string, string | null>;
  totalSpend: number;
}): ProductSpendAllocation {
  const productIds = new Set(input.products.map((p) => p.productId));
  const directByProduct = new Map<string, number>();
  let mapped = 0;

  for (const c of input.campaigns) {
    const pid = input.campaignProduct.get(c.campaignDbId);
    if (!pid || !productIds.has(pid) || !(c.spend > 0)) continue;
    directByProduct.set(pid, round2((directByProduct.get(pid) || 0) + c.spend));
    mapped = round2(mapped + c.spend);
  }

  // Never allocate more than the verified total
  if (mapped > input.totalSpend && mapped > 0) {
    const factor = input.totalSpend / mapped;
    for (const [k, v] of directByProduct) directByProduct.set(k, round2(v * factor));
    mapped = round2(input.totalSpend);
  }

  const unmapped = round2(Math.max(0, input.totalSpend - mapped));
  const revenueTotal = input.products.reduce((acc, p) => acc + (p.grossRevenue > 0 ? p.grossRevenue : 0), 0);
  const proratedByProduct = new Map<string, number>();
  if (unmapped > 0) {
    if (revenueTotal > 0) {
      for (const p of input.products) {
        if (p.grossRevenue > 0) proratedByProduct.set(p.productId, round2((p.grossRevenue / revenueTotal) * unmapped));
      }
    } else if (input.products.length === 1) {
      proratedByProduct.set(input.products[0].productId, unmapped);
    }
  }

  return {
    directByProduct,
    proratedByProduct,
    campaignProduct: input.campaignProduct,
    mappedSpend: mapped,
    unmappedSpend: unmapped
  };
}
