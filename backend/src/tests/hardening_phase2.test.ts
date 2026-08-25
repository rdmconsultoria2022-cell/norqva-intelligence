import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import http from 'http';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { resetAllRateLimits, createRateLimiter } from '../middleware/rateLimiter';
import { sanitizePayload } from '../middleware/logging';
import { gracefulShutdown } from '../utils/shutdown';

let pool: Pool;

beforeAll(async () => {
  pool = initializeDB();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
  verifyTestDbSafety();

  const client = await pool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS payment_webhook_events CASCADE;');
    await client.query('DROP TABLE IF EXISTS payments CASCADE;');
    await client.query('DROP TABLE IF EXISTS payment_provider_customers CASCADE;');
    await client.query('DROP TABLE IF EXISTS order_deliveries CASCADE;');
    await client.query('DROP TABLE IF EXISTS offer_digital_assets CASCADE;');
    await client.query('DROP TABLE IF EXISTS digital_assets CASCADE;');
    await client.query('DROP TABLE IF EXISTS order_items CASCADE;');
    await client.query('DROP TABLE IF EXISTS orders CASCADE;');
    await client.query('DROP TABLE IF EXISTS customers CASCADE;');
    await client.query('DROP TABLE IF EXISTS performance_entries CASCADE;');
    await client.query('DROP TABLE IF EXISTS capital_authorizations CASCADE;');
    await client.query('DROP TABLE IF EXISTS decisions CASCADE;');
    await client.query('DROP TABLE IF EXISTS audit_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiment_creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiments CASCADE;');
    await client.query('DROP TABLE IF EXISTS creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS offers CASCADE;');
    await client.query('DROP TABLE IF EXISTS products CASCADE;');
    await client.query('DROP TABLE IF EXISTS score_component_evidences CASCADE;');
    await client.query('DROP TABLE IF EXISTS score_components CASCADE;');
    await client.query('DROP TABLE IF EXISTS score_model_components CASCADE;');
    await client.query('DROP TABLE IF EXISTS score_models CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunity_risks CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunity_scores CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunity_reviews CASCADE;');
    await client.query('DROP TABLE IF EXISTS decision_snapshots CASCADE;');
    await client.query('DROP TABLE IF EXISTS ai_executions CASCADE;');
    await client.query('DROP TABLE IF EXISTS ai_analyses CASCADE;');
    await client.query('DROP TABLE IF EXISTS research_tasks CASCADE;');
    await client.query('DROP TABLE IF EXISTS research_sessions CASCADE;');
    await client.query('DROP TABLE IF EXISTS prompts CASCADE;');
    await client.query('DROP TABLE IF EXISTS evidences CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunities CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
  } finally {
    client.release();
  }

  await runMigrations(pool);
  await seedDemoData(pool);
});

afterAll(async () => {
  await pool.end();
});

beforeEach(() => {
  resetAllRateLimits();
});

describe('GATE 2.5F Phase 2 — Backend Security & Reliability Hardening (H01 - H20)', () => {

  // H01: security headers present
  it('H01 security headers present', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-xss-protection']).toBe('0');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  // H02: allowed CORS origin
  it('H02 allowed CORS origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // H03: rejected CORS origin
  it('H03 rejected CORS origin', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://malicious-external-attacker.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('CORS origin not allowed');
  });

  // H04: server-to-server no-Origin request
  it('H04 server-to-server no-Origin request', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // H05: OPTIONS preflight
  it('H05 OPTIONS preflight', async () => {
    const res = await request(app)
      .options('/api/checkout')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  // H06: general rate limiter
  it('H06 general rate limiter', async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      max: 3,
      name: 'test_general'
    });

    const mockReq: any = { ip: '127.0.0.1', headers: {}, socket: {} };
    const mockRes: any = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const mockNext = vi.fn();

    // 3 allowed requests
    testLimiter(mockReq, mockRes, mockNext);
    testLimiter(mockReq, mockRes, mockNext);
    testLimiter(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(3);

    // 4th request blocked
    testLimiter(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Too many requests')
    }));
  });

  // H07: sensitive endpoint rate limiter
  it('H07 sensitive endpoint rate limiter', async () => {
    const authLimiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      name: 'test_auth_limiter',
      message: 'Too many authentication attempts.'
    });

    const mockReq: any = { ip: '192.168.1.10', headers: {}, socket: {} };
    const mockRes: any = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const mockNext = vi.fn();

    authLimiter(mockReq, mockRes, mockNext);
    authLimiter(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(2);

    authLimiter(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Too many authentication attempts.'
    }));
  });

  // H08: webhook remains reachable under legitimate conditions
  it('H08 webhook remains reachable under legitimate conditions without CORS restriction', async () => {
    const res = await request(app)
      .post('/api/webhooks/asaas')
      .send({});
    // Should pass CORS and reach webhook controller (401 because header token missing)
    expect(res.status).toBe(401);
  });

  // H09: /health liveness
  it('H09 /health liveness', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  // H10: /ready DB healthy
  it('H10 /ready DB healthy', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database).toBe('connected');
  });

  // H11: /ready DB failure -> 503
  it('H11 /ready DB failure -> 503', async () => {
    const brokenPool: any = {
      query: vi.fn().mockRejectedValue(new Error('Connection terminated'))
    };

    app.set('db', brokenPool);

    try {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unready');
      expect(res.body.database).toBe('disconnected');
    } finally {
      app.set('db', pool);
    }
  });

  // H12: request ID generated
  it('H12 request ID generated', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThanOrEqual(16);
  });

  // H13: valid correlation ID propagated
  it('H13 valid correlation ID propagated', async () => {
    const customId = 'req-trace-abc-12345-xyz';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', customId);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  // H14: invalid correlation ID replaced
  it('H14 invalid correlation ID replaced', async () => {
    const invalidId = '<script>bad_id</script>';
    const res = await request(app)
      .get('/health')
      .set('X-Request-Id', invalidId);
    expect(res.headers['x-request-id']).not.toBe(invalidId);
    expect(res.headers['x-request-id'].length).toBeGreaterThanOrEqual(16);
  });

  // H15: sensitive headers not logged
  it('H15 sensitive headers not logged', () => {
    const headers = {
      authorization: 'Bearer secret_jwt_token_value_123',
      cookie: 'session_id=secret_cookie_data',
      'asaas-access-token': 'secret_webhook_token'
    };

    const sanitized = sanitizePayload(headers);
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.cookie).toBe('[REDACTED]');
    expect(sanitized['asaas-access-token']).toBe('[REDACTED]');
  });

  // H16: sensitive body fields redacted
  it('H16 sensitive body fields redacted', () => {
    const payload = {
      name: 'João Silva',
      email: 'joao@example.com',
      password: 'plain_user_password',
      cpf_cnpj: '123.456.789-00',
      pix_copy_paste: '00020126580014br.gov.bcb.pix...',
      download_url: 'https://storage.supabase.co/signed?token=secret',
      checkout_token: 'secret_token_abc'
    };

    const sanitized = sanitizePayload(payload);
    expect(sanitized.name).toBe('João Silva');
    expect(sanitized.email).toBe('joao@example.com');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.cpf_cnpj).toBe('[REDACTED]');
    expect(sanitized.pix_copy_paste).toBe('[REDACTED]');
    expect(sanitized.download_url).toBe('[REDACTED]');
    expect(sanitized.checkout_token).toBe('[REDACTED]');
  });

  // H17: production errors hide stack/internal details
  it('H17 production errors hide stack/internal details', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@norqva.com', password: 'bad' });

      expect(res.body.stack).toBeUndefined();
      expect(res.body.error).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // H18: graceful shutdown closes HTTP server
  it('H18 graceful shutdown closes HTTP server', async () => {
    const mockServer = http.createServer();
    mockServer.listen(0);

    const result = await gracefulShutdown(mockServer, undefined, { timeoutMs: 2000 });
    expect(result.closedServer).toBe(true);
  });

  // H19: graceful shutdown closes DB pool
  it('H19 graceful shutdown closes DB pool', async () => {
    const mockPool: any = {
      end: vi.fn().mockResolvedValue(undefined)
    };

    const result = await gracefulShutdown(undefined, mockPool, { timeoutMs: 2000 });
    expect(result.closedPool).toBe(true);
    expect(mockPool.end).toHaveBeenCalled();
  });

  // H20: shutdown has bounded timeout
  it('H20 shutdown has bounded timeout', async () => {
    const hangingServer: any = {
      close: (cb: any) => {
        // Deliberately do NOT call callback to simulate hung connections
      }
    };

    const start = Date.now();
    await gracefulShutdown(hangingServer, undefined, { timeoutMs: 300 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(250);
  });
});
