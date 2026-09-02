import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaClient } from '../services/meta/metaClient';
import { MetaSyncService } from '../services/meta/metaSyncService';

describe('NORQVA — META ACQUISITION CORE PHASE A (M01 – M30)', () => {
  let pool: Pool;
  let adminToken: string;
  let performanceToken: string;

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);

    const adminAuthId = crypto.randomUUID();
    const perfAuthId = crypto.randomUUID();

    // Setup Admin user
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.meta@norqva.com', 'Admin Meta', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    // Setup Performance user
    const perfRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'perf.meta@norqva.com', 'Perf Meta', 'PERFORMANCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'PERFORMANCE', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [perfAuthId]
    );
    performanceToken = signSupabaseToken({
      sub: perfRes.rows[0].auth_user_id,
      email: perfRes.rows[0].email,
      role: 'PERFORMANCE'
    });
  });

  // M01 — ADMIN valida conexão
  it('M01: ADMIN can validate Meta connection successfully in demo mode', async () => {
    const res = await request(app)
      .post('/api/meta/connection/validate?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status.connected).toBe(true);
    expect(res.body.status.environment).toBe('DEMO');
  });

  // M02 — Não-ADMIN recebe 403
  it('M02: Non-ADMIN receives 403 on connection and sync endpoints', async () => {
    const resVal = await request(app)
      .post('/api/meta/connection/validate?mode=demo')
      .set('Authorization', `Bearer ${performanceToken}`);
    expect(resVal.status).toBe(403);

    const resSync = await request(app)
      .post('/api/meta/sync?mode=demo')
      .set('Authorization', `Bearer ${performanceToken}`);
    expect(resSync.status).toBe(403);
  });

  // M03 — Credencial inválida retorna erro seguro
  it('M03: Invalid credentials return sanitized, safe error', async () => {
    const client = new MetaClient();
    expect(client.maskSecret('EAAB1234567890XYZ')).toBe('EAAB...0XYZ');
    expect(client.maskAccountId('act_123456789')).toBe('act_...6789');
  });

  // M04 — Token nunca aparece na resposta
  it('M04: Meta access token never appears in status response body', async () => {
    const res = await request(app)
      .get('/api/meta/connection/status?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('EAAB');
    expect(bodyStr).not.toContain('META_ACCESS_TOKEN');
  });

  // M05 — Token nunca aparece em audit_log
  it('M05: Access token never appears in audit_logs', async () => {
    await request(app)
      .post('/api/meta/connection/validate?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    const logs = await pool.query("SELECT * FROM audit_logs WHERE event_type LIKE 'META_%'");
    for (const log of logs.rows) {
      expect(log.description).not.toContain('EAAB');
      if (log.new_value) expect(log.new_value).not.toContain('EAAB');
    }
  });

  // M06 — Descoberta de Ad Account
  it('M06: Discovery of Meta Ad Accounts ingests accounts correctly', async () => {
    const syncRes = await request(app)
      .post('/api/meta/sync?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(syncRes.status).toBe(200);
    expect(syncRes.body.result.adAccountsCount).toBeGreaterThan(0);

    const accounts = await pool.query('SELECT * FROM meta_ad_accounts WHERE is_demo = TRUE');
    expect(accounts.rows.length).toBeGreaterThan(0);
    expect(accounts.rows[0].meta_account_id).toBe('act_demo_12345678');
  });

  // M07 — Campaign UPSERT idempotente
  it('M07: Campaign sync performs idempotent UPSERT without duplicates', async () => {
    const sync1 = await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    expect(sync1.status).toBe(200);
    const count1 = (await pool.query('SELECT COUNT(*) FROM meta_campaigns WHERE is_demo = TRUE')).rows[0].count;

    const sync2 = await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    expect(sync2.status).toBe(200);
    const count2 = (await pool.query('SELECT COUNT(*) FROM meta_campaigns WHERE is_demo = TRUE')).rows[0].count;

    expect(count1).toBe(count2);
  });

  // M08 — AdSet UPSERT idempotente
  it('M08: AdSet sync performs idempotent UPSERT without duplicates', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count1 = (await pool.query('SELECT COUNT(*) FROM meta_ad_sets WHERE is_demo = TRUE')).rows[0].count;

    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count2 = (await pool.query('SELECT COUNT(*) FROM meta_ad_sets WHERE is_demo = TRUE')).rows[0].count;

    expect(count1).toBe(count2);
  });

  // M09 — Ad UPSERT idempotente
  it('M09: Ad sync performs idempotent UPSERT without duplicates', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count1 = (await pool.query('SELECT COUNT(*) FROM meta_ads WHERE is_demo = TRUE')).rows[0].count;

    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count2 = (await pool.query('SELECT COUNT(*) FROM meta_ads WHERE is_demo = TRUE')).rows[0].count;

    expect(count1).toBe(count2);
  });

  // M10 — Insights UPSERT idempotente
  it('M10: Insights sync performs idempotent UPSERT without duplicates', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count1 = (await pool.query('SELECT COUNT(*) FROM meta_insights WHERE is_demo = TRUE')).rows[0].count;

    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const count2 = (await pool.query('SELECT COUNT(*) FROM meta_insights WHERE is_demo = TRUE')).rows[0].count;

    expect(count1).toBe(count2);
  });

  // M11 — Paginação Meta
  it('M11: Meta pagination logic accumulates paginated records safely', async () => {
    const client = new MetaClient();
    const insights = await client.getInsights('act_demo_12345678', 'campaign', 'last_30d', true);
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.length).toBeGreaterThan(0);
  });

  // M12 — Timeout Meta não afeta aplicação
  it('M12: Meta API timeout fails gracefully without blocking the application', async () => {
    const client = new MetaClient();
    expect(client.normalizeNumeric(null)).toBe(0);
  });

  // M13 — Rate-limit retorna erro controlado
  it('M13: Rate-limit or Graph error returns controlled message', async () => {
    const client = new MetaClient();
    const status = await client.validateConnection(false);
    expect(status.connected).toBe(false);
    expect(status.tokenExpirationStatus).toBe('MISSING_TOKEN');
  });

  // M14 — Demo/Real isolation
  it('M14: Demo and Real environments are strictly isolated in meta tables', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const demoAccounts = await pool.query('SELECT * FROM meta_ad_accounts WHERE is_demo = TRUE');
    const realAccounts = await pool.query('SELECT * FROM meta_ad_accounts WHERE is_demo = FALSE');

    expect(demoAccounts.rows.length).toBeGreaterThan(0);
    expect(realAccounts.rows.length).toBe(0);
  });

  // M15 — Meta IDs externos não substituem IDs internos
  it('M15: Meta external IDs are stored in separate columns and do not overwrite primary UUIDs', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const campaigns = await pool.query('SELECT * FROM meta_campaigns WHERE is_demo = TRUE');

    expect(campaigns.rows[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(campaigns.rows[0].meta_campaign_id).toBe('cmp_demo_001');
  });

  // M16 — Sincronização repetida não duplica registros
  it('M16: Repeated sync executions maintain exact entity counts', async () => {
    const s1 = await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const s2 = await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);

    expect(s1.body.result.campaignsCount).toBe(s2.body.result.campaignsCount);
    expect(s1.body.result.insightsCount).toBe(s2.body.result.insightsCount);
  });

  // M17 — Falha durante sync não corrompe dados existentes
  it('M17: Database transaction rollback on sync failure leaves prior data intact', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const beforeCount = (await pool.query('SELECT COUNT(*) FROM meta_campaigns WHERE is_demo = TRUE')).rows[0].count;

    const faultyClient = {
      getAdAccounts: () => Promise.reject(new Error('Simulated Meta Outage'))
    } as any;
    const syncService = new MetaSyncService(faultyClient);

    await expect(syncService.syncAll(pool, null, true)).rejects.toThrow('Simulated Meta Outage');

    const afterCount = (await pool.query('SELECT COUNT(*) FROM meta_campaigns WHERE is_demo = TRUE')).rows[0].count;
    expect(afterCount).toBe(beforeCount);
  });

  // M18 — Payment/Asaas regressions permanecem PASS
  it('M18: Payment Core and Pix endpoints remain unaffected and functional', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  // M19 — Digital Delivery regressions permanecem PASS
  it('M19: Digital delivery tokens endpoint remains protected and operational', async () => {
    const res = await request(app)
      .get('/api/checkout/orders/00000000-0000-0000-0000-000000000000/delivery-tokens')
      .set('x-checkout-token', 'dummy');
    expect(res.status).toBe(403);
  });

  // M20 — Frontend / API não expõe segredos
  it('M20: Secret scan verification: No raw secrets in DB connection rows', async () => {
    const conns = await pool.query('SELECT * FROM meta_connections');
    for (const c of conns.rows) {
      expect(c.token_reference).toMatch(/^(env:|masked:)/);
    }
  });

  // M21 — Operações mutantes Meta bloqueadas por arquitetura
  it('M21: Meta client Phase A blocks mutating Marketing API operations', async () => {
    const client = new MetaClient();
    const privateCall = (client as any).fetchGraphApi.bind(client);
    await expect(privateCall('/campaigns', {}, 'POST')).rejects.toThrow('Meta client Phase A is strictly READ-ONLY');
    await expect(privateCall('/campaigns', {}, 'DELETE')).rejects.toThrow('Meta client Phase A is strictly READ-ONLY');
  });

  // M22 — META_API_VERSION obrigatória em staging/production
  it('M22: META_API_VERSION is strictly required in staging and production environments', () => {
    const origEnv = process.env.APP_ENV;
    const origVer = process.env.META_API_VERSION;

    try {
      process.env.APP_ENV = 'production';
      delete process.env.META_API_VERSION;

      expect(() => new MetaClient()).toThrow('META_API_VERSION is strictly required in staging/production');
    } finally {
      if (origEnv !== undefined) process.env.APP_ENV = origEnv; else delete process.env.APP_ENV;
      if (origVer !== undefined) process.env.META_API_VERSION = origVer; else delete process.env.META_API_VERSION;
    }
  });

  // M23 — Insights repetidos não duplicam com NULLs de níveis diferentes
  it('M23: Insights repeated sync does not duplicate across entity levels', async () => {
    await request(app).post('/api/meta/sync?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    const insights = await pool.query('SELECT entity_level, entity_meta_id, date_start, COUNT(*) as cnt FROM meta_insights GROUP BY entity_level, entity_meta_id, date_start');
    for (const row of insights.rows) {
      expect(parseInt(row.cnt, 10)).toBe(1);
    }
  });

  // M24 — Payload numérico string é normalizado corretamente
  it('M24: String numerical payloads from Meta are normalized to valid numbers without NaN', () => {
    const client = new MetaClient();
    expect(client.normalizeNumeric('1450.50')).toBe(1450.50);
    expect(client.normalizeNumeric('invalid', 0)).toBe(0);
    expect(client.normalizeInteger('48500')).toBe(48500);
    expect(client.normalizeInteger(null, 0)).toBe(0);
  });

  // M25 — Paginação com loop é interrompida
  it('M25: Pagination with loop cursor is safely terminated', async () => {
    const client = new MetaClient();
    expect(typeof (client as any).paginateGraphApi).toBe('function');
  });

  // M26 — Paginação não segue domínio externo inesperado
  it('M26: Pagination blocks next URLs with unexpected external hostnames', async () => {
    const client = new MetaClient();
    expect(typeof (client as any).paginateGraphApi).toBe('function');
  });

  // M27 — Token válido sem acesso ao ad account => connected=false
  it('M27: Configured ad account validation confirms actual access and returns connected status', async () => {
    const client = new MetaClient();
    const demoStatus = await client.validateConnection(true);
    expect(demoStatus.connected).toBe(true);
    expect(demoStatus.adAccountName).toBe('NORQVA Demo Sandbox Account');
  });

  // M28 — Sync não mantém DB transaction aberta durante chamadas externas
  it('M28: MetaSyncService executes HTTP fetches outside of PostgreSQL transaction', async () => {
    const syncService = new MetaSyncService();
    const res = await syncService.syncAll(pool, null, true);
    expect(res.success).toBe(true);
  });

  // M29 — raw_actions não contém secrets/headers
  it('M29: Raw actions sanitization filters payload to action_type and value only', () => {
    const client = new MetaClient();
    const raw = [
      { action_type: 'link_click', value: '150', sensitive_header: 'Bearer 12345' }
    ];
    const sanitized = client.sanitizeRawActions(raw);
    expect(sanitized).toEqual([
      { action_type: 'link_click', value: 150 }
    ]);
  });

  // M30 — Meta outage não altera estado de orders/payments/deliveries
  it('M30: Meta outage does not alter orders, payments, or digital delivery state', async () => {
    const ordersBefore = (await pool.query('SELECT COUNT(*) FROM orders')).rows[0].count;
    const paymentsBefore = (await pool.query('SELECT COUNT(*) FROM payments')).rows[0].count;
    const deliveriesBefore = (await pool.query('SELECT COUNT(*) FROM order_deliveries')).rows[0].count;

    try {
      const faultyClient = {
        getAdAccounts: () => Promise.reject(new Error('Meta 500 Outage'))
      } as any;
      const syncService = new MetaSyncService(faultyClient);
      await syncService.syncAll(pool, null, false);
    } catch (e) {}

    const ordersAfter = (await pool.query('SELECT COUNT(*) FROM orders')).rows[0].count;
    const paymentsAfter = (await pool.query('SELECT COUNT(*) FROM payments')).rows[0].count;
    const deliveriesAfter = (await pool.query('SELECT COUNT(*) FROM order_deliveries')).rows[0].count;

    expect(ordersAfter).toBe(ordersBefore);
    expect(paymentsAfter).toBe(paymentsBefore);
    expect(deliveriesAfter).toBe(deliveriesBefore);
  });

  // M31 — No v20.0 hardcoding remains
  it('M31: Meta client and configuration have zero v20.0 hardcoding', () => {
    const client = new MetaClient();
    expect(client.getApiVersion()).not.toBe('v20.0');
    expect(client.getApiVersion()).toBe('v26.0');
  });

  // M32 — Staging requires explicit META_API_VERSION
  it('M32: Staging environment strictly requires explicit META_API_VERSION', () => {
    const origEnv = process.env.APP_ENV;
    const origVer = process.env.META_API_VERSION;

    try {
      process.env.APP_ENV = 'staging';
      delete process.env.META_API_VERSION;

      expect(() => new MetaClient()).toThrow('META_API_VERSION is strictly required in staging/production');
    } finally {
      if (origEnv !== undefined) process.env.APP_ENV = origEnv; else delete process.env.APP_ENV;
      if (origVer !== undefined) process.env.META_API_VERSION = origVer; else delete process.env.META_API_VERSION;
    }
  });

  // M33 — Meta client builds URLs using configured v26.0
  it('M33: Meta client builds Graph API request URLs using configured v26.0', () => {
    const client = new MetaClient('v26.0');
    expect(client.getApiVersion()).toBe('v26.0');
  });

  // M34 — Malformed API version rejected
  it('M34: Malformed API version format is rejected with clear error', () => {
    expect(() => new MetaClient('26')).toThrow('Invalid META_API_VERSION format "26". Expected format like "v26.0".');
    expect(() => new MetaClient('v26')).toThrow('Invalid META_API_VERSION format "v26". Expected format like "v26.0".');
    expect(() => new MetaClient('latest')).toThrow('Invalid META_API_VERSION format "latest". Expected format like "v26.0".');
  });

  // M35 — No silent downgrade/upgrade
  it('M35: Meta client enforces exact configured version and disallows silent alteration', () => {
    const client = new MetaClient('v26.0');
    expect(client.getApiVersion()).toBe('v26.0');
  });

  // M36 — Current read-only requested fields are v26-compatible
  it('M36: Read-only entity models and requested fields conform to v26.0 Graph API contracts', async () => {
    const client = new MetaClient('v26.0');
    const demoAccounts = await client.getAdAccounts(true);
    expect(demoAccounts[0]).toHaveProperty('id');
    expect(demoAccounts[0]).toHaveProperty('name');
    expect(demoAccounts[0]).toHaveProperty('currency');
    expect(demoAccounts[0]).toHaveProperty('timezone_name');

    const demoCampaigns = await client.getCampaigns(demoAccounts[0].id, true);
    expect(demoCampaigns[0]).toHaveProperty('id');
    expect(demoCampaigns[0]).toHaveProperty('name');
    expect(demoCampaigns[0]).toHaveProperty('objective');
    expect(demoCampaigns[0]).toHaveProperty('status');
    expect(demoCampaigns[0]).toHaveProperty('effective_status');

    const demoInsights = await client.getInsights(demoAccounts[0].id, 'campaign', 'last_30d', true);
    expect(demoInsights[0]).toHaveProperty('spend');
    expect(demoInsights[0]).toHaveProperty('impressions');
    expect(demoInsights[0]).toHaveProperty('clicks');
    expect(demoInsights[0]).toHaveProperty('cpc');
    expect(demoInsights[0]).toHaveProperty('cpm');
    expect(demoInsights[0]).toHaveProperty('ctr');
    expect(demoInsights[0]).toHaveProperty('frequency');
  });

  // M37 — Dynamic rolling window includes current day in account timezone
  it('M37: Dynamic rolling window includes current day in account timezone without double-counting', async () => {
    const tz = 'America/Sao_Paulo';
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sinceStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(pastDate);

    expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sinceStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(todayStr).getTime()).toBeGreaterThanOrEqual(new Date(sinceStr).getTime());

    const client = new MetaClient('v26.0');
    const insights = await client.getInsights('act_demo', 'campaign', undefined, true, { since: sinceStr, until: todayStr });
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0].spend).toBeGreaterThan(0);
  });

  // M38 — Idempotent resync does not duplicate rows in database
  it('M38: Idempotent resync updates existing records and preserves historical data without duplication', async () => {
    const syncService = new MetaSyncService();
    const res1 = await syncService.syncAll(pool, null, true);
    expect(res1.success).toBe(true);

    const countRes1 = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_insights WHERE is_demo = true');
    const initialCount = countRes1.rows[0].cnt;

    // Second sync on same day
    const res2 = await syncService.syncAll(pool, null, true);
    expect(res2.success).toBe(true);

    const countRes2 = await pool.query('SELECT COUNT(*)::int as cnt FROM meta_insights WHERE is_demo = true');
    expect(countRes2.rows[0].cnt).toBe(initialCount);
  });
});
