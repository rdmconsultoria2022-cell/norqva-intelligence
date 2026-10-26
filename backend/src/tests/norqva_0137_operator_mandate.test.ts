// NORQVA-0137: mandato do operador. Meta (leitura e escrita) simulada: nunca fala com a Meta, o Asaas ou o Supabase.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { setMetaControlClientFactoryForTesting } from '../controllers/metaControlController';
import {
  maxCpa,
  judgeMandate,
  judgeIncrease,
  isQuietHours,
  setMandateReaderForTesting,
  setMandateClockForTesting,
  MandateService
} from '../services/operator/mandateService';
import { spClock } from '../services/campaigns/nightPauseService';

describe('NORQVA-0137 — regras puras', () => {
  it('CPA máximo = preço − 6% − R$ 1,99', () => {
    expect(maxCpa(29.9)).toBe(26.12);
    expect(maxCpa(47)).toBe(42.19);
    expect(maxCpa(19.9)).toBe(16.72);
  });

  it('freio: prazo, capital, prejuízo e gasto sem tração', () => {
    const m = { capital_brl: 1500, brake_spend_brl: 750, brake_loss_brl: 750, min_sales: 5, ends_at: new Date(Date.now() + 86400000).toISOString() };
    expect(judgeMandate(m, { spent: 700, result: -700, any_offer_qualifies: false }).stop).toBe(false);
    expect(judgeMandate(m, { spent: 750, result: -100, any_offer_qualifies: false })).toMatchObject({ stop: true, status: 'BRAKED', code: 'SEM_TRACAO' });
    expect(judgeMandate(m, { spent: 900, result: -100, any_offer_qualifies: true }).stop).toBe(false);
    expect(judgeMandate(m, { spent: 800, result: -750, any_offer_qualifies: true })).toMatchObject({ stop: true, code: 'PREJUIZO' });
    expect(judgeMandate(m, { spent: 1500, result: 300, any_offer_qualifies: true })).toMatchObject({ stop: true, code: 'CAPITAL' });
    expect(judgeMandate({ ...m, ends_at: new Date(Date.now() - 1000).toISOString() }, null)).toMatchObject({ stop: true, status: 'ENDED', code: 'PRAZO' });
  });

  it('subida: 48 h, no máximo +20% e 5 vendas com CPA ≤ 80% do máximo nos últimos 3 dias', () => {
    const base = { previous: 50, next: 60, hoursSinceLastIncrease: null, recent: { sales: 5, spend: 100 }, maxCpa: 26.12 };
    expect(judgeIncrease(base)).toBeNull(); // CPA 20 ≤ 20,90
    expect(judgeIncrease({ ...base, next: 60.01 })).toMatch(/20%/);
    expect(judgeIncrease({ ...base, hoursSinceLastIncrease: 47 })).toMatch(/48 h/);
    expect(judgeIncrease({ ...base, hoursSinceLastIncrease: 49 })).toBeNull();
    expect(judgeIncrease({ ...base, recent: { sales: 4, spend: 40 } })).toMatch(/4 venda/);
    expect(judgeIncrease({ ...base, recent: { sales: 5, spend: 110 } })).toMatch(/CPA dos últimos 3 dias/);
    expect(judgeIncrease({ ...base, maxCpa: null })).toMatch(/oferta/);
    expect(judgeIncrease({ ...base, recent: { sales: 5, spend: null } })).toMatch(/gasto/);
  });

  it('janela da noite (22h às 8h, Brasília)', () => {
    expect(isQuietHours(new Date('2026-10-26T01:30:00Z'))).toBe(true); // 22h30
    expect(isQuietHours(new Date('2026-10-26T10:59:00Z'))).toBe(true); // 07h59
    expect(isQuietHours(new Date('2026-10-26T11:00:00Z'))).toBe(false); // 08h00
    expect(isQuietHours(new Date('2026-10-26T00:59:00Z'))).toBe(false); // 21h59
  });
});

describe.sequential('NORQVA-0137 — mandato do operador (HTTP)', () => {
  let pool: Pool;
  let admin: string;
  let accountDbId: string;
  let offerHuman: string;
  let customerId: string;
  const TOKEN = 'op-' + crypto.randomBytes(24).toString('hex');
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_MAX_DAILY_BUDGET_BRL', 'NORQVA_OPERATOR_TOKEN'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const onMeta = new Map<string, { status?: string; daily_budget?: number | null }>();
  const spend = new Map<string, number>();
  let post: ReturnType<typeof vi.fn>;
  // meio-dia em Brasília do dia de hoje
  const noon = () => new Date(`${spClock(new Date()).date}T12:00:00-03:00`);

  const get = () =>
    vi.fn(async (endpoint: string) => {
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      const obj = onMeta.get(endpoint.slice(1));
      if (obj) return { status: obj.status, effective_status: obj.status, daily_budget: obj.daily_budget === null || obj.daily_budget === undefined ? undefined : String(obj.daily_budget * 100) };
      throw new Error('unexpected ' + endpoint);
    });

  const op = (token = TOKEN) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('x-norqva-operator', token).send(body)
  });
  const as = (t: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${t}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${t}`).send(body),
    put: (url: string, body: any = {}) => request(app).put(url).set('Authorization', `Bearer ${t}`).send(body)
  });

  const digits = () => `9${Date.now()}${Math.floor(Math.random() * 1e5)}`.slice(0, 18);

  /** Campanha com um conjunto (orçamento no conjunto, ABO). */
  const seed = async (opts: { campaignStatus?: string; adsetBudget?: number; adsetStatus?: string } = {}) => {
    const cmpDb = crypto.randomUUID();
    const cmp = digits();
    const set = digits();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, $4, $5, $5, FALSE)`,
      [cmpDb, cmp, accountDbId, `Trattoria 0137 ${cmp.slice(-4)}`, opts.campaignStatus || 'ACTIVE']
    );
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo)
       VALUES (gen_random_uuid(), $1, $2, 'Conjunto 0137', $3, $3, $4, FALSE)`,
      [set, cmpDb, opts.adsetStatus || 'ACTIVE', opts.adsetBudget ?? 30]
    );
    onMeta.set(cmp, { status: opts.campaignStatus || 'ACTIVE' });
    onMeta.set(set, { status: opts.adsetStatus || 'ACTIVE', daily_budget: opts.adsetBudget ?? 30 });
    spend.set(cmp, 0);
    return { cmp, set };
  };

  /** Venda paga confirmada pelo Asaas atribuída à campanha (utm_campaign = ID da campanha). */
  const sale = async (cmp: string, amount = 29.9) => {
    const o = await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, utm_source, utm_campaign, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'PAID', FALSE, 'COMMERCIAL_PRODUCTION', $3, 'meta', $4, NOW(), NOW()) RETURNING id`,
      [customerId, amount, `idem-0137-${crypto.randomUUID()}`, cmp]
    );
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, provider_fee, confirmed_at, idempotency_key, external_reference, data_provenance, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ASAAS', 'CONFIRMED', $3, 1.99, NOW(), $4, $5, 'COMMERCIAL_PRODUCTION', NOW(), NOW())`,
      [`PAY-0137-${crypto.randomUUID().slice(0, 8)}`, o.rows[0].id, amount, `idem-pay-0137-${crypto.randomUUID()}`, `ext-0137-${crypto.randomUUID()}`]
    );
  };

  const createMandate = async (campaigns: any[]) => {
    const r = await as(admin).post('/api/mandate?mode=real', { campaigns });
    expect(r.status).toBe(201);
    return r.body.mandate;
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.mandate0137@norqva.test', 'Ricardo 0137', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Trattoria 0137', 'Receitas', 'Fixture', 'PLANEJADO', true)`,
      [productId, `PRD-0137-${productId.slice(0, 6)}`]
    );
    offerHuman = `OFF-0137-${productId.slice(0, 6)}`;
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES (gen_random_uuid(), $1, 'Trattoria 0137', $2, 29.90, 'ATIVA', 'Fixture', true)`,
      [offerHuman, productId]
    );
    customerId = (await pool.query(`INSERT INTO customers (id, email, name) VALUES (gen_random_uuid(), $1, 'Comprador 0137') RETURNING id`, [`c0137.${crypto.randomUUID().slice(0, 6)}@example.com`])).rows[0].id;
  });

  beforeEach(async () => {
    resetAllRateLimits();
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    process.env.NORQVA_OPERATOR_TOKEN = TOKEN;
    delete process.env.META_MAX_DAILY_BUDGET_BRL;
    resetMetaPreflightCacheForTesting();
    await pool.query(`UPDATE operator_mandates SET status = 'ENDED', pause_pending = FALSE WHERE status <> 'ENDED'`);
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ('act_norqva_0137', 'NORQVA 0137', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    accountDbId = acct.rows[0].id;
    post = vi.fn(async (endpoint: string, body: any) => {
      const id = endpoint.slice(1);
      const cur = onMeta.get(id) || {};
      if (body?.status) cur.status = body.status;
      if (body?.daily_budget) cur.daily_budget = Number(body.daily_budget) / 100;
      onMeta.set(id, cur);
      return { success: true };
    });
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post as any, undefined, get()));
    setMandateReaderForTesting(() => ({
      spendBetween: async (id: string) => spend.get(id) ?? 0,
      adInsightsDaily: async (id: string) => ({
        rows: [{ campaign_id: id, adset_id: 'S1', adset_name: 'Conjunto', ad_id: 'A1', ad_name: 'Anúncio', date_start: spClock(noon()).date, spend: String(spend.get(id) ?? 0), impressions: '1000', clicks: '40', inline_link_clicks: '30', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }] }],
        truncated: false
      }),
      hourly: async () => [{ hourly_stats_aggregated_by_advertiser_time_zone: '12:00:00 - 12:59:59', spend: '5.00', impressions: '100', clicks: '4' }]
    }));
    setMandateClockForTesting(noon);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setMetaControlClientFactoryForTesting(null);
    setMandateReaderForTesting(null);
    setMandateClockForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  // ------------------------------ autenticação ------------------------------

  it('sem a chave no servidor: 503 operador desligado', async () => {
    delete process.env.NORQVA_OPERATOR_TOKEN;
    const r = await op().get('/api/operator/mandate');
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/Operador desligado/);
  });

  it('sem token ou com token errado: 401; o token do operador não abre rotas de administrador', async () => {
    expect((await request(app).get('/api/operator/mandate')).status).toBe(401);
    expect((await op('errado-' + TOKEN).get('/api/operator/mandate')).status).toBe(401);
    expect((await op('x').post('/api/operator/campaign/123456/status', { status: 'PAUSED' })).status).toBe(401);
    const adminRoute = await op().get('/api/mandate?mode=real');
    expect([401, 403]).toContain(adminRoute.status);
    const metaControl = await request(app).post('/api/meta-control/campaign/123456/status').set('Authorization', `Bearer ${TOKEN}`).send({ status: 'PAUSED' });
    expect([401, 403]).toContain(metaControl.status);
  });

  it('administrador cria o mandato; operador lê situação, capital e campanhas', async () => {
    const { cmp } = await seed();
    await createMandate([{ meta_campaign_id: cmp, offer_human_id: offerHuman }]);
    spend.set(cmp, 120);
    const r = await op().get('/api/operator/mandate');
    expect(r.status).toBe(200);
    expect(r.body.mandate).toMatchObject({ status: 'ACTIVE', capital_brl: 1500, daily_cap_brl: 100, spent_brl: 120, remaining_brl: 1380, result_brl: -120 });
    expect(r.body.mandate.brake.state).toBe('LIVRE');
    expect(r.body.mandate.campaigns[0]).toMatchObject({ meta_campaign_id: cmp, offer_human_id: offerHuman, max_cpa: 26.12 });
    // só um mandato em vigor
    expect((await as(admin).post('/api/mandate?mode=real', { campaigns: [cmp] })).status).toBe(409);
  });

  it('relatório separa números da Meta e vendas confirmadas pelo Asaas', async () => {
    const { cmp } = await seed();
    await createMandate([{ meta_campaign_id: cmp, offer_human_id: offerHuman }]);
    spend.set(cmp, 40);
    await sale(cmp);
    const r = await op().get('/api/operator/report?days=3');
    expect(r.status).toBe(200);
    const c = r.body.campaigns[0];
    expect(c.meta).toMatchObject({ spend: 40, impressions: 1000, conversations: 3 });
    expect(c.confirmed.paid_sales).toBe(1);
    expect(c.confirmed.net_revenue).toBe(26.12);
    expect(c).toMatchObject({ cpa: 40, max_cpa: 26.12, cpa_within_max: false });
    expect(c.by_hour[0]).toMatchObject({ hour: '12:00', spend: 5 });
    expect(r.body.sources.confirmed).toMatch(/Asaas/);
  });

  // ------------------------------ regras ------------------------------

  it('campanha fora do mandato é recusada; pausa de campanha do mandato passa e fica registrada', async () => {
    const a = await seed();
    const b = await seed();
    await createMandate([a.cmp]);
    const out = await op().post(`/api/operator/campaign/${b.cmp}/status`, { status: 'PAUSED' });
    expect(out.status).toBe(403);
    expect(out.body.error).toMatch(/não está no mandato/);
    const ok = await op().post(`/api/operator/campaign/${a.cmp}/status`, { status: 'PAUSED' });
    expect(ok.status).toBe(200);
    expect(ok.body.change.state).toBe('CONFIRMED');
    expect(onMeta.get(a.cmp)?.status).toBe('PAUSED');
    const ficha = await pool.query(`SELECT origin FROM meta_change_requests WHERE meta_id = $1 ORDER BY created_at DESC LIMIT 1`, [a.cmp]);
    expect(ficha.rows[0].origin).toBe('OPERATOR');
    const log = await as(admin).get('/api/mandate/actions?mode=real');
    expect(log.body.actions.map((x: any) => x.outcome)).toEqual(expect.arrayContaining(['DONE', 'REFUSED']));
  });

  it('teto diário: ativar ou subir acima de R$ 100 somando as campanhas é recusado', async () => {
    const a = await seed({ adsetBudget: 60 });
    const b = await seed({ adsetBudget: 50, adsetStatus: 'PAUSED' });
    await createMandate([a.cmp, b.cmp]);
    const r = await op().post(`/api/operator/adset/${b.set}/status`, { status: 'ACTIVE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/teto do mandato/);
    expect(post).not.toHaveBeenCalled();
    // baixar sempre pode (de dia)
    const down = await op().post(`/api/operator/adset/${a.set}/budget`, { daily_budget_brl: 40 });
    expect(down.status).toBe(200);
    expect(onMeta.get(a.set)?.daily_budget).toBe(40);
    const act = await op().post(`/api/operator/adset/${b.set}/status`, { status: 'ACTIVE' });
    expect(act.status).toBe(200);
  });

  it('subir orçamento: precisa de vendas com CPA ≤ 80% do máximo, até +20% e 48 h entre subidas', async () => {
    const { cmp, set } = await seed({ adsetBudget: 30 });
    await createMandate([{ meta_campaign_id: cmp, offer_human_id: offerHuman }]);
    spend.set(cmp, 100);
    const noSales = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 36 });
    expect(noSales.status).toBe(409);
    expect(noSales.body.error).toMatch(/venda/);
    for (let i = 0; i < 5; i++) await sale(cmp); // CPA 100/5 = 20 ≤ 20,90
    const tooMuch = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 36.5 });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error).toMatch(/20%/);
    const ok = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 36 });
    expect(ok.status).toBe(200);
    expect(onMeta.get(set)?.daily_budget).toBe(36);
    const again = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 40 });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/48 h/);
  });

  it('CPA recente acima de 80% do máximo não deixa subir', async () => {
    const { cmp, set } = await seed({ adsetBudget: 30 });
    await createMandate([{ meta_campaign_id: cmp, offer_human_id: offerHuman }]);
    spend.set(cmp, 110); // 110/5 = 22 > 20,90
    for (let i = 0; i < 5; i++) await sale(cmp);
    const r = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 33 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/80%/);
  });

  it('das 22h às 8h só pausar', async () => {
    const { cmp, set } = await seed({ adsetBudget: 30 });
    await createMandate([cmp]);
    setMandateClockForTesting(() => new Date(`${spClock(new Date()).date}T23:10:00-03:00`));
    const r = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 20 });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/22h às 8h/);
    const p = await op().post(`/api/operator/adset/${set}/status`, { status: 'PAUSED' });
    expect(p.status).toBe(200);
  });

  it('freio: gasto ≥ R$ 750 sem oferta com tração pausa tudo, abre aviso e recusa ativar; pausar continua', async () => {
    const a = await seed();
    const b = await seed();
    await createMandate([{ meta_campaign_id: a.cmp, offer_human_id: offerHuman }, b.cmp]);
    spend.set(a.cmp, 500);
    spend.set(b.cmp, 255);
    await sale(b.cmp); // resultado −728,88: não é prejuízo; é gasto sem tração (a oferta da A não vendeu)
    const r = await op().post(`/api/operator/adset/${a.set}/status`, { status: 'ACTIVE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/freio/i);
    expect(onMeta.get(a.cmp)?.status).toBe('PAUSED');
    expect(onMeta.get(b.cmp)?.status).toBe('PAUSED');
    const m = await pool.query(`SELECT status, stop_code, pause_pending FROM operator_mandates WHERE status <> 'ENDED' ORDER BY created_at DESC LIMIT 1`);
    expect(m.rows[0]).toMatchObject({ status: 'BRAKED', stop_code: 'SEM_TRACAO', pause_pending: false });
    const alert = await pool.query(`SELECT 1 FROM ad_alerts WHERE rule_code = 'MANDATE_BRAKED' AND status = 'OPEN' AND dismissed_at IS NULL`);
    expect(alert.rows.length).toBeGreaterThan(0);
    const pause = await op().post(`/api/operator/adset/${a.set}/status`, { status: 'PAUSED' });
    expect(pause.status).toBe(200);
  });

  it('freio pelo agendador: prejuízo acumulado ≤ −R$ 750', async () => {
    const { cmp } = await seed();
    await createMandate([{ meta_campaign_id: cmp, offer_human_id: offerHuman }]);
    spend.set(cmp, 760);
    for (let i = 0; i < 5; i++) await sale(cmp); // 5 vendas mas CPA 152: sem tração e prejuízo
    const r = await new MandateService(pool).check(noon());
    expect(r.verdict).toMatchObject({ stop: true, status: 'BRAKED' });
    expect(['PREJUIZO', 'SEM_TRACAO']).toContain(r.verdict?.code);
    expect(onMeta.get(cmp)?.status).toBe('PAUSED');
  });

  it('leitura da Meta falhando: só pausar', async () => {
    const { cmp, set } = await seed();
    await createMandate([cmp]);
    setMandateReaderForTesting(() => ({
      spendBetween: async () => {
        throw new Error('[META TIMEOUT EXCEPTION]: x');
      },
      adInsightsDaily: async () => ({ rows: [], truncated: false }),
      hourly: async () => []
    }));
    const r = await op().post(`/api/operator/adset/${set}/budget`, { daily_budget_brl: 20 });
    expect(r.status).toBe(503);
    const p = await op().post(`/api/operator/campaign/${cmp}/status`, { status: 'PAUSED' });
    expect(p.status).toBe(200);
  });

  it('Encerrar mandato pede ENCERRAR, pausa as campanhas e encerra', async () => {
    const { cmp } = await seed();
    await createMandate([cmp]);
    expect((await as(admin).post('/api/mandate/end?mode=real', {})).status).toBe(400);
    const r = await as(admin).post('/api/mandate/end?mode=real', { confirm: 'ENCERRAR' });
    expect(r.status).toBe(200);
    expect(r.body.mandate.status).toBe('ENDED');
    expect(onMeta.get(cmp)?.status).toBe('PAUSED');
    const after = await op().post(`/api/operator/campaign/${cmp}/status`, { status: 'ACTIVE' });
    expect(after.status).toBe(409);
  });

  it('administrador troca a lista de campanhas; ID desconhecido é recusado', async () => {
    const a = await seed();
    const b = await seed();
    await createMandate([a.cmp]);
    const bad = await as(admin).put('/api/mandate/campaigns?mode=real', { campaigns: ['123456789012'] });
    expect(bad.status).toBe(400);
    const ok = await as(admin).put('/api/mandate/campaigns?mode=real', { campaigns: [b.cmp] });
    expect(ok.status).toBe(200);
    expect(ok.body.mandate.campaigns.map((c: any) => c.meta_campaign_id)).toEqual([b.cmp]);
    const out = await op().post(`/api/operator/campaign/${a.cmp}/status`, { status: 'PAUSED' });
    expect(out.status).toBe(403);
  });

  // ------------------------------ correções da revisão independente ------------------------------

  it('orçamento total (ou conjunto sem orçamento diário) bloqueia ativar e subir: o teto não pode ser conferido', async () => {
    const a = await seed({ adsetBudget: 20 });
    const lifeDb = crypto.randomUUID();
    const life = digits();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, lifetime_budget, is_demo)
       VALUES ($1, $2, $3, 'Campanha orçamento total', 'PAUSED', 'PAUSED', 500, FALSE)`,
      [lifeDb, life, accountDbId]
    );
    onMeta.set(life, { status: 'PAUSED' });
    spend.set(life, 0);
    await createMandate([a.cmp, life]);
    const r = await op().post(`/api/operator/campaign/${life}/status`, { status: 'ACTIVE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/orçamento total/);
    expect(post).not.toHaveBeenCalled();

    // conjunto ativo sem orçamento diário (não sincronizado): também recusa
    const b = await seed({ adsetBudget: 20 });
    await pool.query(`UPDATE meta_ad_sets SET daily_budget = NULL WHERE meta_adset_id = $1`, [b.set]);
    await as(admin).put('/api/mandate/campaigns?mode=real', { campaigns: [a.cmp, b.cmp] });
    const up = await op().post(`/api/operator/campaign/${a.cmp}/status`, { status: 'ACTIVE' });
    expect(up.status).toBe(409);
    expect(up.body.error).toMatch(/sem orçamento diário/);
  });

  it('corrida: mandato freado depois da conferência e antes da trava → ativar é recusado', async () => {
    const { cmp, set } = await seed({ adsetStatus: 'PAUSED' });
    await createMandate([cmp]);
    const stale = (await pool.query(`SELECT * FROM operator_mandates WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`)).rows[0];
    await pool.query(`UPDATE operator_mandates SET status = 'BRAKED', stop_reason = 'teste de corrida' WHERE id = $1`, [stale.id]);
    const spy = vi.spyOn(MandateService.prototype, 'check').mockImplementation(async () => ({ mandate: stale, snapshot: { spent: 0, campaigns: [] }, error: null, verdict: null }));
    try {
      const r = await op().post(`/api/operator/adset/${set}/status`, { status: 'ACTIVE' });
      expect(r.status).toBe(409);
      expect(r.body.error).toMatch(/freio/i);
      expect(post).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('tirar campanha da lista não devolve capital: o gasto dela até sair continua contando para o freio', async () => {
    const a = await seed();
    const b = await seed();
    await createMandate([{ meta_campaign_id: a.cmp, offer_human_id: offerHuman }, b.cmp]);
    spend.set(a.cmp, 400);
    spend.set(b.cmp, 400);
    await as(admin).put('/api/mandate/campaigns?mode=real', { campaigns: [{ meta_campaign_id: a.cmp, offer_human_id: offerHuman }] });
    const r = await new MandateService(pool).check(noon());
    expect(r.snapshot?.spent).toBe(800);
    expect(r.verdict).toMatchObject({ stop: true, status: 'BRAKED' });
  });

  it('campanha de plano pausada pelo operador: o operador reativa sem o código (mandato ativo); a tela continua pedindo o código', async () => {
    const { cmp, set } = await seed();
    const code = `T137-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES ($1, 'ACTIVE', $2, $3, 30, 300, 'teste 0137')`,
      [code, JSON.stringify({ campaign: { name: code }, adsets: [{ name: 'Conj', daily_budget_brl: 30 }], ads: [] }), JSON.stringify({ campaign: { [code]: cmp }, adsets: { Conj: set }, ads: {} })]
    );
    await createMandate([cmp]);
    expect((await op().post(`/api/operator/campaign/${cmp}/status`, { status: 'PAUSED' })).status).toBe(200);
    const paused = await pool.query(`SELECT operator_paused_at FROM launch_plans WHERE code = $1`, [code]);
    expect(paused.rows[0].operator_paused_at).not.toBeNull();

    const screen = await as(admin).post(`/api/meta-control/campaign/${cmp}/status?mode=real`, { status: 'ACTIVE' });
    expect(screen.status).toBe(409);
    expect(screen.body.needs_confirm_code).toBe(code);

    const r = await op().post(`/api/operator/campaign/${cmp}/status`, { status: 'ACTIVE' });
    expect(r.status).toBe(200);
    expect(onMeta.get(cmp)?.status).toBe('ACTIVE');
  });

  it('aviso de leitura falhando abre a partir da 3.ª falha (inclusive depois dela)', async () => {
    const { cmp } = await seed();
    await createMandate([cmp]);
    await pool.query(`UPDATE ad_alerts SET status = 'RESOLVED' WHERE rule_code = 'MANDATE_READ_FAILED'`);
    await pool.query(`UPDATE operator_mandates SET read_failures = 5 WHERE status = 'ACTIVE'`);
    setMandateReaderForTesting(() => ({
      spendBetween: async () => {
        throw new Error('[META TIMEOUT EXCEPTION]: x');
      },
      adInsightsDaily: async () => ({ rows: [], truncated: false }),
      hourly: async () => []
    }));
    const r = await new MandateService(pool).check(noon());
    expect(r.error).toMatch(/TIMEOUT/);
    const alert = await pool.query(`SELECT 1 FROM ad_alerts WHERE rule_code = 'MANDATE_READ_FAILED' AND status = 'OPEN'`);
    expect(alert.rows.length).toBe(1);
  });
});
