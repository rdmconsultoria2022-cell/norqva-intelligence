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
});
