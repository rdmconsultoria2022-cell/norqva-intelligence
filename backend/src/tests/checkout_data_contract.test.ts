import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { Pool } from 'pg';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { validateCpf, validateFullName, validateEmail } from '../utils/validation';

describe('NORQVA — Checkout Data Contract & Validation (Server-Side)', () => {
  const originalEnv = { ...process.env };
  let pool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
    process.env.AUTH_MODE = 'demo';
    pool = initializeDB();
    verifyTestDbSafety();
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test', ALLOW_DESTRUCTIVE_TESTS: 'true' };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Validation Utilities', () => {
    it('validateCpf: strictly validates Brazilian CPF Modulo 11 check digits', () => {
      expect(validateCpf('')).toBe(false);
      expect(validateCpf(null)).toBe(false);
      expect(validateCpf(undefined)).toBe(false);
      expect(validateCpf('12345678900')).toBe(false);
      expect(validateCpf('00000000000')).toBe(false);
      expect(validateCpf('11111111111')).toBe(false);
      expect(validateCpf('99999999999')).toBe(false);
      expect(validateCpf('52998224725')).toBe(true);
      expect(validateCpf('529.982.247-25')).toBe(true);
    });

    it('validateFullName: validates full name requirements (min 2 tokens)', () => {
      expect(validateFullName('')).toBe(false);
      expect(validateFullName('Maria')).toBe(false);
      expect(validateFullName('   Maria   ')).toBe(false);
      expect(validateFullName('Maria da Silva')).toBe(true);
      expect(validateFullName('Carlos Drummond de Andrade')).toBe(true);
    });

    it('validateEmail: validates standard RFC 5322 email patterns', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('maria@')).toBe(false);
      expect(validateEmail('@domain.com')).toBe(false);
      expect(validateEmail('maria.silva@exemplo.com')).toBe(true);
    });
  });

  describe('POST /api/customers Data Contract & Fail-Closed Guardrails', () => {
    it('rejects empty or single-token name with consumer-safe Portuguese message', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'Maria',
          email: 'maria.silva@exemplo.com',
          cpf_cnpj: '52998224725',
          is_demo: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Informe seu nome completo (nome e sobrenome).');
    });

    it('rejects invalid email format with consumer-safe Portuguese message', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'Maria da Silva',
          email: 'maria-sem-arroba',
          cpf_cnpj: '52998224725',
          is_demo: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Informe um e-mail válido.');
    });

    it('rejects commercial checkout without CPF with consumer-safe Portuguese message', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'Maria da Silva',
          email: `maria-${Date.now()}@exemplo.com`,
          is_demo: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Informe um CPF válido para continuar.');
    });

    it('rejects commercial checkout with invalid check-digit CPF', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'Maria da Silva',
          email: `maria-${Date.now()}@exemplo.com`,
          cpf_cnpj: '123.456.789-00',
          is_demo: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Informe um CPF válido para continuar.');
    });

    it('rejects commercial checkout with repeated-digit CPF (e.g. 00000000000)', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'Maria da Silva',
          email: `maria-${Date.now()}@exemplo.com`,
          cpf_cnpj: '000.000.000-00',
          is_demo: false
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Informe um CPF válido para continuar.');
    });

    it('allows demo mode without CPF for QA test compatibility', async () => {
      const res = await request(app)
        .post('/api/customers')
        .send({
          name: 'QA Test Demo Buyer',
          email: `demo-${Date.now()}@qa.test`,
          is_demo: true
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.id).toBeDefined();
    });
  });
});
