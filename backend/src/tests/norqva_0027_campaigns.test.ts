// NORQVA-0027: tela Campanhas — preencher com o criativo aprovado, modo manual, campanha a partir da
// oferta e a trava de ativação pela tela Meta Ads. Nenhum teste fala com a Meta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { computeContentHash } from '../services/creative/creativeFactoryService';
import { OFFICIAL_NORQVA_PIXEL_ID } from '../services/meta/metaMutatingClient';
import { DEFAULT_OFFER_BASE_URL, urlTagsFor } from '../services/aiTeam/launchSheet';

describe.sequential('NORQVA-0027 — Campanhas', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerHid = `OFF-T${tag}`;
  const planCode = `TST-${tag}`;
  let planId: string;
  const creatives: Record<string, string> = {};
  const metaAdId = `12${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 900 + 100)}`;

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  async function mkCreative(key: string, opts: { approved?: boolean; file?: string | null; format?: string; changeFileAfter?: boolean } = {}) {
    const file = opts.file === undefined ? `https://cdn.example.com/${key}.mp4` : opts.file;
    const fields = { hook: `Gancho ${key}`, mechanism: null, cta: 'Saiba mais', format: opts.format || 'VIDEO', script: null, primary_text: `Texto ${key}`, headline: `Título ${key}`, file_url: file };
    const hash = computeContentHash(fields);
    const r = await pool.query(
      `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, file_url,
                              status, is_demo, utm_content_key, content_hash, approval_status)
       VALUES ($1, $2, $3, $4, 'c', $5, $5, $6, 'Saiba mais', $7, $8, 'IDEIA', FALSE, $1, $9, $10) RETURNING id`,
      [key, productId, offerId, fields.hook, fields.primary_text, fields.headline, fields.format, file, hash, opts.approved === false ? 'DRAFT' : 'APPROVED']
    );
    const id = r.rows[0].id;
    if (opts.approved !== false) {
      await pool.query(
        `INSERT INTO creative_reviews (creative_id, content_hash, decision, is_demo) VALUES ($1, $2, 'APPROVED', FALSE)`,
        [id, hash]
      );
    }
    if (opts.changeFileAfter) {
      const changed = computeContentHash({ ...fields, file_url: 'https://cdn.example.com/trocado.mp4' });
      await pool.query(`UPDATE creatives SET file_url = 'https://cdn.example.com/trocado.mp4', content_hash = $2 WHERE id = $1`, [id, changed]);
    }
    creatives[key] = id;
    return id;
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
    adminToken = await mk('admin.norqva0027@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0027@norqva.test', 'PERFORMANCE');

    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo)
       VALUES ($1, $2, 'Trattoria 0027', 'Receitas', 'Fixture', 'PLANEJADO', FALSE)`,
      [productId, `PRD-T${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria 0027', $3, 19.90, 'ATIVA', 'Fixture', FALSE)`,
      [offerId, offerHid, productId]
    );
    await mkCreative(`T${tag}-A`);
    await mkCreative(`T${tag}-B`);
    await mkCreative(`T${tag}-DRAFT`, { approved: false });
    await mkCreative(`T${tag}-SWAP`, { changeFileAfter: true });

    const dest = `${DEFAULT_OFFER_BASE_URL}/p/${offerHid}`;
    const ad = (name: string) => ({
      name, adset_name: `${planCode}_AS01`, video_url: 'TO_BE_FILLED', thumbnail_url: null,
      primary_text: 'Texto da IA', headline: 'Título da IA', cta: 'SEE_DETAILS', destination_url: dest, url_tags: urlTagsFor(planCode, name)
    });
    const r = await as(adminToken).post('/api/launch-plans', {
      code: planCode,
      offer_human_id: offerHid,
      max_spend_brl: 140,
      question_text: 'Ativar o teste?',
      spec: {
        campaign: { name: `NORQVA_TST_${tag}`, objective: 'OUTCOME_SALES' },
        pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
        adsets: [{ name: `${planCode}_AS01`, daily_budget_brl: 20, targeting: { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true } }],
        ads: [ad(`T${tag}-A`), ad(`T${tag}-DRAFT`), ad(`T${tag}-SWAP`)]
      }
    });
    expect(r.status).toBe(201);
    planId = r.body.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM launch_plans WHERE code LIKE $1 OR offer_human_id = $2`, [`%${tag}%`, offerHid]);
    await pool.query('DELETE FROM creatives WHERE product_id = $1', [productId]);
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]);
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  });

  // NORQVA-0028: perfis de análise leem a lista; alterar continua só ADMIN
  it('só ADMIN altera; a lista mostra a campanha editável', async () => {
    expect((await as(perfToken).get('/api/campaigns')).status).toBe(200);
    expect((await as(perfToken).post(`/api/campaigns/${planId}/fill`)).status).toBe(403);
    const r = await as(adminToken).get('/api/campaigns');
    expect(r.status).toBe(200);
    const c = r.body.campaigns.find((x: any) => x.id === planId);
    expect(c.editable).toBe(true);
    expect(c.manual_fields).toEqual({});
  });

  it('preencher: só criativo aprovado com o mesmo arquivo da aprovação entra', async () => {
    const r = await as(adminToken).post(`/api/campaigns/${planId}/fill`);
    expect(r.status).toBe(200);
    const byAd = (name: string) => r.body.results.find((x: any) => x.ad.startsWith(name));
    expect(byAd(`T${tag}-A`).status).toBe('FILLED');
    expect(byAd(`T${tag}-DRAFT`).status).toBe('SKIPPED');
    expect(byAd(`T${tag}-DRAFT`).reason).toMatch(/aprovado/);
    expect(byAd(`T${tag}-SWAP`).status).toBe('SKIPPED');
    expect(byAd(`T${tag}-SWAP`).reason).toMatch(/mudou depois da aprovação/);
    const ad0 = r.body.campaign.spec.ads[0];
    expect(ad0.video_url).toBe(`https://cdn.example.com/T${tag}-A.mp4`);
    expect(ad0.primary_text).toBe(`Texto T${tag}-A`);
    expect(ad0.headline).toBe(`Título T${tag}-A`);
  });

  it('campo editado vira manual e não é sobrescrito no próximo preenchimento', async () => {
    const bad = await as(adminToken).post(`/api/campaigns/${planId}/fields`, { fields: { 'ads.0.video_url': 'x' } });
    expect(bad.status).toBe(400);
    const r = await as(adminToken).post(`/api/campaigns/${planId}/fields`, { fields: { 'ads.0.headline': 'Meu título', 'adsets.0.daily_budget_brl': 25 } });
    expect(r.status).toBe(200);
    expect(r.body.manual_fields['ads.0.headline']).toBe(true);
    expect(r.body.spec.adsets[0].daily_budget_brl).toBe(25);
    expect(r.body.daily_budget_brl).toBe(25);

    const refill = await as(adminToken).post(`/api/campaigns/${planId}/fill`);
    expect(refill.body.campaign.spec.ads[0].headline).toBe('Meu título');
    expect(refill.body.campaign.spec.ads[0].primary_text).toBe(`Texto T${tag}-A`);

    const tooMuch = await as(adminToken).post(`/api/campaigns/${planId}/fields`, { fields: { 'adsets.0.daily_budget_brl': 100000 } });
    expect(tooMuch.status).toBe(400);
  });

  it('escolher criativo à mão troca o anúncio; voltar ao automático desfaz tudo', async () => {
    const opts = await as(adminToken).get(`/api/campaigns/${planId}/creative-options`);
    expect(opts.status).toBe(200);
    expect(opts.body.options.find((o: any) => o.human_id === `T${tag}-B`).ok).toBe(true);
    expect(opts.body.options.find((o: any) => o.human_id === `T${tag}-SWAP`).ok).toBe(false);

    const pick = await as(adminToken).post(`/api/campaigns/${planId}/ads/1/creative`, { creative_id: creatives[`T${tag}-B`] });
    expect(pick.status).toBe(200);
    expect(pick.body.campaign.spec.ads[1].name).toBe(`T${tag}-B`);
    expect(pick.body.campaign.spec.ads[1].url_tags).toContain(`utm_content=T${tag}-B`);
    expect(pick.body.campaign.manual_fields['ads.1.creative']).toBe(true);

    const refused = await as(adminToken).post(`/api/campaigns/${planId}/ads/2/creative`, { creative_id: creatives[`T${tag}-SWAP`] });
    expect(refused.status).toBe(409);

    const reset = await as(adminToken).post(`/api/campaigns/${planId}/reset`);
    expect(reset.status).toBe(200);
    expect(reset.body.campaign.manual_fields).toEqual({});
    expect(reset.body.campaign.spec.ads[0].headline).toBe(`Título T${tag}-A`);
    expect(reset.body.campaign.spec.adsets[0].daily_budget_brl).toBe(20);
  });

  it('campanha nova a partir da oferta com criativos aprovados', async () => {
    const bad = await as(adminToken).post('/api/campaigns', { offer_human_id: offerHid, creative_ids: [creatives[`T${tag}-DRAFT`]] });
    expect(bad.status).toBe(409);
    const r = await as(adminToken).post('/api/campaigns', {
      offer_human_id: offerHid,
      creative_ids: [creatives[`T${tag}-A`], creatives[`T${tag}-B`]],
      daily_budget_brl: 15,
      max_spend_brl: 105
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.spec.ads).toHaveLength(2);
    expect(r.body.spec.ads.every((a: any) => a.video_url.startsWith('https://'))).toBe(true);
    expect(r.body.spec.adsets[0].targeting).toMatchObject({ countries: ['BR'], age_min: 25, age_max: 65 });
  });

  it('criar na Meta recusa anúncio com criativo não aprovado, antes de falar com a Meta', async () => {
    const dest = `${DEFAULT_OFFER_BASE_URL}/p/${offerHid}`;
    const code = `TSG-${tag}`;
    const name = `T${tag}-DRAFT`;
    const r = await as(adminToken).post('/api/launch-plans', {
      code,
      offer_human_id: offerHid,
      max_spend_brl: 140,
      question_text: 'Ativar?',
      spec: {
        campaign: { name: `NORQVA_TSG_${tag}`, objective: 'OUTCOME_SALES' },
        pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
        adsets: [{ name: `${code}_AS01`, daily_budget_brl: 20, targeting: { countries: ['BR'], age_min: 25, age_max: 65, advantage_audience: true } }],
        ads: [{ name, adset_name: `${code}_AS01`, video_url: 'https://cdn.example.com/qualquer.mp4', primary_text: 'x', headline: 'y', cta: 'SEE_DETAILS', destination_url: dest, url_tags: urlTagsFor(code, name) }]
      }
    });
    expect(r.status).toBe(201);
    const create = await as(adminToken).post(`/api/launch-plans/${r.body.id}/create`);
    expect(create.status).toBe(409);
    expect(create.body.error).toMatch(/aprovado/);
    const after = await pool.query('SELECT status FROM launch_plans WHERE id = $1', [r.body.id]);
    expect(after.rows[0].status).toBe('DRAFT');
  });

  it('campanha que já existe na Meta não é editável', async () => {
    await pool.query(
      `UPDATE launch_plans SET status = 'AWAITING_OPERATOR', meta_ids = $2 WHERE id = $1`,
      [planId, JSON.stringify({ campaign: { x: '120000000000001' }, adsets: {}, videos: {}, creatives: {}, ads: { a: metaAdId } })]
    );
    const r = await as(adminToken).post(`/api/campaigns/${planId}/fields`, { fields: { 'ads.0.headline': 'x' } });
    expect(r.status).toBe(409);
  });

  it('Meta Ads não ativa objeto de campanha que espera o Sim', async () => {
    const r = await as(adminToken).post(`/api/meta-control/ad/${metaAdId}/status`, { status: 'ACTIVE' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/espera o seu Sim/);
  });
});
