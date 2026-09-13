import { Pool } from 'pg';
import {
  MetaHierarchyContext,
  resolveOrderAttribution,
  ResolvedAttribution
} from './deterministicAttributionResolver';

export type AttributionPeriod = 'today' | '7d' | '30d' | 'custom';

export type PerformanceSampleStatus = 'NO_DATA' | 'INSUFFICIENT_DATA' | 'OBSERVING';

export interface TimeRangeWindow {
  period: AttributionPeriod;
  startDate: Date;
  endDate: Date;
  startDateIso: string;
  endDateIso: string;
}

export interface MetricRatesOutput {
  cac: number | null;
  roas: number | null;
  commercialAov: number | null;
  attributedAov: number | null;
  conversionRate: number | null;
  orderAttributionRate: number | null;
  revenueAttributionRate: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  sampleStatus: PerformanceSampleStatus;
  sampleSizeNotice: string | null;
  qualityWarning: string | null;
}

/**
 * Parses and enforces strictly synchronized date windows across Meta & Commerce data.
 */
export function parseTimeRangeWindow(
  periodParam?: string,
  startDateParam?: string,
  endDateParam?: string
): TimeRangeWindow {
  const now = new Date();
  let period: AttributionPeriod = '30d';
  let startDate: Date;
  let endDate: Date = now;

  const validPeriods = ['today', '7d', '30d', 'custom'];
  const requestedPeriod = (periodParam || '30d').toLowerCase();

  if (requestedPeriod === 'today') {
    period = 'today';
    startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  } else if (requestedPeriod === '7d') {
    period = '7d';
    startDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  } else if (requestedPeriod === 'custom' && startDateParam && endDateParam) {
    period = 'custom';
    startDate = new Date(startDateParam);
    endDate = new Date(endDateParam);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
      // Fallback to 30d if invalid custom range
      period = '30d';
      startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      endDate = now;
    }
  } else {
    // Default to 30d (disallowing unbounded 'all' in comparative attribution)
    period = '30d';
    startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  }

  return {
    period,
    startDate,
    endDate,
    startDateIso: startDate.toISOString(),
    endDateIso: endDate.toISOString()
  };
}

/**
 * Calculates core attribution metrics with division-by-zero protection.
 * Strictly guarantees that NaN and Infinity are never returned.
 */
export function calculateAttributionMetrics(params: {
  spend: number;
  grossRevenue: number;
  attributedRevenue: number;
  totalPaidOrders: number;
  attributedPaidOrders: number;
  uniqueVisitors?: number;
  impressions?: number;
  clicks?: number;
}): MetricRatesOutput {
  const spend = Math.max(0, Math.round((Number(params.spend) || 0) * 100) / 100);
  const grossRevenue = Math.max(0, Math.round((Number(params.grossRevenue) || 0) * 100) / 100);
  const attributedRevenue = Math.max(0, Math.round((Number(params.attributedRevenue) || 0) * 100) / 100);
  const totalPaidOrders = Math.max(0, Math.floor(Number(params.totalPaidOrders) || 0));
  const attributedPaidOrders = Math.max(0, Math.floor(Number(params.attributedPaidOrders) || 0));
  const uniqueVisitors = Math.max(0, Math.floor(Number(params.uniqueVisitors) || 0));
  const impressions = Math.max(0, Math.floor(Number(params.impressions) || 0));
  const clicks = Math.max(0, Math.floor(Number(params.clicks) || 0));

  // AOV calculations
  const commercialAov = totalPaidOrders > 0 ? Math.round((grossRevenue / totalPaidOrders) * 100) / 100 : null;
  const attributedAov = attributedPaidOrders > 0 ? Math.round((attributedRevenue / attributedPaidOrders) * 100) / 100 : null;

  // Media unit economics
  const cac = attributedPaidOrders > 0 ? Math.round((spend / attributedPaidOrders) * 100) / 100 : null;
  const roas = spend > 0 ? Math.round((attributedRevenue / spend) * 100) / 100 : null;

  // Conversion rate (based strictly on unique visitors in the same date window)
  const conversionRate = uniqueVisitors > 0 ? Math.round(((attributedPaidOrders / uniqueVisitors) * 100) * 100) / 100 : null;

  // Attribution rates
  const orderAttributionRate = totalPaidOrders > 0 ? Math.round(((attributedPaidOrders / totalPaidOrders) * 100) * 100) / 100 : null;
  const revenueAttributionRate = grossRevenue > 0 ? Math.round(((attributedRevenue / grossRevenue) * 100) * 100) / 100 : null;

  // Media efficiencies
  const ctr = impressions > 0 ? Math.round(((clicks / impressions) * 100) * 100) / 100 : null;
  const cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : null;
  const cpm = impressions > 0 ? Math.round(((spend / impressions) * 1000) * 100) / 100 : null;

  // Sample size safety & status classification
  let sampleStatus: PerformanceSampleStatus = 'NO_DATA';
  let sampleSizeNotice: string | null = null;

  if (spend === 0 && attributedPaidOrders === 0 && grossRevenue === 0) {
    sampleStatus = 'NO_DATA';
  } else if (attributedPaidOrders < 3) {
    // Mandated Sample Size Guard: < 3 attributed orders is strictly INSUFFICIENT_DATA
    sampleStatus = 'INSUFFICIENT_DATA';
    sampleSizeNotice = 'Base amostral ainda insuficiente para decisão de otimização.';
  } else {
    sampleStatus = 'OBSERVING';
  }

  // Quality Warning: Trigger when attribution rate is below 80%
  let qualityWarning: string | null = null;
  if (
    (orderAttributionRate !== null && orderAttributionRate < 80) ||
    (revenueAttributionRate !== null && revenueAttributionRate < 80)
  ) {
    qualityWarning = 'Parte relevante das vendas ainda não possui atribuição determinística.';
  }

  return {
    cac,
    roas,
    commercialAov,
    attributedAov,
    conversionRate,
    orderAttributionRate,
    revenueAttributionRate,
    ctr,
    cpc,
    cpm,
    sampleStatus,
    sampleSizeNotice,
    qualityWarning
  };
}

export interface AttributionAnalyticsResponse {
  period: AttributionPeriod;
  timeRange: {
    startDate: string;
    endDate: string;
    sameDateWindowEnforced: boolean;
  };
  mode: 'real' | 'demo';
  dataProvenanceAuthority: string;
  globalCommercialTruth: {
    totalOrdersCount: number;
    paidOrdersCount: number;
    pendingOrdersCount: number;
    failedOrdersCount: number;
    cancelledOrdersCount: number;
    refundedOrdersCount: number;
    grossRevenue: number;
    refundPrincipal: number;
    netCommercialRevenue: number;
    commercialAov: number | null;
    totalConfirmedPayments: number;
    gatewayFees: number;
    netProfit: number;
  };
  attributedMediaTruth: {
    account: {
      spend: number;
      impressions: number;
      reach: number | null;
      clicks: number;
      linkClicks: number | null;
      frequency: number | null;
      ctr: number | null;
      cpc: number | null;
      cpm: number | null;
    };
    commercialRollup: {
      attributedPaidOrders: number;
      attributedRevenue: number;
      unattributedOrdersCount: number;
      unattributedRevenue: number;
      ambiguousOrdersCount: number;
      ambiguousRevenue: number;
      organicOrdersCount: number;
      organicRevenue: number;
      uniqueVisitors: number;
    };
    rates: MetricRatesOutput;
  };
  byCampaign: Array<{
    campaignId: string;
    metaCampaignId: string;
    campaignName: string;
    status: string;
    effectiveStatus: string;
    spend: number;
    impressions: number;
    clicks: number;
    attributedOrders: number;
    attributedRevenue: number;
    cac: number | null;
    roas: number | null;
    attributedAov: number | null;
    ctr: number | null;
    cpc: number | null;
    sampleStatus: PerformanceSampleStatus;
  }>;
  byAdSet: Array<{
    adsetId: string;
    metaAdsetId: string;
    adsetName: string;
    campaignId: string;
    metaCampaignId: string;
    campaignName: string;
    spend: number;
    impressions: number;
    clicks: number;
    attributedOrders: number;
    attributedRevenue: number;
    cac: number | null;
    roas: number | null;
    attributedAov: number | null;
    sampleStatus: PerformanceSampleStatus;
  }>;
  byAd: Array<{
    adId: string;
    metaAdId: string;
    adName: string;
    adsetId: string;
    metaAdsetId: string;
    adsetName: string;
    campaignId: string;
    metaCampaignId: string;
    campaignName: string;
    status: string;
    effectiveStatus: string;
    spend: number;
    impressions: number;
    clicks: number;
    attributedOrders: number;
    attributedRevenue: number;
    cac: number | null;
    roas: number | null;
    attributedAov: number | null;
    sampleStatus: PerformanceSampleStatus;
  }>;
  metaFieldsAvailability: {
    spend: 'AVAILABLE';
    impressions: 'AVAILABLE';
    clicks: 'AVAILABLE';
    reach: 'AVAILABLE_IF_PRESENT';
    linkClicks: 'AVAILABLE_IF_PRESENT';
  };
}

/**
 * Executes full multi-tier attribution analytics across Account, Campaign, AdSet, and Ad.
 */
export async function getAttributionAnalyticsReport(
  pool: Pool,
  options: {
    mode?: 'real' | 'demo';
    period?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<AttributionAnalyticsResponse> {
  const isDemo = options.mode === 'demo';
  const timeWindow = parseTimeRangeWindow(options.period, options.startDate, options.endDate);

  const startDateParam = timeWindow.startDateIso;
  const endDateParam = timeWindow.endDateIso;

  // 1. Provenance Filters
  const orderProvenanceClause = isDemo
    ? `(o.data_provenance != 'COMMERCIAL_PRODUCTION' OR o.is_demo = TRUE)`
    : `(o.data_provenance = 'COMMERCIAL_PRODUCTION')`;

  const paymentProvenanceClause = isDemo
    ? `(p.data_provenance != 'COMMERCIAL_PRODUCTION' OR p.is_demo = TRUE)`
    : `(p.data_provenance = 'COMMERCIAL_PRODUCTION')`;

  const mediaSpendProvenanceClause = isDemo
    ? `(mi.is_demo = TRUE OR mi.data_provenance IN ('DEMO_SEED', 'QA_FIXTURE') OR mac.is_demo = TRUE OR mconn.is_demo = TRUE)`
    : `(
        mi.is_demo = FALSE 
        AND mac.is_demo = FALSE 
        AND mac.connection_id IS NOT NULL
        AND mconn.id IS NOT NULL
        AND mconn.is_demo = FALSE
        AND mconn.status IN ('CONNECTED', 'EXPIRED')
        AND mi.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION')
      )`;

  // 2. Aggregate Global Commercial Orders in Date Window
  const ordersRes = await pool.query(
    `SELECT 
       COUNT(*)::int as total_orders,
       COUNT(CASE WHEN o.status = 'PAID' THEN 1 END)::int as paid_orders,
       COUNT(CASE WHEN o.status = 'PENDING' THEN 1 END)::int as pending_orders,
       COUNT(CASE WHEN o.status = 'FAILED' THEN 1 END)::int as failed_orders,
       COUNT(CASE WHEN o.status = 'CANCELLED' THEN 1 END)::int as cancelled_orders,
       COUNT(CASE WHEN o.status = 'REFUNDED' THEN 1 END)::int as refunded_orders,
       COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN o.total_amount ELSE 0 END), 0)::numeric as gross_paid_revenue,
       COALESCE(SUM(CASE WHEN o.status = 'REFUNDED' THEN o.total_amount ELSE 0 END), 0)::numeric as refund_principal
     FROM orders o
     WHERE ${orderProvenanceClause}
       AND o.created_at >= $1::timestamptz 
       AND o.created_at <= $2::timestamptz`,
    [startDateParam, endDateParam]
  );

  const orderRow = ordersRes.rows[0] || {};
  const totalOrdersCount = parseInt(orderRow.total_orders || '0', 10);
  const paidOrdersCount = parseInt(orderRow.paid_orders || '0', 10);
  const pendingOrdersCount = parseInt(orderRow.pending_orders || '0', 10);
  const failedOrdersCount = parseInt(orderRow.failed_orders || '0', 10);
  const cancelledOrdersCount = parseInt(orderRow.cancelled_orders || '0', 10);
  const refundedOrdersCount = parseInt(orderRow.refunded_orders || '0', 10);
  const grossRevenue = Math.round(parseFloat(orderRow.gross_paid_revenue || '0') * 100) / 100;
  const refundPrincipal = Math.round(parseFloat(orderRow.refund_principal || '0') * 100) / 100;
  const netCommercialRevenue = grossRevenue;

  // 3. Aggregate Payment Fees
  const paymentsRes = await pool.query(
    `SELECT 
       COUNT(*)::int as total_confirmed_payments,
       COALESCE(SUM(p.provider_fee), 0)::numeric as total_gateway_fees
     FROM payments p
     WHERE ${paymentProvenanceClause}
       AND p.status = 'CONFIRMED'
       AND p.created_at >= $1::timestamptz 
       AND p.created_at <= $2::timestamptz`,
    [startDateParam, endDateParam]
  );
  const payRow = paymentsRes.rows[0] || {};
  const totalConfirmedPayments = parseInt(payRow.total_confirmed_payments || '0', 10);
  const gatewayFees = Math.round(parseFloat(payRow.total_gateway_fees || '0') * 100) / 100;

  // 4. Ingested Media Spend & Account Metrics (ACCOUNT Level)
  const accountMediaRes = await pool.query(
    `SELECT 
       COALESCE(SUM(mi.spend), 0)::numeric as total_spend,
       COALESCE(SUM(mi.impressions), 0)::bigint as total_impressions,
       COALESCE(SUM(mi.reach), 0)::bigint as total_reach,
       COALESCE(SUM(mi.clicks), 0)::bigint as total_clicks,
       COALESCE(SUM(mi.link_clicks), 0)::bigint as total_link_clicks
     FROM meta_insights mi
     JOIN meta_ad_accounts mac ON mac.id = mi.ad_account_id
     LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
     WHERE ${mediaSpendProvenanceClause}
       AND mi.entity_level = 'ACCOUNT'
       AND mi.date_start >= $1::date
       AND mi.date_stop <= $2::date`,
    [startDateParam, endDateParam]
  );

  let accountSpend = parseFloat(accountMediaRes.rows[0]?.total_spend || '0');
  let accountImpressions = parseInt(accountMediaRes.rows[0]?.total_impressions || '0', 10);
  let accountReach = parseInt(accountMediaRes.rows[0]?.total_reach || '0', 10);
  let accountClicks = parseInt(accountMediaRes.rows[0]?.total_clicks || '0', 10);
  let accountLinkClicks = parseInt(accountMediaRes.rows[0]?.total_link_clicks || '0', 10);

  // Fallback to campaign-level rollup if account rollup row was not present in insights
  if (accountSpend === 0) {
    const campaignRollupRes = await pool.query(
      `SELECT 
         COALESCE(SUM(mi.spend), 0)::numeric as total_spend,
         COALESCE(SUM(mi.impressions), 0)::bigint as total_impressions,
         COALESCE(SUM(mi.reach), 0)::bigint as total_reach,
         COALESCE(SUM(mi.clicks), 0)::bigint as total_clicks,
         COALESCE(SUM(mi.link_clicks), 0)::bigint as total_link_clicks
       FROM meta_insights mi
       JOIN meta_ad_accounts mac ON mac.id = mi.ad_account_id
       LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
       WHERE ${mediaSpendProvenanceClause}
         AND mi.entity_level = 'CAMPAIGN'
         AND mi.date_start >= $1::date
         AND mi.date_stop <= $2::date`,
      [startDateParam, endDateParam]
    );
    accountSpend = parseFloat(campaignRollupRes.rows[0]?.total_spend || '0');
    accountImpressions = parseInt(campaignRollupRes.rows[0]?.total_impressions || '0', 10);
    accountReach = parseInt(campaignRollupRes.rows[0]?.total_reach || '0', 10);
    accountClicks = parseInt(campaignRollupRes.rows[0]?.total_clicks || '0', 10);
    accountLinkClicks = parseInt(campaignRollupRes.rows[0]?.total_link_clicks || '0', 10);
  }

  accountSpend = Math.round(accountSpend * 100) / 100;

  // 5. Unique Visitors from Commercial Funnel Events (Strictly in the same window)
  const funnelClause = isDemo ? `is_demo = TRUE` : `is_demo = FALSE`;
  const visitorsRes = await pool.query(
    `SELECT COUNT(DISTINCT visitor_id)::int as unique_visitors
     FROM commercial_funnel_events
     WHERE ${funnelClause}
       AND created_at >= $1::timestamptz 
       AND created_at <= $2::timestamptz`,
    [startDateParam, endDateParam]
  );
  const uniqueVisitors = parseInt(visitorsRes.rows[0]?.unique_visitors || '0', 10);

  // 6. Fetch Meta Hierarchy (Campaigns, AdSets, Ads)
  const mediaCampaignClause = isDemo ? `(mc.is_demo = TRUE)` : `(mc.is_demo = FALSE AND mc.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION'))`;
  const mediaAdsetClause = isDemo ? `(mas.is_demo = TRUE)` : `(mas.is_demo = FALSE AND mas.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION'))`;
  const mediaAdClause = isDemo ? `(ma.is_demo = TRUE)` : `(ma.is_demo = FALSE AND ma.data_provenance IN ('COMMERCIAL_PRODUCTION', 'LEGACY_MIGRATION'))`;

  const campaignsRes = await pool.query(
    `SELECT 
       mc.id as campaign_id,
       mc.meta_campaign_id,
       mc.name as campaign_name,
       mc.status,
       mc.effective_status,
       COALESCE(SUM(mi.spend), 0)::numeric as spend,
       COALESCE(SUM(mi.impressions), 0)::bigint as impressions,
       COALESCE(SUM(mi.clicks), 0)::bigint as clicks
     FROM meta_campaigns mc
     JOIN meta_ad_accounts mac ON mac.id = mc.ad_account_id
     LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
     LEFT JOIN meta_insights mi ON mi.campaign_id = mc.id 
       AND mi.entity_level = 'CAMPAIGN' 
       AND mi.date_start >= $1::date 
       AND mi.date_stop <= $2::date
       AND ${mediaSpendProvenanceClause}
     WHERE ${mediaCampaignClause}
     GROUP BY mc.id, mc.meta_campaign_id, mc.name, mc.status, mc.effective_status
     ORDER BY spend DESC`,
    [startDateParam, endDateParam]
  );

  const adsetsRes = await pool.query(
    `SELECT 
       mas.id as adset_id,
       mas.meta_adset_id,
       mas.name as adset_name,
       mc.id as campaign_id,
       mc.meta_campaign_id,
       mc.name as campaign_name,
       COALESCE(SUM(mi.spend), 0)::numeric as spend,
       COALESCE(SUM(mi.impressions), 0)::bigint as impressions,
       COALESCE(SUM(mi.clicks), 0)::bigint as clicks
     FROM meta_ad_sets mas
     JOIN meta_campaigns mc ON mc.id = mas.campaign_id
     JOIN meta_ad_accounts mac ON mac.id = mc.ad_account_id
     LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
     LEFT JOIN meta_insights mi ON mi.adset_id = mas.id 
       AND mi.entity_level = 'ADSET' 
       AND mi.date_start >= $1::date 
       AND mi.date_stop <= $2::date
       AND ${mediaSpendProvenanceClause}
     WHERE ${mediaAdsetClause}
     GROUP BY mas.id, mas.meta_adset_id, mas.name, mc.id, mc.meta_campaign_id, mc.name
     ORDER BY spend DESC`,
    [startDateParam, endDateParam]
  );

  const adsRes = await pool.query(
    `SELECT 
       ma.id as ad_id,
       ma.meta_ad_id,
       ma.name as ad_name,
       ma.status,
       ma.effective_status,
       mas.id as adset_id,
       mas.meta_adset_id,
       mas.name as adset_name,
       mc.id as campaign_id,
       mc.meta_campaign_id,
       mc.name as campaign_name,
       COALESCE(SUM(mi.spend), 0)::numeric as spend,
       COALESCE(SUM(mi.impressions), 0)::bigint as impressions,
       COALESCE(SUM(mi.clicks), 0)::bigint as clicks
     FROM meta_ads ma
     JOIN meta_ad_sets mas ON mas.id = ma.adset_id
     JOIN meta_campaigns mc ON mc.id = mas.campaign_id
     JOIN meta_ad_accounts mac ON mac.id = mc.ad_account_id
     LEFT JOIN meta_connections mconn ON mconn.id = mac.connection_id
     LEFT JOIN meta_insights mi ON mi.ad_id = ma.id 
       AND mi.entity_level = 'AD' 
       AND mi.date_start >= $1::date 
       AND mi.date_stop <= $2::date
       AND ${mediaSpendProvenanceClause}
     WHERE ${mediaAdClause}
     GROUP BY ma.id, ma.meta_ad_id, ma.name, ma.status, ma.effective_status, mas.id, mas.meta_adset_id, mas.name, mc.id, mc.meta_campaign_id, mc.name
     ORDER BY spend DESC`,
    [startDateParam, endDateParam]
  );

  // 7. Fetch all PAID Orders in the exact window for Deterministic Attribution Resolution
  const paidOrdersRes = await pool.query(
    `SELECT 
       o.id,
       o.total_amount,
       o.status,
       o.is_demo,
       o.data_provenance,
       o.visitor_id,
       o.session_id,
       o.utm_source,
       o.utm_medium,
       o.utm_campaign,
       o.utm_content,
       o.fbclid,
       o.attribution_metadata
     FROM orders o
     WHERE ${orderProvenanceClause}
       AND o.status = 'PAID'
       AND o.created_at >= $1::timestamptz 
       AND o.created_at <= $2::timestamptz`,
    [startDateParam, endDateParam]
  );

  const hierarchy: MetaHierarchyContext = {
    campaigns: campaignsRes.rows.map(c => ({
      id: c.campaign_id,
      meta_campaign_id: c.meta_campaign_id,
      name: c.campaign_name,
      status: c.status,
      effective_status: c.effective_status
    })),
    adSets: adsetsRes.rows.map(as => ({
      id: as.adset_id,
      meta_adset_id: as.meta_adset_id,
      name: as.adset_name,
      campaign_id: as.campaign_id,
      meta_campaign_id: as.meta_campaign_id
    })),
    ads: adsRes.rows.map(a => ({
      id: a.ad_id,
      meta_ad_id: a.meta_ad_id,
      name: a.ad_name,
      adset_id: a.adset_id,
      meta_adset_id: a.meta_adset_id,
      campaign_id: a.campaign_id,
      meta_campaign_id: a.meta_campaign_id
    }))
  };

  // Maps for deterministic attribution aggregation
  const campaignAttributionMap = new Map<string, { orders: number; revenue: number }>();
  const adsetAttributionMap = new Map<string, { orders: number; revenue: number }>();
  const adAttributionMap = new Map<string, { orders: number; revenue: number }>();

  let totalAttributedPaidOrders = 0;
  let totalAttributedRevenue = 0.0;
  let unattributedOrdersCount = 0;
  let unattributedRevenue = 0.0;
  let ambiguousOrdersCount = 0;
  let ambiguousRevenue = 0.0;
  let organicOrdersCount = 0;
  let organicRevenue = 0.0;

  paidOrdersRes.rows.forEach(order => {
    const orderAmount = Math.round(parseFloat(order.total_amount || '0') * 100) / 100;
    const resolved: ResolvedAttribution = resolveOrderAttribution(order, hierarchy);

    if (resolved.attribution_status === 'AMBIGUOUS') {
      ambiguousOrdersCount += 1;
      ambiguousRevenue = Math.round((ambiguousRevenue + orderAmount) * 100) / 100;
    } else if (resolved.attribution_status === 'ORGANIC') {
      organicOrdersCount += 1;
      organicRevenue = Math.round((organicRevenue + orderAmount) * 100) / 100;
    } else if (
      resolved.attribution_status === 'ATTRIBUTED' &&
      resolved.is_financially_creditable &&
      resolved.matched_campaign_db_id
    ) {
      totalAttributedPaidOrders += 1;
      totalAttributedRevenue = Math.round((totalAttributedRevenue + orderAmount) * 100) / 100;

      // Campaign level attribution
      const currentCamp = campaignAttributionMap.get(resolved.matched_campaign_db_id) || { orders: 0, revenue: 0 };
      currentCamp.orders += 1;
      currentCamp.revenue = Math.round((currentCamp.revenue + orderAmount) * 100) / 100;
      campaignAttributionMap.set(resolved.matched_campaign_db_id, currentCamp);

      // AdSet level attribution
      if (resolved.matched_adset_db_id) {
        const currentAdset = adsetAttributionMap.get(resolved.matched_adset_db_id) || { orders: 0, revenue: 0 };
        currentAdset.orders += 1;
        currentAdset.revenue = Math.round((currentAdset.revenue + orderAmount) * 100) / 100;
        adsetAttributionMap.set(resolved.matched_adset_db_id, currentAdset);
      }

      // Ad level attribution
      if (resolved.matched_ad_db_id) {
        const currentAd = adAttributionMap.get(resolved.matched_ad_db_id) || { orders: 0, revenue: 0 };
        currentAd.orders += 1;
        currentAd.revenue = Math.round((currentAd.revenue + orderAmount) * 100) / 100;
        adAttributionMap.set(resolved.matched_ad_db_id, currentAd);
      }
    } else {
      unattributedOrdersCount += 1;
      unattributedRevenue = Math.round((unattributedRevenue + orderAmount) * 100) / 100;
    }
  });

  // Calculate Rollup Rates
  const overallRates = calculateAttributionMetrics({
    spend: accountSpend,
    grossRevenue,
    attributedRevenue: totalAttributedRevenue,
    totalPaidOrders: paidOrdersCount,
    attributedPaidOrders: totalAttributedPaidOrders,
    uniqueVisitors,
    impressions: accountImpressions,
    clicks: accountClicks
  });

  // 8. Build Campaign Level Drill-down
  const byCampaign = campaignsRes.rows.map(c => {
    const cSpend = Math.round(parseFloat(c.spend || '0') * 100) / 100;
    const cImpressions = parseInt(c.impressions || '0', 10);
    const cClicks = parseInt(c.clicks || '0', 10);
    const attr = campaignAttributionMap.get(c.campaign_id) || { orders: 0, revenue: 0 };
    const cRev = Math.round(attr.revenue * 100) / 100;

    const cRates = calculateAttributionMetrics({
      spend: cSpend,
      grossRevenue: cRev,
      attributedRevenue: cRev,
      totalPaidOrders: attr.orders,
      attributedPaidOrders: attr.orders,
      impressions: cImpressions,
      clicks: cClicks
    });

    return {
      campaignId: c.campaign_id,
      metaCampaignId: c.meta_campaign_id,
      campaignName: c.campaign_name,
      status: c.status,
      effectiveStatus: c.effective_status,
      spend: cSpend,
      impressions: cImpressions,
      clicks: cClicks,
      attributedOrders: attr.orders,
      attributedRevenue: cRev,
      cac: cRates.cac,
      roas: cRates.roas,
      attributedAov: cRates.attributedAov,
      ctr: cRates.ctr,
      cpc: cRates.cpc,
      sampleStatus: cRates.sampleStatus
    };
  });

  // 9. Build AdSet Level Drill-down
  const byAdSet = adsetsRes.rows.map(as => {
    const asSpend = Math.round(parseFloat(as.spend || '0') * 100) / 100;
    const asImpressions = parseInt(as.impressions || '0', 10);
    const asClicks = parseInt(as.clicks || '0', 10);
    const attr = adsetAttributionMap.get(as.adset_id) || { orders: 0, revenue: 0 };
    const asRev = Math.round(attr.revenue * 100) / 100;

    const asRates = calculateAttributionMetrics({
      spend: asSpend,
      grossRevenue: asRev,
      attributedRevenue: asRev,
      totalPaidOrders: attr.orders,
      attributedPaidOrders: attr.orders,
      impressions: asImpressions,
      clicks: asClicks
    });

    return {
      adsetId: as.adset_id,
      metaAdsetId: as.meta_adset_id,
      adsetName: as.adset_name,
      campaignId: as.campaign_id,
      metaCampaignId: as.meta_campaign_id,
      campaignName: as.campaign_name,
      spend: asSpend,
      impressions: asImpressions,
      clicks: asClicks,
      attributedOrders: attr.orders,
      attributedRevenue: asRev,
      cac: asRates.cac,
      roas: asRates.roas,
      attributedAov: asRates.attributedAov,
      sampleStatus: asRates.sampleStatus
    };
  });

  // 10. Build Ad / Creative Level Drill-down
  const byAd = adsRes.rows.map(ad => {
    const aSpend = Math.round(parseFloat(ad.spend || '0') * 100) / 100;
    const aImpressions = parseInt(ad.impressions || '0', 10);
    const aClicks = parseInt(ad.clicks || '0', 10);
    const attr = adAttributionMap.get(ad.ad_id) || { orders: 0, revenue: 0 };
    const aRev = Math.round(attr.revenue * 100) / 100;

    const aRates = calculateAttributionMetrics({
      spend: aSpend,
      grossRevenue: aRev,
      attributedRevenue: aRev,
      totalPaidOrders: attr.orders,
      attributedPaidOrders: attr.orders,
      impressions: aImpressions,
      clicks: aClicks
    });

    return {
      adId: ad.ad_id,
      metaAdId: ad.meta_ad_id,
      adName: ad.ad_name,
      adsetId: ad.adset_id,
      metaAdsetId: ad.meta_adset_id,
      adsetName: ad.adset_name,
      campaignId: ad.campaign_id,
      metaCampaignId: ad.meta_campaign_id,
      campaignName: ad.campaign_name,
      status: ad.status,
      effectiveStatus: ad.effective_status,
      spend: aSpend,
      impressions: aImpressions,
      clicks: aClicks,
      attributedOrders: attr.orders,
      attributedRevenue: aRev,
      cac: aRates.cac,
      roas: aRates.roas,
      attributedAov: aRates.attributedAov,
      sampleStatus: aRates.sampleStatus
    };
  });

  const netProfit = Math.round((grossRevenue - accountSpend - gatewayFees) * 100) / 100;

  return {
    period: timeWindow.period,
    timeRange: {
      startDate: timeWindow.startDateIso,
      endDate: timeWindow.endDateIso,
      sameDateWindowEnforced: true
    },
    mode: isDemo ? 'demo' : 'real',
    dataProvenanceAuthority: isDemo ? 'DEMO_SEED_FIXTURE' : 'COMMERCIAL_PRODUCTION_ONLY',
    globalCommercialTruth: {
      totalOrdersCount,
      paidOrdersCount,
      pendingOrdersCount,
      failedOrdersCount,
      cancelledOrdersCount,
      refundedOrdersCount,
      grossRevenue,
      refundPrincipal,
      netCommercialRevenue,
      commercialAov: overallRates.commercialAov,
      totalConfirmedPayments,
      gatewayFees,
      netProfit
    },
    attributedMediaTruth: {
      account: {
        spend: accountSpend,
        impressions: accountImpressions,
        reach: accountReach > 0 ? accountReach : null,
        clicks: accountClicks,
        linkClicks: accountLinkClicks > 0 ? accountLinkClicks : null,
        frequency: null,
        ctr: overallRates.ctr,
        cpc: overallRates.cpc,
        cpm: overallRates.cpm
      },
      commercialRollup: {
        attributedPaidOrders: totalAttributedPaidOrders,
        attributedRevenue: totalAttributedRevenue,
        unattributedOrdersCount,
        unattributedRevenue,
        ambiguousOrdersCount,
        ambiguousRevenue,
        organicOrdersCount,
        organicRevenue,
        uniqueVisitors
      },
      rates: overallRates
    },
    byCampaign,
    byAdSet,
    byAd,
    metaFieldsAvailability: {
      spend: 'AVAILABLE',
      impressions: 'AVAILABLE',
      clicks: 'AVAILABLE',
      reach: 'AVAILABLE_IF_PRESENT',
      linkClicks: 'AVAILABLE_IF_PRESENT'
    }
  };
}
