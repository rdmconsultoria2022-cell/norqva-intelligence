// NORQVA-0056: trocar destino, texto, título e botão de um anúncio que já está na Meta.
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
import { setAdSwapClientFactoryForTesting } from '../controllers/campaignController';
import { DEFAULT_OFFER_BASE_URL } from '../services/aiTeam/launchSheet';

describe.sequential('NORQVA-0056 — editar anúncio que já está na Meta', () => {
  let pool: Pool;
  let admin: string;
  let analyst: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const kitHid = `OFF-K55${tag}`;
  const code = `T55-${tag}`;
  const AD_ID = `1205${Date.now().toString().slice(-9)}`;
  const OLD_CREATIVE = '777000111222';
  const VIDEO = '555444333222';
  const ACT = 'act_1234567890';
  const ENV_KEYS = ['META_MUTATION_ENABLED', 'META_AD_ACCOUNT_ID', 'META_BRAND_DESTINATION_HOSTS', 'PROTECTED_META_IDS'] as const;
  const envBackup: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  let planId = '';
  let posts: { endpoint: string; payload: any }[] = [];
  let failSwap = false;

  const newText = 'Aquele jantar italiano de domingo, feito por você. Dois livros digitais no kit Cozinha Italiana.';

  function fakeClient() {
    const post = vi.fn(async (endpoint: string, payload: any) => {
      posts.push({ endpoint, payload });
      if (endpoint.endsWith('/adcreatives')) return { id: '888000111333' };
      if (endpoint === `/${AD_ID}`) {
        if (failSwap) throw new Error('[META GRAPH API ERROR]: simulated failure');
        return { success: true };
      }
      throw new Error('unexpected POST ' + endpoint);
    });
    const get = vi.fn(async (endpoint: string) => {
      if (endpoint === '/me') return { id: 'u1' };
      if (endpoint === '/me/permissions') return { data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] };
      if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
      if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
      if (endpoint === `/${AD_ID}`) return { id: AD_ID, creative: { id: OLD_CREATIVE } };
      if (endpoint === `/${OLD_CREATIVE}`) {
        return {
          id: OLD_CREATIVE,
          url_tags: `utm_source=meta&utm_campaign=${code}&utm_content=TR_V1_EMO`,
          object_story_spec: {
            page_id: '1287452237795325',
            instagram_user_id: '17841400000000000',
            video_data: { video_id: VIDEO, image_url: 'https://scontent.example.com/thumb.jpg', message: 'Antigo por R$ 19,90', title: 'Antigo' }
          }
        };
      }
      throw new Error('unexpected GET ' + endpoint);
    });
    return new MetaMutatingClient(post as any, undefined, get as any);
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0055', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0055@norqva.test', 'ADMIN');
    analyst = await mk('perf.norqva0055@norqva.test', 'PERFORMANCE');
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Kit 0055', 'Receitas', 'x', 'PLANEJADO', FALSE)`, [productId, `PRD-K55${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Kit Cozinha Italiana', $3, 27.90, 'ATIVA', 'x', FALSE)`, [offerId, kitHid, productId]);
    const spec = {
      ads: [
        {
          name: 'TR_V1_EMO',
          primary_text: 'Antigo por R$ 19,90',
          headline: 'Antigo',
          cta: 'LEARN_MORE',
          destination_url: `${DEFAULT_OFFER_BASE_URL}/p/OFF-000001`,
          video_url: 'https://cdn.norqva.example/tr_v1.mp4'
        },
        { name: 'TR_V2_FOOD', primary_text: 'x', headline: 'y', cta: 'LEARN_MORE', destination_url: `${DEFAULT_OFFER_BASE_URL}/p/OFF-000001` }
      ]
    };
    const r = await pool.query(
      `INSERT INTO launch_plans (id, code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES (gen_random_uuid(), $1, 'OFF-000001', 'ACTIVE', $2, $3, 20, 140, 'q') RETURNING id`,
      [code, JSON.stringify(spec), JSON.stringify({ campaign: { C: '120000000001' }, ads: { TR_V1_EMO: AD_ID }, creatives: { TR_V1_EMO: OLD_CREATIVE }, videos: { TR_V1_EMO: VIDEO } })]
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
    failSwap = false;
    setAdSwapClientFactoryForTesting(() => fakeClient());
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    setAdSwapClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM launch_plans WHERE code = $1', [code]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  const body = (over: Record<string, any> = {}) => ({
    destination_url: `${DEFAULT_OFFER_BASE_URL}/kit/${kitHid}`,
    primary_text: newText,
    headline: 'Kit Cozinha Italiana',
    cta: 'SEE_DETAILS',
    confirm_code: code,
    ...over
  });
  const swap = (b: any, token = admin, idx = 0) =>
    request(app).post(`/api/campaigns/${planId}/ads/${idx}/replace-on-meta?mode=real`).set('Authorization', `Bearer ${token}`).send(b);

  it('só ADMIN', async () => {
    const r = await swap(body(), analyst);
    expect(r.status).toBe(403);
    expect(posts).toHaveLength(0);
  });

  it('pede o código da campanha', async () => {
    const r = await swap(body({ confirm_code: 'ERRADO' }));
    expect(r.status).toBe(400);
    expect(r.body.error).toContain(code);
    expect(posts).toHaveLength(0);
  });

  it('recusa preço no texto, destino fora da lista e oferta inexistente', async () => {
    const price = await swap(body({ primary_text: 'Dois livros por apenas R$ 27,90' }));
    expect(price.status).toBe(400);
    const evil = await swap(body({ destination_url: `https://evil.com/kit/${kitHid}` }));
    expect(evil.status).toBe(400);
    const ghost = await swap(body({ destination_url: `${DEFAULT_OFFER_BASE_URL}/kit/OFF-NAOEXISTE` }));
    expect(ghost.status).toBe(400);
    expect(ghost.body.error).toMatch(/não existe/);
    expect(posts).toHaveLength(0);
  });

  it('anúncio que ainda não está na Meta: manda editar na Configuração', async () => {
    const r = await swap(body(), admin, 1);
    expect(r.status).toBe(409);
    expect(posts).toHaveLength(0);
  });

  it('anúncio protegido (controle) não é trocado', async () => {
    process.env.PROTECTED_META_IDS = AD_ID;
    const r = await swap(body());
    expect(r.status).toBe(403);
    expect(posts).toHaveLength(0);
  });

  it('Meta recusa a troca: erro claro e o plano não muda', async () => {
    failSwap = true;
    const r = await swap(body());
    expect(r.status).toBe(502);
    expect(r.body.error).toMatch(/continua com a peça antiga/);
    const row = (await pool.query('SELECT spec, meta_ids FROM launch_plans WHERE id = $1', [planId])).rows[0];
    const spec = typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec;
    expect(spec.ads[0].destination_url).toBe(`${DEFAULT_OFFER_BASE_URL}/p/OFF-000001`);
  });

  it('troca: peça nova com o mesmo vídeo e as mesmas etiquetas, dentro do mesmo anúncio; plano atualizado', async () => {
    const r = await swap(body());
    expect(r.status).toBe(200);
    expect(r.body.creative_id).toBe('888000111333');
    expect(r.body.previous_creative_id).toBe(OLD_CREATIVE);

    const create = posts.find(p => p.endpoint === `/${ACT}/adcreatives`)!;
    expect(create).toBeTruthy();
    const vd = create.payload.object_story_spec.video_data;
    expect(vd.video_id).toBe(VIDEO);
    expect(vd.message).toBe(newText);
    expect(vd.title).toBe('Kit Cozinha Italiana');
    expect(vd.call_to_action).toEqual({ type: 'SEE_DETAILS', value: { link: `${DEFAULT_OFFER_BASE_URL}/kit/${kitHid}` } });
    expect(vd.image_url).toBe('https://scontent.example.com/thumb.jpg');
    expect(create.payload.object_story_spec.page_id).toBe('1287452237795325');
    expect(create.payload.object_story_spec.instagram_user_id).toBe('17841400000000000');
    expect(create.payload.url_tags).toBe(`utm_source=meta&utm_campaign=${code}&utm_content=TR_V1_EMO`);
    // nada de status: a troca não ativa nem pausa
    expect(create.payload.status).toBeUndefined();
    const update = posts.find(p => p.endpoint === `/${AD_ID}`)!;
    expect(update.payload).toEqual({ creative: { creative_id: '888000111333' } });
    expect(posts).toHaveLength(2);

    const c = r.body.campaign;
    expect(c.spec.ads[0].destination_url).toBe(`${DEFAULT_OFFER_BASE_URL}/kit/${kitHid}`);
    expect(c.spec.ads[0].primary_text).toBe(newText);
    expect(c.spec.ads[0].cta).toBe('SEE_DETAILS');
    expect(c.meta_ids.creatives.TR_V1_EMO).toBe('888000111333');
    expect(c.status).toBe('ACTIVE');
    // o outro anúncio ainda aponta para a página antiga: a oferta do plano não muda
    expect(c.offer_human_id).toBe('OFF-000001');

    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'CAMPAIGN_AD_CREATIVE_SWAPPED' AND description LIKE $1`, [`%${code}%`]);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('segunda troca numera a versão da peça', async () => {
    const r = await swap(body({ headline: 'Massas, molhos e doces italianos' }));
    expect(r.status).toBe(200);
    const create = posts.find(p => p.endpoint === `/${ACT}/adcreatives`)!;
    expect(create.payload.name).toBe('TR_V1_EMO_CREATIVE_V3');
  });
});
