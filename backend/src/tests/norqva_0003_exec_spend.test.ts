import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

// NORQVA-0003: the executive dashboard summed every meta_insights row. The Meta sync stores
// the same spend at ACCOUNT, CAMPAIGN, ADSET and AD level (and may store period aggregates),
// which multiplied the displayed media investment. Only daily ACCOUNT rows may be summed.
describe('NORQVA-0003 — Executive dashboard media spend is not multiplied across levels', () => {
  let pool: Pool;
  let adminToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.norqva0003@norqva.test', 'Admin 0003', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING auth_user_id, email`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });
  });

  async function demoSpend(): Promise<number> {
    const res = await request(app)
      .get('/api/executive/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    return Number(res.body.meta.spend);
  }

  it('counts R$ 100 of spend once even when it is stored at all four levels plus a period aggregate', async () => {
    const before = await demoSpend();

    const accountId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, name, is_demo)
       VALUES ($1, $2, 'NORQVA-0003 fixture', TRUE)`,
      [accountId, `act_norqva0003_${Date.now()}`]
    );

    const day = '2026-09-01';
    const rows: Array<[string, string, string, string, number]> = [
      ['ACCOUNT', 'acc_0003', day, day, 100],
      ['CAMPAIGN', 'cmp_0003', day, day, 100],
      ['ADSET', 'ads_0003', day, day, 100],
      ['AD', 'ad_0003', day, day, 100],
      // Period aggregate row (date_start != date_stop) must not be added to daily rows
      ['ACCOUNT', 'acc_0003', '2026-08-31', '2026-09-01', 180]
    ];
    for (const [level, metaId, start, stop, spend] of rows) {
      await pool.query(
        `INSERT INTO meta_insights (ad_account_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, 1000, 10, TRUE)`,
        [accountId, level, metaId, start, stop, spend]
      );
    }

    const after = await demoSpend();
    expect(Math.round((after - before) * 100) / 100).toBe(100);

    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [accountId]);
  });

  // NORQVA-0003b: production has no ACCOUNT-level rows (the sync stores CAMPAIGN/ADSET/AD).
  // The first fix only read ACCOUNT rows and showed R$ 0. The executive screen must match the
  // financial dashboard, which falls back to CAMPAIGN level.
  it('real mode: falls back to CAMPAIGN level and matches the financial dashboard total', async () => {
    const connRes = await pool.query(
      `INSERT INTO meta_connections (is_demo, status) VALUES (FALSE, 'CONNECTED')
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED'
       RETURNING id`
    );
    const connectionId = connRes.rows[0].id;
    const accountId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, name, is_demo, connection_id)
       VALUES ($1, $2, 'NORQVA-0003b real fixture', FALSE, $3)`,
      [accountId, `act_norqva0003b_${Date.now()}`, connectionId]
    );

    const realAccountRows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM meta_insights WHERE is_demo = FALSE AND entity_level = 'ACCOUNT'`
    );

    const execSpend = async () => {
      const r = await request(app).get('/api/executive/dashboard?mode=real').set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      return Number(r.body.meta.spend);
    };
    const finSpend = async () => {
      const r = await request(app).get('/api/financial/dashboard?mode=real&period=all').set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      return Number(r.body.summary.totalSpend);
    };

    const before = await execSpend();
    const day = '2026-09-02';
    for (const [level, metaId] of [['CAMPAIGN', 'cmp_0003b'], ['ADSET', 'ads_0003b'], ['AD', 'ad_0003b']]) {
      await pool.query(
        `INSERT INTO meta_insights (ad_account_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo, data_provenance)
         VALUES ($1, $2, $3, $4, $4, 100, 1000, 10, FALSE, 'COMMERCIAL_PRODUCTION')`,
        [accountId, level, metaId, day]
      );
    }

    const after = await execSpend();
    expect(after).toBe(await finSpend());
    if (realAccountRows.rows[0].n === 0) {
      expect(Math.round((after - before) * 100) / 100).toBe(100);
    }

    await pool.query('DELETE FROM meta_insights WHERE ad_account_id = $1', [accountId]);
    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [accountId]);
  });
});
