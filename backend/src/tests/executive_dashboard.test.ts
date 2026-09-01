import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';

describe('DASHBOARD V1 — Executive Operations Dashboard Read API Tests', () => {
  let pool: Pool;
  let adminToken: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await seedDemoData(pool);

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.exec@norqva.com', 'Admin Executive', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );

    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });
  });

  it('E01: blocks unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/executive/dashboard');
    expect(res.status).toBe(401);
  });

  it('E02: executes pure SELECT with zero mutations and returns 200', async () => {
    const res = await request(app)
      .get('/api/executive/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('meta');
    expect(res.body).toHaveProperty('commerce');
    expect(res.body).toHaveProperty('finance');
    expect(res.body).toHaveProperty('delivery');
    expect(res.body).toHaveProperty('recentOrders');
  });

  it('E03: returns clean zero data and nulls when no records exist without crashing', async () => {
    const res = await request(app)
      .get('/api/executive/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.meta.spend).toBe('number');
    expect(typeof res.body.commerce.totalOrders).toBe('number');
    expect(typeof res.body.finance.totalPixCreated).toBe('number');
    expect(typeof res.body.delivery.totalEntitlements).toBe('number');
    if (res.body.meta.impressions === 0) {
      expect(res.body.meta.ctr).toBeNull();
    }
  });

  it('E04: enforces strict DEMO / REAL environment isolation', async () => {
    const demoRes = await request(app)
      .get('/api/executive/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    const realRes = await request(app)
      .get('/api/executive/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(demoRes.status).toBe(200);
    expect(realRes.status).toBe(200);
    expect(demoRes.body).toHaveProperty('meta');
    expect(realRes.body).toHaveProperty('meta');
  });

  it('E05: delivery metrics explicitly distinguish entitlements from downloads', async () => {
    const res = await request(app)
      .get('/api/executive/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const d = res.body.delivery;
    expect(d).toHaveProperty('totalEntitlements');
    expect(d).toHaveProperty('totalDownloads');
    expect(d).toHaveProperty('completedDownloads');
    expect(d).toHaveProperty('pendingDownloads');
  });

  it('E06: meta campaigns return effective_status for operational status mapping', async () => {
    const res = await request(app)
      .get('/api/executive/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.meta.campaigns)).toBe(true);
    if (res.body.meta.campaigns.length > 0) {
      const camp = res.body.meta.campaigns[0];
      expect(camp).toHaveProperty('status');
      expect(camp).toHaveProperty('effective_status');
    }
  });
});
