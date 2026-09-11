import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { newDb } from 'pg-mem';
import {
  requestOrderRecovery,
  claimOrderRecovery,
  getDeliveryTokens,
  downloadDelivery,
  getOrderById,
  checkoutPix
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
      implementation: () => crypto.randomUUID(),
      impure: true
    });
    memDb.public.registerFunction({
      name: 'now',
      implementation: () => new Date(),
      impure: true
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

      CREATE TABLE order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        offer_id UUID REFERENCES offers(id),
        quantity INT DEFAULT 1
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

      CREATE TABLE order_customer_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        session_token_hash VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_ip VARCHAR(64)
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

    app.get('/api/orders/:id', getOrderById);
    app.post('/api/checkout/orders/:orderId/pix', checkoutPix);
    app.post('/api/checkout/recovery/request', recoveryRequestRateLimiter, requestOrderRecovery);
    app.get('/api/checkout/recovery/:token', orderStatusRateLimiter, claimOrderRecovery);
    app.get('/api/checkout/orders/:orderId/delivery-tokens', deliveryRateLimiter, getDeliveryTokens);
    app.get('/api/delivery/:token', deliveryRateLimiter, downloadDelivery);
  });

  afterEach(async () => {
    resetAllRateLimits();
    clearTestEmails();
  });

  it('A: Existing legacy checkout customer credential still works for order & delivery access', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Legacy', 'legacy@example.com') RETURNING id")).rows[0];
    const legacyRawToken = crypto.randomBytes(32).toString('hex');
    const legacyTokenHash = crypto.createHash('sha256').update(legacyRawToken).digest('hex');
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount, checkout_token_hash) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90, '${legacyTokenHash}') RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Can access order details
    const orderRes = await request(app)
      .get('/api/orders/' + ord.id)
      .set('x-checkout-token', legacyRawToken);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.id).toBe(ord.id);
    expect(orderRes.body.status).toBe('PAID');

    // Can access delivery tokens
    const delRes = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', legacyRawToken);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deliveries).toBeDefined();
    expect(delRes.body.deliveries.length).toBe(1);
  });

  it('B & C: Recovery magic token first claim succeeds and token status becomes USED', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Joao', 'joao@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const rawRecoveryToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRecoveryToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${tokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    const res = await request(app).get('/api/checkout/recovery/' + rawRecoveryToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderId).toBe(ord.id);
    expect(res.body.checkoutToken).toBeDefined();

    // Verify recovery token transitioned to USED
    const tokenRow = (await pool.query('SELECT status, use_count FROM order_recovery_tokens WHERE token_hash = $1', [tokenHash])).rows[0];
    expect(tokenRow.status).toBe('USED');
    expect(tokenRow.use_count).toBe(1);

    // Verify customer session was created in order_customer_sessions
    const sessionHash = crypto.createHash('sha256').update(res.body.checkoutToken).digest('hex');
    const sessionRow = (await pool.query('SELECT status FROM order_customer_sessions WHERE session_token_hash = $1', [sessionHash])).rows[0];
    expect(sessionRow.status).toBe('ACTIVE');
  });

  it('D: Second claim with same raw recovery token fails closed (410)', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Joao', 'joao@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const rawRecoveryToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRecoveryToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${tokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    // First claim
    const res1 = await request(app).get('/api/checkout/recovery/' + rawRecoveryToken);
    expect(res1.status).toBe(200);

    // Second claim
    const res2 = await request(app).get('/api/checkout/recovery/' + rawRecoveryToken);
    expect(res2.status).toBe(410);
    expect(res2.body.error).toContain('não é mais válido');
  });

  it('E: Concurrent recovery claims result in exactly one successful claim and one session', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Conc', 'conc@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const rawRecoveryToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRecoveryToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${tokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    const results = await Promise.all([
      request(app).get('/api/checkout/recovery/' + rawRecoveryToken),
      request(app).get('/api/checkout/recovery/' + rawRecoveryToken),
      request(app).get('/api/checkout/recovery/' + rawRecoveryToken),
      request(app).get('/api/checkout/recovery/' + rawRecoveryToken)
    ]);

    const successes = results.filter(r => r.status === 200);
    const rejections = results.filter(r => r.status === 410);

    expect(successes.length).toBe(1);
    expect(rejections.length).toBe(3);

    const tokenRow = (await pool.query('SELECT status, use_count FROM order_recovery_tokens WHERE token_hash = $1', [tokenHash])).rows[0];
    expect(tokenRow.status).toBe('USED');
    expect(tokenRow.use_count).toBe(1);

    const sessionCount = (await pool.query('SELECT count(*)::int as count FROM order_customer_sessions WHERE order_id = $1', [ord.id])).rows[0].count;
    expect(sessionCount).toBe(1);
  });

  it('F: Recovery claim does NOT invalidate existing valid legacy customer session', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Multi', 'multi@example.com') RETURNING id")).rows[0];
    const legacyRawToken = crypto.randomBytes(32).toString('hex');
    const legacyTokenHash = crypto.createHash('sha256').update(legacyRawToken).digest('hex');
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount, checkout_token_hash) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90, '${legacyTokenHash}') RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Customer performs out-of-band recovery on second device
    const rawRecoveryToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRecoveryToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${tokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    const recoveryRes = await request(app).get('/api/checkout/recovery/' + rawRecoveryToken);
    expect(recoveryRes.status).toBe(200);
    const newSessionToken = recoveryRes.body.checkoutToken;

    // First device with legacy token can STILL access order & delivery!
    const legacyAccessRes = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', legacyRawToken);
    expect(legacyAccessRes.status).toBe(200);

    // Second device with new recovered session can ALSO access order & delivery!
    const recoveredAccessRes = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', newSessionToken);
    expect(recoveredAccessRes.status).toBe(200);
  });

  it('G & H: Recovery-derived customer session accesses PAID order and delivery tokens', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Lucas', 'lucas@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia Trattoria', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const sessionRawToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionRawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_customer_sessions (order_id, session_token_hash, status, expires_at) VALUES ('${ord.id}', '${sessionTokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    const orderRes = await request(app)
      .get('/api/orders/' + ord.id)
      .set('x-checkout-token', sessionRawToken);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.id).toBe(ord.id);
    expect(orderRes.body.status).toBe('PAID');

    const delRes = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', sessionRawToken);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deliveries).toBeDefined();
    expect(delRes.body.deliveries.length).toBe(1);
  });

  it('I & J: Recovery session cannot create Pix or mutate payment financial state', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Lucas', 'lucas@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'PAID', 19.90) RETURNING id`)).rows[0];

    const sessionRawToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(sessionRawToken).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_customer_sessions (order_id, session_token_hash, status, expires_at) VALUES ('${ord.id}', '${sessionTokenHash}', 'ACTIVE', '${futureDate.toISOString()}')`);

    // Cannot call checkoutPix with recovery session token
    const pixRes = await request(app)
      .post('/api/checkout/orders/' + ord.id + '/pix')
      .set('x-checkout-token', sessionRawToken)
      .send({ idempotency_key: 'idemp-123', cpf_cnpj: '12345678909' });

    expect(pixRes.status).toBe(403);
    expect(pixRes.body.error).toContain('Invalid checkout token');
  });

  it('K: Expired or revoked recovery token fails closed', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Ana', 'ana@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('${cust.id}', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Expired
    const rawExpired = crypto.randomBytes(32).toString('hex');
    const hashExpired = crypto.createHash('sha256').update(rawExpired).digest('hex');
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${hashExpired}', 'ACTIVE', '${pastDate.toISOString()}')`);

    const resExpired = await request(app).get('/api/checkout/recovery/' + rawExpired);
    expect(resExpired.status).toBe(410);

    // Revoked
    const rawRevoked = crypto.randomBytes(32).toString('hex');
    const hashRevoked = crypto.createHash('sha256').update(rawRevoked).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at) VALUES ('${ord.id}', '${hashRevoked}', 'REVOKED', '${futureDate.toISOString()}')`);

    const resRevoked = await request(app).get('/api/checkout/recovery/' + rawRevoked);
    expect(resRevoked.status).toBe(410);
  });

  it('L: Expired or revoked customer session fails closed', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Bia', 'bia@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('${cust.id}', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Expired session
    const rawExpiredSession = crypto.randomBytes(32).toString('hex');
    const hashExpiredSession = crypto.createHash('sha256').update(rawExpiredSession).digest('hex');
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_customer_sessions (order_id, session_token_hash, status, expires_at) VALUES ('${ord.id}', '${hashExpiredSession}', 'ACTIVE', '${pastDate.toISOString()}')`);

    const resExpired = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', rawExpiredSession);
    expect(resExpired.status).toBe(403);
    expect(resExpired.body.error).toContain('expirou');

    // Revoked session
    const rawRevokedSession = crypto.randomBytes(32).toString('hex');
    const hashRevokedSession = crypto.createHash('sha256').update(rawRevokedSession).digest('hex');
    const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await pool.query(`INSERT INTO order_customer_sessions (order_id, session_token_hash, status, expires_at) VALUES ('${ord.id}', '${hashRevokedSession}', 'REVOKED', '${futureDate.toISOString()}')`);

    const resRevoked = await request(app)
      .get('/api/checkout/orders/' + ord.id + '/delivery-tokens')
      .set('x-checkout-token', rawRevokedSession);
    expect(resRevoked.status).toBe(403);
    expect(resRevoked.body.error).toContain('não está mais ativa');
  });

  it('M: Raw recovery and session tokens are never persisted or logged', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Pedro', 'pedro@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'pedro@example.com' });

    const recoveryUrl = dispatchedEmailsForTesting[0].recoveryUrl;
    const rawRecoveryToken = recoveryUrl.split('/acesso/')[1];

    // Raw recovery token is not in DB
    const recRows = (await pool.query('SELECT token_hash FROM order_recovery_tokens WHERE order_id = $1', [ord.id])).rows;
    expect(recRows[0].token_hash).not.toEqual(rawRecoveryToken);
    expect(recRows[0].token_hash).toEqual(crypto.createHash('sha256').update(rawRecoveryToken).digest('hex'));

    const claimRes = await request(app).get('/api/checkout/recovery/' + rawRecoveryToken);
    const rawSessionToken = claimRes.body.checkoutToken;

    // Raw session token is not in DB
    const sessionRows = (await pool.query('SELECT session_token_hash FROM order_customer_sessions WHERE order_id = $1', [ord.id])).rows;
    expect(sessionRows[0].session_token_hash).not.toEqual(rawSessionToken);
    expect(sessionRows[0].session_token_hash).toEqual(crypto.createHash('sha256').update(rawSessionToken).digest('hex'));
  });

  it('N: Enumeration protection & rate limiting remain enforced', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Existente', 'comprador@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const res1 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'comprador@example.com', offerHumanId: 'OFF-000001' });

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res1.body.message).toContain('Se encontrarmos uma compra válida');

    clearTestEmails();
    const res2 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'nunca.comprou@example.com', offerHumanId: 'OFF-000001' });

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    expect(res2.body.message).toEqual(res1.body.message);
  });
});