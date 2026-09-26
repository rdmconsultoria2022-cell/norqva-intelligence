import crypto from 'crypto';

export interface DiscoverySearchCriteria {
  search_term?: string;
  country?: string; // Default: 'BR'
  ad_type?: 'ALL' | 'POLITICAL_AND_ISSUE_ADS';
  active_status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  page_ids?: string[];
  limit?: number; // Maximum per page (default 20, max 100)
  after_cursor?: string;
}

export interface RawAdLibraryPayload {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creation_time?: string;
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  publisher_platforms?: string[];
  destination_url?: string;
  cta_text?: string;
  media_type?: 'VIDEO' | 'IMAGE' | 'CAROUSEL' | 'TEXT_ONLY';
  [key: string]: any;
}

export interface NormalizedMarketEvidence {
  source_type: string;
  source_url: string;
  capture_method: 'OPERATOR_ASSISTED' | 'MANUAL_AUDIT' | 'OFFICIAL_API';
  content_hash: string;
  captured_payload: any;
  observed_at: Date;
}

export interface NormalizedMarketAdvertiser {
  page_id: string;
  page_name: string;
  page_url?: string | null;
  country: string;
  category?: string | null;
  is_active: boolean;
}

export interface NormalizedMarketAd {
  ad_library_id: string;
  primary_text: string | null;
  headline: string | null;
  description: string | null;
  cta: string | null;
  ad_start_date: string | null;
  ad_end_date: string | null;
  active_status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  publisher_platforms: string[];
  snapshot_url: string | null;
  destination_url: string | null;
  multiple_versions_observed: boolean;
}

export interface NormalizedMarketObservation {
  observed_date: string; // YYYY-MM-DD
  observed_status: 'ACTIVE' | 'INACTIVE';
  content_fingerprint: string;
  content_changed: boolean;
  change_fields: string[];
}

export interface NormalizedMarketCreative {
  creative_type: 'VIDEO' | 'IMAGE' | 'CAROUSEL' | 'TEXT_ONLY';
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  asset_reference?: string | null;
  hook_text: null;
  hook_visual: null;
  angle: null;
  promise: null;
  pain_point: null;
  desire: null;
  mechanism: null;
  cta_type: null;
  classifications: Record<string, any>;
}

export interface NormalizedMarketOffer {
  offer_name: string;
  offer_category: string;
  destination_url: string;
  observed_price: number | null;
  currency: string;
  offer_type: 'DIGITAL_PRODUCT' | 'EBOOK' | 'COURSE' | 'COMMUNITY' | 'SOFTWARE' | 'BUNDLE' | 'PHYSICAL' | 'OTHER';
}

export interface NormalizedDiscoveryItem {
  evidence: NormalizedMarketEvidence;
  advertiser: NormalizedMarketAdvertiser;
  ad: NormalizedMarketAd;
  observation: NormalizedMarketObservation;
  creative?: NormalizedMarketCreative;
  offer?: NormalizedMarketOffer | null;
}

export interface DiscoverySearchResult {
  provider_name: string;
  search_term?: string;
  country: string;
  query_timestamp: string;
  items: NormalizedDiscoveryItem[];
  total_count: number;
  has_next_page: boolean;
  next_cursor?: string | null;
  raw_payloads: RawAdLibraryPayload[];
}

/**
 * Computes deterministic canonical SHA-256 hash for raw capture payload.
 */
export function calculateContentHash(payload: any): string {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

/**
 * Computes deterministic content fingerprint for copy & offer change detection.
 */
export function calculateContentFingerprint(fields: {
  primary_text?: string | null;
  headline?: string | null;
  description?: string | null;
  cta?: string | null;
  destination_url?: string | null;
}): string {
  const normalized = [
    (fields.primary_text || '').trim(),
    (fields.headline || '').trim(),
    (fields.description || '').trim(),
    (fields.cta || '').trim().toUpperCase(),
    (fields.destination_url || '').trim()
  ].join('|||');

  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export interface MarketDiscoveryProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly isOfficialApiSupported: boolean;

  searchAds(criteria: DiscoverySearchCriteria): Promise<DiscoverySearchResult>;
  normalizeItem(raw: RawAdLibraryPayload, captureMethod?: 'OPERATOR_ASSISTED' | 'MANUAL_AUDIT' | 'OFFICIAL_API'): NormalizedDiscoveryItem;
  healthCheck(): Promise<{
    status: 'AVAILABLE' | 'OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED' | 'UNCONFIGURED';
    message: string;
    details?: any;
  }>;
}
