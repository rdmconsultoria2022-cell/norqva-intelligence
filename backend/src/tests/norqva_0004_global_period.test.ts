import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { resolvePeriodFilter } from '../utils/commercialTimezone';

// NORQVA-0004: one global period (?period=today|yesterday|7d|30d|90d|all|custom) for every screen.
describe('NORQVA-0004 — global period is honoured by every dated endpoint', () => {
  let pool: Pool;
  let adminToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.norqva0004@norqva.test', 'Admin 0004', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING auth_user_id, email`,
      [adminAuthId]
    );
    adminToken = signSupabaseToken({ sub: adminRes.rows[0].auth_user_id, email: adminRes.rows[0].email, role: 'ADMIN' });
  });

  const get = (url: string) => request(app).get(url).set('Authorization', `Bearer ${adminToken}`);

  it('resolvePeriodFilter: all/missing means no filter; other presets return a window', () => {
    expect(resolvePeriodFilter(undefined)).toBeNull();
    expect(resolvePeriodFilter('all')).toBeNull();
    const d7 = resolvePeriodFilter('7d')!;
    expect(d7.metaStart <= d7.metaStop).toBe(true);
    const custom = resolvePeriodFilter('custom', '2026-09-01', '2026-09-10')!;
    expect(custom.metaStart).toBe('2026-09-01');
    expect(custom.metaStop).toBe('2026-09-10');
  });

  it('executive dashboard: old spend counts in "all" but not in "30d"; default stays "all"', async () => {
    const spend = async (qs: string) => {
      const r = await get(`/api/executive/dashboard?mode=demo${qs}`);
      expect(r.status).toBe(200);
      return Number(r.body.meta.spend);
    };
    const allBefore = await spend('&period=all');
    const d30Before = await spend('&period=30d');
    const defaultBefore = await spend('');

    const accountId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, name, is_demo) VALUES ($1, $2, 'NORQVA-0004 fixture', TRUE)`,
      [accountId, `act_norqva0004_${Date.now()}`]
    );
    await pool.query(
      `INSERT INTO meta_insights (ad_account_id, entity_level, entity_meta_id, date_start, date_stop, spend, impressions, clicks, is_demo)
       VALUES ($1, 'ACCOUNT', 'acc_0004', '2020-01-01', '2020-01-01', 50, 100, 1, TRUE)`,
      [accountId]
    );

    expect(Math.round(((await spend('&period=all')) - allBefore) * 100) / 100).toBe(50);
    expect(Math.round(((await spend('')) - defaultBefore) * 100) / 100).toBe(50);
    expect(Math.round(((await spend('&period=30d')) - d30Before) * 100) / 100).toBe(0);
    expect(
      Math.round(((await spend('&period=custom&startDate=2020-01-01&endDate=2020-01-31'))) * 100) / 100
    ).toBeGreaterThanOrEqual(50);

    const r = await get('/api/executive/dashboard?mode=demo&period=7d');
    expect(r.body.period.period).toBe('7d');

    const ins = await get('/api/meta/insights?mode=demo&period=7d');
    expect(ins.status).toBe(200);
    expect(ins.body.some((row: any) => row.entity_meta_id === 'acc_0004')).toBe(false);
    const insAll = await get('/api/meta/insights?mode=demo&period=all');
    expect(insAll.body.some((row: any) => row.entity_meta_id === 'acc_0004')).toBe(true);

    await pool.query('DELETE FROM meta_insights WHERE ad_account_id = $1', [accountId]);
    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [accountId]);
  });

  it('demographics and creative performance accept the global period values', async () => {
    const demo = await get('/api/intelligence/demographics?mode=demo&period=all');
    expect(demo.status).toBe(200);
    expect(demo.body.time_window.start_date).toBe('2000-01-01');

    const creative = await get('/api/intelligence/creative-performance?mode=demo&period=7d');
    expect(creative.status).toBe(200);
  });
});
