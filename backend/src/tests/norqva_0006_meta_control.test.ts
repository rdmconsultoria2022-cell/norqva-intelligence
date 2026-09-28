import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import {
  MetaMutatingClient,
  MetaMutatingSecurityContext,
  MetaPreflightStatus,
  resetMetaPreflightCacheForTesting,
  OFFICIAL_NORQVA_PIXEL_ID
} from '../services/meta/metaMutatingClient';
import { setMetaControlClientFactoryForTesting, translateMetaControlError } from '../controllers/metaControlController';

// NORQVA-0006: campaign control from NORQVA (status + daily budget), fail-closed.
describe('NORQVA-0006 — Meta campaign control', () => {
  let pool: Pool;
  let adminId: string;
  let adminToken: string;
  let perfToken: string;
  let accountDbId: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_MAX_DAILY_BUDGET_BRL'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  const okPreflight: MetaPreflightStatus = {
    tokenValid: true,
    adsRead: true,
    adsManagement: true,
    adAccountAccess: true,
    pixelAccess: false, // control does not need the pixel
    metaMutationCredentialReady: true
  };

  const goodGet = (perms = ['ads_management', 'ads_read']) =>
    vi.fn(async (endpoint: string) => {
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: perms.map((p) => ({ permission: p, status: 'granted' })) };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      throw new Error('unexpected ' + endpoint);
    });

  const ctx = (over: Partial<MetaMutatingSecurityContext> = {}): MetaMutatingSecurityContext => ({
    userId: adminId,
    userRole: 'ADMIN',
    isDemo: false,
    preflightOverrideForTesting: okPreflight,
    ...over
  });

  const seedCampaign = async (opts: { daily?: number | null; lifetime?: number | null } = {}) => {
    const id = crypto.randomUUID();
    const metaId = `cmp0006_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, daily_budget, lifetime_budget, is_demo)
       VALUES ($1, $2, $3, 'BB-B01 | Rodada 1', 'ACTIVE', 'ACTIVE', $4, $5, FALSE)`,
      [id, metaId, accountDbId, opts.daily === undefined ? 50 : opts.daily, opts.lifetime ?? null]
    );
    return { id, metaId };
  };

  const seedAdSet = async (campaignDbId: string, daily: number | null = 30) => {
    const id = crypto.randomUUID();
    const metaId = `set0006_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo)
       VALUES ($1, $2, $3, 'BR amplo', 'ACTIVE', 'ACTIVE', $4, FALSE)`,
      [id, metaId, campaignDbId, daily]
    );
    return { id, metaId };
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING id, auth_user_id, email`,
        [email, role]
      );
      return { id: r.rows[0].id, token: signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role }) };
    };
    const admin = await mk('admin.norqva0006@norqva.test', 'ADMIN');
    adminId = admin.id;
    adminToken = admin.token;
    perfToken = (await mk('perf.norqva0006@norqva.test', 'PERFORMANCE')).token;
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    delete process.env.META_MAX_DAILY_BUDGET_BRL;
    resetMetaPreflightCacheForTesting();
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ('act_norqva_0006', 'NORQVA 0006', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    accountDbId = acct.rows[0].id;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setMetaControlClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  it('live preflight: passes with ads_management, fails without it, and caches the result', async () => {
    const get = goodGet();
    const client = new MetaMutatingClient(vi.fn(), undefined, get);
    const ok = await client.getLivePreflightStatus();
    expect(ok.metaMutationCredentialReady).toBe(true);
    expect(MetaMutatingClient.failedPreflightChecks(ok, { requirePixel: false })).toEqual([]);
    const calls = get.mock.calls.length;
    await client.getLivePreflightStatus();
    expect(get.mock.calls.length).toBe(calls); // cached

    resetMetaPreflightCacheForTesting();
    const readOnly = new MetaMutatingClient(vi.fn(), undefined, goodGet(['ads_read']));
    const bad = await readOnly.getLivePreflightStatus();
    expect(bad.adsManagement).toBe(false);
    expect(bad.metaMutationCredentialReady).toBe(false);
    expect(MetaMutatingClient.failedPreflightChecks(bad, { requirePixel: false })).toContain('ADS_MANAGEMENT');
  });

  it('live preflight: a Graph failure leaves every check false (fail-closed)', async () => {
    const client = new MetaMutatingClient(vi.fn(), undefined, vi.fn().mockRejectedValue(new Error('network')));
    const st = await client.getLivePreflightStatus();
    expect(Object.values(st).every((v) => v === false)).toBe(true);
  });

  it('pause by internal UUID calls Graph with the real Meta ID, updates the row and writes audit', async () => {
    const { id, metaId } = await seedCampaign();
    const post = vi.fn().mockResolvedValue({ success: true });
    const client = new MetaMutatingClient(post);

    const r = await client.setEntityStatus(pool, 'CAMPAIGN', id, 'PAUSED', ctx());
    expect(r.entityId).toBe(metaId);
    expect(r.previousStatus).toBe('ACTIVE');
    expect(post).toHaveBeenCalledWith(`/${metaId}`, { status: 'PAUSED' });
    const row = (await pool.query('SELECT status, effective_status FROM meta_campaigns WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ status: 'PAUSED', effective_status: 'PAUSED' });
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'META_CAMPAIGN_STATUS_CHANGED' AND description LIKE $1`, [`%${metaId}%`]);
    expect(audit.rows.length).toBe(1);
  });

  it('a Meta error keeps the local row unchanged', async () => {
    const { id } = await seedCampaign();
    const client = new MetaMutatingClient(vi.fn().mockRejectedValue(new Error('[META GRAPH API ERROR]: nope')));
    await expect(client.setEntityStatus(pool, 'CAMPAIGN', id, 'PAUSED', ctx())).rejects.toThrow('META GRAPH API ERROR');
    const row = (await pool.query('SELECT status FROM meta_campaigns WHERE id = $1', [id])).rows[0];
    expect(row.status).toBe('ACTIVE');
  });

  it('campaign budget: ceiling and minimum block with zero Graph calls; valid value is sent in cents', async () => {
    const { metaId, id } = await seedCampaign({ daily: 50 });
    const post = vi.fn().mockResolvedValue({ success: true });
    const client = new MetaMutatingClient(post);

    await expect(client.setDailyBudget(pool, 'CAMPAIGN', metaId, 150, ctx())).rejects.toThrow('exceeds the NORQVA ceiling');
    await expect(client.setDailyBudget(pool, 'CAMPAIGN', metaId, 3, ctx())).rejects.toThrow('at least');
    expect(post).not.toHaveBeenCalled();

    const r = await client.setDailyBudget(pool, 'CAMPAIGN', metaId, 60.5, ctx());
    expect(r.previousDailyBudget).toBe(50);
    expect(post).toHaveBeenCalledWith(`/${metaId}`, { daily_budget: 6050 });
    const row = (await pool.query('SELECT daily_budget FROM meta_campaigns WHERE id = $1', [id])).rows[0];
    expect(parseFloat(row.daily_budget)).toBe(60.5);
  });

  it('ceiling is configurable through META_MAX_DAILY_BUDGET_BRL', async () => {
    process.env.META_MAX_DAILY_BUDGET_BRL = '200';
    const { metaId } = await seedCampaign({ daily: 50 });
    const post = vi.fn().mockResolvedValue({ success: true });
    await new MetaMutatingClient(post).setDailyBudget(pool, 'CAMPAIGN', metaId, 150, ctx());
    expect(post).toHaveBeenCalledWith(`/${metaId}`, { daily_budget: 15000 });
  });

  it('ad set budget is refused when the budget lives on the campaign (Advantage+)', async () => {
    const cmp = await seedCampaign({ daily: 50 });
    const set = await seedAdSet(cmp.id, null);
    const post = vi.fn();
    await expect(new MetaMutatingClient(post).setDailyBudget(pool, 'ADSET', set.metaId, 40, ctx())).rejects.toThrow('campaign level');
    expect(post).not.toHaveBeenCalled();
  });

  it('ad set budget works for ABO campaigns; campaign budget refused when the campaign has none', async () => {
    const cmp = await seedCampaign({ daily: null });
    const set = await seedAdSet(cmp.id, 30);
    const post = vi.fn().mockResolvedValue({ success: true });
    const client = new MetaMutatingClient(post);
    await expect(client.setDailyBudget(pool, 'CAMPAIGN', cmp.metaId, 40, ctx())).rejects.toThrow('no daily budget at campaign level');
    await client.setDailyBudget(pool, 'ADSET', set.metaId, 40, ctx());
    expect(post).toHaveBeenCalledWith(`/${set.metaId}`, { daily_budget: 4000 });
  });

  it('HTTP: non-admin is forbidden; flag off returns a clear 409 and makes no Graph call', async () => {
    const { metaId } = await seedCampaign();
    const r1 = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${perfToken}`).send({ status: 'PAUSED' });
    expect(r1.status).toBe(403);

    process.env.META_MUTATION_ENABLED = 'false';
    const post = vi.fn();
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post, undefined, goodGet()));
    const r2 = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PAUSED' });
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('META_MUTATION_ENABLED');
    expect(post).not.toHaveBeenCalled();

    const st = await request(app).get('/api/meta-control/status').set('Authorization', `Bearer ${adminToken}`);
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ enabled: false, ready: false, limits: { minDailyBudget: 5, maxDailyBudget: 100 } });
  });

  it('HTTP: with flag on and a good token, status reports ready and pause/budget go through', async () => {
    const { metaId } = await seedCampaign({ daily: 50 });
    const post = vi.fn().mockResolvedValue({ success: true });
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post, undefined, goodGet()));

    const st = await request(app).get('/api/meta-control/status').set('Authorization', `Bearer ${adminToken}`);
    expect(st.body).toMatchObject({ enabled: true, ready: true, failedChecks: [] });

    const p = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PAUSED' });
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('PAUSED');

    const b = await request(app).post(`/api/meta-control/campaign/${metaId}/budget`).set('Authorization', `Bearer ${adminToken}`).send({ daily_budget: 500 });
    expect(b.status).toBe(400);
    expect(b.body.error).toContain('teto');

    const bad = await request(app).post(`/api/meta-control/ad/${metaId}/budget`).set('Authorization', `Bearer ${adminToken}`).send({ daily_budget: 20 });
    expect(bad.status).toBe(400);
  });

  it('HTTP: token without ads_management is reported and blocks the change', async () => {
    const { metaId } = await seedCampaign();
    const post = vi.fn();
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post, undefined, goodGet(['ads_read'])));
    const st = await request(app).get('/api/meta-control/status').set('Authorization', `Bearer ${adminToken}`);
    expect(st.body.ready).toBe(false);
    expect(st.body.failedChecks.map((c: any) => c.code)).toContain('ADS_MANAGEMENT');

    const r = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('ads_management');
    expect(post).not.toHaveBeenCalled();
  });

  it('error translation never leaks raw internals for unknown errors', () => {
    expect(translateMetaControlError(new Error('boom'))).toEqual({ status: 500, error: 'Falha ao alterar a campanha na Meta.' });
  });
});
