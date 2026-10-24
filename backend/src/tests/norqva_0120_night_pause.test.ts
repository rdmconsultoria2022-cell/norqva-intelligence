// NORQVA-0120: pausa noturna. Graph API simulada: nunca fala com a Meta.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { NightPauseService, spClock, validateWindow, parseHHMM, statusOnlyGuard, NightPauseError, classifySendError } from '../services/campaigns/nightPauseService';
import { ExperimentGuardService } from '../services/experiments/experimentGuardService';
import { withPlanLock } from '../services/campaigns/planLock';
import { CampaignInsightService } from '../services/campaigns/campaignInsightService';
import { describeRule } from '../services/alerts/alertCenterService';

const CAMPAIGN_FIELDS = new Set(['id', 'name', 'account_id', 'objective', 'status', 'effective_status', 'configured_status', 'daily_budget', 'lifetime_budget', 'updated_time', 'spend_cap']);
/** A Meta recusa a leitura inteira se pedir um campo que não existe no objeto Campaign (erro #100). */
const checkCampaignFields = (params: any) => {
  for (const f of String(params?.fields || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!CAMPAIGN_FIELDS.has(f)) throw new Error(`[META GRAPH API ERROR]: (#100) Tried accessing nonexisting field (${f}) (code 100)`);
  }
};

// Horário de Brasília = UTC-3. O servidor (e o CI) roda em UTC: os testes passam o instante em UTC.
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m));
};

describe('NORQVA-0120 — horário de Brasília e janela', () => {
  it('calcula data e minuto em São Paulo com o servidor em UTC', () => {
    expect(spClock(new Date('2026-10-24T03:00:00Z'))).toMatchObject({ date: '2026-10-24', minutes: 0, hhmm: '00:00' });
    expect(spClock(new Date('2026-10-24T02:59:00Z'))).toMatchObject({ date: '2026-10-23', minutes: 23 * 60 + 59 });
    expect(spClock(new Date('2026-10-24T09:00:00Z'))).toMatchObject({ date: '2026-10-24', minutes: 360, hhmm: '06:00' });
    expect(spClock(at('2026-12-31', '23:59'))).toMatchObject({ date: '2026-12-31', hhmm: '23:59' });
  });

  it('valida a janela no mesmo dia (início antes do fim)', () => {
    expect(validateWindow('00:00', '06:00')).toEqual({ start: '00:00', end: '06:00' });
    expect(validateWindow('01:30', '05:00')).toEqual({ start: '01:30', end: '05:00' });
    expect(() => validateWindow('06:00', '00:00')).toThrow(NightPauseError);
    expect(() => validateWindow('02:00', '02:00')).toThrow(/antes do fim/);
    expect(() => validateWindow('24:00', '06:00')).toThrow(/HH:MM/);
    expect(() => validateWindow('1:00', '06:00')).toThrow(/HH:MM/);
    expect(validateWindow('22:00', '23:00')).toEqual({ start: '22:00', end: '23:00' });
    expect(() => validateWindow('22:00', '23:58')).toThrow(/23:00/);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('7:00')).toBeNull();
  });

  it('trava do envio: só status PAUSED/ACTIVE e só no ID da campanha', () => {
    const g = statusOnlyGuard('1200001');
    expect(() => g('/1200001', { status: 'PAUSED' })).not.toThrow();
    expect(() => g('/1200001', { status: 'ACTIVE' })).not.toThrow();
    expect(() => g('/1200002', { status: 'PAUSED' })).toThrow();
    expect(() => g('/1200001', { status: 'PAUSED', daily_budget: 100 })).toThrow();
    expect(() => g('/1200001', { spend_cap: 100 })).toThrow();
    expect(() => g('/1200001', { status: 'ARCHIVED' })).toThrow();
    expect(() => g('/act_1/campaigns', { status: 'PAUSED' })).toThrow();
    // por direção: o cliente de pausar só pausa; o de reativar só reativa
    expect(() => statusOnlyGuard('1200001', 'PAUSED')('/1200001', { status: 'ACTIVE' })).toThrow();
    expect(() => statusOnlyGuard('1200001', 'PAUSED')('/1200001', { status: 'PAUSED' })).not.toThrow();
    expect(() => statusOnlyGuard('1200001', 'ACTIVE')('/1200001', { status: 'PAUSED' })).toThrow();
  });

  it('tipos de erro do envio', () => {
    expect(classifySendError('[SECURITY EXCEPTION]: BLOCKED_BY_META_WRITE_SAFETY_HOLD')).toBe('PRE_SEND');
    expect(classifySendError("[VALIDATION EXCEPTION]: CAMPAIGN '1' not found. Sync Meta data first.")).toBe('PRE_SEND');
    expect(classifySendError('[NIGHT PAUSE GUARD]: x')).toBe('PRE_SEND');
    expect(classifySendError('[META TIMEOUT EXCEPTION]: Mutating request timed out after 15000ms.')).toBe('UNKNOWN');
    expect(classifySendError('[META GRAPH API ERROR]: Meta mutating request returned HTTP 503')).toBe('UNKNOWN');
    expect(classifySendError('[META GRAPH API ERROR]: User request limit reached (code 17)')).toBe('UNKNOWN');
    expect(classifySendError('[META GRAPH API ERROR]: x (code 613, subcode 1487742)')).toBe('UNKNOWN');
    expect(classifySendError('[META GRAPH API ERROR]: x (code 80004)')).toBe('UNKNOWN');
    expect(classifySendError('fetch failed')).toBe('UNKNOWN');
    expect(classifySendError('[META GRAPH API ERROR]: Permissions error (code 200)')).toBe('REJECTED');
    expect(classifySendError('[META GRAPH API ERROR]: Invalid parameter (code 100)')).toBe('REJECTED');
  });

  it('avisos da pausa noturna têm título e ação na central', () => {
    for (const r of ['NIGHT_PAUSE_PAUSE_FAILED', 'NIGHT_PAUSE_RESUME_FAILED', 'NIGHT_PAUSE_RESUME_CANCELLED', 'NIGHT_PAUSE_EXPIRED']) {
      expect(describeRule(r).title).not.toBe('Alerta da campanha');
    }
  });
});

describe.sequential('NORQVA-0120 — pausa noturna', () => {
  let pool: Pool;
  let accountDbId: string;
  let admin: string;
  let perf: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'NIGHT_PAUSE_ENABLED'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  type MetaObj = { status: string; daily_budget: number | null; updated_time: string; spend: number; spend_cap: number | null; account_id?: string };
  const onMeta = new Map<string, MetaObj>();
  let posts: Array<{ endpoint: string; body: any }>;
  let failPost: ((endpoint: string, body: any) => boolean) | null;
  let failGet: ((endpoint: string) => boolean) | null;
  let activities: any[];
  let failActivities: boolean;
  let failApp: boolean;
  const ADS_MANAGER_APP = '119211728144504';
  let getHook: ((endpoint: string) => Promise<void>) | null;
  let postHook: ((endpoint: string, body: any) => Promise<void>) | null;
  // envio que a Meta aplica mas cuja resposta se perde
  let applyThenThrow: ((endpoint: string, body: any) => string | null) | null;
  let tick = 0;
  // cada teste usa um dia diferente: linhas de outros testes não se misturam
  let day = 0;
  const nextDay = () => {
    day += 1;
    const d = new Date(Date.UTC(2027, 0, 1) + day * 86400000);
    return d.toISOString().slice(0, 10);
  };

  const get = vi.fn(async (endpoint: string, params?: any) => {
    if (getHook) await getHook(endpoint);
    if (failGet && failGet(endpoint)) throw new Error('[META GRAPH API ERROR]: leitura simulada falhou');
    if (/^\/act_[^/]+\/activities$/.test(endpoint)) {
      if (failActivities) throw new Error('[META GRAPH API ERROR]: atividades indisponíveis');
      return { data: activities };
    }
    if (endpoint === '/app') {
      if (failApp) throw new Error('[META GRAPH API ERROR]: app indisponível');
      return { id: 'app1' };
    }
    if (endpoint === '/me') return { id: 'u1' };
    if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
    if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
    if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
    const ins = /^\/(\d+)\/insights$/.exec(endpoint);
    if (ins) return { data: [{ spend: String(onMeta.get(ins[1])?.spend ?? 0) }] };
    const obj = onMeta.get(endpoint.slice(1));
    if (obj) {
      checkCampaignFields(params);
      return {
        id: endpoint.slice(1),
        account_id: obj.account_id ?? '2887010388338951',
        status: obj.status,
        effective_status: obj.status,
        daily_budget: obj.daily_budget === null ? undefined : String(obj.daily_budget * 100),
        updated_time: obj.updated_time,
        spend_cap: obj.spend_cap === null ? '0' : String(obj.spend_cap * 100)
      };
    }
    throw new Error('unexpected ' + endpoint);
  });
  const post = vi.fn(async (endpoint: string, body: any) => {
    posts.push({ endpoint, body });
    if (failPost && failPost(endpoint, body)) throw new Error('[META GRAPH API ERROR]: envio simulado falhou');
    const obj = onMeta.get(endpoint.slice(1));
    if (obj && body?.status) {
      obj.status = body.status;
      obj.updated_time = `2027-01-01T00:00:${String(++tick % 60).padStart(2, '0')}+0000`;
    }
    if (postHook) await postHook(endpoint, body);
    const lost = applyThenThrow ? applyThenThrow(endpoint, body) : null;
    if (lost) throw new Error(lost);
    return { success: true };
  });
  const service = () => new NightPauseService(() => new MetaMutatingClient(post as any, undefined, get as any));

  const seed = async (opts: { metaStatus?: string; enabled?: boolean; start?: string; end?: string; cap?: number; spend?: number; dailyMeta?: number | null } = {}) => {
    const cid = String(1180000000000 + Math.floor(Math.random() * 1e9));
    const setId = String(1181000000000 + Math.floor(Math.random() * 1e9));
    const code = `NP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const cmpDb = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, $3, $4, $5, $5, FALSE)`,
      [cmpDb, cid, accountDbId, `Campanha ${code}`, opts.metaStatus || 'ACTIVE']
    );
    const r = await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, night_pause_enabled, night_pause_start, night_pause_end)
       VALUES ($1, 'ACTIVE', $2, $3, 30, $4::numeric, 'teste 0120', $5, $6, $7) RETURNING *`,
      [
        code,
        JSON.stringify({ campaign: { name: `Campanha ${code}` } }),
        JSON.stringify({ campaign: { [`Campanha ${code}`]: cid }, adsets: { conjunto: setId } }),
        opts.cap ?? 300,
        opts.enabled ?? true,
        opts.start ?? '00:00',
        opts.end ?? '06:00'
      ]
    );
    onMeta.set(cid, { status: opts.metaStatus || 'ACTIVE', daily_budget: opts.dailyMeta === undefined ? 30 : opts.dailyMeta, updated_time: '2027-01-01T00:00:00+0000', spend: opts.spend ?? 50, spend_cap: null });
    return { plan: r.rows[0], cid, setId, code };
  };
  const runOf = async (cid: string, date: string) => (await pool.query(`SELECT * FROM night_pause_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`, [cid, date])).rows[0];
  const postsTo = (cid: string) => posts.filter((p) => p.endpoint === `/${cid}`);
  const actives = (cid: string) => postsTo(cid).filter((p) => p.body.status === 'ACTIVE');
  // a reativação tenta de novo com intervalo mínimo: nos testes, "o tempo passa"
  const skipBackoff = (cid: string) => pool.query(`UPDATE night_pause_runs SET resume_started_at = NOW() - INTERVAL '1 hour' WHERE meta_campaign_id = $1`, [cid]);
  const alertsOf = async (cid: string) => (await pool.query(`SELECT rule_code, message FROM ad_alerts WHERE meta_ad_id = $1 ORDER BY created_at`, [cid])).rows;
  const auditsOf = async (code: string) => (await pool.query(`SELECT event_type, description FROM audit_logs WHERE description LIKE $1 ORDER BY created_at`, [`%${code}%`])).rows;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ('act_norqva_0120', 'NORQVA 0120', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    accountDbId = acct.rows[0].id;
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $4, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, `U ${role}`, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.night0120@norqva.test', 'ADMIN');
    perf = await mk('perf.night0120@norqva.test', 'PERFORMANCE');
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    process.env.NIGHT_PAUSE_ENABLED = 'true';
    resetMetaPreflightCacheForTesting();
    posts = [];
    failPost = null;
    failGet = null;
    activities = [];
    failActivities = false;
    failApp = false;
    NightPauseService.resetAppCacheForTesting();
    getHook = null;
    postHook = null;
    applyThenThrow = null;
    // planos de outros testes (e de outras suítes) ficam fora desta noite
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = FALSE`);
    await pool.query(`UPDATE night_pause_external_campaigns SET enabled = FALSE`);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    resetMetaPreflightCacheForTesting();
  });

  it('00:00 pausa só campanha ATIVA com a pausa ligada; 06:00 reativa só o que pausou', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed({ metaStatus: 'PAUSED' }); // já pausada à meia-noite
    const c = await seed({ enabled: false }); // pausa noturna desligada
    const s = service();

    await s.run(pool, new Date(at(date, '00:00').getTime() - 60000));
    expect(posts).toHaveLength(0); // 23:59 do dia anterior: nada

    await s.run(pool, at(date, '00:00'));
    expect(postsTo(a.cid)).toEqual([{ endpoint: `/${a.cid}`, body: { status: 'PAUSED' } }]);
    expect(postsTo(b.cid)).toHaveLength(0);
    expect(postsTo(c.cid)).toHaveLength(0);
    expect(onMeta.get(a.cid)!.status).toBe('PAUSED');
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED', previous_status: 'ACTIVE' });
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'SKIPPED' });
    expect(await runOf(c.cid, date)).toBeUndefined();

    // ficha "Pausa noturna" confirmada pela Meta + histórico da campanha
    const ch = (await pool.query(`SELECT * FROM meta_change_requests WHERE meta_campaign_id = $1 ORDER BY created_at`, [a.cid])).rows;
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ origin: 'NIGHT_PAUSE', kind: 'STATUS', requested_value: 'PAUSED', state: 'CONFIRMED', meta_value: 'PAUSED', requested_by_role: 'SYSTEM' });
    const hist = await new CampaignInsightService(pool).history(a.plan.id, { role: 'ADMIN' });
    const pauseItem = hist.items.find((i: any) => i.type === 'NIGHT_PAUSE_DONE');
    expect(pauseItem?.description).toMatch(/Confirmado pela Meta/);
    expect(hist.items.some((i: any) => i.type === 'NIGHT_PAUSE')).toBe(true); // decisão registrada

    // 05:59: ainda não
    await s.run(pool, at(date, '05:59'));
    expect(postsTo(a.cid)).toHaveLength(1);

    await s.run(pool, at(date, '06:00'));
    expect(postsTo(a.cid)).toEqual([
      { endpoint: `/${a.cid}`, body: { status: 'PAUSED' } },
      { endpoint: `/${a.cid}`, body: { status: 'ACTIVE' } }
    ]);
    expect(postsTo(b.cid)).toHaveLength(0); // nunca ativa o que não estava ativo à meia-noite
    expect(onMeta.get(b.cid)!.status).toBe('PAUSED');
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    const ch2 = (await pool.query(`SELECT * FROM meta_change_requests WHERE meta_campaign_id = $1 ORDER BY created_at`, [a.cid])).rows;
    expect(ch2.map((x) => `${x.requested_value}:${x.state}:${x.origin}`)).toEqual(['PAUSED:CONFIRMED:NIGHT_PAUSE', 'ACTIVE:CONFIRMED:NIGHT_PAUSE']);
    const audits = await auditsOf(a.code);
    expect(audits.map((x) => x.event_type)).toEqual(expect.arrayContaining(['NIGHT_PAUSE_DONE', 'NIGHT_PAUSE_RESUMED']));
    expect(audits.find((x) => x.event_type === 'NIGHT_PAUSE_RESUMED')!.description).toMatch(/Confirmado pela Meta/);

    // só situação, só no ID da campanha, nunca orçamento ou teto
    for (const p of posts) {
      expect(Object.keys(p.body)).toEqual(['status']);
      expect(p.endpoint).toMatch(/^\/\d+$/);
    }
  });

  it('repetir o ciclo (ou duas instâncias ao mesmo tempo) não pausa nem reativa duas vezes', async () => {
    const date = nextDay();
    const a = await seed();
    await Promise.all([service().run(pool, at(date, '00:02')), service().run(pool, at(date, '00:02'))]);
    await service().run(pool, at(date, '00:04'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'PAUSED')).toHaveLength(1);
    await Promise.all([service().run(pool, at(date, '06:02')), service().run(pool, at(date, '06:02'))]);
    await service().run(pool, at(date, '06:04'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(1);
    // reativada pelo NORQVA e, depois, pausada de novo à tarde pelo dono: a pausa noturna não volta a pausar nem reativar
    onMeta.get(a.cid)!.status = 'PAUSED';
    await service().run(pool, at(date, '15:00'));
    expect(postsTo(a.cid)).toHaveLength(2);
  });

  it('dono pausou pela tela durante a noite: não reativa e registra', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    await pool.query(`UPDATE launch_plans SET operator_paused_at = NOW() WHERE id = $1`, [a.plan.id]);
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'CANCELLED' });
    expect((await runOf(a.cid, date)).reason).toMatch(/pela tela/);
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_RESUME_CANCELLED');
    expect((await auditsOf(a.code)).map((x) => x.event_type)).toContain('NIGHT_PAUSE_RESUME_CANCELLED');
  });

  it('dono pausou pelo NORQVA (rota de controle) durante a noite: não reativa', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    const { setMetaControlClientFactoryForTesting } = await import('../controllers/metaControlController');
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post as any, undefined, get as any));
    try {
      const r = await request(app).post(`/api/meta-control/campaign/${a.cid}/status?mode=real`).set('Authorization', `Bearer ${admin}`).send({ status: 'PAUSED' });
      expect(r.status).toBe(200);
    } finally {
      setMetaControlClientFactoryForTesting(null);
    }
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'CANCELLED' });
  });

  it('Performance (ficha de alteração) ou vigia mexeram durante a noite: reativação cancelada', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    await service().run(pool, at(date, '00:01'));
    // ficha de Performance (pausa) na campanha A
    await pool.query(
      `INSERT INTO meta_change_requests (id, plan_id, plan_code, entity_type, meta_id, meta_campaign_id, kind, previous_value, requested_value, state, requested_by_name, requested_by_role)
       VALUES ($1, $2, $3, 'ADSET', $4, $5, 'STATUS', 'ACTIVE', 'PAUSED', 'CONFIRMED', 'Perf', 'PERFORMANCE')`,
      [crypto.randomUUID(), a.plan.id, a.code, a.setId, a.cid]
    );
    // decisão do vigia do teto na campanha B
    await pool.query(
      `INSERT INTO decision_events (correlation_id, phase, action, decision, plan_id, plan_code, actor_type, meta_ids)
       VALUES ($1, 'EXECUTED', 'EXPERIMENT_GUARD_EXTEND_CAP', 'CAP:450', $2, $3, 'SYSTEM', $4::jsonb)`,
      [crypto.randomUUID(), b.plan.id, b.code, JSON.stringify([b.cid])]
    );
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/alteração pedida/);
    expect((await runOf(b.cid, date)).reason).toMatch(/EXPERIMENT_GUARD_EXTEND_CAP/);
  });

  it('vigia parou no teto, teto ou orçamento do plano mudou, ou alterada no Gerenciador: não reativa', async () => {
    const date = nextDay();
    const capped = await seed();
    const capChanged = await seed();
    const budget = await seed();
    const adsManager = await seed();
    const metaBudget = await seed();
    await service().run(pool, at(date, '00:01'));
    await pool.query(`UPDATE launch_plans SET guard_state = 'CAPPED' WHERE id = $1`, [capped.plan.id]);
    await pool.query(`UPDATE launch_plans SET max_spend_brl = 500 WHERE id = $1`, [capChanged.plan.id]);
    await pool.query(`UPDATE launch_plans SET daily_budget_brl = 50 WHERE id = $1`, [budget.plan.id]);
    activities = [{ event_type: 'update_campaign_run_status', event_time: new Date().toISOString(), object_id: adsManager.cid, object_type: 'CAMPAIGN', actor_id: 'dono', application_id: ADS_MANAGER_APP }];
    onMeta.get(metaBudget.cid)!.daily_budget = 80;
    await service().run(pool, at(date, '06:01'));
    for (const x of [capped, capChanged, budget, adsManager, metaBudget]) {
      expect(postsTo(x.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
      expect((await runOf(x.cid, date)).state).toBe('CANCELLED');
    }
    expect((await runOf(capped.cid, date)).reason).toMatch(/vigia/);
    expect((await runOf(capChanged.cid, date)).reason).toMatch(/teto/);
    expect((await runOf(budget.cid, date)).reason).toMatch(/orçamento/);
    expect((await runOf(adsManager.cid, date)).reason).toMatch(/alterada na Meta durante a noite fora do NORQVA/);
    expect(await runOf(adsManager.cid, date)).toMatchObject({ activity_check: 'TOUCHED' });
    expect((await runOf(metaBudget.cid, date)).reason).toMatch(/orçamento da campanha mudou na Meta/);
  });

  it('registro da própria pausa no mesmo milissegundo não conta como alteração; um microssegundo depois conta', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    await service().run(pool, at(date, '00:01'));
    const touch = (cid: string, offset: string) =>
      pool.query(
        `INSERT INTO audit_logs (id, event_type, description, is_demo, created_at)
         VALUES ($1, 'EXPERIMENT_GUARD_PAUSED', $2, FALSE, (SELECT quiet_since FROM night_pause_runs WHERE meta_campaign_id = $3) + $4::interval)`,
        [crypto.randomUUID(), `Campanha ${cid} pausada pelo vigia do teto.`, cid, offset]
      );
    await touch(a.cid, '-200 microseconds');
    await touch(b.cid, '200 microseconds');
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'CANCELLED' });
  });

  it('reativada por alguém durante a noite (Meta já ACTIVE): não manda nada', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    onMeta.get(a.cid)!.status = 'ACTIVE';
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid)).toHaveLength(1);
    expect((await runOf(a.cid, date)).reason).toMatch(/ACTIVE/);
  });

  it('teto atingido: não reativa', async () => {
    const date = nextDay();
    const a = await seed({ cap: 100, spend: 40 });
    await service().run(pool, at(date, '00:01'));
    onMeta.get(a.cid)!.spend = 100;
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/teto foi atingido/);
    // limite de gastos da campanha na Meta também
    const date2 = nextDay();
    const b = await seed({ cap: 1000, spend: 40 });
    await service().run(pool, at(date2, '00:01'));
    onMeta.get(b.cid)!.spend_cap = 300;
    onMeta.get(b.cid)!.spend = 300;
    await service().run(pool, at(date2, '06:01'));
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect((await runOf(b.cid, date2)).reason).toMatch(/limite de gastos/);
  });

  it('servidor fora às 06:00: reativa quando voltar, até 23:59', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    await service().run(pool, at(date, '00:01'));
    expect(onMeta.get(a.cid)!.status).toBe('PAUSED');
    expect(onMeta.get(b.cid)!.status).toBe('PAUSED');
    // sem ciclo das 00:03 às 14:00: A volta às 14:00
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = FALSE WHERE id = $1`, [b.plan.id]);
    const keepB = await pool.query(`UPDATE night_pause_runs SET window_end = '23:59' WHERE meta_campaign_id = $1 RETURNING id`, [b.cid]);
    expect(keepB.rows).toHaveLength(1);
    await service().run(pool, at(date, '14:00'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED', reason: null });
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(1);
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    // B (fim às 23:59): volta às 23:59 do mesmo dia
    await service().run(pool, at(date, '23:59'));
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(1);
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'REACTIVATED' });
  });

  it('nada depois de 23:59: no dia seguinte a pausa expira, fica pausada e avisa', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    const next = new Date(at(date, '00:00').getTime() + 86400000);
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = FALSE WHERE id = $1`, [a.plan.id]);
    await service().run(pool, next);
    await service().run(pool, new Date(next.getTime() + 7 * 3600000));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'EXPIRED' });
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_EXPIRED');
    expect((await auditsOf(a.code)).map((x) => x.event_type)).toContain('NIGHT_PAUSE_EXPIRED');
  });

  it('chave NIGHT_PAUSE_ENABLED desligada: não pausa nada novo, mas reativa o que já pausou', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    expect(onMeta.get(a.cid)!.status).toBe('PAUSED');
    delete process.env.NIGHT_PAUSE_ENABLED;
    const b = await seed();
    await service().run(pool, at(date, '00:30'));
    expect(postsTo(b.cid)).toHaveLength(0);
    expect(await runOf(b.cid, date)).toBeUndefined();
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(1);
    expect(postsTo(b.cid)).toHaveLength(0);
  });

  it('META_MUTATION_ENABLED desligado: não pausa e não reativa (a pausa fica esperando)', async () => {
    const date = nextDay();
    process.env.META_MUTATION_ENABLED = 'false';
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    expect(posts).toHaveLength(0);
    expect(await runOf(a.cid, date)).toBeUndefined();

    process.env.META_MUTATION_ENABLED = 'true';
    const b = await seed();
    await service().run(pool, at(date, '00:02'));
    expect(onMeta.get(b.cid)!.status).toBe('PAUSED');
    process.env.META_MUTATION_ENABLED = 'false';
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'PAUSED' });
    process.env.META_MUTATION_ENABLED = 'true';
    await service().run(pool, at(date, '07:00'));
    expect(postsTo(b.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(1);
  });

  it('falha ao pausar ou reativar abre aviso na central', async () => {
    const date = nextDay();
    const a = await seed();
    failPost = (endpoint, body) => endpoint === `/${a.cid}` && body.status === 'PAUSED';
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSE_FAILED' });
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_PAUSE_FAILED');
    // e de manhã não há nada a reativar
    failPost = null;
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);

    const b = await seed();
    const date2 = nextDay();
    await service().run(pool, at(date2, '00:01'));
    failPost = (endpoint, body) => endpoint === `/${b.cid}` && body.status === 'ACTIVE';
    await service().run(pool, at(date2, '06:01'));
    expect(await runOf(b.cid, date2)).toMatchObject({ state: 'RESUME_FAILED' });
    expect((await alertsOf(b.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_RESUME_FAILED');
    const ch = (await pool.query(`SELECT state FROM meta_change_requests WHERE meta_campaign_id = $1 AND requested_value = 'ACTIVE'`, [b.cid])).rows;
    expect(ch).toEqual([{ state: 'FAILED' }]);
  });

  it('leitura da Meta falhando de manhã: tenta de novo nos próximos ciclos', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    failGet = (endpoint) => endpoint === `/${a.cid}`;
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED', resume_attempts: 1 });
    failGet = null;
    // intervalo mínimo entre tentativas
    await service().run(pool, at(date, '06:03'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED' });
    await skipBackoff(a.cid);
    await service().run(pool, at(date, '06:05'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
  });

  it('janela personalizada (01:30 às 05:00)', async () => {
    const date = nextDay();
    const a = await seed({ start: '01:30', end: '05:00' });
    await service().run(pool, at(date, '00:01'));
    expect(postsTo(a.cid)).toHaveLength(0);
    await service().run(pool, at(date, '01:30'));
    expect(postsTo(a.cid)).toHaveLength(1);
    await service().run(pool, at(date, '04:59'));
    expect(postsTo(a.cid)).toHaveLength(1);
    await service().run(pool, at(date, '05:00'));
    expect(postsTo(a.cid).map((p) => p.body.status)).toEqual(['PAUSED', 'ACTIVE']);
  });

  it('pausa: a Meta aplicou mas a resposta se perdeu → é pausa nossa (e volta de manhã)', async () => {
    const date = nextDay();
    const a = await seed();
    applyThenThrow = (endpoint, body) => (endpoint === `/${a.cid}` && body.status === 'PAUSED' ? '[META TIMEOUT EXCEPTION]: Mutating request timed out after 15000ms.' : null);
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED' });
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).not.toContain('NIGHT_PAUSE_PAUSE_FAILED');
    const ch = (await pool.query(`SELECT state FROM meta_change_requests WHERE meta_campaign_id = $1`, [a.cid])).rows;
    expect(ch).toEqual([{ state: 'CONFIRMED' }]);
    applyThenThrow = null;
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
  });

  it('pausa: resposta perdida e releitura falhando → aguardando conferência; o próximo ciclo confirma', async () => {
    const date = nextDay();
    const a = await seed();
    applyThenThrow = (endpoint, body) => (endpoint === `/${a.cid}` && body.status === 'PAUSED' ? 'fetch failed' : null);
    // depois do envio, a leitura da campanha falha
    postHook = async (endpoint) => {
      if (endpoint === `/${a.cid}`) failGet = (e) => e === `/${a.cid}`;
    };
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSE_UNCONFIRMED' });
    expect((await runOf(a.cid, date)).quiet_since).not.toBeNull();
    failGet = null;
    postHook = null;
    applyThenThrow = null;
    await service().run(pool, at(date, '00:03'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED' });
    expect(postsTo(a.cid)).toHaveLength(1); // não pausou de novo
  });

  it('pausa: a Meta mostra ACTIVE depois do erro → falhou, com aviso', async () => {
    const date = nextDay();
    const a = await seed();
    failPost = (endpoint, body) => endpoint === `/${a.cid}` && body.status === 'PAUSED';
    // a Meta recusou: a campanha segue ativa
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSE_FAILED' });
    expect((await alertsOf(a.cid)).map((x) => x.message).join(' ')).toMatch(/segue ativa/);
  });

  it('reativar: a Meta aplicou mas a resposta se perdeu → reativada (confirmada), sem segundo envio', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    applyThenThrow = (endpoint, body) => (endpoint === `/${a.cid}` && body.status === 'ACTIVE' ? '[META GRAPH API ERROR]: Meta mutating request returned HTTP 502' : null);
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    expect(actives(a.cid)).toHaveLength(1);
  });

  it('reativar: falha antes do envio tenta de novo (o registro META_MUTATION_FAILED não cancela a volta)', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    // campanha sumiu da sincronização: o cliente recusa antes de enviar e grava META_MUTATION_FAILED
    await pool.query(`UPDATE meta_campaigns SET is_demo = TRUE WHERE meta_campaign_id = $1`, [a.cid]);
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED', resume_attempts: 1, resume_change_id: null });
    const failed = (await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'META_MUTATION_FAILED' AND description LIKE $1`, [`%${a.cid}%`])).rows;
    expect(failed.length).toBeGreaterThan(0);
    expect(actives(a.cid)).toHaveLength(0);
    await pool.query(`UPDATE meta_campaigns SET is_demo = FALSE WHERE meta_campaign_id = $1`, [a.cid]);
    await skipBackoff(a.cid);
    await service().run(pool, at(date, '06:07'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED', resume_attempts: 2 });
    expect(actives(a.cid)).toHaveLength(1);
  });

  it('reativar: erro passageiro da Meta tenta até 5 vezes (aviso na 3.ª) e depois desiste', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    const msg = '[META GRAPH API ERROR]: Service temporarily unavailable (code 2)';
    // a Meta não aplica e responde erro passageiro
    const realPost = post.getMockImplementation()!;
    post.mockImplementation(async (endpoint: string, body: any) => {
      if (endpoint === `/${a.cid}` && body.status === 'ACTIVE') {
        posts.push({ endpoint, body });
        throw new Error(msg);
      }
      return realPost(endpoint, body);
    });
    try {
      for (let i = 1; i <= 5; i++) {
        await skipBackoff(a.cid);
        await service().run(pool, at(date, `06:${String(i * 5).padStart(2, '0')}`));
        const row = await runOf(a.cid, date);
        expect(row.resume_attempts).toBe(i);
        expect(row.state).toBe(i < 5 ? 'PAUSED' : 'RESUME_FAILED');
        const alerts = (await alertsOf(a.cid)).filter((x) => x.rule_code === 'NIGHT_PAUSE_RESUME_FAILED');
        expect(alerts.length).toBe(i < 3 ? 0 : i < 5 ? 1 : 2);
      }
    } finally {
      post.mockImplementation(realPost);
    }
    expect(actives(a.cid)).toHaveLength(5);
    await skipBackoff(a.cid);
    await service().run(pool, at(date, '07:00'));
    expect(actives(a.cid)).toHaveLength(5);
  });

  it('linhas interrompidas: sem envio voltam; com envio a releitura decide', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    await service().run(pool, at(date, '00:01'));
    // A: reativação interrompida antes do envio
    await pool.query(`UPDATE night_pause_runs SET state = 'REACTIVATING', resume_started_at = NOW() - INTERVAL '10 minutes', resume_change_id = NULL WHERE meta_campaign_id = $1`, [a.cid]);
    // B: reativação interrompida depois do envio (a Meta aplicou)
    await pool.query(`UPDATE night_pause_runs SET state = 'REACTIVATING', resume_started_at = NOW() - INTERVAL '10 minutes', resume_change_id = $2 WHERE meta_campaign_id = $1`, [b.cid, crypto.randomUUID()]);
    onMeta.get(b.cid)!.status = 'ACTIVE';
    await service().run(pool, at(date, '06:30'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    expect(actives(a.cid)).toHaveLength(1);
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    expect(actives(b.cid)).toHaveLength(0);

    // pausas interrompidas: sem envio → falhou; com envio e PAUSED na Meta → pausa nossa
    const date2 = nextDay();
    const c = await seed();
    const d = await seed();
    const insertStale = (x: any, changeId: string | null) =>
      pool.query(
        `INSERT INTO night_pause_runs (plan_id, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status, plan_daily_budget_at_pause, plan_cap_at_pause, pause_started_at, pause_change_id)
         VALUES ($1, $2, $3, $4::date, '00:00', '06:00', 'PAUSING', 'ACTIVE', 30, 300, NOW() - INTERVAL '10 minutes', $5)`,
        [x.plan.id, x.code, x.cid, date2, changeId]
      );
    await insertStale(c, null);
    await insertStale(d, crypto.randomUUID());
    onMeta.get(d.cid)!.status = 'PAUSED';
    await service().run(pool, at(date2, '01:30'));
    expect(await runOf(c.cid, date2)).toMatchObject({ state: 'PAUSE_FAILED' });
    expect(await runOf(d.cid, date2)).toMatchObject({ state: 'PAUSED' });
    expect((await runOf(d.cid, date2)).quiet_since).not.toBeNull();
  });

  it('corrida: dono pausa ou vigia marca CAPPED logo antes do envio → não reativa', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    await service().run(pool, at(date, '00:01'));
    // durante a leitura do gasto (a última antes do envio) o dono pausa A pela tela e o vigia marca B
    getHook = async (endpoint) => {
      if (endpoint === `/${a.cid}/insights`) await pool.query(`UPDATE launch_plans SET operator_paused_at = NOW() WHERE id = $1`, [a.plan.id]);
      if (endpoint === `/${b.cid}/insights`) await pool.query(`UPDATE launch_plans SET guard_state = 'CAPPED' WHERE id = $1`, [b.plan.id]);
    };
    await service().run(pool, at(date, '06:01'));
    expect(actives(a.cid)).toHaveLength(0);
    expect(actives(b.cid)).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/pela tela/);
    expect((await runOf(b.cid, date)).reason).toMatch(/vigia/);
  });

  it('corrida: alguém mexe no mesmo instante do envio → pausa de novo e aviso crítico', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '00:01'));
    postHook = async (endpoint, body) => {
      if (endpoint === `/${a.cid}` && body.status === 'ACTIVE') {
        await pool.query(
          `INSERT INTO decision_events (correlation_id, phase, action, decision, plan_id, plan_code, actor_type, meta_ids)
           VALUES ($1, 'REQUESTED', 'META_ENTITY_STATUS', 'CAMPAIGN:PAUSED', $2, $3, 'HUMAN', $4::jsonb)`,
          [crypto.randomUUID(), a.plan.id, a.code, JSON.stringify([a.cid])]
        );
      }
    };
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid).map((p) => p.body.status)).toEqual(['PAUSED', 'ACTIVE', 'PAUSED']);
    expect(onMeta.get(a.cid)!.status).toBe('PAUSED');
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'CANCELLED' });
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_RACE');
    expect(describeRule('NIGHT_PAUSE_RACE').severity).toBe('CRITICAL');
  });

  it('trava do plano: duas decisões no mesmo plano acontecem uma de cada vez', async () => {
    const id = crypto.randomUUID();
    const order: string[] = [];
    const slow = (tag: string) => withPlanLock(pool, id, async () => {
      order.push(`${tag}:in`);
      await new Promise((r) => setTimeout(r, 50));
      order.push(`${tag}:out`);
    });
    await Promise.all([slow('a'), slow('b')]);
    expect([order.slice(0, 2), order.slice(2)].every((p) => p[0].split(':')[0] === p[1].split(':')[0])).toBe(true);
  });

  it('vigia à noite: campanha parada pela pausa noturna não vira CAPPED; sem pausa noturna vira', async () => {
    const date = nextDay();
    const a = await seed({ cap: 100, spend: 99 });
    const b = await seed({ cap: 100, spend: 99, enabled: false });
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED' });
    onMeta.get(b.cid)!.status = 'PAUSED';
    const guard = new ExperimentGuardService(
      () => ({
        getCampaignLifetimeSpend: async (_id: string) => ({ spend: 99.9, effective_status: 'PAUSED', spend_cap: null }),
        setEntityStatus: (async () => { throw new Error('não deveria pausar'); }) as any,
        setCampaignSpendCap: (async () => { throw new Error('não deveria mexer no teto'); }) as any
      }),
      null
    );
    const ra = await guard.run(pool, { planId: a.plan.id, noProfitExtend: true });
    const rb = await guard.run(pool, { planId: b.plan.id, noProfitExtend: true });
    expect(ra.plans[0].night_pause).toBeTruthy();
    expect((await pool.query(`SELECT guard_state FROM launch_plans WHERE id = $1`, [a.plan.id])).rows[0].guard_state).not.toBe('CAPPED');
    expect(rb.plans[0].capped).toBeTruthy();
    expect((await pool.query(`SELECT guard_state FROM launch_plans WHERE id = $1`, [b.plan.id])).rows[0].guard_state).toBe('CAPPED');
    // de manhã a pausa noturna confere o teto e não reativa
    onMeta.get(a.cid)!.spend = 100;
    await service().run(pool, at(date, '06:01'));
    expect(actives(a.cid)).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/teto foi atingido/);
  });

  it('pausada pela tela à meia-noite e reativada pelo dono no meio da noite: não pausa', async () => {
    const date = nextDay();
    const a = await seed();
    await pool.query(`UPDATE launch_plans SET operator_paused_at = NOW() WHERE id = $1`, [a.plan.id]);
    onMeta.get(a.cid)!.status = 'PAUSED';
    await service().run(pool, at(date, '00:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'SKIPPED' });
    await pool.query(`UPDATE launch_plans SET operator_paused_at = NULL WHERE id = $1`, [a.plan.id]);
    onMeta.get(a.cid)!.status = 'ACTIVE';
    await service().run(pool, at(date, '00:30'));
    await service().run(pool, at(date, '06:01'));
    expect(postsTo(a.cid)).toHaveLength(0);
  });

  it('só pausa nos primeiros 60 minutos da janela', async () => {
    const date = nextDay();
    const a = await seed();
    await service().run(pool, at(date, '01:00'));
    expect(postsTo(a.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toBeUndefined();
    await service().run(pool, at(date, '00:59'));
    expect(postsTo(a.cid)).toHaveLength(1);
  });

  it('Gerenciador: o token pode ser do dono; "nosso" é só o app do token ou a nossa própria mudança de situação', async () => {
    const date = nextDay();
    const appOurs = await seed();
    const ownPause = await seed();
    const ownerSameActor = await seed();
    const ownerNoApp = await seed();
    await service().run(pool, at(date, '00:01'));
    const now = new Date().toISOString();
    const late = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min depois da pausa
    activities = [
      // evento do app do token (qualquer tipo): nosso
      { event_type: 'update_campaign_budget', event_time: now, object_id: appOurs.cid, actor_id: 'u1', application_id: 'app1' },
      // nossa própria pausa, sem app no evento, perto do envio: nossa
      { event_type: 'update_campaign_run_status', event_time: now, object_id: ownPause.cid, actor_id: 'u1' },
      // o dono usa o mesmo usuário do token, mas pelo Gerenciador: mexido
      { event_type: 'update_campaign_run_status', event_time: now, object_id: ownerSameActor.cid, actor_id: 'u1', application_id: ADS_MANAGER_APP },
      // sem app e longe do nosso envio: mexido (na dúvida, não reativa)
      { event_type: 'update_campaign_run_status', event_time: late, object_id: ownerNoApp.cid, actor_id: 'u1' }
    ];
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(appOurs.cid, date)).toMatchObject({ state: 'REACTIVATED', activity_check: 'CLEAN' });
    expect(await runOf(ownPause.cid, date)).toMatchObject({ state: 'REACTIVATED', activity_check: 'CLEAN' });
    expect(await runOf(ownerSameActor.cid, date)).toMatchObject({ state: 'CANCELLED', activity_check: 'TOUCHED' });
    expect((await runOf(ownerSameActor.cid, date)).reason).toMatch(/fora do NORQVA/);
    expect(await runOf(ownerNoApp.cid, date)).toMatchObject({ state: 'CANCELLED', activity_check: 'TOUCHED' });
    expect(actives(ownerSameActor.cid)).toHaveLength(0);
  });

  it('Gerenciador: sem saber o app do token, só a nossa mudança de situação é nossa; com META_APP_ID vale o app informado', async () => {
    const date = nextDay();
    const ownPause = await seed();
    const budget = await seed();
    await service().run(pool, at(date, '00:01'));
    failApp = true;
    const now = new Date().toISOString();
    activities = [
      { event_type: 'update_campaign_run_status', event_time: now, object_id: ownPause.cid, actor_id: 'u1', application_id: 'app1' },
      { event_type: 'update_campaign_budget', event_time: now, object_id: budget.cid, actor_id: 'u1', application_id: 'app1' }
    ];
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(ownPause.cid, date)).toMatchObject({ state: 'REACTIVATED', activity_check: 'CLEAN_NO_APP' });
    expect(await runOf(budget.cid, date)).toMatchObject({ state: 'CANCELLED', activity_check: 'TOUCHED' });

    const date2 = nextDay();
    const viaEnv = await seed();
    await service().run(pool, at(date2, '00:01'));
    const prevApp = process.env.META_APP_ID;
    process.env.META_APP_ID = 'app-env';
    try {
      activities = [{ event_type: 'update_campaign_budget', event_time: new Date().toISOString(), object_id: viaEnv.cid, actor_id: 'u1', application_id: 'app-env' }];
      await service().run(pool, at(date2, '06:01'));
      expect(await runOf(viaEnv.cid, date2)).toMatchObject({ state: 'REACTIVATED', activity_check: 'CLEAN' });
    } finally {
      if (prevApp === undefined) delete process.env.META_APP_ID;
      else process.env.META_APP_ID = prevApp;
    }
  });

  it('Gerenciador: sem o registro de atividades, compara os instantes de updated_time', async () => {
    const date2 = nextDay();
    const same = await seed();
    const changed = await seed();
    await service().run(pool, at(date2, '00:01'));
    failActivities = true;
    const before = String((await runOf(same.cid, date2)).meta_updated_time_at_pause);
    onMeta.get(same.cid)!.updated_time = new Date(Date.parse(before.replace('+0000', 'Z'))).toISOString(); // mesmo instante, outro formato
    onMeta.get(changed.cid)!.updated_time = '2027-06-01T10:00:00+0000';
    await service().run(pool, at(date2, '06:01'));
    expect(await runOf(same.cid, date2)).toMatchObject({ state: 'REACTIVATED', activity_check: 'UNAVAILABLE' });
    expect(await runOf(changed.cid, date2)).toMatchObject({ state: 'CANCELLED', activity_check: 'UNAVAILABLE' });
    expect(await runOf(changed.cid, date2)).toMatchObject({ meta_updated_time_at_resume: '2027-06-01T10:00:00+0000' });
  });

  it('conta de anúncios diferente da configurada: não pausa; e de manhã não reativa', async () => {
    const date = nextDay();
    const a = await seed();
    const b = await seed();
    onMeta.get(a.cid)!.account_id = '999999999';
    await service().run(pool, at(date, '00:01'));
    expect(postsTo(a.cid)).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/conta de anúncios/);
    expect(onMeta.get(b.cid)!.status).toBe('PAUSED');
    onMeta.get(b.cid)!.account_id = '999999999';
    await service().run(pool, at(date, '06:01'));
    expect(actives(b.cid)).toHaveLength(0);
    expect((await runOf(b.cid, date)).reason).toMatch(/conta de anúncios/);
  });

  it('limite de gastos da campanha: atingido (gasto dos insights) não reativa; sem limite reativa', async () => {
    const date = nextDay();
    const capped = await seed({ cap: 5000, spend: 100 });
    const noCap = await seed({ cap: 5000, spend: 4000 });
    await service().run(pool, at(date, '00:01'));
    onMeta.get(capped.cid)!.spend_cap = 420;
    onMeta.get(capped.cid)!.spend = 420;
    await service().run(pool, at(date, '06:01'));
    expect(actives(capped.cid)).toHaveLength(0);
    expect((await runOf(capped.cid, date)).reason).toMatch(/limite de gastos da campanha na Meta foi atingido \(R\$ 420,00 de R\$ 420,00\)/);
    expect(actives(noCap.cid)).toHaveLength(1);
  });

  it('configuração: padrão ligada 00:00–06:00; só ADMIN salva; valida a janela', async () => {
    const a = await seed();
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = DEFAULT, night_pause_start = DEFAULT, night_pause_end = DEFAULT WHERE id = $1`, [a.plan.id]);
    const g = await request(app).get(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${perf}`);
    expect(g.status).toBe(200);
    expect(g.body).toMatchObject({ enabled: true, start: '00:00', end: '06:00', timezone: 'America/Sao_Paulo' });

    const denied = await request(app).post(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${perf}`).send({ enabled: false });
    expect(denied.status).toBe(403);
    const bad = await request(app).post(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${admin}`).send({ enabled: true, start: '06:00', end: '00:00' });
    expect(bad.status).toBe(400);
    const late = await request(app).post(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${admin}`).send({ enabled: true, start: '22:00', end: '23:58' });
    expect(late.status).toBe(400);
    expect(late.body.error).toMatch(/23:00/);
    const ok = await request(app).post(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${admin}`).send({ enabled: true, start: '01:00', end: '05:30' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ enabled: true, start: '01:00', end: '05:30' });
    const off = await request(app).post(`/api/campaigns/${a.plan.id}/night-pause?mode=real`).set('Authorization', `Bearer ${admin}`).send({ enabled: false });
    expect(off.body).toMatchObject({ enabled: false, start: '01:00', end: '05:30' });
    expect((await auditsOf(a.code)).filter((x) => x.event_type === 'NIGHT_PAUSE_SETTINGS_CHANGED')).toHaveLength(2);
    // salvar não fala com a Meta
    expect(posts).toHaveLength(0);
  });
});
