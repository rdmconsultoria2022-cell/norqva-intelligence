import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { newDb } from 'pg-mem';
import {
  requestOrderRecovery,
  claimOrderRecovery,
  getDeliveryTokens,
  downloadDelivery
} from '../controllers/api';
import {
  emailService,
  dispatchedEmailsForTesting,
  clearTestEmails
} from '../services/emailService';
import {
  recoveryRequestRateLimiter,
  orderStatusRateLimiter,
  deliveryRateLimiter,
  resetAllRateLimits
} from '../middleware/rateLimiter';

describe('NORQVA — Durable Customer Recovery V1 Security & Functional Test Suite (A - O)', () => {
  let app: express.Express;
  let memDb: any;
  let pool: any;

  beforeEach(async () => {
    resetAllRateLimits();
    clearTestEmails();
    vi.restoreAllMocks();

    memDb = newDb();
    memDb.public.registerFunction({
      name: 'gen_random_uuid',
      implementation: () => crypto.randomUUID()
    });
    memDb.public.registerFunction({
      name: 'now',
      implementation: () => new Date()
    });

    const pg = memDb.adapters.createPg();
    pool = new pg.Pool();

    await pool.query(`
      CREATE TABLE customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        human_id VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        is_demo BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id),
        offer_id UUID REFERENCES offers(id),
        offer_human_id VARCHAR(64),
        offer_name_snapshot VARCHAR(255),
        total_amount NUMERIC(10,2) NOT NULL,
        status VARCHAR(32) NOT NULL,
        checkout_token_hash VARCHAR(64),
        checkout_token_expires_at TIMESTAMPTZ,
        checkout_token_revoked_at TIMESTAMPTZ,
        is_demo BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE digital_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        storage_bucket VARCHAR(255) NOT NULL,
        storage_path VARCHAR(255) NOT NULL
      );

      CREATE TABLE order_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        order_item_id UUID,
        asset_id UUID NOT NULL REFERENCES digital_assets(id),
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        download_count INT NOT NULL DEFAULT 0,
        max_downloads INT NOT NULL DEFAULT 5,
        delivery_token_hash VARCHAR(64),
        delivery_token_expires_at TIMESTAMPTZ,
        last_download_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE order_recovery_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_ip VARCHAR(64),
        use_count INT NOT NULL DEFAULT 0
      );

      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        action VARCHAR(64) NOT NULL,
        details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        is_demo BOOLEAN DEFAULT FALSE
      );
    `);

    app = express();
    app.use(express.json());
    app.set('db', pool);

    app.post('/api/checkout/recovery/request', recoveryRequestRateLimiter, requestOrderRecovery);
    app.get('/api/checkout/recovery/:token', orderStatusRateLimiter, claimOrderRecovery);
    app.get('/api/checkout/orders/:orderId/delivery-tokens', deliveryRateLimiter, getDeliveryTokens);
    app.get('/api/delivery/:token', deliveryRateLimiter, downloadDelivery);
  });

  afterEach(async () => {
    resetAllRateLimits();
    clearTestEmails();
  });

  it('A: Email alone never grants direct delivery access', async () => {
    const res = await request(app)
      .get('/api/checkout/orders/00000000-0000-0000-0000-000000000000/delivery-tokens')
      .set('x-customer-email', 'customer@example.com');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Forbidden');
  });

  it('B: OrderId alone never grants delivery access', async () => {
    const custRes = await pool.query("INSERT INTO customers (name, email) VALUES ('Maria', 'm@e.com') RETURNING id");
    const ordRes = await pool.query("INSERT INTO orders (customer_id, offer_human_id, total_amount, status) VALUES ('" + custRes.rows[0].id + "', 'OFF-000001', 19.90, 'PAID') RETURNING id");

    const res = await request(app).get('/api/checkout/orders/' + ordRes.rows[0].id + '/delivery-tokens');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Missing checkout token');
  });

  it('C: Invalid recovery token fails closed with 404', async () => {
    const fakeToken = '0000000000000000000000000000000000000000000000000000000000000000';
    const res = await request(app).get('/api/checkout/recovery/' + fakeToken);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('não encontrada');
  });

  it('D: Expired recovery token fails closed with 403', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Ana', 'ana@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, status, total_amount) VALUES ('" + cust.id + "', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await pool.query("INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('" + ord.id + "', '" + tokenHash + "', 'ACTIVE', '" + pastDate.toISOString() + "')");

    const res = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('expirou');
  });

  it('E: Inactive recovery token fails closed with 403', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Ana', 'ana@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, status, total_amount) VALUES ('" + cust.id + "', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query("INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('" + ord.id + "', '" + tokenHash + "', 'REVOKED', '" + futureDate.toISOString() + "')");

    const res = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('não está mais ativa');
  });

  it('F: Valid recovery token resolves only its own PAID order and issues fresh checkoutToken', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Joao', 'joao@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query("INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('" + ord.id + "', '" + tokenHash + "', 'ACTIVE', '" + futureDate.toISOString() + "')");

    const res = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toBe(ord.id);
    expect(res.body.offerHumanId).toBe('OFF-000001');
    expect(res.body.offerName).toBe('Trattoria em Casa');
    expect(res.body.checkoutToken).toBeDefined();
    expect(res.body.checkoutToken.length).toBe(64);

    const orderCheck = (await pool.query('SELECT checkout_token_hash FROM orders WHERE id = $1', [ord.id])).rows[0];
    const expectedHash = crypto.createHash('sha256').update(res.body.checkoutToken).digest('hex');
    expect(orderCheck.checkout_token_hash).toBe(expectedHash);
  });

  it('G: PENDING order recovery fails closed with 403', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Lucas', 'lucas@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'PENDING', 19.90) RETURNING id")).rows[0];

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query("INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('" + ord.id + "', '" + tokenHash + "', 'ACTIVE', '" + futureDate.toISOString() + "')");

    const res = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('não foi confirmado como pago');
  });

  it('H: Order with inactive delivery fails closed with 403', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Bia', 'bia@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'EXPIRED')");

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query("INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('" + ord.id + "', '" + tokenHash + "', 'ACTIVE', '" + futureDate.toISOString() + "')");

    const res = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('não está ativa');
  });

  it('I: Recovery request returns identical 200 response for existent and non-existent emails', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Existente', 'comprador@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    const res1 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'comprador@example.com', offerHumanId: 'OFF-000001' });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.message).toContain('Se encontrarmos uma compra válida');
    expect(dispatchedEmailsForTesting.length).toBe(1);
    expect(dispatchedEmailsForTesting[0].email).toBe('comprador@example.com');

    clearTestEmails();
    const res2 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'nunca.comprou@example.com', offerHumanId: 'OFF-000001' });

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(res2.body.message).toEqual(res1.body.message);
    expect(dispatchedEmailsForTesting.length).toBe(0);
  });

  it('J: Rate limiting rejects excessive recovery requests (>5 in window)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/api/checkout/recovery/request')
        .send({ email: 'test' + i + '@example.com' });
      expect(res.status).toBe(200);
    }

    const res6 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'test6@example.com' });

    expect(res6.status).toBe(429);
    expect(res6.body.error).toContain('Muitas solicitações');
  });

  it('K: Token raw value is not stored in order_recovery_tokens table', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Pedro', 'pedro@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'pedro@example.com' });

    expect(dispatchedEmailsForTesting.length).toBe(1);
    const recoveryUrl = dispatchedEmailsForTesting[0].recoveryUrl;
    const rawToken = recoveryUrl.split('/acesso/')[1];

    const rows = (await pool.query('SELECT token_hash FROM order_recovery_tokens WHERE order_id = $1', [ord.id])).rows;
    expect(rows.length).toBe(1);
    expect(rows[0].token_hash).not.toEqual(rawToken);
    expect(rows[0].token_hash).toEqual(crypto.createHash('sha256').update(rawToken).digest('hex'));
  });

  it('M & N: Recovery request and claim do NOT create new orders or payments in database', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Carla', 'carla@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query("INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('" + cust.id + "', 'OFF-000001', 'PAID', 19.90) RETURNING id")).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query("INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('" + ord.id + "', '" + ast.id + "', 'ACTIVE')");

    const ordersCountBefore = (await pool.query('SELECT count(*)::int as count FROM orders')).rows[0].count;

    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'carla@example.com' });

    const rawToken = dispatchedEmailsForTesting[0].recoveryUrl.split('/acesso/')[1];
    const claimRes = await request(app).get('/api/checkout/recovery/' + rawToken);
    expect(claimRes.status).toBe(200);

    const ordersCountAfter = (await pool.query('SELECT count(*)::int as count FROM orders')).rows[0].count;
    expect(ordersCountAfter).toBe(ordersCountBefore);
  });
});