// NORQVA-0117: campanha PAUSADA a partir da página gerada. Graph API sempre simulada (nada sai para a Meta).
// As partes com launch_plans rodam no Postgres do CI (o pg-mem local recusa as checagens da tabela).
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { Pool } from 'pg';
import app from '../index';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { MetaMutatingClient, OFFICIAL_NORQVA_PIXEL_ID, resetMetaPreflightCacheForTesting, isGeneratedPageUrl } from '../services/meta/metaMutatingClient';
import { setLaunchPlanClientFactoryForTesting } from '../controllers/launchPlanController';
import { validateLaunchPlanInput } from '../services/launchPlans/launchPlanService';
import { assertOnlyPausedPayload, utmTags, pageUrl, pausedOnlyClient, pageImageRefs, adImageRefs } from '../services/launchPlans/generatedCampaignService';
import { setImageStorageForTests, resolveImageUrl, freshSignedUrl } from '../services/creative/generatedImages';
import { metaIdsOfPlan } from '../db/decisionEvents';
import { computeContentHash } from '../services/creative/creativeFactoryService';
import { BORDADO_IMAGES } from '../services/creative/generatedImages';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('NORQVA-0117 — travas e endereços (sem banco)', () => {
  it('trava "só PAUSED": recusa qualquer situação diferente, criação sem PAUSED e mudança de objeto existente', () => {
    expect(() => assertOnlyPausedPayload('/act_1/campaigns', { name: 'x', status: 'PAUSED' })).not.toThrow();
    expect(() => assertOnlyPausedPayload('/act_1/adcreatives', { name: 'x', object_story_spec: {} })).not.toThrow();
    expect(() => assertOnlyPausedPayload('/act_1/adimages', { bytes: 'abc' })).not.toThrow();
    expect(() => assertOnlyPausedPayload('/act_1/campaigns', { name: 'x', status: 'ACTIVE' })).toThrow(/PAUSADO/);
    expect(() => assertOnlyPausedPayload('/act_1/ads', { name: 'x', creative: { status: 'ACTIVE' }, status: 'PAUSED' })).toThrow(/PAUSADO/);
    expect(() => assertOnlyPausedPayload('/act_1/adsets', { name: 'x' })).toThrow(/sem status PAUSED/);
    expect(() => assertOnlyPausedPayload('/act_1/ads', { name: 'x', configured_status: 'ACTIVE', status: 'PAUSED' })).toThrow();
    // lista fechada: só criação na conta
    expect(() => assertOnlyPausedPayload('/120000000001', { status: 'PAUSED' })).toThrow(/fora da lista/);
    expect(() => assertOnlyPausedPayload('/act_1/advideos', { file_url: 'https://x' })).toThrow(/fora da lista/);
    expect(() => assertOnlyPausedPayload('/act_1/campaigns/extra', { status: 'PAUSED' })).toThrow(/fora da lista/);
  });

  it('o cliente com a trava não manda nada ACTIVE; o cliente original (ativação pelo Sim) continua sem a trava', async () => {
    const post = vi.fn(async () => ({ id: '1' }));
    const original = new MetaMutatingClient(post as any);
    const client = pausedOnlyClient(original);
    expect(client).not.toBe(original);
    await expect((client as any).callTransportPost('/act_1/campaigns', { status: 'ACTIVE' })).rejects.toThrow(/PAUSADO/);
    expect(post).not.toHaveBeenCalled();
    await (original as any).callTransportPost('/120000000001', { status: 'ACTIVE' });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('imagens dos anúncios: abertura e produto primeiro, nunca a seção de preço; as novas ficam como storage:', () => {
    const refs = pageImageRefs([
      { role: 'OFFER_PRICE', image_url: '/images/kit/oferta.jpg' },
      { role: 'CONTENTS', image_url: 'storage:creative-images/generated/p/2.png' },
      { role: 'HERO_HOOK', image_url: '/images/kit/capa_trat.jpg' }
    ]);
    expect(refs).toEqual(['https://acesso.norqva.com.br/images/kit/capa_trat.jpg', 'storage:creative-images/generated/p/2.png']);
  });

  it('NORQVA-0128: página sem imagem usa as imagens do produto no site; com imagem, só as da página', () => {
    const none = [{ role: 'HERO_HOOK', image_url: null }];
    expect(adImageRefs(none, { name: 'Bordado' })).toEqual(BORDADO_IMAGES.map(u => `https://acesso.norqva.com.br${u}`));
    expect(adImageRefs(none, { name: 'Produto sem fotos' })).toEqual([]);
    expect(adImageRefs([{ role: 'HERO_HOOK', image_url: '/images/kit/capa_trat.jpg' }], { name: 'Bordado' })).toEqual(['https://acesso.norqva.com.br/images/kit/capa_trat.jpg']);
  });

  it('link assinado: o guardado só serve se ainda valer pelo tempo pedido; para a Meta, sempre um novo', async () => {
    let n = 0;
    setImageStorageForTests({ upload: async () => {}, bucketExists: async () => true, signedUrl: async (b, p, ttl) => `https://mock.supabase.co/sign/${b}/${p}?ttl=${ttl}&n=${++n}` });
    try {
      const ref = 'storage:creative-images/generated/p/1.png';
      const a = await resolveImageUrl(ref, 3600);
      expect(await resolveImageUrl(ref, 3600)).toBe(a);
      const long = await resolveImageUrl(ref, 24 * 3600);
      expect(long).not.toBe(a);
      expect(long).toContain('ttl=86400');
      const fresh1 = await freshSignedUrl(ref);
      const fresh2 = await freshSignedUrl(ref);
      expect(fresh1).not.toBe(fresh2);
    } finally {
      setImageStorageForTests(null);
    }
  });

  it('hashes de imagem não entram na lista de objetos da Meta do plano', () => {
    expect(metaIdsOfPlan({ campaign: { c: '1' }, ads: { a: '2' }, images: { x: 'hash1' } }).sort()).toEqual(['1', '2']);
  });

  it('download da imagem: tamanho declarado acima de 8 MB é recusado; sem seguir redirecionamento', async () => {
    const prev = { m: process.env.META_MUTATION_ENABLED, a: process.env.META_AD_ACCOUNT_ID };
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = 'act_117000000009';
    resetMetaPreflightCacheForTesting();
    try {
      const get = vi.fn(async (endpoint: string) => {
        // NORQVA-0121: busca de estados (regiões) da Meta
    if (endpoint === '/search') {
      const keys: Record<string, string> = { 'Minas Gerais': '460', 'São Paulo': '472' };
      const q = String(params.q || '');
      return { data: keys[q] ? [{ key: keys[q], name: q, type: 'region', country_code: 'BR' }, { key: '9', name: `${q} (outro)`, type: 'region', country_code: 'BR' }] : [] };
    }
    if (endpoint === '/me') return { id: 'u1' };
        if (endpoint === '/me/permissions') return { data: [{ permission: 'ads_management', status: 'granted' }] };
        return { id: endpoint.slice(1) };
      });
      const post = vi.fn(async () => ({ images: { a: { hash: 'h' } } }));
      const inits: any[] = [];
      const client = new MetaMutatingClient(post as any, undefined, get as any).setImageFetcherForTesting(async (_u, init) => {
        inits.push(init);
        return { ok: true, status: 200, headers: { get: (h: string) => (h === 'content-length' ? String(9 * 1024 * 1024) : null) }, arrayBuffer: async () => new ArrayBuffer(1) };
      });
      const fakePool: any = { query: async () => ({ rows: [] }) };
      const ctx = { userId: 'u', userRole: 'ADMIN', isDemo: false };
      await expect(client.uploadImageFromUrl(fakePool, { fileUrl: 'https://acesso.norqva.com.br/images/kit/capa_trat.jpg', name: 'x' }, ctx)).rejects.toThrow(/8 MB/);
      expect(inits[0].redirect).toBe('error');
      expect(post).not.toHaveBeenCalled();
      await expect(client.uploadImageFromUrl(fakePool, { fileUrl: 'https://evil.example.com/a.png', name: 'x' }, ctx)).rejects.toThrow(/NORQVA site or storage/);
    } finally {
      if (prev.m === undefined) delete process.env.META_MUTATION_ENABLED; else process.env.META_MUTATION_ENABLED = prev.m;
      if (prev.a === undefined) delete process.env.META_AD_ACCOUNT_ID; else process.env.META_AD_ACCOUNT_ID = prev.a;
      resetMetaPreflightCacheForTesting();
    }
  });

  it('UTMs iguais às de todo plano (urlTagsFor): campanha = código do plano, conteúdo = código do criativo, ids da Meta', () => {
    expect(utmTags('CMP-GEN-000001', 'GEN-000001-A1')).toBe(
      'utm_source=meta&utm_medium=paid_social&utm_campaign=CMP-GEN-000001&utm_content=GEN-000001-A1&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}'
    );
    expect(pageUrl('livro-abc123')).toBe('https://acesso.norqva.com.br/v/livro-abc123');
  });

  it('destino: a página gerada no site do comprador é aceita; outros hosts e caminhos não', () => {
    expect(isGeneratedPageUrl('https://acesso.norqva.com.br/v/livro-abc123')).toBe(true);
    expect(isGeneratedPageUrl('https://acesso.norqva.com.br/v/livro-abc123?x=1')).toBe(true);
    expect(isGeneratedPageUrl('http://acesso.norqva.com.br/v/livro-abc123')).toBe(false);
    expect(isGeneratedPageUrl('https://outro.com/v/livro-abc123')).toBe(false);
    expect(isGeneratedPageUrl('https://acesso.norqva.com.br/admin')).toBe(false);
    expect(() => new MetaMutatingClient().assertUrlWhitelisted('https://acesso.norqva.com.br/v/livro-abc123')).not.toThrow();
  });

  it('peça de imagem: link_data com o hash da imagem e a descrição', () => {
    const p = MetaMutatingClient.buildAdCreativePayload({
      name: 'A', title: 'T', body: 'B', destinationUrl: 'https://acesso.norqva.com.br/v/x-123', callToAction: 'LEARN_MORE', imageHash: 'h1', description: 'D', pageId: '123456', urlTags: 'utm_source=meta'
    });
    expect(p.object_story_spec.link_data).toMatchObject({ image_hash: 'h1', description: 'D', link: 'https://acesso.norqva.com.br/v/x-123' });
    expect(p.url_tags).toBe('utm_source=meta');
  });

  it('plano: anúncio de imagem levando à página gerada, com a oferta informada', () => {
    const spec = {
      campaign: { name: 'NQ – Livro – Ref REF-1 – Vendas', objective: 'OUTCOME_SALES' },
      pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
      adsets: [{ name: 'S1', daily_budget_brl: 30, targeting: { countries: ['BR'], age_min: 25, age_max: 65 } }],
      ads: [{ name: 'GEN-1-A1', adset_name: 'S1', image_url: 'https://acesso.norqva.com.br/images/kit/capa_trat.jpg', primary_text: 'P', headline: 'H', description: 'D', cta: 'LEARN_MORE', destination_url: 'https://acesso.norqva.com.br/v/livro-abc123', url_tags: 'utm_source=meta' }]
    };
    const gen = { allowGeneratedPage: true };
    const ok = validateLaunchPlanInput({ code: 'CMP-GEN-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec }, { forCreation: true, ...gen });
    expect(ok.spec.ads[0]).toMatchObject({ image_url: 'https://acesso.norqva.com.br/images/kit/capa_trat.jpg', video_url: '', description: 'D' });
    expect(() => validateLaunchPlanInput({ code: 'CMP-GEN-1', max_spend_brl: 210, question_text: 'Ativar?', spec }, gen)).toThrow(/oferta informada/);
    expect(() => validateLaunchPlanInput({ code: 'CMP-GEN-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec: { ...spec, ads: [{ ...spec.ads[0], video_url: 'https://x.com/v.mp4' }] } }, gen)).toThrow(/não os dois/);
    // imagem nova do armazenamento: guardada como storage: (assinada só na hora de enviar)
    const stored = validateLaunchPlanInput({ code: 'CMP-GEN-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec: { ...spec, ads: [{ ...spec.ads[0], image_url: 'storage:creative-images/generated/p/1.png', factory_creative: '0e2b1a40-6a39-4c84-9d4b-3a7a0d1f8f11' }] } }, gen);
    expect(stored.spec.ads[0]).toMatchObject({ image_url: 'storage:creative-images/generated/p/1.png', factory_creative: '0e2b1a40-6a39-4c84-9d4b-3a7a0d1f8f11' });
    // plano comum nunca leva à página gerada
    expect(() => validateLaunchPlanInput({ code: 'CMP-X-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec })).toThrow(/só vale para campanha criada na tela de geração/);
  });
});

// ---------------------------------------------------------------------------------------------
// Rotas e criação (Postgres do CI)
// ---------------------------------------------------------------------------------------------

const ACT = 'act_117000000001';

function makeGraph(opts: { failOnFirst?: string } = {}) {
  const calls: { endpoint: string; payload: any; failed?: boolean }[] = [];
  let failed = false;
  const registry: { parent: string; edge: string; id: string; name: string; status: string }[] = [];
  let n = 0;
  const post = vi.fn(async (endpoint: string, payload: any) => {
    n++;
    if (opts.failOnFirst && !failed && endpoint.endsWith(opts.failOnFirst)) {
      failed = true;
      calls.push({ endpoint, payload, failed: true });
      throw new Error('[META GRAPH API ERROR]: simulated failure');
    }
    calls.push({ endpoint, payload });
    if (endpoint.endsWith('/adimages')) return { images: { img: { hash: `hash_${n}` } } };
    const id = `117${String(Date.now()).slice(-6)}${String(n).padStart(3, '0')}`;
    const edge = endpoint.endsWith('/campaigns') ? 'campaigns' : endpoint.endsWith('/adsets') ? 'adsets' : endpoint.endsWith('/ads') ? 'ads' : '';
    if (edge) {
      const parent = edge === 'campaigns' ? endpoint.slice(0, -'/campaigns'.length) : edge === 'adsets' ? `/${payload.campaign_id}` : `/${payload.adset_id}`;
      registry.push({ parent, edge, id, name: String(payload.name), status: String(payload.status) });
    }
    return { id };
  });
  const get = vi.fn(async (endpoint: string, params: Record<string, string> = {}) => {
    const listing = endpoint.match(/^(.*)\/(campaigns|adsets|ads)$/);
    if (listing && params.filtering) {
      const name = JSON.parse(params.filtering)[0].value;
      return { data: registry.filter(o => o.parent === listing[1] && o.edge === listing[2] && o.name === name) };
    }
    // NORQVA-0121: busca de estados (regiões) da Meta
    if (endpoint === '/search') {
      const keys: Record<string, string> = { 'Minas Gerais': '460', 'São Paulo': '472' };
      const q = String(params.q || '');
      return { data: keys[q] ? [{ key: keys[q], name: q, type: 'region', country_code: 'BR' }, { key: '9', name: `${q} (outro)`, type: 'region', country_code: 'BR' }] : [] };
    }
    if (endpoint === '/me') return { id: 'u1' };
    if (endpoint === '/me/permissions') return { data: [{ permission: 'ads_management', status: 'granted' }, { permission: 'ads_read', status: 'granted' }] };
    if (endpoint.startsWith('/act_')) return { id: endpoint.slice(1), account_status: 1 };
    if (endpoint === `/${OFFICIAL_NORQVA_PIXEL_ID}`) return { id: OFFICIAL_NORQVA_PIXEL_ID };
    throw new Error('unexpected GET ' + endpoint);
  });
  const fetched: string[] = [];
  const client = new MetaMutatingClient(post as any, undefined, get as any).setImageFetcherForTesting(async url => {
    fetched.push(url);
    return { ok: true, status: 200, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) as ArrayBuffer };
  });
  setLaunchPlanClientFactoryForTesting(() => client);
  return { post, calls, fetched, client };
}

describe.skipIf(isDbInMemory())('NORQVA-0117 — campanha pausada da página gerada', () => {
  let pool: Pool;
  let admin: string;
  let creative: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const brandId = crypto.randomUUID();
  const refId = crypto.randomUUID();
  const claimId = crypto.randomUUID();
  let seq = 0;
  const post = (url: string, body: any, token = admin) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const get = (url: string, token = admin) => request(app).get(url).set('Authorization', `Bearer ${token}`);

  /** Página publicada com 2 anúncios aprovados pela fábrica. */
  async function mkPage(opts: { status?: string; image?: boolean; imageUrl?: string } = {}) {
    seq++;
    const pageId = crypto.randomUUID();
    const hid = `GEN-T117${tag}${seq}`;
    const slug = `trattoria-t117-${tag.toLowerCase()}${seq}`;
    const sections = [
      { order: 1, ref_order: 1, role: 'HERO_HOOK', fixed: false, fixed_note: null, headline: 'Massa fresca em casa', body: 'Receitas italianas para fazer em casa.', bullets: [], cta_label: 'Quero o meu', image_url: opts.image === false ? null : opts.imageUrl || '/images/kit/capa_trat.jpg', image_status: opts.image === false ? 'NONE' : 'PRODUCT', image_prompt: '', image_started_at: null, image_error: null, removed_fields: [], retries: 0 },
      { order: 2, ref_order: null, role: 'OFFER_PRICE', fixed: false, fixed_note: null, headline: 'Leve hoje', body: 'O livro inteiro no seu e-mail.', bullets: [], cta_label: 'Comprar', image_url: null, image_status: 'NONE', image_prompt: '', image_started_at: null, image_error: null, removed_fields: [], retries: 0 }
    ];
    await pool.query(
      `INSERT INTO generated_pages (id, human_id, reference_id, product_id, offer_id, slug, status, sections, theme, copy_check, approved_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'light', '{"plan":[{"cta":true},{"cta":true}]}'::jsonb, NOW(), NOW())`,
      [pageId, hid, refId, productId, offerId, slug, opts.status || 'PUBLISHED', JSON.stringify(sections)]
    );
    const ads: { id: string; key: string }[] = [];
    for (const k of ['A1', 'A2']) {
      const key = `${hid}-${k}`;
      const f = { hook: `Gancho ${k === 'A1' ? 'um' : 'outro'}`, primary_text: 'Receitas com passo a passo para fazer em casa.', headline: 'Cozinha italiana em casa', cta: 'Saiba mais', format: 'IMAGE', script: 'Gancho: Abertura', mechanism: null, file_url: null };
      const hash = computeContentHash(f);
      const c = await pool.query(
        `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, script, status, is_demo, utm_content_key,
                                content_hash, approval_status, generation_source, reference_id, generated_page_id, ad_description, version, lineage_code)
         VALUES ($1, $2, $3, $4, 'c', $5, $5, $6, $7, 'IMAGE', $8, 'IDEIA', FALSE, $1, $9, 'DRAFT', 'AI_REFERENCE', $10, $11, 'Livro digital de receitas', 1, $1) RETURNING id`,
        [key, productId, offerId, f.hook, f.primary_text, f.headline, f.cta, f.script, hash, refId, pageId]
      );
      await pool.query('INSERT INTO creative_claims (creative_id, claim_id) VALUES ($1, $2)', [c.rows[0].id, claimId]);
      const rv = await post(`/api/creative-factory/creatives/${c.rows[0].id}/review`, { decision: 'APPROVED' });
      expect(rv.status, JSON.stringify(rv.body)).toBe(200);
      ads.push({ id: c.rows[0].id, key });
    }
    return { pageId, hid, slug, ads };
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0117', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0117@norqva.test', 'ADMIN');
    creative = await mk('creative.norqva0117@norqva.test', 'CREATIVE');
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Marca 0117')`, [brandId, `T117${tag}`]);
    await pool.query(`INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, status) VALUES ($1, 'FACEBOOK_PAGE', '1170000000001', 'LINKED')`, [brandId]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id)
       VALUES ($1, $2, 'Trattoria T117', 'Receitas', 'Receitas italianas de massas e molhos', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-T117${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo, data_provenance, card_enabled, card_max_installments, card_free_installments)
       VALUES ($1, $2, $3, 'Trattoria T117', 19.90, 'Livro digital', 'ATIVA', false, 'COMMERCIAL_PRODUCTION', true, 4, 4)`,
      [offerId, `OFF-T117${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO claims_registry (id, human_id, product_id, claim_text, claim_type, source, status, is_demo)
       VALUES ($1, $2, $3, 'Receitas com passo a passo', 'FEATURE', 'teste', 'VERIFIED', false)`,
      [claimId, `CLM-T117${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO creative_references (id, human_id, product_id, source_kind, reference_type, status, structure, source_shingles, source_shingle_count, data_provenance)
       VALUES ($1, $2, $3, 'PAGE_URL', 'SALES_PAGE', 'READY', $4::jsonb, '{}'::text[], 0, 'COMMERCIAL_PRODUCTION')`,
      [refId, `REF-T117${tag}`, productId, JSON.stringify({ kind: 'SALES_PAGE', tone: '', length_class: 'SHORT', cta_text_style: '', color_mood: '', sections: [] })]
    );
  });

  beforeEach(() => {
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
    process.env.META_MUTATION_ENABLED = 'true';
    process.env.META_AD_ACCOUNT_ID = ACT;
    resetMetaPreflightCacheForTesting();
  });

  afterEach(() => {
    delete process.env.META_MUTATION_ENABLED;
    delete process.env.META_AD_ACCOUNT_ID;
    setLaunchPlanClientFactoryForTesting(null);
    resetMetaPreflightCacheForTesting();
  });

  afterAll(async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    if (!pool) return;
    await pool.query('DELETE FROM creative_meta_ads WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM launch_plans WHERE generated_page_id IN (SELECT id FROM generated_pages WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creative_claims WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creative_reviews WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM generated_pages WHERE product_id = $1', [productId]).catch(() => {});
  });

  it('só ADMIN: CREATIVE não vê nem cria a campanha', async () => {
    const p = await mkPage();
    expect((await get(`/api/generated-pages/${p.pageId}/campaign`, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${p.pageId}/campaign`, {}, creative)).status).toBe(403);
  });

  it('sugestões: nome, R$ 30/dia, teto de 7 dias, Brasil 25–65; anúncios prontos', async () => {
    const p = await mkPage();
    const r = await get(`/api/generated-pages/${p.pageId}/campaign`);
    expect(r.status).toBe(200);
    expect(r.body.plan).toBeNull();
    expect(r.body.defaults).toMatchObject({ campaign_name: `NQ – Trattoria T117 – Ref REF-T117${tag} – Vendas`, daily_budget_brl: 30, max_spend_brl: 210, age_min: 25, age_max: 65 });
    expect(r.body.ads.filter((a: any) => a.ready)).toHaveLength(2);
    expect(r.body.page.url).toBe(`https://acesso.norqva.com.br/v/${p.slug}`);
  });

  it('cadastro na Meta desligado: só o rascunho; segundo clique devolve o mesmo plano', async () => {
    delete process.env.META_MUTATION_ENABLED;
    const g = makeGraph();
    const p = await mkPage();
    const r = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(r.status).toBe(200);
    expect(r.body.meta).toBe('DISABLED');
    expect(r.body.message).toContain('Cadastro na Meta desligado');
    expect(r.body.plan.status).toBe('DRAFT');
    const again = await post(`/api/generated-pages/${p.pageId}/campaign`, { daily_budget_brl: 50 });
    expect(again.body.plan.id).toBe(r.body.plan.id);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM launch_plans WHERE generated_page_id = $1', [p.pageId])).rows[0].n).toBe(1);
    expect(g.post).not.toHaveBeenCalled();
  });

  it('cria campanha, conjunto e anúncios de imagem, tudo PAUSADO, com UTMs e destino certos; segundo clique não duplica', async () => {
    const g = makeGraph();
    const p = await mkPage();
    const r = await post(`/api/generated-pages/${p.pageId}/campaign`, { daily_budget_brl: 30 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.created).toBe(true);
    const plan = r.body.plan;
    expect(plan.status).toBe('AWAITING_OPERATOR');
    expect(plan.code).toBe(`CMP-${p.hid}`.toUpperCase());
    // todo POST de criação levou PAUSED; nenhum POST mudou objeto existente; nenhum ACTIVE
    const creates = g.calls.filter(c => /\/(campaigns|adsets|ads)$/.test(c.endpoint));
    expect(creates.length).toBe(1 + 1 + 2);
    for (const c of creates) expect(c.payload.status).toBe('PAUSED');
    expect(JSON.stringify(g.calls)).not.toContain('ACTIVE');
    expect(g.calls.some(c => /^\/\d+$/.test(c.endpoint))).toBe(false);
    // imagens enviadas e peças com o hash, a página e as UTMs
    // os dois anúncios usam a mesma imagem (só a abertura tem imagem): enviada uma vez só
    expect(g.calls.filter(c => c.endpoint.endsWith('/adimages'))).toHaveLength(1);
    expect(g.fetched[0]).toBe('https://acesso.norqva.com.br/images/kit/capa_trat.jpg');
    const creatives = g.calls.filter(c => c.endpoint.endsWith('/adcreatives'));
    expect(creatives).toHaveLength(2);
    const ld = creatives[0].payload.object_story_spec.link_data;
    expect(ld.link).toBe(`https://acesso.norqva.com.br/v/${p.slug}`);
    expect(ld.image_hash).toMatch(/^hash_/);
    expect(ld.description).toBe('Livro digital de receitas');
    expect(creatives[0].payload.url_tags).toBe(
      `utm_source=meta&utm_medium=paid_social&utm_campaign=${plan.code}&utm_content=${p.ads[0].key}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}`
    );
    expect(creatives[1].payload.object_story_spec.link_data.image_hash).toBe(ld.image_hash);
    const adset = g.calls.find(c => c.endpoint.endsWith('/adsets'))!.payload;
    expect(adset).toMatchObject({ daily_budget: 3000, promoted_object: { pixel_id: OFFICIAL_NORQVA_PIXEL_ID, custom_event_type: 'PURCHASE' } });
    expect(adset.targeting).toMatchObject({ geo_locations: { countries: ['BR'] }, age_min: 25, age_max: 65 });
    // criativos ligados aos anúncios da Meta e registro no histórico
    const links = await pool.query('SELECT COUNT(*)::int AS n FROM creative_meta_ads WHERE creative_id = ANY($1::uuid[])', [p.ads.map(a => a.id)]);
    expect(links.rows[0].n).toBe(2);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'GENERATED_CAMPAIGN_CREATED' AND description LIKE $1`, [`%${plan.code}%`]);
    expect(audit.rows.length).toBe(1);
    // segundo clique: mostra o plano que existe e não chama a Meta
    const before = g.calls.length;
    const again = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(again.status).toBe(200);
    expect(again.body.existing).toBe(true);
    expect(again.body.plan.id).toBe(plan.id);
    expect(g.calls.length).toBe(before);
  });

  it('bloqueia: página fora do ar, página sem imagem, anúncio mudou depois de montar, preço no texto', async () => {
    const g = makeGraph();
    const off = await mkPage({ status: 'UNPUBLISHED' });
    const r1 = await post(`/api/generated-pages/${off.pageId}/campaign`, {});
    expect(r1.status).toBe(409);
    expect(r1.body.error).toContain('no ar');

    // NORQVA-0128: sem imagem na página E sem imagem do produto no site (Trattoria tem fotos no site)
    await pool.query(`UPDATE products SET name = 'Produto T117 sem fotos' WHERE id = $1`, [productId]);
    const noImg = await mkPage({ image: false });
    const r2 = await post(`/api/generated-pages/${noImg.pageId}/campaign`, {});
    await pool.query(`UPDATE products SET name = 'Trattoria T117' WHERE id = $1`, [productId]);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('sem imagem');

    // monta com a criação desligada, depois o anúncio muda pela fábrica (checagem vencida, sem aprovação)
    delete process.env.META_MUTATION_ENABLED;
    const stale = await mkPage();
    expect((await post(`/api/generated-pages/${stale.pageId}/campaign`, {})).body.plan.status).toBe('DRAFT');
    expect((await post(`/api/creative-factory/creatives/${stale.ads[0].id}/review`, { decision: 'REVISION_REQUESTED', notes: 'x' })).status).toBe(200);
    expect((await post(`/api/creative-factory/creatives/${stale.ads[0].id}/revise`, { primary_text: 'Receitas com passo a passo, agora mais claras.' })).status).toBe(200);
    process.env.META_MUTATION_ENABLED = 'true';
    // criação do plano já montado (sem montar de novo): a conferência na hora barra
    const stalePlan = (await pool.query('SELECT id FROM launch_plans WHERE generated_page_id = $1', [stale.pageId])).rows[0];
    const r3 = await post(`/api/launch-plans/${stalePlan.id}/create`, {});
    expect(r3.status).toBe(409);
    expect(r3.body.error).toContain('Montar de novo');
    expect((await pool.query('SELECT status FROM launch_plans WHERE id = $1', [stalePlan.id])).rows[0].status).toBe('DRAFT');
    // montar de novo: o anúncio que mudou (sem aprovação) fica de fora; o outro segue
    const rebuilt = await post(`/api/generated-pages/${stale.pageId}/campaign`, {});
    expect(rebuilt.status, JSON.stringify(rebuilt.body)).toBe(200);
    expect(rebuilt.body.plan.spec.ads.map((a: any) => a.name)).toEqual([stale.ads[1].key]);

    // preço enfiado no texto direto no banco (fora da tela): a checagem refeita barra
    delete process.env.META_MUTATION_ENABLED;
    const priced = await mkPage();
    expect((await post(`/api/generated-pages/${priced.pageId}/campaign`, {})).body.plan.status).toBe('DRAFT');
    await pool.query(`UPDATE creatives SET hook = 'Só hoje por R$ 19,90' WHERE id = $1`, [priced.ads[1].id]);
    process.env.META_MUTATION_ENABLED = 'true';
    const pricedPlan = (await pool.query('SELECT id FROM launch_plans WHERE generated_page_id = $1', [priced.pageId])).rows[0];
    const before = g.calls.length;
    const r4 = await post(`/api/launch-plans/${pricedPlan.id}/create`, {});
    expect(r4.status).toBe(409);
    expect(String(r4.body.error)).toMatch(/Pre[cç]o|preço/i);
    expect(g.calls.slice(before).filter(c => /\/(campaigns|adsets|ads|adcreatives|adimages)$/.test(c.endpoint))).toHaveLength(0);
  });

  it('a rota genérica de criação do plano também usa a conferência da página', async () => {
    delete process.env.META_MUTATION_ENABLED;
    const p = await mkPage();
    const plan = (await post(`/api/generated-pages/${p.pageId}/campaign`, {})).body.plan;
    await pool.query(`UPDATE generated_pages SET status = 'UNPUBLISHED' WHERE id = $1`, [p.pageId]);
    process.env.META_MUTATION_ENABLED = 'true';
    const g = makeGraph();
    const r = await post(`/api/launch-plans/${plan.id}/create`, {});
    expect(r.status).toBe(409);
    expect(g.post).not.toHaveBeenCalled();
    // a troca de criativos da tela Campanhas não mexe em anúncio de página gerada
    expect((await post(`/api/campaigns/${plan.id}/fill?mode=real`, {})).status).toBe(409);
  });

  it('rota genérica com página no ar e uma Graph que aceitaria ACTIVE: a trava bloqueia antes de enviar', async () => {
    delete process.env.META_MUTATION_ENABLED;
    const p = await mkPage();
    const plan = (await post(`/api/generated-pages/${p.pageId}/campaign`, {})).body.plan;
    process.env.META_MUTATION_ENABLED = 'true';
    const g = makeGraph();
    const tampered = g.client;
    // simula um defeito que tentasse criar a campanha ACTIVE
    (tampered as any).createPausedCampaign = async function (this: any) {
      return { externalId: (await this.callTransportPost(`/${ACT}/campaigns`, { name: 'x', objective: 'OUTCOME_SALES', status: 'ACTIVE' })).id };
    };
    setLaunchPlanClientFactoryForTesting(() => tampered);
    const r = await post(`/api/launch-plans/${plan.id}/create`, {});
    expect(r.status).not.toBe(200);
    expect(String(r.body.error)).toMatch(/PAUSADO/);
    expect(g.calls.filter(c => c.endpoint.endsWith('/campaigns'))).toHaveLength(0);
    const row = (await pool.query('SELECT status FROM launch_plans WHERE id = $1', [plan.id])).rows[0];
    expect(row.status).toBe('FAILED');
  });

  it('imagem nova (armazenamento): o rascunho guarda storage: e a criação usa um link assinado novo', async () => {
    let n = 0;
    setImageStorageForTests({
      upload: async () => {},
      bucketExists: async () => true,
      signedUrl: async (b, path) => `https://mock.supabase.co/storage/v1/object/sign/${b}/${path}?token=t${++n}`
    });
    try {
      delete process.env.META_MUTATION_ENABLED;
      const p = await mkPage({ imageUrl: 'storage:creative-images/generated/t117/1.png' });
      const drafted = (await post(`/api/generated-pages/${p.pageId}/campaign`, {})).body.plan;
      expect(drafted.spec.ads[0].image_url).toBe('storage:creative-images/generated/t117/1.png');
      const before = n;
      process.env.META_MUTATION_ENABLED = 'true';
      const g = makeGraph();
      const r = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(n).toBeGreaterThan(before);
      expect(g.fetched[0]).toBe(`https://mock.supabase.co/storage/v1/object/sign/creative-images/generated/t117/1.png?token=t${n}`);
    } finally {
      setImageStorageForTests(null);
    }
  });

  it('montar de novo: rascunho e recusado sem nada na Meta são montados na mesma linha; com objetos na Meta, não', async () => {
    delete process.env.META_MUTATION_ENABLED;
    const p = await mkPage();
    const first = (await post(`/api/generated-pages/${p.pageId}/campaign`, { daily_budget_brl: 30 })).body.plan;
    const again = await post(`/api/generated-pages/${p.pageId}/campaign`, { daily_budget_brl: 45 });
    expect(again.body.plan.id).toBe(first.id);
    expect(again.body.plan.code).toBe(first.code);
    expect(again.body.rebuilt).toBe(true);
    expect(again.body.plan.daily_budget_brl).toBe(45);
    // recusado sem nada na Meta: volta a rascunho, mesma linha
    await pool.query(`UPDATE launch_plans SET status = 'REJECTED', answer = 'NO' WHERE id = $1`, [first.id]);
    const ov = await get(`/api/generated-pages/${p.pageId}/campaign`);
    expect(ov.body.rebuildable).toBe(true);
    const rebuilt = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(rebuilt.body.plan.id).toBe(first.id);
    expect(rebuilt.body.plan.status).toBe('DRAFT');
    expect(rebuilt.body.plan.answer).toBeNull();
    // com objetos na Meta: devolve o plano como está e avisa
    await pool.query(`UPDATE launch_plans SET status = 'REJECTED', meta_ids = $2 WHERE id = $1`, [first.id, JSON.stringify({ campaign: { x: '1170001' }, adsets: {}, videos: {}, creatives: {}, ads: {}, images: {} })]);
    const kept = await post(`/api/generated-pages/${p.pageId}/campaign`, { daily_budget_brl: 50 });
    expect(kept.status).toBe(200);
    expect(kept.body.plan.status).toBe('REJECTED');
    expect(kept.body.message).toContain('na Meta');
    expect((await get(`/api/generated-pages/${p.pageId}/campaign`)).body.rebuildable).toBe(false);
  });

  it('falha no meio e retomada: nada é criado duas vezes', async () => {
    const p = await mkPage();
    const g = makeGraph({ failOnFirst: '/ads' });
    const r1 = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(r1.status).not.toBe(200);
    expect(r1.body.plan.status).toBe('FAILED');
    expect((await get(`/api/generated-pages/${p.pageId}/campaign`)).body.rebuildable).toBe(false);
    const r2 = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(r2.body.plan.status).toBe('AWAITING_OPERATOR');
    const ok = (suffix: string) => g.calls.filter(c => c.endpoint.endsWith(suffix) && !c.failed).length;
    expect(ok('/campaigns')).toBe(1);
    expect(ok('/adsets')).toBe(1);
    expect(ok('/adimages')).toBe(1);
    expect(ok('/adcreatives')).toBe(2);
    expect(ok('/ads')).toBe(2);
  });

  it('plano de página gerada respondido com Sim ativa normalmente (a ativação não tem a trava de criação)', async () => {
    const p = await mkPage();
    const g = makeGraph();
    const created = await post(`/api/generated-pages/${p.pageId}/campaign`, {});
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const before = g.calls.length;
    const r = await post(`/api/launch-plans/${created.body.plan.id}/answer`, { answer: 'YES' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.plan.status).toBe('ACTIVE');
    const activations = g.calls.slice(before).filter(c => c.payload?.status === 'ACTIVE');
    expect(activations.length).toBeGreaterThan(0);
  });

  it('plano comum com destino /v/ é recusado', async () => {
    const r = await post('/api/launch-plans', {
      code: `T117V${tag}`,
      offer_human_id: `OFF-T117${tag}`,
      max_spend_brl: 210,
      question_text: 'Ativar?',
      spec: {
        campaign: { name: `T117 V ${tag}`, objective: 'OUTCOME_SALES' },
        pixel_id: OFFICIAL_NORQVA_PIXEL_ID,
        adsets: [{ name: 'S1', daily_budget_brl: 30, targeting: { countries: ['BR'], age_min: 25, age_max: 65 } }],
        ads: [{ name: 'A1', adset_name: 'S1', image_url: 'https://acesso.norqva.com.br/images/kit/capa_trat.jpg', primary_text: 'P', headline: 'H', cta: 'LEARN_MORE', destination_url: 'https://acesso.norqva.com.br/v/qualquer-pagina', url_tags: 'utm_source=meta' }]
      }
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('só vale para campanha criada na tela de geração');
  });


  // ---------------------------------------------------------------------------------------------
  // NORQVA-0121 (contrato NORQVA-0118, etapa C): ajustes de publicação
  // ---------------------------------------------------------------------------------------------

  it('NORQVA-0121: livro da coleção sugere 45–65; destinos e estados na tela; WhatsApp ainda indisponível', async () => {
    await pool.query('UPDATE products SET collection_key = $2 WHERE id = $1', [productId, `t120${tag.toLowerCase()}`]);
    try {
      const p = await mkPage();
      const r = await get(`/api/generated-pages/${p.pageId}/campaign`);
      expect(r.body.defaults).toMatchObject({ age_min: 45, age_max: 65, destination: 'PAGE', regions: [], genders: 'ALL', placements: 'AUTOMATIC', advantage_audience: true, end_date: null });
      expect(r.body.destinations.map((d: any) => [d.value, d.available])).toEqual([['PAGE', true], ['OFFER_PAGE', true], ['WHATSAPP', false]]);
      expect(r.body.destinations[1].url).toBe(`https://norqva-intelligence-frontend.vercel.app/p/OFF-T117${tag}`);
      expect(r.body.states.MG).toBe('Minas Gerais');
    } finally {
      await pool.query('UPDATE products SET collection_key = NULL WHERE id = $1', [productId]);
    }
  });

  it('NORQVA-0121: todos os ajustes chegam PAUSADOS na Meta (estados, sexo, idade como sugestão, posicionamentos, término, destino da oferta, anúncios escolhidos)', async () => {
    const g = makeGraph();
    const p = await mkPage();
    const end = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const r = await post(`/api/generated-pages/${p.pageId}/campaign`, {
      daily_budget_brl: 40,
      max_spend_brl: 200,
      age_min: 45,
      age_max: 65,
      regions: ['sp', 'MG'],
      genders: 'FEMALE',
      placements: 'FACEBOOK_INSTAGRAM',
      advantage_audience: true,
      end_date: end,
      destination: 'OFFER_PAGE',
      creative_ids: [p.ads[1].id]
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.created).toBe(true);
    const spec = r.body.plan.spec;
    expect(spec.adsets[0]).toMatchObject({
      daily_budget_brl: 40,
      end_date: end,
      targeting: { countries: ['BR'], regions: ['MG', 'SP'], genders: 'FEMALE', placements: 'FACEBOOK_INSTAGRAM', age_min: 45, age_max: 65, advantage_audience: true }
    });
    expect(spec.adsets[0].targeting_summary).toBe('MG, SP, 45–65 (sugestão), mulheres (sugestão), público Advantage, só Facebook e Instagram');
    expect(r.body.plan.question_text).toContain(`até ${end.split('-').reverse().join('/')}?`);
    expect(r.body.plan.question_text).toContain('Público: MG, SP');
    expect(spec.ads).toHaveLength(1);
    expect(spec.ads[0].factory_creative).toBe(p.ads[1].id);
    expect(spec.ads[0].destination_url).toBe(`https://norqva-intelligence-frontend.vercel.app/p/OFF-T117${tag}`);
    const adset = g.calls.find(c => c.endpoint.endsWith('/adsets'))!.payload;
    expect(adset.status).toBe('PAUSED');
    expect(adset.end_time).toBe(`${end}T23:59:00-0300`);
    // Advantage ligado: idade mínima de controle até 25, máxima 65 e a faixa escolhida como sugestão
    expect(adset.targeting).toMatchObject({
      geo_locations: { regions: [{ key: '460' }, { key: '472' }] },
      age_min: 25,
      age_max: 65,
      age_range: [45, 65],
      genders: [2],
      publisher_platforms: ['facebook', 'instagram'],
      targeting_automation: { advantage_audience: 1 }
    });
    expect(adset.targeting.geo_locations.countries).toBeUndefined();
    const creativeCall = g.calls.find(c => c.endpoint.endsWith('/adcreatives'))!.payload;
    expect(JSON.stringify(creativeCall)).toContain(`/p/OFF-T117${tag}`);
    expect(JSON.stringify(g.calls)).not.toContain('ACTIVE');
  });

  it('NORQVA-0121: público fechado trava a idade; valores inválidos são recusados sem criar nada', async () => {
    const g = makeGraph();
    const p = await mkPage();
    const bad = async (body: any, msg: RegExp) => {
      const r = await post(`/api/generated-pages/${p.pageId}/campaign`, body);
      expect(r.status, JSON.stringify(r.body)).toBe(400);
      expect(r.body.error).toMatch(msg);
    };
    await bad({ regions: ['XX'] }, /siglas dos estados/);
    await bad({ genders: 'OUTRO' }, /sexo inválido/);
    await bad({ placements: 'TUDO' }, /posicionamento inválido/);
    await bad({ destination: 'WHATSAPP' }, /WhatsApp fica para quando/);
    await bad({ end_date: '2020-01-01' }, /depois de hoje/);
    await bad({ end_date: '31/12/2026' }, /data de término inválida/);
    expect(g.post).not.toHaveBeenCalled();
    const ok = await post(`/api/generated-pages/${p.pageId}/campaign`, { age_min: 45, age_max: 60, advantage_audience: false });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const adset = g.calls.find(c => c.endpoint.endsWith('/adsets'))!.payload;
    expect(adset.targeting).toMatchObject({ geo_locations: { countries: ['BR'] }, age_min: 45, age_max: 60, targeting_automation: { advantage_audience: 0 } });
    expect(adset.targeting.age_range).toBeUndefined();
    expect(adset.end_time).toBeUndefined();
    expect(adset.targeting.publisher_platforms).toBeUndefined();
  });


  it('NORQVA-0121: estado que a Meta não acha para antes de criar qualquer coisa; dá para montar de novo sem o estado', async () => {
    const g = makeGraph();
    const p = await mkPage();
    const r = await post(`/api/generated-pages/${p.pageId}/campaign`, { regions: ['MG', 'TO'] });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('Tocantins');
    expect(g.calls.filter(c => /\/(campaigns|adsets|ads|adcreatives|adimages)$/.test(c.endpoint))).toHaveLength(0);
    const ov = await get(`/api/generated-pages/${p.pageId}/campaign`);
    expect(ov.body.rebuildable).toBe(true);
    const again = await post(`/api/generated-pages/${p.pageId}/campaign`, { regions: ['MG'] });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.created).toBe(true);
  });

  it('NORQVA-0121: Sim de um conjunto cuja data de término já passou: aviso claro e nada ativado', async () => {
    const g = makeGraph();
    const p = await mkPage();
    const end = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const created = await post(`/api/generated-pages/${p.pageId}/campaign`, { end_date: end });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const row = (await pool.query('SELECT spec FROM launch_plans WHERE id = $1', [created.body.plan.id])).rows[0];
    const spec = typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec;
    spec.adsets[0].end_date = '2026-01-10';
    await pool.query('UPDATE launch_plans SET spec = $2 WHERE id = $1', [created.body.plan.id, JSON.stringify(spec)]);
    const before = g.calls.length;
    const r = await post(`/api/launch-plans/${created.body.plan.id}/answer`, { answer: 'YES' });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain('terminou em 10/01/2026');
    expect(g.calls.slice(before).filter(c => c.payload?.status === 'ACTIVE')).toHaveLength(0);
  });

  it('NORQVA-0121: oferta de kit leva para /kit/', async () => {
    await pool.query(`UPDATE offers SET name = 'Kit Trattoria T117' WHERE id = $1`, [offerId]);
    try {
      const p = await mkPage();
      const r = await get(`/api/generated-pages/${p.pageId}/campaign`);
      expect(r.body.destinations[1].url).toBe(`https://norqva-intelligence-frontend.vercel.app/kit/OFF-T117${tag}`);
    } finally {
      await pool.query(`UPDATE offers SET name = 'Trattoria T117' WHERE id = $1`, [offerId]);
    }
  });

});
