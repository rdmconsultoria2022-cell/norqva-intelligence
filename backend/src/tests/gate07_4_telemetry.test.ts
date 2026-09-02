import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe('NORQVA — GATE 07.4: FIRST-PARTY ATTRIBUTION & FUNNEL TELEMETRY', () => {
  let pool: Pool;
  let adminToken: string;
  let testOfferId: string;
  let testCustomerId: string;

  beforeEach(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.telemetry@norqva.com', 'Admin Telemetry', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    // Create a real active product and offer
    const prodRes = await pool.query(
      `INSERT INTO products (human_id, name, description, category, is_demo)
       VALUES ('PROD-TLM001', 'Guia Digital Telemetria', 'Produto de teste de telemetria', 'DIGITAL_PRODUCT', false)
       ON CONFLICT (human_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const prodId = prodRes.rows[0].id;

    const offerRes = await pool.query(
      `INSERT INTO offers (human_id, product_id, name, description, price, promotional_price, status, is_demo)
       VALUES ('OFF-TLM001', $1, 'Oferta Telemetria', 'Oferta para validação de telemetria', 29.90, 19.90, 'ATIVA', false)
       ON CONFLICT (human_id) DO UPDATE SET price = EXCLUDED.price, status = 'ATIVA'
       RETURNING id`,
      [prodId]
    );
    testOfferId = offerRes.rows[0].id;

    // Create a customer
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, is_demo)
       VALUES ('Comprador Teste', 'comprador.telemetria@norqva.com', false)
       ON CONFLICT (email, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    testCustomerId = custRes.rows[0].id;
  });

  // T01 — Telemetria: Registro bem-sucedido de LANDING_PAGE_VIEW e OFFER_VIEW
  it('T01: Public telemetry endpoint accepts valid LANDING_PAGE_VIEW and OFFER_VIEW events', async () => {
    const eventId1 = 'evt_landing_' + crypto.randomUUID();
    const res1 = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: eventId1,
        event_type: 'LANDING_PAGE_VIEW',
        visitor_id: 'v_anon_12345',
        session_id: 's_anon_67890',
        path: '/p/OFF-TLM001?utm_source=facebook&utm_campaign=cbo_teste',
        utm_source: 'facebook',
        utm_campaign: 'cbo_teste',
        fbclid: 'fb_clk_abc123'
      });

    expect(res1.status).toBe(201);
    expect(res1.body.success).toBe(true);
    expect(res1.body.event_id).toBe(eventId1);
    expect(res1.body.recorded).toBe(true);

    const eventId2 = 'evt_offer_' + crypto.randomUUID();
    const res2 = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: eventId2,
        event_type: 'OFFER_VIEW',
        visitor_id: 'v_anon_12345',
        session_id: 's_anon_67890',
        offer_human_id: 'OFF-TLM001',
        path: '/p/OFF-TLM001'
      });

    expect(res2.status).toBe(201);
    expect(res2.body.success).toBe(true);
  });

  // T02 — Telemetria: Rejeita tipos de eventos inválidos
  it('T02: Telemetry endpoint rejects unauthorized event types (Fail Closed)', async () => {
    const res = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: 'evt_invalid',
        event_type: 'PURCHASE_COMPLETED',
        visitor_id: 'v_anon_12345'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid event_type');
  });

  // T03 — Telemetria: Rejeita payloads sem event_id ou visitor_id
  it('T03: Telemetry endpoint requires event_id and visitor_id', async () => {
    const resNoVid = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: 'evt_test_1',
        event_type: 'LANDING_PAGE_VIEW'
      });
    expect(resNoVid.status).toBe(400);
    expect(resNoVid.body.error).toContain('visitor_id is required');

    const resNoEid = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_type: 'LANDING_PAGE_VIEW',
        visitor_id: 'v_123'
      });
    expect(resNoEid.status).toBe(400);
    expect(resNoEid.body.error).toContain('event_id is required');
  });

  // T04 — Telemetria: Deduplicação e Idempotência (mesmo event_id não duplica)
  it('T04: Telemetry endpoint deduplicates events with identical event_id', async () => {
    const eventId = 'evt_dedup_' + crypto.randomUUID();
    const payload = {
      event_id: eventId,
      event_type: 'LANDING_PAGE_VIEW',
      visitor_id: 'v_dedup_user',
      path: '/p/OFF-TLM001'
    };

    const res1 = await request(app)
      .post('/api/public/telemetry/events')
      .send(payload);
    expect(res1.status).toBe(201);
    expect(res1.body.recorded).toBe(true);

    const res2 = await request(app)
      .post('/api/public/telemetry/events')
      .send(payload);
    expect(res2.status).toBe(200);
    expect(res2.body.recorded).toBe(false);

    const countRes = await pool.query(
      'SELECT COUNT(*)::int as cnt FROM commercial_funnel_events WHERE event_id = $1',
      [eventId]
    );
    expect(countRes.rows[0].cnt).toBe(1);
  });

  // T05 — Segurança: Telemetria não permite mutação de estado financeiro ou pedido
  it('T05: Telemetry payload sanitization strictly strips financial and order status fields', async () => {
    const eventId = 'evt_sec_' + crypto.randomUUID();
    const res = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: eventId,
        event_type: 'CHECKOUT_STARTED',
        visitor_id: 'v_attacker_001',
        metadata: {
          status: 'PAID',
          payment_status: 'CONFIRMED',
          total_amount: 0.01,
          custom_tag: 'promo_v1'
        }
      });

    expect(res.status).toBe(201);

    const dbRes = await pool.query(
      'SELECT metadata FROM commercial_funnel_events WHERE event_id = $1',
      [eventId]
    );
    const meta = dbRes.rows[0].metadata;
    expect(meta).toHaveProperty('custom_tag', 'promo_v1');
    expect(meta).not.toHaveProperty('status');
    expect(meta).not.toHaveProperty('payment_status');
    expect(meta).not.toHaveProperty('total_amount');
  });

  // T06 — Atribuição no Pedido: fbclid, UTMs, visitor_id e session_id são persistidos na criação do pedido
  it('T06: Checkout order creation captures and persists attribution context (fbclid, UTMs, visitor_id)', async () => {
    const idempotencyKey = crypto.randomUUID();
    const visitorId = 'v_meta_buyer_999';
    const sessionId = 's_meta_session_888';
    const fbclid = 'fb.1.1725220000.IwAR2_test_sample';
    const utmSource = 'facebook';
    const utmMedium = 'cpc';
    const utmCampaign = 'norqva_e2e_meta_teste_01';
    const utmContent = 'ad_01_direct_response';

    const checkoutRes = await request(app)
      .post('/api/checkout')
      .send({
        offer_id: testOfferId,
        customer_id: testCustomerId,
        quantity: 1,
        idempotency_key: idempotencyKey,
        visitor_id: visitorId,
        session_id: sessionId,
        fbclid: fbclid,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent
      });

    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.id;
    expect(orderId).toBeDefined();

    // Verify database persistence in orders table
    const orderDbRes = await pool.query(
      'SELECT id, visitor_id, session_id, fbclid, utm_source, utm_medium, utm_campaign, utm_content FROM orders WHERE id = $1',
      [orderId]
    );
    expect(orderDbRes.rows.length).toBe(1);
    const order = orderDbRes.rows[0];
    expect(order.visitor_id).toBe(visitorId);
    expect(order.session_id).toBe(sessionId);
    expect(order.fbclid).toBe(fbclid);
    expect(order.utm_source).toBe(utmSource);
    expect(order.utm_medium).toBe(utmMedium);
    expect(order.utm_campaign).toBe(utmCampaign);
    expect(order.utm_content).toBe(utmContent);
  });

  // T07 — Correlação Visitor → Order: Visitor da visita é idêntico ao visitor do pedido
  it('T07: Correlates funnel telemetry visitor_id with order attribution visitor_id', async () => {
    const sharedVisitorId = 'v_correlate_777';
    const sharedSessionId = 's_correlate_555';
    const sharedFbclid = 'fb.1.1725220000.CORRELATED_CLICK';

    // 1. Visitor views landing page
    await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: 'evt_' + crypto.randomUUID(),
        event_type: 'LANDING_PAGE_VIEW',
        visitor_id: sharedVisitorId,
        session_id: sharedSessionId,
        fbclid: sharedFbclid,
        path: '/p/OFF-TLM001'
      });

    // 2. Visitor views offer
    await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: 'evt_' + crypto.randomUUID(),
        event_type: 'OFFER_VIEW',
        visitor_id: sharedVisitorId,
        session_id: sharedSessionId,
        offer_human_id: 'OFF-TLM001',
        fbclid: sharedFbclid,
        path: '/p/OFF-TLM001'
      });

    // 3. Visitor completes checkout
    const idempotencyKey = crypto.randomUUID();
    const orderRes = await request(app)
      .post('/api/checkout')
      .send({
        offer_id: testOfferId,
        customer_id: testCustomerId,
        quantity: 1,
        idempotency_key: idempotencyKey,
        visitor_id: sharedVisitorId,
        session_id: sharedSessionId,
        fbclid: sharedFbclid
      });
    expect(orderRes.status).toBe(201);

    // 4. Query correlation via SQL join
    const correlationRes = await pool.query(
      `SELECT o.id as order_id, o.visitor_id as order_visitor, count(e.id)::int as event_count
       FROM orders o
       JOIN commercial_funnel_events e ON e.visitor_id = o.visitor_id
       WHERE o.id = $1
       GROUP BY o.id, o.visitor_id`,
      [orderRes.body.id]
    );

    expect(correlationRes.rows.length).toBe(1);
    expect(correlationRes.rows[0].order_visitor).toBe(sharedVisitorId);
    expect(correlationRes.rows[0].event_count).toBeGreaterThanOrEqual(2);
  });

  // T08 — Backward Compatibility: Checkout sem attribution params continua funcionando normalmente
  it('T08: Backward-compatible: checkout without attribution parameters succeeds with null values', async () => {
    const idempotencyKey = crypto.randomUUID();
    const res = await request(app)
      .post('/api/checkout')
      .send({
        offer_id: testOfferId,
        customer_id: testCustomerId,
        quantity: 1,
        idempotency_key: idempotencyKey
      });

    expect(res.status).toBe(201);
    const orderDb = await pool.query('SELECT visitor_id, fbclid, utm_source FROM orders WHERE id = $1', [res.body.id]);
    expect(orderDb.rows[0].visitor_id).toBeNull();
    expect(orderDb.rows[0].fbclid).toBeNull();
    expect(orderDb.rows[0].utm_source).toBeNull();
  });

  // T09 — Admin Telemetry Summary Endpoint
  it('T09: Admin can query funnel telemetry summary and recent events', async () => {
    const res = await request(app)
      .get('/api/admin/telemetry/funnel-summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('recentEvents');
    expect(Array.isArray(res.body.summary)).toBe(true);
  });
});