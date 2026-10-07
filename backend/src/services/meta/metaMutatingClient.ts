import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';

export const OFFICIAL_NORQVA_PIXEL_ID = '1049452567443586';
// Portfólio empresarial "Norqva" da operação (D-0009): dono da conta de anúncios, do app e do usuário
// de sistema NORQVA_Backend. META_BUSINESS_ID no ambiente tem prioridade.
export const NORQVA_BUSINESS_ID = '1361471345973932';
export function getMetaBusinessId(): string {
  const v = String(process.env.META_BUSINESS_ID || '').trim();
  return /^[0-9]{5,30}$/.test(v) ? v : NORQVA_BUSINESS_ID;
}
export const PUBLIC_COMMERCE_URL_REGEX = /^https:\/\/norqva-intelligence-frontend\.vercel\.app\/p\/[A-Za-z0-9_-]+(\?.*)?$/;

// NORQVA-0019: domínios de marca verificados que também servem a página pública da oferta
// (https://<host>/p/:humanId). Lista configurável; só hosts exatos, sem curingas.
export const DEFAULT_BRAND_DESTINATION_HOSTS = ['trattoria.norqva.com.br'];
export function getBrandDestinationHosts(): string[] {
  const raw = process.env.META_BRAND_DESTINATION_HOSTS;
  const list = (raw === undefined || raw.trim() === '' ? DEFAULT_BRAND_DESTINATION_HOSTS : raw.split(','))
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h));
  return Array.from(new Set(list));
}
export function isBrandDestinationUrl(url: string): boolean {
  return getBrandDestinationHosts().some((host) =>
    new RegExp(`^https:\\/\\/${host.replace(/[.-]/g, (c) => `\\${c}`)}\\/p\\/[A-Za-z0-9_-]+(\\?.*)?$`).test(url)
  );
}

export interface MetaPreflightStatus {
  tokenValid: boolean;
  adsRead: boolean;
  adsManagement: boolean;
  adAccountAccess: boolean;
  pixelAccess: boolean;
  metaMutationCredentialReady: boolean;
}

export interface MetaMutatingSecurityContext {
  userId: string;
  userRole: string;
  decisionId?: string;
  experimentId?: string;
  isDemo: boolean;
  idempotencyKey?: string;
  preflightOverrideForTesting?: MetaPreflightStatus;
}

export interface CreateCampaignParams {
  name: string;
  objective: 'OUTCOME_SALES' | 'OUTCOME_TRAFFIC' | 'OUTCOME_ENGAGEMENT';
  status?: 'PAUSED' | 'ACTIVE';
  dailyBudget?: number;
}

export interface CreateAdSetParams {
  campaignId: string;
  name: string;
  dailyBudget: number;
  pixelId?: string;
  customEventType?: 'PURCHASE' | 'INITIATE_CHECKOUT';
  optimizationGoal?: 'OFFSITE_CONVERSIONS' | 'LINK_CLICKS';
  status?: 'PAUSED' | 'ACTIVE';
  targeting?: Record<string, any>;
}

export interface CreateAdCreativeParams {
  name: string;
  title: string;
  body: string;
  destinationUrl: string;
  callToAction: string;
  imageHash?: string;
  videoId?: string;
  /** NORQVA-0019: thumbnail of a video creative (video_data.image_url). */
  thumbnailUrl?: string;
  pageId?: string;
  instagramActorId?: string;
  /** NORQVA-0019: Instagram account used by the ad (object_story_spec.instagram_user_id). */
  instagramUserId?: string;
  /** NORQVA-0019: tracking parameters appended by Meta to the destination (creative url_tags). */
  urlTags?: string;
}

export interface CreateAdParams {
  adsetId: string;
  creativeId: string;
  name: string;
  status?: 'PAUSED' | 'ACTIVE';
}

export interface MetaMutationResult {
  id: string;
  entityType: 'CAMPAIGN' | 'ADSET' | 'ADCREATIVE' | 'AD';
  name: string;
  status: string;
  externalId: string;
  createdAt: string;
  idempotentReplay?: boolean;
}

export type MetaTransportPostFunction = (
  endpoint: string,
  payload: Record<string, any>
) => Promise<{ id: string; [key: string]: any }>;

export type MetaTransportGetFunction = (
  endpoint: string,
  params: Record<string, string>
) => Promise<any>;

export interface PreflightOptions {
  // Campaign control (status/budget) does not touch the pixel; creation flows do.
  requirePixel?: boolean;
}

// NORQVA-0006: limits for budget changes made from NORQVA (BRL/day).
export const META_MIN_DAILY_BUDGET_BRL = 5;
export function getMaxDailyBudgetBRL(): number {
  const raw = Number(process.env.META_MAX_DAILY_BUDGET_BRL);
  return Number.isFinite(raw) && raw >= META_MIN_DAILY_BUDGET_BRL ? raw : 100;
}

const PREFLIGHT_OK_TTL_MS = 5 * 60 * 1000;
const PREFLIGHT_FAIL_TTL_MS = 30 * 1000;
let preflightCache: { status: MetaPreflightStatus; expiresAt: number } | null = null;
export function resetMetaPreflightCacheForTesting() {
  preflightCache = null;
}

/**
 * NORQVA-0019: anunciante/pagador verificados exigidos pela Meta para conjuntos novos com público no
 * Brasil (erro 100/3858634, campo compliance_section). A API não herda o "anunciante e pagador padrão"
 * da tela de configurações; o conjunto precisa enviar `regional_regulation_identities`.
 * IDs vêm de META_ADVERTISER_BENEFICIARY_ID / META_ADVERTISER_PAYER_ID (IDs de entidade verificada,
 * não são segredo). Opcional: META_REGIONAL_REGULATED_CATEGORIES (lista numérica separada por vírgula).
 * Sem as variáveis, nada é adicionado (comportamento anterior).
 */
export function advertiserIdentityParams(env: Record<string, string | undefined> = process.env): Record<string, any> {
  const id = (v: string | undefined) => {
    const s = String(v || '').trim();
    if (!s) return null;
    if (!/^\d{5,25}$/.test(s)) throw new Error('[META CONFIG EXCEPTION]: META_ADVERTISER_BENEFICIARY_ID/META_ADVERTISER_PAYER_ID must be numeric Meta IDs.');
    return s;
  };
  const beneficiary = id(env.META_ADVERTISER_BENEFICIARY_ID);
  const payer = id(env.META_ADVERTISER_PAYER_ID) || beneficiary;
  if (!beneficiary) return {};
  const out: Record<string, any> = { regional_regulation_identities: { universal_beneficiary: beneficiary, universal_payer: payer } };
  const cats = String(env.META_REGIONAL_REGULATED_CATEGORIES || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (cats.length) {
    if (cats.some((c) => !/^\d{1,3}$/.test(c))) throw new Error('[META CONFIG EXCEPTION]: META_REGIONAL_REGULATED_CATEGORIES must be numeric codes.');
    out.regional_regulated_categories = cats;
  }
  return out;
}

export class MetaMutatingClient {
  private apiVersion: string;
  private accessToken?: string;
  private adAccountId?: string;
  private transportPost?: MetaTransportPostFunction;
  private transportGet?: MetaTransportGetFunction;

  constructor(customTransport?: MetaTransportPostFunction, explicitVersion?: string, customGet?: MetaTransportGetFunction) {
    this.apiVersion = explicitVersion || process.env.META_API_VERSION || 'v26.0';
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.adAccountId = process.env.META_AD_ACCOUNT_ID;
    this.transportPost = customTransport;
    this.transportGet = customGet;
  }

  // =========================================================================
  // MULTI-LAYER FAIL-CLOSED SECURITY GUARDS
  // =========================================================================

  /**
   * 1. Feature Flag & Pre-flight Guard (Fail-Closed)
   */
  public async assertFeatureFlagAndPreflight(context: MetaMutatingSecurityContext, options: PreflightOptions = {}): Promise<void> {
    const isFeatureFlagEnabled = process.env.META_MUTATION_ENABLED === 'true';
    if (!isFeatureFlagEnabled) {
      throw new Error('[SECURITY EXCEPTION]: BLOCKED_BY_META_WRITE_SAFETY_HOLD: Meta mutating operations are strictly disabled by feature flag (META_MUTATION_ENABLED is not true).');
    }

    if (context.isDemo) {
      return;
    }

    const preflight = context.preflightOverrideForTesting || (await this.getLivePreflightStatus());
    const failedChecks = MetaMutatingClient.failedPreflightChecks(preflight, options);

    if (failedChecks.length > 0) {
      throw new Error(`[SECURITY EXCEPTION]: BLOCKED_BY_META_WRITE_SAFETY_HOLD: Credential pre-flight checks failed (${failedChecks.join(', ')}).`);
    }
  }

  public static failedPreflightChecks(preflight: MetaPreflightStatus, options: PreflightOptions = {}): string[] {
    const requirePixel = options.requirePixel !== false;
    const failed: string[] = [];
    if (!preflight.tokenValid) failed.push('TOKEN_VALID');
    if (!preflight.adsRead) failed.push('ADS_READ');
    if (!preflight.adsManagement) failed.push('ADS_MANAGEMENT');
    if (!preflight.adAccountAccess) failed.push('AD_ACCOUNT_ACCESS');
    if (requirePixel && !preflight.pixelAccess) failed.push('PIXEL_ACCESS');
    if (!preflight.metaMutationCredentialReady) failed.push('META_MUTATION_CREDENTIAL_READY');
    return failed;
  }

  /**
   * NORQVA-0006: real credential check against the Graph API (read-only calls), cached.
   * Fail-closed: any error leaves the corresponding check false.
   */
  public async getLivePreflightStatus(forceRefresh = false): Promise<MetaPreflightStatus> {
    const now = Date.now();
    if (!forceRefresh && preflightCache && preflightCache.expiresAt > now) {
      return preflightCache.status;
    }

    const status: MetaPreflightStatus = {
      tokenValid: false,
      adsRead: false,
      adsManagement: false,
      adAccountAccess: false,
      pixelAccess: false,
      metaMutationCredentialReady: false
    };

    if ((this.accessToken || this.transportGet) && this.adAccountId) {
      try {
        const me = await this.callTransportGet('/me', { fields: 'id' });
        status.tokenValid = !!me?.id;
      } catch {
        status.tokenValid = false;
      }

      if (status.tokenValid) {
        try {
          const perms = await this.callTransportGet('/me/permissions', {});
          const granted = new Set(
            (Array.isArray(perms?.data) ? perms.data : [])
              .filter((p: any) => p?.status === 'granted')
              .map((p: any) => String(p.permission))
          );
          status.adsManagement = granted.has('ads_management');
          status.adsRead = granted.has('ads_read') || status.adsManagement;
        } catch {
          // leave false
        }

        try {
          const act = this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
          const acct = await this.callTransportGet(`/${act}`, { fields: 'id,account_status' });
          status.adAccountAccess = !!acct?.id;
        } catch {
          // leave false
        }

        try {
          const pixel = await this.callTransportGet(`/${OFFICIAL_NORQVA_PIXEL_ID}`, { fields: 'id' });
          status.pixelAccess = !!pixel?.id;
        } catch {
          // leave false
        }
      }
    }

    status.metaMutationCredentialReady = status.tokenValid && status.adsManagement && status.adAccountAccess;
    preflightCache = {
      status,
      expiresAt: now + (status.metaMutationCredentialReady ? PREFLIGHT_OK_TTL_MS : PREFLIGHT_FAIL_TTL_MS)
    };
    return status;
  }

  /**
   * 2. Human-In-The-Loop (HITL) Guard
   */
  public async assertHITLApproval(pool: Pool, context: MetaMutatingSecurityContext): Promise<void> {
    if (context.isDemo) {
      return;
    }

    if (!context.decisionId) {
      throw new Error('[SECURITY EXCEPTION]: Human-in-the-loop (HITL) validation failed: Missing mandatory decisionId approval reference.');
    }

    const decisionRes = await pool.query(
      `SELECT d.id, d.status, d.responsible_id, u.role as decider_role
       FROM decisions d
       LEFT JOIN users u ON d.responsible_id = u.id
       WHERE d.id = $1`,
      [context.decisionId]
    );

    if (decisionRes.rows.length === 0) {
      throw new Error(`[SECURITY EXCEPTION]: HITL decision '${context.decisionId}' not found in governance records.`);
    }

    const dec = decisionRes.rows[0];
    const isApproved = dec.status === 'APPROVED' || dec.status === 'APROVADO' || dec.status === 'AUTORIZADO';
    if (!isApproved) {
      throw new Error(`[SECURITY EXCEPTION]: HITL decision '${context.decisionId}' is not approved (current status: ${dec.status}).`);
    }

    if (dec.decider_role !== 'ADMIN') {
      throw new Error(`[SECURITY EXCEPTION]: HITL decision '${context.decisionId}' was not approved by an authorized ADMIN user.`);
    }
  }

  /**
   * 3. Capital at Risk & Budget Protection Guard
   */
  public async assertAndReserveBudget(
    client: PoolClient,
    context: MetaMutatingSecurityContext,
    requestedBudget: number
  ): Promise<void> {
    if (requestedBudget <= 0) {
      throw new Error('[VALIDATION EXCEPTION]: Requested budget must be a positive number.');
    }

    if (!context.experimentId) {
      throw new Error('[SECURITY EXCEPTION]: Missing mandatory experimentId for Capital at Risk tracking.');
    }

    const expRes = await client.query(
      `SELECT id, capital_approved, capital_used, status, is_demo 
       FROM experiments 
       WHERE id = $1 FOR UPDATE`,
      [context.experimentId]
    );

    if (expRes.rows.length === 0) {
      throw new Error(`[VALIDATION EXCEPTION]: Experiment '${context.experimentId}' not found.`);
    }

    const exp = expRes.rows[0];

    if (exp.is_demo !== context.isDemo) {
      throw new Error('[SECURITY EXCEPTION]: Scope mismatch between experiment and execution context (DEMO x REAL).');
    }

    const validStates = ['ATIVO', 'AUTORIZADO', 'PLANEJADO'];
    if (!validStates.includes(exp.status)) {
      throw new Error(`[SECURITY EXCEPTION]: Experiment is not in an executable state (current status: ${exp.status}).`);
    }

    const authorized = parseFloat(exp.capital_approved || 0);
    const used = parseFloat(exp.capital_used || 0);
    const available = authorized - used;

    if (requestedBudget > available) {
      throw new Error(
        `[SECURITY EXCEPTION]: Operation blocked: Requested budget (R$ ${requestedBudget.toFixed(2)}) exceeds available authorized capital (R$ ${available.toFixed(2)} remaining of R$ ${authorized.toFixed(2)}).`
      );
    }

    const newUsed = used + requestedBudget;
    await client.query(
      `UPDATE experiments 
       SET capital_used = $1, status = 'ATIVO' 
       WHERE id = $2`,
      [newUsed, exp.id]
    );
  }

  /**
   * 4. Public Destination URL Whitelist Guard
   */
  public assertUrlWhitelisted(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('[SECURITY EXCEPTION]: Missing or invalid destination URL.');
    }

    if (!PUBLIC_COMMERCE_URL_REGEX.test(url) && !isBrandDestinationUrl(url)) {
      throw new Error(
        `[SECURITY EXCEPTION]: Blocked non-whitelisted destination URL: "${url}". Destination URLs must strictly match public offer entry pattern "https://norqva-intelligence-frontend.vercel.app/p/:humanId" or "https://<verified brand domain>/p/:humanId" (META_BRAND_DESTINATION_HOSTS).`
      );
    }
  }

  /**
   * 5. Ad Account and Pixel Hard-Binding Guard
   */
  public assertAccountAndPixelBinding(targetAccountId?: string, targetPixelId?: string): void {
    const expectedAct = this.adAccountId?.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
    
    if (targetAccountId) {
      const cleanTarget = targetAccountId.startsWith('act_') ? targetAccountId : `act_${targetAccountId}`;
      if (this.adAccountId && cleanTarget !== expectedAct) {
        throw new Error(`[SECURITY EXCEPTION]: Target Ad Account '${cleanTarget}' diverges from configured NORQVA account '${expectedAct}'.`);
      }
    }

    if (targetPixelId && targetPixelId !== OFFICIAL_NORQVA_PIXEL_ID) {
      throw new Error(`[SECURITY EXCEPTION]: Target Pixel '${targetPixelId}' diverges from official NORQVA Pixel '${OFFICIAL_NORQVA_PIXEL_ID}'.`);
    }
  }

  /**
   * 6. DEMO vs REAL Account Divergence Guard
   */
  public assertEnvironmentIsolation(context: MetaMutatingSecurityContext, accountId: string): void {
    const isDemoAccount = accountId.includes('demo');
    if (context.isDemo && !isDemoAccount) {
      throw new Error('[SECURITY EXCEPTION]: DEMO context cannot operate on REAL Ad Account.');
    }
    if (!context.isDemo && isDemoAccount) {
      throw new Error('[SECURITY EXCEPTION]: REAL context cannot operate on DEMO Ad Account.');
    }
  }

  // =========================================================================
  // MUTATING OPERATIONS IMPLEMENTATION
  // =========================================================================

  public async createCampaign(
    pool: Pool,
    params: CreateCampaignParams,
    context: MetaMutatingSecurityContext
  ): Promise<MetaMutationResult> {
    await this.assertFeatureFlagAndPreflight(context);
    await this.assertHITLApproval(pool, context);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (context.idempotencyKey) {
        const dupRes = await client.query(
          'SELECT * FROM meta_campaigns WHERE idempotency_key = $1 AND is_demo = $2',
          [context.idempotencyKey, context.isDemo]
        );
        if (dupRes.rows.length > 0) {
          await client.query('COMMIT');
          return {
            id: dupRes.rows[0].id,
            entityType: 'CAMPAIGN',
            name: dupRes.rows[0].name,
            status: dupRes.rows[0].status,
            externalId: dupRes.rows[0].meta_campaign_id,
            createdAt: dupRes.rows[0].created_at,
            idempotentReplay: true
          };
        }
      }

      if (params.dailyBudget && params.dailyBudget > 0) {
        await this.assertAndReserveBudget(client, context, params.dailyBudget);
      }

      const actId = context.isDemo ? 'act_demo_12345678' : (this.adAccountId || 'act_production');
      this.assertAccountAndPixelBinding(actId);
      this.assertEnvironmentIsolation(context, actId);

      const externalId = context.isDemo
        ? `cmp_demo_${crypto.randomUUID().slice(0, 8)}`
        : (await this.callTransportPost(`/${actId}/campaigns`, {
            name: params.name,
            objective: params.objective,
            status: params.status || 'PAUSED',
            daily_budget: params.dailyBudget ? Math.round(params.dailyBudget * 100) : undefined
          })).id;

      // Ensure dummy ad account exists for foreign key
      let acctRow = (await client.query('SELECT id FROM meta_ad_accounts WHERE is_demo = $1 LIMIT 1', [context.isDemo])).rows[0];
      if (!acctRow) {
        acctRow = (await client.query(
          `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
           VALUES ($1, 'Default Ad Account', 'BRL', $2)
           ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [actId, context.isDemo]
        )).rows[0];
      }

      const insertRes = await client.query(
        `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, objective, status, effective_status, is_demo, idempotency_key, last_synced_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (meta_campaign_id, is_demo) 
         DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, idempotency_key = EXCLUDED.idempotency_key, updated_at = NOW()
         RETURNING *`,
        [externalId, acctRow.id, params.name, params.objective, params.status || 'PAUSED', context.isDemo, context.idempotencyKey || null]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_CAMPAIGN_CREATED',
        `Created Meta Campaign '${params.name}' (Meta ID: ${externalId}).`,
        null,
        JSON.stringify({ externalId, name: params.name, objective: params.objective }),
        context.isDemo,
        false
      );

      return {
        id: insertRes.rows[0].id,
        entityType: 'CAMPAIGN',
        name: params.name,
        status: params.status || 'PAUSED',
        externalId,
        createdAt: insertRes.rows[0].created_at
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      await writeAuditLog(
        pool,
        context.userId,
        'META_MUTATION_FAILED',
        `Failed to create campaign '${params.name}': ${err.message}`,
        null,
        null,
        context.isDemo,
        false
      );
      throw err;
    } finally {
      client.release();
    }
  }

  public async createAdSet(
    pool: Pool,
    params: CreateAdSetParams,
    context: MetaMutatingSecurityContext
  ): Promise<MetaMutationResult> {
    await this.assertFeatureFlagAndPreflight(context);
    await this.assertHITLApproval(pool, context);

    const pixelId = params.pixelId || OFFICIAL_NORQVA_PIXEL_ID;
    this.assertAccountAndPixelBinding(undefined, pixelId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (context.idempotencyKey) {
        const dupRes = await client.query(
          'SELECT * FROM meta_ad_sets WHERE idempotency_key = $1 AND is_demo = $2',
          [context.idempotencyKey, context.isDemo]
        );
        if (dupRes.rows.length > 0) {
          await client.query('COMMIT');
          return {
            id: dupRes.rows[0].id,
            entityType: 'ADSET',
            name: dupRes.rows[0].name,
            status: dupRes.rows[0].status,
            externalId: dupRes.rows[0].meta_adset_id,
            createdAt: dupRes.rows[0].created_at,
            idempotentReplay: true
          };
        }
      }

      await this.assertAndReserveBudget(client, context, params.dailyBudget);

      const actId = context.isDemo ? 'act_demo_12345678' : (this.adAccountId || 'act_production');
      this.assertEnvironmentIsolation(context, actId);

      const externalId = context.isDemo
        ? `adset_demo_${crypto.randomUUID().slice(0, 8)}`
        : (await this.callTransportPost(`/${actId}/adsets`, {
            campaign_id: params.campaignId,
            name: params.name,
            optimization_goal: params.optimizationGoal || 'OFFSITE_CONVERSIONS',
            billing_event: 'IMPRESSIONS',
            daily_budget: Math.round(params.dailyBudget * 100),
            status: params.status || 'PAUSED',
            promoted_object: {
              pixel_id: pixelId,
              custom_event_type: params.customEventType || 'PURCHASE'
            },
            targeting: params.targeting || { geo_locations: { countries: ['BR'] } }
          })).id;

      // Ensure campaign exists in DB
      let cmpDbId = (await client.query('SELECT id FROM meta_campaigns WHERE meta_campaign_id = $1 OR id::text = $1 LIMIT 1', [params.campaignId])).rows[0]?.id;
      if (!cmpDbId) {
        let acctRow = (await client.query('SELECT id FROM meta_ad_accounts WHERE is_demo = $1 LIMIT 1', [context.isDemo])).rows[0];
        if (!acctRow) {
          acctRow = (await client.query(
            `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
             VALUES ($1, 'Default Ad Account', 'BRL', $2)
             ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [actId, context.isDemo]
          )).rows[0];
        }
        cmpDbId = (await client.query(
          `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
           VALUES (gen_random_uuid(), $1, $2, 'Parent Campaign', 'PAUSED', 'PAUSED', $3)
           ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [params.campaignId, acctRow.id, context.isDemo]
        )).rows[0].id;
      }

      const insertRes = await client.query(
        `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, optimization_goal, billing_event, daily_budget, is_demo, idempotency_key, last_synced_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, $5, 'IMPRESSIONS', $6, $7, $8, NOW(), NOW())
         ON CONFLICT (meta_adset_id, is_demo)
         DO UPDATE SET name = EXCLUDED.name, daily_budget = EXCLUDED.daily_budget, status = EXCLUDED.status, updated_at = NOW()
         RETURNING *`,
        [
          externalId,
          cmpDbId,
          params.name,
          params.status || 'PAUSED',
          params.optimizationGoal || 'OFFSITE_CONVERSIONS',
          params.dailyBudget,
          context.isDemo,
          context.idempotencyKey || null
        ]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_ADSET_CREATED',
        `Created Meta AdSet '${params.name}' (Meta ID: ${externalId}, Budget: R$ ${params.dailyBudget.toFixed(2)}).`,
        null,
        JSON.stringify({ externalId, name: params.name, dailyBudget: params.dailyBudget, pixelId }),
        context.isDemo,
        false
      );

      return {
        id: insertRes.rows[0].id,
        entityType: 'ADSET',
        name: params.name,
        status: params.status || 'PAUSED',
        externalId,
        createdAt: insertRes.rows[0].created_at
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      await writeAuditLog(
        pool,
        context.userId,
        'META_MUTATION_FAILED',
        `Failed to create AdSet '${params.name}': ${err.message}`,
        null,
        null,
        context.isDemo,
        false
      );
      throw err;
    } finally {
      client.release();
    }
  }

  public async createAdCreative(
    pool: Pool,
    params: CreateAdCreativeParams,
    context: MetaMutatingSecurityContext
  ): Promise<MetaMutationResult> {
    await this.assertFeatureFlagAndPreflight(context);
    this.assertUrlWhitelisted(params.destinationUrl);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const configuredAct = this.adAccountId ? (this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`) : '';
      const actId = context.isDemo ? 'act_demo_12345678' : (configuredAct || 'act_production');
      this.assertEnvironmentIsolation(context, actId);

      const externalId = context.isDemo
        ? `crt_demo_${crypto.randomUUID().slice(0, 8)}`
        : (await this.callTransportPost(`/${actId}/adcreatives`, MetaMutatingClient.buildAdCreativePayload(params))).id;

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_ADCREATIVE_CREATED',
        `Created Meta AdCreative '${params.name}' (Meta ID: ${externalId}). Target URL: ${params.destinationUrl}`,
        null,
        JSON.stringify({ externalId, name: params.name, destinationUrl: params.destinationUrl }),
        context.isDemo,
        false
      );

      return {
        id: crypto.randomUUID(),
        entityType: 'ADCREATIVE',
        name: params.name,
        status: 'ACTIVE',
        externalId,
        createdAt: new Date().toISOString()
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Graph payload of an ad creative. Link creative (image/link_data) by default; with `videoId`
   * (NORQVA-0019) a video creative with object_story_spec.video_data. `url_tags` only when given.
   */
  public static buildAdCreativePayload(params: CreateAdCreativeParams): Record<string, any> {
    if (params.urlTags !== undefined) MetaMutatingClient.assertValidUrlTags(params.urlTags);
    const callToAction = {
      type: params.callToAction || 'LEARN_MORE',
      value: { link: params.destinationUrl }
    };
    const objectStorySpec: Record<string, any> = { page_id: params.pageId || 'page_norqva_official' };
    if (params.instagramUserId) objectStorySpec.instagram_user_id = params.instagramUserId;

    if (params.videoId) {
      const videoData: Record<string, any> = {
        video_id: params.videoId,
        message: params.body,
        title: params.title,
        call_to_action: callToAction
      };
      if (params.thumbnailUrl) videoData.image_url = params.thumbnailUrl;
      objectStorySpec.video_data = videoData;
    } else {
      objectStorySpec.link_data = {
        message: params.body,
        link: params.destinationUrl,
        name: params.title,
        call_to_action: callToAction
      };
    }

    const payload: Record<string, any> = { name: params.name, object_story_spec: objectStorySpec };
    if (params.urlTags) payload.url_tags = params.urlTags;
    return payload;
  }

  public static assertValidUrlTags(urlTags: string): void {
    if (typeof urlTags !== 'string' || urlTags.length > 1024 || /[\s#]/.test(urlTags) || urlTags.startsWith('?') || urlTags.includes('://')) {
      throw new Error('[VALIDATION EXCEPTION]: Invalid url_tags (query string without "?", spaces, "#" or URLs).');
    }
  }

  public async createAd(
    pool: Pool,
    params: CreateAdParams,
    context: MetaMutatingSecurityContext
  ): Promise<MetaMutationResult> {
    await this.assertFeatureFlagAndPreflight(context);
    await this.assertHITLApproval(pool, context);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (context.idempotencyKey) {
        const dupRes = await client.query(
          'SELECT * FROM meta_ads WHERE idempotency_key = $1 AND is_demo = $2',
          [context.idempotencyKey, context.isDemo]
        );
        if (dupRes.rows.length > 0) {
          await client.query('COMMIT');
          return {
            id: dupRes.rows[0].id,
            entityType: 'AD',
            name: dupRes.rows[0].name,
            status: dupRes.rows[0].status,
            externalId: dupRes.rows[0].meta_ad_id,
            createdAt: dupRes.rows[0].created_at,
            idempotentReplay: true
          };
        }
      }

      const actId = context.isDemo ? 'act_demo_12345678' : (this.adAccountId || 'act_production');
      this.assertEnvironmentIsolation(context, actId);

      const externalId = context.isDemo
        ? `ad_demo_${crypto.randomUUID().slice(0, 8)}`
        : (await this.callTransportPost(`/${actId}/ads`, {
            name: params.name,
            adset_id: params.adsetId,
            creative: { creative_id: params.creativeId },
            status: params.status || 'PAUSED'
          })).id;

      let setDbId = (await client.query('SELECT id FROM meta_ad_sets WHERE meta_adset_id = $1 OR id::text = $1 LIMIT 1', [params.adsetId])).rows[0]?.id;
      if (!setDbId) {
        const cmpId = (await client.query('SELECT id FROM meta_campaigns WHERE is_demo = $1 LIMIT 1', [context.isDemo])).rows[0]?.id;
        setDbId = (await client.query(
          `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, is_demo)
           VALUES (gen_random_uuid(), $1, $2, 'Parent AdSet', 'PAUSED', 'PAUSED', $3) RETURNING id`,
          [params.adsetId, cmpId, context.isDemo]
        )).rows[0].id;
      }

      const insertRes = await client.query(
        `INSERT INTO meta_ads (id, meta_ad_id, adset_id, name, status, effective_status, meta_creative_id, is_demo, idempotency_key, last_synced_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (meta_ad_id, is_demo)
         DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = NOW()
         RETURNING *`,
        [
          externalId,
          setDbId,
          params.name,
          params.status || 'PAUSED',
          params.creativeId,
          context.isDemo,
          context.idempotencyKey || null
        ]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_AD_CREATED',
        `Created Meta Ad '${params.name}' (Meta ID: ${externalId}).`,
        null,
        JSON.stringify({ externalId, name: params.name, adsetId: params.adsetId }),
        context.isDemo,
        false
      );

      return {
        id: insertRes.rows[0].id,
        entityType: 'AD',
        name: params.name,
        status: params.status || 'PAUSED',
        externalId,
        createdAt: insertRes.rows[0].created_at
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async updateBudget(
    pool: Pool,
    adsetMetaId: string,
    newDailyBudget: number,
    context: MetaMutatingSecurityContext
  ): Promise<{ success: boolean; newDailyBudget: number }> {
    await this.assertFeatureFlagAndPreflight(context);

    if (newDailyBudget <= 0) {
      throw new Error('[VALIDATION EXCEPTION]: Daily budget must be greater than 0.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const setRes = await client.query(
        'SELECT id, daily_budget, is_demo FROM meta_ad_sets WHERE meta_adset_id = $1 OR id::text = $1 FOR UPDATE',
        [adsetMetaId]
      );

      if (setRes.rows.length === 0) {
        throw new Error(`[VALIDATION EXCEPTION]: AdSet '${adsetMetaId}' not found.`);
      }

      const currentBudget = parseFloat(setRes.rows[0].daily_budget || 0);
      const delta = newDailyBudget - currentBudget;

      if (delta > 0) {
        await this.assertAndReserveBudget(client, context, delta);
      }

      if (!context.isDemo) {
        await this.callTransportPost(`/${adsetMetaId}`, {
          daily_budget: Math.round(newDailyBudget * 100)
        });
      }

      await client.query(
        'UPDATE meta_ad_sets SET daily_budget = $1, updated_at = NOW() WHERE id = $2',
        [newDailyBudget, setRes.rows[0].id]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_BUDGET_UPDATED',
        `Updated AdSet '${adsetMetaId}' budget from R$ ${currentBudget.toFixed(2)} to R$ ${newDailyBudget.toFixed(2)}.`,
        String(currentBudget),
        String(newDailyBudget),
        context.isDemo,
        false
      );

      return { success: true, newDailyBudget };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async setEntityStatus(
    pool: Pool,
    entityType: 'CAMPAIGN' | 'ADSET' | 'AD',
    metaEntityId: string,
    newStatus: 'PAUSED' | 'ACTIVE',
    context: MetaMutatingSecurityContext
  ): Promise<{ success: boolean; entityId: string; status: string; previousStatus: string | null; name: string | null }> {
    // Unconditional fail-closed check: No mutation (even pause) can bypass the Global Safety Hold
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });

    if (newStatus !== 'PAUSED' && newStatus !== 'ACTIVE') {
      throw new Error('[VALIDATION EXCEPTION]: Status must be PAUSED or ACTIVE.');
    }

    const { table, idCol } = MetaMutatingClient.entityTable(entityType);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // NORQVA-0006: resolve the row first (by Meta ID or internal UUID, same DEMO/REAL scope)
      // so the Graph call always targets the real Meta ID.
      const rowRes = await client.query(
        `SELECT id, ${idCol} AS meta_id, name, status FROM ${table}
         WHERE (${idCol} = $1 OR id::text = $1) AND is_demo = $2
         LIMIT 1 FOR UPDATE`,
        [metaEntityId, context.isDemo]
      );
      if (rowRes.rows.length === 0) {
        throw new Error(`[VALIDATION EXCEPTION]: ${entityType} '${metaEntityId}' not found. Sync Meta data first.`);
      }
      const row = rowRes.rows[0];

      if (!context.isDemo) {
        await this.callTransportPost(`/${row.meta_id}`, { status: newStatus });
      }

      await client.query(
        `UPDATE ${table} SET status = $1, effective_status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, row.id]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        `META_${entityType}_STATUS_CHANGED`,
        `Set ${entityType} '${row.name}' (${row.meta_id}) status from ${row.status} to ${newStatus}.`,
        row.status || null,
        newStatus,
        context.isDemo,
        false
      );

      return { success: true, entityId: row.meta_id, status: newStatus, previousStatus: row.status || null, name: row.name || null };
    } catch (err: any) {
      await client.query('ROLLBACK');
      await writeAuditLog(
        pool,
        context.userId,
        'META_MUTATION_FAILED',
        `Failed to set ${entityType} '${metaEntityId}' to ${newStatus}: ${err.message}`,
        null,
        null,
        context.isDemo,
        false
      );
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * NORQVA-0006: change the daily budget of a campaign (Advantage+/CBO) or ad set (ABO).
   * Guards: feature flag + live preflight, min R$ 5, ceiling META_MAX_DAILY_BUDGET_BRL (default R$ 100),
   * budget must live at the requested level, audit log on success and failure.
   */
  public async setDailyBudget(
    pool: Pool,
    entityType: 'CAMPAIGN' | 'ADSET',
    metaEntityId: string,
    newDailyBudget: number,
    context: MetaMutatingSecurityContext
  ): Promise<{ success: boolean; entityId: string; previousDailyBudget: number | null; newDailyBudget: number; name: string | null }> {
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });

    if (entityType !== 'CAMPAIGN' && entityType !== 'ADSET') {
      throw new Error('[VALIDATION EXCEPTION]: Budget can only be changed on a campaign or an ad set.');
    }
    const amount = Math.round(Number(newDailyBudget) * 100) / 100;
    const max = getMaxDailyBudgetBRL();
    if (!Number.isFinite(amount) || amount < META_MIN_DAILY_BUDGET_BRL) {
      throw new Error(`[VALIDATION EXCEPTION]: Daily budget must be at least R$ ${META_MIN_DAILY_BUDGET_BRL.toFixed(2)}.`);
    }
    if (amount > max) {
      throw new Error(`[VALIDATION EXCEPTION]: Daily budget R$ ${amount.toFixed(2)} exceeds the NORQVA ceiling of R$ ${max.toFixed(2)} (META_MAX_DAILY_BUDGET_BRL).`);
    }

    const { table, idCol } = MetaMutatingClient.entityTable(entityType);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const rowRes = await client.query(
        entityType === 'CAMPAIGN'
          ? `SELECT id, ${idCol} AS meta_id, name, daily_budget, lifetime_budget FROM ${table}
             WHERE (${idCol} = $1 OR id::text = $1) AND is_demo = $2 LIMIT 1 FOR UPDATE`
          : `SELECT s.id, s.${idCol} AS meta_id, s.name, s.daily_budget, s.lifetime_budget,
                    c.daily_budget AS campaign_daily_budget, c.lifetime_budget AS campaign_lifetime_budget
             FROM ${table} s JOIN meta_campaigns c ON c.id = s.campaign_id
             WHERE (s.${idCol} = $1 OR s.id::text = $1) AND s.is_demo = $2 LIMIT 1 FOR UPDATE OF s`,
        [metaEntityId, context.isDemo]
      );
      if (rowRes.rows.length === 0) {
        throw new Error(`[VALIDATION EXCEPTION]: ${entityType} '${metaEntityId}' not found. Sync Meta data first.`);
      }
      const row = rowRes.rows[0];

      if (row.lifetime_budget !== null && row.lifetime_budget !== undefined && row.daily_budget === null) {
        throw new Error('[VALIDATION EXCEPTION]: This entity uses a lifetime budget; change it in Ads Manager.');
      }
      if (entityType === 'CAMPAIGN' && (row.daily_budget === null || row.daily_budget === undefined)) {
        throw new Error('[VALIDATION EXCEPTION]: Campaign has no daily budget at campaign level (budget is on the ad sets, or data is not synced yet). Sync, or change the ad set budget.');
      }
      if (
        entityType === 'ADSET' &&
        ((row.campaign_daily_budget !== null && row.campaign_daily_budget !== undefined) ||
          (row.campaign_lifetime_budget !== null && row.campaign_lifetime_budget !== undefined))
      ) {
        throw new Error('[VALIDATION EXCEPTION]: Budget is set at campaign level (Advantage+ campaign budget). Change the campaign budget instead.');
      }

      const previous = row.daily_budget === null || row.daily_budget === undefined ? null : parseFloat(row.daily_budget);

      if (!context.isDemo) {
        await this.callTransportPost(`/${row.meta_id}`, { daily_budget: Math.round(amount * 100) });
      }

      await client.query(`UPDATE ${table} SET daily_budget = $1, updated_at = NOW() WHERE id = $2`, [amount, row.id]);

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        'META_BUDGET_UPDATED',
        `Updated ${entityType} '${row.name}' (${row.meta_id}) daily budget from ${previous === null ? '—' : `R$ ${previous.toFixed(2)}`} to R$ ${amount.toFixed(2)}.`,
        previous === null ? null : String(previous),
        String(amount),
        context.isDemo,
        false
      );

      return { success: true, entityId: row.meta_id, previousDailyBudget: previous, newDailyBudget: amount, name: row.name || null };
    } catch (err: any) {
      await client.query('ROLLBACK');
      await writeAuditLog(
        pool,
        context.userId,
        'META_MUTATION_FAILED',
        `Failed to set ${entityType} '${metaEntityId}' daily budget to R$ ${Number.isFinite(amount) ? amount.toFixed(2) : String(newDailyBudget)}: ${err.message}`,
        null,
        null,
        context.isDemo,
        false
      );
      throw err;
    } finally {
      client.release();
    }
  }

  private static entityTable(entityType: 'CAMPAIGN' | 'ADSET' | 'AD'): { table: string; idCol: string } {
    if (entityType === 'CAMPAIGN') return { table: 'meta_campaigns', idCol: 'meta_campaign_id' };
    if (entityType === 'ADSET') return { table: 'meta_ad_sets', idCol: 'meta_adset_id' };
    if (entityType === 'AD') return { table: 'meta_ads', idCol: 'meta_ad_id' };
    throw new Error('[VALIDATION EXCEPTION]: Unknown Meta entity type.');
  }

  // =========================================================================
  // NORQVA-0019: launch plans — objects created by the Claude are ALWAYS PAUSED
  // =========================================================================
  // Paused objects cannot spend, so creation does not take a decisionId nor reserve capital
  // (D-0010). It still requires META_MUTATION_ENABLED=true + the live preflight, runs only on the
  // configured REAL ad account and writes audit_logs. There is no status parameter: the Graph
  // payload is hard-coded to PAUSED. Activation goes through setEntityStatus/setDailyBudget after
  // the operator answers YES (launchPlanService).

  /**
   * NORQVA-0019 recovery: live lookup (GET only) of launch-plan objects by exact name under a parent.
   * Used before every create so that a POST whose response was lost (timeout/crash) is adopted
   * instead of being created twice. Fail-closed: if the listing cannot be read, nothing is created.
   */
  /**
   * H8 (R-0019-01): campaign spending limit (spend_cap, lifetime, in centavos on the Graph API).
   * Guards: feature flag + preflight. Never touches protected IDs (checked by the caller and here).
   */
  public async setCampaignSpendCap(
    campaignMetaId: string,
    capBrl: number,
    context: MetaMutatingSecurityContext,
    protectedIds: Set<string> = new Set()
  ): Promise<{ success: boolean; campaignId: string; spend_cap_brl: number }> {
    if (!/^\d{5,25}$/.test(String(campaignMetaId))) throw new Error('[VALIDATION EXCEPTION]: Invalid campaign id.');
    if (protectedIds.has(String(campaignMetaId))) throw new Error('[SECURITY EXCEPTION]: Protected campaign (CONTROL) cannot be changed.');
    if (!Number.isFinite(capBrl) || capBrl <= 0) throw new Error('[VALIDATION EXCEPTION]: spend cap must be positive.');
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });
    if (!context.isDemo) {
      await this.callTransportPost(`/${campaignMetaId}`, { spend_cap: Math.round(capBrl * 100) });
    }
    return { success: true, campaignId: String(campaignMetaId), spend_cap_brl: Math.round(capBrl * 100) / 100 };
  }

  /** H6: lifetime spend (BRL) of a campaign, read live from the Graph API (GET only). */
  public async getCampaignLifetimeSpend(campaignMetaId: string): Promise<{ spend: number; effective_status: string | null; spend_cap: number | null }> {
    if (!/^\d{5,25}$/.test(String(campaignMetaId))) throw new Error('[VALIDATION EXCEPTION]: Invalid campaign id.');
    const ins = await this.callTransportGet(`/${campaignMetaId}/insights`, { fields: 'spend', date_preset: 'maximum' });
    const rows: any[] = Array.isArray(ins?.data) ? ins.data : [];
    const spend = rows.reduce((s, r) => s + (parseFloat(r?.spend) || 0), 0);
    const obj = await this.callTransportGet(`/${campaignMetaId}`, { fields: 'effective_status,spend_cap' });
    const cap = obj?.spend_cap !== undefined && obj?.spend_cap !== null && String(obj.spend_cap) !== '' ? (parseFloat(obj.spend_cap) || 0) / 100 : null;
    return { spend: Math.round(spend * 100) / 100, effective_status: obj?.effective_status || null, spend_cap: cap && cap > 0 ? cap : null };
  }

  public async findLaunchObjectsByName(
    context: MetaMutatingSecurityContext,
    parent: 'ACCOUNT' | string,
    edge: 'campaigns' | 'adsets' | 'ads',
    name: string
  ): Promise<Array<{ id: string; name: string; status: string }>> {
    const parentPath = parent === 'ACCOUNT' ? `/${this.realLaunchActId(context)}` : `/${parent}`;
    let res: any;
    try {
      res = await this.callTransportGet(`${parentPath}/${edge}`, {
        fields: 'id,name,status,effective_status',
        filtering: JSON.stringify([{ field: 'name', operator: 'EQUAL', value: name }]),
        limit: '50'
      });
    } catch (err: any) {
      throw new Error(`[META RECONCILE EXCEPTION]: could not list ${edge} under ${parentPath} (${String(err?.message || err)}); refusing to create to avoid duplicates.`);
    }
    if (!res || !Array.isArray(res.data)) {
      throw new Error(`[META RECONCILE EXCEPTION]: unexpected listing for ${edge} under ${parentPath}; refusing to create to avoid duplicates.`);
    }
    return res.data
      .filter((o: any) => o && String(o.name) === name)
      .map((o: any) => ({ id: String(o.id), name: String(o.name), status: String(o.status || o.effective_status || '').toUpperCase() }));
  }

  private realLaunchActId(context: MetaMutatingSecurityContext): string {
    if (context.isDemo) {
      throw new Error('[VALIDATION EXCEPTION]: Launch plans run only on the REAL ad account (no DEMO).');
    }
    if (!this.adAccountId) {
      throw new Error('[META CONFIG EXCEPTION]: Missing META_AD_ACCOUNT_ID.');
    }
    const actId = this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`;
    this.assertAccountAndPixelBinding(actId);
    return actId;
  }

  private static requireGraphId(res: any, what: string): string {
    const id = res?.id === undefined || res?.id === null ? '' : String(res.id).trim();
    if (!id) throw new Error(`[META GRAPH API ERROR]: ${what} creation returned no id.`);
    return id;
  }

  private async ensureRealAdAccountRow(pool: Pool, actId: string): Promise<string> {
    const found = await pool.query(
      'SELECT id FROM meta_ad_accounts WHERE meta_account_id IN ($1, $2) AND is_demo = FALSE LIMIT 1',
      [actId, actId.replace(/^act_/, '')]
    );
    if (found.rows.length > 0) return found.rows[0].id;
    const ins = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ($1, 'NORQVA', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [actId]
    );
    return ins.rows[0].id;
  }

  /**
   * NORQVA-0019: Meta's generic `message` ("Invalid parameter") hides which field failed. Append the
   * code/subcode, the user-facing title/message and the blamed fields so a FAILED plan is diagnosable.
   * Never includes request data or tokens (Graph error bodies carry neither).
   */
  public static describeGraphError(error: any): string {
    if (!error || typeof error !== 'object') return '';
    const parts: string[] = [];
    if (error.message) parts.push(String(error.message));
    const codes = [error.code !== undefined ? `code ${error.code}` : '', error.error_subcode !== undefined ? `subcode ${error.error_subcode}` : '']
      .filter(Boolean)
      .join(', ');
    if (codes) parts.push(`(${codes})`);
    if (error.error_user_title) parts.push(`— ${String(error.error_user_title)}`);
    if (error.error_user_msg) parts.push(`— ${String(error.error_user_msg)}`);
    let errorData: any = error.error_data;
    if (typeof errorData === 'string') {
      try { errorData = JSON.parse(errorData); } catch { errorData = null; }
    }
    const blame = errorData?.blame_field_specs;
    if (Array.isArray(blame) && blame.length) parts.push(`[campos: ${JSON.stringify(blame)}]`);
    return parts.join(' ').slice(0, 900);
  }

  private async auditLaunchFailure(pool: Pool, context: MetaMutatingSecurityContext, what: string, err: any) {
    await writeAuditLog(pool, context.userId || null, 'META_MUTATION_FAILED', `Failed to create paused ${what}: ${err?.message || err}`, null, null, false, false);
  }

  public async createPausedCampaign(
    pool: Pool,
    params: { name: string; objective: 'OUTCOME_SALES' },
    context: MetaMutatingSecurityContext,
    onCreated?: (externalId: string) => Promise<void>
  ): Promise<{ externalId: string }> {
    await this.assertFeatureFlagAndPreflight(context);
    const actId = this.realLaunchActId(context);
    if (params.objective !== 'OUTCOME_SALES') {
      throw new Error('[VALIDATION EXCEPTION]: Launch plan campaigns must use objective OUTCOME_SALES.');
    }
    try {
      const externalId = MetaMutatingClient.requireGraphId(
        await this.callTransportPost(`/${actId}/campaigns`, {
          name: params.name,
          objective: params.objective,
          status: 'PAUSED',
          special_ad_categories: [],
          // ABO: budgets live on the ad sets (one per creative), no campaign budget.
          is_adset_budget_sharing_enabled: false
        }),
        'Campaign'
      );
      if (onCreated) await onCreated(externalId);

      const acctDbId = await this.ensureRealAdAccountRow(pool, actId);
      await pool.query(
        `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, objective, status, effective_status, is_demo, last_synced_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PAUSED', 'PAUSED', FALSE, NOW(), NOW())
         ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
        [externalId, acctDbId, params.name, params.objective]
      );
      await writeAuditLog(pool, context.userId || null, 'META_CAMPAIGN_CREATED', `Created PAUSED Meta Campaign '${params.name}' (Meta ID: ${externalId}).`, null, JSON.stringify({ externalId, name: params.name, status: 'PAUSED' }), false, false);
      return { externalId };
    } catch (err: any) {
      await this.auditLaunchFailure(pool, context, `campaign '${params.name}'`, err);
      throw err;
    }
  }

  public async createPausedAdSet(
    pool: Pool,
    params: {
      campaignId: string;
      name: string;
      dailyBudget: number;
      pixelId: string;
      customEventType: 'PURCHASE';
      optimizationGoal: 'OFFSITE_CONVERSIONS';
      targeting: Record<string, any>;
    },
    context: MetaMutatingSecurityContext,
    onCreated?: (externalId: string) => Promise<void>
  ): Promise<{ externalId: string }> {
    await this.assertFeatureFlagAndPreflight(context);
    const actId = this.realLaunchActId(context);
    this.assertAccountAndPixelBinding(undefined, params.pixelId);
    const amount = Math.round(Number(params.dailyBudget) * 100) / 100;
    const max = getMaxDailyBudgetBRL();
    if (!Number.isFinite(amount) || amount < META_MIN_DAILY_BUDGET_BRL || amount > max) {
      throw new Error(`[VALIDATION EXCEPTION]: Ad set daily budget must be between R$ ${META_MIN_DAILY_BUDGET_BRL.toFixed(2)} and R$ ${max.toFixed(2)} (META_MAX_DAILY_BUDGET_BRL).`);
    }
    try {
      const externalId = MetaMutatingClient.requireGraphId(
        await this.callTransportPost(`/${actId}/adsets`, {
          campaign_id: params.campaignId,
          name: params.name,
          status: 'PAUSED',
          daily_budget: Math.round(amount * 100),
          billing_event: 'IMPRESSIONS',
          optimization_goal: params.optimizationGoal,
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
          destination_type: 'WEBSITE',
          promoted_object: { pixel_id: params.pixelId, custom_event_type: params.customEventType },
          targeting: params.targeting,
          ...advertiserIdentityParams()
        }),
        'Ad set'
      );
      if (onCreated) await onCreated(externalId);

      let cmpDbId = (await pool.query('SELECT id FROM meta_campaigns WHERE meta_campaign_id = $1 AND is_demo = FALSE LIMIT 1', [params.campaignId])).rows[0]?.id;
      if (!cmpDbId) {
        const acctDbId = await this.ensureRealAdAccountRow(pool, actId);
        cmpDbId = (await pool.query(
          `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
           VALUES ($1, $2, 'Parent Campaign', 'PAUSED', 'PAUSED', FALSE)
           ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [params.campaignId, acctDbId]
        )).rows[0].id;
      }
      await pool.query(
        `INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, optimization_goal, billing_event, daily_budget, is_demo, last_synced_at, updated_at)
         VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', $4, 'IMPRESSIONS', $5, FALSE, NOW(), NOW())
         ON CONFLICT (meta_adset_id, is_demo) DO UPDATE SET name = EXCLUDED.name, daily_budget = EXCLUDED.daily_budget, updated_at = NOW()`,
        [externalId, cmpDbId, params.name, params.optimizationGoal, amount]
      );
      await writeAuditLog(pool, context.userId || null, 'META_ADSET_CREATED', `Created PAUSED Meta AdSet '${params.name}' (Meta ID: ${externalId}, Budget: R$ ${amount.toFixed(2)}).`, null, JSON.stringify({ externalId, name: params.name, dailyBudget: amount, pixelId: params.pixelId, status: 'PAUSED' }), false, false);
      return { externalId };
    } catch (err: any) {
      await this.auditLaunchFailure(pool, context, `ad set '${params.name}'`, err);
      throw err;
    }
  }

  public async createPausedAd(
    pool: Pool,
    params: { adsetId: string; creativeId: string; name: string },
    context: MetaMutatingSecurityContext,
    onCreated?: (externalId: string) => Promise<void>
  ): Promise<{ externalId: string }> {
    await this.assertFeatureFlagAndPreflight(context);
    const actId = this.realLaunchActId(context);
    try {
      const externalId = MetaMutatingClient.requireGraphId(
        await this.callTransportPost(`/${actId}/ads`, {
          name: params.name,
          adset_id: params.adsetId,
          creative: { creative_id: params.creativeId },
          status: 'PAUSED'
        }),
        'Ad'
      );
      if (onCreated) await onCreated(externalId);

      const setDbId = (await pool.query('SELECT id FROM meta_ad_sets WHERE meta_adset_id = $1 AND is_demo = FALSE LIMIT 1', [params.adsetId])).rows[0]?.id;
      if (setDbId) {
        await pool.query(
          `INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, meta_creative_id, is_demo, last_synced_at, updated_at)
           VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', $4, FALSE, NOW(), NOW())
           ON CONFLICT (meta_ad_id, is_demo) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
          [externalId, setDbId, params.name, params.creativeId]
        );
      }
      await writeAuditLog(pool, context.userId || null, 'META_AD_CREATED', `Created PAUSED Meta Ad '${params.name}' (Meta ID: ${externalId}).`, null, JSON.stringify({ externalId, name: params.name, adsetId: params.adsetId, creativeId: params.creativeId, status: 'PAUSED' }), false, false);
      return { externalId };
    } catch (err: any) {
      await this.auditLaunchFailure(pool, context, `ad '${params.name}'`, err);
      throw err;
    }
  }

  /**
   * NORQVA-0019: upload a video to the ad account from a public URL (POST /act_X/advideos
   * {file_url, name}). Returns as soon as Meta answers with the video id; processing is awaited
   * separately with waitForVideoReady so a rerun can resume without uploading again.
   */
  public async uploadVideoFromUrl(
    pool: Pool,
    params: { fileUrl: string; name: string },
    context: MetaMutatingSecurityContext
  ): Promise<{ id: string }> {
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });
    const actId = this.realLaunchActId(context);
    let parsed: URL;
    try {
      parsed = new URL(String(params.fileUrl || ''));
    } catch {
      throw new Error('[VALIDATION EXCEPTION]: Video file_url must be a public https URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('[VALIDATION EXCEPTION]: Video file_url must be a public https URL.');
    }
    try {
      const id = MetaMutatingClient.requireGraphId(
        await this.callTransportPost(`/${actId}/advideos`, { file_url: parsed.toString(), name: String(params.name || '').slice(0, 200) }),
        'Video'
      );
      await writeAuditLog(pool, context.userId || null, 'META_VIDEO_UPLOADED', `Uploaded video '${params.name}' to ${actId} (Meta video ID: ${id}).`, null, JSON.stringify({ id, name: params.name, host: parsed.host }), false, false);
      return { id };
    } catch (err: any) {
      await this.auditLaunchFailure(pool, context, `video '${params.name}'`, err);
      throw err;
    }
  }

  /**
   * NORQVA-0019: poll GET /{video_id}?fields=status,picture until status.video_status === 'ready'.
   * Bounded by timeoutMs (META_VIDEO_READY_TIMEOUT_MS, default 120 s). Returns the thumbnail Meta
   * generated (picture), used when the plan has no thumbnail of its own.
   */
  public async waitForVideoReady(
    videoId: string,
    opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
  ): Promise<{ id: string; picture: string | null }> {
    const envTimeout = Number(process.env.META_VIDEO_READY_TIMEOUT_MS);
    const timeoutMs = opts.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 120000);
    const pollIntervalMs = opts.pollIntervalMs ?? 5000;
    const deadline = Date.now() + timeoutMs;
    let lastStatus = 'unknown';
    for (;;) {
      const res = await this.callTransportGet(`/${videoId}`, { fields: 'status,picture' });
      lastStatus = String(res?.status?.video_status || 'unknown');
      if (lastStatus === 'ready') {
        return { id: String(videoId), picture: typeof res?.picture === 'string' && res.picture ? res.picture : null };
      }
      if (lastStatus === 'error') {
        throw new Error(`[META GRAPH API ERROR]: Video ${videoId} processing failed on Meta.`);
      }
      if (Date.now() + pollIntervalMs > deadline) {
        throw new Error(`[META TIMEOUT EXCEPTION]: Video ${videoId} not ready after ${Math.round(timeoutMs / 1000)}s (status: ${lastStatus}). Run the creation again to resume.`);
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  }

  // =========================================================================
  // NORQVA-0018 (fase C): ativos de marca no portfólio (D-0009)
  // =========================================================================

  /** Leitura na Graph API (sem efeito na conta). Usada para conferir ativos de marca. */
  public async readGraph(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    return this.callTransportGet(endpoint, params);
  }

  /**
   * Cria um Pixel/Dataset no portfólio. Mesmas travas da D-0007: só ADMIN, nunca em DEMO,
   * META_MUTATION_ENABLED=true e preflight real da credencial.
   */
  public async createBusinessPixel(context: MetaMutatingSecurityContext, businessId: string, name: string): Promise<{ id: string }> {
    if (context.userRole !== 'ADMIN') throw new Error('[SECURITY EXCEPTION]: Only ADMIN can create brand pixels.');
    if (context.isDemo) throw new Error('[VALIDATION EXCEPTION]: Brand pixels cannot be created in DEMO mode.');
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });
    if (!/^[0-9]{5,30}$/.test(businessId)) throw new Error('[VALIDATION EXCEPTION]: Invalid business id.');
    const cleanName = String(name || '').trim().slice(0, 100);
    if (!cleanName) throw new Error('[VALIDATION EXCEPTION]: Pixel name is required.');
    const res = await this.callTransportPost(`/${businessId}/adspixels`, { name: cleanName });
    if (!res?.id) throw new Error('[META GRAPH API ERROR]: Pixel creation returned no id.');
    return { id: String(res.id) };
  }

  /** Dá à conta de anúncios padrão acesso ao pixel da marca (mesmo portfólio). */
  public async shareBusinessPixelWithAdAccount(context: MetaMutatingSecurityContext, pixelId: string, businessId: string): Promise<boolean> {
    await this.assertFeatureFlagAndPreflight(context, { requirePixel: false });
    if (!this.adAccountId) return false;
    const accountId = this.adAccountId.replace(/^act_/, '');
    await this.callTransportPost(`/${pixelId}/shared_accounts`, { account_id: accountId, business: businessId });
    return true;
  }

  /**
   * Auditoria ao vivo, SOMENTE LEITURA: consulta a Graph API (GET) para os IDs informados, sem passar pelo
   * banco. Nunca faz POST. Erros por objeto são devolvidos no próprio item (não interrompem a auditoria).
   */
  public async auditLive(input: { campaigns: string[]; adsets: string[]; ads: string[] }): Promise<Record<string, any>> {
    const safeGet = async (path: string, params: Record<string, string>) => {
      try {
        return await this.callTransportGet(path, params);
      } catch (err: any) {
        return { error: String(err?.message || err).slice(0, 500) };
      }
    };
    const insightsFields = 'spend,impressions,reach,clicks,inline_link_clicks,actions';
    const insights = (id: string) => safeGet(`/${id}/insights`, { fields: insightsFields, date_preset: 'maximum' });
    const out: Record<string, any> = { fetched_at: new Date().toISOString(), source: 'META_GRAPH_API_LIVE' };

    out.campaigns = await Promise.all(input.campaigns.map(async (id) => ({
      object: await safeGet(`/${id}`, { fields: 'id,name,status,effective_status,configured_status,objective,daily_budget,lifetime_budget,spend_cap,created_time,updated_time' }),
      insights: await insights(id)
    })));
    out.adsets = await Promise.all(input.adsets.map(async (id) => ({
      object: await safeGet(`/${id}`, { fields: 'id,name,status,effective_status,configured_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,created_time,updated_time' }),
      insights: await insights(id)
    })));
    out.ads = await Promise.all(input.ads.map(async (id) => {
      const ad = await safeGet(`/${id}`, {
        fields: 'id,name,status,effective_status,configured_status,campaign_id,adset_id,created_time,updated_time,creative{id,name,object_story_spec,asset_feed_spec,url_tags,video_id,call_to_action_type,title,body,link_url}'
      });
      const spec = ad?.creative?.object_story_spec?.video_data || {};
      const videoId = spec.video_id || ad?.creative?.video_id || null;
      const video = videoId ? await safeGet(`/${videoId}`, { fields: 'id,title,length,created_time,status' }) : null;
      return { object: ad, video, insights: await insights(id) };
    }));
    const act = this.adAccountId ? (this.adAccountId.startsWith('act_') ? this.adAccountId : `act_${this.adAccountId}`) : null;
    out.account = act
      ? await safeGet(`/${act}`, { fields: 'id,name,account_status,disable_reason,currency,amount_spent,spend_cap,balance,funding_source_details' })
      : { error: 'META_AD_ACCOUNT_ID ausente' };
    return out;
  }

  private async callTransportGet(endpoint: string, params: Record<string, string>): Promise<any> {
    const path = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
    if (this.transportGet) {
      return this.transportGet(path, params);
    }
    if (!this.accessToken) {
      throw new Error('[META CONFIG EXCEPTION]: Missing META_ACCESS_TOKEN.');
    }

    const url = new URL(`https://graph.facebook.com/${this.apiVersion}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
    url.searchParams.append('access_token', this.accessToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'NORQVA-MetaMutatingClient/1.0' },
        signal: controller.signal
      });
      const data: any = await res.json();
      if (!res.ok) {
        throw new Error(`[META GRAPH API ERROR]: ${MetaMutatingClient.describeGraphError(data?.error) || `HTTP ${res.status}`}`);
      }
      return data;
    } catch (err: any) {
      const msg = err?.name === 'AbortError' ? '[META TIMEOUT EXCEPTION]: Preflight request timed out.' : String(err?.message || 'Unknown error');
      throw new Error(this.accessToken ? msg.split(this.accessToken).join('[REDACTED]') : msg);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callTransportPost(endpoint: string, payload: Record<string, any>): Promise<{ id: string }> {
    if (this.transportPost) {
      return this.transportPost(endpoint, payload);
    }

    if (!this.accessToken) {
      throw new Error('[META CONFIG EXCEPTION]: Missing META_ACCESS_TOKEN for mutating transport.');
    }

    const url = new URL(`https://graph.facebook.com/${this.apiVersion}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`);
    url.searchParams.append('access_token', this.accessToken);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'NORQVA-MetaMutatingClient/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const data: any = await res.json();
      if (!res.ok) {
        const msg = MetaMutatingClient.describeGraphError(data?.error) || `Meta mutating request returned HTTP ${res.status}`;
        throw new Error(`[META GRAPH API ERROR]: ${msg}`);
      }

      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('[META TIMEOUT EXCEPTION]: Mutating request timed out after 15000ms.');
      }
      const sanitized = err.message ? err.message.replace(new RegExp(this.accessToken, 'g'), '[REDACTED]') : 'Unknown error';
      throw new Error(sanitized);
    } finally {
      clearTimeout(timeout);
    }
  }
}
