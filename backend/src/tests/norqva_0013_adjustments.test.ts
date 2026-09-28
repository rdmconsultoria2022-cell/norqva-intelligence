import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AdjustmentService } from '../services/creative/adjustmentService';
import { setAdjustmentServiceForTesting } from '../controllers/creativeFactoryController';

// NORQVA-0013: "Pedir ajuste" → task → Claude routine → new DRAFT version.
describe('NORQVA-0013 — dynamic adjustments', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeId: string;
  const AUTOMATION = 'test-automation-token-0013-abcdefghijklmnop';
  const ENV = ['CLAUDE_ROUTINE_FIRE_URL', 'CLAUDE_ROUTINE_TOKEN', 'NORQVA_AUTOMATION_TOKEN'] as const;
  const backup: Record<string, string | undefined> = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'admin.norqva0013@norqva.test', 'Admin 0013', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });
    const productId = crypto.randomUUID();
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, is_demo) VALUES ($1, $2, 'P13', 'X', 'f', TRUE)`, [
      productId,
      `PRD-0013-${productId.slice(0, 6)}`
    ]);
    const key = `ADJ-0013-${productId.slice(0, 6)}-DEMO`;
    const c = await pool.query(
      `INSERT INTO creatives (human_id, product_id, hook, concept, copy, cta, format, status, is_demo, batch_code, utm_content_key,
                              primary_text, headline, file_url, approval_status, version, content_hash)
       VALUES ($1, $2, 'Gancho', 'c', 'Texto', 'Saiba mais', 'VIDEO', 'IDEIA', TRUE, 'BB-B01', $1, 'Texto', 'Título',
               'https://cdn.test/v1.mp4', 'APPROVED', 1, 'hash-v1') RETURNING id`,
      [key, productId]
    );
    creativeId = c.rows[0].id;
  });

  afterEach(() => {
    for (const k of ENV) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
    setAdjustmentServiceForTesting(null);
  });

  it('asking for an adjustment creates a task (demo is never sent to Claude)', async () => {
    const r = await request(app)
      .post(`/api/creative-factory/creatives/${creativeId}/review?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'REVISION_REQUESTED', reason_code: 'OTHER', notes: 'Adicionar música de fundo' });
    expect(r.status).toBe(200);
    expect(r.body.adjustment).toMatchObject({ status: 'NOT_CONFIGURED', request_text: '[OTHER] Adicionar música de fundo' });

    const list = await request(app).get('/api/creative-factory/adjustments?mode=demo').set('Authorization', `Bearer ${adminToken}`);
    expect(list.body.adjustments.some((a: any) => a.creative_id === creativeId)).toBe(true);
  });

  it('dispatch fires the routine with the task text and stores the session URL', async () => {
    process.env.CLAUDE_ROUTINE_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_test0013/fire';
    process.env.CLAUDE_ROUTINE_TOKEN = 'x';
    const firer = vi.fn().mockResolvedValue({ ok: true, sessionUrl: 'https://claude.ai/code/session_x' });
    const svc = new AdjustmentService(firer);
    const adj = await svc.create(pool, { creativeId, reviewId: null, requestText: 'Adicionar música', userId: null, isDemo: false });
    expect(adj.status).toBe('DISPATCHED');
    expect(adj.session_url).toBe('https://claude.ai/code/session_x');
    expect(firer.mock.calls[0][0]).toContain(`adjustment_id: ${adj.id}`);
    expect(firer.mock.calls[0][0]).toContain('request: Adicionar música');

    const failing = new AdjustmentService(vi.fn().mockResolvedValue({ ok: false, error: 'HTTP 401' }));
    const bad = await failing.create(pool, { creativeId, reviewId: null, requestText: 'x', userId: null, isDemo: false });
    expect(bad.status).toBe('FAILED');
    expect(bad.response).toContain('HTTP 401');
  });

  it('automation API: token required; the routine reports progress and delivers a new DRAFT version', async () => {
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    const svc = new AdjustmentService(vi.fn());
    const adj = await pool.query(
      `INSERT INTO creative_adjustments (creative_id, request_text, status, is_demo) VALUES ($1, 'Adicionar música', 'DISPATCHED', TRUE) RETURNING id`,
      [creativeId]
    );
    const id = adj.rows[0].id;

    const denied = await request(app).get(`/api/automation/adjustments/${id}`);
    expect(denied.status).toBe(401);
    const wrong = await request(app).get(`/api/automation/adjustments/${id}`).set('X-Norqva-Automation-Token', 'nope');
    expect(wrong.status).toBe(401);

    const task = await request(app).get(`/api/automation/adjustments/${id}`).set('X-Norqva-Automation-Token', AUTOMATION);
    expect(task.status).toBe(200);
    expect(task.body).toMatchObject({ request_text: 'Adicionar música', file_url: 'https://cdn.test/v1.mp4' });

    const prog = await request(app)
      .post(`/api/automation/adjustments/${id}/status`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ status: 'IN_PROGRESS', response: 'Compondo a trilha' });
    expect(prog.body.status).toBe('IN_PROGRESS');
    const notAllowed = await request(app)
      .post(`/api/automation/adjustments/${id}/status`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ status: 'DISPATCHED' });
    expect(notAllowed.status).toBe(400);

    const delivered = await request(app)
      .post(`/api/automation/adjustments/${id}/version`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ file_url: 'https://cdn.test/v2-com-musica.mp4', summary: 'Trilha original adicionada.' });
    expect(delivered.status).toBe(200);
    expect(delivered.body.new_version.human_id).toMatch(/-V2-DEMO$/);
    expect(delivered.body.new_version.approval_status).toBe('DRAFT');

    const after = await svc.get(pool, id, true);
    expect(after).toMatchObject({ status: 'DONE', response: 'Trilha original adicionada.' });
    expect(after.result_human_id).toMatch(/-V2-DEMO$/);
    const v2 = await pool.query('SELECT file_url FROM creatives WHERE id = $1', [after.result_creative_id]);
    expect(v2.rows[0].file_url).toBe('https://cdn.test/v2-com-musica.mp4');
  });
});
