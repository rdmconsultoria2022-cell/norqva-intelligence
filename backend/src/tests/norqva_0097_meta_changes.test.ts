// NORQVA-0097: fichas de alteração na Meta. Graph API simulada: nunca fala com a Meta.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, resetMetaPreflightCacheForTesting, OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { setMetaControlClientFactoryForTesting } from '../controllers/metaControlController';
import { readbackMatches } from '../services/meta/metaChangeService';

describe('NORQVA-0097 — releitura', () => {
  it('confere situação e orçamento', () => {
    expect(readbackMatches('STATUS', 'PAUSED', { status: 'PAUSED', daily_budget: null })).toBe(true);
    expect(readbackMatches('STATUS', 'PAUSED', { status: 'ACTIVE', daily_budget: null })).toBe(false);
    expect(readbackMatches('DAILY_BUDGET', '30.00', { status: 'ACTIVE', daily_budget: 30 })).toBe(true);
    expect(readbackMatches('DAILY_BUDGET', '30.00', { status: 'ACTIVE', daily_budget: 20 })).toBe(false);
    expect(readbackMatches('DAILY_BUDGET', '30.00', { status: 'ACTIVE', daily_budget: null })).toBe(false);
  });
});

describe.sequential('NORQVA-0097 — fichas de alteração (HTTP)', () => {
  let pool: Pool;
  let admin: string;
  let perf: string;
  let ops: string;
  let accountDbId: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_MAX_DAILY_BUDGET_BRL'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  // o que a Meta "tem" para cada objeto (releitura)
  const onMeta = new Map<string, { status?: string; daily_budget?: number | null }>();
  let post: ReturnType<typeof vi.fn>;

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

  const as = (token: string) => ({
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`)
  });
  const seed = async () => {
    const cmpDb = crypto.randomUUID();
    const cmp = `cmp97_${crypto.randomUUID().slice(0, 8)}`;
    const setMeta = `set97_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo)
       VALUES ($1, $2, $3, 'Campanha 0097', 'ACTIVE', 'ACTIVE', FALSE)`,
      [cmpDb, cmp, accountDbId]
    );
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo)
       VALUES (gen_random_uuid(), $1, $2, 'Conjunto 0097', 'ACTIVE', 'ACTIVE', 20, FALSE)`,
      [setMeta, cmpDb]
    );
    onMeta.set(cmp, { status: 'ACTIVE' });
    onMeta.set(setMeta, { status: 'ACTIVE', daily_budget: 20 });
    return { cmp, setMeta };
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $4, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, `U ${role}`, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.changes0097@norqva.test', 'ADMIN');
    perf = await mk('perf.changes0097@norqva.test', 'PERFORMANCE');
    ops = await mk('ops.changes0097@norqva.test', 'OPERATIONS');
  });

  beforeEach(async () => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_2887010388338951';
    delete process.env.META_MAX_DAILY_BUDGET_BRL;
    resetMetaPreflightCacheForTesting();
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo)
       VALUES ('act_norqva_0097', 'NORQVA 0097', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    accountDbId = acct.rows[0].id;
    // a Meta "aplica" o que recebe; a releitura devolve o valor novo
    post = vi.fn(async (endpoint: string, body: any) => {
      const id = endpoint.slice(1);
      const cur = onMeta.get(id) || {};
      if (body?.status) cur.status = body.status;
      if (body?.daily_budget) cur.daily_budget = Number(body.daily_budget) / 100;
      onMeta.set(id, cur);
      return { success: true };
    });
    setMetaControlClientFactoryForTesting(() => new MetaMutatingClient(post as any, undefined, get()));
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setMetaControlClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  it('administrador pausa: só confirma depois de reler a Meta; repetir o pedido não envia de novo', async () => {
    const { cmp } = await seed();
    const id = crypto.randomUUID();
    const r = await as(admin).post('/api/meta-changes?mode=real', { id, entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' });
    expect(r.status).toBe(200);
    expect(r.body.change).toMatchObject({ state: 'CONFIRMED', previous_value: 'ACTIVE', requested_value: 'PAUSED', meta_value: 'PAUSED' });
    const again = await as(admin).post('/api/meta-changes?mode=real', { id, entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' });
    expect(again.body.repeated).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('Meta aceitou mas a releitura não mostra: fica aguardando conferência até conferir', async () => {
    const { cmp } = await seed();
    post.mockImplementationOnce(async () => ({ success: true })); // aceita sem aplicar ainda
    const r = await as(admin).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' });
    expect(r.body.change.state).toBe('UNCONFIRMED');
    onMeta.set(cmp, { status: 'PAUSED' });
    const v = await as(perf).post(`/api/meta-changes/${r.body.change.id}/verify?mode=real`);
    expect(v.status).toBe(200);
    expect(v.body.change.state).toBe('CONFIRMED');
  });

  it('Performance pede orçamento: espera o administrador; autorizado, vai e confirma', async () => {
    const { setMeta } = await seed();
    const r = await as(perf).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'adset', meta_id: setMeta, kind: 'DAILY_BUDGET', value: 30 });
    expect(r.status).toBe(202);
    expect(r.body.change).toMatchObject({ state: 'AWAITING_APPROVAL', previous_value: '20.00', requested_value: '30.00' });
    expect(post).not.toHaveBeenCalled();
    expect((await as(perf).post(`/api/meta-changes/${r.body.change.id}/approve?mode=real`)).status).toBe(403);

    const a = await as(admin).post(`/api/meta-changes/${r.body.change.id}/approve?mode=real`);
    expect(a.status).toBe(200);
    expect(a.body.change).toMatchObject({ state: 'CONFIRMED', meta_value: '30.00' });
    expect(a.body.change.approved_by_name).toBe('U ADMIN');
    expect((await as(admin).post(`/api/meta-changes/${r.body.change.id}/approve?mode=real`)).status).toBe(409);
  });

  it('Performance pausa sem esperar; reativar espera e pode ser recusado', async () => {
    const { cmp } = await seed();
    const p = await as(perf).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' });
    expect(p.status).toBe(200);
    expect(p.body.change.state).toBe('CONFIRMED');

    const re = await as(perf).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'ACTIVE' });
    expect(re.status).toBe(202);
    const no = await as(admin).post(`/api/meta-changes/${re.body.change.id}/reject?mode=real`);
    expect(no.body.change.state).toBe('REJECTED');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('com a chave da Meta desligada a ficha falha com o motivo e nada é enviado', async () => {
    const { cmp } = await seed();
    process.env.META_MUTATION_ENABLED = 'false';
    const r = await as(admin).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' });
    expect(r.body.change.state).toBe('FAILED');
    expect(r.body.change.error).toContain('META_MUTATION_ENABLED');
    expect(post).not.toHaveBeenCalled();
  });

  it('outros perfis só veem as fichas', async () => {
    const { cmp } = await seed();
    expect((await as(ops).post('/api/meta-changes?mode=real', { id: crypto.randomUUID(), entity_type: 'campaign', meta_id: cmp, kind: 'STATUS', value: 'PAUSED' })).status).toBe(403);
    const l = await as(ops).get(`/api/meta-changes?mode=real&campaign=${cmp}`);
    expect(l.status).toBe(200);
    expect(Array.isArray(l.body.changes)).toBe(true);
  });
});
