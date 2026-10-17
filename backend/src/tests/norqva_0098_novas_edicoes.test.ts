// NORQVA-0098: renomear, data de término do conjunto, descrição e troca de vídeo de anúncio no ar.
// A Meta é simulada: nenhum teste fala com a Meta.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID, resetMetaPreflightCacheForTesting } from '../services/meta/metaMutatingClient';
import { setMetaControlClientFactoryForTesting } from '../controllers/metaControlController';
import { setAdSwapClientFactoryForTesting } from '../controllers/campaignController';
import { DEFAULT_OFFER_BASE_URL } from '../services/aiTeam/launchSheet';
import { computeContentHash } from '../services/creative/creativeFactoryService';

describe.sequential('NORQVA-0098 — novas edições na Meta', () => {
  let pool: Pool;
  let admin: string;
  let perf: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const code = `T98${tag}`;
  const productId = crypto.randomUUID();
  const otherProductId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerHid = `OFF-T98${tag}`;
  const ACT = 'act_9800000001';
  const n = Date.now().toString().slice(-8);
  const CMP = `1201${n}`;
  const SET = `1202${n}`;
  const AD_ID = `1203${n}`;
  const OLD_CREATIVE = `1204${n}`;
  const OLD_VIDEO = `1205${n}`;
  const NEW_VIDEO = `1206${n}`;
  const NEW_CREATIVE = `1207${n}`;
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_BRAND_DESTINATION_HOSTS', 'PROTECTED_META_IDS'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  let planId = '';
  let accountDbId = '';
  const createdCreatives: string[] = [];
  let posts: { endpoint: string; payload: any }[] = [];
  let names: Record<string, string> = {};
  let endTimes: Record<string, string> = {};
  let currentCreative = OLD_CREATIVE;
  let ignoreName = false;
  let lifetimeBudget = 0;

  const destination = `${DEFAULT_OFFER_BASE_URL}/p/${offerHid}`;

  function fakeClient() {
    const post = vi.fn(async (endpoint: string, payload: any) => {
      posts.push({ endpoint, payload });
      if (endpoint === `/${ACT}/advideos`) return { id: NEW_VIDEO };
      if (endpoint === `/${ACT}/adcreatives`) return { id: NEW_CREATIVE };
      if (endpoint === `/${AD_ID}` && payload.creative) {
        currentCreative = payload.creative.creative_id;
        return { success: true };
      }
      const id = endpoint.slice(1);
      if (payload.name !== undefined) {
        if (!ignoreName) names[id] = payload.name;
        return { success: true };
      }
      if (payload.end_time !== undefined) {
        endTimes[id] = payload.end_time;
        return { success: true };
      }
      throw new Error('unexpected POST ' + endpoint);
    });
    const get = vi.fn(async (endpoint: string, params: any = {}) => {
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: ['ads_management', 'ads_read'].map((p) => ({ permission: p, status: 'granted' })) };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      if (endpoint === `/${NEW_VIDEO}`) return { id: NEW_VIDEO, status: { video_status: 'ready' }, picture: 'https://scontent.example.com/novo.jpg' };
      if (endpoint === `/${OLD_CREATIVE}` || endpoint === `/${NEW_CREATIVE}`) {
        return {
          id: endpoint.slice(1),
          url_tags: `utm_source=meta&utm_campaign=${code}&utm_content=AD98`,
          object_story_spec: {
            page_id: '1287452237795325',
            video_data: { video_id: OLD_VIDEO, image_url: 'https://scontent.example.com/antigo.jpg', message: 'Antigo', title: 'Antigo' }
          }
        };
      }
      const id = endpoint.slice(1);
      if (id === AD_ID && String(params.fields || '').includes('creative')) return { id: AD_ID, creative: { id: currentCreative } };
      if (params.fields === 'name') return { id, name: names[id] };
      if (String(params.fields || '').startsWith('end_time')) return { id, end_time: endTimes[id], lifetime_budget: String(lifetimeBudget) };
      throw new Error('unexpected GET ' + endpoint);
    });
    return new MetaMutatingClient(post as any, undefined, get as any);
  }

  async function mkCreative(key: string, opts: { approved?: boolean; product?: string; hook?: string } = {}) {
    const file = `https://cdn.example.com/${key}.mp4`;
    const fields = { hook: opts.hook || `Gancho ${key}`, mechanism: null, cta: 'Saiba mais', format: 'VIDEO', script: null, primary_text: `Texto ${key}`, headline: `Título ${key}`, file_url: file };
    const hash = computeContentHash(fields);
    const r = await pool.query(
      `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, file_url,
                              status, is_demo, utm_content_key, content_hash, approval_status)
       VALUES ($1, $2, $3, $4, 'c', $5, $5, $6, 'Saiba mais', 'VIDEO', $7, 'IDEIA', FALSE, $1, $8, $9) RETURNING id`,
      [key, opts.product || productId, offerId, fields.hook, fields.primary_text, fields.headline, file, hash, opts.approved === false ? 'DRAFT' : 'APPROVED']
    );
    const id = r.rows[0].id;
    createdCreatives.push(id);
    if (opts.approved !== false) {
      await pool.query(`INSERT INTO creative_reviews (creative_id, content_hash, decision, is_demo) VALUES ($1, $2, 'APPROVED', FALSE)`, [id, hash]);
    }
    return id as string;
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0098', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0098@norqva.test', 'ADMIN');
    perf = await mk('perf.norqva0098@norqva.test', 'PERFORMANCE');
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Livro 0098', 'Receitas', 'x', 'PLANEJADO', FALSE)`, [productId, `PRD-T98${tag}`]);
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Outro 0098', 'Receitas', 'x', 'PLANEJADO', FALSE)`, [otherProductId, `PRD-O98${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Oferta 0098', $3, 19.90, 'ATIVA', 'x', FALSE)`, [offerId, offerHid, productId]);
    const acct = await pool.query(
      `INSERT INTO meta_ad_accounts (meta_account_id, name, currency, is_demo) VALUES ('act_norqva_0098', 'NORQVA 0098', 'BRL', FALSE)
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET name = EXCLUDED.name RETURNING id`
    );
    accountDbId = acct.rows[0].id;
    const cmpDb = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo) VALUES ($1, $2, $3, $4, 'ACTIVE', 'ACTIVE', FALSE)`,
      [cmpDb, CMP, accountDbId, `${code} | campanha`]
    );
    await pool.query(
      `INSERT INTO meta_ad_sets (id, meta_adset_id, campaign_id, name, status, effective_status, daily_budget, is_demo) VALUES (gen_random_uuid(), $1, $2, 'Conj 98', 'ACTIVE', 'ACTIVE', 10, FALSE)`,
      [SET, cmpDb]
    );
    const spec = {
      campaign: { name: `${code} | campanha` },
      adsets: [{ name: 'Conj 98', daily_budget_brl: 10 }],
      ads: [{ name: 'AD98', primary_text: 'Antigo', headline: 'Antigo', cta: 'LEARN_MORE', destination_url: destination, video_url: 'https://cdn.example.com/antigo.mp4' }]
    };
    const r = await pool.query(
      `INSERT INTO launch_plans (code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES ($1, $2, 'ACTIVE', $3, $4, 10, 100, 'teste 0098') RETURNING id`,
      [code, offerHid, JSON.stringify(spec), JSON.stringify({ campaign: { [`${code} | campanha`]: CMP }, adsets: { 'Conj 98': SET }, ads: { AD98: AD_ID }, creatives: { AD98: OLD_CREATIVE }, videos: { AD98: OLD_VIDEO } })]
    );
    planId = r.rows[0].id;
  });

  beforeEach(() => {
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = ACT;
    delete process.env.META_BRAND_DESTINATION_HOSTS;
    delete process.env.PROTECTED_META_IDS;
    resetMetaPreflightCacheForTesting();
    posts = [];
    ignoreName = false;
    lifetimeBudget = 0;
    setMetaControlClientFactoryForTesting(() => fakeClient());
    setAdSwapClientFactoryForTesting(() => fakeClient());
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setMetaControlClientFactoryForTesting(null);
    setAdSwapClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE id = $1', [planId]).catch(() => {});
    await pool.query('DELETE FROM creative_reviews WHERE creative_id = ANY($1::uuid[])', [createdCreatives]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE id = ANY($1::uuid[])', [createdCreatives]).catch(() => {});
    await pool.query('DELETE FROM meta_ad_sets WHERE meta_adset_id = $1', [SET]).catch(() => {});
    await pool.query('DELETE FROM meta_campaigns WHERE meta_campaign_id = $1', [CMP]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [[productId, otherProductId]]).catch(() => {});
  });

  const as = (token: string) => ({
    post: (url: string, body: any) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  // ---------------- renomear ----------------

  it('renomear: só ADMIN', async () => {
    const r = await as(perf).post(`/api/meta-control/campaign/${CMP}/name`, { name: 'Novo nome', scope_campaign: CMP });
    expect(r.status).toBe(403);
    expect(posts).toHaveLength(0);
  });

  it('renomear campanha: envia o nome, confirma relendo e atualiza a cópia local', async () => {
    const r = await as(admin).post(`/api/meta-control/campaign/${CMP}/name`, { name: `${code} | campanha nova`, scope_campaign: CMP });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, confirmed: true, name: `${code} | campanha nova`, previousName: `${code} | campanha` });
    expect(posts).toEqual([{ endpoint: `/${CMP}`, payload: { name: `${code} | campanha nova` } }]);
    const row = await pool.query('SELECT name FROM meta_campaigns WHERE meta_campaign_id = $1', [CMP]);
    expect(row.rows[0].name).toBe(`${code} | campanha nova`);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'META_CAMPAIGN_RENAMED' AND description LIKE $1`, [`%${CMP}%`]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('renomear: a Meta não mostra o nome novo → não confirmado', async () => {
    ignoreName = true;
    const r = await as(admin).post(`/api/meta-control/adset/${SET}/name`, { name: 'Conj renomeado', scope_campaign: CMP });
    expect(r.status).toBe(200);
    expect(r.body.confirmed).toBe(false);
    // a cópia local só muda quando a Meta mostra o nome novo
    const row = await pool.query('SELECT name FROM meta_ad_sets WHERE meta_adset_id = $1', [SET]);
    expect(row.rows[0].name).toBe('Conj 98');
  });

  it('renomear: nome curto, tipo inválido e objeto protegido são recusados sem falar com a Meta', async () => {
    expect((await as(admin).post(`/api/meta-control/campaign/${CMP}/name`, { name: 'ab', scope_campaign: CMP })).status).toBe(400);
    expect((await as(admin).post(`/api/meta-control/pixel/${CMP}/name`, { name: 'Nome bom', scope_campaign: CMP })).status).toBe(400);
    // sem a campanha informada, ou fora dela
    expect((await as(admin).post(`/api/meta-control/adset/${SET}/name`, { name: 'Nome bom' })).status).toBe(400);
    expect((await as(admin).post(`/api/meta-control/adset/${SET}/name`, { name: 'Nome bom', scope_campaign: '999999' })).status).toBe(409);
    // modo demo não existe para estas edições
    expect((await as(admin).post(`/api/meta-control/campaign/${CMP}/name?mode=demo`, { name: 'Nome bom', scope_campaign: CMP })).status).toBe(400);
    process.env.PROTECTED_META_IDS = CMP;
    const p = await as(admin).post(`/api/meta-control/campaign/${CMP}/name`, { name: 'Nome bom', scope_campaign: CMP });
    expect(p.status).toBe(403);
    // conjunto de uma campanha protegida também é protegido
    const child = await as(admin).post(`/api/meta-control/adset/${SET}/name`, { name: 'Nome bom', scope_campaign: CMP });
    expect(child.status).toBe(403);
    expect(posts.filter((x) => x.payload.name !== undefined)).toHaveLength(0);
  });

  // ---------------- data de término ----------------

  it('data de término no passado ou em menos de 1 hora é recusada', async () => {
    const past = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: new Date(Date.now() - 86400000).toISOString(), scope_campaign: CMP });
    expect(past.status).toBe(400);
    const soon = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: new Date(Date.now() + 10 * 60000).toISOString(), scope_campaign: CMP });
    expect(soon.status).toBe(400);
    const junk = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: 'amanhã', scope_campaign: CMP });
    expect(junk.status).toBe(400);
    expect(posts).toHaveLength(0);
  });

  it('data de término futura: envia e confirma relendo', async () => {
    const end = new Date(Date.now() + 3 * 86400000);
    end.setUTCSeconds(0, 0);
    const r = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: end.toISOString(), scope_campaign: CMP });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, confirmed: true, end_time: end.toISOString() });
    expect(posts).toEqual([{ endpoint: `/${SET}`, payload: { end_time: end.toISOString() } }]);
  });

  it('data de término: só antecipa; não estende, não religa conjunto encerrado, não mexe em orçamento total', async () => {
    const later = new Date(Date.now() + 10 * 86400000).toISOString();
    const ext = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: later, scope_campaign: CMP });
    expect(ext.status).toBe(400);
    expect(ext.body.error).toMatch(/antecipar/);

    const earlier = new Date(Date.now() + 2 * 86400000);
    earlier.setUTCSeconds(0, 0);
    const ok = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: earlier.toISOString(), scope_campaign: CMP });
    expect(ok.status).toBe(200);

    endTimes[SET] = new Date(Date.now() - 3600000).toISOString();
    const ended = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: new Date(Date.now() + 86400000).toISOString(), scope_campaign: CMP });
    expect(ended.status).toBe(400);
    expect(ended.body.error).toMatch(/já terminou/);

    delete endTimes[SET];
    lifetimeBudget = 50000;
    const life = await as(admin).post(`/api/meta-control/adset/${SET}/end-time`, { end_time: new Date(Date.now() + 86400000).toISOString(), scope_campaign: CMP });
    expect(life.status).toBe(400);
    expect(life.body.error).toMatch(/orçamento total/);
    expect(posts.filter((p) => p.payload.end_time !== undefined)).toHaveLength(1);
  });

  // ---------------- troca no anúncio: descrição e vídeo ----------------

  const swapBody = (over: Record<string, any> = {}) => ({
    destination_url: destination,
    primary_text: 'Massas frescas de domingo, feitas por você.',
    headline: 'Trattoria em Casa',
    cta: 'LEARN_MORE',
    confirm_code: code,
    ...over
  });
  const swap = (b: any) => as(admin).post(`/api/campaigns/${planId}/ads/0/replace-on-meta?mode=real`, b);

  it('descrição: vai como link_description e fica no plano; preço na descrição é recusado', async () => {
    const price = await swap(swapBody({ description: 'Hoje por R$ 19,90' }));
    expect(price.status).toBe(400);
    expect(posts).toHaveLength(0);

    const r = await swap(swapBody({ description: 'Receitas testadas, passo a passo' }));
    expect(r.status).toBe(200);
    const create = posts.find((p) => p.endpoint === `/${ACT}/adcreatives`)!;
    expect(create.payload.object_story_spec.video_data.link_description).toBe('Receitas testadas, passo a passo');
    expect(create.payload.object_story_spec.video_data.video_id).toBe(OLD_VIDEO);
    expect(posts.some((p) => p.endpoint === `/${ACT}/advideos`)).toBe(false);
    expect(r.body.campaign.spec.ads[0].description).toBe('Receitas testadas, passo a passo');
    expect(r.body.video_changed).toBe(false);
  });

  it('troca de vídeo: criativo não aprovado, de outro produto ou com preço é recusado antes de falar com a Meta', async () => {
    const draft = await mkCreative(`D98${tag}`, { approved: false });
    const other = await mkCreative(`O98${tag}`, { product: otherProductId });
    const priced = await mkCreative(`P98${tag}`, { hook: 'Só R$ 19,90 hoje' });
    for (const id of [draft, other, priced, 'nao-e-uuid']) {
      const r = await swap(swapBody({ creative_id: id }));
      expect(r.status).toBe(400);
    }
    expect(posts).toHaveLength(0);
  });

  it('troca de vídeo: envia o vídeo novo, espera ficar pronto e usa na peça nova do mesmo anúncio', async () => {
    const good = await mkCreative(`G98${tag}`);
    const r = await swap(swapBody({ creative_id: good }));
    expect(r.status).toBe(200);
    expect(r.body.video_changed).toBe(true);
    expect(r.body.new_video_id).toBe(NEW_VIDEO);
    const up = posts.find((p) => p.endpoint === `/${ACT}/advideos`)!;
    expect(up.payload.file_url).toBe(`https://cdn.example.com/G98${tag}.mp4`);
    const vd = posts.find((p) => p.endpoint === `/${ACT}/adcreatives`)!.payload.object_story_spec.video_data;
    expect(vd.video_id).toBe(NEW_VIDEO);
    expect(vd.image_url).toBe('https://scontent.example.com/novo.jpg');
    // as vendas do vídeo novo contam para o criativo novo
    const tags = posts.find((p) => p.endpoint === `/${ACT}/adcreatives`)!.payload.url_tags;
    expect(tags).toBe(`utm_source=meta&utm_campaign=${code}&utm_content=G98${tag}`);
    expect(posts.find((p) => p.endpoint === `/${AD_ID}`)!.payload).toEqual({ creative: { creative_id: NEW_CREATIVE } });
    const c = r.body.campaign;
    expect(c.meta_ids.videos.AD98).toBe(NEW_VIDEO);
    expect(c.spec.ads[0].video_url).toBe(`https://cdn.example.com/G98${tag}.mp4`);
    // nada de status: a troca não ativa nem pausa
    expect(posts.every((p) => p.payload.status === undefined)).toBe(true);
  });
});
