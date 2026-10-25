import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool, PoolClient } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { AsaasPaymentProvider } from '../utils/payment';
import { finalizePaidOrder, reconcileAndFinalizePayment, generateStorageSignedUrl } from '../controllers/api';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import https from 'https';
import { EventEmitter } from 'events';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'test_webhook_secret_token_123';
process.env.AUTH_MODE = 'demo';
process.env.STORAGE_SIGNED_URL_TTL_SECONDS = '1';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'MOCK';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mockproject.supabase.co';

describe.sequential('NORQVA NORQVA-0126 link de download estável', () => {
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
       VALUES ($1, 'PRD-0126-01', 'Delivery Product', 'Downloads', 'PLANEJADO', 'Desc', true)`,
      [prodId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo) 
       VALUES ($1, 'OFF-0126-01', 'Delivery Offer', $2, 50.00, 40.00, 'ATIVA', 'Desc', true)`,
      [offerId, prodId]
    );

    const custId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO customers (id, name, email, phone, is_demo) 
       VALUES ($1, 'Delivery Customer', 'l0126@cust.com', '11987654321', true)`,
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
    resetAllRateLimits();
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

  async function paidOrder() {
    const { order, payment } = await createTestOrderAndPayment();
    await reconcileAndFinalizePayment(payment.id, pool);
    return order;
  }
  const tokensOf = (order: any) =>
    request(app).get(`/api/checkout/orders/${order.id}/delivery-tokens`).set('x-checkout-token', order.checkout_token);

  test('abrir a página de entrega duas vezes devolve o mesmo link e o primeiro continua baixando', async () => {
    const order = await paidOrder();
    const r1 = await tokensOf(order);
    const r2 = await tokensOf(order);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const t1 = r1.body.deliveries[0].rawToken;
    expect(r2.body.deliveries[0].rawToken).toBe(t1);
    const dl = await request(app).get(`/api/delivery/${t1}`);
    expect(dl.status).toBe(200);
    const del = (await pool.query('SELECT * FROM order_deliveries WHERE order_id = $1', [order.id])).rows[0];
    expect(del.delivery_token_enc).toBeTruthy();
    expect(del.delivery_token_enc).not.toContain(t1);
  });

  test('link perto de vencer (menos de 1 h) é trocado por um novo', async () => {
    const order = await paidOrder();
    const t1 = (await tokensOf(order)).body.deliveries[0].rawToken;
    await pool.query("UPDATE order_deliveries SET delivery_token_expires_at = NOW() + INTERVAL '30 minutes' WHERE order_id = $1", [order.id]);
    const t2 = (await tokensOf(order)).body.deliveries[0].rawToken;
    expect(t2).not.toBe(t1);
    expect((await request(app).get(`/api/delivery/${t2}`)).status).toBe(200);
  });

  test('cópia guardada que não bate com o hash atual (link revogado) não é reaproveitada', async () => {
    const order = await paidOrder();
    const t1 = (await tokensOf(order)).body.deliveries[0].rawToken;
    await pool.query("UPDATE order_deliveries SET delivery_token_hash = NULL WHERE order_id = $1", [order.id]);
    const t2 = (await tokensOf(order)).body.deliveries[0].rawToken;
    expect(t2).not.toBe(t1);
    expect((await request(app).get(`/api/delivery/${t1}`)).status).toBe(404);
  });

  test('pedido não pago continua sem link', async () => {
    const { order } = await createTestOrderAndPayment();
    const r = await tokensOf(order);
    const list = r.body.deliveries || [];
    expect(list.every((d: any) => !d.rawToken)).toBe(true);
  });
});
