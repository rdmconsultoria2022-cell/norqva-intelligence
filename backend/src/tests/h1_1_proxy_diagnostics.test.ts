import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

// H1.1 — o diagnóstico temporário da cadeia de proxies foi removido após a certificação (TRUST_PROXY=2).
describe('H1.1 — proxy chain diagnostics removed', () => {
  let adminToken: string;

  beforeAll(async () => {
    const pool = initializeDB();
    await runMigrations(pool);
    const email = `h11.admin.${crypto.randomUUID().slice(0, 6)}@norqva.test`;
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, 'ADMIN', 'ACTIVE') RETURNING auth_user_id`,
      [email]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email, role: 'ADMIN' });
  });

  it('the temporary endpoint no longer exists, even for ADMIN', async () => {
    const res = await request(app).get('/api/diagnostics/proxy-chain').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(200);
    expect(JSON.stringify(res.body || {})).not.toContain('req_ip_if_trust_proxy_n');
  });
});
