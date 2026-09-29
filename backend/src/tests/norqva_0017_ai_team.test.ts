import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { OpportunityService } from '../services/aiTeam/opportunityService';
import { parseSecondOpinion } from '../services/aiTeam/gptSecondOpinion';
import { MetaSyncService } from '../services/meta/metaSyncService';
import { setOpportunityServiceForTesting } from '../controllers/aiTeamController';

// NORQVA-0017 (fase 3): time de IAs — oportunidade → avaliação (Claude + GPT) → plano → lote DRAFT na Fábrica → decisão.

describe('NORQVA-0017 — AI team', () => {
  let pool: Pool;
  let adminToken: string;
  let creativeToken: string;
  let productId: string;
  let offerId: string;
  let otherOfferId: string;
  const AUTOMATION = 'test-automation-token-0017-abcdefghijklmnop';
  const envBackup = { t: process.env.NORQVA_AUTOMATION_TOKEN, u: process.env.CLAUDE_ROUTINE_FIRE_URL, k: process.env.CLAUDE_ROUTINE_TOKEN };
  const secondOpinion = vi.fn(async () => ({ by: 'GPT' as const, model: 'stub', score: 61, verdict: 'TESTAR' as const, summary: 'Amostra pequena.', risks: ['Pouca prova'], at: 'now' }));
  const firer = vi.fn(async () => ({ ok: true, sessionUrl: 'https://claude.ai/code/session_x' }));
  const svc = new OpportunityService(firer, secondOpinion);

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    process.env.NORQVA_AUTOMATION_TOKEN = AUTOMATION;
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $2, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.norqva0017ai@norqva.test', 'ADMIN');
    creativeToken = await mk('creative.norqva0017ai@norqva.test', 'CREATIVE');
    const tag = crypto.randomUUID().slice(0, 6);
    productId = (
      await pool.query(`INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'Produto T17', 'Finanças', 'desc', TRUE) RETURNING id`, [`PRD-T17-${tag}`])
    ).rows[0].id;
    const otherProduct = (
      await pool.query(`INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'Outro', 'X', 'desc', TRUE) RETURNING id`, [`PRD-T17B-${tag}`])
    ).rows[0].id;
    offerId = (
      await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, is_demo) VALUES ($1, $2, 'Oferta T17', 29.9, 'd', TRUE) RETURNING id`, [`OFF-T17-${tag}`, productId])
    ).rows[0].id;
    otherOfferId = (
      await pool.query(`INSERT INTO offers (human_id, product_id, name, price, description, is_demo) VALUES ($1, $2, 'Outra', 10, 'd', TRUE) RETURNING id`, [`OFF-T17B-${tag}`, otherProduct])
    ).rows[0].id;
    await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo) VALUES
       ('T17-CL-01-DEMO', $1, 'Mostra o disponível do mês', 'FEATURE', 'teste', 'VERIFIED', TRUE),
       ('T17-CL-02-DEMO', $1, 'Promessa não verificada', 'FEATURE', 'teste', 'UNVERIFIED', TRUE)
       ON CONFLICT (human_id) DO UPDATE SET product_id = EXCLUDED.product_id, status = EXCLUDED.status`,
      [productId]
    );
    await new MetaSyncService().syncAll(pool, null, true);
    setOpportunityServiceForTesting(svc);
  });

  afterAll(() => {
    setOpportunityServiceForTesting(null);
    for (const [k, v] of [['NORQVA_AUTOMATION_TOKEN', envBackup.t], ['CLAUDE_ROUTINE_FIRE_URL', envBackup.u], ['CLAUDE_ROUTINE_TOKEN', envBackup.k]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('parses the GPT second opinion defensively', () => {
    expect(parseSecondOpinion('{"score": 72, "verdict": "seguir", "summary": "ok", "risks": ["a"]}', 'm', 't')).toMatchObject({ score: 72, verdict: 'SEGUIR' });
    expect(parseSecondOpinion('not json', 'm', 't').skipped).toBe(true);
    expect(parseSecondOpinion('{"score": 50}', 'm', 't').skipped).toBe(true);
  });

  it('creates opportunities from a brief and from the account ranking (with evidence)', async () => {
    const bad = await request(app).post('/api/ai-team/opportunities?mode=demo').set('Authorization', `Bearer ${adminToken}`).send({ source: 'MANUAL' });
    expect(bad.status).toBe(400);
    const forbidden = await request(app).post('/api/ai-team/opportunities?mode=demo').set('Authorization', `Bearer ${creativeToken}`).send({ source: 'MANUAL', brief: 'x' });
    expect(forbidden.status).toBe(403);
    const acc = await request(app)
      .post('/api/ai-team/opportunities?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ source: 'ACCOUNT', source_level: 'ad', source_ref: 'ad_demo_001' });
    expect(acc.status).toBe(201);
    expect(acc.body.evidence.row.meta_id).toBe('ad_demo_001');
    expect(acc.body.human_id).toMatch(/^OPP-\d{4}-DEMO$/);
    const list = await request(app).get('/api/ai-team/opportunities?mode=demo').set('Authorization', `Bearer ${creativeToken}`);
    expect(list.body.opportunities.some((o: any) => o.id === acc.body.id)).toBe(true);
  });

  it('full flow: evaluate (Claude + GPT) → plan → DRAFT batch in the Factory → approve', async () => {
    const opp = (
      await request(app)
        .post('/api/ai-team/opportunities?mode=demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ source: 'MANUAL', brief: 'Planejador financeiro para autônomos', product_id: productId })
    ).body;

    const early = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });
    expect(early.status).toBe(409);

    const ev = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EVALUATE' });
    expect(ev.body).toMatchObject({ status: 'EM_AVALIACAO', task_status: 'NOT_CONFIGURED', task_kind: 'EVALUATE' });
    await vi.waitFor(async () => {
      const r = await pool.query('SELECT second_opinion FROM campaign_opportunities WHERE id = $1', [opp.id]);
      expect(r.rows[0].second_opinion?.verdict).toBe('TESTAR');
    });

    // Real mode dispatch fires the routine with the task text
    process.env.CLAUDE_ROUTINE_FIRE_URL = 'https://api.anthropic.com/v1/claude_code/routines/trig_x/fire';
    process.env.CLAUDE_ROUTINE_TOKEN = 'x';
    const fired = await svc.dispatch(pool, opp.id, 'EVALUATE', false);
    expect(fired).toMatchObject({ task_status: 'DISPATCHED', session_url: 'https://claude.ai/code/session_x' });
    expect(String((firer.mock.calls.at(-1) as any)[0])).toContain(`opportunity_id: ${opp.id}\nkind: EVALUATE`);

    const noTok = await request(app).get(`/api/automation/opportunities/${opp.id}`);
    expect(noTok.status).toBe(401);
    const task = await request(app).get(`/api/automation/opportunities/${opp.id}`).set('X-Norqva-Automation-Token', AUTOMATION);
    expect(task.status).toBe(200);
    expect(task.body.context.verified_claims.map((c: any) => c.human_id)).toContain('T17-CL-01-DEMO');
    expect(task.body.context.verified_claims.map((c: any) => c.human_id)).not.toContain('T17-CL-02-DEMO');

    const badEval = await request(app).post(`/api/automation/opportunities/${opp.id}/evaluation`).set('X-Norqva-Automation-Token', AUTOMATION).send({ score: 80, verdict: 'TALVEZ', summary: 's' });
    expect(badEval.status).toBe(400);
    const evalOk = await request(app)
      .post(`/api/automation/opportunities/${opp.id}/evaluation`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ score: 74, verdict: 'TESTAR', summary: 'Demanda validada na UE; margem apertada.', risks: ['CPA de equilíbrio baixo'], hypotheses: ['Gancho de controle mensal'] });
    expect(evalOk.body).toMatchObject({ status: 'AVALIADA', ai_score: 74, verdict: 'TESTAR' });

    await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'PLAN' });

    const creative = (claim: string) => ({
      hook: 'Você sabe quanto ainda pode gastar este mês?', mechanism: 'Card Disponível', cta: 'Toque em Saiba mais', format: 'VIDEO',
      duration_seconds: 18, script: 'Abertura… Mecanismo… CTA', primary_text: 'Organize o mês em poucos toques.', headline: 'O mês com clareza', claim_codes: [claim]
    });
    const unverified = await request(app)
      .post(`/api/automation/opportunities/${opp.id}/plan`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ product_id: productId, offer_id: offerId, creatives: [creative('T17-CL-02')] });
    expect(unverified.status).toBe(400);
    expect(unverified.body.error).toContain('T17-CL-02');
    const wrongOffer = await request(app)
      .post(`/api/automation/opportunities/${opp.id}/plan`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({ product_id: productId, offer_id: otherOfferId, creatives: [creative('T17-CL-01')] });
    expect(wrongOffer.status).toBe(400);

    const plan = await request(app)
      .post(`/api/automation/opportunities/${opp.id}/plan`)
      .set('X-Norqva-Automation-Token', AUTOMATION)
      .send({
        product_id: productId,
        offer_id: offerId,
        summary: 'Teste de 2 ganchos com R$ 30/dia.',
        test_plan: 'Rodada 1: 2 criativos; pausar com 2× CPA sem venda.',
        campaign: { objective: 'OUTCOME_SALES', event: 'Purchase', daily_budget: 30, audience: 'Brasil 25-55 amplo' },
        creatives: [creative('T17-CL-01'), { ...creative('T17-CL-01'), hook: 'Planilha complicada? Tem jeito mais simples.', format: 'IMAGE' }]
      });
    expect(plan.status).toBe(200);
    const code = plan.body.opportunity.batch_code;
    expect(code).toBe(`${opp.human_id.replace(/-DEMO$/, '')}-B01`);
    expect(plan.body.opportunity.status).toBe('PLANO_PRONTO');
    expect(plan.body.batch.creativesCreated).toBe(2);

    const cr = await pool.query(`SELECT id, human_id, approval_status, format FROM creatives WHERE batch_code = $1 AND is_demo = TRUE ORDER BY human_id`, [code]);
    expect(cr.rows.map(r => r.human_id)).toEqual([`${code}-C01-DEMO`, `${code}-C02-DEMO`]);
    expect(cr.rows.every(r => r.approval_status === 'DRAFT')).toBe(true);
    const links = await pool.query(`SELECT COUNT(*)::int n FROM creative_claims WHERE creative_id = $1`, [cr.rows[0].id]);
    expect(links.rows[0].n).toBe(1);
    const batchRow = await pool.query(`SELECT source, imported_at FROM creative_batches WHERE code = $1 AND is_demo = TRUE`, [code]);
    expect(batchRow.rows[0]).toMatchObject({ source: 'AI' });

    const creativeDecides = await request(app).post(`/api/ai-team/opportunities/${opp.id}/decision?mode=demo`).set('Authorization', `Bearer ${creativeToken}`).send({ decision: 'APROVADA' });
    expect(creativeDecides.status).toBe(403);
    const ok = await request(app).post(`/api/ai-team/opportunities/${opp.id}/decision?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ decision: 'APROVADA' });
    expect(ok.body.status).toBe('APROVADA');
    const again = await request(app).post(`/api/ai-team/opportunities/${opp.id}/dispatch?mode=demo`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'EVALUATE' });
    expect(again.status).toBe(409);
  });
});
