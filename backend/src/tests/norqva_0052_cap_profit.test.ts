// NORQVA-0052 (D-0052): teto editável em qualquer situação e campanha lucrativa não pausada pelo teto.
// Meta e Asaas sempre simulados: o cliente da Meta é falso e as vendas são linhas no banco de teste.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { ExperimentGuardService, GuardClient, ceilingOf, judgeProfit, spDate } from '../services/experiments/experimentGuardService';
import { refreshQuestionText } from '../services/launchPlans/launchPlanService';
import { setExperimentGuardForTesting } from '../controllers/experimentGuardController';
import { OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { DEFAULT_OFFER_BASE_URL, urlTagsFor } from '../services/aiTeam/launchSheet';

const fakeClient = (spend: number, recentSpend: number | null = spend, status = 'ACTIVE') => {
  const c = {
    getCampaignLifetimeSpend: vi.fn(async () => ({ spend, effective_status: status, spend_cap: null })),
    getCampaignSpendBetween: vi.fn(async () => {
      if (recentSpend === null) throw new Error('Meta down');
      return recentSpend;
    }),
    setEntityStatus: vi.fn(async (_p: any, _t: any, id: string, s: string) => ({ success: true, entityId: id, status: s, previousStatus: 'ACTIVE', name: 'x' })),
    setCampaignSpendCap: vi.fn(async (id: string, cap: number) => ({ success: true, campaignId: id, spend_cap_brl: cap }))
  };
  return c as unknown as GuardClient & typeof c;
};

describe('NORQVA-0052 — regras puras', () => {
  it('a pergunta de ativação acompanha o teto atual', () => {
    expect(refreshQuestionText('Ativar a campanha X com R$ 20.00/dia e teto de R$ 160.00?', 200)).toBe('Ativar a campanha X com R$ 20.00/dia e teto de R$ 200.00?');
    expect(refreshQuestionText('Ativar o teste T (N) com até R$ 160.00 no total?', 250.5)).toBe('Ativar o teste T (N) com até R$ 250.50 no total?');
    expect(refreshQuestionText('Ativar?', 300)).toBe('Ativar? Teto atual: R$ 300.00.');
    expect(refreshQuestionText('Ativar? Teto atual: R$ 300.00.', 120)).toBe('Ativar? Teto atual: R$ 120.00.');
  });

  it('lucro exige 3 vendas e receita líquida acima do gasto, na campanha inteira e nos últimos 3 dias', () => {
    const life = { sales: 4, net: 100, spend: 80 };
    const rec = { sales: 3, net: 70, spend: 50, since: '2026-10-09' };
    expect(judgeProfit(life, rec).profitable).toBe(true);
    expect(judgeProfit({ ...life, sales: 2 }, rec).profitable).toBe(false);
    expect(judgeProfit({ ...life, net: 80 }, rec).profitable).toBe(false);
    expect(judgeProfit(life, { ...rec, spend: null }).profitable).toBe(false);
    expect(judgeProfit(life, { ...rec, sales: 2 }).profitable).toBe(false);
    expect(judgeProfit(life, { ...rec, net: 40 }).reason).toContain('últimos 3 dias');
  });

  it('teto máximo: o do operador ou 3x o teto inicial', () => {
    expect(ceilingOf({ max_spend_brl: 200 })).toBe(600);
    expect(ceilingOf({ max_spend_brl: 300, max_spend_initial_brl: 200 })).toBe(600);
    expect(ceilingOf({ max_spend_brl: 300, max_spend_initial_brl: 200, max_spend_ceiling_brl: 450 })).toBe(450);
    expect(spDate(0, new Date('2026-10-12T01:00:00Z'))).toBe('2026-10-11'); // 22h em São Paulo
  });
});

describe('NORQVA-0052 — vigia e tela', () => {
  let pool: Pool;
  let adminToken: string;
  let customerId: string;
  const created: string[] = [];

  const mkPlan = async (over: { status?: string; cap?: number; daily?: number; guard_state?: string | null; ceiling?: number | null; profit?: boolean; spent?: number | null; question?: string } = {}) => {
    const code = `T-0052-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const campaign = `1203${Math.floor(Math.random() * 1e12).toString().padStart(12, '0')}`;
    const spec = { campaign: { name: `NORQVA_${code}`, objective: 'OUTCOME_SALES' }, adsets: [], ads: [] };
    const metaIds = { campaign: { [`NORQVA_${code}`]: campaign }, adsets: {}, videos: {}, creatives: {}, ads: {} };
    const r = await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, guard_state, max_spend_ceiling_brl, profit_extend_enabled, spent_brl_last)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [code, over.status ?? 'ACTIVE', JSON.stringify(spec), JSON.stringify(metaIds), over.daily ?? 20, over.cap ?? 200, over.question ?? 'Ativar com R$ 20.00/dia e teto de R$ 200.00?', over.guard_state ?? null, over.ceiling ?? null, over.profit ?? true, over.spent ?? null]
    );
    created.push(r.rows[0].id);
    return { id: r.rows[0].id as string, code, campaign };
  };
  const row = async (id: string) => (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [id])).rows[0];
  /** Venda paga (pagamento CONFIRMED, como o Asaas confirma) atribuída ao plano. */
  const sale = async (code: string, opts: { amount?: number; fee?: number | null; daysAgo?: number; provenance?: string } = {}) => {
    const when = new Date(Date.now() - (opts.daysAgo ?? 0) * 86400000);
    const o = await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, utm_source, utm_campaign, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'PAID', FALSE, $3, $4, 'meta', $5, $6, $6) RETURNING id`,
      [customerId, opts.amount ?? 27.9, opts.provenance ?? 'COMMERCIAL_PRODUCTION', `idem-0052-${crypto.randomUUID()}`, code, when]
    );
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, provider_fee, confirmed_at, idempotency_key, external_reference, data_provenance, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ASAAS', 'CONFIRMED', $3, $4, $5, $6, $7, 'COMMERCIAL_PRODUCTION', $5, $5)`,
      [`PAY-0052-${crypto.randomUUID().slice(0, 8)}`, o.rows[0].id, opts.amount ?? 27.9, opts.fee === undefined ? 1.99 : opts.fee, when, `idem-pay-0052-${crypto.randomUUID()}`, `ext-0052-${crypto.randomUUID()}`]
    );
  };

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    const email = `n0052.${crypto.randomUUID().slice(0, 6)}@norqva.test`;
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, 'ADMIN', 'ACTIVE') RETURNING auth_user_id`,
      [email]
    );
    adminToken = signSupabaseToken({ sub: u.rows[0].auth_user_id, email, role: 'ADMIN' });
    customerId = (await pool.query(`INSERT INTO customers (id, email, name) VALUES (gen_random_uuid(), $1, 'Comprador 0052') RETURNING id`, [`c0052.${crypto.randomUUID().slice(0, 6)}@example.com`])).rows[0].id;
  });

  beforeEach(async () => {
    await pool.query(`UPDATE launch_plans SET guard_state = 'CAPPED' WHERE status IN ('ACTIVE', 'APPROVED')`);
  });

  afterAll(async () => {
    setExperimentGuardForTesting(null);
  });

  it('campanha lucrativa no teto: NÃO pausa, teto sobe 50% e avisa', async () => {
    const p = await mkPlan({ cap: 200 });
    for (let i = 0; i < 4; i++) await sale(p.code, { amount: 60, fee: 2 }); // líquido 232
    const client = fakeClient(199.9, 120); // últimos 3 dias: 4 vendas, 232 líquidos contra 120
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(client.setEntityStatus).not.toHaveBeenCalled();
    expect(r.plans[0].extended).toMatchObject({ extended: true, previous_cap: 200, cap: 300, ceiling: 600 });
    const after = await row(p.id);
    expect(parseFloat(after.max_spend_brl)).toBe(300);
    expect(parseFloat(after.max_spend_initial_brl)).toBe(200);
    expect(after.cap_extensions).toBe(1);
    expect(after.guard_state).toBe('WATCHING');
    expect(client.setCampaignSpendCap).toHaveBeenCalledWith(p.campaign, expect.any(Number), expect.anything(), expect.any(Set));
    const alerts = await pool.query(`SELECT rule_code FROM ad_alerts WHERE meta_campaign_id = $1`, [p.campaign]);
    expect(alerts.rows.map(a => a.rule_code)).toContain('EXPERIMENT_CAP_EXTENDED_PROFIT');
    const ev = await pool.query(`SELECT phase, actor_type FROM decision_events WHERE plan_code = $1 AND action = 'EXPERIMENT_GUARD_EXTEND_CAP'`, [p.code]);
    expect(ev.rows.map(e => e.phase).sort()).toEqual(['EXECUTED', 'REQUESTED']);
    expect(ev.rows.every(e => e.actor_type === 'SYSTEM')).toBe(true);
    // o teto máximo continua 3x o teto INICIAL (não cresce junto)
    expect(ceilingOf(after)).toBe(600);
  });

  it('sem lucro (menos de 3 vendas) pausa como antes', async () => {
    const p = await mkPlan({ cap: 200 });
    await sale(p.code, { amount: 200 });
    await sale(p.code, { amount: 200 });
    const client = fakeClient(199.9, 50);
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
    expect((await row(p.id)).guard_state).toBe('CAPPED');
    expect((await row(p.id)).guard_note).toContain('mínimo 3');
  });

  it('lucro só no começo (últimos 3 dias no prejuízo) pausa', async () => {
    const p = await mkPlan({ cap: 200 });
    for (let i = 0; i < 4; i++) await sale(p.code, { amount: 80, daysAgo: 6 });
    const client = fakeClient(199.9, 90); // nos últimos 3 dias: nenhuma venda e R$ 90 de gasto
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
    expect(r.plans[0].profit.note).toContain('últimos 3 dias');
  });

  it('vendas de teste (não comerciais) não contam como lucro', async () => {
    const p = await mkPlan({ cap: 200 });
    for (let i = 0; i < 5; i++) await sale(p.code, { amount: 100, provenance: 'STAGING_SANDBOX_QA' });
    const client = fakeClient(199.9, 50);
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
  });

  it('sem leitura do gasto recente na Meta, não estende (pausa)', async () => {
    const p = await mkPlan({ cap: 200 });
    for (let i = 0; i < 4; i++) await sale(p.code, { amount: 80 });
    const client = fakeClient(199.9, null);
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
  });

  it('teto máximo atingido: pausa mesmo com lucro e pede decisão', async () => {
    const p = await mkPlan({ cap: 200, ceiling: 200 });
    for (let i = 0; i < 6; i++) await sale(p.code, { amount: 80 });
    const client = fakeClient(199.9, 100);
    const r = await new ExperimentGuardService(() => client, null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
    expect(r.plans[0].profit).toMatchObject({ ceiling_reached: true });
    expect((await row(p.id)).guard_note).toContain('teto máximo');
  });

  it('extensão desligada no plano: pausa no teto', async () => {
    const p = await mkPlan({ cap: 200, profit: false });
    for (let i = 0; i < 6; i++) await sale(p.code, { amount: 80 });
    const r = await new ExperimentGuardService(() => fakeClient(199.9, 100), null).run(pool, { planId: p.id });
    expect(r.plans[0].pause).toMatchObject({ paused: true });
  });

  it('taxa do Asaas ainda desconhecida entra com estimativa conservadora (não infla o lucro)', async () => {
    const p = await mkPlan({ cap: 200 });
    for (let i = 0; i < 3; i++) await sale(p.code, { amount: 100, fee: null });
    const { planNetRevenue } = await import('../services/experiments/experimentGuardService');
    const r = await planNetRevenue(pool, p.code, null);
    expect(r.sales).toBe(3);
    expect(r.net).toBeCloseTo(3 * (100 - 7.99), 2);
  });

  it('logo depois de o operador BAIXAR o teto, a campanha lucrativa é pausada (a decisão dele vale)', async () => {
    const p = await mkPlan({ cap: 300 });
    for (let i = 0; i < 6; i++) await sale(p.code, { amount: 80 });
    const client = fakeClient(210, 100);
    setExperimentGuardForTesting(new ExperimentGuardService(() => client, null));
    const r = await request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 200 });
    expect(r.status).toBe(200);
    expect(r.body.guard.pause).toMatchObject({ paused: true });
    expect(parseFloat((await row(p.id)).max_spend_brl)).toBe(200);
    expect((await row(p.id)).guard_state).toBe('CAPPED');
  });

  it('tela: subir o teto de campanha parada no teto volta a vigiar, sem reativar; pergunta mostra o teto novo', async () => {
    const p = await mkPlan({ cap: 200, guard_state: 'CAPPED', spent: 205 });
    const client = fakeClient(205, 50, 'PAUSED');
    setExperimentGuardForTesting(new ExperimentGuardService(() => client, null));
    const call = (body: any) => request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send(body);
    const r = await call({ max_spend_brl: 400, confirm_code: p.code, justification: 'Quero testar mais uma semana.' });
    expect(r.status).toBe(200);
    // a pergunta já respondida (Sim) fica como foi aprovada; antes do Sim ela acompanha o teto
    expect(r.body).toMatchObject({ cap_brl: 400, uncapped: true, question_text: 'Ativar com R$ 20.00/dia e teto de R$ 200.00?' });
    const after = await row(p.id);
    expect(after.guard_state).toBe('WATCHING');
    expect(after.capped_at).toBeNull();
    expect(client.setEntityStatus).not.toHaveBeenCalled();
  });

  it('tela: baixar salva sem confirmação; teto máximo menor que o teto é recusado; subir o teto máximo pede confirmação', async () => {
    const p = await mkPlan({ cap: 300 });
    setExperimentGuardForTesting(new ExperimentGuardService(() => fakeClient(10, 10), null));
    const call = (body: any) => request(app).post(`/api/launch-plans/${p.id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send(body);
    const down = await call({ max_spend_brl: 250, max_spend_ceiling_brl: 500, profit_extend_enabled: false });
    expect(down.status).toBe(200);
    expect(down.body).toMatchObject({ cap_brl: 250, ceiling_brl: 500, profit_extend_enabled: false, raise: null });
    expect((await call({ max_spend_brl: 250, max_spend_ceiling_brl: 200 })).status).toBe(400);
    const upCeil = await call({ max_spend_brl: 250, max_spend_ceiling_brl: 900 });
    expect(upCeil.status).toBe(400);
    const reOn = await call({ max_spend_brl: 250, profit_extend_enabled: true });
    expect(reOn.status).toBe(400);
    const guardView = await request(app).get(`/api/launch-plans/${p.id}/guard`).set('Authorization', `Bearer ${adminToken}`);
    expect(guardView.body).toMatchObject({ cap_brl: 250, ceiling_brl: 500, ceiling_is_default: false, profit_extend_plan: false, cap_extensions: 0 });
    expect(guardView.body.profit).toMatchObject({ sales: 0, min_sales: 3 });
  });

  it('tela: rascunho grava como edição manual e acompanha a pergunta, sem pedir código', async () => {
    const code = `T0052D-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const dest = `${DEFAULT_OFFER_BASE_URL}/p/OFF-X0052`;
    const adName = `${code}-A`;
    const spec = {
      campaign: { name: `NORQVA_${code}`, objective: 'OUTCOME_SALES' },
      pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
      adsets: [{ name: `${code}_AS01`, daily_budget_brl: 20, targeting: { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true } }],
      ads: [{ name: adName, adset_name: `${code}_AS01`, video_url: 'TO_BE_FILLED', thumbnail_url: null, primary_text: 'Texto', headline: 'Título', cta: 'SEE_DETAILS', destination_url: dest, url_tags: urlTagsFor(code, adName) }]
    };
    const ins = await pool.query(
      `INSERT INTO launch_plans (code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES ($1, 'OFF-X0052', 'DRAFT', $2, '{}'::jsonb, 20, 160, 'Ativar a campanha X com R$ 20.00/dia e teto de R$ 160.00?') RETURNING id`,
      [code, JSON.stringify(spec)]
    );
    const id = ins.rows[0].id;
    created.push(id);
    const r = await request(app).post(`/api/launch-plans/${id}/spend-cap`).set('Authorization', `Bearer ${adminToken}`).send({ max_spend_brl: 200 });
    expect(r.status).toBe(200);
    expect(r.body.raise).toBeNull();
    const after = await row(id);
    expect(parseFloat(after.max_spend_brl)).toBe(200);
    expect(after.question_text).toBe('Ativar a campanha X com R$ 20.00/dia e teto de R$ 200.00?');
    expect(after.manual_fields).toMatchObject({ max_spend_brl: true });
  });
});
