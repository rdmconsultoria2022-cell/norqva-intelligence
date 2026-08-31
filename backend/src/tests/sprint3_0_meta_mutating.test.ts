import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import {
  MetaMutatingClient,
  OFFICIAL_NORQVA_PIXEL_ID,
  MetaMutatingSecurityContext,
  MetaPreflightStatus
} from '../services/meta/metaMutatingClient';

describe('NORQVA — SPRINT 3.0: META MUTATING CLIENT & FAIL-CLOSED GUARDS (G01 – G20)', () => {
  let pool: Pool;
  let adminUserId: string;
  let nonAdminUserId: string;
  let approvedDecisionId: string;
  let unapprovedDecisionId: string;
  let nonAdminDecisionId: string;
  let validExperimentId: string;

  const validPreflight: MetaPreflightStatus = {
    tokenValid: true,
    adsRead: true,
    adsManagement: true,
    adAccountAccess: true,
    pixelAccess: true,
    metaMutationCredentialReady: true
  };

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);

    // Setup Admin and Non-Admin users with robust ID capture
    const adminUserRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'admin.hitl@norqva.com', 'Admin HITL', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id`
    );
    adminUserId = adminUserRes.rows[0].id;

    const nonAdminUserRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'perf.user@norqva.com', 'Perf User', 'PERFORMANCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'PERFORMANCE', status = 'ACTIVE'
       RETURNING id`
    );
    nonAdminUserId = nonAdminUserRes.rows[0].id;

    // Setup Decisions (HITL)
    approvedDecisionId = crypto.randomUUID();
    unapprovedDecisionId = crypto.randomUUID();
    nonAdminDecisionId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO decisions (id, human_id, related_entity_id, related_entity_type, type, decision_text, status, responsible_id, justification, is_demo)
       VALUES ($1, $2, gen_random_uuid(), 'OPPORTUNITY', 'APROVAR_CAPITAL', 'Approved Admin Decision', 'APPROVED', $3, 'Valid Admin Approval', FALSE),
              ($4, $5, gen_random_uuid(), 'OPPORTUNITY', 'APROVAR_CAPITAL', 'Pending Decision', 'PENDING', $3, 'Pending Approval', FALSE),
              ($6, $7, gen_random_uuid(), 'OPPORTUNITY', 'APROVAR_CAPITAL', 'Approved by Non-Admin', 'APPROVED', $8, 'Non-Admin Approval', FALSE)`,
      [
        approvedDecisionId, `DEC-${crypto.randomUUID().slice(0, 8)}`, adminUserId,
        unapprovedDecisionId, `DEC-${crypto.randomUUID().slice(0, 8)}`,
        nonAdminDecisionId, `DEC-${crypto.randomUUID().slice(0, 8)}`, nonAdminUserId
      ]
    );

    // Setup Product & Offer for Foreign Keys
    const prodId = crypto.randomUUID();
    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, is_demo)
       VALUES ($1, $2, 'Test Product', 'DIGITAL_PRODUCT', 'Desc', FALSE)`,
      [prodId, `PRD-${crypto.randomUUID().slice(0, 8)}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, description, price, is_demo)
       VALUES ($1, $2, $3, 'Test Offer', 'Offer Description', 19.90, FALSE)`,
      [offerId, `OFF-${crypto.randomUUID().slice(0, 8)}`, prodId]
    );

    // Setup Experiment with Capital at Risk
    validExperimentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, status, capital_requested, capital_approved, capital_used, start_date, is_demo, responsible_id)
       VALUES ($1, $2, 'Test Growth Exp', 'Hypothesis text', $3, $4, 'ATIVO', 1000.00, 1000.00, 200.00, NOW(), FALSE, $5)`,
      [validExperimentId, `EXP-${crypto.randomUUID().slice(0, 8)}`, prodId, offerId, adminUserId]
    );
  });

  afterEach(async () => {
    delete process.env.META_MUTATION_ENABLED;
    if (pool) {
      await pool.query("DELETE FROM meta_insights WHERE is_demo = FALSE");
      await pool.query("DELETE FROM meta_ads WHERE is_demo = FALSE");
      await pool.query("DELETE FROM meta_ad_sets WHERE is_demo = FALSE");
      await pool.query("DELETE FROM meta_campaigns WHERE is_demo = FALSE");
      await pool.query("DELETE FROM meta_ad_accounts WHERE is_demo = FALSE");
    }
  });

  // =========================================================================
  // 1. FEATURE FLAG & PRE-FLIGHT TESTS (G01 - G05)
  // =========================================================================

  it('G01: Feature flag META_MUTATION_ENABLED = false strictly blocks createCampaign', async () => {
    process.env.META_MUTATION_ENABLED = 'false';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createCampaign(pool, { name: 'Campaign Test', objective: 'OUTCOME_SALES' }, context)
    ).rejects.toThrow('Meta mutating operations are strictly disabled by feature flag');
  });

  it('G02: Feature flag META_MUTATION_ENABLED = false strictly blocks createAdSet', async () => {
    process.env.META_MUTATION_ENABLED = 'false';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createAdSet(pool, { campaignId: 'cmp_123', name: 'AdSet Test', dailyBudget: 50.00 }, context)
    ).rejects.toThrow('Meta mutating operations are strictly disabled by feature flag');
  });

  it('G03: Feature flag META_MUTATION_ENABLED = false strictly blocks createAdCreative', async () => {
    process.env.META_MUTATION_ENABLED = 'false';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createAdCreative(
        pool,
        {
          name: 'Creative Test',
          title: 'Offer Title',
          body: 'Copy text',
          destinationUrl: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001',
          callToAction: 'SHOP_NOW'
        },
        context
      )
    ).rejects.toThrow('Meta mutating operations are strictly disabled by feature flag');
  });

  it('G04: Feature flag META_MUTATION_ENABLED = false strictly blocks createAd', async () => {
    process.env.META_MUTATION_ENABLED = 'false';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createAd(pool, { adsetId: 'adset_123', creativeId: 'crt_123', name: 'Ad Test' }, context)
    ).rejects.toThrow('Meta mutating operations are strictly disabled by feature flag');
  });

  it('G05: Incomplete pre-flight status strictly blocks mutations even with feature flag enabled', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const incompletePreflight: MetaPreflightStatus = {
      tokenValid: false,
      adsRead: true,
      adsManagement: false,
      adAccountAccess: true,
      pixelAccess: true,
      metaMutationCredentialReady: false
    };

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: incompletePreflight
    };

    await expect(
      client.createCampaign(pool, { name: 'Campaign Test', objective: 'OUTCOME_SALES' }, context)
    ).rejects.toThrow('Credential pre-flight checks failed (TOKEN_VALID, ADS_MANAGEMENT, META_MUTATION_CREDENTIAL_READY)');
  });

  // =========================================================================
  // 2. HUMAN-IN-THE-LOOP (HITL) GOVERNANCE TESTS (G06 - G08)
  // =========================================================================

  it('G06: Missing decisionId in REAL mode strictly blocks mutation', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createCampaign(pool, { name: 'Campaign Test', objective: 'OUTCOME_SALES' }, context)
    ).rejects.toThrow('Missing mandatory decisionId approval reference');
  });

  it('G07: Unapproved decision status strictly blocks mutation', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: unapprovedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createCampaign(pool, { name: 'Campaign Test', objective: 'OUTCOME_SALES' }, context)
    ).rejects.toThrow('is not approved (current status: PENDING)');
  });

  it('G08: Decision approved by non-ADMIN user strictly blocks mutation', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: nonAdminDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createCampaign(pool, { name: 'Campaign Test', objective: 'OUTCOME_SALES' }, context)
    ).rejects.toThrow('was not approved by an authorized ADMIN user');
  });

  // =========================================================================
  // 3. CAPITAL AT RISK & BUDGET CONTROLS (G09 - G10)
  // =========================================================================

  it('G09: Budget request exceeding available authorized capital is strictly rejected', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createAdSet(pool, { campaignId: 'cmp_123', name: 'AdSet Heavy', dailyBudget: 850.00 }, context)
    ).rejects.toThrow('Requested budget (R$ 850.00) exceeds available authorized capital (R$ 800.00 remaining of R$ 1000.00)');

    const expRow = (await pool.query('SELECT capital_used FROM experiments WHERE id = $1', [validExperimentId])).rows[0];
    expect(parseFloat(expRow.capital_used)).toBe(200.00);
  });

  it('G10: Concurrent budget requests respect row-level lock and prevent budget runaway', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const mockTransport = vi.fn().mockResolvedValue({ id: 'adset_mock_concurrent' });
    const clientWithMock = new MetaMutatingClient(mockTransport);

    const context1: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };
    const context2: MetaMutatingSecurityContext = { ...context1 };

    const req1 = clientWithMock.createAdSet(pool, { campaignId: 'cmp_1', name: 'Set 1', dailyBudget: 500.00 }, context1);
    const req2 = clientWithMock.createAdSet(pool, { campaignId: 'cmp_2', name: 'Set 2', dailyBudget: 500.00 }, context2);

    const results = await Promise.allSettled([req1, req2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const expRow = (await pool.query('SELECT capital_used FROM experiments WHERE id = $1', [validExperimentId])).rows[0];
    expect(parseFloat(expRow.capital_used)).toBe(700.00);
  });

  // =========================================================================
  // 4. URL WHITELIST GUARDS (G11 - G12)
  // =========================================================================

  it('G11: Non-whitelisted destination URLs are strictly blocked', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    const invalidUrls = [
      'https://external-malicious-site.com/offer',
      'https://norqva-intelligence-frontend.vercel.app/',
      'https://norqva-intelligence-frontend.vercel.app/intelligence',
      'https://norqva-intelligence-frontend.vercel.app/admin/dashboard',
      'http://norqva-intelligence-frontend.vercel.app/p/OFF-000001'
    ];

    for (const url of invalidUrls) {
      await expect(
        client.createAdCreative(
          pool,
          {
            name: 'Creative Test',
            title: 'Offer Title',
            body: 'Copy text',
            destinationUrl: url,
            callToAction: 'SHOP_NOW'
          },
          context
        )
      ).rejects.toThrow('Blocked non-whitelisted destination URL');
    }
  });

  it('G12: Valid public offer URL passes whitelist validation', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const mockTransport = vi.fn().mockResolvedValue({ id: 'crt_meta_whitelisted' });
    const client = new MetaMutatingClient(mockTransport);

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    const res = await client.createAdCreative(
      pool,
      {
        name: 'Creative Whitelisted',
        title: 'Offer Title',
        body: 'Copy text',
        destinationUrl: 'https://norqva-intelligence-frontend.vercel.app/p/OFF-000001?utm_source=meta',
        callToAction: 'SHOP_NOW'
      },
      context
    );

    expect(res.entityType).toBe('ADCREATIVE');
    expect(res.externalId).toBe('crt_meta_whitelisted');
  });

  // =========================================================================
  // 5. ACCOUNT & PIXEL BINDING GUARDS (G13 - G14)
  // =========================================================================

  it('G13: Divergent Ad Account ID is blocked by binding guard', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_10494525678951';
    const client = new MetaMutatingClient();

    expect(() => client.assertAccountAndPixelBinding('act_9999999999999')).toThrow(
      "Target Ad Account 'act_9999999999999' diverges from configured NORQVA account 'act_10494525678951'"
    );
  });

  it('G14: Divergent Pixel ID is blocked by binding guard', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const client = new MetaMutatingClient();

    expect(() => client.assertAccountAndPixelBinding(undefined, '9999999999999')).toThrow(
      `Target Pixel '9999999999999' diverges from official NORQVA Pixel '${OFFICIAL_NORQVA_PIXEL_ID}'`
    );
  });

  // =========================================================================
  // 6. DEMO VS REAL ISOLATION GUARDS (G15 - G16)
  // =========================================================================

  it('G15: DEMO context cannot operate on REAL Ad Account', async () => {
    const client = new MetaMutatingClient();
    const demoContext: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: true
    };

    expect(() => client.assertEnvironmentIsolation(demoContext, 'act_10494525678951')).toThrow(
      'DEMO context cannot operate on REAL Ad Account'
    );
  });

  it('G16: REAL context cannot operate on DEMO Ad Account', async () => {
    const client = new MetaMutatingClient();
    const realContext: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: false
    };

    expect(() => client.assertEnvironmentIsolation(realContext, 'act_demo_12345678')).toThrow(
      'REAL context cannot operate on DEMO Ad Account'
    );
  });

  // =========================================================================
  // 7. IDEMPOTENCY & ATOMIC ROLLBACK (G17 - G18)
  // =========================================================================

  it('G17: Duplicate execution with same idempotencyKey returns existing record without duplicating', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const mockTransport = vi.fn().mockResolvedValue({ id: `cmp_meta_idemp_${crypto.randomUUID().slice(0, 8)}` });
    const client = new MetaMutatingClient(mockTransport);

    const idempotencyKey = crypto.randomUUID();
    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      idempotencyKey,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    const res1 = await client.createCampaign(pool, { name: 'Idemp Campaign', objective: 'OUTCOME_SALES' }, context);
    expect(res1.idempotentReplay).toBeUndefined();

    const res2 = await client.createCampaign(pool, { name: 'Idemp Campaign', objective: 'OUTCOME_SALES' }, context);
    expect(res2.idempotentReplay).toBe(true);
    expect(res2.id).toBe(res1.id);
    expect(res2.externalId).toBe(res1.externalId);

    expect(mockTransport).toHaveBeenCalledTimes(1);
  });

  it('G18: Transport failure rolls back database transaction and preserves available capital', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const mockTransport = vi.fn().mockRejectedValue(new Error('Meta 500 API Gateway Timeout'));
    const client = new MetaMutatingClient(mockTransport);

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await expect(
      client.createAdSet(pool, { campaignId: 'cmp_123', name: 'Failing AdSet', dailyBudget: 150.00 }, context)
    ).rejects.toThrow('Meta 500 API Gateway Timeout');

    const adSetsInDB = await pool.query("SELECT * FROM meta_ad_sets WHERE name = 'Failing AdSet'");
    expect(adSetsInDB.rows.length).toBe(0);

    const expRow = (await pool.query('SELECT capital_used FROM experiments WHERE id = $1', [validExperimentId])).rows[0];
    expect(parseFloat(expRow.capital_used)).toBe(200.00);
  });

  // =========================================================================
  // 8. AUDIT LOGS & EMERGENCY KILL SWITCH (G19 - G20)
  // =========================================================================

  it('G19: Operations write structured audit logs without exposing secrets', async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    const mockTransport = vi.fn().mockResolvedValue({ id: `cmp_audit_${crypto.randomUUID().slice(0, 8)}` });
    const client = new MetaMutatingClient(mockTransport);

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      decisionId: approvedDecisionId,
      experimentId: validExperimentId,
      isDemo: false,
      preflightOverrideForTesting: validPreflight
    };

    await client.createCampaign(pool, { name: 'Audit Verified Campaign', objective: 'OUTCOME_SALES' }, context);

    const logs = await pool.query("SELECT * FROM audit_logs WHERE event_type = 'META_CAMPAIGN_CREATED'");
    expect(logs.rows.length).toBeGreaterThan(0);
    const lastLog = logs.rows[0];
    expect(lastLog.description).toContain('Created Meta Campaign');
    expect(JSON.stringify(lastLog)).not.toContain('EAAB');
    expect(JSON.stringify(lastLog)).not.toContain('access_token');
  });

  it('G20: Emergency Kill Switch / Pausing is permitted even with feature flag disabled', async () => {
    process.env.META_MUTATION_ENABLED = 'false';
    const client = new MetaMutatingClient();

    const actRes = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ('act_kill_switch_test', 'Kill Switch Acct', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const dummyCmpId = crypto.randomUUID();
    const metaCmpId = `cmp_ks_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'Active Campaign', 'ACTIVE', 'ACTIVE', FALSE)`,
      [dummyCmpId, metaCmpId, actRes.rows[0].id]
    );

    const context: MetaMutatingSecurityContext = {
      userId: adminUserId,
      userRole: 'ADMIN',
      isDemo: false
    };

    const res = await client.setEntityStatus(pool, 'CAMPAIGN', dummyCmpId, 'PAUSED', context);
    expect(res.success).toBe(true);
    expect(res.status).toBe('PAUSED');

    const updated = (await pool.query('SELECT status FROM meta_campaigns WHERE id = $1', [dummyCmpId])).rows[0];
    expect(updated.status).toBe('PAUSED');
  });
});
