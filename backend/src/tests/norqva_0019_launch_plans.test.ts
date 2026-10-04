import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import {
  MetaMutatingClient,
  OFFICIAL_NORQVA_PIXEL_ID,
  resetMetaPreflightCacheForTesting
} from '../services/meta/metaMutatingClient';
import { setLaunchPlanClientFactoryForTesting } from '../controllers/launchPlanController';
import { validateLaunchPlanInput, assertSpecCreatesOnlyNewObjects, LaunchPlanError } from '../services/launchPlans/launchPlanService';

// NORQVA-0019 (D-0010): campanhas criadas PAUSADAS pelo Claude, ativadas só pela resposta do operador.
describe('NORQVA-0019 — launch plans', () => {
  let pool: Pool;
  let adminId: string;
  let adminToken: string;
  let perfToken: string;
  let offerHumanId: string;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_MAX_DAILY_BUDGET_BRL', 'META_BRAND_DESTINATION_HOSTS'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const ACT = 'act_2887010388338951';
  const PAGE_ID = '1287452237795325';

  // Graph mock: records every POST; ids are generated per object type.
  function makeGraph(
    opts: {
      failOn?: (endpoint: string, payload: any, n: number) => boolean;
      // the object IS created on "Meta" but the response is lost (timeout after the POST landed)
      loseResponseOn?: (endpoint: string, payload: any, n: number) => boolean;
      failListing?: boolean;
      preexisting?: { parent: string; edge: string; name: string; status: string }[];
    } = {}
  ) {
    let n = 0;
    const calls: { endpoint: string; payload: any }[] = [];
    // live "Meta" registry: parent path + edge -> objects
    const registry: { parent: string; edge: string; id: string; name: string; status: string }[] = (opts.preexisting || []).map((o) => ({
      ...o,
      id: `pre_${crypto.randomUUID().slice(0, 8)}`
    }));
    const post = vi.fn(async (endpoint: string, payload: any) => {
      n++;
      calls.push({ endpoint, payload });
      if (opts.failOn && opts.failOn(endpoint, payload, n)) throw new Error('[META GRAPH API ERROR]: simulated failure');
      const tag = crypto.randomUUID().slice(0, 8);
      let id: string | null = null;
      let edge = '';
      if (endpoint.endsWith('/campaigns')) { id = `lpcmp_${tag}`; edge = 'campaigns'; }
      else if (endpoint.endsWith('/adsets')) { id = `lpset_${tag}`; edge = 'adsets'; }
      else if (endpoint.endsWith('/advideos')) id = `lpvid_${tag}`;
      else if (endpoint.endsWith('/adcreatives')) id = `lpcrt_${tag}`;
      else if (endpoint.endsWith('/ads')) { id = `lpad_${tag}`; edge = 'ads'; }
      if (!id) return { success: true };
      if (edge) {
        // ad sets/ads are listed under their parent object, campaigns under the account
        const parent = edge === 'campaigns' ? endpoint.slice(0, -'/campaigns'.length)
          : edge === 'adsets' ? `/${payload.campaign_id}` : `/${payload.adset_id}`;
        registry.push({ parent, edge, id, name: String(payload.name), status: String(payload.status || 'PAUSED') });
      }
      if (opts.loseResponseOn && opts.loseResponseOn(endpoint, payload, n)) {
        throw new Error('[META TIMEOUT EXCEPTION]: simulated lost response after the object was created');
      }
      return { id };
    });
    const get = vi.fn(async (endpoint: string, params: Record<string, string> = {}) => {
      const listing = endpoint.match(/^(.*)\/(campaigns|adsets|ads)$/);
      if (listing && params && params.filtering) {
        if (opts.failListing) throw new Error('[META GRAPH API ERROR]: listing unavailable');
        const name = JSON.parse(params.filtering)[0].value;
        const parent = listing[1].startsWith('/') ? listing[1] : '/' + listing[1];
        return { data: registry.filter((o) => o.parent === parent && o.edge === listing[2] && o.name === name).map((o) => ({ id: o.id, name: o.name, status: o.status })) };
      }
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      if (endpoint.startsWith('/lpvid_')) return { id: endpoint.slice(1), status: { video_status: 'ready' }, picture: 'https://scontent.example.com/thumb.jpg' };
      throw new Error('unexpected GET ' + endpoint);
    });
    const client = new MetaMutatingClient(post as any, undefined, get as any);
    setLaunchPlanClientFactoryForTesting(() => client);
    const creations = () => calls.filter((c) => /\/(campaigns|adsets|advideos|adcreatives|ads)$/.test(c.endpoint));
    return { post, get, calls, creations, registry };
  }

  const planBody = (over: { code?: string; campaignName?: string; spec?: any } = {}) => {
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const campaign = over.campaignName || `NORQVA_T19_${suffix}`;
    const variants = [
      ['T19_SET_A', 'T19_AD_A'],
      ['T19_SET_B', 'T19_AD_B'],
      ['T19_SET_C', 'T19_AD_C']
    ];
    return {
      code: over.code || `T19-${suffix}`,
      offer_human_id: offerHumanId,
      max_spend_brl: 420,
      question_text: `Ativar ${campaign} com R$ 45/dia (3 × R$ 15), teto de R$ 420?`,
      spec: {
        campaign: { name: campaign, objective: 'OUTCOME_SALES' },
        pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
        custom_event_type: 'PURCHASE',
        optimization_goal: 'OFFSITE_CONVERSIONS',
        page_id: PAGE_ID,
        adsets: variants.map(([s]) => ({
          name: s,
          daily_budget_brl: 15,
          targeting: { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true },
          targeting_summary: 'Brasil 25–65'
        })),
        ads: variants.map(([s, a]) => ({
          name: a,
          adset_name: s,
          video_url: `https://files.example.com/${a}.mp4`,
          primary_text: 'Massa fresca e molho de verdade.',
          headline: 'Trattoria em Casa · R$ 19,90',
          cta: 'SEE_DETAILS',
          destination_url: `https://trattoria.norqva.com.br/p/${offerHumanId}`,
          url_tags: `utm_source=meta&utm_medium=paid_social&utm_campaign=${campaign}&utm_content=${a}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`
        })),
        ...(over.spec || {})
      }
    };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const draft = async (body: any = planBody()) => {
    const r = await request(app).post('/api/launch-plans').set(auth(adminToken)).send(body);
    expect(r.status).toBe(201);
    return r.body;
  };
  const getPlan = async (id: string) => (await pool.query('SELECT * FROM launch_plans WHERE id = $1', [id])).rows[0];
  const createdPlan = async () => {
    const graph = makeGraph();
    const plan = await draft();
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(200);
    return { plan: r.body.plan, graph };
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, $1, $2, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
         RETURNING id, auth_user_id, email`,
        [email, role]
      );
      return { id: r.rows[0].id, token: signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role }) };
    };
    const admin = await mk('admin.norqva0019@norqva.test', 'ADMIN');
    adminId = admin.id;
    adminToken = admin.token;
    perfToken = (await mk('perf.norqva0019@norqva.test', 'PERFORMANCE')).token;

    const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
    offerHumanId = `OFF-T19${tag}`;
    const prd = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo) VALUES ($1, 'Trattoria T19', 'Culinária', 'Produto de teste NORQVA-0019', FALSE) RETURNING id`,
      [`PRD-T19${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (human_id, product_id, name, description, price, status, is_demo) VALUES ($1, $2, 'Oferta T19', 'Oferta de teste', 19.90, 'ATIVA', FALSE)`,
      [offerHumanId, prd.rows[0].id]
    );
  });

  beforeEach(() => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = ACT;
    delete process.env.META_MAX_DAILY_BUDGET_BRL;
    delete process.env.META_BRAND_DESTINATION_HOSTS;
    resetMetaPreflightCacheForTesting();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setLaunchPlanClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  it('destination guard accepts the verified brand domain and keeps rejecting everything else', () => {
    const c = new MetaMutatingClient();
    expect(() => c.assertUrlWhitelisted('https://trattoria.norqva.com.br/p/OFF-000001')).not.toThrow();
    expect(() => c.assertUrlWhitelisted('https://trattoria.norqva.com.br/p/OFF-000001?utm_source=meta')).not.toThrow();
    expect(() => c.assertUrlWhitelisted('https://norqva-intelligence-frontend.vercel.app/p/OFF-000001')).not.toThrow();
    for (const bad of [
      'http://trattoria.norqva.com.br/p/OFF-000001',
      'https://trattoria.norqva.com.br/',
      'https://trattoria.norqva.com.br/admin',
      'https://trattoria.norqva.com.br/p/OFF-000001/extra',
      'https://trattoria.norqva.com.br.evil.com/p/OFF-000001',
      'https://xtrattoria.norqva.com.br/p/OFF-000001',
      'https://evil.com/p/OFF-000001',
      'https://trattoria.norqva.com.br@evil.com/p/OFF-000001'
    ]) {
      expect(() => c.assertUrlWhitelisted(bad), bad).toThrow('Blocked non-whitelisted destination URL');
    }
    process.env.META_BRAND_DESTINATION_HOSTS = 'outra.marca.com.br';
    expect(() => c.assertUrlWhitelisted('https://trattoria.norqva.com.br/p/OFF-000001')).toThrow('Blocked non-whitelisted destination URL');
    expect(() => c.assertUrlWhitelisted('https://outra.marca.com.br/p/OFF-000001')).not.toThrow();
  });

  it('TR-EXP02 data file is a valid draft (45/day, teto 420, SEE_DETAILS) and cannot be created until videos are filled', () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'launchPlanTrExp02.json'), 'utf8'));
    const input = validateLaunchPlanInput(file);
    expect(input.code).toBe('TR-EXP02');
    expect(input.spec.campaign.name).toBe('NORQVA_TRATTORIA_EXP02_CREATIVE');
    expect(input.spec.adsets.map((a) => a.name)).toEqual(['TR_EXP02_V1_EMO', 'TR_EXP02_V2_FOOD', 'TR_EXP02_V3_HYB']);
    expect(input.spec.ads.map((a) => a.name)).toEqual(['TR_V1_EMO', 'TR_V2_FOOD', 'TR_V3_HYB']);
    expect(input.daily_budget_brl).toBe(45);
    expect(input.max_spend_brl).toBe(420);
    expect(input.spec.ads.every((a) => a.cta === 'SEE_DETAILS' && a.destination_url === 'https://trattoria.norqva.com.br/p/OFF-000001')).toBe(true);
    expect(input.spec.ads[0].url_tags).toContain('utm_content=TR_V1_EMO');
    expect(() => validateLaunchPlanInput(file, { forCreation: true })).toThrow('TO_BE_FILLED');
  });

  it('spec referencing existing Meta ids is rejected (the plan only creates new objects)', async () => {
    expect(() => assertSpecCreatesOnlyNewObjects({ campaign: { name: 'X', id: '120249722943110097' } })).toThrow(LaunchPlanError);
    expect(() => assertSpecCreatesOnlyNewObjects({ ads: [{ name: 'A', creative_id: '1' }] })).toThrow(LaunchPlanError);
    expect(() => assertSpecCreatesOnlyNewObjects({ ads: [{ name: 'A', object_story_id: '1_2' }] })).toThrow(LaunchPlanError);
    expect(() => assertSpecCreatesOnlyNewObjects({ adsets: [{ name: '120249722943110097' }] })).toThrow(LaunchPlanError);
    expect(() => assertSpecCreatesOnlyNewObjects({ pixel_id: OFFICIAL_NORQVA_PIXEL_ID, page_id: PAGE_ID })).not.toThrow();

    const body = planBody();
    body.spec.adsets[0] = { ...body.spec.adsets[0], campaign_id: '120249722943110097' } as any;
    const r = await request(app).post('/api/launch-plans').set(auth(adminToken)).send(body);
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('objetos existentes');

    const body2 = planBody({ spec: { existing_campaign_id: '120249722943110097' } });
    const r2 = await request(app).post('/api/launch-plans').set(auth(adminToken)).send(body2);
    expect(r2.status).toBe(400);
  });

  it('draft is ADMIN only and validates destination and budgets', async () => {
    const perf = await request(app).post('/api/launch-plans').set(auth(perfToken)).send(planBody());
    expect(perf.status).toBe(403);

    const badDest = planBody();
    badDest.spec.ads[0].destination_url = 'https://evil.com/p/OFF-1';
    expect((await request(app).post('/api/launch-plans').set(auth(adminToken)).send(badDest)).status).toBe(400);

    const overCeiling = planBody();
    overCeiling.spec.adsets[0].daily_budget_brl = 500;
    expect((await request(app).post('/api/launch-plans').set(auth(adminToken)).send(overCeiling)).status).toBe(400);

    const plan = await draft();
    expect(plan.status).toBe('DRAFT');
    expect(plan.daily_budget_brl).toBe(45);
    const list = await request(app).get('/api/launch-plans?status=DRAFT').set(auth(adminToken));
    expect(list.body.plans.some((p: any) => p.id === plan.id)).toBe(true);
  });

  it('create: everything PAUSED, video creative with url_tags, no decision needed, audit, then AWAITING_OPERATOR; rerun creates nothing', async () => {
    const graph = makeGraph();
    const plan = await draft();
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(200);
    expect(r.body.plan.status).toBe('AWAITING_OPERATOR');

    const created = graph.creations();
    expect(created.filter((c) => c.endpoint === `/${ACT}/campaigns`)).toHaveLength(1);
    expect(created.filter((c) => c.endpoint === `/${ACT}/adsets`)).toHaveLength(3);
    expect(created.filter((c) => c.endpoint === `/${ACT}/advideos`)).toHaveLength(3);
    expect(created.filter((c) => c.endpoint === `/${ACT}/adcreatives`)).toHaveLength(3);
    expect(created.filter((c) => c.endpoint === `/${ACT}/ads`)).toHaveLength(3);
    for (const c of created.filter((c) => /\/(campaigns|adsets|ads)$/.test(c.endpoint))) {
      expect(c.payload.status).toBe('PAUSED');
    }
    expect(graph.calls.some((c) => c.payload?.status === 'ACTIVE')).toBe(false);
    const adset = created.find((c) => c.endpoint.endsWith('/adsets'))!.payload;
    expect(adset.daily_budget).toBe(1500);
    expect(adset.promoted_object).toEqual({ pixel_id: OFFICIAL_NORQVA_PIXEL_ID, custom_event_type: 'PURCHASE' });
    expect(adset.targeting).toMatchObject({ geo_locations: { countries: ['BR'] }, age_min: 25, age_max: 65, targeting_automation: { advantage_audience: 1 } });
    const creative = created.find((c) => c.endpoint.endsWith('/adcreatives'))!.payload;
    expect(creative.object_story_spec.page_id).toBe(PAGE_ID);
    expect(creative.object_story_spec.video_data).toMatchObject({
      video_id: expect.stringMatching(/^lpvid_/),
      image_url: 'https://scontent.example.com/thumb.jpg',
      title: 'Trattoria em Casa · R$ 19,90',
      call_to_action: { type: 'SEE_DETAILS', value: { link: `https://trattoria.norqva.com.br/p/${offerHumanId}` } }
    });
    expect(creative.object_story_spec.link_data).toBeUndefined();
    expect(creative.url_tags).toContain('ad_id={{ad.id}}');
    expect(created.find((c) => c.endpoint.endsWith('/advideos'))!.payload.file_url).toBe('https://files.example.com/T19_AD_A.mp4');

    const row = await getPlan(plan.id);
    expect(row.decision_id).toBeNull();
    const ids = typeof row.meta_ids === 'string' ? JSON.parse(row.meta_ids) : row.meta_ids;
    expect(Object.keys(ids.adsets)).toHaveLength(3);
    expect(Object.keys(ids.ads)).toHaveLength(3);
    const adIds = Object.values(ids.ads) as string[];
    const mirrored = await pool.query('SELECT status FROM meta_ads WHERE meta_ad_id IN ($1, $2, $3)', adIds);
    expect(mirrored.rows.map((x: any) => x.status)).toEqual(['PAUSED', 'PAUSED', 'PAUSED']);
    const audit = await pool.query(`SELECT event_type FROM audit_logs WHERE event_type LIKE 'LAUNCH_PLAN_%' AND new_value LIKE $1`, [`%${plan.id}%`]);
    expect(audit.rows.map((a: any) => a.event_type)).toEqual(expect.arrayContaining(['LAUNCH_PLAN_CREATE_STARTED', 'LAUNCH_PLAN_AWAITING_OPERATOR']));

    const before = graph.post.mock.calls.length;
    const again = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(again.status).toBe(200);
    expect(again.body.alreadyCreated).toBe(true);
    expect(graph.post.mock.calls.length).toBe(before);
  });

  it('create is blocked by META_MUTATION_ENABLED and by role; status stays DRAFT', async () => {
    const graph = makeGraph();
    const plan = await draft();
    expect((await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(perfToken)).send({})).status).toBe(403);
    process.env.META_MUTATION_ENABLED = 'false';
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(409);
    expect(graph.post).not.toHaveBeenCalled();
    expect((await getPlan(plan.id)).status).toBe('DRAFT');
  });

  it('create refuses a campaign name that already exists in the account (e.g. the CONTROL)', async () => {
    const graph = makeGraph();
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ($1, 'NORQVA', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET updated_at = NOW() RETURNING id`,
      [ACT]
    );
    const controlName = `T19_CONTROL_${crypto.randomUUID().slice(0, 6)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, $3, 'ACTIVE', 'ACTIVE', FALSE)`,
      [`ctl_${crypto.randomUUID().slice(0, 8)}`, acct.rows[0].id, controlName]
    );
    const plan = await draft(planBody({ campaignName: controlName }));
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(409);
    expect(graph.post).not.toHaveBeenCalled();
  });

  it('partial failure marks FAILED with last_error and a rerun resumes without duplicating', async () => {
    let adsetCalls = 0;
    const failing = makeGraph({
      failOn: (endpoint) => endpoint.endsWith('/adsets') && ++adsetCalls === 2
    });
    const plan = await draft();
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(502);
    const failed = await getPlan(plan.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.last_error).toContain('simulated failure');
    const ids1 = typeof failed.meta_ids === 'string' ? JSON.parse(failed.meta_ids) : failed.meta_ids;
    expect(Object.keys(ids1.campaign)).toHaveLength(1);
    expect(Object.keys(ids1.adsets)).toEqual(['T19_SET_A']);
    expect(failing.creations().filter((c) => c.endpoint.endsWith('/campaigns'))).toHaveLength(1);

    const resumed = makeGraph();
    const r2 = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r2.status).toBe(200);
    expect(r2.body.plan.status).toBe('AWAITING_OPERATOR');
    const second = resumed.creations();
    expect(second.filter((c) => c.endpoint.endsWith('/campaigns'))).toHaveLength(0);
    expect(second.filter((c) => c.endpoint.endsWith('/adsets')).map((c) => c.payload.name)).toEqual(['T19_SET_B', 'T19_SET_C']);
    expect(second.filter((c) => c.endpoint.endsWith('/adsets'))[0].payload.campaign_id).toBe(Object.values(ids1.campaign)[0]);
    expect(second.filter((c) => c.endpoint.endsWith('/ads'))).toHaveLength(3);
  });

  it('recovery: a POST whose response was lost is adopted on rerun (live lookup by name), never duplicated', async () => {
    let lostOnce = false;
    // the 2nd ad set and the 1st ad are created on Meta but the caller never sees their ids
    let setPosts = 0;
    let adPosts = 0;
    const graph = makeGraph({
      loseResponseOn: (endpoint) => {
        if (endpoint.endsWith('/adsets') && ++setPosts === 2 && !lostOnce) { lostOnce = true; return true; }
        return false;
      }
    });
    const plan = await draft();
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(502);
    expect((await getPlan(plan.id)).status).toBe('FAILED');

    // rerun on the SAME live Meta state: the lost ad set exists PAUSED and must be adopted
    let adLost = false;
    const r2 = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r2.status).toBe(200);
    expect(r2.body.plan.status).toBe('AWAITING_OPERATOR');
    const sets = graph.registry.filter((o) => o.edge === 'adsets');
    expect(sets.map((o) => o.name).sort()).toEqual(['T19_SET_A', 'T19_SET_B', 'T19_SET_C']);
    expect(graph.registry.filter((o) => o.edge === 'campaigns')).toHaveLength(1);
    expect(graph.registry.filter((o) => o.edge === 'ads')).toHaveLength(3);
    const row = await getPlan(plan.id);
    const ids = typeof row.meta_ids === 'string' ? JSON.parse(row.meta_ids) : row.meta_ids;
    expect(ids.adsets.T19_SET_B).toBe(sets.find((o) => o.name === 'T19_SET_B')!.id);
    const adopted = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'LAUNCH_PLAN_OBJECT_ADOPTED' AND new_value LIKE $1`, [`%${plan.id}%`]);
    expect(adopted.rows.length).toBeGreaterThanOrEqual(1);
    void adPosts; void adLost;
  });

  it('recovery is fail-closed: if Meta cannot be listed, nothing is created', async () => {
    const graph = makeGraph({ failListing: true });
    const plan = await draft();
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).not.toBe(200);
    expect(graph.creations()).toHaveLength(0);
    expect((await getPlan(plan.id)).status).toBe('FAILED');
  });

  it('recovery never adopts or touches a same-name object that is not PAUSED', async () => {
    const name = `NORQVA_T19_LIVE_${crypto.randomUUID().slice(0, 6)}`;
    const graph = makeGraph({ preexisting: [{ parent: `/${ACT}`, edge: 'campaigns', name, status: 'ACTIVE' }] });
    const plan = await draft(planBody({ campaignName: name }));
    const r = await request(app).post(`/api/launch-plans/${plan.id}/create`).set(auth(adminToken)).send({});
    expect(r.status).toBe(409);
    expect(graph.creations()).toHaveLength(0);
    expect(graph.calls.some((c) => c.payload?.status === 'ACTIVE' || c.payload?.status === 'PAUSED')).toBe(false);
  });

  it('answer: ADMIN only, never with an automation token, only while AWAITING_OPERATOR', async () => {
    const plan = await draft();
    makeGraph();
    expect((await request(app).post(`/api/launch-plans/${plan.id}/answer`).set(auth(adminToken)).send({ answer: 'YES' })).status).toBe(409);

    const { plan: waiting, graph } = await createdPlan();
    const before = graph.post.mock.calls.length;
    expect((await request(app).post(`/api/launch-plans/${waiting.id}/answer`).set(auth(perfToken)).send({ answer: 'YES' })).status).toBe(403);
    const auto = await request(app)
      .post(`/api/launch-plans/${waiting.id}/answer`)
      .set(auth(adminToken))
      .set('X-Norqva-Automation-Token', 'whatever')
      .send({ answer: 'YES' });
    expect(auto.status).toBe(403);
    expect((await request(app).post(`/api/launch-plans/${waiting.id}/answer`).set(auth(adminToken)).send({ answer: 'MAYBE' })).status).toBe(400);
    expect(graph.post.mock.calls.length).toBe(before);
    expect((await getPlan(waiting.id)).status).toBe('AWAITING_OPERATOR');
  });

  it('answer NO: REJECTED, nothing activated, no decision', async () => {
    const { plan, graph } = await createdPlan();
    const before = graph.post.mock.calls.length;
    const r = await request(app).post(`/api/launch-plans/${plan.id}/answer`).set(auth(adminToken)).send({ answer: 'NO' });
    expect(r.status).toBe(200);
    expect(r.body.plan.status).toBe('REJECTED');
    expect(graph.post.mock.calls.length).toBe(before);
    const row = await getPlan(plan.id);
    expect(row.answered_by).toBe(adminId);
    expect(row.decision_id).toBeNull();
    expect((await request(app).post(`/api/launch-plans/${plan.id}/answer`).set(auth(adminToken)).send({ answer: 'YES' })).status).toBe(409);
  });

  it('answer YES: decision + experiment, capital reserved, only plan ids activated (campaign last), CONTROL untouched', async () => {
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ($1, 'NORQVA', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET updated_at = NOW() RETURNING id`,
      [ACT]
    );
    const controlId = `ctl_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, $3, 'PAUSED', 'PAUSED', FALSE)`,
      [controlId, acct.rows[0].id, `T19_CONTROL_${controlId}`]
    );

    const { plan, graph } = await createdPlan();
    const before = graph.calls.length;
    const r = await request(app).post(`/api/launch-plans/${plan.id}/answer`).set(auth(adminToken)).send({ answer: 'YES' });
    expect(r.status).toBe(200);
    expect(r.body.plan.status).toBe('ACTIVE');

    const row = await getPlan(plan.id);
    const ids = typeof row.meta_ids === 'string' ? JSON.parse(row.meta_ids) : row.meta_ids;
    const planIds = new Set<string>([...Object.values(ids.campaign), ...Object.values(ids.adsets), ...Object.values(ids.ads)] as string[]);
    const after = graph.calls.slice(before);
    expect(after.length).toBe(7);
    for (const c of after) {
      expect(c.payload).toEqual({ status: 'ACTIVE' });
      expect(planIds.has(c.endpoint.slice(1))).toBe(true);
    }
    expect(after[after.length - 1].endpoint).toBe(`/${Object.values(ids.campaign)[0]}`);
    expect(graph.calls.some((c) => c.endpoint === `/${controlId}`)).toBe(false);
    expect(graph.creations().length).toBe(13);

    const dec = (await pool.query('SELECT * FROM decisions WHERE id = $1', [row.decision_id])).rows[0];
    expect(dec.status).toBe('APPROVED');
    expect(dec.responsible_id).toBe(adminId);
    expect(dec.related_entity_type).toBe('LAUNCH_PLAN');
    const exp = (await pool.query('SELECT * FROM experiments WHERE id = $1', [row.experiment_id])).rows[0];
    expect(parseFloat(exp.capital_approved)).toBe(420);
    expect(parseFloat(exp.capital_used)).toBe(45);
    expect(exp.status).toBe('ATIVO');
    expect(row.answered_by).toBe(adminId);

    const active = await pool.query('SELECT status FROM meta_campaigns WHERE meta_campaign_id = $1', [Object.values(ids.campaign)[0]]);
    expect(active.rows[0].status).toBe('ACTIVE');
    const control = await pool.query('SELECT status FROM meta_campaigns WHERE meta_campaign_id = $1', [controlId]);
    expect(control.rows[0].status).toBe('PAUSED');
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'LAUNCH_PLAN_ACTIVATED' AND new_value LIKE $1`, [`%${plan.id}%`]);
    expect(audit.rows.length).toBe(1);
  });

  it('answer YES is blocked by META_MUTATION_ENABLED before anything is recorded', async () => {
    const { plan, graph } = await createdPlan();
    const before = graph.post.mock.calls.length;
    process.env.META_MUTATION_ENABLED = 'false';
    const r = await request(app).post(`/api/launch-plans/${plan.id}/answer`).set(auth(adminToken)).send({ answer: 'YES' });
    expect(r.status).toBe(409);
    expect(graph.post.mock.calls.length).toBe(before);
    const row = await getPlan(plan.id);
    expect(row.status).toBe('AWAITING_OPERATOR');
    expect(row.decision_id).toBeNull();
  });
});
