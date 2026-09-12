import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { ResendEmailProvider } from '../services/resendProvider';
import {
  TransactionalEmailService,
  emailService,
  clearTestEmails,
  IEmailProvider,
  sanitizeEmailProviderError
} from '../services/emailService';
import { requestOrderRecovery } from '../controllers/api';

describe('NORQVA — Resend Send Path Instrumentation & Observability Privacy Suite (Items A to O)', () => {
  let pool: Pool;
  let app: express.Application;
  const originalEnv = { ...process.env };
  let logSpy: any;
  let warnSpy: any;
  let errorSpy: any;
  let capturedLogs: any[] = [];

  beforeEach(async () => {
    clearTestEmails();
    process.env = { ...originalEnv };
    (emailService as TransactionalEmailService).setProvider(null);
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
    `);

    app = express();
    app.use(express.json());
    app.set('db', pool);
    app.post('/api/checkout/recovery/request', requestOrderRecovery);
  });

  afterEach(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
    (emailService as TransactionalEmailService).setProvider(null);
  });

  // Items J, K, L, M, N: sanitizeEmailProviderError classifications
  it('J: sanitizeEmailProviderError maps auth errors to RESEND_AUTH_ERROR', () => {
    expect(sanitizeEmailProviderError({ statusCode: 401, message: 'API key is invalid' })).toBe('RESEND_AUTH_ERROR');
    expect(sanitizeEmailProviderError({ name: 'unauthorized', message: 'missing api key' })).toBe('RESEND_AUTH_ERROR');
  });

  it('K: sanitizeEmailProviderError maps permission errors to RESEND_PERMISSION_ERROR', () => {
    expect(sanitizeEmailProviderError({ statusCode: 403, message: 'Restricted API key cannot perform this action' })).toBe('RESEND_PERMISSION_ERROR');
    expect(sanitizeEmailProviderError({ message: 'forbidden: permission_denied' })).toBe('RESEND_PERMISSION_ERROR');
  });

  it('L: sanitizeEmailProviderError maps rate limit errors to RESEND_RATE_LIMIT', () => {
    expect(sanitizeEmailProviderError({ statusCode: 429, message: 'Too many requests' })).toBe('RESEND_RATE_LIMIT');
    expect(sanitizeEmailProviderError({ name: 'RateLimitError', message: 'rate_limit_exceeded' })).toBe('RESEND_RATE_LIMIT');
  });

  it('M: sanitizeEmailProviderError maps domain and validation errors to RESEND_DOMAIN_ERROR', () => {
    expect(sanitizeEmailProviderError({ statusCode: 422, message: 'Domain mail.norqva.com.br is not verified' })).toBe('RESEND_DOMAIN_ERROR');
    expect(sanitizeEmailProviderError({ name: 'validation_error', message: 'from_address_not_allowed' })).toBe('RESEND_DOMAIN_ERROR');
  });

  it('N: sanitizeEmailProviderError maps network errors to RESEND_NETWORK_ERROR', () => {
    expect(sanitizeEmailProviderError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.resend.com' })).toBe('RESEND_NETWORK_ERROR');
    expect(sanitizeEmailProviderError({ message: 'fetch failed: network timeout' })).toBe('RESEND_NETWORK_ERROR');
    expect(sanitizeEmailProviderError({ code: 'ECONNRESET', message: 'connection reset by peer' })).toBe('RESEND_NETWORK_ERROR');
  });

  it('B & C: RECOVERY_EMAIL_PROVIDER_RESOLUTION_START and RESOLVED emitted when config valid', () => {
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_test_key_abc123';
    process.env.EMAIL_FROM = 'NORQVA <acesso@mail.norqva.com.br>';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const service = new TransactionalEmailService();
    const resolved = service.getResolvedProvider('corr-test-123');

    expect(resolved).toBeInstanceOf(ResendEmailProvider);

    const startLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_PROVIDER_RESOLUTION_START');
    const resolvedLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_PROVIDER_RESOLVED');

    expect(startLog).toBeDefined();
    expect(startLog.correlation_id).toBe('corr-test-123');
    expect(resolvedLog).toBeDefined();
    expect(resolvedLog.provider).toBe('ResendEmailProvider');
    expect(resolvedLog.correlation_id).toBe('corr-test-123');
  });

  it('D: RECOVERY_EMAIL_PROVIDER_RESOLUTION_FAILED emitted when config missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;

    const service = new TransactionalEmailService();
    const resolved = service.getResolvedProvider('corr-fail-456');

    expect(resolved).toBeNull();

    const failedLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_PROVIDER_RESOLUTION_FAILED');
    expect(failedLog).toBeDefined();
    expect(failedLog.reason).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(failedLog.correlation_id).toBe('corr-fail-456');
  });

  it('E & F: RECOVERY_EMAIL_SEND_START and RECOVERY_EMAIL_SEND_SUCCESS emitted with correlation_id and NO order_id', async () => {
    const mockResendInstance = {
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: 'msg_resend_99999' }, error: null })
      }
    };

    const provider = new ResendEmailProvider('re_mock_key', 'NORQVA <acesso@mail.norqva.com.br>');
    (provider as any).resend = mockResendInstance;

    const result = await provider.sendPurchaseAccessEmail({
      email: 'comprador@example.com',
      offerName: 'Trattoria em Casa',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/mock_token_123',
      correlationId: 'test-corr-abc-999'
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg_resend_99999');

    const sendStartLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_START');
    const sendSuccessLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_SUCCESS');

    expect(sendStartLog).toBeDefined();
    expect(sendStartLog.correlation_id).toBe('test-corr-abc-999');
    expect(sendStartLog.from_configured).toBe(true);
    expect((sendStartLog as any).order_id).toBeUndefined();
    expect((sendStartLog as any).orderId).toBeUndefined();

    expect(sendSuccessLog).toBeDefined();
    expect(sendSuccessLog.correlation_id).toBe('test-corr-abc-999');
    expect(sendSuccessLog.message_id).toBe('msg_resend_99999');
    expect((sendSuccessLog as any).order_id).toBeUndefined();
  });

  it('G: RECOVERY_EMAIL_SEND_FAILED emitted with sanitized error_code and correlation_id (no order_id)', async () => {
    const mockResendInstance = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: 'validation_error', message: 'Domain not verified for sending', statusCode: 422 }
        })
      }
    };

    const provider = new ResendEmailProvider('re_mock_key', 'NORQVA <acesso@mail.norqva.com.br>');
    (provider as any).resend = mockResendInstance;

    const result = await provider.sendPurchaseAccessEmail({
      email: 'comprador@example.com',
      offerName: 'Trattoria em Casa',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/mock_token_123',
      correlationId: 'test-corr-fail-777'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('RESEND_DOMAIN_ERROR');

    const sendFailedLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_FAILED');
    expect(sendFailedLog).toBeDefined();
    expect(sendFailedLog.correlation_id).toBe('test-corr-fail-777');
    expect(sendFailedLog.error_code).toBe('RESEND_DOMAIN_ERROR');
    expect((sendFailedLog as any).order_id).toBeUndefined();
  });

  it('H: RECOVERY_EMAIL_SEND_FAILED emitted with sanitized error_code on thrown network exception', async () => {
    const mockResendInstance = {
      emails: {
        send: vi.fn().mockRejectedValue(new Error('fetch failed: getaddrinfo ENOTFOUND api.resend.com'))
      }
    };

    const provider = new ResendEmailProvider('re_mock_key', 'NORQVA <acesso@mail.norqva.com.br>');
    (provider as any).resend = mockResendInstance;

    const result = await provider.sendPurchaseAccessEmail({
      email: 'comprador@example.com',
      offerName: 'Trattoria em Casa',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/mock_token_123',
      correlationId: 'test-corr-net-888'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('RESEND_NETWORK_ERROR');

    const sendFailedLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_FAILED');
    expect(sendFailedLog).toBeDefined();
    expect(sendFailedLog.correlation_id).toBe('test-corr-net-888');
    expect(sendFailedLog.error_code).toBe('RESEND_NETWORK_ERROR');
    expect((sendFailedLog as any).order_id).toBeUndefined();
  });

  it('A, I & O: Full flow correlates with random correlation_id, zero order_id/customerId/PII/secret leakage', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = 're_super_secret_production_key_xyz987';
    process.env.EMAIL_FROM = 'NORQVA <acesso@mail.norqva.com.br>';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    // Insert customer, offer, paid order, active delivery
    const sensitiveEmail = 'comprador.vip@seguro.com.br';
    const sensitiveCpf = '999.888.777-66';
    const cust = (await pool.query("INSERT INTO customers (name, email, cpf) VALUES ('Cliente VIP', $1, $2) RETURNING id", [sensitiveEmail, sensitiveCpf])).rows[0];
    const off = (await pool.query("INSERT INTO offers (human_id, name, price_cents) VALUES ('OFF-000001', 'Trattoria em Casa', 1990) RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, status, total_amount) VALUES ('${cust.id}', 'PAID', 19.90) RETURNING id`)).rows[0];
    await pool.query(`INSERT INTO order_items (order_id, offer_id, offer_name_snapshot) VALUES ('${ord.id}', '${off.id}', 'Trattoria em Casa')`);
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('Ebook PDF', 'bucket', 'path.pdf') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Mock Resend SDK inside provider
    let capturedToEmail = '';
    const mockResendInstance = {
      emails: {
        send: vi.fn().mockImplementation(async (payload) => {
          capturedToEmail = payload.to[0];
          return { data: { id: 're_msg_live_flow_123' }, error: null };
        })
      }
    };

    const mockProvider = new ResendEmailProvider('re_super_secret_production_key_xyz987', 'NORQVA <acesso@mail.norqva.com.br>');
    (mockProvider as any).resend = mockResendInstance;
    (emailService as TransactionalEmailService).setProvider(mockProvider);

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: sensitiveEmail, offerHumanId: 'OFF-000001' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Se encontrarmos uma compra válida');

    // Verify events were emitted
    const flowStartLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_FLOW_START');
    const resStartLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_PROVIDER_RESOLUTION_START');
    const sendStartLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_START');
    const sendSuccessLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_SEND_SUCCESS');
    const flowEndLog = capturedLogs.find(l => l.event === 'RECOVERY_EMAIL_FLOW_END');

    expect(flowStartLog).toBeDefined();
    expect(flowStartLog.correlation_id).toBeDefined();
    expect(flowStartLog.is_demo).toBe(false);

    const correlationId = flowStartLog.correlation_id;
    expect(typeof correlationId).toBe('string');
    expect(correlationId.length).toBeGreaterThan(16);

    // Verify correlationId matches across all related events
    expect(resStartLog.correlation_id).toBe(correlationId);
    expect(sendStartLog.correlation_id).toBe(correlationId);
    expect(sendSuccessLog.correlation_id).toBe(correlationId);
    expect(flowEndLog.correlation_id).toBe(correlationId);

    // Item O: Zero PII, zero tokens, zero commercial IDs (order_id, customer_id, offer_id) in logs
    const allLogStrings = JSON.stringify(capturedLogs);

    expect(allLogStrings).not.toContain(ord.id);
    expect(allLogStrings).not.toContain(cust.id);
    expect(allLogStrings).not.toContain(off.id);
    expect(allLogStrings).not.toContain(sensitiveEmail);
    expect(allLogStrings).not.toContain(sensitiveCpf);
    expect(allLogStrings).not.toContain('re_super_secret_production_key_xyz987');

    // Confirm SDK itself received the email
    expect(capturedToEmail).toBe(sensitiveEmail);
  });
});
