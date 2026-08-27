import crypto from 'crypto';

export interface MetaConnectionStatus {
  connected: boolean;
  environment: 'REAL' | 'DEMO';
  isConfigured: boolean;
  adAccountIdMasked: string | null;
  metaUserId?: string;
  metaUserName?: string;
  adAccountName?: string;
  currency?: string;
  timezone?: string;
  accountStatus?: number;
  lastValidatedAt?: string;
  tokenExpirationStatus?: string;
  error?: string;
}

export interface MetaAdAccountPayload {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}

export interface MetaCampaignPayload {
  id: string;
  name: string;
  objective?: string;
  status: string;
  effective_status: string;
  account_id: string;
}

export interface MetaAdSetPayload {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  optimization_goal?: string;
  billing_event?: string;
  daily_budget?: number;
  lifetime_budget?: number;
}

export interface MetaAdPayload {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  effective_status: string;
  creative?: { id: string };
}

export interface MetaInsightPayload {
  entity_level: 'ACCOUNT' | 'CAMPAIGN' | 'ADSET' | 'AD';
  entity_meta_id: string;
  campaign_meta_id?: string;
  adset_meta_id?: string;
  ad_meta_id?: string;
  date_start: string;
  date_stop: string;
  spend: number;
  impressions: number;
  reach?: number;
  clicks: number;
  link_clicks?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  frequency?: number;
  raw_actions?: any[] | null;
}

export class MetaClient {
  private apiVersion: string;
  private accessToken?: string;
  private adAccountId?: string;
  private appId?: string;
  private appSecret?: string;

  constructor(explicitVersion?: string) {
    const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';
    const isProdOrStaging = appEnv === 'production' || appEnv === 'staging';

    const rawVersion = explicitVersion || process.env.META_API_VERSION;

    if (isProdOrStaging && !rawVersion) {
      throw new Error('[META INTEGRATION ERROR]: META_API_VERSION is strictly required in staging/production environment.');
    }

    const versionToUse = rawVersion || 'v26.0';
    const versionRegex = /^v\d+\.\d+$/;

    if (!versionRegex.test(versionToUse)) {
      throw new Error(`[META CONFIG ERROR]: Invalid META_API_VERSION format "${versionToUse}". Expected format like "v26.0".`);
    }

    this.apiVersion = versionToUse;
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.adAccountId = process.env.META_AD_ACCOUNT_ID;
    this.appId = process.env.META_APP_ID;
    this.appSecret = process.env.META_APP_SECRET;
  }

  public getApiVersion(): string {
    return this.apiVersion;
  }

  public maskSecret(secret?: string): string {
    if (!secret || secret.length < 8) return '****';
    return secret.slice(0, 4) + '...' + secret.slice(-4);
  }

  public maskAccountId(id?: string): string | null {
    if (!id) return null;
    const clean = id.startsWith('act_') ? id.slice(4) : id;
    if (clean.length < 4) return 'act_****';
    return 'act_...' + clean.slice(-4);
  }

  // Pure Read-Only Request Guard
  private async fetchGraphApi(endpoint: string, params: Record<string, any> = {}, method: string = 'GET'): Promise<any> {
    if (method.toUpperCase() !== 'GET') {
      throw new Error('[SECURITY ERROR]: Meta client Phase A is strictly READ-ONLY. Mutating operations are disallowed.');
    }

    if (!this.accessToken) {
      throw new Error('[META ERROR]: Missing META_ACCESS_TOKEN configuration.');
    }

    const url = new URL(`https://graph.facebook.com/${this.apiVersion}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
    }
    url.searchParams.append('access_token', this.accessToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s bounded timeout

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NORQVA-Meta-Client/1.0'
        },
        signal: controller.signal
      });

      const data: any = await res.json();

      if (!res.ok) {
        const msg = data?.error?.message || `Meta API returned HTTP ${res.status}`;
        const code = data?.error?.code;
        const subcode = data?.error?.error_subcode;
        throw new Error(`[META API ERROR ${code || res.status}]: ${msg}` + (subcode ? ` (subcode ${subcode})` : ''));
      }

      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('[META TIMEOUT ERROR]: Graph API request timed out after 10000ms.');
      }
      // Guarantee token is never in exception string
      const sanitized = err.message ? err.message.replace(new RegExp(this.accessToken, 'g'), '[REDACTED]') : 'Unknown Meta API error';
      throw new Error(sanitized);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Safe cursor pagination with domain validation and max page guard
  private async paginateGraphApi(initialEndpoint: string, params: Record<string, any> = {}, maxPages: number = 50): Promise<any[]> {
    const allData: any[] = [];
    let currentEndpoint: string | null = initialEndpoint;
    let currentParams: Record<string, any> = { ...params };
    let pageCount = 0;
    const seenCursors = new Set<string>();

    while (currentEndpoint && pageCount < maxPages) {
      pageCount++;
      const res = await this.fetchGraphApi(currentEndpoint, currentParams);
      if (res && Array.isArray(res.data)) {
        allData.push(...res.data);
      }

      const nextUrl = res?.paging?.next;
      const afterCursor = res?.paging?.cursors?.after;

      if (!nextUrl || (afterCursor && seenCursors.has(afterCursor))) {
        break;
      }

      if (afterCursor) {
        seenCursors.add(afterCursor);
      }

      // Validate nextUrl domain strictly
      try {
        const parsedNext = new URL(nextUrl);
        if (parsedNext.hostname !== 'graph.facebook.com') {
          console.warn('[Meta Pagination Warning]: Blocked next URL with unexpected host:', parsedNext.hostname);
          break;
        }
        currentEndpoint = parsedNext.pathname.replace(new RegExp(`^/(${this.apiVersion}|v[0-9]+\\.[0-9]+)`), '');
        currentParams = Object.fromEntries(parsedNext.searchParams.entries());
        // Clean access_token from params to prevent double append
        delete currentParams['access_token'];
      } catch (e) {
        break;
      }
    }

    return allData;
  }

  // Normalize numeric strings safely
  public normalizeNumeric(val: any, fallback: number = 0): number {
    if (val === null || val === undefined) return fallback;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return isNaN(num) ? fallback : Math.round(num * 10000) / 10000;
  }

  public normalizeInteger(val: any, fallback: number = 0): number {
    if (val === null || val === undefined) return fallback;
    const num = typeof val === 'number' ? val : parseInt(String(val), 10);
    return isNaN(num) ? fallback : num;
  }

  public sanitizeRawActions(raw: any): any[] | null {
    if (!Array.isArray(raw)) return null;
    return raw.slice(0, 100).map(act => ({
      action_type: String(act.action_type || 'unknown').slice(0, 100),
      value: this.normalizeNumeric(act.value, 0)
    }));
  }

  // Connection & Ad Account Validation
  public async validateConnection(isDemo: boolean = false): Promise<MetaConnectionStatus> {
    if (isDemo) {
      return {
        connected: true,
        environment: 'DEMO',
        isConfigured: true,
        adAccountIdMasked: 'act_...DEMO',
        metaUserId: 'demo_user_101',
        metaUserName: 'NORQVA Demo Operator',
        adAccountName: 'NORQVA Demo Sandbox Account',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        accountStatus: 1,
        lastValidatedAt: new Date().toISOString(),
        tokenExpirationStatus: 'ACTIVE'
      };
    }

    if (!this.accessToken) {
      return {
        connected: false,
        environment: 'REAL',
        isConfigured: false,
        adAccountIdMasked: this.maskAccountId(this.adAccountId),
        tokenExpirationStatus: 'MISSING_TOKEN',
        error: 'META_ACCESS_TOKEN is not configured.'
      };
    }

    try {
      // 1. Verify User Profile / Token Validity
      const userRes = await this.fetchGraphApi('/me', { fields: 'id,name' });

      let adAccountName = 'Primary Ad Account';
      let currency = 'BRL';
      let timezone = 'America/Sao_Paulo';
      let accountStatus = 1;

      // 2. If META_AD_ACCOUNT_ID is set, strictly verify access & permissions
      if (this.adAccountId) {
        const formattedActId = this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
        const actRes = await this.fetchGraphApi(`/${formattedActId}`, {
          fields: 'id,name,currency,timezone_name,account_status'
        });

        adAccountName = actRes.name || adAccountName;
        currency = actRes.currency || currency;
        timezone = actRes.timezone_name || timezone;
        accountStatus = actRes.account_status ?? accountStatus;
      }

      return {
        connected: true,
        environment: 'REAL',
        isConfigured: true,
        adAccountIdMasked: this.maskAccountId(this.adAccountId),
        metaUserId: userRes.id,
        metaUserName: userRes.name,
        adAccountName,
        currency,
        timezone,
        accountStatus,
        lastValidatedAt: new Date().toISOString(),
        tokenExpirationStatus: 'VALID'
      };
    } catch (err: any) {
      return {
        connected: false,
        environment: 'REAL',
        isConfigured: true,
        adAccountIdMasked: this.maskAccountId(this.adAccountId),
        tokenExpirationStatus: 'INVALID_OR_REVOKED',
        lastValidatedAt: new Date().toISOString(),
        error: err.message || 'Failed to validate Meta connection.'
      };
    }
  }

  // Discovery & Ingestion Methods
  public async getAdAccounts(isDemo: boolean = false): Promise<MetaAdAccountPayload[]> {
    if (isDemo) {
      return [
        {
          id: 'act_demo_12345678',
          name: 'NORQVA Demo Sandbox Account',
          currency: 'BRL',
          timezone_name: 'America/Sao_Paulo',
          account_status: 1
        }
      ];
    }

    if (this.adAccountId) {
      const formatted = this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
      const res = await this.fetchGraphApi(`/${formatted}`, {
        fields: 'id,name,currency,timezone_name,account_status'
      });
      return [{
        id: res.id,
        name: res.name || 'Ad Account',
        currency: res.currency || 'BRL',
        timezone_name: res.timezone_name || 'America/Sao_Paulo',
        account_status: res.account_status ?? 1
      }];
    }

    const data = await this.paginateGraphApi('/me/adaccounts', {
      fields: 'id,name,currency,timezone_name,account_status'
    });

    return data.map(act => ({
      id: act.id,
      name: act.name || 'Ad Account',
      currency: act.currency || 'BRL',
      timezone_name: act.timezone_name || 'America/Sao_Paulo',
      account_status: act.account_status ?? 1
    }));
  }

  public async getCampaigns(adAccountId: string, isDemo: boolean = false): Promise<MetaCampaignPayload[]> {
    if (isDemo) {
      return [
        {
          id: 'cmp_demo_001',
          name: 'NORQVA Intelligence Launch Campaign',
          objective: 'OUTCOME_SALES',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          account_id: adAccountId
        },
        {
          id: 'cmp_demo_002',
          name: 'NORQVA Retargeting Pro',
          objective: 'OUTCOME_TRAFFIC',
          status: 'PAUSED',
          effective_status: 'PAUSED',
          account_id: adAccountId
        }
      ];
    }

    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const data = await this.paginateGraphApi(`/${formatted}/campaigns`, {
      fields: 'id,name,objective,status,effective_status,account_id'
    });

    return data.map(c => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effective_status: c.effective_status,
      account_id: c.account_id
    }));
  }

  public async getAdSets(adAccountId: string, isDemo: boolean = false): Promise<MetaAdSetPayload[]> {
    if (isDemo) {
      return [
        {
          id: 'adset_demo_001',
          name: 'Conjunto Brasil - Interesses Tech 25-45',
          campaign_id: 'cmp_demo_001',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          daily_budget: 150.00
        }
      ];
    }

    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const data = await this.paginateGraphApi(`/${formatted}/adsets`, {
      fields: 'id,name,campaign_id,status,effective_status,optimization_goal,billing_event,daily_budget,lifetime_budget'
    });

    return data.map(s => ({
      id: s.id,
      name: s.name,
      campaign_id: s.campaign_id,
      status: s.status,
      effective_status: s.effective_status,
      optimization_goal: s.optimization_goal,
      billing_event: s.billing_event,
      daily_budget: s.daily_budget ? parseFloat(s.daily_budget) / 100 : undefined,
      lifetime_budget: s.lifetime_budget ? parseFloat(s.lifetime_budget) / 100 : undefined
    }));
  }

  public async getAds(adAccountId: string, isDemo: boolean = false): Promise<MetaAdPayload[]> {
    if (isDemo) {
      return [
        {
          id: 'ad_demo_001',
          name: 'Anúncio Vídeo Pitch V1',
          adset_id: 'adset_demo_001',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          creative: { id: 'crt_meta_001' }
        }
      ];
    }

    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const data = await this.paginateGraphApi(`/${formatted}/ads`, {
      fields: 'id,name,adset_id,status,effective_status,creative'
    });

    return data.map(a => ({
      id: a.id,
      name: a.name,
      adset_id: a.adset_id,
      status: a.status,
      effective_status: a.effective_status,
      creative: a.creative ? { id: a.creative.id } : undefined
    }));
  }

  public async getInsights(
    adAccountId: string,
    level: 'account' | 'campaign' | 'adset' | 'ad' = 'campaign',
    datePreset: string = 'last_30d',
    isDemo: boolean = false
  ): Promise<MetaInsightPayload[]> {
    if (isDemo) {
      return [
        {
          entity_level: 'CAMPAIGN',
          entity_meta_id: 'cmp_demo_001',
          campaign_meta_id: 'cmp_demo_001',
          date_start: new Date(Date.now() - 86400000 * 30).toISOString().split('T')[0],
          date_stop: new Date().toISOString().split('T')[0],
          spend: 1450.50,
          impressions: 48500,
          reach: 32400,
          clicks: 1240,
          link_clicks: 980,
          cpc: 1.17,
          cpm: 29.90,
          ctr: 2.56,
          frequency: 1.5,
          raw_actions: [{ action_type: 'link_click', value: 980 }, { action_type: 'landing_page_view', value: 850 }]
        }
      ];
    }

    const formatted = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const data = await this.paginateGraphApi(`/${formatted}/insights`, {
      level,
      date_preset: datePreset,
      fields: 'account_id,campaign_id,adset_id,ad_id,date_start,date_stop,spend,impressions,reach,clicks,cpc,cpm,ctr,frequency,actions,inline_link_clicks'
    });

    return data.map(row => {
      const entity_level = level.toUpperCase() as 'ACCOUNT' | 'CAMPAIGN' | 'ADSET' | 'AD';
      const entity_meta_id = level === 'account' ? row.account_id :
                             level === 'campaign' ? row.campaign_id :
                             level === 'adset' ? row.adset_id : row.ad_id;

      return {
        entity_level,
        entity_meta_id: entity_meta_id || row.account_id,
        campaign_meta_id: row.campaign_id,
        adset_meta_id: row.adset_id,
        ad_meta_id: row.ad_id,
        date_start: row.date_start,
        date_stop: row.date_stop,
        spend: this.normalizeNumeric(row.spend, 0),
        impressions: this.normalizeInteger(row.impressions, 0),
        reach: this.normalizeInteger(row.reach, undefined),
        clicks: this.normalizeInteger(row.clicks, 0),
        link_clicks: this.normalizeInteger(row.inline_link_clicks, undefined),
        cpc: this.normalizeNumeric(row.cpc, undefined),
        cpm: this.normalizeNumeric(row.cpm, undefined),
        ctr: this.normalizeNumeric(row.ctr, undefined),
        frequency: this.normalizeNumeric(row.frequency, undefined),
        raw_actions: this.sanitizeRawActions(row.actions)
      };
    });
  }
}
