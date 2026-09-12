import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { requestOrderRecovery } from '../controllers/api';
import { recoveryRequestRateLimiter, resetAllRateLimits } from '../middleware/rateLimiter';
import { TransactionalEmailService, emailService, clearTestEmails, IEmailProvider } from '../services/emailService';

describe('NORQVA — Recovery Early Exit Observability & Canonical Schema Suite', () => {
  let pool: Pool;
  let app: express.Application;
  const originalEnv = { ...process.env };
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;
  let capturedLogs: any[] = [];

  beforeEach(async () => {
    clearTestEmails();
    resetAllRateLimits();
    process.env = { ...originalEnv };
    capturedLogs = [];

    const captureLog = (type: string) => (msg: string, ...args: any[]) => {
      try {
        const parsed = JSON.parse(msg);
        capturedLogs.push({ logType: type, ...parsed });
      } catch {
        capturedLogs.push({ logType: type, raw: msg, args });
      }
    };

    logSpy = vi.spyOn(console, 'log').mockImplementation(captureLog('log'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(captureLog('warn'));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(captureLog('error'));

    const mem = newDb();
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      implementation: () => crypto.randomUUID(),
      impure: true
    });
    mem.public.registerFunction({
      name: 'now',
      implementation: () => new Date(),
      impure: true
    });

    const db = mem.adapters.createPg();
    pool = new db.Pool();

    // Canonical Migration-derived schema (001 - 019)
    await pool.query(`
      CREATE TABLE customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        cpf VARCHAR(14),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE digital_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        storage_bucket VARCHAR(255) NOT NULL,
        storage_path VARCHAR(512) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        human_id VARCHAR(50) UNIQUE,
        name VARCHAR(255) NOT NULL,
        price_cents INT NOT NULL DEFAULT 1990
      );

      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL REFERENCES customers(id),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 19.90,
        checkout_token_hash VARCHAR(64),
        checkout_token_expires_at TIMESTAMPTZ,
        checkout_token_revoked_at TIMESTAMPTZ,
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        offer_id UUID NOT NULL REFERENCES offers(id),
        offer_name_snapshot VARCHAR(255) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE order_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        asset_id UUID NOT NULL REFERENCES digital_assets(id),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        download_count INT NOT NULL DEFAULT 0,
        max_downloads INT NOT NULL DEFAULT 5,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE order_recovery_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        use_count INT NOT NULL DEFAULT 0,
        created_ip VARCHAR(64)
      );
    `);

    app = express();
    app.use(express.json());
    app.set('db', pool);
    app.post('/api/checkout/recovery/request', recoveryRequestRateLimiter, requestOrderRecovery);
  });

  afterEach(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
    (emailService as TransactionalEmailService).setProvider(null);
  });

  it('1. Rate Limiter emits RECOVERY_REQUEST_RATE_LIMITED and returns 429 after 5 requests', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/checkout/recovery/request')
        .send({ email: 'rate.test@example.com' });
    }

    const res6 = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'rate.test@example.com' });

    expect(res6.status).toBe(429);
    expect(res6.body.error).toContain('Muitas solicitações');
    expect(res6.body.retryAfter).toBeGreaterThan(0);

    const rateLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_RATE_LIMITED');
    expect(rateLog).toBeDefined();
    expect(rateLog.timestamp).toBeDefined();
    expect((rateLog as any).email).toBeUndefined();
    expect((rateLog as any).ip).toBeUndefined();
  });

  it('2. Invalid email format emits RECOVERY_REQUEST_INPUT_REJECTED and returns 400', async () => {
    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'invalid-email-no-at' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('informe um e-mail válido');

    const rejectLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_INPUT_REJECTED');
    expect(rejectLog).toBeDefined();
    expect((rejectLog as any).email).toBeUndefined();
  });

  it('3. Non-existent purchase emits RECOVERY_REQUEST_ACCEPTED & RECOVERY_REQUEST_NO_ELIGIBLE_PURCHASE and returns 200 generic message', async () => {
    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Se encontrarmos uma compra válida');

    const acceptLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_ACCEPTED');
    const noPurchaseLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_NO_ELIGIBLE_PURCHASE');

    expect(acceptLog).toBeDefined();
    expect(acceptLog.correlation_id).toBeDefined();
    expect(noPurchaseLog).toBeDefined();
    expect(noPurchaseLog.correlation_id).toBe(acceptLog.correlation_id);

    const tokensRes = await pool.query('SELECT * FROM order_recovery_tokens');
    expect(tokensRes.rows.length).toBe(0);
  });

  it('4. Paid order with NO active delivery emits RECOVERY_REQUEST_NO_ACTIVE_DELIVERY and returns 200 generic message', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Cliente', 'comprador.no.delivery@example.com') RETURNING id")).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-DELIV-01', 'Guia Digital') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Guia Digital')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'bucket', 'file.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'REVOKED')`);

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'comprador.no.delivery@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const noDelivLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_NO_ACTIVE_DELIVERY');
    expect(noDelivLog).toBeDefined();
    expect(noDelivLog.correlation_id).toBeDefined();

    const tokensRes = await pool.query('SELECT * FROM order_recovery_tokens');
    expect(tokensRes.rows.length).toBe(0);
  });

  it('5. Paid order with ACTIVE delivery emits RECOVERY_REQUEST_TOKEN_CREATED', async () => {
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Cliente Ativo', 'cliente.ativo@example.com') RETURNING id")).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-ACT-01', 'Guia Digital') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Guia Digital')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'bucket', 'file.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'cliente.ativo@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const tokenLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_TOKEN_CREATED');
    expect(tokenLog).toBeDefined();
    expect(tokenLog.correlation_id).toBeDefined();

    const tokensRes = await pool.query('SELECT * FROM order_recovery_tokens WHERE order_id = $1', [ord.id]);
    expect(tokensRes.rows.length).toBe(1);
    expect(tokensRes.rows[0].status).toBe('ACTIVE');
  });

  it('6. Production invalid FRONTEND_URL emits RECOVERY_REQUEST_FRONTEND_CONFIG_FAILED and preserves enumeration-safe 200', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.FRONTEND_URL;

    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Cliente Prod', 'cliente.prod@example.com') RETURNING id")).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-PROD-01', 'Guia Digital') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Guia Digital')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'bucket', 'file.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'cliente.prod@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const frontendFailLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_FRONTEND_CONFIG_FAILED');
    expect(frontendFailLog).toBeDefined();
    expect(frontendFailLog.correlation_id).toBeDefined();
  });

  it('7. Database exception during execution emits RECOVERY_REQUEST_PRE_DISPATCH_EXCEPTION and returns 200 generic message', async () => {
    await pool.query('DROP TABLE order_deliveries CASCADE');
    await pool.query('DROP TABLE order_items CASCADE');
    await pool.query('DROP TABLE orders CASCADE');

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'error.test@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Se encontrarmos uma compra válida');

    const exceptionLog = capturedLogs.find(l => l.event === 'RECOVERY_REQUEST_PRE_DISPATCH_EXCEPTION');
    expect(exceptionLog).toBeDefined();
    expect(exceptionLog.correlation_id).toBeDefined();
  });

  it('8. Zero PII, secrets, order IDs, customer IDs, tokens in any log output', async () => {
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const secretEmail = 'ultra.secret.buyer@norqva.com.br';
    const secretCpf = '123.456.789-00';
    const cust = (await pool.query("INSERT INTO customers (name, email, cpf) VALUES ('Cliente Super Secret', $1, $2) RETURNING id", [secretEmail, secretCpf])).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-SEC-01', 'Guia Secreto') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Guia Secreto')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook', 'bucket', 'file.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: secretEmail });

    const allLogsJson = JSON.stringify(capturedLogs);
    expect(allLogsJson).not.toContain(secretEmail);
    expect(allLogsJson).not.toContain(secretCpf);
    expect(allLogsJson).not.toContain(cust.id);
    expect(allLogsJson).not.toContain(ord.id);
    expect(allLogsJson).not.toContain(off.id);
    expect(allLogsJson).not.toContain('acesso/');
  });

  it('9. Root cause regression: Normalized schema WITHOUT unnormalized columns on orders completes full flow', async () => {
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Comprador Real', 'comprador.real@norqva.com.br') RETURNING id")).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-TRATTORIA', 'Trattoria em Casa') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Trattoria em Casa — Edição Digital')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Guia PDF', 'bucket', 'guia.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Mock Email Provider to verify email dispatch parameters
    let dispatchedOfferName = '';
    let dispatchedEmail = '';
    const mockProvider: IEmailProvider = {
      sendPurchaseAccessEmail: vi.fn().mockImplementation(async (params) => {
        dispatchedOfferName = params.offerName;
        dispatchedEmail = params.email;
        return { success: true, messageId: 'msg_test_123' };
      })
    };
    (emailService as TransactionalEmailService).setProvider(mockProvider);

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'comprador.real@norqva.com.br', offerHumanId: 'OFF-TRATTORIA' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify events were emitted in exact expected sequence without PRE_DISPATCH_EXCEPTION
    const events = capturedLogs.map(l => l.event).filter(Boolean);
    expect(events).toContain('RECOVERY_REQUEST_ACCEPTED');
    expect(events).toContain('RECOVERY_REQUEST_TOKEN_CREATED');
    expect(events).toContain('RECOVERY_EMAIL_FLOW_START');
    expect(events).not.toContain('RECOVERY_REQUEST_PRE_DISPATCH_EXCEPTION');

    // Confirm dispatch used correct relational snapshot and email
    expect(dispatchedOfferName).toBe('Trattoria em Casa — Edição Digital');
    expect(dispatchedEmail).toBe('comprador.real@norqva.com.br');
  });

  it('10. Multi-item determinism: Correctly selects specific item by offerHumanId and falls back deterministically', async () => {
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Multi Buyer', 'multi.buyer@example.com') RETURNING id")).rows[0];
    const offA = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-MULTI-A', 'Item A') RETURNING id")).rows[0];
    const offB = (await pool.query("INSERT INTO offers (human_id, name) VALUES ('OFF-MULTI-B', 'Item B') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status) VALUES ('${cust.id}', 'PAID') RETURNING id`)).rows[0];

    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${offA.id}', 'Snapshot Item A')`);
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${offB.id}', 'Snapshot Item B')`);

    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Asset Multi', 'bucket', 'multi.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    let dispatchedOfferName = '';
    const mockProvider: IEmailProvider = {
      sendPurchaseAccessEmail: vi.fn().mockImplementation(async (params) => {
        dispatchedOfferName = params.offerName;
        return { success: true, messageId: 'msg_multi_123' };
      })
    };
    (emailService as TransactionalEmailService).setProvider(mockProvider);

    // 10.1. Request with offerHumanId = OFF-MULTI-A recovers Item A
    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'multi.buyer@example.com', offerHumanId: 'OFF-MULTI-A' });
    expect(dispatchedOfferName).toBe('Snapshot Item A');

    // 10.2. Request with offerHumanId = OFF-MULTI-B recovers Item B
    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'multi.buyer@example.com', offerHumanId: 'OFF-MULTI-B' });
    expect(dispatchedOfferName).toBe('Snapshot Item B');

    // 10.3. Request with non-matching offerHumanId returns generic success and does NOT dispatch
    capturedLogs = [];
    const nonMatchRes = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'multi.buyer@example.com', offerHumanId: 'OFF-NONEXISTENT' });
    expect(nonMatchRes.status).toBe(200);
    const nonMatchEvents = capturedLogs.map(l => l.event).filter(Boolean);
    expect(nonMatchEvents).toContain('RECOVERY_REQUEST_NO_ELIGIBLE_PURCHASE');
    expect(nonMatchEvents).not.toContain('RECOVERY_EMAIL_FLOW_START');

    // 10.4. Request without offerHumanId recovers deterministic canonical first item (Item A)
    await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'multi.buyer@example.com' });
    expect(dispatchedOfferName).toBe('Snapshot Item A');
  });
});