import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { Pool } from 'pg';
import { newDb } from 'pg-mem';
import {
  validateTransactionalEmailConfig,
  validateFrontendUrl,
  isValidEmailFrom
} from '../services/emailConfig';
import {
  TransactionalEmailService,
  emailService,
  clearTestEmails
} from '../services/emailService';
import { requestOrderRecovery } from '../controllers/api';

describe('NORQVA — Production Email & Recovery Environment Configuration Hardening', () => {
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
    });
    mem.public.registerFunction({
      name: 'now',
      implementation: () => new Date(),
    });

    const db = mem.adapters.createPg();
    pool = new db.Pool();

    await pool.query(`
      CREATE TABLE customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE digital_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        storage_bucket VARCHAR(255) NOT NULL,
        storage_path VARCHAR(512) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      );

      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id),
        offer_id UUID,
        offer_human_id VARCHAR(50),
        offer_name_snapshot VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        total_amount NUMERIC(10,2) NOT NULL DEFAULT 19.90,
        checkout_token_hash VARCHAR(64),
        is_demo BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE order_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id),
        asset_id UUID NOT NULL REFERENCES digital_assets(id),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
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
        created_ip VARCHAR(64)
      );
    `);

    app = express();
    app.use(express.json());
    app.set('db', pool);

    app.post('/api/checkout/recovery/request', requestOrderRecovery);
  });

  // A: FRONTEND_URL ausente em produção -> inválido
  it('A: FRONTEND_URL missing in production is rejected as invalid config', () => {
    const res = validateFrontendUrl('', true);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('FRONTEND_URL_MISSING');
  });

  // B: FRONTEND_URL=http://localhost:5173 -> rejeitado em produção
  it('B: FRONTEND_URL with localhost is rejected in production', () => {
    const res = validateFrontendUrl('http://localhost:5173', true);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('FRONTEND_URL_MUST_BE_HTTPS');

    const resHttpsLocalhost = validateFrontendUrl('https://localhost:5173', true);
    expect(resHttpsLocalhost.valid).toBe(false);
    expect(resHttpsLocalhost.error).toBe('FRONTEND_URL_LOCALHOST_PROHIBITED_IN_PROD');

    const res127 = validateFrontendUrl('https://127.0.0.1:8080', true);
    expect(res127.valid).toBe(false);
    expect(res127.error).toBe('FRONTEND_URL_LOCALHOST_PROHIBITED_IN_PROD');
  });

  // C: FRONTEND_URL=http://example.com -> rejeitado (não-HTTPS)
  it('C: FRONTEND_URL without HTTPS protocol is rejected in production', () => {
    const res = validateFrontendUrl('http://norqva-intelligence-frontend.vercel.app', true);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('FRONTEND_URL_MUST_BE_HTTPS');
  });

  // D: FRONTEND_URL=https://... válido -> aceito
  it('D: Valid HTTPS FRONTEND_URL is accepted', () => {
    const res = validateFrontendUrl('https://norqva-intelligence-frontend.vercel.app', true);
    expect(res.valid).toBe(true);
    expect(res.url).toBe('https://norqva-intelligence-frontend.vercel.app');
  });

  // E: FRONTEND_URL relativa -> rejeitada
  it('E: Relative FRONTEND_URL is rejected', () => {
    const res = validateFrontendUrl('/acesso/12345', true);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('FRONTEND_URL_MALFORMED');
  });

  // F: EMAIL_FROM ausente em produção -> inválido
  it('F: EMAIL_FROM missing in production is rejected', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_valid_key',
      FRONTEND_URL: 'https://norqva-intelligence-frontend.vercel.app'
      // EMAIL_FROM undefined
    };
    const res = validateTransactionalEmailConfig(env);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('EMAIL_FROM_MISSING');
  });

  // G: EMAIL_FROM vazio -> inválido
  it('G: EMAIL_FROM empty in production is rejected', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_valid_key',
      EMAIL_FROM: '   ',
      FRONTEND_URL: 'https://norqva-intelligence-frontend.vercel.app'
    };
    const res = validateTransactionalEmailConfig(env);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('EMAIL_FROM_MISSING');
  });

  // H: EMAIL_FROM malformed -> inválido
  it('H: EMAIL_FROM malformed is rejected', () => {
    expect(isValidEmailFrom('invalido')).toBe(false);
    expect(isValidEmailFrom('NORQVA <invalido>')).toBe(false);
    expect(isValidEmailFrom('NORQVA <@mail.com>')).toBe(false);

    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_valid_key',
      EMAIL_FROM: 'email_sem_arroba',
      FRONTEND_URL: 'https://norqva-intelligence-frontend.vercel.app'
    };
    const res = validateTransactionalEmailConfig(env);
    expect(res.valid).toBe(false);
    expect(res.error).toBe('EMAIL_FROM_MALFORMED');
  });

  // I: EMAIL_FROM válido -> aceito
  it('I: Valid EMAIL_FROM is accepted', () => {
    expect(isValidEmailFrom('NORQVA <acesso@mail.norqva.com.br>')).toBe(true);
    expect(isValidEmailFrom('acesso@mail.norqva.com.br')).toBe(true);

    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_valid_key_123',
      EMAIL_FROM: 'NORQVA <acesso@mail.norqva.com.br>',
      FRONTEND_URL: 'https://norqva-intelligence-frontend.vercel.app'
    };
    const res = validateTransactionalEmailConfig(env);
    expect(res.valid).toBe(true);
    expect(res.from).toBe('NORQVA <acesso@mail.norqva.com.br>');
  });

  // J: RESEND_API_KEY ausente -> envio fail-safe
  it('J: RESEND_API_KEY missing in production fails safe with sanitized code', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = 'NORQVA <acesso@mail.norqva.com.br>';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const service = new TransactionalEmailService();
    const result = await service.sendPurchaseAccessEmail({
      email: 'comprador@example.com',
      offerName: 'Guia',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/abc'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('RESEND_API_KEY_MISSING');
  });

  // K: EMAIL_PROVIDER desconhecido -> fail-safe / config invalid
  it('K: Unknown EMAIL_PROVIDER returns sanitized config error', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'unknown_mailer_xyz';
    process.env.RESEND_API_KEY = 're_key';
    process.env.EMAIL_FROM = 'NORQVA <acesso@mail.norqva.com.br>';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const service = new TransactionalEmailService();
    const result = await service.sendPurchaseAccessEmail({
      email: 'comprador@example.com',
      offerName: 'Guia',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/abc'
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('UNKNOWN_EMAIL_PROVIDER');
  });

  // L: Nenhum erro expõe API key ou token
  it('L: Error messages never leak API keys or raw tokens', async () => {
    const errorSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const secretKey = 're_secret_key_999888777';
    const secretToken = 'raw_magic_token_111222333';

    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'resend';
    process.env.RESEND_API_KEY = secretKey;
    process.env.EMAIL_FROM = 'invalid_format';
    process.env.FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

    const service = new TransactionalEmailService();
    const result = await service.sendPurchaseAccessEmail({
      email: 'user@example.com',
      offerName: 'Guia',
      recoveryUrl: 'https://norqva-intelligence-frontend.vercel.app/acesso/' + secretToken
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('EMAIL_FROM_MALFORMED');

    const logOutput = errorSpy.mock.calls.map(c => c.join(' ')).join(' ');
    expect(logOutput).not.toContain(secretKey);
    expect(logOutput).not.toContain(secretToken);

    errorSpy.mockRestore();
  });

  // M & N: Config inválida não altera order PAID nem delivery ACTIVE
  it('M & N: Invalid email config does NOT mutate order PAID, delivery ACTIVE, and keeps generic response', async () => {
    const cust = (await pool.query("INSERT INTO customers (name, email) VALUES ('Marcio', 'marcio@example.com') RETURNING id")).rows[0];
    const ord = (await pool.query(`INSERT INTO orders (customer_id, offer_human_id, offer_name_snapshot, status, total_amount) VALUES ('${cust.id}', 'OFF-000001', 'Trattoria em Casa', 'PAID', 19.90) RETURNING id`)).rows[0];
    const ast = (await pool.query("INSERT INTO digital_assets (name, storage_bucket, storage_path) VALUES ('PDF', 'b', 'p') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO order_deliveries (order_id, asset_id, status) VALUES ('${ord.id}', '${ast.id}', 'ACTIVE')`);

    // Invalidate config in production
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_PROVIDER = 'resend';
    delete process.env.RESEND_API_KEY;
    delete process.env.FRONTEND_URL;

    const res = await request(app)
      .post('/api/checkout/recovery/request')
      .send({ email: 'marcio@example.com', offerHumanId: 'OFF-000001' });

    // Client receives generic success message
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Se encontrarmos uma compra válida');

    // M: Order PAID remains intact
    const orderDb = (await pool.query('SELECT status, total_amount FROM orders WHERE id = $1', [ord.id])).rows[0];
    expect(orderDb.status).toBe('PAID');
    expect(Number(orderDb.total_amount)).toBe(19.90);

    // N: Delivery ACTIVE remains intact
    const deliveryDb = (await pool.query('SELECT status FROM order_deliveries WHERE order_id = $1', [ord.id])).rows[0];
    expect(deliveryDb.status).toBe('ACTIVE');
  });
});
