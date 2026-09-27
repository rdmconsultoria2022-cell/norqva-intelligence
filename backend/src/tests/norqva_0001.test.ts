import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';
import { AsaasPaymentProvider } from '../utils/payment';
import { MetaCapiService } from '../services/meta/metaCapiService';
import { processCapiRetries } from '../services/meta/capiRetryJob';

describe('NORQVA-0001 — Contract Verification Suite', () => {
  let pool: Pool;
  let adminToken: string;
  let performanceToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await seedDemoData(pool);

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.norqva0001@norqva.com', 'Admin NORQVA-0001', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    const perfAuthId = crypto.randomUUID();
    const perfRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'perf.norqva0001@norqva.com', 'Perf NORQVA-0001', 'PERFORMANCE', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'PERFORMANCE', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [perfAuthId]
    );
    performanceToken = signSupabaseToken({
      sub: perfRes.rows[0].auth_user_id,
      email: perfRes.rows[0].email,
      role: 'PERFORMANCE'
    });
  }, 30000);

  afterAll(async () => {
    try {
      await pool.query(`DELETE FROM users WHERE email IN ('admin.norqva0001@norqva.com', 'perf.norqva0001@norqva.com')`);
    } catch (_) {}
  });

  // ==============================================================
  // Item 2: Nada de "enviado" falso (No fake sent when token missing)
  // ==============================================================
  describe('Item 2 — Honest CAPI recording (no fake sent)', () => {
    it('records SKIPPED and error_message when META_ACCESS_TOKEN is missing without fetch call', async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      delete process.env.META_ACCESS_TOKEN;

      const fetchSpy = vi.spyOn(global, 'fetch');

      const eventId = `test_capi_skip_${Date.now()}`;
      const result = await MetaCapiService.sendEvent(pool, {
        eventName: 'Purchase',
        eventId,
        value: 197.00,
        currency: 'BRL',
        email: 'skip.user@test.com',
        phone: '11999999999',
        isDemo: true
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('SKIPPED');
      expect(fetchSpy).not.toHaveBeenCalled();

      const dbRes = await pool.query('SELECT status, error_message, response_body FROM capi_events WHERE event_id = $1', [eventId]);
      expect(dbRes.rows.length).toBe(1);
      expect(dbRes.rows[0].status).toBe('SKIPPED');
      expect(dbRes.rows[0].error_message).toBe('META_ACCESS_TOKEN ausente');

      if (originalToken) {
        process.env.META_ACCESS_TOKEN = originalToken;
      }
      fetchSpy.mockRestore();
    });
  });

  // ==============================================================
  // Item 3: Retentativa real e idempotência
  // ==============================================================
  describe('Item 3 — CAPI Retry & Idempotency', () => {
    it('returns without retransmitting if event is already marked as SENT', async () => {
      const eventId = `test_capi_sent_${Date.now()}`;
      await pool.query(
        `INSERT INTO capi_events (event_name, event_id, pixel_id, action_source, payload, status, is_demo)
         VALUES ('Purchase', $1, 'pix_123', 'website', '{"event_name":"Purchase","event_time":1700000000}', 'SENT', TRUE)`,
        [eventId]
      );

      const fetchSpy = vi.spyOn(global, 'fetch');
      const result = await MetaCapiService.sendEvent(pool, {
        eventName: 'Purchase',
        eventId,
        isDemo: true
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });

    it('processCapiRetries retries FAILED event using preserved payload and original event_time', async () => {
      const originalToken = process.env.META_ACCESS_TOKEN;
      process.env.META_ACCESS_TOKEN = 'EAAB_test_mock_token';

      const originalEventTime = 1680000000;
      const eventId = `test_capi_retry_${Date.now()}`;
      // Other suites leave capi_events behind on the shared test DB; the job picks the
      // 50 oldest eligible rows, so clear them to make this test deterministic.
      await pool.query('DELETE FROM capi_events');
      const payload = {
        event_name: 'Purchase',
        event_time: originalEventTime,
        event_id: eventId,
        action_source: 'website',
        user_data: { em: ['mockhash'] }
      };

      await pool.query(
        `INSERT INTO capi_events (event_name, event_id, pixel_id, action_source, payload, status, attempts, is_demo, created_at)
         VALUES ('Purchase', $1, 'pix_123', 'website', $2, 'FAILED', 1, TRUE, NOW())`,
        [eventId, JSON.stringify(payload)]
      );

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ events_received: 1, fbtrace_id: 'real_trace_123' })
      } as any);

      const retryRes = await processCapiRetries(pool);
      expect(retryRes.processed).toBeGreaterThanOrEqual(1);

      expect(fetchSpy).toHaveBeenCalled();
      const targetCall = fetchSpy.mock.calls.find(c => {
        try {
          const b = JSON.parse(c[1]?.body as string);
          return b.data[0]?.event_id === eventId;
        } catch {
          return false;
        }
      });
      expect(targetCall).toBeDefined();
      const calledBody = JSON.parse(targetCall![1]?.body as string);
      expect(calledBody.data[0].event_time).toBe(originalEventTime);

      const dbRes = await pool.query('SELECT status, attempts FROM capi_events WHERE event_id = $1', [eventId]);
      expect(dbRes.rows[0].status).toBe('SENT');

      if (originalToken) process.env.META_ACCESS_TOKEN = originalToken;
      else delete process.env.META_ACCESS_TOKEN;
      fetchSpy.mockRestore();
    });

    it('does NOT retry events older than 6 days', async () => {
      const eventId = `test_capi_old_${Date.now()}`;
      await pool.query(
        `INSERT INTO capi_events (event_name, event_id, pixel_id, action_source, payload, status, attempts, is_demo, created_at)
         VALUES ('Purchase', $1, 'pix_123', 'website', '{"event_time":1600000000}', 'FAILED', 1, TRUE, NOW() - INTERVAL '7 days')`,
        [eventId]
      );

      const fetchSpy = vi.spyOn(global, 'fetch');
      const retryRes = await processCapiRetries(pool);
      const dbRes = await pool.query('SELECT status FROM capi_events WHERE event_id = $1', [eventId]);
      expect(dbRes.rows[0].status).toBe('FAILED');
      fetchSpy.mockRestore();
    });

    it('does NOT retry permanent 4xx errors (non-429)', async () => {
      const eventId = `test_capi_400_${Date.now()}`;
      await pool.query(
        `INSERT INTO capi_events (event_name, event_id, pixel_id, action_source, payload, status, attempts, max_attempts, response_status, is_demo, created_at)
         VALUES ('Purchase', $1, 'pix_123', 'website', '{"event_time":1700000000}', 'FAILED', 1, 8, 400, TRUE, NOW())`,
        [eventId]
      );

      const fetchSpy = vi.spyOn(global, 'fetch');
      await processCapiRetries(pool);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  // ==============================================================
  // Item 4: DRE nunca descarta custos
  // ==============================================================
  describe('Item 4 — Financial DRE never discards costs', () => {
    it('includes taxes, variable costs and prorated fixed costs in totalCosts even when payment fees are unknown', async () => {
      const prodRes = await pool.query('SELECT id FROM products WHERE is_demo = TRUE LIMIT 1');
      const productId = prodRes.rows[0].id;

      // 1. Create offer with unit economics
      const offerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, name, description, price, product_id, is_demo, is_deleted)
         VALUES ($1, 'OFF-DRE-01', 'Oferta DRE Teste', 'Desc DRE Teste', 200.00, $2, TRUE, FALSE)
         ON CONFLICT (id) DO NOTHING`,
        [offerId, productId]
      );
      await pool.query(
        `INSERT INTO offer_unit_economics (offer_id, tax_rate, gateway_fixed_fee, gateway_pct_fee, other_variable_cost, target_net_margin, is_demo)
         VALUES ($1, 0.1000, 2.00, 0.0500, 10.00, 0.2000, TRUE)
         ON CONFLICT (offer_id, is_demo) DO UPDATE SET tax_rate = 0.1000, other_variable_cost = 10.00`,
        [offerId]
      );

      // 2. Set business fixed costs
      await pool.query(
        `INSERT INTO business_cost_settings (monthly_fixed_costs, is_demo)
         VALUES (3000.00, TRUE)
         ON CONFLICT (is_demo) DO UPDATE SET monthly_fixed_costs = 3000.00`
      );

      // 3. Create paid order with a confirmed payment with provider_fee = NULL (unknown fee)
      const orderId = crypto.randomUUID();
      const customerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO customers (id, name, email, is_demo) VALUES ($1, 'DRE Customer', 'dre@test.com', TRUE)`,
        [customerId]
      );
      await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key)
         VALUES ($1, $2, 200.00, 'PAID', TRUE, 'QA_FIXTURE', $3)`,
        [orderId, customerId, crypto.randomUUID()]
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, quantity, unit_price, total_price)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Product Test DRE', 'Offer Test DRE', 1, 200.00, 200.00)`,
        [orderId, offerId, productId]
      );
      await pool.query(
        `INSERT INTO payments (id, human_id, order_id, provider, amount, status, provider_fee, net_amount, idempotency_key, external_reference, is_demo, data_provenance)
         VALUES (gen_random_uuid(), 'PAY-DRE-001', $1, 'ASAAS', 200.00, 'CONFIRMED', NULL, 200.00, $2, $3, TRUE, 'QA_FIXTURE')`,
        [orderId, crypto.randomUUID(), crypto.randomUUID()]
      );

      const res = await request(app)
        .get('/api/financial/dashboard?mode=demo&period=30d')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.costCoverage).toBe('UNKNOWN');
      expect(res.body.summary.otherCosts).toBeGreaterThan(0);
      expect(res.body.summary.totalCosts).toBe(res.body.summary.gatewayFees + res.body.summary.otherCosts);
      expect(res.body.summary.totalCosts).toBeGreaterThan(0);
    });
  });

  // ==============================================================
  // Item 5: Unit economics configurável e honesto
  // ==============================================================
  describe('Item 5 — Configurable & Honest Unit Economics', () => {
    it('RBAC: Rejects non-ADMIN users from unit economics routes with 403', async () => {
      const resOffer = await request(app)
        .get('/api/offers/OFF-000001/unit-economics?mode=demo')
        .set('Authorization', `Bearer ${performanceToken}`);
      expect(resOffer.status).toBe(403);

      const resCosts = await request(app)
        .get('/api/settings/business-costs?mode=demo')
        .set('Authorization', `Bearer ${performanceToken}`);
      expect(resCosts.status).toBe(403);
    });

    it('Validates parameter bounds on PUT /api/offers/:id/unit-economics (returns 400 for out of range)', async () => {
      const prodRes = await pool.query('SELECT id FROM products WHERE is_demo = TRUE LIMIT 1');
      const productId = prodRes.rows[0].id;

      const offerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, name, description, price, product_id, is_demo, is_deleted)
         VALUES ($1, 'OFF-UE-VAL', 'Oferta Validation Test', 'Desc Validation', 100.00, $2, TRUE, FALSE)
         ON CONFLICT (id) DO NOTHING`,
        [offerId, productId]
      );

      // tax_rate > 0.5
      const res1 = await request(app)
        .put(`/api/offers/${offerId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tax_rate: 0.6, gateway_pct_fee: 0.05, gateway_fixed_fee: 1, other_variable_cost: 0, target_net_margin: 0.2 });
      expect(res1.status).toBe(400);

      // gateway_pct_fee > 0.2
      const res2 = await request(app)
        .put(`/api/offers/${offerId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tax_rate: 0.1, gateway_pct_fee: 0.25, gateway_fixed_fee: 1, other_variable_cost: 0, target_net_margin: 0.2 });
      expect(res2.status).toBe(400);

      // gateway_fixed_fee > 50
      const res3 = await request(app)
        .put(`/api/offers/${offerId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tax_rate: 0.1, gateway_pct_fee: 0.05, gateway_fixed_fee: 60, other_variable_cost: 0, target_net_margin: 0.2 });
      expect(res3.status).toBe(400);

      // other_variable_cost < 0
      const res4 = await request(app)
        .put(`/api/offers/${offerId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tax_rate: 0.1, gateway_pct_fee: 0.05, gateway_fixed_fee: 1, other_variable_cost: -5, target_net_margin: 0.2 });
      expect(res4.status).toBe(400);

      // Valid configuration succeeds
      const resValid = await request(app)
        .put(`/api/offers/${offerId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ tax_rate: 0.08, gateway_pct_fee: 0.04, gateway_fixed_fee: 1.5, other_variable_cost: 5, target_net_margin: 0.25 });
      expect(resValid.status).toBe(200);
      expect(resValid.body.status).toBe('CONFIGURED');
      expect(resValid.body.unit_economics.tax_rate).toBe(0.08);
    });

    it('returns UNCONFIGURED and null metrics for offers without unit economics', async () => {
      const prodRes = await pool.query('SELECT id FROM products WHERE is_demo = TRUE LIMIT 1');
      const productId = prodRes.rows[0].id;

      const unconfOfferId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, name, description, price, product_id, is_demo, is_deleted)
         VALUES ($1, 'OFF-UNCONF-01', 'Oferta Sem Custos', 'Desc Sem Custos', 150.00, $2, TRUE, FALSE)`,
        [unconfOfferId, productId]
      );

      const res = await request(app)
        .get(`/api/offers/${unconfOfferId}/unit-economics?mode=demo`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('UNCONFIGURED');
      expect(res.body.unit_economics).toBeNull();
    });

    it('business-costs settings GET and PUT work correctly', async () => {
      const putRes = await request(app)
        .put('/api/settings/business-costs?mode=demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ monthly_fixed_costs: 4500.00 });
      expect(putRes.status).toBe(200);
      expect(putRes.body.settings.monthly_fixed_costs).toBe(4500.00);

      const getRes = await request(app)
        .get('/api/settings/business-costs?mode=demo')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.monthly_fixed_costs).toBe(4500.00);
    });
  });

  // ==============================================================
  // Item 6: Pix vencido entra no funil
  // ==============================================================
  describe('Item 6 — Pix overdue in commercial funnel', () => {
    it('PAYMENT_OVERDUE webhook reconciles payment to EXPIRED and emits PIX_EXPIRED with full attribution', async () => {
      const authToken = 'norqva_test_webhook_auth_token';
      process.env.ASAAS_WEBHOOK_AUTH_TOKEN = authToken;

      const prodRes = await pool.query('SELECT id FROM products WHERE is_demo = TRUE LIMIT 1');
      const productId = prodRes.rows[0].id;
      const offerRes = await pool.query('SELECT id FROM offers WHERE is_demo = TRUE LIMIT 1');
      const offerId = offerRes.rows[0].id;

      const orderId = crypto.randomUUID();
      const customerId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const asaasPaymentId = 'pay_asaas_overdue_123';

      await pool.query(
        `INSERT INTO customers (id, name, email, is_demo) VALUES ($1, 'Overdue Customer', 'overdue@test.com', TRUE)`,
        [customerId]
      );
      await pool.query(
        `INSERT INTO orders (
           id, customer_id, total_amount, status, is_demo, visitor_id, session_id, fbclid, utm_source, utm_campaign, idempotency_key
         )
         VALUES ($1, $2, 97.00, 'PENDING', TRUE, 'v_test_visitor_123', 's_test_session_123', 'IwAR_test_fbclid', 'meta', 'cmp_test', $3)`,
        [orderId, customerId, crypto.randomUUID()]
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, quantity, unit_price, total_price)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Product Test Overdue', 'Offer Test Overdue', 1, 97.00, 97.00)`,
        [orderId, offerId, productId]
      );
      await pool.query(
        `INSERT INTO payments (id, human_id, order_id, provider, amount, status, provider_payment_id, idempotency_key, external_reference, is_demo)
         VALUES ($1, 'PAY-OVERDUE-001', $2, 'ASAAS', 97.00, 'PENDING', $3, $4, $5, TRUE)`,
        [paymentId, orderId, asaasPaymentId, crypto.randomUUID(), paymentId]
      );

      // Mock Asaas provider getPayment returning OVERDUE
      const getPaymentSpy = vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockResolvedValue({
        status: 'OVERDUE',
        amount: 97.00
      });

      const webhookPayload = {
        event: 'PAYMENT_OVERDUE',
        payment: {
          id: asaasPaymentId,
          externalReference: paymentId,
          value: 97.00,
          status: 'OVERDUE'
        }
      };

      const res = await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', authToken)
        .send(webhookPayload);

      expect(res.status).toBe(200);

      // Check payment status is EXPIRED
      const payRes = await pool.query('SELECT status FROM payments WHERE id = $1', [paymentId]);
      expect(payRes.rows[0].status).toBe('EXPIRED');

      // Check commercial_funnel_events has PIX_EXPIRED with order attribution
      const funnelRes = await pool.query(
        `SELECT * FROM commercial_funnel_events WHERE event_type = 'PIX_EXPIRED' AND event_id = $1`,
        [`pix_exp_${paymentId}`]
      );
      expect(funnelRes.rows.length).toBe(1);
      expect(funnelRes.rows[0].visitor_id).toBe('v_test_visitor_123');
      expect(funnelRes.rows[0].session_id).toBe('s_test_session_123');
      expect(funnelRes.rows[0].fbclid).toBe('IwAR_test_fbclid');
      expect(funnelRes.rows[0].utm_source).toBe('meta');

      getPaymentSpy.mockRestore();
    });
  });

  // ==============================================================
  // Item 7: Score simulado fica simulado para sempre
  // ==============================================================
  describe('Item 7 — Persistent Simulated Score Tracking', () => {
    it('score recorded as simulated remains SIMULADA even if AGENTIC_AI_PROVIDER is altered later', async () => {
      const modelRes = await pool.query('SELECT id FROM score_models LIMIT 1');
      const scoreModelId = modelRes.rows[0].id;

      const oppId = crypto.randomUUID();
      const scoreId = crypto.randomUUID();

      await pool.query(
        `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
         VALUES ($1, 'OPP-SIM-01', 'Oportunidade Simulada Teste', 'Finanças', 'Investimentos', 'Desc', 'Público', 'Problema', 'EBOOK', 'META_ADS', 'DESCOBERTA', TRUE)`,
        [oppId]
      );

      await pool.query(
        `INSERT INTO opportunity_scores (
           id, opportunity_id, score_model_id, initial_product_score, critical_adjustment, final_product_score, confidence_score, is_demo, is_simulated, ai_provider
         )
         VALUES ($1, $2, $3, 80, 0, 80, 75, TRUE, TRUE, 'MOCK')`,
        [scoreId, oppId, scoreModelId]
      );

      // Set environment variable simulating openai provider
      const oldProvider = process.env.AGENTIC_AI_PROVIDER;
      process.env.AGENTIC_AI_PROVIDER = 'openai';

      const res = await request(app)
        .get('/api/opportunities?mode=demo')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const targetOpp = res.body.opportunities.find((o: any) => o.id === oppId);
      expect(targetOpp).toBeDefined();
      expect(targetOpp.is_simulated).toBe(true);
      expect(targetOpp.score_type).toBe('SIMULADA');
      expect(targetOpp.ai_analysis_status).toBe('ANÁLISE SIMULADA');

      if (oldProvider) process.env.AGENTIC_AI_PROVIDER = oldProvider;
      else delete process.env.AGENTIC_AI_PROVIDER;
    });
  });
});
