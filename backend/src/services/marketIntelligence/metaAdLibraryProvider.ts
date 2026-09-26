import https from 'https';
import {
  MarketDiscoveryProvider,
  DiscoverySearchCriteria,
  DiscoverySearchResult,
  RawAdLibraryPayload,
  NormalizedDiscoveryItem,
  calculateContentHash,
  calculateContentFingerprint
} from './marketDiscoveryProvider';

export class MetaAdLibraryProvider implements MarketDiscoveryProvider {
  public readonly providerId = 'META_AD_LIBRARY';
  public readonly providerName = 'Meta Ad Library (Official API)';
  private apiVersion: string;
  private accessToken: string | null;

  constructor(accessToken?: string, apiVersion: string = 'v20.0') {
    this.accessToken = accessToken || process.env.META_ACCESS_TOKEN || null;
    this.apiVersion = apiVersion;
  }

  public get isOfficialApiSupported(): boolean {
    // Official API access for Brazilian commercial ads is restricted by Meta Policy (requires DSA/EU commercial ads or Political authorization)
    return false;
  }

  public async healthCheck(): Promise<{
    status: 'AVAILABLE' | 'OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED' | 'UNCONFIGURED';
    message: string;
    details?: any;
  }> {
    if (!this.accessToken) {
      return {
        status: 'UNCONFIGURED',
        message: 'Meta Access Token não configurado no ambiente.'
      };
    }

    try {
      const probeRes = await this.executeGraphRequest('/ads_archive', {
        ad_reached_countries: "['BR']",
        ad_type: 'ALL',
        search_terms: 'test',
        limit: '1'
      });

      if (probeRes.error) {
        return {
          status: 'OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED',
          message: 'Acesso oficial à Meta Ad Library API bloqueado para anúncios comerciais no Brasil.',
          details: probeRes.error
        };
      }

      return {
        status: 'AVAILABLE',
        message: 'Meta Ad Library API oficial acessível.'
      };
    } catch (err: any) {
      return {
        status: 'OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED',
        message: `Falha na verificação de acesso oficial: ${err.message}`
      };
    }
  }

  public async searchAds(criteria: DiscoverySearchCriteria): Promise<DiscoverySearchResult> {
    const country = criteria.country || 'BR';
    const limit = Math.min(criteria.limit || 20, 100);

    // Fail-closed policy when executing against official API for unsupported markets
    if (!this.accessToken) {
      throw new Error('[META_AD_LIBRARY_PROVIDER_ERROR]: Access Token não fornecido. Status: UNCONFIGURED.');
    }

    // Attempt official request
    const params: Record<string, string> = {
      ad_reached_countries: `['${country}']`,
      ad_type: criteria.ad_type || 'ALL',
      limit: String(limit),
      fields: [
        'id',
        'page_id',
        'page_name',
        'ad_creation_time',
        'ad_delivery_start_time',
        'ad_delivery_stop_time',
        'ad_snapshot_url',
        'ad_creative_bodies',
        'ad_creative_link_captions',
        'ad_creative_link_descriptions',
        'ad_creative_link_titles',
        'publisher_platforms'
      ].join(',')
    };

    if (criteria.search_term) {
      params.search_terms = criteria.search_term;
    }
    if (criteria.active_status && criteria.active_status !== 'ALL') {
      params.ad_active_status = criteria.active_status;
    }
    if (criteria.page_ids && criteria.page_ids.length > 0) {
      params.search_page_ids = criteria.page_ids.join(',');
    }
    if (criteria.after_cursor) {
      params.after = criteria.after_cursor;
    }

    const response = await this.executeGraphRequest('/ads_archive', params);

    if (response.error) {
      const isAuthOrPermissionError = response.error.code === 190 || response.error.code === 10 || response.error.code === 200;
      throw new Error(
        `[OFFICIAL_AD_LIBRARY_ACCESS_BLOCKED]: Meta API retornou erro (${response.error.code}): ${response.error.message}`
      );
    }

    const rawList: RawAdLibraryPayload[] = response.data || [];
    const normalizedItems = rawList.map(raw => this.normalizeItem(raw, 'OFFICIAL_API'));

    return {
      provider_name: this.providerName,
      search_term: criteria.search_term,
      country,
      query_timestamp: new Date().toISOString(),
      items: normalizedItems,
      total_count: normalizedItems.length,
      has_next_page: Boolean(response.paging?.next),
      next_cursor: response.paging?.cursors?.after || null,
      raw_payloads: rawList
    };
  }

  public normalizeItem(
    raw: RawAdLibraryPayload,
    captureMethod: 'OPERATOR_ASSISTED' | 'MANUAL_AUDIT' | 'OFFICIAL_API' = 'OFFICIAL_API'
  ): NormalizedDiscoveryItem {
    if (!raw.id || raw.id.trim() === '') {
      throw new Error('[NORMALIZATION_ERROR]: Raw payload must have a valid non-empty id.');
    }

    const adLibraryId = String(raw.id).trim();
    const pageId = String(raw.page_id || raw.publisher_page_id || 'UNKNOWN_PAGE').trim();
    const pageName = String(raw.page_name || raw.advertiser_name || 'Anunciante Não Identificado').trim();

    const primaryText = raw.ad_creative_bodies && raw.ad_creative_bodies.length > 0
      ? raw.ad_creative_bodies[0]
      : (raw.primary_text || null);

    const headline = raw.ad_creative_link_titles && raw.ad_creative_link_titles.length > 0
      ? raw.ad_creative_link_titles[0]
      : (raw.headline || null);

    const description = raw.ad_creative_link_descriptions && raw.ad_creative_link_descriptions.length > 0
      ? raw.ad_creative_link_descriptions[0]
      : (raw.description || null);

    const cta = raw.cta_text || raw.cta || null;
    const destinationUrl = raw.destination_url || raw.ad_creative_link_captions?.[0] || null;

    const startDate = raw.ad_delivery_start_time || raw.ad_creation_time || null;
    const formattedStartDate = startDate ? startDate.substring(0, 10) : null;
    const endDate = raw.ad_delivery_stop_time ? raw.ad_delivery_stop_time.substring(0, 10) : null;

    const activeStatus = raw.ad_delivery_stop_time
      ? 'INACTIVE'
      : (raw.active_status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE');

    const platforms = Array.isArray(raw.publisher_platforms)
      ? raw.publisher_platforms
      : (raw.platforms || ['FACEBOOK', 'INSTAGRAM']);

    const snapshotUrl = raw.ad_snapshot_url || null;

    // Determine observed creative type without AI inference
    let creativeType: 'VIDEO' | 'IMAGE' | 'CAROUSEL' | 'TEXT_ONLY' = 'IMAGE';
    if (raw.media_type) {
      creativeType = raw.media_type;
    } else if (raw.is_video || raw.video_url) {
      creativeType = 'VIDEO';
    } else if (raw.carousel_cards && raw.carousel_cards.length > 1) {
      creativeType = 'CAROUSEL';
    } else if (!primaryText && !headline && snapshotUrl) {
      creativeType = 'IMAGE';
    } else if (!snapshotUrl && primaryText) {
      creativeType = 'TEXT_ONLY';
    }

    const contentHash = calculateContentHash(raw);
    const contentFingerprint = calculateContentFingerprint({
      primary_text: primaryText,
      headline,
      description,
      cta,
      destination_url: destinationUrl
    });

    const now = new Date();
    const observedDateStr = now.toISOString().substring(0, 10);

    // Create offer ONLY if explicit destination_url is identifiable
    let offer: any = null;
    if (destinationUrl && destinationUrl.startsWith('http')) {
      offer = {
        offer_name: headline || pageName,
        offer_category: 'DIGITAL_PRODUCT',
        destination_url: destinationUrl,
        observed_price: raw.observed_price ? Number(raw.observed_price) : null,
        currency: 'BRL',
        offer_type: 'DIGITAL_PRODUCT'
      };
    }

    return {
      evidence: {
        source_type: 'META_AD_LIBRARY_WEB',
        source_url: snapshotUrl || `https://www.facebook.com/ads/library/?id=${adLibraryId}`,
        capture_method: captureMethod,
        content_hash: contentHash,
        captured_payload: raw,
        observed_at: now
      },
      advertiser: {
        page_id: pageId,
        page_name: pageName,
        country: 'BR',
        is_active: true
      },
      ad: {
        ad_library_id: adLibraryId,
        primary_text: primaryText,
        headline,
        description,
        cta,
        ad_start_date: formattedStartDate,
        ad_end_date: endDate,
        active_status: activeStatus,
        publisher_platforms: platforms,
        snapshot_url: snapshotUrl,
        destination_url: destinationUrl,
        multiple_versions_observed: false
      },
      observation: {
        observed_date: observedDateStr,
        observed_status: activeStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        content_fingerprint: contentFingerprint,
        content_changed: false,
        change_fields: ['INITIAL_CAPTURE']
      },
      creative: {
        creative_type: creativeType,
        aspect_ratio: '9:16',
        duration_seconds: null,
        asset_reference: snapshotUrl,
        hook_text: null,
        hook_visual: null,
        angle: null,
        promise: null,
        pain_point: null,
        desire: null,
        mechanism: null,
        cta_type: null,
        classifications: {
          capture_provenance: 'OBSERVED_RAW_PAYLOAD',
          ai_classified: false
        }
      },
      offer
    };
  }

  private executeGraphRequest(endpoint: string, params: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams({
        access_token: this.accessToken || '',
        ...params
      }).toString();

      const url = `https://graph.facebook.com/${this.apiVersion}${endpoint}?${qs}`;
      const parsed = new URL(url);

      const req = https.request({
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'NORQVA-Market-Intelligence/1.0'
        },
        timeout: 15000
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ error: { message: `Invalid JSON from Graph API: ${body}` } });
          }
        });
      });

      req.on('error', err => resolve({ error: { message: err.message } }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: { message: 'Timeout calling Meta Graph API' } });
      });
      req.end();
    });
  }
}
