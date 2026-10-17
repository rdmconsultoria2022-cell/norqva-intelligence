// NORQVA-0094: correções de segurança em Campanhas. Graph API simulada: nunca fala com a Meta.
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { setMetaControlClientFactoryForTesting } from '../controllers/metaControlController';

describe.sequential('NORQVA-0094 — segurança em Campanhas', () => {
  let pool: Pool;
  let adminToken: string;
  let accountDbId: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const planIds: string[] = [];
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_MAX_DAILY_BUDGET_BRL'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

  const goodGet = () =>
    vi.fn(async (endpoint: string) => {
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      throw new Error('unexpected ' + endpoint);
    });

  const post = (url: string, body: any) => request(app).post(url).set('Authorization', `Bearer ${adminToken}`).send(body);

  // Plano ACTIVE com uma campanha e dois conjuntos (R$ 10 + R$ 10 por dia) já sincronizados.
  const seedPlan = async (opts: { guardState?: string | null; spent?: number | null } = {}) => {
    const n = planIds.length + 1;
    const code = `T94${tag}${n}`;
    const cmpDb = crypto.randomUUID();
    const cmpMeta = `cmp94_${crypto.randomUUID().slice(0, 8)}`;
    const setA = crypto.randomUUID();
    const setAMeta = `set94a_${crypto.randomUUID().slice(0, 8)}`;
    const setBMeta = `set94b_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'ACTIVE', FALSE)`,
      [cmpDb, cmpMeta, accountDbId, `${code} | campanha`]
    );
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo)
       VALUES ($1, $2, $3, 'Conj A', 'ACTIVE', 'ACTIVE', 10, FALSE)`,
      [setA, setAMeta, cmpDb]
    );
    const spec = { campaign: { name: `${code} | campanha` }, adsets: [{ name: 'Conj A', daily_budget_brl: 10 }, { name: 'Conj B', daily_budget_brl: 10 }], ads: [] };
    const metaIds = { campaign: { [`${code} | campanha`]: cmpMeta }, adsets: { 'Conj A': setAMeta, 'Conj B': setBMeta }, ads: {} };
    const r = await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, guard_state, spent_brl_last)
       VALUES ($1, 'ACTIVE', $2, $3, 20, 100, 'teste 0094', $4, $5) RETURNING id`,
      [code, JSON.stringify(spec), JSON.stringify(metaIds), opts.guardState ?? null, opts.spent ?? null]
    );
    planIds.push(r.rows[0].id);
    return { planId: r.rows[0].id as string, code, cmpMeta, setAMeta };
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), gen_random_uuid(), 'admin.norqva0094@norqva.test', 'Admin 0094', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING auth_user_id, email`
    );
    adminToken = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    delete process.env.META_MAX_DAILY_BUDGET_BRL;
    resetMetaPreflightCacheForTesting();
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ('act_norqva_0094', 'NORQVA 0094', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    accountDbId = acct.rows[0].id;
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(vi.fn().mockResolvedValue({ success: true }), undefined, goodGet()));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setMetaControlClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE id = ANY($1::uuid[])', [planIds]).catch(() => {});
  });

  it('rota antiga de troca de link está desligada', async () => {
    const r = await post('/api/meta/migrate-destination-url', {});
    expect(r.status).toBe(410);
  });

  it('pausar a campanha marca o plano; reativar pede o código do plano', async () => {
    const p = await seedPlan();
    const paused = await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'PAUSED' });
    expect(paused.status).toBe(200);
    expect(paused.body.plan_paused).toBe(p.code);
    const row = await pool.query('SELECT operator_paused_at FROM launch_plans WHERE id = $1', [p.planId]);
    expect(row.rows[0].operator_paused_at).not.toBeNull();

    const noCode = await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'ACTIVE' });
    expect(noCode.status).toBe(409);
    expect(noCode.body.needs_confirm_code).toBe(p.code);
    expect(noCode.body.error).toContain(`digite o código ${p.code}`);

    // o mesmo pedido com o ID interno da campanha também pede o código
    const cmpRow = await pool.query('SELECT id FROM meta_campaigns WHERE meta_campaign_id = $1', [p.cmpMeta]);
    const byUuid = await post(`/api/meta-control/campaign/${cmpRow.rows[0].id}/status`, { status: 'ACTIVE' });
    expect(byUuid.status).toBe(409);
    expect(byUuid.body.needs_confirm_code).toBe(p.code);

    const wrong = await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'ACTIVE', confirm_code: 'ERRADO' });
    expect(wrong.status).toBe(409);

    const ok = await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'ACTIVE', confirm_code: p.code.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.body.plan_resumed).toBe(p.code);
    const after = await pool.query('SELECT operator_paused_at FROM launch_plans WHERE id = $1', [p.planId]);
    expect(after.rows[0].operator_paused_at).toBeNull();
    const log = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'LAUNCH_PLAN_RESUMED_BY_OPERATOR' AND description LIKE $1`, [`%${p.code}%`]);
    expect(log.rows.length).toBe(1);
  });

  it('com o teto já gasto, nem o código reativa', async () => {
    const p = await seedPlan({ spent: 100 });
    expect((await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'PAUSED' })).status).toBe(200);
    const r = await post(`/api/meta-control/campaign/${p.cmpMeta}/status`, { status: 'ACTIVE', confirm_code: p.code });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/teto/);
  });

  it('orçamento do conjunto atualiza o plano para o vigia projetar certo', async () => {
    const p = await seedPlan();
    const r = await post(`/api/meta-control/adset/${p.setAMeta}/budget`, { daily_budget: 15 });
    expect(r.status).toBe(200);
    expect(r.body.plan_daily_budget).toBe(25);
    const row = await pool.query('SELECT daily_budget_brl, spec FROM launch_plans WHERE id = $1', [p.planId]);
    expect(parseFloat(row.rows[0].daily_budget_brl)).toBe(25);
    expect(row.rows[0].spec.adsets.find((a: any) => a.name === 'Conj A').daily_budget_brl).toBe(15);
  });

  it('plano que bateu o teto não muda orçamento por aqui', async () => {
    const p = await seedPlan({ guardState: 'CAPPED' });
    const r = await post(`/api/meta-control/adset/${p.setAMeta}/budget`, { daily_budget: 30 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/teto/);
    const row = await pool.query('SELECT daily_budget_brl FROM launch_plans WHERE id = $1', [p.planId]);
    expect(parseFloat(row.rows[0].daily_budget_brl)).toBe(20);
  });
});
