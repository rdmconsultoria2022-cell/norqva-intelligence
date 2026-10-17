// NORQVA-0092: gestão da Equipe (convite, editar, desativar, reativar e travas). Convite simulado: nunca fala com o Supabase.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setInviteSenderForTests, TeamService, TeamError } from '../services/team/teamService';

describe.sequential('NORQVA-0092 — gestão da Equipe', () => {
  let pool: Pool;
  let admin: string;
  let adminId: string;
  let perf: string;
  const tag = crypto.randomUUID().slice(0, 6).toLowerCase();
  const adminEmail = `admin.team0092.${tag}@norqva.test`;
  const perfEmail = `perf.team0092.${tag}@norqva.test`;
  const newEmail = `nova.team0092.${tag}@norqva.test`;
  const failEmail = `falha.team0092.${tag}@norqva.test`;
  const sent: string[] = [];
  let invitedId = '';

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: any) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0092', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING id, auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return { id: u.rows[0].id as string, token: signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role }) };
    };
    const a = await mk(adminEmail, 'ADMIN');
    admin = a.token;
    adminId = a.id;
    perf = (await mk(perfEmail, 'PERFORMANCE')).token;
    setInviteSenderForTests(async (email) => {
      if (email === failEmail) throw new TeamError(502, 'O Supabase recusou o convite.');
      sent.push(email);
      return { sent: true };
    });
  });

  afterAll(async () => {
    setInviteSenderForTests(null);
    if (!pool) return;
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[newEmail, failEmail]]).catch(() => {});
  });

  it('só administrador vê e mexe na equipe', async () => {
    expect((await as(perf).get('/api/team?mode=real')).status).toBe(403);
    expect((await as(perf).post('/api/team/invite?mode=real', { name: 'X', email: newEmail, role: 'CREATIVE' })).status).toBe(403);
    const r = await as(admin).get('/api/team?mode=real');
    expect(r.status).toBe(200);
    expect(r.body.users.some((u: any) => u.email === adminEmail && u.accepted === true)).toBe(true);
    expect(r.body.users[0]).not.toHaveProperty('auth_user_id');
  });

  it('convida: valida campos, grava, manda o convite e registra no histórico', async () => {
    expect((await as(admin).post('/api/team/invite?mode=real', { name: 'A', email: newEmail, role: 'CREATIVE' })).status).toBe(400);
    expect((await as(admin).post('/api/team/invite?mode=real', { name: 'Ana', email: 'sem-arroba', role: 'CREATIVE' })).status).toBe(400);
    expect((await as(admin).post('/api/team/invite?mode=real', { name: 'Ana', email: newEmail, role: 'DONO' })).status).toBe(400);

    const r = await as(admin).post('/api/team/invite?mode=real', { name: '  Ana   Souza ', email: newEmail.toUpperCase(), role: 'CREATIVE' });
    expect(r.status).toBe(201);
    expect(r.body.member).toMatchObject({ name: 'Ana Souza', email: newEmail, role: 'CREATIVE', status: 'ACTIVE', accepted: false });
    expect(sent).toContain(newEmail);
    invitedId = r.body.member.id;

    const log = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'TEAM_MEMBER_INVITED' AND new_value LIKE $1`, [`%${invitedId}%`]);
    expect(log.rows.length).toBe(1);

    expect((await as(admin).post('/api/team/invite?mode=real', { name: 'Ana', email: newEmail, role: 'CREATIVE' })).status).toBe(409);
  });

  it('convite que falha não deixa cadastro pendurado', async () => {
    const r = await as(admin).post('/api/team/invite?mode=real', { name: 'Falha', email: failEmail, role: 'PRODUCT' });
    expect(r.status).toBe(502);
    const left = await pool.query('SELECT 1 FROM users WHERE email = $1', [failEmail]);
    expect(left.rows.length).toBe(0);
  });

  it('reenvia convite só para quem ainda não aceitou', async () => {
    sent.length = 0;
    expect((await as(admin).post(`/api/team/${invitedId}/resend-invite?mode=real`)).status).toBe(200);
    expect(sent).toEqual([newEmail]);
    expect((await as(admin).post(`/api/team/${adminId}/resend-invite?mode=real`)).status).toBe(409);
  });

  it('edita nome e perfil e registra antes e depois', async () => {
    const r = await as(admin).patch(`/api/team/${invitedId}?mode=real`, { name: 'Ana S.', role: 'OPERATIONS' });
    expect(r.status).toBe(200);
    expect(r.body.member).toMatchObject({ name: 'Ana S.', role: 'OPERATIONS' });
    const log = await pool.query(`SELECT previous_value, new_value FROM audit_logs WHERE event_type = 'TEAM_MEMBER_UPDATED' AND new_value LIKE '%Ana S.%' ORDER BY created_at DESC LIMIT 1`);
    expect(log.rows[0].previous_value).toContain('CREATIVE');
  });

  it('desativa bloqueando o acesso e reativa, sem apagar', async () => {
    const d = await as(admin).post(`/api/team/${invitedId}/deactivate?mode=real`);
    expect(d.status).toBe(200);
    expect(d.body.member.status).toBe('INACTIVE');
    expect((await as(admin).post(`/api/team/${invitedId}/resend-invite?mode=real`)).status).toBe(409);
    const again = await as(admin).post('/api/team/invite?mode=real', { name: 'Ana', email: newEmail, role: 'CREATIVE' });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/Reativar/);

    const a = await as(admin).post(`/api/team/${invitedId}/reactivate?mode=real`);
    expect(a.status).toBe(200);
    expect(a.body.member.status).toBe('ACTIVE');
  });

  it('pessoa desativada perde o acesso na hora', async () => {
    const u = await pool.query(`SELECT id FROM users WHERE email = $1`, [perfEmail]);
    const perfId = u.rows[0].id;
    expect((await as(perf).get('/api/me?mode=real')).status).toBe(200);
    expect((await as(admin).post(`/api/team/${perfId}/deactivate?mode=real`)).status).toBe(200);
    expect((await as(perf).get('/api/me?mode=real')).status).toBe(403);
    expect((await as(admin).post(`/api/team/${perfId}/reactivate?mode=real`)).status).toBe(200);
    expect((await as(perf).get('/api/me?mode=real')).status).toBe(200);
  });

  it('ninguém desativa a si mesmo nem tira o próprio perfil de administrador', async () => {
    const d = await as(admin).post(`/api/team/${adminId}/deactivate?mode=real`);
    expect(d.status).toBe(409);
    const p = await as(admin).patch(`/api/team/${adminId}?mode=real`, { role: 'PERFORMANCE' });
    expect(p.status).toBe(409);
    const me = await pool.query('SELECT role, status FROM users WHERE id = $1', [adminId]);
    expect(me.rows[0]).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('nunca deixa a equipe sem administrador ativo', async () => {
    // banco simulado: o alvo é o único ADMIN ativo
    const target = crypto.randomUUID();
    const fake: any = {
      query: async (sql: string) => {
        if (/COUNT\(\*\)/.test(sql)) return { rows: [{ n: 0 }] };
        if (/FROM users WHERE id = \$1 AND is_demo = FALSE/.test(sql)) {
          return { rows: [{ id: target, name: 'Único', email: 'unico@norqva.test', role: 'ADMIN', status: 'ACTIVE', auth_user_id: 'x' }] };
        }
        throw new Error('não devia gravar nada');
      }
    };
    const svc = new TeamService(fake);
    const other = { id: crypto.randomUUID(), role: 'ADMIN' };
    await expect(svc.setActive(other, target, false)).rejects.toMatchObject({ status: 409 });
    await expect(svc.update(other, target, { role: 'PRODUCT' })).rejects.toMatchObject({ status: 409 });
  });
});
