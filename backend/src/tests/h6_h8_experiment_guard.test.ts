import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { ExperimentGuardService, evaluateGuard, GuardClient } from '../services/experiments/experimentGuardService';
import { DEFAULT_PROTECTED_META_IDS, protectedMetaIds, metaSpendCapFor, minimumFromMetaError } from '../services/experiments/protectedIds';
import { setExperimentGuardForTesting } from '../controllers/experimentGuardController';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';

// H6/H7/H8 (R-0019-01): vigia do teto, pausa só da campanha do plano, limite de gastos na Meta.

const fakeClient = (spend: number | (() => number), status = 'ACTIVE') => {
  const c = {
    getCampaignLifetimeSpend: vi.fn(async () => ({ spend: typeof spend === 'function' ? spend() : spend, effective_status: status, spend_cap: null })),
    setEntityStatus: vi.fn(async (_p: any, _t: any, id: string, s: string) => ({ success: true, entityId: id, status: s, previousStatus: 'ACTIVE', name: 'x' })),
    setCampaignSpendCap: vi.fn(async (id: string, cap: number) => ({ success: true, campaignId: id, spend_cap_brl: cap }))
  };
  return c as unknown as GuardClient & typeof c;
};

describe('H6/H7/H8 — regras puras', () => {
  it('alerts once per threshold and pauses when spend + projection reaches the cap', () => {
    const base = { cap: 200, dailyBudget: 30, intervalMin: 15 };
    expect(evaluateGuard({ ...base, spent: 150, alertsSent: {} })).toMatchObject({ newAlerts: [], shouldPause: false });
    expect(evaluateGuard({ ...base, spent: 162, alertsSent: {} }).newAlerts).toEqual([80]);
    expect(evaluateGuard({ ...base, spent: 185, alertsSent: { '80': 'x' } }).newAlerts).toEqual([90]);
    const near = evaluateGuard({ ...base, spent: 199.5, alertsSent: { '80': 'x', '90': 'x' } });
    expect(near.projection).toBeCloseTo(0.55, 2);
    expect(near.shouldPause).toBe(true);
    expect(evaluateGuard({ ...base, spent: 205, alertsSent: {} }).newAlerts).toEqual([80, 90, 100]);
  });

  it('Meta minimum for the campaign spend cap (BRL R$ 300) becomes a backstop', () => {
    expect(metaSpendCapFor(200, {})).toBe(300);
    expect(metaSpendCapFor(420, {})).toBe(420);
    expect(metaSpendCapFor(200, { META_MIN_CAMPAIGN_SPEND_CAP_BRL: '350' })).toBe(350);
    const realError = '[META GRAPH API ERROR]: Invalid parameter (code 100, subcode 2446307) — Limite de gastos da campanha muito baixo — O limite de gastos da campanha precisa ser pelo menos R$300,00 para essa moeda.';
    expect(minimumFromMetaError(realError)).toBe(300);
    expect(minimumFromMetaError('must be at least R$1,250.50 for this currency')).toBe(1250.5);
    const pending = '[META GRAPH API ERROR]: Invalid parameter (code 100, subcode 1885058) — Limite de gastos da campanha muito baixo — O limite de gastos da sua campanha não pode ser inferior a R$448,62 agora porque algumas cobranças podem estar pendentes, o que elevaria os gastos da campanha para esse valor.)';
    expect(minimumFromMetaError(pending)).toBe(448.62);
    expect(minimumFromMetaError('Your campaign spending limit cannot be less than R$1,050.00 right now')).toBe(1050);
    expect(minimumFromMetaError('outro erro')).toBeNull();
  });

  it('CONTROL ids are always protected, plus PROTECTED_META_IDS', () => {
    expect(DEFAULT_PROTECTED_META_IDS).toContain('120249666098740097');
    expect(protectedMetaIds({ PROTECTED_META_IDS: '111111, abc' }).has('111111')).toBe(true);
    expect(protectedMetaIds({}).has('abc')).toBe(false);
  });

  it('setCampaignSpendCap: centavos, never a protected id, guarded by the safety flag', async () => {
    const post = vi.fn(async () => ({ id: 'ok' }));
    const c = new MetaMutatingClient(post as any);
    const ctx = { userId: 'u', userRole: 'ADMIN', isDemo: false, preflightOverrideForTesting: { tokenValid: true, adsRead: true, adsManagement: true, adAccountAccess: true, pixelAccess: true, metaMutationCredentialReady: true } as any };
    const prev = process.env.META_MUTATION_ENABLED;
    process.env.META_MUTATION_ENABLED = 'false';
    await expect(c.setCampaignSpendCap('120250000000000001', 200, ctx)).rejects.toThrow(/META_MUTATION_ENABLED/);
    process.env.META_MUTATION_ENABLED = 'true';
    await expect(c.setCampaignSpendCap('120249666098740097', 200, ctx, protectedMetaIds())).rejects.toThrow(/Protected/);
    await c.setCampaignSpendCap('120250000000000001', 200, ctx);
    expect(post).toHaveBeenCalledWith('/120250000000000001', { spend_cap: 20000 });
    if (prev === undefined) delete process.env.META_MUTATION_ENABLED;
    else process.env.META_MUTATION_ENABLED = prev;
  });
});

describe('H6/H7/H8 — vigia e endpoints', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  const AUTOMATION = 'test-automation-token-h6h8-abcdefghijklmn';

  const mkPlan = async (over: { status?: string; cap?: number; daily?: number; campaign?: string; guard_state?: string | null } = {}) => {
    const code = `T-GRD-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const campaign = over.campaign ?? `1202${Math.floor(Math.random() * 1e12).toString().padStart(12, '0')}`;
    const spec = { campaign: { name: `NORQVA_${code}`, objective: 'OUTCOME_SALES' }, adsets: [], ads: [] };
    const metaIds = { campaign: { [`NORQVA_${code}`]: campaign }, adsets: {}, videos: {}, creatives: {}, ads: {} };
    const r = await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, guard_state)
       VALUES ($1, $2, $3, $4, $5, $6, 'Ativar?', $7) RETURNING id`,
      [code, over.status ?? 'ACTIVE', JSON.stringify(spec), JSON.stringify(metaIds), over.daily ?? 30, over.cap ?? 420, over.guard_state ?? null]
    );
    return { id: r.rows[0].id as string, code, campaign };
  };
  const row = async (id: string) => (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [id])).rows[0];

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    const mk = async (role: string) => {
      const email = `h6.${role.toLowerCase()}.${crypto.randomUUID().slice(0, 6)}@norqva.test`;
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE') RETURNING auth_user_id`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email, role });
    };
    adminToken = await mk('ADMIN');
    perfToken = await mk('PERFORMANCE');
  });

  beforeEach(async () => {
    // Isolate: only the plans of each test are "running"
    await pool.query(`UPDATE launch_plans SET guard_state = 'CAPPED' WHERE status IN ('ACTIVE', 'APPROVED')`);
  });

  it('alerts at 80% once, records the reading, does not pause below the cap', async () => {
    const p = await mkPlan({ cap: 200 });
    const client = fakeClient(165);
    const svc = new ExperimentGuardService(() => client, null);
    const r1 = await svc.run(pool, { planId: p.id });
    expect(r1.plans[0]).toMatchObject({ spent: 165, cap: 200, alerts: [80] });
    expect(client.setEntityStatus).not.toHaveBeenCalled();
    const after = await row(p.id);
    expect(parseFloat(after.spent_brl_last)).toBe(165);
    expect(after.guard_state).toBe('WATCHING');
    await svc.run(pool, { planId: p.id });
    const alerts = await pool.query(`SELECT rule_code FROM ad_alerts WHERE meta_campaign_id = $1`, [p.campaign]);
    expect(alerts.rows.map(a => a.rule_code)).toEqual(['EXPERIMENT_CAP_80']);
  });

  it('pauses ONLY the plan campaign at the cap (SYSTEM decision) and marks it CAPPED', async () => {
    const p = await mkPlan({ cap: 200 });
    const client = fakeClient(199.8);
    const svc = new ExperimentGuardService(() => client, null);
    const r = await svc.run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
    expect(client.setEntityStatus).toHaveBeenCalledTimes(1);
    expect(client.setEntityStatus.mock.calls[0].slice(1, 4)).toEqual(['CAMPAIGN', p.campaign, 'PAUSED']);
    const after = await row(p.id);
    expect(after.guard_state).toBe('CAPPED');
    const ev = await pool.query(`SELECT phase, actor_type, action FROM decision_events WHERE plan_code = $1`, [p.code]);
    expect(ev.rows.map(e => e.phase).sort()).toEqual(['EXECUTED', 'REQUESTED']);
    expect(ev.rows[0]).toMatchObject({ actor_type: 'SYSTEM', action: 'EXPERIMENT_GUARD_PAUSE' });
    // capped plans are not read again
    const again = await svc.run(pool, { planId: p.id });
    expect(again.plans).toHaveLength(0);
  });

  it('never touches the CONTROL campaign', async () => {
    const p = await mkPlan({ cap: 10, campaign: '120249666098740097' });
    const client = fakeClient(999);
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].skipped).toContain('CONTROL');
    expect(client.getCampaignLifetimeSpend).not.toHaveBeenCalled();
    expect(client.setEntityStatus).not.toHaveBeenCalled();
  });

  it('read failing twice → alert; worst case over the cap → preventive pause', async () => {
    const p = await mkPlan({ cap: 200, daily: 100 });
    await pool.query(`UPDATE launch_plans SET spent_brl_last = 190, spent_checked_at = $2 WHERE id = $1`, [p.id, new Date(Date.now() - 2 * 3600 * 1000)]);
    const client = fakeClient(0);
    client.getCampaignLifetimeSpend.mockRejectedValue(new Error('Meta down'));
    const svc = new ExperimentGuardService(() => client, null);
    const r1 = await svc.run(pool, { planId: p.id });
    expect(r1.plans[0]).toMatchObject({ read_failed: true, failures: 1 });
    expect(client.setEntityStatus).not.toHaveBeenCalled();
    const r2 = await svc.run(pool, { planId: p.id });
    expect(r2.plans[0].failures).toBe(2);
    expect(r2.plans[0].pause).toMatchObject({ paused: true });
    const alerts = await pool.query(`SELECT rule_code FROM ad_alerts WHERE meta_campaign_id = $1 ORDER BY created_at`, [p.campaign]);
    expect(alerts.rows.map(a => a.rule_code)).toContain('EXPERIMENT_GUARD_READ_FAILED');
  });

  it('pause failure → PAUSE_FAILED + critical alert', async () => {
    const p = await mkPlan({ cap: 50 });
    const client = fakeClient(60);
    client.setEntityStatus.mockRejectedValue(new Error('BLOCKED_BY_META_WRITE_SAFETY_HOLD'));
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: false });
    expect((await row(p.id)).guard_state).toBe('PAUSE_FAILED');
    const alerts = await pool.query(`SELECT rule_code FROM ad_alerts WHERE meta_campaign_id = $1`, [p.campaign]);
    expect(alerts.rows.map(a => a.rule_code)).toContain('EXPERIMENT_GUARD_PAUSE_FAILED');
  });

  it('spend-cap endpoint: ADMIN only, only reduces, applies the Meta limit, runs the guard and records the decision', async () => {
    const p = await mkPlan({ cap: 420 });
    const client = fakeClient(210);
    setExperimentGuardForTesting(new ExperimentGuardService(() => client, null));

    const forbidden = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${perfToken}`).send({ max_spend_brl: 200 });
    expect(forbidden.status).toBe(403);
    const up = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 500 });
    expect(up.status).toBe(409);
    expect(up.body.error).toContain('H3');
    const bad = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 'x' });
    expect(bad.status).toBe(400);

    const ok = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 200 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ previous_cap_brl: 420, cap_brl: 200, spend_cap: { status: 'BACKSTOP', spend_cap_brl: 300 } });
    expect(client.setCampaignSpendCap).toHaveBeenCalledWith(p.campaign, 300, expect.anything(), expect.any(Set)); // Meta minimum in BRL
    // already spent 210 ≥ 200 → paused right away
    expect(ok.body.guard.pause).toMatchObject({ paused: true });
    const after = await row(p.id);
    expect(parseFloat(after.max_spend_brl)).toBe(200);
    expect(after.spend_cap_status).toBe('BACKSTOP');
    expect(parseFloat(after.spend_cap_applied_brl)).toBe(300);
    expect(after.guard_state).toBe('CAPPED');
    const ev = await pool.query(`SELECT phase, decision, actor_type FROM decision_events WHERE plan_code = $1 AND action = 'LAUNCH_PLAN_SPEND_CAP'`, [p.code]);
    expect(ev.rows.map(e => e.phase).sort()).toEqual(['EXECUTED', 'REJECTED', 'REJECTED', 'REQUESTED', 'REQUESTED', 'REQUESTED']);
    expect(ev.rows.every(e => e.actor_type === 'HUMAN')).toBe(true);

    const guardView = await request(app).get(`/api/launch-plans/${p.id}/guard`).set('Authorization', `Bearer ${adminToken}`);
    expect(guardView.body).toMatchObject({ cap_brl: 200, guard_state: 'CAPPED', spend_cap: { status: 'BACKSTOP', applied_brl: 300 } });
    setExperimentGuardForTesting(null);
  });

  it('raise only up to the capital approved at activation, with typed plan code and justification', async () => {
    const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
    const prod = (await pool.query(`INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'P', 'c', 'd', FALSE) RETURNING id`, [`PRD-G-${tag}`])).rows[0].id;
    const off = (await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, is_demo) VALUES ($1, $2, 'O', 19.9, 'd', FALSE) RETURNING id`, [`OFF-G-${tag}`, prod])).rows[0].id;
    const exp = (
      await pool.query(
        `INSERT INTO experiments (human_id, name, hypothesis, product_id, offer_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
         VALUES ($1, 'E', 'h', $2, $3, NOW(), 'ATIVO', 420, 200, 45, FALSE) RETURNING id`,
        [`EXP-G-${tag}`, prod, off]
      )
    ).rows[0].id;
    const p = await mkPlan({ cap: 200 });
    await pool.query('UPDATE launch_plans SET experiment_id = $2 WHERE id = $1', [p.id, exp]);
    const client = fakeClient(120);
    setExperimentGuardForTesting(new ExperimentGuardService(() => client, null));
    const call = (body: any) => request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send(body);

    expect((await call({ max_spend_brl: 500, confirm_code: p.code, justification: 'Quero mais orçamento para o teste agora.' })).status).toBe(409);
    const noCode = await call({ max_spend_brl: 300, justification: 'Igualar ao mínimo de limite da Meta.' });
    expect(noCode.status).toBe(400);
    expect(noCode.body.error).toContain(p.code);
    expect((await call({ max_spend_brl: 300, confirm_code: p.code, justification: 'curta' })).status).toBe(400);

    const ok = await call({ max_spend_brl: 300, confirm_code: p.code.toLowerCase(), justification: 'Igualar o teto ao limite mínimo aceito pela Meta (decisão do operador).' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ previous_cap_brl: 200, cap_brl: 300, raise: { approved: 420 }, spend_cap: { status: 'APPLIED', spend_cap_brl: 300 } });
    expect(parseFloat((await row(p.id)).max_spend_brl)).toBe(300);
    expect(parseFloat((await pool.query('SELECT capital_approved FROM experiments WHERE id = $1', [exp])).rows[0].capital_approved)).toBe(300);
    const ev = await pool.query(`SELECT phase FROM decision_events WHERE plan_code = $1 AND action = 'LAUNCH_PLAN_SPEND_CAP' AND phase = 'EXECUTED'`, [p.code]);
    expect(ev.rows).toHaveLength(1);
    setExperimentGuardForTesting(null);
  });

  it('retries once with the minimum quoted by Meta', async () => {
    const p = await mkPlan({ cap: 420 });
    const client = fakeClient(10);
    client.setCampaignSpendCap
      .mockRejectedValueOnce(new Error('[META GRAPH API ERROR]: Limite de gastos da campanha precisa ser pelo menos R$450,00 para essa moeda.'))
      .mockResolvedValueOnce({ success: true, campaignId: p.campaign, spend_cap_brl: 450 } as any);
    const svc = new ExperimentGuardService(() => client, null);
    const r = await svc.applySpendCap(pool, await row(p.id), { userId: 'u', userRole: 'ADMIN', isDemo: false });
    expect(r).toMatchObject({ status: 'BACKSTOP', spend_cap_brl: 450 });
    expect(client.setCampaignSpendCap.mock.calls.map(c => c[1])).toEqual([420, 450]);
  });

  it('a Meta refusal of the spend cap is recorded and the guard still protects', async () => {
    const p = await mkPlan({ cap: 420 });
    const client = fakeClient(50);
    client.setCampaignSpendCap.mockRejectedValue(new Error('[META GRAPH API ERROR]: spend cap below minimum'));
    setExperimentGuardForTesting(new ExperimentGuardService(() => client, null));
    const ok = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 200 });
    expect(ok.status).toBe(200);
    expect(ok.body.spend_cap.status).toBe('FAILED');
    expect((await row(p.id)).spend_cap_status).toBe('FAILED');
    expect(ok.body.guard).toMatchObject({ spent: 50, cap: 200 });
    setExperimentGuardForTesting(null);
  });

  it('automation run needs the token; capped plans block re-activation (answer and meta-control)', async () => {
    expect((await request(app).post('/api/automation/experiment-guard/run')).status).toBe(401);
    setExperimentGuardForTesting(new ExperimentGuardService(() => fakeClient(1), null));
    const run = await request(app).post('/api/automation/experiment-guard/run').set('X-Norqva-Automation-Token', AUTOMATION);
    expect(run.status).toBe(200);
    setExperimentGuardForTesting(null);

    const p = await mkPlan({ status: 'APPROVED', guard_state: 'CAPPED' });
    const ans = await request(app).post(`/api/launch-plans/${p.id}/answer`).set('Authorization', `Bearer ${adminToken}`).send({ answer: 'YES' });
    expect(ans.status).toBe(409);
    expect(ans.body.error).toContain('teto');
    const act = await request(app).post(`/api/meta-control/campaign/${p.campaign}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    expect(act.status).toBe(409);
    expect(act.body.error).toContain(p.code);
  });
});
