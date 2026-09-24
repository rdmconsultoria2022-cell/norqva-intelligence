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

export type ConfidenceGrade = 'OBSERVING' | 'LEARNING' | 'CONFIDENT';
export type ConfidenceReason = 'INSUFFICIENT_CLICKS' | 'INSUFFICIENT_PURCHASES' | 'LEARNING_SAMPLE' | 'SUFFICIENT_SAMPLE';

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
  confidence: ConfidenceGrade;
  confidence_reason: ConfidenceReason;
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

export interface CreativePerformanceData {
  summary: CreativePerformanceSummary;
  creatives: CreativeItemPerformance[];
  unattributed: UnattributedSummary;
  dataFreshness: DataFreshness;
}

export type PeriodFilterOption = 'today' | '7d' | '30d' | 'custom';
