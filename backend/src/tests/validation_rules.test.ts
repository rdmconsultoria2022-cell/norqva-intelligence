import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';

let pool: Pool;

async function resetTestDb() {
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
}

beforeAll(async () => {
  pool = initializeDB();
  
  // Set required variables for test environment
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
  
  // Safety checks
  verifyTestDbSafety();

  await resetTestDb();
});

afterAll(async () => {
  await pool.end();
});

describe('NORQVA Core Business Logic Validation', () => {
  
  it('should compute ROAS and handle calculations correctly', async () => {
    const res = await request(app)
      .get('/api/dashboard?mode=demo&filter=7_DIAS')
      .set('x-user-role', 'ADMIN');
    
    if (res.status !== 200) {
      console.error('ROAS Calculation failed with body:', res.body);
    }
    expect(res.status).toBe(200);
    expect(res.body.metrics.investment).toBe(1221);
    expect(res.body.metrics.receita).toBe(55920);
    expect(res.body.metrics.roas).toBe(45.8);
    expect(res.body.metrics.contributionMargin).toBe(47928);
  });

  it('should prevent Division by Zero, showing "Dados insuficientes" instead of Infinity/NaN', async () => {
    const client = await pool.connect();
    try {
      const expRes = await client.query("SELECT id FROM experiments LIMIT 1");
      const expId = expRes.rows[0].id;
      
      const zeroSalesCac = 100 / 0;
      const isInfinity = !isFinite(zeroSalesCac);
      expect(isInfinity).toBe(true);

      await client.query("DELETE FROM performance_entries");
      await client.query(
        `INSERT INTO performance_entries (id, experiment_id, date, source, investment, vendas, is_demo)
         VALUES ($1, $2, CURRENT_DATE, 'MANUAL', 100.00, 0, TRUE)`,
        [crypto.randomUUID(), expId]
      );
      
      const res = await request(app)
        .get('/api/dashboard?mode=demo&filter=HOJE')
        .set('x-user-role', 'ADMIN');
      
      if (res.status !== 200) {
        console.error('Zero division failed with body:', res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.metrics.cac).toBe('Dados insuficientes');
    } finally {
      client.release();
    }
  });

  it('should block CREATIVE user from authorizing/increasing Capital at Risk', async () => {
    const expRes = await pool.query("SELECT id FROM experiments LIMIT 1");
    const expId = expRes.rows[0].id;

    const res = await request(app)
      .post(`/api/experiments/${expId}/capital`)
      .set('x-user-role', 'CREATIVE')
      .send({
        amount: 500.00,
        justification: 'Increasing budget from creative (should fail).'
      });
    
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('insufficient privileges');
  });

  it('should prevent changing Product status to PRONTO or ATIVO if origin/provenance information is missing', async () => {
    const prdUuid = crypto.randomUUID();
    const humanId = 'PRD-TST001';
    
    const insertRes = await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, estimated_cost, is_demo)
       VALUES ($1, $2, 'Test Product', 'Test', 'Testing provenance validation', 'PLANEJADO', 100.00, TRUE)
       RETURNING id`,
      [prdUuid, humanId]
    );
    const prdId = insertRes.rows[0].id;

    const badTransitionRes = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({ status: 'ATIVO' });
    
    // Status transition machine validation returns 409 Conflict
    expect(badTransitionRes.status).toBe(409);
    expect(badTransitionRes.body.error).toContain('Transição de status inválida');

    const toProntoRes = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({ status: 'PRONTO' });
    
    expect(toProntoRes.status).toBe(409);
    expect(toProntoRes.body.error).toContain('Transição de status inválida');

    const toDevRes = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({ status: 'EM_DESENVOLVIMENTO' });
    expect(toDevRes.status).toBe(200);

    const toRevRes = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({ status: 'REVISAO' });
    expect(toRevRes.status).toBe(200);

    const toProntoNoProv = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({ status: 'PRONTO' });
    expect(toProntoNoProv.status).toBe(409);
    expect(toProntoNoProv.body.error).toContain('procedência');

    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    const userId = userRes.rows[0].id;
    const toProntoSuccess = await request(app)
      .put(`/api/products/${prdId}?mode=demo`)
      .set('x-user-role', 'PRODUCT')
      .send({
        status: 'PRONTO',
        origin_provenance: 'ORIGINAL',
        origin_responsible_id: userId,
        origin_evidence: 'Audited internal source code repo #1'
      });
    expect(toProntoSuccess.status).toBe(200);
  });

  it('should enforce Capital at Risk limit on performance entries in database transactions', async () => {
    const prdRes = await pool.query("SELECT id FROM products LIMIT 1");
    const prdId = prdRes.rows[0].id;
    const offRes = await pool.query("SELECT id FROM offers LIMIT 1");
    const offId = offRes.rows[0].id;
    
    const expUuid = crypto.randomUUID();

    const expRes = await pool.query(
      `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
       VALUES ($1, 'EXP-TST001', 'Test Capital', 'Hypo', $2, $3, CURRENT_TIMESTAMP, 'AUTORIZADO', 300, 300, 0, TRUE)
       RETURNING id`,
      [expUuid, prdId, offId]
    );
    const expId = expRes.rows[0].id;
    
    const initialEntry = await request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('x-user-role', 'PERFORMANCE')
      .send({
        date: '2026-08-20',
        source: 'MANUAL',
        investment: 250.00
      });
    
    if (initialEntry.status !== 200) {
      console.error('Initial performance entry failed with body:', initialEntry.body);
    }
    expect(initialEntry.status).toBe(200);

    const exceedEntry = await request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('x-user-role', 'PERFORMANCE')
      .send({
        date: '2026-08-21',
        source: 'MANUAL',
        investment: 51.00
      });
    expect(exceedEntry.status).toBe(409);
    expect(exceedEntry.body.error).toContain('limite de Capital at Risk');

    const exactLimitEntry = await request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('x-user-role', 'PERFORMANCE')
      .send({
        date: '2026-08-22',
        source: 'MANUAL',
        investment: 50.00
      });
    
    if (exactLimitEntry.status !== 200) {
      console.error('Exact limit performance entry failed with body:', exactLimitEntry.body);
    }
    expect(exactLimitEntry.status).toBe(200);
  });

  it('should lock experiment row during transaction preventing race conditions on capital limit', async () => {
    const prdRes = await pool.query("SELECT id FROM products LIMIT 1");
    const prdId = prdRes.rows[0].id;
    const offRes = await pool.query("SELECT id FROM offers LIMIT 1");
    const offId = offRes.rows[0].id;
    
    const expUuid = crypto.randomUUID();

    const expRes = await pool.query(
      `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
       VALUES ($1, 'EXP-TST002', 'Test Lock', 'Hypo', $2, $3, CURRENT_TIMESTAMP, 'AUTORIZADO', 300, 300, 0, TRUE)
       RETURNING id`,
      [expUuid, prdId, offId]
    );
    const expId = expRes.rows[0].id;

    const req1 = request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('x-user-role', 'PERFORMANCE')
      .send({
        date: '2026-08-20',
        source: 'MANUAL',
        investment: 160.00
      });

    const req2 = request(app)
      .post(`/api/experiments/${expId}/performance?mode=demo`)
      .set('x-user-role', 'PERFORMANCE')
      .send({
        date: '2026-08-21',
        source: 'MANUAL',
        investment: 150.00
      });

    const results = await Promise.all([req1, req2]);
    const statuses = results.map(r => r.status);
    
    console.log('Concurrency test response bodies:', results.map(r => r.body));

    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const dbValRes = await pool.query("SELECT capital_used, capital_approved FROM experiments WHERE id = $1", [expId]);
    const finalUsed = parseFloat(dbValRes.rows[0].capital_used);
    expect(finalUsed).toBeLessThanOrEqual(300);
  });

  it('should clean DEMO data completely, while leaving REAL data intact', async () => {
    const realOppUuid = crypto.randomUUID();
    const realOppHumanId = 'OPP-REAL01';
    
    const realOppRes = await pool.query(
      `INSERT INTO opportunities (id, human_id, title, category, subcategory, description, target_audience, problem_desire, format, source, status, is_demo)
       VALUES ($1, $2, 'Real Business Opp', 'Sales', 'Target', 'Details', 'Audience', 'Problem', 'Format', 'Source', 'DESCOBERTA', FALSE)
       RETURNING id`,
      [realOppUuid, realOppHumanId]
    );
    const realOppId = realOppRes.rows[0].id;

    const beforeDemoCount = await pool.query("SELECT COUNT(*) FROM opportunities WHERE is_demo = TRUE");
    expect(parseInt(beforeDemoCount.rows[0].count, 10)).toBeGreaterThan(0);

    const cleanupRes = await request(app)
      .post('/api/config/clear-demo')
      .set('x-user-role', 'ADMIN');
    
    expect(cleanupRes.status).toBe(200);

    const afterDemoCount = await pool.query("SELECT COUNT(*) FROM opportunities WHERE is_demo = TRUE");
    expect(parseInt(afterDemoCount.rows[0].count, 10)).toBe(0);

    const afterRealCount = await pool.query("SELECT COUNT(*) FROM opportunities WHERE id = $1 AND is_demo = FALSE", [realOppId]);
    expect(parseInt(afterRealCount.rows[0].count, 10)).toBe(1);
  });

  it('should enforce state machine transitions on PUT /api/offers/:id', async () => {
    const prdUuid = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo)
       VALUES ($1, 'PRD-OFFTST01', 'Test Product for Offer', 'DIGITAL', 'Desc', 'PLANEJADO', TRUE)`,
      [prdUuid]
    );

    const offUuid = crypto.randomUUID();

    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFF-TST001', $2, 'Offer Transition Test', 19.90, 17.90, 'Desc', 'RASCUNHO', TRUE)`,
      [offUuid, prdUuid]
    );

    // Invalid transition: RASCUNHO -> PAUSADA (should fail 409)
    const invalidRes = await request(app)
      .put(`/api/offers/${offUuid}?mode=demo`)
      .set('x-user-role', 'ADMIN')
      .send({ status: 'PAUSADA' });
    expect(invalidRes.status).toBe(409);

    // Valid transition: RASCUNHO -> TESTE (should succeed 200)
    const validRes1 = await request(app)
      .put(`/api/offers/${offUuid}?mode=demo`)
      .set('x-user-role', 'ADMIN')
      .send({ status: 'TESTE' });
    expect(validRes1.status).toBe(200);
    expect(validRes1.body.offer.status).toBe('TESTE');

    // Valid transition: TESTE -> ATIVA (should succeed 200)
    const validRes2 = await request(app)
      .put(`/api/offers/${offUuid}?mode=demo`)
      .set('x-user-role', 'ADMIN')
      .send({ status: 'ATIVA' });
    expect(validRes2.status).toBe(200);
    expect(validRes2.body.offer.status).toBe('ATIVA');
  });

});
