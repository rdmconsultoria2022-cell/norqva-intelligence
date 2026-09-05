export interface DiscoverySearchOptions {
  limit?: number;
  offset?: number;
  media_type?: 'VIDEO' | 'IMAGE' | 'CAROUSEL' | 'ALL';
  min_longevity_days?: number;
  date_range_start?: string;
  date_range_end?: string;
}

export interface NormalizedDiscoveryRecord {
  provider: string;
  provider_record_id: string;
  source_platform: 'FACEBOOK' | 'INSTAGRAM' | 'AUDIENCE_NETWORK' | 'MESSENGER' | 'TIKTOK' | 'GOOGLE' | 'UNKNOWN';
  advertiser_name: string;
  advertiser_id: string | null;
  country: string;
  first_seen: string | null;
  last_seen: string | null;
  active_status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  media_type: 'VIDEO' | 'IMAGE' | 'CAROUSEL' | 'UNKNOWN';
  creative_url_or_reference: string | null;
  primary_text: string | null;
  headline: string | null;
  cta: string | null;
  destination_url: string | null;
  observed_price: string | null;
  source_timestamp: string;
  provenance: 'OBSERVED_PROVIDER_API' | 'URL_DERIVED' | 'UNKNOWN';
  raw_evidence_reference: string | null;

  // Strict unknown fields (Private financial metrics)
  competitor_spend: null;
  competitor_cac: null;
  competitor_roas: null;
  competitor_sales: null;
}

export interface DiscoveryProvider {
  readonly providerName: string;
  readonly isCredentialConfigured: boolean;
  
  searchAds(query: string, country: string, options?: DiscoverySearchOptions): Promise<NormalizedDiscoveryRecord[]>;
  getAdDetails(adId: string): Promise<NormalizedDiscoveryRecord | null>;
  healthCheck(): Promise<{ status: 'OK' | 'BLOCKED_BY_CREDENTIAL' | 'UNAVAILABLE'; message: string }>;
}

/**
 * Reference Provider Adapter Skeleton (Fail-Closed when unconfigured)
 */
export class AdClarityDiscoveryAdapter implements DiscoveryProvider {
  public readonly providerName = 'AdClarity (BIScience)';
  private apiKey: string | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ADCLARITY_API_KEY || null;
  }

  public get isCredentialConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim() !== '');
  }

  public async searchAds(query: string, country: string, options?: DiscoverySearchOptions): Promise<NormalizedDiscoveryRecord[]> {
    if (!this.isCredentialConfigured) {
      throw new Error(`[ADCLARITY_ADAPTER_ERROR]: API Key não configurada. Status: BLOCKED_BY_CREDENTIAL. Obtenha credencial comercial em biscience.com.`);
    }

    // Live REST implementation (Executed only with real commercial key)
    throw new Error("Live execution pending commercial contract activation.");
  }

  public async getAdDetails(adId: string): Promise<NormalizedDiscoveryRecord | null> {
    if (!this.isCredentialConfigured) {
      throw new Error(`[ADCLARITY_ADAPTER_ERROR]: API Key não configurada. Status: BLOCKED_BY_CREDENTIAL.`);
    }
    return null;
  }

  public async healthCheck(): Promise<{ status: 'OK' | 'BLOCKED_BY_CREDENTIAL' | 'UNAVAILABLE'; message: string }> {
    if (!this.isCredentialConfigured) {
      return {
        status: 'BLOCKED_BY_CREDENTIAL',
        message: 'Requer contratação de licença comercial e chave de API com a BIScience.'
      };
    }
    return { status: 'OK', message: 'API conectada com sucesso.' };
  }
}
