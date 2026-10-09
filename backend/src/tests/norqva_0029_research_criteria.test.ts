// NORQVA-0029: tela Pesquisa — critérios com versões validadas pelo dono, uso da versão validada na Base,
// na seleção de candidatos e no mercado europeu, trava do "Aprovar plano" e módulo antigo sem criação nova.
// Nenhum teste fala com a Meta nem com as IAs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { CriteriaService, DEFAULT_NUMBERS, checkNumbers } from '../services/research/criteriaService';
import { scoreEntity, deriveMetrics, BaseTotals } from '../services/intelligence/campaignIntelligenceService';
import { scoreNiche } from '../services/marketIntelligence/marketEuService';
import { OpportunityService } from '../services/aiTeam/opportunityService';

const EMPTY: BaseTotals = {
  spend: 0, impressions: 0, reach: 0, link_clicks: 0, outbound_clicks: 0, landing_page_views: 0, initiate_checkouts: 0,
  meta_purchases: 0, meta_purchase_value: 0, video_3s_views: 0, thruplays: 0, video_p25: 0, video_p50: 0, video_p75: 0,
  video_p100: 0, sales: 0, revenue: 0, checkouts_norqva: 0, breakeven_weighted: 0, breakeven_spend: 0
};

describe.sequential('NORQVA-0029 — critérios da Pesquisa', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  let oppId: string;
  const service = new CriteriaService();

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query('DELETE FROM research_criteria_versions');
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, email, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    adminToken = await mk('admin.norqva0029@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0029@norqva.test', 'PERFORMANCE');
    const o = await pool.query(
      `INSERT INTO campaign_opportunities (human_id, title, source, status, ai_score, verdict, is_demo)
       VALUES ($1, 'Plano pronto 0029', 'MANUAL', 'PLANO_PRONTO', 70, 'TESTAR', FALSE) RETURNING id`,
      [`OPP-T${tag}`]
    );
    oppId = o.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM campaign_opportunities WHERE id = $1', [oppId]).catch(() => {});
    // Volta ao estado de fábrica: sem versão validada, o sistema usa os valores de sempre
    await pool.query('DELETE FROM research_criteria_versions').catch(() => {});
  });

  it('perfil de análise lê; a versão 1 nasce em rascunho com os valores de sempre', async () => {
    const r = await as(perfToken).get('/api/research/criteria');
    expect(r.status).toBe(200);
    expect(r.body.draft.version).toBe(1);
    expect(r.body.draft.numbers).toEqual(DEFAULT_NUMBERS);
    expect(r.body.effective).toMatchObject({ validated: false, version: null });
    expect(r.body.texts.validator_checks.map((c: any) => c.key)).toContain('CONTA_FECHA');
    expect(r.body.texts.ai_rules.length).toBeGreaterThan(0);
  });

  it('só ADMIN ajusta e valida', async () => {
    expect((await as(perfToken).post('/api/research/criteria/drafts', { numbers: { winner_min_sales: 4 } })).status).toBe(403);
    expect((await as(perfToken).post('/api/research/criteria/1/validate')).status).toBe(403);
  });

  it('recusa valores fora do limite ou pesos que não somam 1', async () => {
    const a = await as(adminToken).post('/api/research/criteria/drafts', { numbers: { winner_min_sales: 0 } });
    expect(a.status).toBe(400);
    const b = await as(adminToken).post('/api/research/criteria/drafts', { numbers: { eu_w_reach: 0.5 } });
    expect(b.status).toBe(400);
    expect(b.body.error).toMatch(/somar 1/);
    const c = await as(adminToken).post('/api/research/criteria/drafts', { numbers: { inventado: 1 } });
    expect(c.status).toBe(400);
    expect(() => checkNumbers({ winner_cpa_ratio: 1.2, promising_cpa_ratio: 1 })).toThrow(/vencedor/);
  });

  it('sem critério validado, aprovar plano na conta real é recusado', async () => {
    const r = await as(adminToken).post(`/api/ai-team/opportunities/${oppId}/decision?mode=real`, { decision: 'APROVADA' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/não foram validados/);
    const row = await pool.query('SELECT status FROM campaign_opportunities WHERE id = $1', [oppId]);
    expect(row.rows[0].status).toBe('PLANO_PRONTO');
  });

  it('ajuste vira rascunho novo; só ele pode ser validado e passa a valer', async () => {
    const d = await as(adminToken).post('/api/research/criteria/drafts', { numbers: { winner_min_sales: 4, shortlist_min_spend: 25 }, note: 'teste' });
    expect(d.status).toBe(201);
    expect(d.body).toMatchObject({ version: 2, status: 'DRAFT' });
    expect((await service.effective(pool)).validated).toBe(false);

    const old = await as(adminToken).post('/api/research/criteria/1/validate');
    expect(old.status).toBe(409);

    const v = await as(adminToken).post('/api/research/criteria/2/validate');
    expect(v.status).toBe(200);
    expect(v.body.status).toBe('VALIDATED');
    const eff = await service.effective(pool);
    expect(eff).toMatchObject({ validated: true, version: 2 });
    expect(eff.numbers.winner_min_sales).toBe(4);

    const again = await as(adminToken).post('/api/research/criteria/2/validate');
    expect(again.status).toBe(409);
  });

  it('a Base e a seleção de candidatos usam a versão validada', async () => {
    const base = await as(perfToken).get('/api/intelligence/campaign-base?mode=real&level=campaign');
    expect(base.status).toBe(200);
    expect(base.body.criteria).toEqual({ version: 2, validated: true });
    const sl = await as(perfToken).get('/api/intelligence/shortlist?mode=real');
    expect(sl.status).toBe(200);
    expect(sl.body.criteria.min_spend).toBe(25);
    // ajuste feito só na tela continua valendo para aquela consulta
    const custom = await as(perfToken).get('/api/intelligence/shortlist?mode=real&min_spend=7');
    expect(custom.body.criteria.min_spend).toBe(7);
  });

  it('as regras de classe e de nicho seguem os números recebidos', () => {
    const t = { ...EMPTY, spend: 30, sales: 3, revenue: 60, impressions: 3000, link_clicks: 60, breakeven_weighted: 30 * 20, breakeven_spend: 30 };
    const q = { ctrPct: 0.5, hookPct: 0.5 };
    expect(scoreEntity(t, deriveMetrics(t), q).classification).toBe('VENCEDOR');
    expect(scoreEntity(t, deriveMetrics(t), q, 1, { ...DEFAULT_NUMBERS, winner_min_sales: 4 }).classification).toBe('PROMISSOR');
    const stats = { ads_total: 20, active_ads: 15, advertisers: 30, long_runners: 50, total_reach: 10_000_000, new_ads_7d: 20, reach_growth_7d: 0 };
    expect(scoreNiche(stats).classification).toBe('VALIDADO');
    expect(scoreNiche({ ...stats, ads_total: 6 }, { ...DEFAULT_NUMBERS, eu_min_ads: 10 }).classification).toBe('SEM_DADOS');
  });

  it('a avaliação guarda a versão dos critérios em vigor', async () => {
    const o = await pool.query(
      `INSERT INTO campaign_opportunities (human_id, title, source, status, is_demo) VALUES ($1, 'Avaliar 0029', 'MANUAL', 'EM_AVALIACAO', FALSE) RETURNING id`,
      [`OPP-E${tag}`]
    );
    try {
      const out = await new OpportunityService().reportEvaluation(pool, o.rows[0].id, { score: 60, verdict: 'TESTAR', summary: 'ok' });
      expect(out.criteria_version).toBe(2);
      expect((typeof out.evaluation === 'string' ? JSON.parse(out.evaluation) : out.evaluation).criteria_version).toBe(2);
    } finally {
      await pool.query('DELETE FROM campaign_opportunities WHERE id = $1', [o.rows[0].id]);
    }
  });

  it('se o texto validado mudar, aprovar volta a travar até nova validação', async () => {
    await pool.query(`UPDATE research_criteria_versions SET texts_hash = 'texto-antigo' WHERE version = 2`);
    const eff = await service.effective(pool);
    expect(eff).toMatchObject({ validated: false, texts_changed: true, version: 2 });
    expect(eff.numbers.winner_min_sales).toBe(4);
    const r = await as(adminToken).post(`/api/ai-team/opportunities/${oppId}/decision?mode=real`, { decision: 'APROVADA' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/mudaram/);

    // rascunho com texto antigo não pode ser validado
    const d = await as(adminToken).post('/api/research/criteria/drafts', {});
    expect(d.status).toBe(201);
    await pool.query(`UPDATE research_criteria_versions SET texts_hash = 'outro' WHERE version = $1`, [d.body.version]);
    expect((await as(adminToken).post(`/api/research/criteria/${d.body.version}/validate`)).status).toBe(409);

    const fresh = await as(adminToken).post('/api/research/criteria/drafts', {});
    expect((await as(adminToken).post(`/api/research/criteria/${fresh.body.version}/validate`)).status).toBe(200);
  });

  it('com critério validado, o plano pode ser aprovado', async () => {
    const r = await as(adminToken).post(`/api/ai-team/opportunities/${oppId}/decision?mode=real`, { decision: 'APROVADA' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('APROVADA');
  });

  it('nenhuma versão é apagada', async () => {
    const r = await pool.query('SELECT version, status FROM research_criteria_versions ORDER BY version');
    expect(r.rows.map((x: any) => x.version)).toEqual([1, 2, 3, 4]);
    expect(r.rows.filter((x: any) => x.status === 'VALIDATED')).toHaveLength(1);
  });

  it('o módulo antigo não cria oportunidade nova', async () => {
    const r = await as(adminToken).post('/api/opportunities?mode=real', { title: 'x' });
    expect(r.status).toBe(410);
    expect(r.body.error).toMatch(/Pesquisa/);
  });

  it('OPERATIONS lê a lista de oportunidades da Pesquisa', async () => {
    const tok = signSupabaseToken({
      sub: (
        await pool.query(
          `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'ops.norqva0029@norqva.test', 'ops', 'OPERATIONS', 'ACTIVE')
           ON CONFLICT (email) DO UPDATE SET role = 'OPERATIONS', status = 'ACTIVE' RETURNING auth_user_id`,
          [crypto.randomUUID()]
        )
      ).rows[0].auth_user_id,
      email: 'ops.norqva0029@norqva.test',
      role: 'OPERATIONS'
    });
    expect((await as(tok).get('/api/ai-team/opportunities?mode=real')).status).toBe(200);
    expect((await as(tok).post('/api/research/criteria/drafts', {})).status).toBe(403);
  });
});
