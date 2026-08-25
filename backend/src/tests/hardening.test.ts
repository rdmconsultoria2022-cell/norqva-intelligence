import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';

let pool: Pool;
let adminToken: string;
let adminAuthId: string;
let adminUserId: string;

beforeAll(async () => {
  pool = initializeDB();
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
  verifyTestDbSafety();

  // Reset database safely
  const client = await pool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS performance_entries CASCADE;');
    await client.query('DROP TABLE IF EXISTS capital_authorizations CASCADE;');
    await client.query('DROP TABLE IF EXISTS decisions CASCADE;');
    await client.query('DROP TABLE IF EXISTS audit_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiment_creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiments CASCADE;');
    await client.query('DROP TABLE IF EXISTS creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS offers CASCADE;');
    await client.query('DROP TABLE IF EXISTS products CASCADE;');
    await client.query('DROP TABLE IF EXISTS evidences CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunities CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
  } finally {
    client.release();
  }

  await runMigrations(pool);
  await seedDemoData(pool);

  // Create admin user & token
  adminAuthId = crypto.randomUUID();
  adminUserId = crypto.randomUUID();
  
  const client2 = await pool.connect();
  try {
    await client2.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Hardening Admin', 'hard_admin@norqva.com', 'ADMIN', 'ACTIVE', TRUE)`,
      [adminUserId, adminAuthId]
    );
  } finally {
    client2.release();
  }

  adminToken = signSupabaseToken({ sub: adminAuthId }, 3600);
});

afterAll(async () => {
  await pool.end();
});

describe('NORQVA Cross-Isolation & Hardening Validation', () => {

  // Caso 1: Criar produto REAL. Tentar associar oferta DEMO. -> DEVE FALHAR (409)
  it('should prevent linking a DEMO Offer to a REAL Product with 409 Conflict', async () => {
    // 1. Create real product in DB
    const realPrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, estimated_cost, is_demo)
       VALUES ($1, 'PRD-REAL99', 'Real Product', 'Hardware', 'Description', 'PLANEJADO', 200.00, FALSE)`,
      [realPrdId]
    );

    // 2. Post demo offer linked to real product -> should fail with 409
    const res = await request(app)
      .post('/api/offers?mode=demo') // query mode=demo
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        product_id: realPrdId,
        name: 'Demo Offer for Real Product',
        price: 150.00,
        description: 'Testing isolation'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('escopo');
  });

  // Caso 2: Criar experimento REAL. Tentar associar criativo DEMO. -> DEVE FALHAR (409)
  it('should prevent linking a DEMO Creative to a REAL Experiment with 409 Conflict', async () => {
    // 1. Create real product & offer in DB
    const realPrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, estimated_cost, is_demo)
       VALUES ($1, 'PRD-REAL98', 'Real Product 2', 'Hardware', 'Description', 'PLANEJADO', 200.00, FALSE)`,
      [realPrdId]
    );

    const realOffId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, is_demo)
       VALUES ($1, 'OFF-REAL98', $2, 'Real Offer', 100.00, 'Description', FALSE)`,
      [realOffId, realPrdId]
    );

    // 2. Create demo creative
    const demoCrId = crypto.randomUUID();
    // Wait, creative needs to be demo, so associated product must be demo!
    const demoPrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, estimated_cost, is_demo)
       VALUES ($1, 'PRD-DEMO98', 'Demo Product', 'Hardware', 'Description', 'PLANEJADO', 200.00, TRUE)`,
      [demoPrdId]
    );
    await pool.query(
      `INSERT INTO creatives (id, human_id, product_id, hook, concept, copy, cta, format, file_url, status, is_demo)
       VALUES ($1, 'CR-DEMO98', $2, 'Hook', 'Concept', 'Copy', 'CTA', 'IMAGE', 'http://url', 'IDEIA', TRUE)`,
      [demoCrId, demoPrdId]
    );

    // 3. Attempt to create real experiment linking demo creative -> should fail (409)
    const res = await request(app)
      .post('/api/experiments?mode=real') // query mode=real
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Real Experiment',
        hypothesis: 'Testing isolation',
        product_id: realPrdId,
        offer_id: realOffId,
        creative_ids: [demoCrId],
        start_date: '2026-08-22'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('escopo');
  });

  // Caso 3: Tentar lançar performance REAL em experimento DEMO. -> DEVE FALHAR (409)
  it('should prevent logging REAL Performance to a DEMO Experiment with 409 Conflict', async () => {
    // 1. Get a demo experiment
    const expRes = await pool.query('SELECT id FROM experiments WHERE is_demo = TRUE LIMIT 1');
    const demoExpId = expRes.rows[0].id;

    // 2. Log real performance -> should fail (409)
    const res = await request(app)
      .post(`/api/experiments/${demoExpId}/performance?mode=real`) // query mode=real
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-08-22',
        source: 'MANUAL',
        investment: 100.00
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('escopo');
  });

  // Caso 4: Tentar autorizar Capital at Risk REAL em experimento DEMO. -> DEVE FALHAR (409)
  it('should prevent authorizing REAL Capital to a DEMO Experiment with 409 Conflict', async () => {
    // 1. Get a demo experiment
    const expRes = await pool.query('SELECT id FROM experiments WHERE is_demo = TRUE LIMIT 1');
    const demoExpId = expRes.rows[0].id;

    // 2. Log real capital authorization -> should fail (409)
    const res = await request(app)
      .post(`/api/experiments/${demoExpId}/capital?mode=real`) // query mode=real
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 500.00,
        justification: 'Attempt real capital authorization on demo exp.'
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('escopo');
  });

  describe('Supabase Local Test Compatibility Bootstrap Guards', () => {
    it('LOCAL POSTGRES TEST -> compatibility bootstrap permitted', async () => {
      process.env.NODE_ENV = 'test';
      const client = await pool.connect();
      try {
        const { setupLocalPostgresTestCompatibility } = await import('../db/migrations');
        await expect(setupLocalPostgresTestCompatibility(client)).resolves.not.toThrow();
      } finally {
        client.release();
      }
    });

    it('PRODUCTION -> compatibility bootstrap blocked', async () => {
      process.env.NODE_ENV = 'production';
      const client = await pool.connect();
      try {
        const { setupLocalPostgresTestCompatibility } = await import('../db/migrations');
        await expect(setupLocalPostgresTestCompatibility(client)).rejects.toThrow('strictly prohibited');
      } finally {
        process.env.NODE_ENV = 'test'; // restore
        client.release();
      }
    });

    it('SUPABASE-LIKE ENVIRONMENT -> existing auth objects preserved', async () => {
      process.env.NODE_ENV = 'test';
      const client = await pool.connect();
      try {
        // Drop auth schema first if it exists to test cleanly
        try {
          await client.query('DROP SCHEMA IF EXISTS auth CASCADE;');
        } catch (e) {}

        // Ensure auth schema and auth.uid exist beforehand
        await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
        await client.query(`
          CREATE OR REPLACE FUNCTION auth.uid() 
          RETURNS uuid LANGUAGE sql STABLE AS $$ 
            SELECT '11111111-1111-1111-1111-111111111111'::uuid; 
          $$;
        `);

        const { setupLocalPostgresTestCompatibility } = await import('../db/migrations');
        await setupLocalPostgresTestCompatibility(client);

        // Verify function was NOT overwritten (remains returning '1111...')
        const res = await client.query("SELECT auth.uid() as uid");
        expect(res.rows[0].uid).toBe('11111111-1111-1111-1111-111111111111');
      } finally {
        client.release();
      }
    });

    describe('Database Pool Initialization & Fail Fast guards (Sprint 2.5)', () => {
      it('should select DATABASE_URL_TEST exclusively in test environment when both are set', async () => {
        const { initializeDB, resetPool } = await import('../db/db');
        const originalEnv = process.env.NODE_ENV;
        const originalTestUrl = process.env.DATABASE_URL_TEST;
        const originalUrl = process.env.DATABASE_URL;

        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL_TEST = 'postgresql://test_user:test_pwd@localhost:5432/my_test_invalid';
        process.env.DATABASE_URL = 'postgresql://prod_user:prod_pwd@localhost:5432/my_prod';

        resetPool();
        try {
          // It should throw because my_test_invalid does not end with _test
          expect(() => initializeDB()).toThrow(/my_test_invalid/);
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.DATABASE_URL_TEST = originalTestUrl;
          process.env.DATABASE_URL = originalUrl;
          resetPool();
        }
      });

      it('should block connection and throw if DATABASE_URL_TEST is missing when DATABASE_URL is configured in test mode', async () => {
        const { initializeDB, resetPool } = await import('../db/db');
        const originalEnv = process.env.NODE_ENV;
        const originalTestUrl = process.env.DATABASE_URL_TEST;
        const originalUrl = process.env.DATABASE_URL;

        process.env.NODE_ENV = 'test';
        delete process.env.DATABASE_URL_TEST;
        process.env.DATABASE_URL = 'postgresql://prod_user:prod_pwd@localhost:5432/my_prod';

        resetPool();
        try {
          expect(() => initializeDB()).toThrow('DATABASE_URL_TEST is required');
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.DATABASE_URL_TEST = originalTestUrl;
          process.env.DATABASE_URL = originalUrl;
          resetPool();
        }
      });

      it('should throw if DATABASE_URL_TEST is missing password', async () => {
        const { initializeDB, resetPool } = await import('../db/db');
        const originalEnv = process.env.NODE_ENV;
        const originalTestUrl = process.env.DATABASE_URL_TEST;

        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL_TEST = 'postgresql://postgres@localhost:5432/norqva_test';

        resetPool();
        try {
          expect(() => initializeDB()).toThrow('password is missing');
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.DATABASE_URL_TEST = originalTestUrl;
          resetPool();
        }
      });

      it('should throw if DATABASE_URL_TEST name does not end with _test in test mode', async () => {
        const { initializeDB, resetPool } = await import('../db/db');
        const originalEnv = process.env.NODE_ENV;
        const originalTestUrl = process.env.DATABASE_URL_TEST;

        process.env.NODE_ENV = 'test';
        process.env.DATABASE_URL_TEST = 'postgresql://postgres:pwd@localhost:5432/norqva_dev';

        resetPool();
        try {
          expect(() => initializeDB()).toThrow(/must end with '_test'/);
        } finally {
          process.env.NODE_ENV = originalEnv;
          process.env.DATABASE_URL_TEST = originalTestUrl;
          resetPool();
        }
      });
    });
  });

});
