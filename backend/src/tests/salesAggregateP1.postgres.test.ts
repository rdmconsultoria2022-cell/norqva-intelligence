/**
 * P1 PostgreSQL integration: real SQL, rollback-only fixtures, no production data.
 * CI supplies DATABASE_URL_TEST and PostgreSQL 16.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { aggregateSales, SalesAggregateOptions } from '../services/salesAggregateService';
import crypto from 'crypto';

describe.sequential('P1 — full-history financial aggregates (PostgreSQL)', () => {
  let pool: Pool;
  let db: PoolClient;
  const uid = crypto.randomUUID().slice(0, 8);
  const base = new Date('2026-10-10T12:00:00Z');
  const opts = (filter: SalesAggregateOptions['filter'] = 'ALL', extra: Partial<SalesAggregateOptions> = {}): SalesAggregateOptions =>
    ({isDemo:false,includeTests:false,filter,startIso:'2026-10-10T00:00:00Z',endIso:'2026-10-11T00:00:00Z',...extra});
  const amount = 19.90;
  const q = (sql: string, args: unknown[] = []) => db.query(sql,args);
  const agg = (o: SalesAggregateOptions) => aggregateSales({query: (s: string, p: unknown[]) => q(s,p)} as any,o);

  async function internal(n: number, status: 'PAID'|'PENDING'|'REFUNDED' = 'PAID', provenance = 'COMMERCIAL_PRODUCTION', demo = false) {
    const email = `p1-${uid}-${crypto.randomUUID()}@example.invalid`;
    const c = await q("INSERT INTO customers (name,email,is_demo) VALUES ('P1 Fixture',$1,$2) RETURNING id",[email,demo]);
    const o = await q(`INSERT INTO orders (customer_id,total_amount,status,idempotency_key,is_demo,data_provenance,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[c.rows[0].id,amount,status,crypto.randomUUID(),demo,provenance,base]);
    return o.rows[0].id as string;
  }
  async function external(n: number, status: 'PAID'|'REFUNDED'|'CHARGEBACK' = 'PAID', provenance = 'COMMERCIAL_PRODUCTION', demo = false) {
    await q(`INSERT INTO external_sales (source,external_order_id,status,gross_amount,is_demo,data_provenance,approved_at)
      VALUES ('KIWIFY',$1,$2,$3,$4,$5,$6)`,[`P1-${uid}-${n}-${crypto.randomUUID()}`,status,amount,demo,provenance,base]);
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_TEST || !process.env.ALLOW_DESTRUCTIVE_TESTS) throw new Error('P1 requires isolated DATABASE_URL_TEST');
    pool = initializeDB();
    await runMigrations(pool);
    db = await pool.connect();
    await db.query('BEGIN');
    // Transaction-local fixture marker; all inserted records roll back.
  });
  afterAll(async () => { if(db) {await db.query('ROLLBACK');db.release();} });

  it('1001 internal PAID: no 500-row cap, and date/status filters', async () => {
    for(let i=0;i<1001;i++) await internal(i);
    expect(await agg(opts())).toEqual({total:1001,paid:1001,pending:0,problem:0,revenue:19919.9});
    expect((await agg(opts('PAID'))).paid).toBe(1001);
    expect((await agg(opts('PENDING'))).total).toBe(0);
    expect((await agg(opts('ALL',{startIso:'2026-10-12T00:00:00Z',endIso:'2026-10-13T00:00:00Z'}))).total).toBe(0);
  });

  it('600 internal + 600 external, with paid, pending, refunded and chargeback statuses', async () => {
    // Prior test fixture remains within transaction: compare deltas, not absolute totals.
    const before = await agg(opts());
    for(let i=0;i<600;i++) await internal(i+2000);
    for(let i=0;i<600;i++) await external(i+2000);
    const after = await agg(opts());
    expect(after.total-before.total).toBe(1200);
    expect(after.paid-before.paid).toBe(1200);
    expect(Number((after.revenue-before.revenue).toFixed(2))).toBe(23880);
    await internal(3000,'PENDING');
    await internal(3001,'REFUNDED');
    await external(3000,'REFUNDED');
    await external(3001,'CHARGEBACK');
    const statuses = await agg(opts());
    expect(statuses.total-after.total).toBe(4);
    expect(statuses.paid-after.paid).toBe(0);
    expect(statuses.pending-after.pending).toBe(1);
    expect(statuses.revenue).toBe(after.revenue);
    expect((await agg(opts('PENDING'))).total).toBe(1);
  });

  it('DEMO/QA provenance and include_tests isolation', async () => {
    const before = await agg(opts());
    await internal(4000,'PAID','QA_FIXTURE');
    await internal(4001,'PAID','DEMO_SEED',true);
    await external(4000,'PAID','STAGING_SANDBOX_QA');
    const after = await agg(opts());
    expect(after).toEqual(before);
    expect((await agg(opts('ALL',{isDemo:true}))).total).toBe(2);
    expect((await agg(opts('ALL',{includeTests:true}))).total).toBe(before.total+2);
  });

  it('multiple payments, deliveries and email status do not inflate counts; PROBLEM respects FAILED', async () => {
    const before = await agg(opts());
    const id = await internal(5000);
    const addPayment = async (confirmed: boolean) => q(`INSERT INTO payments
      (human_id,order_id,provider,status,amount,idempotency_key,is_demo,external_reference,confirmed_at)
      VALUES ($1,$2,'ASAAS',$3,$4,$5,FALSE,$6,$7)`,[
      `P1-${crypto.randomUUID()}`,id,confirmed?'CONFIRMED':'PENDING',amount,crypto.randomUUID(),crypto.randomUUID(),
      confirmed?new Date('2026-10-10T10:00:00Z'):null]);
    await addPayment(true);
    await addPayment(false);
    await q("INSERT INTO order_access_emails (order_id,status) VALUES ($1,'FAILED')",[id]);
    const after = await agg(opts());
    expect(after.total-before.total).toBe(1);
    expect(Number((after.revenue-before.revenue).toFixed(2))).toBe(amount);
    expect(after.problem-before.problem).toBe(1);
    expect((await agg(opts('PROBLEM'))).total).toBeGreaterThanOrEqual(1);
    await q("UPDATE order_access_emails SET status='SENT' WHERE order_id=$1",[id]);
    const repaired = await agg(opts());
    expect(repaired.problem).toBe(after.problem-1);
    expect(repaired.total).toBe(after.total);
  });
});
