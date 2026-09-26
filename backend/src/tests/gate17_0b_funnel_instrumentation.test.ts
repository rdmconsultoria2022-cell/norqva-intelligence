import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import express, { Express } from 'express';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { recordFunnelEvent, getFunnelEventsSummary } from '../controllers/telemetryController';

describe('NORQVA — GATE 17.0B: SURGICAL FUNNEL INSTRUMENTATION (CHECKOUT_MODAL_OPENED)', () => {
  let pool: Pool;
  let app: Express;
  let testOfferId: string;
  const adminUserId = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);

    app = express();
    app.use(express.json());
    app.set('db', pool);

    // Public telemetry route
    app.post('/api/public/telemetry/events', recordFunnelEvent);

    // Mock authenticated admin route
    app.get('/api/admin/telemetry/funnel-summary', (req: any, _res: any, next: any) => {
      req.user = { id: adminUserId, email: 'admin@norqva.com', role: 'ADMIN' };
      next();
    }, getFunnelEventsSummary);
  });

  beforeEach(async () => {
    // Create a product and offer
    const prodRes = await pool.query(
      `INSERT INTO products (human_id, name, description, category, is_demo)
       VALUES ('PROD-G17B-01', 'Bolso Blindado V1.1', 'Gestão Financeira Pessoal', 'DIGITAL_PRODUCT', false)
       ON CONFLICT (human_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const prodId = prodRes.rows[0].id;

    const offerRes = await pool.query(
      `INSERT INTO offers (human_id, product_id, name, description, price, promotional_price, status, is_demo)
       VALUES ('OFF-G17B-01', $1, 'Método Bolso Blindado', 'Acesso Vitalício ao App', 47.00, 27.90, 'ATIVA', false)
       ON CONFLICT (human_id) DO UPDATE SET price = EXCLUDED.price, status = 'ATIVA'
       RETURNING id`,
      [prodId]
    );
    testOfferId = offerRes.rows[0].id;
  });

  // T01: Telemetry endpoint accepts CHECKOUT_MODAL_OPENED
  it('T01: accepts valid CHECKOUT_MODAL_OPENED event and records in DB', async () => {
    const eventId = 'evt_cmo_' + crypto.randomUUID();
    const res = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: eventId,
        event_type: 'CHECKOUT_MODAL_OPENED',
        visitor_id: 'v_funnel_cta_001',
        session_id: 's_funnel_sess_001',
        offer_human_id: 'OFF-G17B-01',
        path: '/p/OFF-G17B-01?utm_source=meta&utm_campaign=cbo_escala_01',
        utm_source: 'meta',
        utm_campaign: 'cbo_escala_01',
        fbclid: 'fb_click_id_9999',
        metadata: {
          offer_name: 'Método Bolso Blindado',
          cta_location: 'hero_primary'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.event_id).toBe(eventId);
    expect(res.body.recorded).toBe(true);

    // Verify DB persistence
    const dbRes = await pool.query(
      `SELECT event_type, visitor_id, session_id, offer_human_id, utm_source, utm_campaign, fbclid, metadata, is_demo
       FROM commercial_funnel_events
       WHERE event_id = $1`,
      [eventId]
    );

    expect(dbRes.rows.length).toBe(1);
    const row = dbRes.rows[0];
    expect(row.event_type).toBe('CHECKOUT_MODAL_OPENED');
    expect(row.visitor_id).toBe('v_funnel_cta_001');
    expect(row.session_id).toBe('s_funnel_sess_001');
    expect(row.offer_human_id).toBe('OFF-G17B-01');
    expect(row.utm_source).toBe('meta');
    expect(row.utm_campaign).toBe('cbo_escala_01');
    expect(row.fbclid).toBe('fb_click_id_9999');
    expect(row.metadata).toEqual({
      offer_name: 'Método Bolso Blindado',
      cta_location: 'hero_primary'
    });
    expect(row.is_demo).toBe(false);
  });

  // T02: Deduplication / Idempotency for CHECKOUT_MODAL_OPENED
  it('T02: deduplicates duplicate emissions of CHECKOUT_MODAL_OPENED with same event_id', async () => {
    const eventId = 'evt_cmo_dedup_' + crypto.randomUUID();
    const payload = {
      event_id: eventId,
      event_type: 'CHECKOUT_MODAL_OPENED',
      visitor_id: 'v_funnel_cta_002',
      session_id: 's_funnel_sess_002',
      offer_human_id: 'OFF-G17B-01',
      path: '/p/OFF-G17B-01'
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

  // T03: Rejects invalid or arbitrary event types
  it('T03: strictly rejects non-canonical event types (fail-closed)', async () => {
    const res = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: 'evt_invalid_' + crypto.randomUUID(),
        event_type: 'MODAL_CLICKED',
        visitor_id: 'v_user_123'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid event_type');
    expect(res.body.error).toContain('CHECKOUT_MODAL_OPENED');
  });

  // T04: Metadata sanitization removes dangerous financial/status mutation fields
  it('T04: sanitizes metadata and strips order/status/financial parameters', async () => {
    const eventId = 'evt_cmo_sec_' + crypto.randomUUID();
    const res = await request(app)
      .post('/api/public/telemetry/events')
      .send({
        event_id: eventId,
        event_type: 'CHECKOUT_MODAL_OPENED',
        visitor_id: 'v_attacker_cta',
        metadata: {
          status: 'PAID',
          total_amount: 0.00,
          payment_status: 'CONFIRMED',
          order_id: '00000000-0000-0000-0000-000000000000',
          legitimate_label: 'cta_bottom'
        }
      });

    expect(res.status).toBe(201);

    const dbRes = await pool.query(
      'SELECT metadata FROM commercial_funnel_events WHERE event_id = $1',
      [eventId]
    );
    const meta = dbRes.rows[0].metadata;
    expect(meta).toHaveProperty('legitimate_label', 'cta_bottom');
    expect(meta).not.toHaveProperty('status');
    expect(meta).not.toHaveProperty('total_amount');
    expect(meta).not.toHaveProperty('payment_status');
    expect(meta).not.toHaveProperty('order_id');
  });

  // T05: DEMO vs REAL isolation
  it('T05: isolates DEMO mode events from REAL events', async () => {
    const demoEventId = 'evt_cmo_demo_' + crypto.randomUUID();
    const resDemo = await request(app)
      .post('/api/public/telemetry/events?mode=demo')
      .send({
        event_id: demoEventId,
        event_type: 'CHECKOUT_MODAL_OPENED',
        visitor_id: 'v_demo_visitor',
        offer_human_id: 'OFF-G17B-01'
      });

    expect(resDemo.status).toBe(201);

    const realRes = await pool.query(
      'SELECT id FROM commercial_funnel_events WHERE event_id = $1 AND is_demo = false',
      [demoEventId]
    );
    expect(realRes.rows.length).toBe(0);

    const demoRes = await pool.query(
      'SELECT id, is_demo FROM commercial_funnel_events WHERE event_id = $1 AND is_demo = true',
      [demoEventId]
    );
    expect(demoRes.rows.length).toBe(1);
    expect(demoRes.rows[0].is_demo).toBe(true);
  });

  // T06: Summary endpoint aggregates CHECKOUT_MODAL_OPENED correctly
  it('T06: admin telemetry summary includes CHECKOUT_MODAL_OPENED event counts', async () => {
    const res = await request(app)
      .get('/api/admin/telemetry/funnel-summary');

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    const cmoRow = res.body.summary.find((s: any) => s.event_type === 'CHECKOUT_MODAL_OPENED');
    expect(cmoRow).toBeDefined();
    expect(Number(cmoRow.total_events)).toBeGreaterThanOrEqual(1);
  });
});
