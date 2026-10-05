import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

// H1.1 — diagnóstico temporário da cadeia de proxies (somente leitura, ADMIN).
describe('H1.1 — proxy chain diagnostics (temporary)', () => {
  let adminToken: string;
  let perfToken: string;

  beforeAll(async () => {
    const pool = initializeDB();
    await runMigrations(pool);
    const mk = async (role: string) => {
      const email = `h11.${role.toLowerCase()}.${crypto.randomUUID().slice(0, 6)}@norqva.test`;
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE') RETURNING auth_user_id`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email, role });
    };
    adminToken = await mk('ADMIN');
    perfToken = await mk('PERFORMANCE');
  });

  it('is ADMIN-only', async () => {
    expect((await request(app).get('/api/diagnostics/proxy-chain')).status).toBe(401);
    expect((await request(app).get('/api/diagnostics/proxy-chain').set('Authorization', `Bearer ${perfToken}`)).status).toBe(403);
  });

  it('returns only IPs and header names, never secrets, and computes req.ip per trust level', async () => {
    const r = await request(app)
      .get('/api/diagnostics/proxy-chain')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Forwarded-For', '203.0.113.7, 198.51.100.2, not-an-ip')
      .set('Cookie', 'sb=secret-cookie');
    expect(r.status).toBe(200);
    expect(r.body.x_forwarded_for).toEqual(['203.0.113.7', '198.51.100.2', '[não-IP]']);
    expect(r.body.x_forwarded_for_count).toBe(3);
    // [socket, not-an-ip, 198.51.100.2, 203.0.113.7]
    expect(r.body.req_ip_if_trust_proxy_n['2']).toBe('198.51.100.2');
    expect(r.body.req_ip_if_trust_proxy_n['3']).toBe('203.0.113.7');
    const flat = JSON.stringify(r.body);
    expect(flat).not.toContain(adminToken);
    expect(flat).not.toContain('secret-cookie');
    expect(r.body.proxy_header_names).toContain('x-forwarded-for');
  });
});
