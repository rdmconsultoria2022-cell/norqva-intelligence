import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { OpportunityService, VALIDATION_CHECKS, validationPassed } from '../services/aiTeam/opportunityService';
import { setOpportunityServiceForTesting } from '../controllers/aiTeamController';

// NORQVA-0021 (P2): validador (Claude em modo crítico) como portão entre a avaliação e o plano.

const checklist = (over: Record<string, string> = {}) => VALIDATION_CHECKS.map(c => ({ key: c.key, status: over[c.key] || 'OK', note: `nota ${c.key}` }));

describe('NORQVA-0021 — validador crítico', () => {
  let pool: Pool;
  let adminToken: string;
  let intelToken: string;
  const AUTOMATION = 'test-automation-token-0021-abcdefghijklmnop';
  const envBackup = { t: process.env.NORQVA_AUTOMATION_TOKEN, u: process.env.CLAUDE_ROUTINE_FIRE_URL, k: process.env.CLAUDE_ROUTINE_TOKEN };
  const firer = vi.fn(async () => ({ ok: true, sessionUrl: 'https://claude.ai/code/session_v' }));
  const svc = new OpportunityService(firer, async () => ({ by: 'GPT' as const, skipped: true, reason: 'sem chave', at: 'now' } as any));

  const newEvaluated = async () => {
    const opp = (
      await request(app).post('/api/ai-team/opportunities?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ source: 'MANUAL', brief: `Teste validador ${crypto.randomUUID().slice(0, 6)}` })
    ).body;
    await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EVALUATE' });
    const ev = await request(app)
      .post(`/api/automation/opportunities/${opp.id}/evaluation`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ score: 62, verdict: 'TESTAR', summary: 'Vale um teste pequeno.' });
    expect(ev.body.status).toBe('AVALIADA');
    return opp;
  };
  const validate = (id: string, body: any) => request(app).post(`/api/automation/opportunities/${id}/validation`).set('X-Norqva-Automation-Token', AUTOMATION).send(body);

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    delete process.env.CLAUDE_ROUTINE_FIRE_URL;
    delete process.env.CLAUDE_ROUTINE_TOKEN;
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $2, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.norqva0021v@norqva.test', 'ADMIN');
    intelToken = await mk('intel.norqva0021v@norqva.test', 'INTELLIGENCE');
    setOpportunityServiceForTesting(svc);
  });

  afterAll(() => {
    setOpportunityServiceForTesting(null);
    for (const [k, v] of [['NORQVA_AUTOMATION_TOKEN', envBackup.t], ['CLAUDE_ROUTINE_FIRE_URL', envBackup.u], ['CLAUDE_ROUTINE_TOKEN', envBackup.k]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('gate rule', () => {
    expect(validationPassed({ validation_verdict: 'APROVA' })).toBe(true);
    expect(validationPassed({ validation_verdict: 'REPROVA' })).toBe(false);
    expect(validationPassed({ validation_verdict: 'REPROVA', validation_override: { justification: 'x' } })).toBe(true);
    expect(validationPassed({})).toBe(false);
    expect(VALIDATION_CHECKS.map(c => c.key)).toEqual(['AMOSTRA', 'CONTA_FECHA', 'CLAIMS', 'SATURACAO', 'ATRIBUICAO', 'CONCORRENCIA']);
  });

  it('VALIDATE needs an evaluation, fires the routine with kind VALIDATE and gives the checklist to the validator', async () => {
    const fresh = (
      await request(app).post('/api/ai-team/opportunities?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ source: 'MANUAL', brief: 'Sem avaliação ainda' })
    ).body;
    const early = await request(app).post(`/api/ai-team/opportunities/${fresh.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'VALIDATE' });
    expect(early.status).toBe(409);
    const bad = await request(app).post(`/api/ai-team/opportunities/${fresh.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'XYZ' });
    expect(bad.status).toBe(400);

    const opp = await newEvaluated();
    const demo = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'VALIDATE' });
    expect(demo.status).toBe(200);
    expect(demo.body).toMatchObject({ status: 'AVALIADA', task_stage: 'VALIDATE', task_kind: null, task_status: 'NOT_CONFIGURED' });

    process.env.CLAUDE_ROUTINE_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire';
    process.env.CLAUDE_ROUTINE_TOKEN = 'x';
    const fired = await svc.dispatch(pool, opp.id, 'VALIDATE', false);
    expect(fired).toMatchObject({ task_status: 'DISPATCHED', task_stage: 'VALIDATE' });
    expect(String((firer.mock.calls.at(-1) as any)[0])).toContain('kind: VALIDATE');
    delete process.env.CLAUDE_ROUTINE_FIRE_URL;
    delete process.env.CLAUDE_ROUTINE_TOKEN;

    const task = await request(app).get(`/api/automation/opportunities/${opp.id}`).set('X-Norqva-Automation-Token', AUTOMATION);
    expect(task.body.validation_checklist).toHaveLength(6);
    expect(task.body.evaluation.verdict).toBe('TESTAR');
  });

  it('validates the verdict payload: full checklist, no APROVA with FALHA, PEDE_EVIDENCIA lists what is missing', async () => {
    const opp = await newEvaluated();
    const noTok = await request(app).post(`/api/automation/opportunities/${opp.id}/validation`).send({ verdict: 'APROVA' });
    expect(noTok.status).toBe(401);
    expect((await validate(opp.id, { verdict: 'TALVEZ', summary: 's', checklist: checklist() })).status).toBe(400);
    const partial = await validate(opp.id, { verdict: 'APROVA', summary: 's', checklist: checklist().slice(0, 5) });
    expect(partial.status).toBe(400);
    expect(partial.body.error).toContain('CONCORRENCIA');
    const approveWithFail = await validate(opp.id, { verdict: 'APROVA', summary: 's', checklist: checklist({ CONTA_FECHA: 'FALHA' }) });
    expect(approveWithFail.status).toBe(400);
    expect(approveWithFail.body.error).toContain('CONTA_FECHA');
    expect((await validate(opp.id, { verdict: 'PEDE_EVIDENCIA', summary: 's', checklist: checklist({ AMOSTRA: 'ALERTA' }) })).status).toBe(400);

    const ok = await validate(opp.id, {
      verdict: 'PEDE_EVIDENCIA',
      summary: 'Faltam dados de CPA em 7 dias.',
      checklist: checklist({ AMOSTRA: 'FALHA' }),
      questions: ['O CPA de R$ 19 se repete com R$ 100 de gasto?'],
      required_evidence: ['Gasto mínimo de R$ 50 no anúncio vencedor']
    });
    expect(ok.status).toBe(200);
    expect(ok.body.validation_verdict).toBe('PEDE_EVIDENCIA');
    expect(ok.body.validation.checklist.find((c: any) => c.key === 'AMOSTRA').status).toBe('FALHA');
    expect(ok.body.validation.required_evidence).toHaveLength(1);

    const plan = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });
    expect(plan.status).toBe(409);
    const planDirect = await request(app).post(`/api/automation/opportunities/${opp.id}/plan`).set('X-Norqva-Automation-Token', AUTOMATION).send({});
    expect(planDirect.status).toBe(409);
  });

  it('owner override: ADMIN only, needs a justification, recorded in decision_events, unlocks the plan', async () => {
    const opp = await newEvaluated();
    const none = await request(app).post(`/api/ai-team/opportunities/${opp.id}/validation-override?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ justification: 'Quero seguir mesmo assim por estratégia.' });
    expect(none.status).toBe(409); // there is no veto yet

    await validate(opp.id, { verdict: 'REPROVA', summary: 'A conta não fecha.', checklist: checklist({ CONTA_FECHA: 'FALHA' }) });

    const intel = await request(app).post(`/api/ai-team/opportunities/${opp.id}/validation-override?mode=demo`).set('Authorization', `Bearer ${intelToken}`).send({ justification: 'Quero seguir mesmo assim por estratégia.' });
    expect(intel.status).toBe(403);
    const short = await request(app).post(`/api/ai-team/opportunities/${opp.id}/validation-override?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ justification: 'vai' });
    expect(short.status).toBe(400);

    const ok = await request(app)
      .post(`/api/ai-team/opportunities/${opp.id}/validation-override?mode=demo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'vitest')
      .send({ justification: 'Teste barato de R$ 30 para aprender o público; aceito o risco.' });
    expect(ok.status).toBe(200);
    expect(ok.body.validation_override.overridden_verdict).toBe('REPROVA');
    expect(ok.body.validation_verdict).toBe('REPROVA');

    const ev = await pool.query(`SELECT phase, action, decision, plan_code, actor_type FROM decision_events WHERE plan_code = $1 ORDER BY created_at`, [opp.human_id]);
    expect(ev.rows.map(r => r.phase).sort()).toEqual(['EXECUTED', 'REQUESTED']);
    expect(ev.rows.find(r => r.phase === 'REQUESTED')).toMatchObject({ action: 'OPPORTUNITY_VALIDATION_OVERRIDE', decision: 'OVERRIDE:REPROVA', actor_type: 'HUMAN' });

    const twice = await request(app).post(`/api/ai-team/opportunities/${opp.id}/validation-override?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ justification: 'Teste barato de R$ 30 para aprender o público; aceito o risco.' });
    expect(twice.status).toBe(409);

    const plan = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });
    expect(plan.status).toBe(200);
    expect(plan.body.status).toBe('EM_PLANEJAMENTO');
  });

  it('a new evaluation or validation resets the verdict and the override', async () => {
    const opp = await newEvaluated();
    await validate(opp.id, { verdict: 'APROVA', summary: 'Ok.', checklist: checklist() });
    const again = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'VALIDATE' });
    expect(again.body.validation_verdict).toBeNull();
    const plan = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });
    expect(plan.status).toBe(409);
  });
});
