// NORQVA-0118: pausa noturna. Graph API simulada: nunca fala com a Meta.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { NightPauseService, spClock, validateWindow, parseHHMM, statusOnlyGuard, NightPauseError } from '../services/campaigns/nightPauseService';
import { CampaignInsightService } from '../services/campaigns/campaignInsightService';
import { describeRule } from '../services/alerts/alertCenterService';

// Horário de Brasília = UTC-3. O servidor (e o CI) roda em UTC: os testes passam o instante em UTC.
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m));
};

describe('NORQVA-0118 — horário de Brasília e janela', () => {
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
  });

  it('avisos da pausa noturna têm título e ação na central', () => {
    for (const r of ['NIGHT_PAUSE_PAUSE_FAILED', 'NIGHT_PAUSE_RESUME_FAILED', 'NIGHT_PAUSE_RESUME_CANCELLED', 'NIGHT_PAUSE_EXPIRED']) {
      expect(describeRule(r).title).not.toBe('Alerta da campanha');
    }
  });
});

describe.sequential('NORQVA-0118 — pausa noturna', () => {
  let pool: Pool;
  let accountDbId: string;
  let admin: string;
  let perf: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'NIGHT_PAUSE_ENABLED'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  type MetaObj = { status: string; daily_budget: number | null; updated_time: string; spend: number; spend_cap: number | null };
  const onMeta = new Map<string, MetaObj>();
  let posts: Array<{ endpoint: string; body: any }>;
  let failPost: ((endpoint: string, body: any) => boolean) | null;
  let failGet: ((endpoint: string) => boolean) | null;
  let tick = 0;
  // cada teste usa um dia diferente: linhas de outros testes não se misturam
  let day = 0;
  const nextDay = () => {
    day += 1;
    const d = new Date(Date.UTC(2027, 0, 1) + day * 86400000);
    return d.toISOString().slice(0, 10);
  };

  const get = vi.fn(async (endpoint: string, params?: any) => {
    if (failGet && failGet(endpoint)) throw new Error('[META GRAPH API ERROR]: leitura simulada falhou');
    if (endpoint === '/me') return { id: 'u1' };
    if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
    if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
    if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
    const ins = /^\/(\d+)\/insights$/.exec(endpoint);
    if (ins) return { data: [{ spend: String(onMeta.get(ins[1])?.spend ?? 0) }] };
    const obj = onMeta.get(endpoint.slice(1));
    if (obj) {
      return {
        id: endpoint.slice(1),
        status: obj.status,
        effective_status: obj.status,
        daily_budget: obj.daily_budget === null ? undefined : String(obj.daily_budget * 100),
        updated_time: obj.updated_time,
        spend_cap: obj.spend_cap === null ? undefined : String(obj.spend_cap * 100),
        _fields: params?.fields
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
      obj.updated_time = `t${++tick}`;
    }
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
       VALUES ($1, 'ACTIVE', $2, $3, 30, $4::numeric, 'teste 0118', $5, $6, $7) RETURNING *`,
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
    onMeta.set(cid, { status: opts.metaStatus || 'ACTIVE', daily_budget: opts.dailyMeta === undefined ? 30 : opts.dailyMeta, updated_time: 't0', spend: opts.spend ?? 50, spend_cap: null });
    return { plan: r.rows[0], cid, setId, code };
  };
  const runOf = async (cid: string, date: string) => (await pool.query(`SELECT * FROM night_pause_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`, [cid, date])).rows[0];
  const postsTo = (cid: string) => posts.filter((p) => p.endpoint === `/${cid}`);
  const alertsOf = async (cid: string) => (await pool.query(`SELECT rule_code, message FROM ad_alerts WHERE meta_ad_id = $1 ORDER BY created_at`, [cid])).rows;
  const auditsOf = async (code: string) => (await pool.query(`SELECT event_type, description FROM audit_logs WHERE description LIKE $1 ORDER BY created_at`, [`%${code}%`])).rows;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ('act_norqva_0118', 'NORQVA 0118', 'BRL', FALSE)
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
    admin = await mk('admin.night0118@norqva.test', 'ADMIN');
    perf = await mk('perf.night0118@norqva.test', 'PERFORMANCE');
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    process.env.NIGHT_PAUSE_ENABLED = 'true';
    resetMetaPreflightCacheForTesting();
    posts = [];
    failPost = null;
    failGet = null;
    // planos de outros testes (e de outras suítes) ficam fora desta noite
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = FALSE`);
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
    onMeta.get(adsManager.cid)!.updated_time = 'mexeu-no-gerenciador';
    onMeta.get(metaBudget.cid)!.daily_budget = 80;
    await service().run(pool, at(date, '06:01'));
    for (const x of [capped, capChanged, budget, adsManager, metaBudget]) {
      expect(postsTo(x.cid).filter((p) => p.body.status === 'ACTIVE')).toHaveLength(0);
      expect((await runOf(x.cid, date)).state).toBe('CANCELLED');
    }
    expect((await runOf(capped.cid, date)).reason).toMatch(/vigia/);
    expect((await runOf(capChanged.cid, date)).reason).toMatch(/teto/);
    expect((await runOf(budget.cid, date)).reason).toMatch(/orçamento/);
    expect((await runOf(adsManager.cid, date)).reason).toMatch(/alterada na Meta/);
    expect((await runOf(metaBudget.cid, date)).reason).toMatch(/orçamento da campanha mudou na Meta/);
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
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED', read_failures: 1 });
    failGet = null;
    await service().run(pool, at(date, '06:03'));
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
