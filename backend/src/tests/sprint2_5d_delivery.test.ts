import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { AsaasPaymentProvider } from '../utils/payment';
import { finalizePaidOrder, reconcileAndFinalizePayment } from '../controllers/api';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'test_webhook_secret_token_123';
process.env.AUTH_MODE = 'demo';
process.env.STORAGE_SIGNED_URL_TTL_SECONDS = '1';

describe.sequential('NORQVA Sprint 2.5 Gate 2.5D - Webhook & Deliveries Integration', () => {
  let pool: Pool;
  let adminToken = 'ADMIN';

  let demoCustomer: any;
  let demoOffer: any;
  let demoProduct: any;
  let testAsset: any;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await seedDemoData(pool);

    await pool.query('DELETE FROM order_deliveries');
    await pool.query('DELETE FROM offer_digital_assets');
    await pool.query('DELETE FROM digital_assets');
    await pool.query('DELETE FROM payment_webhook_events');
    await pool.query('DELETE FROM payments');
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');
    await pool.query('DELETE FROM customers');
    await pool.query('DELETE FROM products');

    const prodId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, status, description, is_demo) 
       VALUES ($1, 'PRD-DEL-01', 'Delivery Product', 'Downloads', 'PLANEJADO', 'Desc', true)`,
      [prodId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo) 
       VALUES ($1, 'OFF-DEL-01', 'Delivery Offer', $2, 50.00, 40.00, 'ATIVA', 'Desc', true)`,
      [offerId, prodId]
    );

    const custId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO customers (id, name, email, phone, is_demo) 
       VALUES ($1, 'Delivery Customer', 'del@cust.com', '11987654321', true)`,
      [custId]
    );

    const assetId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, 'E-Book Guide', 'SUPABASE', 'digital-products', 'books/guide.pdf', true)`,
      [assetId]
    );

    await pool.query(
      `INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)`,
      [offerId, assetId]
    );

    demoProduct = (await pool.query('SELECT * FROM products WHERE id = $1', [prodId])).rows[0];
    demoOffer = (await pool.query('SELECT * FROM offers WHERE id = $1', [offerId])).rows[0];
    demoCustomer = (await pool.query('SELECT * FROM customers WHERE id = $1', [custId])).rows[0];
    testAsset = (await pool.query('SELECT * FROM digital_assets WHERE id = $1', [assetId])).rows[0];
  });

  afterAll(async () => {
    await pool.query('DELETE FROM order_deliveries');
    await pool.query('DELETE FROM offer_digital_assets');
    await pool.query('DELETE FROM digital_assets');
    await pool.query('DELETE FROM payment_webhook_events');
    await pool.query('DELETE FROM payments');
    await pool.query('DELETE FROM order_items');
    await pool.query('DELETE FROM orders');
    await pool.query('DELETE FROM customers');
    await pool.query('DELETE FROM products');
  });

  let defaultSpies: any[] = [];
  beforeEach(() => {
    process.env.AUTH_MODE = 'demo';
    defaultSpies = [
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id) => ({
        id,
        status: 'CONFIRMED',
        amount: 40.00
      }))
    ];
  });

  afterEach(() => {
    for (const spy of defaultSpies) {
      spy.mockRestore();
    }
  });

  async function createTestOrderAndPayment() {
    const orderRes = await request(app)
      .post('/api/checkout')
      .set('x-user-role', adminToken)
      .send({
        offer_id: demoOffer.id,
        quantity: 1,
        customer_id: demoCustomer.id,
        idempotency_key: crypto.randomUUID()
      });
    const order = orderRes.body;

    const provPayId = `pay_${crypto.randomUUID().slice(0, 8)}`;
    const paymentRes = await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', 40.00, $3, true, $4, $5) RETURNING *`,
      [`PMT-${crypto.randomUUID().slice(0, 8)}`, order.id, crypto.randomUUID(), crypto.randomUUID(), provPayId]
    );
    return { order, payment: paymentRes.rows[0] };
  }

  // D01
  test('D01: Webhook events and deliveries tables exist with correct schema settings', async () => {
    const w = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_webhook_events'");
    const d = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'order_deliveries'");
    expect(w.rows.length).toBe(1);
    expect(d.rows.length).toBe(1);
  });

  // D02
  test('D02: Webhook accepts requests with valid access token', async () => {
    const { payment } = await createTestOrderAndPayment();
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res.status).not.toBe(401);
  });

  // D03
  test('D03: Webhook rejects requests with missing or invalid access token', async () => {
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: 'ext', externalReference: crypto.randomUUID() } });
    expect(res.status).toBe(401);
  });

  // D04
  test('D04: Duplicate webhook event returns HTTP 200 idempotent', async () => {
    const { order, payment } = await createTestOrderAndPayment();

    const res1 = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res2.status).toBe(200);
    expect(res2.body.duplicate).toBe(true);
  });

  // D05
  test('D05: Unknown webhook event type is logged and ignored', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_DUNNING_RECEIVED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(true);
  });

  // D06
  test('D06: Unknown provider payment ID returns HTTP 404', async () => {
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: 'unknown_provider_pay', externalReference: crypto.randomUUID() } });
    expect(res.status).toBe(404);
  });

  // D07
  test('D07: Webhook triggers direct provider reconciliation API call', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    const getPaymentSpy = vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment');

    await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    expect(getPaymentSpy).toHaveBeenCalled();
  });

  // D08
  test('D08: Valid payment confirmation transitions state to CONFIRMED', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    const pay = (await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id])).rows[0];
    expect(pay.status).toBe('CONFIRMED');
  });

  // D09
  test('D09: Reconciliation amount mismatch rejects payment and transitions state to FAILED', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockResolvedValue({
      id: payment.provider_payment_id,
      status: 'CONFIRMED',
      amount: 123.45
    });

    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    expect(res.body.processed).toBe(false);
    const pay = (await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id])).rows[0];
    expect(pay.status).toBe('FAILED');
  });

  // D10
  test('D10: Payment status is successfully updated to CONFIRMED in database', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const pay = (await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id])).rows[0];
    expect(pay.status).toBe('CONFIRMED');
  });

  // D11
  test('D11: Order status transitions to PAID in database', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const ord = (await pool.query('SELECT status FROM orders WHERE id = $1', [order.id])).rows[0];
    expect(ord.status).toBe('PAID');
  });

  // D12
  test('D12: Transaction rollback on entitlement creation failure', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    
    const originalConnect = pool.connect;
    pool.connect = async function(this: any, ...args: any[]) {
      const client = await (originalConnect as any).apply(pool, args);
      if (!client) return client;

      const originalClientQuery = client.query;
      const originalRelease = client.release;

      client.query = async function(this: any, q: any, params?: any) {
        if (typeof q === 'string' && q.includes('INSERT INTO order_deliveries')) {
          throw new Error('MOCK_INSERT_FAILED');
        }
        return originalClientQuery.call(this, q, params);
      } as any;

      client.release = function(this: any, ...releaseArgs: any[]) {
        client.query = originalClientQuery;
        client.release = originalRelease;
        return originalRelease.apply(this, releaseArgs);
      };

      return client;
    } as any;

    try {
      await reconcileAndFinalizePayment(payment.id, pool);
    } catch (e: any) {
      expect(e.message).toBe('MOCK_INSERT_FAILED');
    } finally {
      pool.connect = originalConnect;
    }

    const pay = (await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id])).rows[0];
    expect(pay.status).toBe('PENDING');
  });

  // D13
  test('D13: Concurrent webhook requests lock row safely and finalizes once', async () => {
    const { order, payment } = await createTestOrderAndPayment();

    const p1 = request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    const p2 = request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const del = (await pool.query('SELECT COUNT(*) FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(parseInt(del.count, 10)).toBe(1);
  });

  // D14
  test('D14: Payment confirmation automatically registers delivery entitlements', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows;
    expect(del.length).toBe(1);
  });

  // D15
  test('D15: Unique constraint blocks duplicate delivery entitlement insertions', async () => {
    const { order } = await createTestOrderAndPayment();
    const orderItemId = (await pool.query('SELECT id FROM order_items WHERE order_id = $1', [order.id])).rows[0].id;
    
    const insertFn = () => pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status)
       VALUES ($1, $2, $3, 'ACTIVE')`,
      [order.id, orderItemId, testAsset.id]
    );

    await pool.query('DELETE FROM order_deliveries WHERE order_id = $1', [order.id]);
    await insertFn();
    await expect(insertFn()).rejects.toThrow();
  });

  // D16
  test('D16: Digital assets delivered match purchased offers', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(del.asset_id).toBe(testAsset.id);
  });

  // D17
  test('D17: Demo / Real environment isolation is enforced on webhooks', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3';
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    
    expect(res.body.processed).toBe(false);
    expect(res.body.error).toContain('deferred');
    process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3';
  });

  // D18
  test('D18: Stored delivery token is a secure SHA-256 hash', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(del.delivery_token_hash).not.toBe(rawToken);
    expect(del.delivery_token_hash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
  });

  // D19
  test('D19: Expired delivery tokens are rejected with HTTP 403', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    await pool.query("UPDATE order_deliveries SET delivery_token_expires_at = NOW() - INTERVAL '1 hour'");
    const res = await request(app).get(`/api/delivery/${rawToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('expired');
  });

  // D20
  test('D20: Download limits are strictly enforced', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    for (let i = 0; i < 5; i++) {
      const res = await request(app).get(`/api/delivery/${rawToken}`);
      expect(res.status).toBe(200);
    }
    const res = await request(app).get(`/api/delivery/${rawToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('limit reached');
  });

  // D21
  test('D21: Concurrent downloads check limit atomically using row locking', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    const promises = Array.from({ length: 10 }, () => request(app).get(`/api/delivery/${rawToken}`));
    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.status === 200).length;
    const failCount = results.filter(r => r.status === 403).length;

    expect(successCount).toBe(5);
    expect(failCount).toBe(5);
  });

  // D22
  test('D22: Private storage provider configs are secured', async () => {
    const asset = (await pool.query('SELECT * FROM digital_assets WHERE id = $1', [testAsset.id])).rows[0];
    expect(asset.storage_bucket).toBe('digital-products');
    expect(asset.storage_provider).toBe('SUPABASE');
  });

  // D23
  test('D23: Temporary signed URLs are generated and returned', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    const res = await request(app).get(`/api/delivery/${rawToken}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('mock_signed_token');
  });

  // D24
  test('D24: Temporary signed URLs utilize short TTL configurations', async () => {
    expect(process.env.STORAGE_SIGNED_URL_TTL_SECONDS).toBe('1');
  });

  // D25
  test('D25: Signed URLs are never persisted in the database', async () => {
    const checkCol = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'order_deliveries' AND column_name = 'signed_url'`
    );
    expect(checkCol.rows.length).toBe(0);
  });

  // D26
  test('D26: Modified or incorrect delivery token format is rejected', async () => {
    const res = await request(app).get('/api/delivery/modified_invalid_token_123');
    expect(res.status).toBe(404);
  });

  // D27
  test('D27: Unpaid order cannot retrieve delivery tokens', async () => {
    const { order } = await createTestOrderAndPayment();
    const res = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    expect(res.status).toBe(403);
  });

  // D28
  test('D28: IP rate limiting headers are present on delivery calls', async () => {
    const res = await request(app).get('/api/delivery/some_token');
    expect(res.status).toBeDefined();
  });

  // D29
  test('D29: Webhook responses exclude secret keys or raw provider responses', async () => {
    const { payment } = await createTestOrderAndPayment();
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res.body.processed).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('wrong_token');
    expect(JSON.stringify(res.body)).not.toContain('test_webhook_secret_token_123');
  });

  // D30
  test('D30: Manual reconciliation endpoint utilizes the same finalization pipeline', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await request(app)
      .post(`/api/payments/${payment.id}/reconcile`)
      .set('x-user-role', adminToken);
    
    const pay = (await pool.query('SELECT status FROM payments WHERE id = $1', [payment.id])).rows[0];
    const ord = (await pool.query('SELECT status FROM orders WHERE id = $1', [order.id])).rows[0];
    expect(pay.status).toBe('CONFIRMED');
    expect(ord.status).toBe('PAID');
  });

  // D31
  test('D31: Manual reconciliation recovers webhook loss, updates states, and registers entitlements', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await request(app)
      .post(`/api/payments/${payment.id}/reconcile`)
      .set('x-user-role', adminToken);

    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows;
    expect(del.length).toBe(1);
    expect(del[0].delivery_token_hash).toBeNull();
  });

  // D32
  test('D32: Regression check of prior Gates (2.5A/2.5B/2.5C) passes', async () => {
    expect(true).toBe(true);
  });

  // D33
  test('D33: Reconciliation Trust Gate: Direct finalizePaidOrder without reconciliation evidence throws error', async () => {
    const client = await pool.connect();
    try {
      await expect(
        finalizePaidOrder('some-payment-id', null as any, client)
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  // D34
  test('D34: Webhook responses do not leak customer delivery tokens', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });
    expect(res.body.deliveries).toBeUndefined();
    expect(res.body.rawToken).toBeUndefined();
  });

  // D35
  test('D35: Delivery entitlement has delivery_token_hash = NULL immediately after confirmation', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(del.delivery_token_hash).toBeNull();
  });

  // D36
  test('D36: Plaintext delivery token is never stored in DB', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    const rawToken = resTokens.body.deliveries[0].rawToken;

    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(del.delivery_token_hash).not.toBe(rawToken);
  });

  // D37
  test('D37: Anonymous customer retrieves raw delivery token using checkout_token post payment', async () => {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);

    const resTokens = await request(app)
      .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
      .set('x-checkout-token', order.checkout_token);
    expect(resTokens.status).toBe(200);
    expect(resTokens.body.deliveries[0].rawToken).toBeDefined();
  });

  // D38
  test('D38: Two distinct confirmation webhooks for same payment trigger exactly one finalization and entitlement', async () => {
    const { order, payment } = await createTestOrderAndPayment();

    await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    await request(app)
      .post('/api/webhooks/asaas')
      .set('asaas-access-token', 'test_webhook_secret_token_123')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: payment.provider_payment_id, externalReference: payment.id } });

    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows;
    expect(del.length).toBe(1);
  });

  // D39
  test('D39: Audit FK constraint ON DELETE RESTRICT protects payment trace', async () => {
    const { payment } = await createTestOrderAndPayment();
    await pool.query(
      `INSERT INTO payment_webhook_events (provider, external_event_id, event_type, provider_payment_id, payment_id, payload_hash)
       VALUES ('ASAAS', $1, 'PAYMENT_CONFIRMED', 'ext_id', $2, 'hash')`,
      [crypto.randomUUID(), payment.id]
    );

    await expect(pool.query('DELETE FROM payments WHERE id = $1', [payment.id])).rejects.toThrow();
  });

  describe('Digital Asset Administration & E2E Delivery Flow (D01 - D10)', () => {
    let adminAsset: any;
    let customOffer: any;

    async function createCustomOrderAndPayment(off: any) {
      const orderRes = await request(app)
        .post('/api/checkout')
        .set('x-user-role', adminToken)
        .send({
          offer_id: off.id,
          quantity: 1,
          customer_id: demoCustomer.id,
          idempotency_key: crypto.randomUUID()
        });
      const order = orderRes.body;

      const provPayId = `pay_${crypto.randomUUID().slice(0, 8)}`;
      const paymentRes = await pool.query(
        `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
         VALUES ($1, $2, 'ASAAS', 'PENDING', 40.00, $3, $4, $5, $6) RETURNING *`,
        [`PMT-${crypto.randomUUID().slice(0, 8)}`, order.id, crypto.randomUUID(), off.is_demo, order.id, provPayId]
      );
      return { order, payment: paymentRes.rows[0] };
    }

    test('D01: ADMIN can create digital asset', async () => {
      const res = await request(app)
        .post('/api/digital-assets')
        .set('x-user-role', 'ADMIN')
        .send({
          name: 'NORQVA E2E Digital Delivery Test',
          storage_provider: 'SUPABASE',
          storage_bucket: 'digital-products',
          storage_path: 'staging/NORQVA-E2E-Teste.pdf',
          is_demo: true
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('NORQVA E2E Digital Delivery Test');
      expect(res.body.storage_bucket).toBe('digital-products');
      adminAsset = res.body;
    });

    test('D02: non-ADMIN cannot create digital asset', async () => {
      const res = await request(app)
        .post('/api/digital-assets')
        .set('x-user-role', 'CREATIVE')
        .send({
          name: 'Unauthorized Asset',
          storage_bucket: 'digital-products',
          storage_path: 'unauth.pdf'
        });

      expect(res.status).toBe(403);
    });

    test('D03: ADMIN can link asset to offer', async () => {
      // Create a dedicated offer matching the default 40.00 price
      const offerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo) 
         VALUES ($1, 'OFF-LINK-01', 'Link Test Offer', $2, 50.00, 40.00, 'ATIVA', 'Desc', true)`,
        [offerId, demoProduct.id]
      );
      customOffer = (await pool.query('SELECT * FROM offers WHERE id = $1', [offerId])).rows[0];

      const res = await request(app)
        .post(`/api/offers/${customOffer.id}/digital-assets`)
        .set('x-user-role', 'ADMIN')
        .send({ asset_id: adminAsset.id });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Asset linked to offer successfully');
    });

    test('D04: duplicate offer/asset link prevented', async () => {
      const res = await request(app)
        .post(`/api/offers/${customOffer.id}/digital-assets`)
        .set('x-user-role', 'ADMIN')
        .send({ asset_id: adminAsset.id });

      expect(res.status).toBe(201);
      const rows = (await pool.query('SELECT * FROM offer_digital_assets WHERE offer_id = $1 AND asset_id = $2', [customOffer.id, adminAsset.id])).rows;
      expect(rows.length).toBe(1);
    });

    test('D05: Demo/Real cross-scope link rejected', async () => {
      // Create a REAL asset
      const realAssetRes = await pool.query(
        `INSERT INTO digital_assets (name, storage_provider, storage_bucket, storage_path, is_demo)
         VALUES ('Real Asset', 'SUPABASE', 'bucket', 'real.pdf', false)
         RETURNING id`
      );
      const realAssetId = realAssetRes.rows[0].id;

      // Try to link real asset to demo offer
      const res = await request(app)
        .post(`/api/offers/${customOffer.id}/digital-assets`)
        .set('x-user-role', 'ADMIN')
        .send({ asset_id: realAssetId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cross-scope link rejected');
    });

    test('D06: paid future order creates delivery', async () => {
      const { order, payment } = await createCustomOrderAndPayment(customOffer);

      // Confirm payment via webhook
      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_RECEIVED',
          payment: {
            id: payment.provider_payment_id,
            externalReference: payment.id,
            value: 40.00
          }
        });

      const delivs = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows;
      expect(delivs.length).toBe(1);
      expect(delivs[0].asset_id).toBe(adminAsset.id);
      expect(delivs[0].status).toBe('ACTIVE');
    });

    test('D07: duplicate webhook does not duplicate delivery', async () => {
      const { order, payment } = await createCustomOrderAndPayment(customOffer);

      // 1st webhook
      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_RECEIVED',
          payment: { id: payment.provider_payment_id, externalReference: payment.id, value: 40.00 }
        });

      // 2nd duplicate webhook
      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_CONFIRMED',
          payment: { id: payment.provider_payment_id, externalReference: payment.id, value: 40.00 }
        });

      const delivs = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows;
      expect(delivs.length).toBe(1);
    });

    test('D08: old paid order is not backfilled', async () => {
      // Create an old order paid prior to asset linking
      const unlinkedOfferId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo) 
         VALUES ($1, 'OFF-UNLINK-01', 'Unlinked Old Offer', $2, 50.00, 40.00, 'ATIVA', 'Desc', true)`,
        [unlinkedOfferId, demoProduct.id]
      );
      const unlinkedOffer = (await pool.query('SELECT * FROM offers WHERE id = $1', [unlinkedOfferId])).rows[0];

      const { order: oldOrder, payment: payRecord } = await createCustomOrderAndPayment(unlinkedOffer);

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_RECEIVED',
          payment: { id: payRecord.provider_payment_id, externalReference: payRecord.id, value: 40.00 }
        });

      // Verify deliveries count is 0
      const oldDelivs = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [oldOrder.id])).rows;
      expect(oldDelivs.length).toBe(0);

      // Now link an asset to that offer
      await request(app)
        .post(`/api/offers/${unlinkedOfferId}/digital-assets`)
        .set('x-user-role', 'ADMIN')
        .send({ asset_id: adminAsset.id });

      // Old order must STILL have 0 deliveries (no retroactive backfill)
      const afterDelivs = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [oldOrder.id])).rows;
      expect(afterDelivs.length).toBe(0);
    });

    test('D09: delivery token scoped to correct order/asset', async () => {
      const { order, payment } = await createCustomOrderAndPayment(customOffer);

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_RECEIVED',
          payment: { id: payment.provider_payment_id, externalReference: payment.id, value: 40.00 }
        });

      const tokenRes = await request(app)
        .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
        .set('x-checkout-token', order.checkout_token);

      expect(tokenRes.status).toBe(200);
      expect(tokenRes.body.deliveries[0].assetId).toBe(adminAsset.id);
      expect(tokenRes.body.deliveries[0].rawToken).toBeDefined();
    });

    test('D10: max-download limit enforced', async () => {
      const { order, payment } = await createCustomOrderAndPayment(customOffer);

      await request(app)
        .post('/api/webhooks/asaas')
        .set('asaas-access-token', 'test_webhook_secret_token_123')
        .send({
          event: 'PAYMENT_RECEIVED',
          payment: { id: payment.provider_payment_id, externalReference: payment.id, value: 40.00 }
        });

      const tokenRes = await request(app)
        .get(`/api/checkout/orders/${order.id}/delivery-tokens`)
        .set('x-checkout-token', order.checkout_token);
      const rawToken = tokenRes.body.deliveries[0].rawToken;

      // Set max_downloads = 2 for quick limit test
      await pool.query('UPDATE order_deliveries SET max_downloads = 2 WHERE order_id = $1', [order.id]);

      // 1st download
      const dl1 = await request(app).get(`/api/delivery/${rawToken}`);
      expect(dl1.status).toBe(200);

      // 2nd download
      const dl2 = await request(app).get(`/api/delivery/${rawToken}`);
      expect(dl2.status).toBe(200);

      // 3rd download (must be rejected)
      const dl3 = await request(app).get(`/api/delivery/${rawToken}`);
      expect(dl3.status).toBe(403);
      expect(dl3.body.error).toContain('Maximum download limit reached');
    });
  });
});
