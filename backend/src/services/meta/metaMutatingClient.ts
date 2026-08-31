import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';

export const OFFICIAL_NORQVA_PIXEL_ID = '1049452567443586';
export const PUBLIC_COMMERCE_URL_REGEX = /^https:\/\/norqva-intelligence-frontend\.vercel\.app\/p\/[A-Za-z0-9_-]+(\?.*)?$/;

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
  pageId?: string;
  instagramActorId?: string;
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

export class MetaMutatingClient {
  private apiVersion: string;
  private accessToken?: string;
  private adAccountId?: string;
  private transportPost?: MetaTransportPostFunction;

  constructor(customTransport?: MetaTransportPostFunction, explicitVersion?: string) {
    this.apiVersion = explicitVersion || process.env.META_API_VERSION || 'v26.0';
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.adAccountId = process.env.META_AD_ACCOUNT_ID;
    this.transportPost = customTransport;
  }

  // =========================================================================
  // MULTI-LAYER FAIL-CLOSED SECURITY GUARDS
  // =========================================================================

  /**
   * 1. Feature Flag & Pre-flight Guard (Fail-Closed)
   */
  public assertFeatureFlagAndPreflight(context: MetaMutatingSecurityContext): void {
    const isFeatureFlagEnabled = process.env.META_MUTATION_ENABLED === 'true';
    if (!isFeatureFlagEnabled) {
      throw new Error('[SECURITY EXCEPTION]: BLOCKED_BY_META_WRITE_SAFETY_HOLD: Meta mutating operations are strictly disabled by feature flag (META_MUTATION_ENABLED is not true).');
    }

    if (context.isDemo) {
      return;
    }

    const preflight = context.preflightOverrideForTesting || this.getLivePreflightStatus();
    const failedChecks: string[] = [];

    if (!preflight.tokenValid) failedChecks.push('TOKEN_VALID');
    if (!preflight.adsRead) failedChecks.push('ADS_READ');
    if (!preflight.adsManagement) failedChecks.push('ADS_MANAGEMENT');
    if (!preflight.adAccountAccess) failedChecks.push('AD_ACCOUNT_ACCESS');
    if (!preflight.pixelAccess) failedChecks.push('PIXEL_ACCESS');
    if (!preflight.metaMutationCredentialReady) failedChecks.push('META_MUTATION_CREDENTIAL_READY');

    if (failedChecks.length > 0) {
      throw new Error(`[SECURITY EXCEPTION]: BLOCKED_BY_META_WRITE_SAFETY_HOLD: Credential pre-flight checks failed (${failedChecks.join(', ')}).`);
    }
  }

  private getLivePreflightStatus(): MetaPreflightStatus {
    return {
      tokenValid: false,
      adsRead: false,
      adsManagement: false,
      adAccountAccess: false,
      pixelAccess: false,
      metaMutationCredentialReady: false
    };
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

    if (!PUBLIC_COMMERCE_URL_REGEX.test(url)) {
      throw new Error(
        `[SECURITY EXCEPTION]: Blocked non-whitelisted destination URL: "${url}". Destination URLs must strictly match public offer entry pattern "https://norqva-intelligence-frontend.vercel.app/p/:humanId".`
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
    this.assertFeatureFlagAndPreflight(context);
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
    this.assertFeatureFlagAndPreflight(context);
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
    this.assertFeatureFlagAndPreflight(context);
    this.assertUrlWhitelisted(params.destinationUrl);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const actId = context.isDemo ? 'act_demo_12345678' : (this.adAccountId || 'act_production');
      this.assertEnvironmentIsolation(context, actId);

      const externalId = context.isDemo
        ? `crt_demo_${crypto.randomUUID().slice(0, 8)}`
        : (await this.callTransportPost(`/${actId}/adcreatives`, {
            name: params.name,
            object_story_spec: {
              page_id: params.pageId || 'page_norqva_official',
              link_data: {
                message: params.body,
                link: params.destinationUrl,
                name: params.title,
                call_to_action: {
                  type: params.callToAction || 'LEARN_MORE',
                  value: { link: params.destinationUrl }
                }
              }
            }
          })).id;

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

  public async createAd(
    pool: Pool,
    params: CreateAdParams,
    context: MetaMutatingSecurityContext
  ): Promise<MetaMutationResult> {
    this.assertFeatureFlagAndPreflight(context);
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
    this.assertFeatureFlagAndPreflight(context);

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
  ): Promise<{ success: boolean; entityId: string; status: string }> {
    // Unconditional fail-closed check: No mutation (even pause) can bypass the Global Safety Hold
    this.assertFeatureFlagAndPreflight(context);

    const table = entityType === 'CAMPAIGN' ? 'meta_campaigns' : entityType === 'ADSET' ? 'meta_ad_sets' : 'meta_ads';
    const idCol = entityType === 'CAMPAIGN' ? 'meta_campaign_id' : entityType === 'ADSET' ? 'meta_adset_id' : 'meta_ad_id';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (!context.isDemo) {
        await this.callTransportPost(`/${metaEntityId}`, { status: newStatus });
      }

      await client.query(
        `UPDATE ${table} SET status = $1, effective_status = $1, updated_at = NOW() WHERE ${idCol} = $2 OR id::text = $2`,
        [newStatus, metaEntityId]
      );

      await client.query('COMMIT');

      await writeAuditLog(
        pool,
        context.userId,
        `META_${entityType}_STATUS_CHANGED`,
        `Set ${entityType} '${metaEntityId}' status to ${newStatus}.`,
        null,
        newStatus,
        context.isDemo,
        false
      );

      return { success: true, entityId: metaEntityId, status: newStatus };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
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
        const msg = data?.error?.message || `Meta mutating request returned HTTP ${res.status}`;
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
