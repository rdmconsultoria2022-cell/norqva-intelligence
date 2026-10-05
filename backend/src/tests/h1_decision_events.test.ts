import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setMetaControlClientFactoryForTesting } from '../controllers/metaControlController';
import {
  beginDecision,
  decisionContextFromRequest,
  DecisionAuditError,
  metaIdsOfPlan,
  purgeDecisionEventPii,
  redactSecrets,
  sanitizeForAudit
} from '../db/decisionEvents';

// H1 (NORQVA_DECISION_GOVERNANCE_HARDENING_PLAN): auditoria imutável de decisões.
describe('H1 — decision_events', () => {
  let pool: Pool;
  let adminId: string;
  let adminEmail: string;
  let adminToken: string;
  const SESSION_ID = crypto.randomUUID();
  const META_TOKEN = 'EAAB' + 'x'.repeat(60);

  const eventsByCorrelation = async (correlationId: string) =>
    (await pool.query('SELECT * FROM decision_events WHERE correlation_id = $1 ORDER BY created_at, phase', [correlationId])).rows;
  const latestFor = async (action: string, metaId: string) => {
    const r = await pool.query(`SELECT correlation_id, meta_ids FROM decision_events WHERE action = $1 ORDER BY created_at DESC LIMIT 50`, [action]);
    const hit = r.rows.find((x) => (typeof x.meta_ids === 'string' ? JSON.parse(x.meta_ids) : x.meta_ids || []).includes(metaId));
    return hit ? eventsByCorrelation(hit.correlation_id) : [];
  };
  const fakeClient = (impl: Partial<Record<'setEntityStatus' | 'setDailyBudget', (...a: any[]) => any>>) => {
    const c = {
      setEntityStatus: vi.fn(impl.setEntityStatus || (async () => ({ success: true }))),
      setDailyBudget: vi.fn(impl.setDailyBudget || (async () => ({ success: true })))
    };
    setMetaControlClientFactoryForTesting(() => c as any);
    return c;
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    adminEmail = `admin.h1.${crypto.randomUUID().slice(0, 6)}@norqva.test`;
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, 'ADMIN', 'ACTIVE') RETURNING id, auth_user_id`,
      [adminEmail]
    );
    adminId = r.rows[0].id;
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: adminEmail, role: 'ADMIN', session_id: SESSION_ID });
  });

  afterEach(() => {
    setMetaControlClientFactoryForTesting(null);
    vi.restoreAllMocks();
  });

  it('sanitizer removes tokens, Authorization, cookies, passwords and secret-looking values', () => {
    const jwt = signSupabaseToken({ sub: 'x' });
    const dirty = {
      access_token: META_TOKEN,
      Authorization: `Bearer ${jwt}`,
      cookie: 'sb=abc',
      password: 'hunter2',
      nested: { apiKey: 'k', note: `falhou com ${META_TOKEN} e ${jwt}`, url: `https://graph.facebook.com/v26.0/act_1?access_token=${META_TOKEN}&x=1` },
      asaas: '$aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDAwMDAwMDAwMDAwMDAwMDA6OiRhYWNoXzQ',
      ok: 'TR-EXP02',
      n: 45
    };
    const json = JSON.stringify(sanitizeForAudit(dirty));
    for (const secret of [META_TOKEN, jwt, 'hunter2', 'sb=abc', '$aact_']) expect(json).not.toContain(secret);
    expect(json).toContain('TR-EXP02');
    expect(json).toContain('45');
    expect(redactSecrets(`Bearer ${jwt}`)).toBe('[REDACTED]');
    expect(redactSecrets(`x?access_token=${META_TOKEN}`)).toBe('x?access_token=[REDACTED]');
  });

  it('context: HUMAN with session_id claim, AUTOMATION with the automation header, SYSTEM without user; no token kept', () => {
    const headers: Record<string, string> = { authorization: `Bearer ${adminToken}`, 'user-agent': 'Mozilla/5.0 H1' };
    const fakeReq = (h: Record<string, string>, user: any) => ({ user, ip: '::ffff:10.1.2.3', query: {}, header: (n: string) => h[n.toLowerCase()] });
    const human = decisionContextFromRequest(fakeReq(headers, { id: adminId, email: adminEmail }));
    expect(human).toMatchObject({ userId: adminId, userEmail: adminEmail, actorType: 'HUMAN', sessionId: SESSION_ID, ip: '10.1.2.3', userAgent: 'Mozilla/5.0 H1' });
    expect(JSON.stringify(human)).not.toContain(adminToken);

    const auto = decisionContextFromRequest(fakeReq({ ...headers, 'x-norqva-automation-token': 'super-secret-automation' }, { id: adminId, email: adminEmail }));
    expect(auto.actorType).toBe('AUTOMATION');
    expect(JSON.stringify(auto)).not.toContain('super-secret-automation');

    expect(decisionContextFromRequest(fakeReq({}, null)).actorType).toBe('SYSTEM');
    expect(metaIdsOfPlan({ campaign: { C: '1' }, adsets: { A: '2', B: '2' }, ads: {} })).toEqual(['1', '2']);
  });

  it('HTTP: a Meta-control decision writes REQUESTED + EXECUTED with identity, origin, ids and result — and no secrets', async () => {
    const metaId = String(Date.now()) + '01';
    fakeClient({ setEntityStatus: async () => ({ success: true, metaEntityId: metaId, previousStatus: 'PAUSED', newStatus: 'ACTIVE' }) });
    const r = await request(app)
      .post(`/api/meta-control/campaign/${metaId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'NORQVA-H1-test')
      .set('Cookie', 'sb-access-token=should-not-be-stored')
      .send({ status: 'ACTIVE' });
    expect(r.status).toBe(200);
    expect(r.body.audit_incomplete).toBeUndefined();

    const rows = await latestFor('META_ENTITY_STATUS', metaId);
    expect(rows.map((x) => x.phase).sort()).toEqual(['EXECUTED', 'REQUESTED']);
    for (const row of rows) {
      expect(row.user_id).toBe(adminId);
      expect(row.user_email).toBe(adminEmail);
      expect(row.actor_type).toBe('HUMAN');
      expect(row.session_id).toBe(SESSION_ID);
      expect(row.user_agent).toBe('NORQVA-H1-test');
      expect(row.ip).toBeTruthy();
      expect(row.decision).toBe('CAMPAIGN:ACTIVE');
      expect(row.meta_ids).toEqual([metaId]);
      expect(row.created_at).toBeTruthy();
      const flat = JSON.stringify(row);
      expect(flat).not.toContain(adminToken);
      expect(flat).not.toContain('should-not-be-stored');
      expect(flat).not.toMatch(/Bearer\s/);
    }
    const executed = rows.find((x) => x.phase === 'EXECUTED');
    expect(executed.result).toMatchObject({ newStatus: 'ACTIVE' });
  });

  it('HTTP: Meta failure is recorded as FAILED with the error redacted', async () => {
    const metaId = String(Date.now()) + '02';
    fakeClient({
      setDailyBudget: async () => {
        throw new Error(`boom calling https://graph.facebook.com/x?access_token=${META_TOKEN}`);
      }
    });
    const r = await request(app).post(`/api/meta-control/adset/${metaId}/budget`).set('Authorization', `Bearer ${adminToken}`).send({ daily_budget: 20 });
    expect(r.status).toBe(500);
    const rows = await latestFor('META_ENTITY_DAILY_BUDGET', metaId);
    const failed = rows.find((x) => x.phase === 'FAILED');
    expect(failed).toBeTruthy();
    expect(failed.error).toContain('access_token=[REDACTED]');
    expect(JSON.stringify(rows)).not.toContain(META_TOKEN);
  });

  it('HTTP: invalid input is recorded as REJECTED and nothing is executed', async () => {
    const metaId = String(Date.now()) + '03';
    const c = fakeClient({});
    const r = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'DELETED' });
    expect(r.status).toBe(400);
    expect(c.setEntityStatus).not.toHaveBeenCalled();
    const rows = await latestFor('META_ENTITY_STATUS', metaId);
    expect(rows.map((x) => x.phase).sort()).toEqual(['REJECTED', 'REQUESTED']);
  });

  it('HTTP: an automation token trying to answer a launch plan is recorded as AUTOMATION / REJECTED (403 as before)', async () => {
    const planId = crypto.randomUUID();
    const r = await request(app)
      .post(`/api/launch-plans/${planId}/answer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Norqva-Automation-Token', 'automation-secret-value')
      .send({ answer: 'YES' });
    expect(r.status).toBe(403);
    const rows = (
      await pool.query(`SELECT * FROM decision_events WHERE action = 'LAUNCH_PLAN_ANSWER' AND actor_type = 'AUTOMATION' AND user_id = $1 ORDER BY created_at DESC LIMIT 2`, [adminId])
    ).rows;
    expect(rows.map((x) => x.phase).sort()).toEqual(['REJECTED', 'REQUESTED']);
    expect(rows.every((x) => x.decision === 'YES')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('automation-secret-value');
  });

  it('fail-closed: if REQUESTED cannot be written, the decision is NOT executed (503)', async () => {
    const metaId = String(Date.now()) + '04';
    const c = fakeClient({});
    const original = pool.query.bind(pool);
    const spy = vi.spyOn(pool, 'query').mockImplementation(((text: any, params?: any) => {
      if (typeof text === 'string' && text.includes('INSERT INTO decision_events')) return Promise.reject(new Error('disk full'));
      return original(text, params);
    }) as any);
    const r = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    spy.mockRestore();
    expect(r.status).toBe(503);
    expect(c.setEntityStatus).not.toHaveBeenCalled();

    const ctx = { userId: null, userEmail: null, actorType: 'SYSTEM' as const, sessionId: null, ip: null, userAgent: null, isDemo: false };
    const broken = { query: async () => { throw new Error('db down'); } } as any;
    await expect(beginDecision(broken, ctx, { action: 'TEST' })).rejects.toBeInstanceOf(DecisionAuditError);
  });

  it('result write failure is not silent: response flags audit_incomplete and audit_logs gets a critical entry', async () => {
    const metaId = String(Date.now()) + '05';
    fakeClient({});
    const original = pool.query.bind(pool);
    let inserts = 0;
    const spy = vi.spyOn(pool, 'query').mockImplementation(((text: any, params?: any) => {
      if (typeof text === 'string' && text.includes('INSERT INTO decision_events')) {
        inserts++;
        if (inserts === 2) return Promise.reject(new Error('connection reset'));
      }
      return original(text, params);
    }) as any);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await request(app).post(`/api/meta-control/campaign/${metaId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'PAUSED' });
    spy.mockRestore();
    expect(r.status).toBe(200);
    expect(r.body.audit_incomplete).toBe(true);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('[DECISION AUDIT] result write failed'))).toBe(true);
    const fallback = await pool.query(`SELECT * FROM audit_logs WHERE event_type = 'DECISION_AUDIT_RESULT_WRITE_FAILED' AND new_value LIKE $1`, [`%${metaId}%`]);
    expect(fallback.rows.length).toBe(1);
    const rows = await latestFor('META_ENTITY_STATUS', metaId);
    expect(rows.map((x) => x.phase)).toEqual(['REQUESTED']);
  });

  it('GET /api/decision-events is ADMIN-only and lists events', async () => {
    const r = await request(app).get('/api/decision-events?limit=5').set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.events)).toBe(true);
    expect((await request(app).get('/api/decision-events')).status).toBe(401);
  });

  it.skipIf(isDbInMemory())('append-only: UPDATE, DELETE and TRUNCATE are refused by the database', async () => {
    const ctx = { userId: adminId, userEmail: adminEmail, actorType: 'HUMAN' as const, sessionId: null, ip: '1.1.1.1', userAgent: 'ua', isDemo: false };
    const h = await beginDecision(pool, ctx, { action: 'H1_IMMUTABLE_TEST' });
    await expect(pool.query(`UPDATE decision_events SET decision = 'X' WHERE correlation_id = $1`, [h.correlationId])).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM decision_events WHERE correlation_id = $1`, [h.correlationId])).rejects.toThrow(/append-only/);
    await expect(pool.query(`TRUNCATE decision_events`)).rejects.toThrow(/append-only/);
    // tentativa de usar a exceção da retenção para mudar outra coluna também falha
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL norqva.decision_events_pii_purge = 'on'`);
      await expect(
        client.query(`UPDATE decision_events SET ip = NULL, user_agent = NULL, pii_purged_at = NOW(), decision = 'HACK' WHERE correlation_id = $1`, [h.correlationId])
      ).rejects.toThrow(/append-only/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect((await eventsByCorrelation(h.correlationId)).length).toBe(1);
  });

  it.skipIf(isDbInMemory())('retention: purge removes only ip/user-agent of events older than the window', async () => {
    const oldCorr = crypto.randomUUID();
    const newCorr = crypto.randomUUID();
    await pool.query(
      `INSERT INTO decision_events (correlation_id, phase, action, actor_type, ip, user_agent, created_at)
       VALUES ($1, 'REQUESTED', 'H1_RETENTION', 'HUMAN', '9.9.9.9', 'old-ua', NOW() - INTERVAL '200 days'),
              ($2, 'REQUESTED', 'H1_RETENTION', 'HUMAN', '8.8.8.8', 'new-ua', NOW())`,
      [oldCorr, newCorr]
    );
    expect(await purgeDecisionEventPii(pool, 180)).toBeGreaterThanOrEqual(1);
    const [oldRow] = await eventsByCorrelation(oldCorr);
    const [newRow] = await eventsByCorrelation(newCorr);
    expect(oldRow.ip).toBeNull();
    expect(oldRow.user_agent).toBeNull();
    expect(oldRow.pii_purged_at).toBeTruthy();
    expect(oldRow.action).toBe('H1_RETENTION');
    expect(newRow.ip).toBe('8.8.8.8');
    expect(newRow.user_agent).toBe('new-ua');
  });
});
