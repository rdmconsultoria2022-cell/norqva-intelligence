export type MediaSampleConfidence = 'NO_DATA' | 'OBSERVING' | 'LEARNING' | 'SUFFICIENT_MEDIA_SAMPLE';

export type DemographicPeriodOption = 'today' | 'yesterday' | '7d' | '30d' | '90d';

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

export interface DemographicAnalyticsData {
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
