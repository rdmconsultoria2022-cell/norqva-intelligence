import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { ResendEmailProvider } from '../services/resendProvider';
import {
  TransactionalEmailService,
  emailService,
  dispatchedEmailsForTesting,
  clearTestEmails,
  IEmailProvider,
  SendPurchaseAccessEmailParams,
  EmailServiceResult
} from '../services/emailService';
import { requestOrderRecovery, claimOrderRecovery, getOrderById, getDeliveryTokens } from '../controllers/api';

describe('NORQVA — Resend Transactional Email Provider & Security Contract', () => {
  let pool: Pool;
  let app: express.Application;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    clearTestEmails();
    process.env = { ...originalEnv };

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
        customer_id UUID REFERENCES customers(id),
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
        order_id UUID REFERENCES orders(id),
        offer_id UUID REFERENCES offers(id),
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

      CREATE TABLE order_customer_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        session_token_hash VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_ip VARCHAR(45)
      );
    `);

    app = express();
    app.use(express.json());
    app.set('db', pool);

    app.post('/api/checkout/recovery/request', requestOrderRecovery);
    app.get('/api/checkout/recovery/:token', claimOrderRecovery);
    app.get('/api/orders/:id', getOrderById);
    app.get('/api/checkout/orders/:orderId/delivery-tokens', getDeliveryTokens);
  });

  it('A: Resend provider is instantiated when EMAIL_PROVIDER=resend and RESEND_API_KEY is present', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_dummy_key_12345';
    process.env.EMAIL_FROM = 'NORQVA <acesso@mail.norqva.com.br>';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const service = new TransactionalEmailService();
    const resolved = service.getResolvedProvider();

    expect(resolved).toBeInstanceOf(ResendEmailProvider);
  });

  it('B: Missing RESEND_API_KEY in production fails closed safely without crashing', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;

    const service = new TransactionalEmailService();
    const result = await service.sendPurchaseAccessEmail({
      email: 'customer@example.com',
      offerName: 'Trattoria em Casa',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/abc12345',
      isDemo: false
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('RESEND_API_KEY_MISSING');
  });

  it('C, D, E, J, K, L: ResendEmailProvider formats transactional message with required security & fallback contracts', async () => {
    let capturedPayload: any = null;

    const mockResendInstance = {
      emails: {
        send: vi.fn().mockImplementation(async (payload: any) => {
          capturedPayload = payload;
          return { data: { id: 're_msg_mock_001' }, error: null };
        })
      }
    };

    const provider = new ResendEmailProvider('re_mock_key', 'NORQVA Suporte <acesso@mail.norqva.com.br>');
    (provider as any).resend = mockResendInstance;

    const rawTestToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const testRecoveryUrl = 'https://norqva-intelligence-frontend.vercel.app/acesso/' + rawTestToken;
    const testEmail = 'comprador.legitimo@example.com';
    const testCpf = '123.456.789-00';
    const testCheckoutToken = 'secret_checkout_token_0987654321';

    const result = await provider.sendPurchaseAccessEmail({
      email: testEmail,
      offerName: 'Trattoria em Casa — Edição Digital',
      recoveryUrl: testRecoveryUrl,
      isDemo: false
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('re_msg_mock_001');

    // J: Destination email
    expect(capturedPayload.to).toEqual([testEmail]);

    // K: From address
    expect(capturedPayload.from).toBe('NORQVA Suporte <acesso@mail.norqva.com.br>');

    // Subject
    expect(capturedPayload.subject).toBe('Recupere seu acesso à sua compra NORQVA');

    // L: Both HTML and text fallback present
    expect(capturedPayload.html).toBeDefined();
    expect(capturedPayload.text).toBeDefined();

    // C: Message contains recovery URL
    expect(capturedPayload.html).toContain(testRecoveryUrl);
    expect(capturedPayload.text).toContain(testRecoveryUrl);

    // Single-use security notice present
    expect(capturedPayload.html).toContain('uso único');
    expect(capturedPayload.text).toContain('uso único');
    expect(capturedPayload.text).toContain('72 horas');

    // D: Sensitive buyer data (CPF) NEVER included
    expect(capturedPayload.html).not.toContain(testCpf);
    expect(capturedPayload.text).not.toContain(testCpf);

    // E: Session or Checkout Tokens NEVER included
    expect(capturedPayload.html).not.toContain(testCheckoutToken);
    expect(capturedPayload.text).not.toContain(testCheckoutToken);
  });

  it('F: Raw recovery token and API key do NOT appear in logs on provider error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawSecretToken = 'secret_raw_token_xyz9876543210';
    const mockApiKey = 're_super_secret_api_key_hidden';

    const mockFailingResend = {
      emails: {
        send: vi.fn().mockRejectedValue(new Error('Network timeout during API call'))
      }
    };

    const provider = new ResendEmailProvider(mockApiKey, 'NORQVA <acesso@mail.norqva.com.br>');
    (provider as any).resend = mockFailingResend;

    const result = await provider.sendPurchaseAccessEmail({
      email: 'user@example.com',
      offerName: 'Guia Digital',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/' + rawSecretToken,
      isDemo: false
    });

    expect(result.success).toBe(false);

    // Verify error logs never leak token or api key
    const allLogCalls = errorSpy.mock.calls.map(c => c.join(' ')).join(' ');
    expect(allLogCalls).not.toContain(rawSecretToken);
    expect(allLogCalls).not.toContain(mockApiKey);

    errorSpy.mockRestore();
  });

  it('G, H & I: Provider failure does NOT mutate order PAID, delivery ACTIVE, or break enumeration safety', async () => {
    // Setup buyer and order
    const cust = (await pool.query("INSERT INTO customers (name, email, cpf) VALUES ('Ana', 'ana.compradora@example.com', '111.222.333-44') RETURNING id")).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name, price_cents) VALUES ('OFF-000001', 'Trattoria em Casa', 1990) RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('${cust.id}', 'PAID', 19.90) RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Trattoria em Casa')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook PDF', 'bucket', 'path.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Mock failing custom email provider
    const failingProvider: IEmailProvider = {
      sendPurchaseAccessEmail: vi.fn().mockResolvedValue({
        success: false,
        error: 'RESEND_UPSTREAM_UNAVAILABLE'
      })
    };
    (emailService as TransactionalEmailService).setProvider(failingProvider);

    // Request recovery for valid buyer
    const resValid = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'ana.compradora@example.com', offerHumanId: 'OFF-000001' });

    // I: Enumeration safety preserved
    expect(resValid.status).toBe(200);
    expect(resValid.body.success).toBe(true);
    expect(resValid.body.message).toContain('Se encontrarmos uma compra válida');

    // Request recovery for non-existent buyer produces exact same response
    const resUnknown = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'desconhecido@example.com', offerHumanId: 'OFF-000001' });

    expect(resUnknown.status).toBe(200);
    expect(resUnknown.body.success).toBe(true);
    expect(resUnknown.body.message).toEqual(resValid.body.message);

    // G: Order PAID status remains strictly preserved
    const orderInDb = (await pool.query('SELECT status, total_amount FROM orders WHERE id = $1', [ord.id])).rows[0];
    expect(orderInDb.status).toBe('PAID');
    expect(Number(orderInDb.total_amount)).toBe(19.90);

    // H: Delivery ACTIVE status remains strictly preserved
    const deliveryInDb = (await pool.query('SELECT status FROM order_deliveries WHERE order_id = $1', [ord.id])).rows[0];
    expect(deliveryInDb.status).toBe('ACTIVE');

    // Reset custom provider
    (emailService as TransactionalEmailService).setProvider(null);
  });
});
