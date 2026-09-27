import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';
import { LandingPageProbeService } from '../services/landingPageProbeService';
import { validateProductionEnvironment } from '../utils/envValidation';
import { MetaCapiService } from '../services/meta/metaCapiService';

describe('GATE SEC-03 & FASE 1 (MEDIR CERTO) — Comprehensive Test Suite', () => {
  let pool: Pool;
  let adminToken: string;
  let intelligenceToken: string;
  let performanceToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await seedDemoData(pool);

    // Setup Admin user
    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.gate@norqva.com', 'Admin Gate', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    // Setup Intelligence user
    const intAuthId = crypto.randomUUID();
    const intRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'intel.gate@norqva.com', 'Intel Gate', 'INTELLIGENCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'INTELLIGENCE', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [intAuthId]
    );
    intelligenceToken = signSupabaseToken({
      sub: intRes.rows[0].auth_user_id,
      email: intRes.rows[0].email,
      role: 'INTELLIGENCE'
    });

    // Setup Performance user (non-ADMIN, non-INTELLIGENCE)
    const performanceAuthId = crypto.randomUUID();
    const perfRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'performance.gate@norqva.com', 'Perf Gate', 'PERFORMANCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'PERFORMANCE', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [performanceAuthId]
    );
    performanceToken = signSupabaseToken({
      sub: perfRes.rows[0].auth_user_id,
      email: perfRes.rows[0].email,
      role: 'PERFORMANCE'
    });
  }, 30000);

  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM users WHERE email IN ('admin.gate@norqva.com', 'intel.gate@norqva.com', 'performance.gate@norqva.com')`);
    } catch (_) {}
  });

  // ==========================================
  // ITEM 1: SEGURANÇA (RBAC, SSRF, HASH, SEQ)
  // ==========================================
  describe('1. Segurança', () => {
    it('1.1 RBAC: Rejects non-ADMIN/non-INTELLIGENCE from /api/market-discovery/* routes with 403', async () => {
      const routes = [
        { method: 'get', path: '/api/market-discovery/probe' },
        { method: 'get', path: '/api/market-discovery/search' },
        { method: 'get', path: '/api/market-discovery/clusters' },
        { method: 'get', path: '/api/market-discovery/queue' },
        { method: 'post', path: '/api/market-discovery/probe-landing-page', body: { url: 'https://example.com' } },
      ];

      for (const r of routes) {
        let req = (request(app) as any)[r.method](r.path).set('Authorization', `Bearer ${performanceToken}`);
        if (r.body) req = req.send(r.body);
        const res = await req;
        expect(res.status).toBe(403);
      }
    });

    it('1.2 RBAC: Allows ADMIN and INTELLIGENCE users on /api/market-discovery/* routes', async () => {
      const resIntel = await request(app)
        .get('/api/market-discovery/probe')
        .set('Authorization', `Bearer ${intelligenceToken}`);
      expect(resIntel.status).toBe(200);

      const resAdmin = await request(app)
        .get('/api/market-discovery/probe')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
    });

    it('1.3 SSRF Protection: Blocks private IPs, loopback, AWS metadata, and non-http protocols', async () => {
      const invalidUrls = [
        'http://127.0.0.1:8080/admin',
        'http://localhost:3000',
        'http://10.0.0.1/secrets',
        'http://192.168.1.1/router',
        'http://172.16.0.1/internal',
        'http://169.254.169.254/latest/meta-data/',
        'ftp://example.com/file.txt',
        'file:///etc/passwd',
        'javascript:alert(1)'
      ];

      for (const url of invalidUrls) {
        await expect(LandingPageProbeService.probeUrl(url)).rejects.toThrow();
      }
    });

    it('1.4 Env Validation: Rejects missing CPF_CNPJ_HASH_SECRET in production mode', () => {
      const savedEnv = { ...process.env };

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_DESTRUCTIVE_TESTS = 'false';
        process.env.ASAAS_ENV = 'sandbox';
        process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
        delete process.env.CPF_CNPJ_HASH_SECRET;

        expect(() => validateProductionEnvironment()).toThrow(/CPF_CNPJ_HASH_SECRET/);
      } finally {
        for (const k of Object.keys(process.env)) {
          if (!(k in savedEnv)) {
            delete process.env[k];
          }
        }
        for (const [k, v] of Object.entries(savedEnv)) {
          process.env[k] = v;
        }
      }
    });

    it('1.5 Postgres Sequences: Generates sequential IDs without collisions', async () => {
      const r1 = await pool.query("SELECT nextval('seq_opportunities_human_id') as val");
      const r2 = await pool.query("SELECT nextval('seq_opportunities_human_id') as val");
      expect(parseInt(r2.rows[0].val, 10)).toBeGreaterThan(parseInt(r1.rows[0].val, 10));
    });
  });

  // ==========================================
  // ITEM 2: META CONVERSIONS API (SERVER-SIDE)
  // ==========================================
  describe('2. Meta Conversions API (Server-Side)', () => {
    it('2.1 User Data Hashing: Correctly normalizes and SHA-256 hashes email and phone', () => {
      const rawEmail = ' Test.User@Domain.COM ';
      const rawPhone = '+55 (11) 98765-4321';

      const hashed = MetaCapiService.buildUserData({
        email: rawEmail,
        phone: rawPhone,
        fbc: 'fb.1.12345678.abcdef',
        fbp: 'fb.1.12345678.987654',
        clientIp: '200.100.50.25',
        clientUserAgent: 'Mozilla/5.0 Chrome'
      });

      const expectedEmailHash = crypto.createHash('sha256').update('test.user@domain.com').digest('hex');
      const expectedPhoneHash = crypto.createHash('sha256').update('5511987654321').digest('hex');

      expect(hashed.em).toEqual([expectedEmailHash]);
      expect(hashed.ph).toEqual([expectedPhoneHash]);
      expect(hashed.fbc).toBe('fb.1.12345678.abcdef');
      expect(hashed.fbp).toBe('fb.1.12345678.987654');
      expect(hashed.client_ip_address).toBe('200.100.50.25');
      expect(hashed.client_user_agent).toBe('Mozilla/5.0 Chrome');
    });

    it('2.2 Deduplication & Non-blocking CAPI: Saves events in capi_events table and deduplicates', async () => {
      // Create a real order in orders table first
      const custRes = await pool.query(
        `INSERT INTO customers (id, name, email) VALUES (gen_random_uuid(), 'Capi Buyer', 'capi@buyer.com') RETURNING id`
      );
      const custId = custRes.rows[0].id;

      const orderRes = await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
         VALUES (gen_random_uuid(), $1, 197.00, 'PAID', $2, FALSE, 'COMMERCIAL_PRODUCTION')
         RETURNING id`,
        [custId, crypto.randomUUID()]
      );
      const testOrderId = orderRes.rows[0].id;
      const eventId = `purchase_${testOrderId}`;

      // Emit Purchase event
      const result1 = await MetaCapiService.sendEvent(pool, {
        eventName: 'Purchase',
        eventId: eventId,
        eventSourceUrl: 'https://pay.norqva.com/checkout',
        orderId: testOrderId,
        value: 197.00,
        currency: 'BRL',
        email: 'buyer@testcapi.com',
        phone: '11999998888',
        fbc: 'fb.1.1.123',
        fbp: 'fb.1.1.456',
        clientIp: '189.10.20.30',
        clientUserAgent: 'TestBrowser/1.0'
      });

      expect(result1).toBeDefined();

      // Check capi_events table
      const eventRow = await pool.query(
        `SELECT * FROM capi_events WHERE event_id = $1`,
        [eventId]
      );
      expect(eventRow.rows.length).toBe(1);
      expect(eventRow.rows[0].event_name).toBe('Purchase');
      expect(eventRow.rows[0].order_id).toBe(testOrderId);

      // Subsequent identical event should deduplicate
      const result2 = await MetaCapiService.sendEvent(pool, {
        eventName: 'Purchase',
        eventId: eventId,
        eventSourceUrl: 'https://pay.norqva.com/checkout',
        orderId: testOrderId,
        value: 197.00,
        currency: 'BRL',
        email: 'buyer@testcapi.com',
        phone: '11999998888'
      });

      expect(result2.eventId).toBe(eventId);
      const totalEvents = await pool.query(
        `SELECT COUNT(*) as cnt FROM capi_events WHERE event_id = $1`,
        [eventId]
      );
      expect(parseInt(totalEvents.rows[0].cnt, 10)).toBe(1);
    });
  });

  // ==========================================
  // ITEM 3: CUSTOS REAIS & UNIT ECONOMICS
  // ==========================================
  describe('3. Custos Reais & Unit Economics', () => {
    it('3.1 offer_unit_economics: Calculates real costs and unit economics in dashboard', async () => {
      // Create a test product & offer
      const prodRes = await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, is_demo, data_provenance)
         VALUES (gen_random_uuid(), 'PRD-UNIT-01', 'Produto Unit Economics', 'INFO', 'Desc', 'PLANEJADO', 'ORIGINAL', FALSE, 'COMMERCIAL_PRODUCTION')
         RETURNING id`
      );
      const prodId = prodRes.rows[0].id;

      const offRes = await pool.query(
        `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, is_deleted, data_provenance)
         VALUES (gen_random_uuid(), 'OFF-UNIT-01', 'Oferta Unit Economics', 'Desc', $1, 100.00, FALSE, FALSE, 'COMMERCIAL_PRODUCTION')
         RETURNING id`,
        [prodId]
      );
      const offId = offRes.rows[0].id;

      // Seed unit economics for offer
      await pool.query(
        `INSERT INTO offer_unit_economics (id, offer_id, tax_rate, gateway_fixed_fee, gateway_pct_fee, other_variable_cost, target_net_margin, is_demo)
         VALUES (gen_random_uuid(), $1, 0.06, 0.99, 0.0199, 5.00, 0.30, FALSE)
         ON CONFLICT (offer_id, is_demo) DO UPDATE SET tax_rate = 0.06, gateway_fixed_fee = 0.99, gateway_pct_fee = 0.0199, other_variable_cost = 5.00, target_net_margin = 0.30`,
        [offId]
      );

      // Create a paid customer, order and payment
      const custRes = await pool.query(
        `INSERT INTO customers (id, name, email)
         VALUES (gen_random_uuid(), 'Cliente Unit', 'cliente.unit@testmatrix.com')
         RETURNING id`
      );
      const custId = custRes.rows[0].id;

      const ordRes = await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
         VALUES (gen_random_uuid(), $1, 100.00, 'PAID', $2, FALSE, 'COMMERCIAL_PRODUCTION')
         RETURNING id`,
        [custId, crypto.randomUUID()]
      );
      const ordId = ordRes.rows[0].id;

      await pool.query(
        `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, quantity, unit_price, total_price, data_provenance)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Produto Unit Economics', 'Oferta Unit Economics', 1, 100.00, 100.00, 'COMMERCIAL_PRODUCTION')`,
        [ordId, offId, prodId]
      );

      await pool.query(
        `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, provider_fee, external_reference, is_demo, data_provenance, created_at)
         VALUES (gen_random_uuid(), 'PG-UNIT-01', $1, 'ASAAS', 'CONFIRMED', 100.00, $2, 1.99, 'ext_ref_unit_01', FALSE, 'COMMERCIAL_PRODUCTION', NOW())`,
        [ordId, crypto.randomUUID()]
      );

      // Call dashboard
      const dashRes = await request(app)
        .get('/api/financial/dashboard?mode=real')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.summary.grossRevenue).toBeGreaterThan(0);
      expect(dashRes.body.summary.otherCosts).toBeGreaterThan(0); // non-zero, incorporates taxes & variable costs

      const offerData = dashRes.body.byOffer.find((o: any) => o.offerId === offId || o.offer_id === offId || o.offerHumanId === 'OFF-UNIT-01');
      expect(offerData).toBeDefined();
      expect(offerData.breakeven_cpa).toBeGreaterThan(0);
      expect(offerData.target_cpa).toBeGreaterThan(0);
      expect(offerData.breakeven_roas).toBeGreaterThan(0);
      expect(offerData.target_roas).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // ITEM 4: FUNIL TELEMETRY
  // ==========================================
  describe('4. Commercial Funnel Telemetry', () => {
    it('4.1 commercial_funnel_events: Accepts PIX_GENERATED, PIX_EXPIRED, and PAID events', async () => {
      const events = ['PIX_GENERATED', 'PIX_EXPIRED', 'PAID'];

      for (const ev of events) {
        const res = await pool.query(
          `INSERT INTO commercial_funnel_events (id, event_id, session_id, visitor_id, event_type, is_demo)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, FALSE)
           RETURNING event_type`,
          ['ev_' + crypto.randomUUID(), 'sess_' + crypto.randomUUID(), 'vis_' + crypto.randomUUID(), ev]
        );
        expect(res.rows[0].event_type).toBe(ev);
      }
    });
  });

  // ==========================================
  // ITEM 5: HONESTIDADE DOS DADOS (AI BADGE)
  // ==========================================
  describe('5. Honestidade dos Dados', () => {
    it('5.1 AI Analysis Honesty: Marks analysis as simulated and does not claim real scores when provider is Mock', async () => {
      // Create opportunity
      const oppRes = await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES (gen_random_uuid(), 'OPP-AI-HONEST-01', 'Oportunidade Teste IA', 'INFO', 'Sub', 'Desc', 'Audience', 'Problem', 'Format', 'Source', 'DESCOBERTA', FALSE)
         RETURNING id`
      );
      const oppId = oppRes.rows[0].id;

      // Call analysis endpoint
      const res = await request(app)
        .post(`/api/opportunities/${oppId}/analyze?mode=real`)
        .set('Authorization', `Bearer ${intelligenceToken}`);

      expect(res.status).toBe(200);
      expect(res.body.is_simulated).toBe(true);
      expect(res.body.ai_analysis_status).toBe('ANÁLISE SIMULADA');

      // Verify listing returns simulated badge data
      const listRes = await request(app)
        .get('/api/opportunities?mode=real')
        .set('Authorization', `Bearer ${intelligenceToken}`);

      expect(listRes.status).toBe(200);
      const oppInList = listRes.body.opportunities.find((o: any) => o.id === oppId);
      expect(oppInList).toBeDefined();
      expect(oppInList.is_simulated).toBe(true);
      expect(oppInList.ai_analysis_status).toBe('ANÁLISE SIMULADA');
      expect(oppInList.score_type).toBe('SIMULADA');
    });
  });
});
