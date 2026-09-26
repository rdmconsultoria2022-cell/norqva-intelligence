import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { requireRole } from '../middleware/auth';
import * as tokenModule from '../utils/token';

describe('GATE 16.6G: Security Remediation & Authorization Matrix Suite', () => {
  let pool: Pool;
  let app: Express;

  const validAdminSub = crypto.randomUUID();
  const validIntelligenceSub = crypto.randomUUID();
  const inactiveUserSub = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);

    app = express();
    app.use(express.json());

    // Protected Test Routes
    app.get('/api/test/admin-only', requireRole(['ADMIN']), (_req: Request, res: Response) => {
      res.status(200).json({ status: 'admin_ok' });
    });

    app.get('/api/test/intelligence', requireRole(['ADMIN', 'INTELLIGENCE']), (_req: Request, res: Response) => {
      res.status(200).json({ status: 'intelligence_ok' });
    });

    app.post('/api/intelligence/demographics/sync', requireRole(['ADMIN']), (_req: Request, res: Response) => {
      res.status(200).json({ status: 'sync_ok' });
    });
  });

  beforeEach(async () => {
    // Reset users table
    await pool.query('DELETE FROM users');

    // 1. Provision ACTIVE ADMIN user
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Official Admin', 'admin.official@norqva.com', 'ADMIN', 'ACTIVE', false)`,
      [crypto.randomUUID(), validAdminSub]
    );

    // 2. Provision ACTIVE INTELLIGENCE user
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Intelligence Operator', 'intel@norqva.com', 'INTELLIGENCE', 'ACTIVE', false)`,
      [crypto.randomUUID(), validIntelligenceSub]
    );

    // 3. Provision INACTIVE user
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Inactive Staff', 'inactive@norqva.com', 'INTELLIGENCE', 'INACTIVE', false)`,
      [crypto.randomUUID(), inactiveUserSub]
    );

    // Default: set AUTH_MODE to real to enforce strict Supabase JWT verification
    process.env.AUTH_MODE = 'real';
    process.env.NODE_ENV = 'production';
  });

  it('1. JWT valido + usuario existente ACTIVE -> permitido conforme RBAC', async () => {
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: validAdminSub,
      email: 'admin.official@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer valid_admin_jwt');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('admin_ok');
  });

  it('2. JWT valido + usuario inexistente na tabela users -> 403 Forbidden', async () => {
    const unknownSub = crypto.randomUUID();
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: unknownSub,
      email: 'stranger@external.com'
    });

    const res = await request(app)
      .get('/api/test/intelligence')
      .set('Authorization', 'Bearer valid_jwt_unknown_user');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User profile does not exist in NORQVA.');

    // Verify ZERO users were created in the database
    const checkDb = await pool.query('SELECT * FROM users WHERE email = $1', ['stranger@external.com']);
    expect(checkDb.rows.length).toBe(0);
  });

  it('3. JWT valido + usuario INACTIVE -> 403 Forbidden', async () => {
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: inactiveUserSub,
      email: 'inactive@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/intelligence')
      .set('Authorization', 'Bearer valid_jwt_inactive_user');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User account is inactive.');
  });

  it('4. JWT valido + usuario com role sem permissao -> 403 Forbidden', async () => {
    const creativeSub = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'Creative User', 'creative@norqva.com', 'CREATIVE', 'ACTIVE', false)`,
      [crypto.randomUUID(), creativeSub]
    );

    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: creativeSub,
      email: 'creative@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer valid_jwt_creative_user');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden: Role 'CREATIVE' has insufficient privileges.");
  });

  it('5. JWT invalido -> 401 Unauthorized', async () => {
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer invalid_signature_token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Session expired or invalid token.');
  });

  it('6. JWT expirado -> 401 Unauthorized', async () => {
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/test/intelligence')
      .set('Authorization', 'Bearer expired_jwt_token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Session expired or invalid token.');
  });

  it('7. Ausencia de JWT -> 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/test/admin-only');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication token required.');
  });

  it('8. INTELLIGENCE tentando endpoint ADMIN -> 403 Forbidden', async () => {
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: validIntelligenceSub,
      email: 'intel@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer valid_intel_jwt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden: Role 'INTELLIGENCE' has insufficient privileges.");
  });

  it('9. SEC-02 Check: Usuario inexistente com email contendo "admin" -> 403 (Zero auto-provision e Zero privilege escalation)', async () => {
    const attackerSub = crypto.randomUUID();
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: attackerSub,
      email: 'fake_superadmin_hacker@evil.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer attacker_admin_jwt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User profile does not exist in NORQVA.');

    // Verify user was NOT inserted
    const dbCheck = await pool.query('SELECT * FROM users WHERE email = $1', ['fake_superadmin_hacker@evil.com']);
    expect(dbCheck.rows.length).toBe(0);
  });

  it('10. SEC-02 Check: Usuario inexistente com email contendo "qa_user" -> 403', async () => {
    const qaSub = crypto.randomUUID();
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: qaSub,
      email: 'qa_user_unregistered@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer qa_jwt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User profile does not exist in NORQVA.');

    const dbCheck = await pool.query('SELECT * FROM users WHERE email = $1', ['qa_user_unregistered@norqva.com']);
    expect(dbCheck.rows.length).toBe(0);
  });

  it('11. SEC-02 Check: Usuario inexistente com email contendo "rdmconsultoria" -> 403', async () => {
    const rdmSub = crypto.randomUUID();
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: rdmSub,
      email: 'rdmconsultoria_impostor@gmail.com'
    });

    const res = await request(app)
      .get('/api/test/admin-only')
      .set('Authorization', 'Bearer rdm_jwt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User profile does not exist in NORQVA.');

    const dbCheck = await pool.query('SELECT * FROM users WHERE email = $1', ['rdmconsultoria_impostor@gmail.com']);
    expect(dbCheck.rows.length).toBe(0);
  });

  it('12. Usuario deletado + JWT ainda valido -> 403 (Nunca recriado automaticamente)', async () => {
    const deletedSub = crypto.randomUUID();
    // Pre-create and then delete
    const tempId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, $2, 'To Be Deleted', 'delete_me@norqva.com', 'INTELLIGENCE', 'ACTIVE', false)`,
      [tempId, deletedSub]
    );
    await pool.query('DELETE FROM users WHERE id = $1', [tempId]);

    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: deletedSub,
      email: 'delete_me@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/intelligence')
      .set('Authorization', 'Bearer deleted_user_jwt');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('User profile does not exist in NORQVA.');

    // Ensure it remains deleted
    const countCheck = await pool.query('SELECT * FROM users WHERE email = $1', ['delete_me@norqva.com']);
    expect(countCheck.rows.length).toBe(0);
  });

  it('13. Safe Email Fallback: Usuario PRE-PROVISIONADO ativo sem auth_user_id -> vincula auth_user_id com seguranca', async () => {
    const preProvisionedId = crypto.randomUUID();
    const newSubFromSupabase = crypto.randomUUID();

    // Admin created the user row beforehand without knowing Supabase Auth UID yet
    await pool.query(
      `INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
       VALUES ($1, NULL, 'Invited Manager', 'invited@norqva.com', 'INTELLIGENCE', 'ACTIVE', false)`,
      [preProvisionedId]
    );

    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: newSubFromSupabase,
      email: 'invited@norqva.com'
    });

    const res = await request(app)
      .get('/api/test/intelligence')
      .set('Authorization', 'Bearer invited_user_first_login');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('intelligence_ok');

    // Confirm that auth_user_id was linked cleanly to the pre-existing row
    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [preProvisionedId]);
    expect(updated.rows[0].auth_user_id).toBe(newSubFromSupabase);
    expect(updated.rows[0].role).toBe('INTELLIGENCE'); // Role untouched
    expect(updated.rows[0].status).toBe('ACTIVE');
  });

  it('14. POST /api/intelligence/demographics/sync -> ADMIN ONLY, 403 para INTELLIGENCE ou nao provisionado', async () => {
    // A) Intelligence operator trying to sync
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: validIntelligenceSub,
      email: 'intel@norqva.com'
    });

    const intelRes = await request(app)
      .post('/api/intelligence/demographics/sync')
      .set('Authorization', 'Bearer intel_jwt');

    expect(intelRes.status).toBe(403);

    // B) Admin syncing
    vi.spyOn(tokenModule, 'verifySupabaseToken').mockResolvedValueOnce({
      sub: validAdminSub,
      email: 'admin.official@norqva.com'
    });

    const adminRes = await request(app)
      .post('/api/intelligence/demographics/sync')
      .set('Authorization', 'Bearer admin_jwt');

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.status).toBe('sync_ok');
  });
});
