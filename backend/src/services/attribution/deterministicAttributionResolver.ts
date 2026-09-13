/**
 * NORQVA — Deterministic Attribution Resolver (Phase B1)
 * 
 * Provides hardened, deterministic, and auditable resolution across the acquisition funnel:
 * Meta Campaign -> Ad Set -> Ad -> Visitor -> Session -> Offer -> Order -> Payment -> Revenue
 * 
 * Precedence Rules:
 * LEVEL 1 — DIRECT_AD_ID        (High confidence, deterministic)
 * LEVEL 2 — DIRECT_CAMPAIGN_ID  (High confidence, deterministic)
 * LEVEL 3 — UTM_CAMPAIGN_ID     (High confidence, deterministic)
 * LEVEL 4 — UTM_CAMPAIGN_NAME   (Medium confidence, deterministic single match only)
 * 
 * AMBIGUITY / CONFLICT GUARD:
 * - If multiple matching candidates exist, resolution fails closed to AMBIGUOUS.
 * - Conflicting parameters across levels immediately resolve to AMBIGUOUS.
 * - AMBIGUOUS, UNATTRIBUTED, and ORGANIC transactions NEVER credit revenue to Meta campaigns.
 * - Zero heuristic guessing / zero arbitrary campaign selection.
 */

export type AttributionStatus = 'ATTRIBUTED' | 'UNATTRIBUTED' | 'AMBIGUOUS' | 'ORGANIC';

export type AttributionMethod =
  | 'DIRECT_AD_ID'
  | 'DIRECT_CAMPAIGN_ID'
  | 'UTM_CAMPAIGN_ID'
  | 'UTM_CAMPAIGN_NAME'
  | 'LEGACY_FALLBACK'
  | 'NONE';

export type AttributionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface MetaAdRecord {
  id: string;
  meta_ad_id: string;
  name?: string;
  adset_id?: string;
  meta_adset_id?: string;
  campaign_id?: string;
  meta_campaign_id?: string;
}

export interface MetaAdSetRecord {
  id: string;
  meta_adset_id: string;
  name?: string;
  campaign_id?: string;
  meta_campaign_id?: string;
}

export interface MetaCampaignRecord {
  id: string;
  meta_campaign_id: string;
  name: string;
  status?: string;
  effective_status?: string;
}

export interface MetaHierarchyContext {
  campaigns: MetaCampaignRecord[];
  adSets?: MetaAdSetRecord[];
  ads?: MetaAdRecord[];
}

export interface OrderAttributionInput {
  id?: string;
  total_amount?: string | number;
  status?: string;
  is_demo?: boolean;
  data_provenance?: string;
  visitor_id?: string | null;
  session_id?: string | null;
  fbclid?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  attribution_metadata?: {
    campaign_id?: string;
    campaign_name?: string;
    adset_id?: string;
    ad_id?: string;
    utm_term?: string;
    placement?: string;
    site_source_name?: string;
    [key: string]: any;
  } | string | null;
}

export interface ResolvedAttribution {
  attribution_status: AttributionStatus;
  attribution_method: AttributionMethod;
  confidence: AttributionConfidence;
  meta_campaign_id: string | null;
  campaign_name: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  matched_campaign_db_id: string | null;
  matched_adset_db_id: string | null;
  matched_ad_db_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  is_financially_creditable: boolean;
}

/**
 * Safely parses attribution_metadata whether it is a string, object, or null.
 */
function parseAttributionMetadata(metadata: any): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata;
  }
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Resolves attribution deterministically for a single order input.
 */
export function resolveOrderAttribution(
  order: OrderAttributionInput,
  hierarchy: MetaHierarchyContext
): ResolvedAttribution {
  const metadata = parseAttributionMetadata(order.attribution_metadata);
  const campaigns = hierarchy.campaigns || [];
  const ads = hierarchy.ads || [];
  const adSets = hierarchy.adSets || [];

  const visitor_id = order.visitor_id || null;
  const session_id = order.session_id || null;
  const fbclid = order.fbclid ? String(order.fbclid).trim() : null;
  const utm_source = order.utm_source ? String(order.utm_source).trim() : null;
  const utm_medium = order.utm_medium ? String(order.utm_medium).trim() : null;
  const utm_campaign = order.utm_campaign ? String(order.utm_campaign).trim() : null;
  const utm_content = order.utm_content ? String(order.utm_content).trim() : null;

  const defaultUnattributed = (status: AttributionStatus = 'UNATTRIBUTED'): ResolvedAttribution => ({
    attribution_status: status,
    attribution_method: 'NONE',
    confidence: 'NONE',
    meta_campaign_id: null,
    campaign_name: null,
    meta_adset_id: null,
    meta_ad_id: null,
    matched_campaign_db_id: null,
    matched_adset_db_id: null,
    matched_ad_db_id: null,
    visitor_id,
    session_id,
    fbclid,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    is_financially_creditable: false
  });

  // 1. Check for complete absence of attribution / Organic Traffic
  const hasAnyParam = !!(
    fbclid ||
    utm_source ||
    utm_medium ||
    utm_campaign ||
    utm_content ||
    metadata.campaign_id ||
    metadata.campaign_name ||
    metadata.adset_id ||
    metadata.ad_id
  );

  if (!hasAnyParam) {
    return defaultUnattributed('ORGANIC');
  }

  // Multi-tier candidate tracking for conflict detection
  let directAdMatch: { ad: MetaAdRecord; campaign?: MetaCampaignRecord } | null = null;
  let directCampaignMatch: MetaCampaignRecord | null = null;
  let utmCampaignIdMatch: MetaCampaignRecord | null = null;
  let utmCampaignNameMatch: MetaCampaignRecord | null = null;

  let directAdConflict = false;
  let directCampaignConflict = false;
  let utmCampaignIdConflict = false;
  let utmCampaignNameConflict = false;

  // LEVEL 1 — DIRECT META AD ID MATCHING
  const rawAdId = metadata.ad_id || (utm_content && ads.some(a => a.meta_ad_id.toLowerCase() === utm_content.toLowerCase()) ? utm_content : null);
  if (rawAdId) {
    const targetAdId = String(rawAdId).trim().toLowerCase();
    const matchingAds = ads.filter(a => a.meta_ad_id && a.meta_ad_id.toLowerCase() === targetAdId);
    if (matchingAds.length === 1) {
      const matchedAd = matchingAds[0];
      const matchedCamp = campaigns.find(c => c.id === matchedAd.campaign_id || c.meta_campaign_id === matchedAd.meta_campaign_id);
      directAdMatch = { ad: matchedAd, campaign: matchedCamp };
    } else if (matchingAds.length > 1) {
      directAdConflict = true;
    }
  }

  // LEVEL 2 — DIRECT CAMPAIGN ID MATCHING
  if (metadata.campaign_id) {
    const targetCampId = String(metadata.campaign_id).trim().toLowerCase();
    const matchingCamps = campaigns.filter(c => c.meta_campaign_id && c.meta_campaign_id.toLowerCase() === targetCampId);
    if (matchingCamps.length === 1) {
      directCampaignMatch = matchingCamps[0];
    } else if (matchingCamps.length > 1) {
      directCampaignConflict = true;
    }
  }

  // LEVEL 3 — EXACT UTM META CAMPAIGN ID MATCHING
  if (utm_campaign) {
    const targetUtmId = utm_campaign.toLowerCase();
    const matchingCamps = campaigns.filter(c => c.meta_campaign_id && c.meta_campaign_id.toLowerCase() === targetUtmId);
    if (matchingCamps.length === 1) {
      utmCampaignIdMatch = matchingCamps[0];
    } else if (matchingCamps.length > 1) {
      utmCampaignIdConflict = true;
    }
  }

  // LEVEL 4 — EXACT CAMPAIGN NAME MATCHING
  const rawCampaignName = metadata.campaign_name || utm_campaign;
  if (rawCampaignName) {
    const targetName = String(rawCampaignName).trim().toLowerCase();
    const matchingCamps = campaigns.filter(c => c.name && c.name.trim().toLowerCase() === targetName);
    if (matchingCamps.length === 1) {
      utmCampaignNameMatch = matchingCamps[0];
    } else if (matchingCamps.length > 1) {
      utmCampaignNameConflict = true;
    }
  }

  // Ambiguity / Conflict Detection across resolution levels
  const resolvedCampaignIds = new Set<string>();
  if (directAdMatch?.campaign) resolvedCampaignIds.add(directAdMatch.campaign.id);
  if (directCampaignMatch) resolvedCampaignIds.add(directCampaignMatch.id);
  if (utmCampaignIdMatch) resolvedCampaignIds.add(utmCampaignIdMatch.id);
  if (utmCampaignNameMatch) resolvedCampaignIds.add(utmCampaignNameMatch.id);

  // If conflicting distinct campaigns are resolved across levels
  if (resolvedCampaignIds.size > 1 || directAdConflict || directCampaignConflict || utmCampaignIdConflict || utmCampaignNameConflict) {
    return defaultUnattributed('AMBIGUOUS');
  }

  // APPLY STRICT DETERMINISTIC PRECEDENCE HIERARCHY

  // 1. LEVEL 1: DIRECT AD ID
  if (directAdMatch) {
    const ad = directAdMatch.ad;
    const camp = directAdMatch.campaign;
    const adset = adSets.find(s => s.id === ad.adset_id || s.meta_adset_id === ad.meta_adset_id);

    return {
      attribution_status: 'ATTRIBUTED',
      attribution_method: 'DIRECT_AD_ID',
      confidence: 'HIGH',
      meta_campaign_id: camp?.meta_campaign_id || ad.meta_campaign_id || null,
      campaign_name: camp?.name || null,
      meta_adset_id: adset?.meta_adset_id || ad.meta_adset_id || null,
      meta_ad_id: ad.meta_ad_id,
      matched_campaign_db_id: camp?.id || ad.campaign_id || null,
      matched_adset_db_id: adset?.id || ad.adset_id || null,
      matched_ad_db_id: ad.id,
      visitor_id,
      session_id,
      fbclid,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      is_financially_creditable: true
    };
  }

  // 2. LEVEL 2: DIRECT CAMPAIGN ID
  if (directCampaignMatch) {
    return {
      attribution_status: 'ATTRIBUTED',
      attribution_method: 'DIRECT_CAMPAIGN_ID',
      confidence: 'HIGH',
      meta_campaign_id: directCampaignMatch.meta_campaign_id,
      campaign_name: directCampaignMatch.name,
      meta_adset_id: metadata.adset_id ? String(metadata.adset_id).trim() : null,
      meta_ad_id: metadata.ad_id ? String(metadata.ad_id).trim() : null,
      matched_campaign_db_id: directCampaignMatch.id,
      matched_adset_db_id: null,
      matched_ad_db_id: null,
      visitor_id,
      session_id,
      fbclid,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      is_financially_creditable: true
    };
  }

  // 3. LEVEL 3: EXACT UTM META CAMPAIGN ID
  if (utmCampaignIdMatch) {
    return {
      attribution_status: 'ATTRIBUTED',
      attribution_method: 'UTM_CAMPAIGN_ID',
      confidence: 'HIGH',
      meta_campaign_id: utmCampaignIdMatch.meta_campaign_id,
      campaign_name: utmCampaignIdMatch.name,
      meta_adset_id: metadata.adset_id ? String(metadata.adset_id).trim() : null,
      meta_ad_id: metadata.ad_id ? String(metadata.ad_id).trim() : null,
      matched_campaign_db_id: utmCampaignIdMatch.id,
      matched_adset_db_id: null,
      matched_ad_db_id: null,
      visitor_id,
      session_id,
      fbclid,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      is_financially_creditable: true
    };
  }

  // 4. LEVEL 4: EXACT CAMPAIGN NAME
  if (utmCampaignNameMatch) {
    return {
      attribution_status: 'ATTRIBUTED',
      attribution_method: 'UTM_CAMPAIGN_NAME',
      confidence: 'MEDIUM',
      meta_campaign_id: utmCampaignNameMatch.meta_campaign_id,
      campaign_name: utmCampaignNameMatch.name,
      meta_adset_id: metadata.adset_id ? String(metadata.adset_id).trim() : null,
      meta_ad_id: metadata.ad_id ? String(metadata.ad_id).trim() : null,
      matched_campaign_db_id: utmCampaignNameMatch.id,
      matched_adset_db_id: null,
      matched_ad_db_id: null,
      visitor_id,
      session_id,
      fbclid,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      is_financially_creditable: true
    };
  }

  // 5. UNATTRIBUTED: UTM or fbclid present but no deterministic match
  return defaultUnattributed('UNATTRIBUTED');
}

export interface PerformanceMetricsInput {
  spend: number;
  revenue: number;
  paidOrders: number;
  uniqueVisitors?: number;
}

export interface PerformanceMetricsOutput {
  spend: number;
  revenue: number;
  paidOrders: number;
  uniqueVisitors: number;
  conversionRate: number | null; // e.g. 2.50 (%) or null if uniqueVisitors <= 0
  cac: number | null;            // spend / paidOrders or null if paidOrders <= 0
  roas: number | null;           // revenue / spend or null if spend <= 0
  aov: number | null;            // revenue / paidOrders or null if paidOrders <= 0
  netResultAfterMedia: number;   // revenue - spend
}

/**
 * Computes performance marketing metrics with division-by-zero guards.
 * Strictly guarantees that NaN and Infinity are never produced.
 */
export function calculatePerformanceMetrics(input: PerformanceMetricsInput): PerformanceMetricsOutput {
  const spend = Math.max(0, Math.round((Number(input.spend) || 0) * 100) / 100);
  const revenue = Math.max(0, Math.round((Number(input.revenue) || 0) * 100) / 100);
  const paidOrders = Math.max(0, Math.floor(Number(input.paidOrders) || 0));
  const uniqueVisitors = Math.max(0, Math.floor(Number(input.uniqueVisitors) || 0));

  const netResultAfterMedia = Math.round((revenue - spend) * 100) / 100;
  const aov = paidOrders > 0 ? Math.round((revenue / paidOrders) * 100) / 100 : null;
  const cac = paidOrders > 0 ? Math.round((spend / paidOrders) * 100) / 100 : null;
  const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null;
  const conversionRate = uniqueVisitors > 0 ? Math.round(((paidOrders / uniqueVisitors) * 100) * 100) / 100 : null;

  return {
    spend,
    revenue,
    paidOrders,
    uniqueVisitors,
    conversionRate,
    cac,
    roas,
    aov,
    netResultAfterMedia
  };
}
