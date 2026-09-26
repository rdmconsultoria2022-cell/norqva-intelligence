import { Pool } from 'pg';
import { getCommercialTimeBoundaries, COMMERCIAL_TIMEZONE } from '../../utils/commercialTimezone';

export type MediaSampleConfidence = 'NO_DATA' | 'OBSERVING' | 'LEARNING' | 'SUFFICIENT_MEDIA_SAMPLE';

export function calculateMediaSampleConfidence(clicks: number): MediaSampleConfidence {
  const c = Math.max(0, Math.floor(Number(clicks) || 0));
  if (c === 0) return 'NO_DATA';
  if (c <= 29) return 'OBSERVING';
  if (c <= 99) return 'LEARNING';
  return 'SUFFICIENT_MEDIA_SAMPLE';
}

export interface MetricSlice {
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  link_clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  spend_share: number | null;
  impressions_share: number | null;
  click_share: number | null;
  media_sample_confidence: MediaSampleConfidence;
}

export interface AgeBreakdownSlice extends MetricSlice {
  age_group: string;
}

export interface GenderBreakdownSlice extends MetricSlice {
  gender: string;
}

export interface AdDemographicSlice {
  ad_id: string;
  meta_ad_id: string;
  ad_name: string;
  adset_name?: string;
  campaign_name?: string;
  spend: number;
  impressions: number;
  reach: number | null;
  clicks: number;
  link_clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  under_45: MetricSlice;
  age_45_plus: MetricSlice;
  unknown: MetricSlice;
  by_age: AgeBreakdownSlice[];
  click_share_45_plus: number | null;
  spend_share_45_plus: number | null;
  cpc_45_plus: number | null;
  cpc_under_45: number | null;
  media_sample_confidence: MediaSampleConfidence;
}

export interface Hypothesis45Plus {
  click_share_45_plus: number | null;
  spend_share_45_plus: number | null;
  impression_share_45_plus: number | null;
  ctr_45_plus: number | null;
  ctr_under_45: number | null;
  cpc_45_plus: number | null;
  cpc_under_45: number | null;
  media_sample_confidence_45_plus: MediaSampleConfidence;
  media_sample_confidence_under_45: MediaSampleConfidence;
}

export interface DemographicAnalyticsResponse {
  period: string;
  mode: 'real' | 'demo';
  generated_at: string;
  time_window: {
    start_date: string;
    end_date: string;
    time_zone: string;
  };
  summary: {
    total_spend: number;
    total_impressions: number;
    total_reach: number | null;
    total_clicks: number;
    total_link_clicks: number | null;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    media_sample_confidence: MediaSampleConfidence;
  };
  cohorts: {
    under_45: MetricSlice;
    age_45_plus: MetricSlice;
    unknown: MetricSlice;
  };
  by_age: AgeBreakdownSlice[];
  by_gender: GenderBreakdownSlice[];
  by_ad: AdDemographicSlice[];
  hypothesis_45_plus: Hypothesis45Plus;
}

export interface DemographicAnalyticsQueryOptions {
  mode?: 'real' | 'demo';
  period?: string;
  startDate?: string;
  endDate?: string;
  campaign_id?: string;
  ad_id?: string;
  gender?: string;
  age_group?: string;
}

const ALL_AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'unknown'];
const UNDER_45_SET = new Set(['18-24', '25-34', '35-44']);
const AGE_45_PLUS_SET = new Set(['45-54', '55-64', '65+']);
const ALL_GENDERS = ['male', 'female', 'unknown'];

interface RawTotals {
  spend: number;
  impressions: number;
  reachSum: number;
  hasReach: boolean;
  clicks: number;
  linkClicksSum: number;
  hasLinkClicks: boolean;
}

function createEmptyRawTotals(): RawTotals {
  return {
    spend: 0,
    impressions: 0,
    reachSum: 0,
    hasReach: false,
    clicks: 0,
    linkClicksSum: 0,
    hasLinkClicks: false
  };
}

function accumulateRawTotals(target: RawTotals, row: {
  spend: number | string;
  impressions: number | string;
  reach?: number | string | null;
  clicks: number | string;
  link_clicks?: number | string | null;
}) {
  const s = parseFloat(String(row.spend || '0'));
  const imp = parseInt(String(row.impressions || '0'), 10);
  const clk = parseInt(String(row.clicks || '0'), 10);

  target.spend += isNaN(s) ? 0 : s;
  target.impressions += isNaN(imp) ? 0 : imp;
  target.clicks += isNaN(clk) ? 0 : clk;

  if (row.reach !== null && row.reach !== undefined) {
    const r = parseInt(String(row.reach), 10);
    if (!isNaN(r)) {
      target.reachSum += r;
      target.hasReach = true;
    }
  }

  if (row.link_clicks !== null && row.link_clicks !== undefined) {
    const lc = parseInt(String(row.link_clicks), 10);
    if (!isNaN(lc)) {
      target.linkClicksSum += lc;
      target.hasLinkClicks = true;
    }
  }
}

function buildMetricSlice(
  raw: RawTotals,
  totalSpend: number,
  totalImpressions: number,
  totalClicks: number
): MetricSlice {
  const spend = Math.round(raw.spend * 100) / 100;
  const impressions = raw.impressions;
  const clicks = raw.clicks;
  const reach = raw.hasReach ? raw.reachSum : null;
  const link_clicks = raw.hasLinkClicks ? raw.linkClicksSum : null;

  const ctr = impressions > 0 ? Math.round(((clicks / impressions) * 100) * 100) / 100 : null;
  const cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : null;
  const cpm = impressions > 0 ? Math.round(((spend / impressions) * 1000) * 100) / 100 : null;

  const spend_share = totalSpend > 0 ? Math.round(((spend / totalSpend) * 100) * 100) / 100 : 0;
  const impressions_share = totalImpressions > 0 ? Math.round(((impressions / totalImpressions) * 100) * 100) / 100 : 0;
  const click_share = totalClicks > 0 ? Math.round(((clicks / totalClicks) * 100) * 100) / 100 : 0;
  const media_sample_confidence = calculateMediaSampleConfidence(clicks);

  return {
    spend,
    impressions,
    reach,
    clicks,
    link_clicks,
    ctr,
    cpc,
    cpm,
    spend_share,
    impressions_share,
    click_share,
    media_sample_confidence
  };
}

export class DemographicAnalyticsService {
  /**
   * Retrieves aggregated demographic intelligence exclusively from meta_demographic_insights.
   * Adheres strictly to the Economic Truth Boundary: Age is aggregated media data, never deterministic revenue.
   */
  public async getDemographicAnalytics(
    pool: Pool,
    options: DemographicAnalyticsQueryOptions = {}
  ): Promise<DemographicAnalyticsResponse> {
    const isDemo = options.mode === 'demo';
    const period = options.period || '30d';

    const boundaries = getCommercialTimeBoundaries(period, options.startDate, options.endDate);
    const startDateMeta = boundaries.dateStartMeta;
    const endDateMeta = boundaries.dateStopMeta;

    // 1. Build Query
    let query = `
      SELECT 
        mdi.id,
        mdi.ad_account_id,
        mdi.campaign_id,
        mdi.adset_id,
        mdi.ad_id,
        mdi.entity_level,
        mdi.entity_meta_id,
        mdi.date_start,
        mdi.date_stop,
        mdi.age_group,
        mdi.gender,
        mdi.spend,
        mdi.impressions,
        mdi.reach,
        mdi.clicks,
        mdi.link_clicks,
        mdi.data_provenance,
        mdi.is_demo,
        ma.name as ad_name,
        ma.meta_ad_id,
        mas.name as adset_name,
        mc.name as campaign_name
      FROM meta_demographic_insights mdi
      LEFT JOIN meta_ads ma ON ma.id = mdi.ad_id
      LEFT JOIN meta_ad_sets mas ON mas.id = mdi.adset_id
      LEFT JOIN meta_campaigns mc ON mc.id = mdi.campaign_id
      WHERE mdi.is_demo = $1
        AND mdi.date_start >= $2::date
        AND mdi.date_stop <= $3::date
        AND mdi.date_start = mdi.date_stop
    `;

    const params: any[] = [isDemo, startDateMeta, endDateMeta];

    if (options.campaign_id) {
      params.push(options.campaign_id);
      query += ` AND (mdi.campaign_id = $${params.length}::uuid OR mc.meta_campaign_id = $${params.length})`;
    }

    if (options.ad_id) {
      params.push(options.ad_id);
      query += ` AND (mdi.ad_id = $${params.length}::uuid OR mdi.entity_meta_id = $${params.length} OR ma.meta_ad_id = $${params.length})`;
    }

    if (options.gender) {
      params.push(options.gender.toLowerCase().trim());
      query += ` AND mdi.gender = $${params.length}`;
    }

    if (options.age_group) {
      params.push(options.age_group.toLowerCase().trim());
      query += ` AND mdi.age_group = $${params.length}`;
    }

    query += ` ORDER BY mdi.date_start DESC, mdi.spend DESC`;

    const res = await pool.query(query, params);
    const rows = res.rows;

    // 2. Global Totals
    const globalRaw = createEmptyRawTotals();
    const under45Raw = createEmptyRawTotals();
    const age45PlusRaw = createEmptyRawTotals();
    const unknownAgeRaw = createEmptyRawTotals();

    const ageMap = new Map<string, RawTotals>();
    ALL_AGE_GROUPS.forEach(ag => ageMap.set(ag, createEmptyRawTotals()));

    const genderMap = new Map<string, RawTotals>();
    ALL_GENDERS.forEach(g => genderMap.set(g, createEmptyRawTotals()));

    interface AdAccumulator {
      ad_id: string;
      meta_ad_id: string;
      ad_name: string;
      adset_name?: string;
      campaign_name?: string;
      total: RawTotals;
      under_45: RawTotals;
      age_45_plus: RawTotals;
      unknown: RawTotals;
      by_age: Map<string, RawTotals>;
    }

    const adMap = new Map<string, AdAccumulator>();

    for (const row of rows) {
      accumulateRawTotals(globalRaw, row);

      const ag = (row.age_group || 'unknown').toLowerCase().trim();
      const g = (row.gender || 'unknown').toLowerCase().trim();

      // Cohort assignment
      if (UNDER_45_SET.has(ag)) {
        accumulateRawTotals(under45Raw, row);
      } else if (AGE_45_PLUS_SET.has(ag)) {
        accumulateRawTotals(age45PlusRaw, row);
      } else {
        accumulateRawTotals(unknownAgeRaw, row);
      }

      // Age group accumulation
      if (!ageMap.has(ag)) {
        ageMap.set(ag, createEmptyRawTotals());
      }
      accumulateRawTotals(ageMap.get(ag)!, row);

      // Gender accumulation
      if (!genderMap.has(g)) {
        genderMap.set(g, createEmptyRawTotals());
      }
      accumulateRawTotals(genderMap.get(g)!, row);

      // Ad accumulation
      const adKey = row.ad_id || row.entity_meta_id || 'unknown_ad';
      if (!adMap.has(adKey)) {
        const adByAge = new Map<string, RawTotals>();
        ALL_AGE_GROUPS.forEach(a => adByAge.set(a, createEmptyRawTotals()));

        adMap.set(adKey, {
          ad_id: row.ad_id || '',
          meta_ad_id: row.meta_ad_id || row.entity_meta_id || '',
          ad_name: row.ad_name || row.entity_meta_id || 'Anúncio Meta',
          adset_name: row.adset_name,
          campaign_name: row.campaign_name,
          total: createEmptyRawTotals(),
          under_45: createEmptyRawTotals(),
          age_45_plus: createEmptyRawTotals(),
          unknown: createEmptyRawTotals(),
          by_age: adByAge
        });
      }

      const adAcc = adMap.get(adKey)!;
      accumulateRawTotals(adAcc.total, row);

      if (UNDER_45_SET.has(ag)) {
        accumulateRawTotals(adAcc.under_45, row);
      } else if (AGE_45_PLUS_SET.has(ag)) {
        accumulateRawTotals(adAcc.age_45_plus, row);
      } else {
        accumulateRawTotals(adAcc.unknown, row);
      }

      if (!adAcc.by_age.has(ag)) {
        adAcc.by_age.set(ag, createEmptyRawTotals());
      }
      accumulateRawTotals(adAcc.by_age.get(ag)!, row);
    }

    const totalSpend = Math.round(globalRaw.spend * 100) / 100;
    const totalImpressions = globalRaw.impressions;
    const totalClicks = globalRaw.clicks;

    // 3. Build Cohort Slices
    const summarySlice = buildMetricSlice(globalRaw, totalSpend, totalImpressions, totalClicks);
    const under45Slice = buildMetricSlice(under45Raw, totalSpend, totalImpressions, totalClicks);
    const age45PlusSlice = buildMetricSlice(age45PlusRaw, totalSpend, totalImpressions, totalClicks);
    const unknownSlice = buildMetricSlice(unknownAgeRaw, totalSpend, totalImpressions, totalClicks);

    // 4. Build Age Breakdown Slices
    const byAge: AgeBreakdownSlice[] = ALL_AGE_GROUPS.map(ag => {
      const raw = ageMap.get(ag) || createEmptyRawTotals();
      const slice = buildMetricSlice(raw, totalSpend, totalImpressions, totalClicks);
      return {
        age_group: ag,
        ...slice
      };
    });

    // 5. Build Gender Breakdown Slices
    const byGender: GenderBreakdownSlice[] = ALL_GENDERS.map(g => {
      const raw = genderMap.get(g) || createEmptyRawTotals();
      const slice = buildMetricSlice(raw, totalSpend, totalImpressions, totalClicks);
      return {
        gender: g,
        ...slice
      };
    });

    // 6. Build Ad Breakdown Slices
    const byAd: AdDemographicSlice[] = Array.from(adMap.values()).map(adAcc => {
      const adSpend = Math.round(adAcc.total.spend * 100) / 100;
      const adImpressions = adAcc.total.impressions;
      const adClicks = adAcc.total.clicks;
      const adReach = adAcc.total.hasReach ? adAcc.total.reachSum : null;
      const adLinkClicks = adAcc.total.hasLinkClicks ? adAcc.total.linkClicksSum : null;

      const adCtr = adImpressions > 0 ? Math.round(((adClicks / adImpressions) * 100) * 100) / 100 : null;
      const adCpc = adClicks > 0 ? Math.round((adSpend / adClicks) * 100) / 100 : null;
      const adCpm = adImpressions > 0 ? Math.round(((adSpend / adImpressions) * 1000) * 100) / 100 : null;

      const adUnder45Slice = buildMetricSlice(adAcc.under_45, adSpend, adImpressions, adClicks);
      const ad45PlusSlice = buildMetricSlice(adAcc.age_45_plus, adSpend, adImpressions, adClicks);
      const adUnknownSlice = buildMetricSlice(adAcc.unknown, adSpend, adImpressions, adClicks);

      const adByAge: AgeBreakdownSlice[] = ALL_AGE_GROUPS.map(ag => {
        const raw = adAcc.by_age.get(ag) || createEmptyRawTotals();
        const slice = buildMetricSlice(raw, adSpend, adImpressions, adClicks);
        return {
          age_group: ag,
          ...slice
        };
      });

      const click_share_45_plus = adClicks > 0 ? Math.round(((adAcc.age_45_plus.clicks / adClicks) * 100) * 100) / 100 : 0;
      const spend_share_45_plus = adSpend > 0 ? Math.round(((adAcc.age_45_plus.spend / adSpend) * 100) * 100) / 100 : 0;
      const cpc_45_plus = adAcc.age_45_plus.clicks > 0 ? Math.round((adAcc.age_45_plus.spend / adAcc.age_45_plus.clicks) * 100) / 100 : null;
      const cpc_under_45 = adAcc.under_45.clicks > 0 ? Math.round((adAcc.under_45.spend / adAcc.under_45.clicks) * 100) / 100 : null;
      const media_sample_confidence = calculateMediaSampleConfidence(adClicks);

      return {
        ad_id: adAcc.ad_id,
        meta_ad_id: adAcc.meta_ad_id,
        ad_name: adAcc.ad_name,
        adset_name: adAcc.adset_name,
        campaign_name: adAcc.campaign_name,
        spend: adSpend,
        impressions: adImpressions,
        reach: adReach,
        clicks: adClicks,
        link_clicks: adLinkClicks,
        ctr: adCtr,
        cpc: adCpc,
        cpm: adCpm,
        under_45: adUnder45Slice,
        age_45_plus: ad45PlusSlice,
        unknown: adUnknownSlice,
        by_age: adByAge,
        click_share_45_plus,
        spend_share_45_plus,
        cpc_45_plus,
        cpc_under_45,
        media_sample_confidence
      };
    });

    // 7. Hypothesis 45+ Analytics
    const click_share_45_plus = totalClicks > 0 ? Math.round(((age45PlusRaw.clicks / totalClicks) * 100) * 100) / 100 : 0;
    const spend_share_45_plus = totalSpend > 0 ? Math.round(((age45PlusRaw.spend / totalSpend) * 100) * 100) / 100 : 0;
    const impression_share_45_plus = totalImpressions > 0 ? Math.round(((age45PlusRaw.impressions / totalImpressions) * 100) * 100) / 100 : 0;

    const ctr_45_plus = age45PlusRaw.impressions > 0 ? Math.round(((age45PlusRaw.clicks / age45PlusRaw.impressions) * 100) * 100) / 100 : null;
    const ctr_under_45 = under45Raw.impressions > 0 ? Math.round(((under45Raw.clicks / under45Raw.impressions) * 100) * 100) / 100 : null;

    const cpc_45_plus = age45PlusRaw.clicks > 0 ? Math.round((age45PlusRaw.spend / age45PlusRaw.clicks) * 100) / 100 : null;
    const cpc_under_45 = under45Raw.clicks > 0 ? Math.round((under45Raw.spend / under45Raw.clicks) * 100) / 100 : null;

    const media_sample_confidence_45_plus = calculateMediaSampleConfidence(age45PlusRaw.clicks);
    const media_sample_confidence_under_45 = calculateMediaSampleConfidence(under45Raw.clicks);

    const hypothesis_45_plus: Hypothesis45Plus = {
      click_share_45_plus,
      spend_share_45_plus,
      impression_share_45_plus,
      ctr_45_plus,
      ctr_under_45,
      cpc_45_plus,
      cpc_under_45,
      media_sample_confidence_45_plus,
      media_sample_confidence_under_45
    };

    return {
      period,
      mode: isDemo ? 'demo' : 'real',
      generated_at: new Date().toISOString(),
      time_window: {
        start_date: startDateMeta,
        end_date: endDateMeta,
        time_zone: COMMERCIAL_TIMEZONE
      },
      summary: {
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_reach: summarySlice.reach,
        total_clicks: totalClicks,
        total_link_clicks: summarySlice.link_clicks,
        ctr: summarySlice.ctr,
        cpc: summarySlice.cpc,
        cpm: summarySlice.cpm,
        media_sample_confidence: summarySlice.media_sample_confidence
      },
      cohorts: {
        under_45: under45Slice,
        age_45_plus: age45PlusSlice,
        unknown: unknownSlice
      },
      by_age: byAge,
      by_gender: byGender,
      by_ad: byAd,
      hypothesis_45_plus
    };
  }
}
