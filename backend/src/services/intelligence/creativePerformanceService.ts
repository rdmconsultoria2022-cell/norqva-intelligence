import { Pool } from 'pg';
import { MetaSchedulerService } from '../meta/metaSchedulerService';
import { getCommercialOrderClause } from '../../utils/commercialTruthPolicy';
import { createDateInTimezone, getLocalComponentsInTimezone, COMMERCIAL_TIMEZONE } from '../../utils/commercialTimezone';

export interface CreativePerformanceFilter {
  campaign_id?: string;
  adset_id?: string;
  date_from?: string;
  date_to?: string;
  is_demo?: boolean;
}

export interface CreativePerformanceSummary {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_checkouts: number;
  total_paid_orders: number;
  total_revenue: number;
  blended_cac: number | null;
  blended_roas: number;
}

export interface CreativeItemPerformance {
  ad_id: string;
  creative_id: string | null;
  ad_name: string;
  adset_id: string;
  campaign_id: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  link_clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  offer_views: number;
  checkout_started: number;
  paid_orders: number;
  gross_revenue: number;
  net_revenue: number;
  landing_rate: number;
  checkout_rate: number;
  purchase_rate: number;
  cac: number | null;
  roas: number;
  revenue_per_click: number;
  confidence: 'OBSERVING' | 'LEARNING' | 'CONFIDENT';
  confidence_reason: 'INSUFFICIENT_CLICKS' | 'INSUFFICIENT_PURCHASES' | 'LEARNING_SAMPLE' | 'SUFFICIENT_SAMPLE';
}

export interface UnattributedSummary {
  unattributed_paid_orders: number;
  unattributed_revenue: number;
}

export interface DataFreshness {
  last_meta_sync: string | null;
  meta_sync_status: string;
  latest_meta_insight_date: string | null;
  latest_order_timestamp: string | null;
}

export interface CreativePerformanceResponse {
  summary: CreativePerformanceSummary;
  creatives: CreativeItemPerformance[];
  unattributed: UnattributedSummary;
  dataFreshness: DataFreshness;
}

export function safeDiv(numerator: number, denominator: number, fallback: number = 0): number {
  if (!denominator || isNaN(denominator) || denominator === 0 || !isFinite(denominator)) {
    return fallback;
  }
  const res = numerator / denominator;
  if (isNaN(res) || !isFinite(res)) {
    return fallback;
  }
  return Math.round(res * 10000) / 10000;
}

export function computeConfidence(clicks: number, paidOrders: number): {
  confidence: 'OBSERVING' | 'LEARNING' | 'CONFIDENT';
  confidence_reason: 'INSUFFICIENT_CLICKS' | 'INSUFFICIENT_PURCHASES' | 'LEARNING_SAMPLE' | 'SUFFICIENT_SAMPLE';
} {
  if (clicks < 30) {
    return { confidence: 'OBSERVING', confidence_reason: 'INSUFFICIENT_CLICKS' };
  }
  if (paidOrders === 0) {
    return { confidence: 'OBSERVING', confidence_reason: 'INSUFFICIENT_PURCHASES' };
  }
  if (paidOrders < 5 || clicks < 100) {
    return { confidence: 'LEARNING', confidence_reason: 'LEARNING_SAMPLE' };
  }
  return { confidence: 'CONFIDENT', confidence_reason: 'SUFFICIENT_SAMPLE' };
}

export function normalizeDateRangeBoundaries(dateFrom?: string, dateTo?: string, timeZone: string = COMMERCIAL_TIMEZONE): {
  dateFromMeta: string | null;
  dateToMeta: string | null;
  startIso: string | null;
  endExclusiveIso: string | null;
} {
  let dateFromMeta: string | null = null;
  let dateToMeta: string | null = null;
  let startIso: string | null = null;
  let endExclusiveIso: string | null = null;

  if (dateFrom) {
    const raw = dateFrom.trim();
    if (raw.includes('T')) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        startIso = d.toISOString();
        dateFromMeta = getLocalComponentsInTimezone(d, timeZone).dateStr;
      }
    } else {
      const parts = raw.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          const startDate = createDateInTimezone(year, month, day, 0, 0, 0, 0, timeZone);
          startIso = startDate.toISOString();
          dateFromMeta = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  if (dateTo) {
    const raw = dateTo.trim();
    if (raw.includes('T')) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        endExclusiveIso = d.toISOString();
        dateToMeta = getLocalComponentsInTimezone(d, timeZone).dateStr;
      }
    } else {
      const parts = raw.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          // Calendar next-day start in America/Sao_Paulo
          const nextDayDate = new Date(Date.UTC(year, month - 1, day + 1));
          const nextYear = nextDayDate.getUTCFullYear();
          const nextMonth = nextDayDate.getUTCMonth() + 1;
          const nextDay = nextDayDate.getUTCDate();

          const endExclusiveDate = createDateInTimezone(nextYear, nextMonth, nextDay, 0, 0, 0, 0, timeZone);
          endExclusiveIso = endExclusiveDate.toISOString();
          dateToMeta = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  return {
    dateFromMeta,
    dateToMeta,
    startIso,
    endExclusiveIso
  };
}

export class CreativePerformanceService {
  /**
   * Retrieves and computes correlated creative performance intelligence in a single consolidated query flow.
   * Completely READ-ONLY. Zero mutations to orders or meta tables.
   */
  public async getCreativePerformance(
    pool: Pool,
    filter: CreativePerformanceFilter = {}
  ): Promise<CreativePerformanceResponse> {
    const isDemo = !!filter.is_demo;

    // Temporal boundaries normalized in America/Sao_Paulo
    const { dateFromMeta, dateToMeta, startIso, endExclusiveIso } = normalizeDateRangeBoundaries(filter.date_from, filter.date_to);

    // 1. Fetch Meta Ads Hierarchy
    let adsQuery = `
      SELECT ma.id as db_ad_id,
             ma.meta_ad_id,
             ma.name as ad_name,
             ma.meta_creative_id,
             mas.id as db_adset_id,
             mas.meta_adset_id,
             mc.id as db_campaign_id,
             mc.meta_campaign_id
      FROM meta_ads ma
      JOIN meta_ad_sets mas ON mas.id = ma.adset_id
      JOIN meta_campaigns mc ON mc.id = mas.campaign_id
      WHERE ma.is_demo = $1
    `;
    const adsParams: any[] = [isDemo];

    if (filter.campaign_id) {
      adsParams.push(filter.campaign_id);
      adsQuery += ` AND (mc.id = $${adsParams.length} OR mc.meta_campaign_id = $${adsParams.length})`;
    }

    if (filter.adset_id) {
      adsParams.push(filter.adset_id);
      adsQuery += ` AND (mas.id = $${adsParams.length} OR mas.meta_adset_id = $${adsParams.length})`;
    }

    adsQuery += ` ORDER BY ma.name ASC`;
    const adsRes = await pool.query(adsQuery, adsParams);
    const adsList = adsRes.rows;

    // Build Maps for fast lookup
    const adByIdMap = new Map<string, any>(); // db_ad_id -> record
    const adByMetaIdMap = new Map<string, any>(); // meta_ad_id -> record
    const adByNameMap = new Map<string, any>(); // normalized ad_name -> record

    for (const row of adsList) {
      adByIdMap.set(row.db_ad_id, row);
      adByMetaIdMap.set(row.meta_ad_id, row);
      if (row.ad_name) {
        adByNameMap.set(row.ad_name.toLowerCase().trim(), row);
      }
    }

    // 2. Fetch Aggregated Meta Insights per Ad (Calendar Day YYYY-MM-DD comparison)
    let insightsQuery = `
      SELECT mi.ad_id,
             mi.entity_meta_id,
             COALESCE(SUM(mi.spend), 0)::numeric as total_spend,
             COALESCE(SUM(mi.impressions), 0)::bigint as total_impressions,
             COALESCE(SUM(mi.reach), 0)::bigint as total_reach,
             COALESCE(SUM(mi.clicks), 0)::bigint as total_clicks,
             COALESCE(SUM(mi.link_clicks), 0)::bigint as total_link_clicks,
             MAX(mi.date_stop) as latest_date
      FROM meta_insights mi
      WHERE mi.is_demo = $1 AND mi.entity_level = 'AD'
    `;
    const insightsParams: any[] = [isDemo];

    if (dateFromMeta) {
      insightsParams.push(dateFromMeta);
      insightsQuery += ` AND mi.date_start >= $${insightsParams.length}`;
    }

    if (dateToMeta) {
      insightsParams.push(dateToMeta);
      insightsQuery += ` AND mi.date_stop <= $${insightsParams.length}`;
    }

    insightsQuery += ` GROUP BY mi.ad_id, mi.entity_meta_id`;
    const insightsRes = await pool.query(insightsQuery, insightsParams);

    const insightsByAd = new Map<string, {
      spend: number;
      impressions: number;
      reach: number;
      clicks: number;
      link_clicks: number;
    }>();

    let latestMetaInsightDate: string | null = null;
    for (const row of insightsRes.rows) {
      if (row.latest_date && (!latestMetaInsightDate || row.latest_date > latestMetaInsightDate)) {
        latestMetaInsightDate = row.latest_date;
      }
      const key = row.ad_id || row.entity_meta_id;
      insightsByAd.set(key, {
        spend: parseFloat(row.total_spend || '0'),
        impressions: parseInt(row.total_impressions || '0', 10),
        reach: parseInt(row.total_reach || '0', 10),
        clicks: parseInt(row.total_clicks || '0', 10),
        link_clicks: parseInt(row.total_link_clicks || '0', 10)
      });
    }

    // 3. Fetch First-Party Telemetry Events (TIMESTAMPTZ >= startIso AND < endExclusiveIso)
    let telemetryQuery = `
      SELECT event_name,
             utm_content,
             metadata->>'ad_id' as meta_ad_id,
             metadata->>'ad_name' as ad_name_meta,
             COUNT(*)::int as count
      FROM telemetry_events
      WHERE (event_name = 'OFFER_VIEW' OR event_name = 'CHECKOUT_STARTED')
    `;
    const telemetryParams: any[] = [];

    if (startIso) {
      telemetryParams.push(startIso);
      telemetryQuery += ` AND created_at >= $${telemetryParams.length}`;
    }

    if (endExclusiveIso) {
      telemetryParams.push(endExclusiveIso);
      telemetryQuery += ` AND created_at < $${telemetryParams.length}`;
    }

    telemetryQuery += ` GROUP BY event_name, utm_content, metadata->>'ad_id', metadata->>'ad_name'`;
    
    let telemetryRows: any[] = [];
    try {
      const telRes = await pool.query(telemetryQuery, telemetryParams);
      telemetryRows = telRes.rows;
    } catch (_) {
      telemetryRows = [];
    }

    const telemetryByAd = new Map<string, { offer_views: number; checkout_started: number }>();

    for (const tel of telemetryRows) {
      let matchedAdMetaId: string | null = null;

      if (tel.meta_ad_id && adByMetaIdMap.has(tel.meta_ad_id)) {
        matchedAdMetaId = tel.meta_ad_id;
      } else if (tel.utm_content) {
        const cleanContent = tel.utm_content.toLowerCase().trim();
        for (const [nameKey, adRec] of adByNameMap.entries()) {
          if (nameKey.includes(cleanContent) || cleanContent.includes(nameKey) || 
              (cleanContent.includes('variant_a') && nameKey.includes('ad_a')) ||
              (cleanContent.includes('variant_b') && nameKey.includes('ad_b')) ||
              (cleanContent.includes('variant_c') && nameKey.includes('ad_c'))) {
            matchedAdMetaId = adRec.meta_ad_id;
            break;
          }
        }
      }

      if (matchedAdMetaId) {
        const cur = telemetryByAd.get(matchedAdMetaId) || { offer_views: 0, checkout_started: 0 };
        if (tel.event_name === 'OFFER_VIEW') {
          cur.offer_views += tel.count;
        } else if (tel.event_name === 'CHECKOUT_STARTED') {
          cur.checkout_started += tel.count;
        }
        telemetryByAd.set(matchedAdMetaId, cur);
      }
    }

    // 4. Fetch PAID Orders & Perform Deterministic Attribution (TIMESTAMPTZ >= startIso AND < endExclusiveIso)
    const orderProvClause = getCommercialOrderClause('orders', isDemo);
    let ordersQuery = `
      SELECT id,
             total_amount,
             gross_amount_cents,
             net_amount_cents,
             fee_cents,
             status,
             utm_source,
             utm_medium,
             utm_campaign,
             utm_content,
             utm_term,
             fbclid,
             visitor_id,
             session_id,
             attribution_metadata,
             created_at,
             paid_at
      FROM orders
      WHERE status = 'PAID' AND ${orderProvClause}
    `;
    const ordersParams: any[] = [];

    if (startIso) {
      ordersParams.push(startIso);
      ordersQuery += ` AND (paid_at >= $${ordersParams.length} OR (paid_at IS NULL AND created_at >= $${ordersParams.length}))`;
    }

    if (endExclusiveIso) {
      ordersParams.push(endExclusiveIso);
      ordersQuery += ` AND (paid_at < $${ordersParams.length} OR (paid_at IS NULL AND created_at < $${ordersParams.length}))`;
    }

    const ordersRes = await pool.query(ordersQuery, ordersParams);
    const paidOrders = ordersRes.rows;

    const ordersByAd = new Map<string, { paid_orders: number; gross_revenue: number; net_revenue: number }>();
    let unattributedPaidOrders = 0;
    let unattributedRevenue = 0;
    let latestOrderTimestamp: string | null = null;

    for (const order of paidOrders) {
      const orderTime = order.paid_at || order.created_at;
      if (orderTime && (!latestOrderTimestamp || orderTime > latestOrderTimestamp)) {
        latestOrderTimestamp = orderTime;
      }

      const gross = parseFloat(order.total_amount || '0') || ((order.gross_amount_cents || 0) / 100);
      const fee = (order.fee_cents || 0) / 100;
      const net = (order.net_amount_cents ? order.net_amount_cents / 100 : gross - fee);

      let parsedMeta: any = {};
      if (typeof order.attribution_metadata === 'object' && order.attribution_metadata !== null) {
        parsedMeta = order.attribution_metadata;
      } else if (typeof order.attribution_metadata === 'string') {
        try { parsedMeta = JSON.parse(order.attribution_metadata); } catch (_) {}
      }

      let matchedMetaAdId: string | null = null;

      // Priority 1: Direct ad_id in metadata
      if (parsedMeta.ad_id && adByMetaIdMap.has(parsedMeta.ad_id)) {
        matchedMetaAdId = parsedMeta.ad_id;
      }

      // Priority 2: utm_content direct or partial match
      if (!matchedMetaAdId && order.utm_content) {
        const cleanUtm = order.utm_content.toLowerCase().trim();
        for (const [nameKey, adRec] of adByNameMap.entries()) {
          if (nameKey.includes(cleanUtm) || cleanUtm.includes(nameKey) ||
              (cleanUtm.includes('variant_a') && nameKey.includes('ad_a')) ||
              (cleanUtm.includes('variant_b') && nameKey.includes('ad_b')) ||
              (cleanUtm.includes('variant_c') && nameKey.includes('ad_c'))) {
            matchedMetaAdId = adRec.meta_ad_id;
            break;
          }
        }
      }

      if (matchedMetaAdId) {
        const cur = ordersByAd.get(matchedMetaAdId) || { paid_orders: 0, gross_revenue: 0, net_revenue: 0 };
        cur.paid_orders += 1;
        cur.gross_revenue += gross;
        cur.net_revenue += net;
        ordersByAd.set(matchedMetaAdId, cur);
      } else {
        unattributedPaidOrders += 1;
        unattributedRevenue += gross;
      }
    }

    // 5. Aggregate Creative Items
    const creatives: CreativeItemPerformance[] = [];

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCheckouts = 0;
    let totalPaidOrders = 0;
    let totalRevenue = 0;

    for (const ad of adsList) {
      const ins = insightsByAd.get(ad.db_ad_id) || insightsByAd.get(ad.meta_ad_id) || {
        spend: 0,
        impressions: 0,
        reach: 0,
        clicks: 0,
        link_clicks: 0
      };

      const tel = telemetryByAd.get(ad.meta_ad_id) || { offer_views: 0, checkout_started: 0 };
      const ord = ordersByAd.get(ad.meta_ad_id) || { paid_orders: 0, gross_revenue: 0, net_revenue: 0 };

      const spend = ins.spend;
      const impressions = ins.impressions;
      const reach = ins.reach || impressions;
      const clicks = ins.clicks;
      const link_clicks = ins.link_clicks || clicks;
      const offer_views = tel.offer_views;
      const checkout_started = tel.checkout_started;
      const paid_orders = ord.paid_orders;
      const gross_revenue = Math.round(ord.gross_revenue * 100) / 100;
      const net_revenue = Math.round(ord.net_revenue * 100) / 100;

      const ctr = safeDiv(clicks * 100, impressions);
      const cpc = safeDiv(spend, clicks);
      const cpm = safeDiv(spend * 1000, impressions);

      const landing_rate = safeDiv(offer_views, link_clicks || clicks);
      const checkout_rate = safeDiv(checkout_started, offer_views);
      const purchase_rate = safeDiv(paid_orders, checkout_started);
      
      // FIX 1: CAC is null if paid_orders is 0 (Not Calculable / Undefined)
      const cac = paid_orders > 0 ? safeDiv(spend, paid_orders) : null;
      
      const roas = safeDiv(gross_revenue, spend);
      const revenue_per_click = safeDiv(gross_revenue, clicks);

      const { confidence, confidence_reason } = computeConfidence(clicks, paid_orders);

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalCheckouts += checkout_started;
      totalPaidOrders += paid_orders;
      totalRevenue += gross_revenue;

      creatives.push({
        ad_id: ad.meta_ad_id,
        creative_id: ad.meta_creative_id || null,
        ad_name: ad.ad_name,
        adset_id: ad.meta_adset_id,
        campaign_id: ad.meta_campaign_id,
        spend,
        impressions,
        reach,
        clicks,
        link_clicks,
        ctr,
        cpc,
        cpm,
        offer_views,
        checkout_started,
        paid_orders,
        gross_revenue,
        net_revenue,
        landing_rate,
        checkout_rate,
        purchase_rate,
        cac,
        roas,
        revenue_per_click,
        confidence,
        confidence_reason
      });
    }

    // Include Unattributed in Totals
    const blendedPaidOrders = totalPaidOrders + unattributedPaidOrders;
    const blendedGrossRevenue = totalRevenue + unattributedRevenue;
    
    // FIX 1: blended_cac is null if blendedPaidOrders is 0
    const blendedCac = blendedPaidOrders > 0 ? safeDiv(totalSpend, blendedPaidOrders) : null;
    const blendedRoas = safeDiv(blendedGrossRevenue, totalSpend);

    const summary: CreativePerformanceSummary = {
      total_spend: Math.round(totalSpend * 100) / 100,
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      total_checkouts: totalCheckouts,
      total_paid_orders: blendedPaidOrders,
      total_revenue: Math.round(blendedGrossRevenue * 100) / 100,
      blended_cac: blendedCac,
      blended_roas: blendedRoas
    };

    const unattributed: UnattributedSummary = {
      unattributed_paid_orders: unattributedPaidOrders,
      unattributed_revenue: Math.round(unattributedRevenue * 100) / 100
    };

    // 6. Data Freshness
    const schedulerStatus = MetaSchedulerService.getInstance().getStatus();
    const dataFreshness: DataFreshness = {
      last_meta_sync: schedulerStatus.lastMetaSync,
      meta_sync_status: schedulerStatus.lastMetaSyncStatus || 'IDLE',
      latest_meta_insight_date: latestMetaInsightDate,
      latest_order_timestamp: latestOrderTimestamp
    };

    return {
      summary,
      creatives,
      unattributed,
      dataFreshness
    };
  }
}
