// NORQVA-0028: campanha completa numa tela — controle só dos objetos da própria campanha,
// performance manual bloqueada nos experimentos criados pelo Sim e leitura de Campanhas para os
// perfis de análise. Nenhum teste fala com a Meta: todas as recusas acontecem antes de qualquer chamada.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0028 — campanha completa', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const rnd = () => `12${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90000 + 10000)}`;
  // Dois conjuntos de objetos "da Meta" (só no banco): campanha A e campanha B
  const A = { campaign: rnd(), adset: rnd(), ad: rnd() };
  const B = { campaign: rnd(), adset: rnd(), ad: rnd() };
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const planExpId = crypto.randomUUID();
  const legacyExpId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const accountMetaId = `act_0028_${tag}`;

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  async function mkMetaCampaign(accountId: string, ids: { campaign: string; adset: string; ad: string }, name: string) {
    const c = await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', FALSE) RETURNING id`,
      [ids.campaign, accountId, name]
    );
    const s = await pool.query(
      `INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo)
       VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', 20, FALSE) RETURNING id`,
      [ids.adset, c.rows[0].id, `${name}_AS`]
    );
    await pool.query(
      `INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', FALSE)`,
      [ids.ad, s.rows[0].id, `${name}_AD`]
    );
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
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
    adminToken = await mk('admin.norqva0028@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0028@norqva.test', 'PERFORMANCE');

    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ($1, 'Conta 0028', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [accountMetaId]
    );
    await mkMetaCampaign(acct.rows[0].id, A, `NORQVA_0028_A_${tag}`);
    await mkMetaCampaign(acct.rows[0].id, B, `NORQVA_0028_B_${tag}`);

    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo)
       VALUES ($1, $2, 'Produto 0028', 'Receitas', 'Fixture', 'PLANEJADO', FALSE)`,
      [productId, `PRD-U${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Oferta 0028', $3, 19.90, 'ATIVA', 'Fixture', FALSE)`,
      [offerId, `OFF-U${tag}`, productId]
    );
    for (const [id, hid] of [[planExpId, `EXP-P${tag}`], [legacyExpId, `EXP-L${tag}`]]) {
      await pool.query(
        `INSERT INTO experiments (id, human_id, name, hypothesis, product_id, offer_id, start_date, status, capital_requested, capital_approved, capital_used, is_demo)
         VALUES ($1, $2, 'Exp 0028', 'Hipótese', $3, $4, NOW(), 'ATIVO', 140, 140, 10, FALSE)`,
        [id, hid, productId, offerId]
      );
    }
    // Plano da campanha A, já criado na Meta e esperando o Sim, com experimento ligado
    await pool.query(
      `INSERT INTO launch_plans (id, code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, experiment_id)
       VALUES ($1, $2, $3, 'AWAITING_OPERATOR', $4, $5, 20, 140, 'Pergunta?', $6)`,
      [
        planId,
        `TST28-${tag}`,
        `OFF-U${tag}`,
        JSON.stringify({ campaign: { name: `NORQVA_0028_A_${tag}` }, adsets: [], ads: [] }),
        JSON.stringify({ campaign: { c: A.campaign }, adsets: { s: A.adset }, videos: {}, creatives: {}, ads: { a: A.ad } }),
        planExpId
      ]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE id = $1', [planId]).catch(() => {});
    await pool.query('DELETE FROM experiments WHERE id = ANY($1::uuid[])', [[planExpId, legacyExpId]]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM meta_ad_accounts WHERE meta_account_id = $1 AND is_demo = FALSE', [accountMetaId]).catch(() => {});
  });

  it('pausar pela aba da campanha A recusa campanha, conjunto e anúncio da campanha B', async () => {
    for (const [type, id] of [['campaign', B.campaign], ['adset', B.adset], ['ad', B.ad]] as const) {
      const r = await as(adminToken).post(`/api/meta-control/${type}/${id}/status`, { status: 'PAUSED', scope_campaign: A.campaign });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/não pertence a esta campanha/);
    }
  });

  it('mudar orçamento pela aba da campanha A recusa o conjunto da campanha B', async () => {
    const r = await as(adminToken).post(`/api/meta-control/adset/${B.adset}/budget`, { daily_budget: 25, scope_campaign: A.campaign });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/não pertence a esta campanha/);
    const s = await pool.query('SELECT daily_budget FROM meta_ad_sets WHERE meta_adset_id = $1', [B.adset]);
    expect(Number(s.rows[0].daily_budget)).toBe(20);
  });

  it('objeto da própria campanha passa pelo escopo (e a trava do Sim continua valendo)', async () => {
    const r = await as(adminToken).post(`/api/meta-control/ad/${A.ad}/status`, { status: 'ACTIVE', scope_campaign: A.campaign });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/espera o seu Sim/);
    const s = await as(adminToken).post(`/api/meta-control/adset/${A.adset}/status`, { status: 'ACTIVE', scope_campaign: A.campaign });
    expect(s.status).toBe(409);
    expect(s.body.error).toMatch(/espera o seu Sim/);
  });

  it('anúncio do plano ainda não sincronizado vale pelo que o plano registrou', async () => {
    const unsynced = rnd();
    await pool.query(
      `UPDATE launch_plans SET meta_ids = jsonb_set(meta_ids, '{ads,b}', to_jsonb($2::text)) WHERE id = $1`,
      [planId, unsynced]
    );
    const r = await as(adminToken).post(`/api/meta-control/ad/${unsynced}/status`, { status: 'ACTIVE', scope_campaign: A.campaign });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/espera o seu Sim/);
    const other = await as(adminToken).post(`/api/meta-control/ad/${unsynced}/status`, { status: 'ACTIVE', scope_campaign: B.campaign });
    expect(other.status).toBe(409);
    expect(other.body.error).toMatch(/não pertence a esta campanha/);
  });

  it('lançar performance à mão num experimento criado pelo Sim é recusado', async () => {
    const before = await pool.query('SELECT capital_approved, capital_used FROM experiments WHERE id = $1', [planExpId]);
    const r = await as(adminToken).post(`/api/experiments/${planExpId}/performance?mode=real`, {
      date: '2026-10-08', source: 'META', investment: 30
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/TST28-/);
    const after = await pool.query('SELECT capital_approved, capital_used FROM experiments WHERE id = $1', [planExpId]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('experimento antigo, sem campanha, não é afetado pela trava', async () => {
    const r = await as(adminToken).post(`/api/experiments/${legacyExpId}/performance?mode=real`, {
      date: '2026-10-08', source: 'META', investment: 5
    });
    expect(r.status).toBe(200);
  });

  it('perfil de análise lê a lista e a campanha, mas não altera', async () => {
    const list = await as(perfToken).get('/api/campaigns?mode=real');
    expect(list.status).toBe(200);
    expect(list.body.campaigns.some((c: any) => c.id === planId)).toBe(true);
    const one = await as(perfToken).get(`/api/campaigns/${planId}?mode=real`);
    expect(one.status).toBe(200);
    const write = await as(perfToken).post(`/api/campaigns/${planId}/fields?mode=real`, { fields: { hypothesis: 'x' } });
    expect(write.status).toBe(403);
    const pause = await as(perfToken).post(`/api/meta-control/ad/${A.ad}/status`, { status: 'PAUSED', scope_campaign: A.campaign });
    expect(pause.status).toBe(403);
  });
});
