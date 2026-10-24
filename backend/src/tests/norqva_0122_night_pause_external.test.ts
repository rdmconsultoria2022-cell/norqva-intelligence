// NORQVA-0122: pausa noturna das campanhas criadas fora do NORQVA. Graph API simulada: nunca fala com a Meta.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { NightPauseService, setNightPauseClientFactoryForTesting } from '../services/campaigns/nightPauseService';

// Horário de Brasília = UTC-3; o servidor (e o CI) roda em UTC.
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m));
};

describe.sequential('NORQVA-0122 — pausa noturna das campanhas criadas fora do NORQVA', () => {
  let pool: Pool;
  let accountDbId: string;
  let admin: string;
  let perf: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'NIGHT_PAUSE_ENABLED', 'META_APP_ID'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const ACCOUNT = '2887010388338951';
  const ADS_MANAGER_APP = '119211728144504';
  type MetaObj = {
    status: string;
    daily_budget: number | null;
    updated_time: string;
    spend_cap: number | null;
    amount_spent: number;
    name: string;
    account_id: string;
    children: string[];
  };
  const onMeta = new Map<string, MetaObj>();
  let posts: Array<{ endpoint: string; body: any }>;
  let activities: any[];
  let tick = 0;
  let day = 0;
  const nextDay = () => {
    day += 1;
    return new Date(Date.UTC(2028, 0, 1) + day * 86400000).toISOString().slice(0, 10);
  };

  const get = vi.fn(async (endpoint: string, params?: any) => {
    if (/^\/act_[^/]+\/activities$/.test(endpoint)) return { data: activities };
    if (endpoint === '/app') return { id: 'app1' };
    if (endpoint === '/me') return { id: 'u1' };
    if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
    if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
    if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
    const child = /^\/(\d+)\/(adsets|ads)$/.exec(endpoint);
    if (child) {
      const o = onMeta.get(child[1]);
      if (!o) throw new Error('unexpected ' + endpoint);
      return { data: o.children.filter((c) => (child[2] === 'adsets' ? c.startsWith('set') : c.startsWith('ad'))).map((c) => ({ id: c.replace(/^(set|ad)/, '') })) };
    }
    const ins = /^\/(\d+)\/insights$/.exec(endpoint);
    if (ins) return { data: [{ spend: String(onMeta.get(ins[1])?.amount_spent ?? 0) }] };
    const obj = onMeta.get(endpoint.slice(1));
    if (obj) {
      return {
        id: endpoint.slice(1),
        name: obj.name,
        account_id: obj.account_id,
        status: obj.status,
        effective_status: obj.status,
        daily_budget: obj.daily_budget === null ? undefined : String(obj.daily_budget * 100),
        updated_time: obj.updated_time,
        spend_cap: obj.spend_cap === null ? '0' : String(obj.spend_cap * 100),
        amount_spent: String(Math.round(obj.amount_spent * 100)),
        _fields: params?.fields
      };
    }
    throw new Error('unexpected ' + endpoint);
  });
  const post = vi.fn(async (endpoint: string, body: any) => {
    posts.push({ endpoint, body });
    const obj = onMeta.get(endpoint.slice(1));
    if (obj && body?.status) {
      obj.status = body.status;
      obj.updated_time = `2028-01-01T00:00:${String(++tick % 60).padStart(2, '0')}+0000`;
    }
    return { success: true };
  });
  const service = () => new NightPauseService(() => new MetaMutatingClient(post as any, undefined, get as any));

  const newId = () => String(1210000000000 + Math.floor(Math.random() * 1e9));
  /** Campanha na Meta (sincronizada) e, se pedido, cadastrada na lista de externas. */
  const seedExternal = async (opts: { metaStatus?: string; enabled?: boolean; start?: string; end?: string; register?: boolean; spendCap?: number | null; spent?: number; synced?: boolean } = {}) => {
    const cid = newId();
    const setId = newId();
    const adId = newId();
    const name = `Externa ${cid.slice(-5)}`;
    if (opts.synced !== false) {
      await pool.query(
        `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, $3, $4, $5, $5, FALSE)`,
        [crypto.randomUUID(), cid, accountDbId, name, opts.metaStatus || 'ACTIVE']
      );
    }
    onMeta.set(cid, {
      status: opts.metaStatus || 'ACTIVE',
      daily_budget: 30,
      updated_time: '2028-01-01T00:00:00+0000',
      spend_cap: opts.spendCap ?? null,
      amount_spent: opts.spent ?? 40,
      name,
      account_id: ACCOUNT,
      children: [`set${setId}`, `ad${adId}`]
    });
    let ext: any = null;
    if (opts.register !== false) {
      ext = (
        await pool.query(
          `INSERT INTO night_pause_external_campaigns (meta_campaign_id, name, enabled, night_pause_start, night_pause_end) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [cid, name, opts.enabled ?? true, opts.start ?? '00:00', opts.end ?? '06:00']
        )
      ).rows[0];
    }
    return { cid, setId, adId, name, ext };
  };
  const runOf = async (cid: string, date: string) => (await pool.query(`SELECT * FROM night_pause_external_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`, [cid, date])).rows[0];
  const postsTo = (cid: string) => posts.filter((p) => p.endpoint === `/${cid}`);
  const actives = (cid: string) => postsTo(cid).filter((p) => p.body.status === 'ACTIVE');
  const alertsOf = async (cid: string) => (await pool.query(`SELECT rule_code, message FROM ad_alerts WHERE meta_ad_id = $1 ORDER BY created_at`, [cid])).rows;
  const auditsOf = async (cid: string) => (await pool.query(`SELECT event_type, description FROM audit_logs WHERE description LIKE $1 ORDER BY created_at`, [`%${cid}%`])).rows;
  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: any = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    del: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ('act_norqva_0122', 'NORQVA 0122', 'BRL', FALSE)
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
    admin = await mk('admin.night0122@norqva.test', 'ADMIN');
    perf = await mk('perf.night0122@norqva.test', 'PERFORMANCE');
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = `act_${ACCOUNT}`;
    process.env.NIGHT_PAUSE_ENABLED = 'true';
    delete process.env.META_APP_ID;
    resetMetaPreflightCacheForTesting();
    NightPauseService.resetAppCacheForTesting();
    posts = [];
    activities = [];
    setNightPauseClientFactoryForTesting(() => new MetaMutatingClient(post as any, undefined, get as any));
    // planos e externas de outros testes (e as duas campanhas da migration) ficam fora desta noite
    await pool.query(`UPDATE launch_plans SET night_pause_enabled = FALSE`);
    await pool.query(`UPDATE night_pause_external_campaigns SET enabled = FALSE`);
  });

  afterEach(() => {
    setNightPauseClientFactoryForTesting(null);
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    resetMetaPreflightCacheForTesting();
  });

  it('a migration cadastra as duas campanhas ativas do dia do contrato', async () => {
    const r = (await pool.query(`SELECT meta_campaign_id, name FROM night_pause_external_campaigns WHERE meta_campaign_id IN ('120250112900200097', '120250081197880097') ORDER BY meta_campaign_id`)).rows;
    expect(r.map((x) => x.meta_campaign_id)).toEqual(['120250081197880097', '120250112900200097']);
    expect(r.map((x) => x.name)).toEqual(['NQ – Seca Barriga – Teste – Vendas', 'NQ – Kit 5 livros – Teste – Vendas']);
  });

  it('pausa às 00:00 só a externa ATIVA e ligada; 06:00 reativa só a que pausou (só status, só na campanha)', async () => {
    const date = nextDay();
    const a = await seedExternal();
    const b = await seedExternal({ metaStatus: 'PAUSED' });
    const c = await seedExternal({ enabled: false });
    const d = await seedExternal({ register: false }); // não está na lista
    await service().run(pool, at(date, '00:00'));
    expect(postsTo(a.cid)).toEqual([{ endpoint: `/${a.cid}`, body: { status: 'PAUSED' } }]);
    expect(postsTo(b.cid)).toHaveLength(0);
    expect(postsTo(c.cid)).toHaveLength(0);
    expect(postsTo(d.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED', external_id: a.ext.id });
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'SKIPPED' });
    expect(await runOf(c.cid, date)).toBeUndefined();
    // ficha "Pausa noturna" confirmada, sem plano
    const ch = (await pool.query(`SELECT * FROM meta_change_requests WHERE meta_campaign_id = $1 ORDER BY created_at`, [a.cid])).rows;
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ origin: 'NIGHT_PAUSE', state: 'CONFIRMED', plan_id: null, requested_value: 'PAUSED' });
    expect((await auditsOf(a.cid)).map((x) => x.event_type)).toContain('NIGHT_PAUSE_DONE');

    await service().run(pool, at(date, '05:59'));
    expect(actives(a.cid)).toHaveLength(0);
    await service().run(pool, at(date, '06:00'));
    expect(postsTo(a.cid).map((p) => p.body.status)).toEqual(['PAUSED', 'ACTIVE']);
    expect(postsTo(b.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED', activity_check: 'CLEAN' });
    expect((await auditsOf(a.cid)).map((x) => x.event_type)).toContain('NIGHT_PAUSE_RESUMED');
    for (const p of posts) {
      expect(Object.keys(p.body)).toEqual(['status']);
      expect(p.endpoint).toMatch(/^\/\d+$/);
      // nunca conjunto ou anúncio
      expect([a.setId, a.adId].map((x) => `/${x}`)).not.toContain(p.endpoint);
    }
  });

  it('dono mexeu no Gerenciador (campanha ou conjunto) durante a noite: não reativa, com aviso', async () => {
    const date = nextDay();
    const a = await seedExternal();
    const b = await seedExternal();
    await service().run(pool, at(date, '00:01'));
    const now = new Date().toISOString();
    activities = [
      { event_type: 'update_campaign_run_status', event_time: now, object_id: a.cid, actor_id: 'u1', application_id: ADS_MANAGER_APP },
      // orçamento do conjunto (ABO) da campanha B: objeto lido na Meta
      { event_type: 'update_ad_set_budget', event_time: now, object_id: b.setId, actor_id: 'u1', application_id: ADS_MANAGER_APP }
    ];
    await service().run(pool, at(date, '06:01'));
    expect(actives(a.cid)).toHaveLength(0);
    expect(actives(b.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'CANCELLED', activity_check: 'TOUCHED' });
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'CANCELLED', activity_check: 'TOUCHED' });
    expect((await alertsOf(a.cid)).map((x) => x.rule_code)).toContain('NIGHT_PAUSE_RESUME_CANCELLED');
  });

  it('dono pausou pelo NORQVA (ficha ou decisão) durante a noite: não reativa', async () => {
    const date = nextDay();
    const a = await seedExternal();
    const b = await seedExternal();
    await service().run(pool, at(date, '00:01'));
    await pool.query(
      `INSERT INTO meta_change_requests (id, entity_type, meta_id, meta_campaign_id, kind, previous_value, requested_value, state, requested_by_name, requested_by_role)
       VALUES ($1, 'CAMPAIGN', $2, $2, 'STATUS', 'PAUSED', 'PAUSED', 'CONFIRMED', 'Perf', 'PERFORMANCE')`,
      [crypto.randomUUID(), a.cid]
    );
    await pool.query(
      `INSERT INTO decision_events (correlation_id, phase, action, decision, actor_type, meta_ids) VALUES ($1, 'EXECUTED', 'META_ENTITY_STATUS', 'CAMPAIGN:PAUSED', 'HUMAN', $2::jsonb)`,
      [crypto.randomUUID(), JSON.stringify([b.cid])]
    );
    await service().run(pool, at(date, '06:01'));
    expect(actives(a.cid)).toHaveLength(0);
    expect(actives(b.cid)).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/alteração pedida/);
    expect((await runOf(b.cid, date)).reason).toMatch(/META_ENTITY_STATUS/);
  });

  it('limite de gastos da campanha atingido (amount_spent ≥ spend_cap): não reativa', async () => {
    const date = nextDay();
    const a = await seedExternal({ spendCap: 300, spent: 120 });
    const b = await seedExternal({ spendCap: 300, spent: 120 });
    await service().run(pool, at(date, '00:01'));
    onMeta.get(a.cid)!.amount_spent = 300;
    await service().run(pool, at(date, '06:01'));
    expect(actives(a.cid)).toHaveLength(0);
    expect((await runOf(a.cid, date)).reason).toMatch(/limite de gastos/);
    expect(actives(b.cid)).toHaveLength(1);
  });

  it('orçamento mudado na Meta ou campanha alterada (sem registro de atividades): não reativa', async () => {
    const date = nextDay();
    const a = await seedExternal();
    await service().run(pool, at(date, '00:01'));
    onMeta.get(a.cid)!.daily_budget = 80;
    await service().run(pool, at(date, '06:01'));
    expect((await runOf(a.cid, date)).reason).toMatch(/orçamento da campanha mudou/);
  });

  it('campanha que também é de um plano: o plano manda (a lista de externas não pausa)', async () => {
    const date = nextDay();
    const a = await seedExternal();
    await pool.query(
      `INSERT INTO launch_plans (code, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, night_pause_enabled)
       VALUES ($1, 'ACTIVE', '{}', $2, 30, 300, 'teste 0122', FALSE)`,
      [`NP21-${crypto.randomUUID().slice(0, 6)}`, JSON.stringify({ campaign: { c: a.cid } })]
    );
    await service().run(pool, at(date, '00:01'));
    expect(postsTo(a.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toBeUndefined();
    // e não dá para cadastrar uma campanha de plano
    const r = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: a.cid });
    expect(r.status).toBe(409);
  });

  it('desligada ou tirada da lista durante a noite: a pausa desta noite ainda volta; na noite seguinte não pausa', async () => {
    const date = nextDay();
    const a = await seedExternal();
    const b = await seedExternal();
    await service().run(pool, at(date, '00:01'));
    await pool.query(`UPDATE night_pause_external_campaigns SET enabled = FALSE WHERE id = $1`, [a.ext.id]);
    await pool.query(`UPDATE night_pause_external_campaigns SET deleted_at = NOW() WHERE id = $1`, [b.ext.id]);
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    expect(await runOf(b.cid, date)).toMatchObject({ state: 'REACTIVATED' });
    const next = nextDay();
    await service().run(pool, at(next, '00:01'));
    expect(postsTo(a.cid).map((p) => p.body.status)).toEqual(['PAUSED', 'ACTIVE']);
    expect(postsTo(b.cid).map((p) => p.body.status)).toEqual(['PAUSED', 'ACTIVE']);
  });

  it('ciclo duplo (ou duas instâncias): pausa e reativa uma vez só; nunca ativa o que não pausou', async () => {
    const date = nextDay();
    const a = await seedExternal();
    await Promise.all([service().run(pool, at(date, '00:02')), service().run(pool, at(date, '00:02'))]);
    await service().run(pool, at(date, '00:04'));
    expect(postsTo(a.cid).filter((p) => p.body.status === 'PAUSED')).toHaveLength(1);
    await Promise.all([service().run(pool, at(date, '06:02')), service().run(pool, at(date, '06:02'))]);
    await service().run(pool, at(date, '06:04'));
    expect(actives(a.cid)).toHaveLength(1);
    // reativada pelo dono no meio da noite depois de "não estava ativa": não pausa
    const b = await seedExternal({ metaStatus: 'PAUSED' });
    const d2 = nextDay();
    await service().run(pool, at(d2, '00:01'));
    onMeta.get(b.cid)!.status = 'ACTIVE';
    await service().run(pool, at(d2, '00:30'));
    await service().run(pool, at(d2, '06:01'));
    expect(postsTo(b.cid)).toHaveLength(0);
  });

  it('só pausa nos primeiros 60 minutos da janela', async () => {
    const date = nextDay();
    const a = await seedExternal();
    await service().run(pool, at(date, '01:00'));
    expect(postsTo(a.cid)).toHaveLength(0);
    expect(await runOf(a.cid, date)).toBeUndefined();
  });

  it('campanha ainda fora de meta_campaigns: o primeiro ciclo cria a cópia mínima e a pausa funciona', async () => {
    const date = nextDay();
    const a = await seedExternal({ synced: false });
    expect((await pool.query(`SELECT 1 FROM meta_campaigns WHERE meta_campaign_id = $1`, [a.cid])).rows).toHaveLength(0);
    await service().run(pool, at(date, '00:01'));
    const m = (await pool.query(`SELECT name, status, data_provenance, daily_budget, is_demo FROM meta_campaigns WHERE meta_campaign_id = $1`, [a.cid])).rows[0];
    expect(m).toMatchObject({ name: a.name, data_provenance: 'COMMERCIAL_PRODUCTION', is_demo: false });
    expect(Number(m.daily_budget)).toBe(30);
    expect(postsTo(a.cid)).toEqual([{ endpoint: `/${a.cid}`, body: { status: 'PAUSED' } }]);
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'PAUSED' });
    await service().run(pool, at(date, '06:01'));
    expect(await runOf(a.cid, date)).toMatchObject({ state: 'REACTIVATED' });
  });

  it('cópia impossível (outra conta): aviso no primeiro ciclo, uma vez só; nada é pausado; linha existente nunca muda', async () => {
    const date = nextDay();
    const a = await seedExternal({ synced: false });
    onMeta.get(a.cid)!.account_id = '999999999';
    await service().run(pool, at(date, '00:01'));
    await service().run(pool, at(date, '00:03'));
    expect(postsTo(a.cid)).toHaveLength(0);
    expect((await alertsOf(a.cid)).filter((x) => x.rule_code === 'NIGHT_PAUSE_MIRROR_FAILED')).toHaveLength(1);
    const ext = (await pool.query(`SELECT mirror_error FROM night_pause_external_campaigns WHERE id = $1`, [a.ext.id])).rows[0];
    expect(ext.mirror_error).toMatch(/another ad account/);
    // campanha já sincronizada: a cópia não altera a linha da sincronização
    const b = await seedExternal();
    onMeta.get(b.cid)!.name = 'Nome novo na Meta';
    await service().run(pool, at(nextDay(), '03:00'));
    expect((await pool.query(`SELECT name FROM meta_campaigns WHERE meta_campaign_id = $1`, [b.cid])).rows[0].name).toBe(b.name);
  });

  it('adicionar pela tela já cria a cópia mínima (e avisa na hora se não der)', async () => {
    const a = await seedExternal({ register: false, synced: false });
    const r = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: a.cid });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ mirror: 'OK', mirror_error: null });
    expect((await pool.query(`SELECT data_provenance FROM meta_campaigns WHERE meta_campaign_id = $1`, [a.cid])).rows[0].data_provenance).toBe('COMMERCIAL_PRODUCTION');
  });

  it('telas: só ADMIN; adicionar confere na Meta e na conta; editar valida; tirar da lista é suave', async () => {
    const denied = await as(perf).get('/api/night-pause/external?mode=real');
    expect(denied.status).toBe(403);

    const novo = await seedExternal({ register: false });
    const badId = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: 'abc' });
    expect(badId.status).toBe(400);
    const other = await seedExternal({ register: false });
    onMeta.get(other.cid)!.account_id = '999999999';
    const wrongAccount = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: other.cid });
    expect(wrongAccount.status).toBe(422);
    expect(wrongAccount.body.error).toMatch(/conta de anúncios/);
    const missing = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: '1219999999999' });
    expect(missing.status).toBe(422);
    expect(missing.body.error).toMatch(/Não foi possível achar/);

    const added = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: novo.cid });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ meta_campaign_id: novo.cid, name: novo.name, enabled: true, start: '00:00', end: '06:00' });

    const list = await as(admin).get('/api/night-pause/external?mode=real');
    expect(list.status).toBe(200);
    const row = list.body.campaigns.find((c: any) => c.meta_campaign_id === novo.cid);
    expect(row.meta).toMatchObject({ status: 'ACTIVE' });
    expect(Array.isArray(row.runs)).toBe(true);

    const late = await as(admin).patch(`/api/night-pause/external/${row.id}?mode=real`, { start: '22:00', end: '23:58' });
    expect(late.status).toBe(400);
    const ok = await as(admin).patch(`/api/night-pause/external/${row.id}?mode=real`, { enabled: false, start: '01:00', end: '05:00' });
    expect(ok.body).toMatchObject({ enabled: false, start: '01:00', end: '05:00' });
    const perfPatch = await as(perf).patch(`/api/night-pause/external/${row.id}?mode=real`, { enabled: true });
    expect(perfPatch.status).toBe(403);

    const del = await as(admin).del(`/api/night-pause/external/${row.id}?mode=real`);
    expect(del.status).toBe(200);
    const still = (await pool.query(`SELECT deleted_at FROM night_pause_external_campaigns WHERE id = $1`, [row.id])).rows[0];
    expect(still.deleted_at).not.toBeNull();
    const after = await as(admin).get('/api/night-pause/external?mode=real&live=0');
    expect(after.body.campaigns.some((c: any) => c.meta_campaign_id === novo.cid)).toBe(false);
    // adicionar de novo volta a mesma linha
    const again = await as(admin).post('/api/night-pause/external?mode=real', { meta_campaign_id: novo.cid });
    expect(again.status).toBe(201);
    expect(again.body.id).toBe(row.id);
    const audits = (await auditsOf(novo.cid)).map((x) => x.event_type);
    expect(audits).toEqual(expect.arrayContaining(['NIGHT_PAUSE_EXTERNAL_ADDED', 'NIGHT_PAUSE_SETTINGS_CHANGED', 'NIGHT_PAUSE_EXTERNAL_REMOVED']));
    // nada disso fala com a Meta para mudar algo
    expect(posts).toHaveLength(0);
  });
});
