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
import { assertOnlyPausedPayload, utmTags, pageUrl, pausedOnlyClient } from '../services/launchPlans/generatedCampaignService';
import { computeContentHash } from '../services/creative/creativeFactoryService';

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
    expect(() => assertOnlyPausedPayload('/120000000001', { status: 'PAUSED' })).toThrow(/objeto existente/);
  });

  it('o cliente com a trava não manda nada ACTIVE (nem pela Graph simulada)', async () => {
    const post = vi.fn(async () => ({ id: '1' }));
    const client = pausedOnlyClient(new MetaMutatingClient(post as any));
    await expect((client as any).callTransportPost('/act_1/campaigns', { status: 'ACTIVE' })).rejects.toThrow(/PAUSADO/);
    expect(post).not.toHaveBeenCalled();
  });

  it('UTMs: origem meta, mídia paga, campanha = código do plano, conteúdo = código do criativo', () => {
    expect(utmTags('CMP-GEN-000001', 'GEN-000001-A1')).toBe('utm_source=meta&utm_medium=paid&utm_campaign=CMP-GEN-000001&utm_content=GEN-000001-A1');
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
    const ok = validateLaunchPlanInput({ code: 'CMP-GEN-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec }, { forCreation: true });
    expect(ok.spec.ads[0]).toMatchObject({ image_url: 'https://acesso.norqva.com.br/images/kit/capa_trat.jpg', video_url: '', description: 'D' });
    expect(() => validateLaunchPlanInput({ code: 'CMP-GEN-1', max_spend_brl: 210, question_text: 'Ativar?', spec })).toThrow(/oferta informada/);
    expect(() => validateLaunchPlanInput({ code: 'CMP-GEN-1', offer_human_id: 'OFF-1', max_spend_brl: 210, question_text: 'Ativar?', spec: { ...spec, ads: [{ ...spec.ads[0], video_url: 'https://x.com/v.mp4' }] } })).toThrow(/não os dois/);
  });
});

// ---------------------------------------------------------------------------------------------
// Rotas e criação (Postgres do CI)
// ---------------------------------------------------------------------------------------------

const ACT = 'act_117000000001';

function makeGraph() {
  const calls: { endpoint: string; payload: any }[] = [];
  const registry: { parent: string; edge: string; id: string; name: string; status: string }[] = [];
  let n = 0;
  const post = vi.fn(async (endpoint: string, payload: any) => {
    calls.push({ endpoint, payload });
    n++;
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
  return { post, calls, fetched };
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
  async function mkPage(opts: { status?: string; image?: boolean } = {}) {
    seq++;
    const pageId = crypto.randomUUID();
    const hid = `GEN-T117${tag}${seq}`;
    const slug = `trattoria-t117-${tag.toLowerCase()}${seq}`;
    const sections = [
      { order: 1, ref_order: 1, role: 'HERO_HOOK', fixed: false, fixed_note: null, headline: 'Massa fresca em casa', body: 'Receitas italianas para fazer em casa.', bullets: [], cta_label: 'Quero o meu', image_url: opts.image === false ? null : '/images/kit/capa_trat.jpg', image_status: opts.image === false ? 'NONE' : 'PRODUCT', image_prompt: '', image_started_at: null, image_error: null, removed_fields: [], retries: 0 },
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
    expect(g.calls.filter(c => c.endpoint.endsWith('/adimages'))).toHaveLength(2);
    expect(g.fetched[0]).toBe('https://acesso.norqva.com.br/images/kit/capa_trat.jpg');
    const creatives = g.calls.filter(c => c.endpoint.endsWith('/adcreatives'));
    expect(creatives).toHaveLength(2);
    const ld = creatives[0].payload.object_story_spec.link_data;
    expect(ld.link).toBe(`https://acesso.norqva.com.br/v/${p.slug}`);
    expect(ld.image_hash).toMatch(/^hash_/);
    expect(ld.description).toBe('Livro digital de receitas');
    expect(creatives[0].payload.url_tags).toBe(`utm_source=meta&utm_medium=paid&utm_campaign=${plan.code}&utm_content=${p.ads[0].key}`);
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

    const noImg = await mkPage({ image: false });
    const r2 = await post(`/api/generated-pages/${noImg.pageId}/campaign`, {});
    expect(r2.status).toBe(409);
    expect(r2.body.error).toContain('sem imagem');

    // monta com a criação desligada, depois o anúncio muda pela fábrica (checagem vencida, sem aprovação)
    delete process.env.META_MUTATION_ENABLED;
    const stale = await mkPage();
    expect((await post(`/api/generated-pages/${stale.pageId}/campaign`, {})).body.plan.status).toBe('DRAFT');
    expect((await post(`/api/creative-factory/creatives/${stale.ads[0].id}/review`, { decision: 'REVISION_REQUESTED', notes: 'x' })).status).toBe(200);
    expect((await post(`/api/creative-factory/creatives/${stale.ads[0].id}/revise`, { primary_text: 'Receitas com passo a passo, agora mais claras.' })).status).toBe(200);
    process.env.META_MUTATION_ENABLED = 'true';
    const r3 = await post(`/api/generated-pages/${stale.pageId}/campaign`, {});
    expect(r3.status).toBe(409);
    expect(r3.body.plan.status).toBe('DRAFT');

    // preço enfiado no texto direto no banco (fora da tela): a checagem refeita barra
    delete process.env.META_MUTATION_ENABLED;
    const priced = await mkPage();
    expect((await post(`/api/generated-pages/${priced.pageId}/campaign`, {})).body.plan.status).toBe('DRAFT');
    await pool.query(`UPDATE creatives SET hook = 'Só hoje por R$ 19,90' WHERE id = $1`, [priced.ads[1].id]);
    process.env.META_MUTATION_ENABLED = 'true';
    const r4 = await post(`/api/generated-pages/${priced.pageId}/campaign`, {});
    expect(r4.status).toBe(409);
    expect(String(r4.body.error)).toMatch(/Pre[cç]o|preço/i);

    expect(g.calls.filter(c => /\/(campaigns|adsets|ads|adcreatives|adimages)$/.test(c.endpoint))).toHaveLength(0);
  });

  it('a rota genérica de criação do plano também usa a trava "só PAUSED" e a conferência da página', async () => {
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
});
