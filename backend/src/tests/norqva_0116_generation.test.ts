// NORQVA-0116: geração (página original + anúncios na fábrica) a partir de uma referência.
// IA, KIE e armazenamento sempre simulados: nada sai para a internet.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { sourceShingles, shingleHashes } from '../services/creative/referenceService';
import {
  checkText,
  CheckContext,
  digitsOf,
  validateGeneratedPage,
  validateAdVariants,
  setGenerationAiForTests,
  buildPagePlan,
  GenerationService,
  ProductFacts,
  factLines
} from '../services/creative/generationService';
import { setKieForTests, setImageStorageForTests, FetchLike, KIE_MISSING_MESSAGE, productImages } from '../services/creative/generatedImages';

// texto da "referência": só as impressões dele vão para o banco (como na etapa 1)
const SECRET = 'Minha avó Lucia guardava este caderno secreto de massas frescas na cozinha de Bolonha e agora ele chegou até você.';
const COPIED = 'guardava este caderno secreto de massas frescas';

const baseCtx = (over: Partial<CheckContext> = {}): CheckContext => ({
  shingles: new Set(sourceShingles([SECRET])),
  allowedDigits: digitsOf(['Preço: R$ 19,90', 'Cartão: até 4x']),
  approvedClaims: [],
  ad: false,
  ...over
});

afterEach(() => {
  setGenerationAiForTests(null);
  setKieForTests(null);
  setImageStorageForTests(null);
});

describe('NORQVA-0116 — checagem de cada texto', () => {
  it('anticópia: pega uma janela de 6 palavras da referência com o hash da etapa 1', () => {
    const text = `Nosso livro ${COPIED} para você`;
    expect(shingleHashes(text).some(h => sourceShingles([SECRET]).includes(h))).toBe(true);
    expect(checkText(text, baseCtx()).map(i => i.code)).toContain('COPY');
    // 5 palavras iguais não bastam
    expect(checkText('Nosso caderno secreto de massas frescas chegou', baseCtx()).map(i => i.code)).not.toContain('COPY');
    // pontuação e acentos não escondem a cópia
    expect(checkText('GUARDAVA, este caderno: secreto — de massas FRESCAS!', baseCtx()).map(i => i.code)).toContain('COPY');
  });

  it('número que não vem dos nossos fatos é barrado; preço e parcelas da oferta passam na página', () => {
    expect(checkText('Por R$ 19,90 em até 4x no cartão.', baseCtx())).toEqual([]);
    const bad = checkText('Mais de 3000 alunas já aprovaram.', baseCtx());
    expect(bad.map(i => i.code)).toEqual(['DIGIT']);
    expect(bad[0].detail).toContain('3000');
  });

  it('promessa de saúde não aprovada é barrada; a mesma promessa aprovada passa', () => {
    const ctx = baseCtx({ allowedDigits: digitsOf(['5']) });
    expect(checkText('Perca 5 kg em pouco tempo', ctx).map(i => i.code)).toContain('HEALTH');
    expect(checkText('Emagreça 3 números de manequim', baseCtx()).map(i => i.code)).toContain('HEALTH');
    expect(checkText('Resultado garantido para todo mundo', baseCtx()).map(i => i.code)).toContain('HEALTH');
    expect(checkText('A cura que você procurava', baseCtx()).map(i => i.code)).toContain('HEALTH');
    expect(checkText('Tudo sem esforço nenhum', baseCtx()).map(i => i.code)).toContain('HEALTH');
    // palavras parecidas não disparam
    expect(checkText('Queijo curado e uma garantia de 7 dias', baseCtx({ allowedDigits: digitsOf(['7']) }))).toEqual([]);
    const approved = baseCtx({ allowedDigits: digitsOf(['5']), approvedClaims: ['Quem segue o plano pode perca 5 kg em 21 dias'] });
    expect(checkText('Perca 5 kg', approved).map(i => i.code)).not.toContain('HEALTH');
  });

  it('anúncio: preço é barrado (mesma trava da D-0053)', () => {
    const ad = baseCtx({ ad: true });
    expect(checkText('Leve hoje por apenas R$ 19,90', ad).map(i => i.code)).toContain('PRICE');
    expect(checkText('Veja o preço na página', ad).map(i => i.code)).toContain('PRICE');
    expect(checkText('Receitas italianas para fazer em casa', ad)).toEqual([]);
  });
});

describe('NORQVA-0116 — esquema da IA', () => {
  it('página: sem lista de seções é inválida; textos são limpos e cortados', () => {
    expect(validateGeneratedPage(null)).toBeNull();
    expect(validateGeneratedPage({ sections: 'x' })).toBeNull();
    expect(validateGeneratedPage({ sections: [] })).toBeNull();
    const v = validateGeneratedPage({
      sections: [{ headline: '  Título   com espaço ', body: 'a'.repeat(5000), bullets: ['um', 2, '', 'três'], cta_label: 'Quero', image_prompt: 9, extra: 'x' }, 'lixo']
    });
    expect(v).toHaveLength(1);
    expect(v![0].headline).toBe('Título com espaço');
    expect(v![0].body.length).toBe(2500);
    expect(v![0].bullets).toEqual(['um', 'três']);
    expect(v![0].image_prompt).toBe('');
    expect((v![0] as any).extra).toBeUndefined();
  });

  it('anúncios: sem variações é inválido; papel desconhecido vira OTHER; no máximo 5', () => {
    expect(validateAdVariants({})).toBeNull();
    const v = validateAdVariants({
      variants: Array.from({ length: 7 }, () => ({ hook: 'Gancho', beats: [{ role: 'XYZ', text: 'oi' }], primary_text: 'p', headline: 'h', description: 'd', cta: 'Saiba mais', claim_ids: ['C1'] }))
    });
    expect(v).toHaveLength(5);
    expect(v![0].beats[0].role).toBe('OTHER');
  });

  it('plano: depoimentos sem prova aprovada viram prévia do conteúdo; urgência e autoria inventadas saem', () => {
    const f: ProductFacts = {
      product: { id: 'p', name: 'Livro', description: 'd', category: 'Receitas', collection_key: null },
      offer: { id: 'o', human_id: 'OFF-1', name: 'Livro', description: 'd', bonus: null, status: 'ATIVA', price: 19.9, cardEnabled: true, cardMax: 4, cardFree: 4 },
      deliveryTitles: ['Livro em PDF'],
      claims: []
    };
    const mk = (role: string, order: number) => ({ order, role, purpose: 'x', headline_style: 'NONE', approx_words: 50, has_image: false, has_video: false, cta_count: 0 });
    const { plan, notes } = buildPagePlan(
      { kind: 'SALES_PAGE', tone: '', length_class: 'MEDIUM', cta_text_style: '', color_mood: '', sections: [mk('HERO_HOOK', 1), mk('TESTIMONIALS', 2), mk('URGENCY', 3), mk('AUTHORITY', 4), mk('BONUS', 5)] as any },
      f
    );
    expect(plan.map(p => p.role)).toEqual(['HERO_HOOK', 'CONTENTS', 'CTA']);
    expect(plan[1].replaced_from).toBe('TESTIMONIALS');
    expect(notes.join(' ')).toContain('depoimentos');
    // anúncio nunca recebe o preço
    expect(factLines(f, true).join(' ')).not.toContain('19,90');
    expect(factLines(f, false).join(' ')).toContain('R$ 19,90');
  });
});

// ---------------------------------------------------------------------------------------------
// IA simulada: responde pelo nome do esquema
// ---------------------------------------------------------------------------------------------

type Behavior = { pageCopies?: 'once' | 'always'; adPrice?: 'always'; adCopies?: 'once' };

function fakeAi(b: Behavior = {}) {
  const calls: string[] = [];
  let sectionCalls = 0;
  let adRetries = 0;
  const fn = async (messages: any[], schema: { name: string }) => {
    calls.push(schema.name);
    const user = JSON.parse(messages[1].content);
    if (schema.name === 'generated_sales_page') {
      return JSON.stringify({
        sections: user.esqueleto.map((it: any, i: number) => ({
          headline: i === 0 && b.pageCopies ? `Nosso livro ${COPIED} hoje` : `Título original ${i + 1}`.replace(/\d+/, 'item'),
          body: 'Receitas italianas explicadas passo a passo para fazer em casa.',
          bullets: i === 1 ? ['Massas frescas', 'Molhos clássicos'] : [],
          cta_label: it.tem_botao ? 'Quero o meu' : '',
          image_prompt: it.tem_imagem ? 'Prato de massa fresca' : ''
        }))
      });
    }
    if (schema.name === 'generated_section') {
      sectionCalls++;
      const copy = b.pageCopies === 'always';
      return JSON.stringify({
        headline: copy ? `De novo ${COPIED} aqui` : 'Abertura escrita do zero',
        body: 'Texto novo e honesto sobre o livro.',
        bullets: [],
        cta_label: user.item.tem_botao ? 'Quero o meu' : '',
        image_prompt: ''
      });
    }
    if (schema.name === 'generated_ads') {
      const n = Number((messages[0].content.match(/Escreva (\d+) variação/) || [])[1] || 1);
      const retry = n === 1;
      if (retry) adRetries++;
      return JSON.stringify({
        variants: Array.from({ length: n }, (_, i) => ({
          hook: b.adCopies === 'once' && !retry && i === 0 ? `Sabia que ${COPIED} existe` : `Gancho original ${['um', 'dois', 'três', 'quatro', 'cinco'][i]}`,
          beats: [{ role: 'HOOK', text: 'Abertura' }, { role: 'CTA', text: 'Conheça' }],
          primary_text: b.adPrice === 'always' ? 'Livro de receitas por apenas R$ 19,90' : 'Receitas italianas para fazer em casa, passo a passo.',
          headline: 'Cozinha italiana em casa',
          description: 'Livro digital de receitas',
          cta: 'Saiba mais',
          claim_ids: ['C1']
        }))
      });
    }
    return null;
  };
  return { fn, calls, stats: () => ({ sectionCalls, adRetries }) };
}

describe.sequential('NORQVA-0116 — rotas, banco, publicação e página pública', () => {
  let pool: Pool;
  let admin: string;
  let creative: string;
  let performance: string;
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const draftOfferId = crypto.randomUUID();
  const refId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const post = (url: string, body: any, token = admin) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);
  const patch = (url: string, body: any, token = admin) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body);
  const get = (url: string, token = admin) => request(app).get(url).set('Authorization', `Bearer ${token}`);
  const generate = (over: any = {}, token = creative) =>
    post(`/api/creative-references/${refId}/generate`, { product_id: productId, offer_id: offerId, ad_count: 3, ...over }, token);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0116', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0116@norqva.test', 'ADMIN');
    creative = await mk('creative.norqva0116@norqva.test', 'CREATIVE');
    performance = await mk('perf.norqva0116@norqva.test', 'PERFORMANCE');
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Livro 0116', 'Receitas', 'Receitas italianas de massas e molhos', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-T116${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo, data_provenance, card_enabled, card_max_installments, card_free_installments)
       VALUES ($1, $2, $3, 'Livro 0116', 19.90, 'Livro digital', 'ATIVA', false, 'COMMERCIAL_PRODUCTION', true, 4, 4)`,
      [offerId, `OFF-T116${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo, data_provenance)
       VALUES ($1, $2, $3, 'Livro 0116 rascunho', 19.90, 'Livro digital', 'RASCUNHO', false, 'COMMERCIAL_PRODUCTION')`,
      [draftOfferId, `OFF-T116D${tag}`, productId]
    );
    await pool.query(`INSERT INTO digital_assets (id, name, storage_bucket, storage_path, is_demo) VALUES ($1, 'Livro 0116 em PDF', 'digital-products', 'x.pdf', false)`, [assetId]);
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerId, assetId]);
    await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo)
       VALUES ($1, $2, 'Receitas com passo a passo', 'FEATURE', 'teste', 'VERIFIED', false)`,
      [`CLM-T116${tag}`, productId]
    );
    const structure = {
      kind: 'SALES_PAGE', tone: 'Acolhedor', length_class: 'MEDIUM', cta_text_style: 'Curto', color_mood: 'Quente',
      sections: [
        { order: 1, role: 'HERO_HOOK', purpose: 'Abertura', headline_style: 'QUESTION', approx_words: 60, has_image: true, has_video: false, cta_count: 1 },
        { order: 2, role: 'CONTENTS', purpose: 'Conteúdo', headline_style: 'STATEMENT', approx_words: 80, has_image: true, has_video: false, cta_count: 0 },
        { order: 3, role: 'TESTIMONIALS', purpose: 'Depoimentos', headline_style: 'NONE', approx_words: 80, has_image: false, has_video: false, cta_count: 0 },
        { order: 4, role: 'OFFER_PRICE', purpose: 'Oferta', headline_style: 'STATEMENT', approx_words: 40, has_image: false, has_video: false, cta_count: 1 }
      ]
    };
    await pool.query(
      `INSERT INTO creative_references (id, human_id, product_id, source_kind, reference_type, status, structure, source_shingles, source_shingle_count, data_provenance)
       VALUES ($1, $2, $3, 'PAGE_URL', 'SALES_PAGE', 'READY', $4::jsonb, $5::text[], $6, 'COMMERCIAL_PRODUCTION')`,
      [refId, `REF-T116${tag}`, productId, JSON.stringify(structure), sourceShingles([SECRET]), sourceShingles([SECRET]).length]
    );
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
  });

  afterAll(async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    if (!pool) return;
    await pool.query('DELETE FROM creative_claims WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creative_reviews WHERE creative_id IN (SELECT id FROM creatives WHERE product_id = $1)', [productId]).catch(() => {});
    await pool.query('DELETE FROM creatives WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM generated_pages WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM creative_references WHERE id = $1', [refId]).catch(() => {});
    await pool.query('DELETE FROM claims_registry WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [assetId]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE product_id = $1', [productId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('trava desligada: gerar responde 404; perfis sem acesso recebem 403', async () => {
    delete process.env.CREATIVE_REFERENCES_ENABLED;
    expect((await generate()).status).toBe(404);
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
    expect((await generate({}, performance)).status).toBe(403);
    expect((await get('/api/generated-pages', performance)).status).toBe(403);
  });

  it('sem IA configurada: 503 com mensagem clara', async () => {
    const r = await generate();
    expect(r.status).toBe(503);
    expect(r.body.error).toContain('OPENAI_API_KEY');
  });

  it('gera página (rascunho) e 3 anúncios na fábrica; cópia é gerada de novo; depoimento vira prévia', async () => {
    const ai = fakeAi({ pageCopies: 'once' });
    setGenerationAiForTests(ai.fn);
    const r = await generate({ new_images: true });
    expect(r.status).toBe(201);
    const { page, ads, reference, images } = r.body;
    expect(page.human_id).toMatch(/^GEN-\d{6}$/);
    expect(page.status).toBe('DRAFT');
    expect(page.slug).toMatch(/^livro-0116-[0-9a-f]{6}$/);
    expect(reference.human_id).toBe(`REF-T116${tag}`);
    // sem KIE_API_KEY: imagens do produto (este produto não tem) e o aviso
    expect(images.kie).toBe(false);
    expect(images.message).toBe(KIE_MISSING_MESSAGE);
    expect(page.copy_check.images.message).toBe(KIE_MISSING_MESSAGE);
    expect(page.sections.map((s: any) => s.role)).toEqual(['HERO_HOOK', 'CONTENTS', 'CONTENTS', 'OFFER_PRICE']);
    expect(page.sections[2].replaced_from).toBe('TESTIMONIALS');
    // a abertura copiou na 1ª vez e foi gerada de novo
    expect(ai.stats().sectionCalls).toBe(1);
    expect(page.sections[0].headline).toBe('Abertura escrita do zero');
    expect(page.copy_check.blocked_count).toBe(0);
    expect(JSON.stringify(page)).not.toContain('caderno secreto');
    // anúncios: na fábrica, ligados à referência e à página, sem preço, com a promessa aprovada ligada
    expect(ads).toHaveLength(3);
    expect(ads[0].human_id).toBe(`${page.human_id}-A1`);
    expect(ads.every((a: any) => a.approval_status === 'DRAFT' && a.copy_check.blocked === false)).toBe(true);
    expect(ads[0].claims.map((c: any) => c.text)).toEqual(['Receitas com passo a passo']);
    const row = (await pool.query('SELECT reference_id, generated_page_id, generation_source, utm_content_key, script FROM creatives WHERE id = $1', [ads[0].id])).rows[0];
    expect(row).toMatchObject({ reference_id: refId, generated_page_id: page.id, generation_source: 'AI_REFERENCE', utm_content_key: `${page.human_id}-A1` });
    expect(row.script).toContain('Gancho: Abertura');
  });

  it('cópia que continua: o campo é esvaziado e fica bloqueado (aprovar e publicar recusam)', async () => {
    setGenerationAiForTests(fakeAi({ pageCopies: 'always' }).fn);
    const r = await generate();
    expect(r.status).toBe(201);
    const page = r.body.page;
    expect(page.sections[0].headline).toBe('');
    expect(page.sections[0].removed_fields).toContain('headline');
    expect(page.copy_check.fields['1.headline'].ok).toBe(false);
    expect(page.copy_check.blocked_count).toBeGreaterThan(0);
    const row = JSON.stringify((await pool.query('SELECT sections, copy_check FROM generated_pages WHERE id = $1', [page.id])).rows[0]);
    expect(row).not.toContain('caderno secreto');
    const ap = await post(`/api/generated-pages/${page.id}/approve`, {});
    expect(ap.status).toBe(409);
    expect(ap.body.error).toContain('bloqueada');
    // o dono escreve com as palavras dele e libera
    const ed = await patch(`/api/generated-pages/${page.id}/sections/1`, { headline: 'Aprenda massas italianas em casa' }, creative);
    expect(ed.status).toBe(200);
    expect(ed.body.page.copy_check.fields['1.headline'].ok).toBe(true);
    expect(ed.body.page.sections[0].removed_fields).toEqual([]);
  });

  it('edição manual com cópia, número inventado ou promessa de saúde é recusada', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    const copy = await patch(`/api/generated-pages/${page.id}/sections/2`, { body: `Veja: ${COPIED}.` }, creative);
    expect(copy.status).toBe(422);
    expect(copy.body.issues.map((i: any) => i.code)).toContain('COPY');
    const digit = await patch(`/api/generated-pages/${page.id}/sections/2`, { body: 'Já são 3000 leitoras.' }, creative);
    expect(digit.status).toBe(422);
    expect(digit.body.issues.map((i: any) => i.code)).toEqual(['DIGIT']);
    const health = await patch(`/api/generated-pages/${page.id}/sections/2`, { bullets: ['Resultado garantido'] }, creative);
    expect(health.status).toBe(422);
    expect(health.body.issues.map((i: any) => i.code)).toContain('HEALTH');
    // preço da oferta na página é permitido
    const ok = await patch(`/api/generated-pages/${page.id}/sections/4`, { body: 'Tudo por R$ 19,90 ou em até 4x sem juros.' }, creative);
    expect(ok.status).toBe(200);
  });

  it('anúncio com preço: gerado de novo, continua com preço = bloqueado; a fábrica não aprova', async () => {
    const ai = fakeAi({ adPrice: 'always' });
    setGenerationAiForTests(ai.fn);
    const r = await generate();
    expect(r.status).toBe(201);
    const ad = r.body.ads[0];
    expect(ai.stats().adRetries).toBeGreaterThanOrEqual(2);
    expect(ad.copy_check.blocked).toBe(true);
    expect(ad.copy_check.fields.primary_text.issues.map((i: any) => i.code)).toContain('PRICE');
    const rv = await post(`/api/creative-factory/creatives/${ad.id}/review`, { decision: 'APPROVED' });
    expect(rv.status).toBe(409);
    expect(rv.body.error).toMatch(/bloquead/i);
    // edição do anúncio com preço é recusada; sem preço passa e vira aprovável
    const bad = await patch(`/api/generated-pages/${r.body.page.id}/ads/${ad.id}`, { primary_text: 'Só hoje por 19,90' }, creative);
    expect(bad.status).toBe(422);
    // já revisado (pedido de ajuste): a correção vira versão nova pela fábrica, ainda ligada à página
    expect((await post(`/api/creative-factory/creatives/${ad.id}/review`, { decision: 'REVISION_REQUESTED', notes: 'Tirar o preço' })).status).toBe(200);
    const good = await patch(`/api/generated-pages/${r.body.page.id}/ads/${ad.id}`, { primary_text: 'Receitas italianas explicadas para fazer em casa.' }, creative);
    expect(good.status).toBe(200);
    const fixed = good.body.ads.find((a: any) => a.root_creative_id === ad.id);
    expect(fixed.human_id).toBe(`${ad.human_id}-V2`);
    expect(fixed.copy_check.blocked).toBe(false);
    expect(good.body.ads.some((a: any) => a.id === ad.id)).toBe(false); // a versão antiga saiu da lista
    const ok = await post(`/api/creative-factory/creatives/${fixed.id}/review`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);
    expect(ok.body.approval_status).toBe('APPROVED');
  });

  it('anúncio que copiou é gerado de novo', async () => {
    const ai = fakeAi({ adCopies: 'once' });
    setGenerationAiForTests(ai.fn);
    const r = await generate();
    expect(r.status).toBe(201);
    expect(ai.stats().adRetries).toBe(1);
    expect(r.body.ads[0].hook).not.toContain('caderno');
    expect(r.body.ads[0].copy_check.blocked).toBe(false);
  });

  it('aprovar e publicar só ADMIN; publicar exige aprovação e oferta à venda; tirar do ar', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await post(`/api/generated-pages/${page.id}/approve`, {}, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {}, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).status).toBe(409); // ainda não aprovada
    const ap = await post(`/api/generated-pages/${page.id}/approve`, {});
    expect(ap.status).toBe(200);
    expect(ap.body.page.status).toBe('APPROVED');
    const pub = await post(`/api/generated-pages/${page.id}/publish`, {});
    expect(pub.status).toBe(200);
    expect(pub.body.page.status).toBe('PUBLISHED');
    // no ar: editar e gerar de novo são recusados
    expect((await patch(`/api/generated-pages/${page.id}/sections/1`, { headline: 'Outro título' }, creative)).status).toBe(409);
    expect((await post(`/api/generated-pages/${page.id}/unpublish`, {}, creative)).status).toBe(403);
    const un = await post(`/api/generated-pages/${page.id}/unpublish`, {});
    expect(un.status).toBe(200);
    expect(un.body.page.status).toBe('UNPUBLISHED');
    expect((await request(app).get(`/api/public/generated-pages/${page.slug}`)).status).toBe(404);
    // volta ao ar sem nova aprovação (nada mudou)
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).status).toBe(200);
  });

  it('oferta em rascunho: aprova, mas não publica', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate({ offer_id: draftOfferId })).body.page;
    expect((await post(`/api/generated-pages/${page.id}/approve`, {})).status).toBe(200);
    const pub = await post(`/api/generated-pages/${page.id}/publish`, {});
    expect(pub.status).toBe(409);
    expect(pub.body.error).toContain('não está à venda');
  });

  it('página pública: rascunho não aparece; publicada mostra só campos seguros', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    const draft = await request(app).get(`/api/public/generated-pages/${page.slug}`);
    expect(draft.status).toBe(404);
    expect(JSON.stringify(draft.body)).not.toContain('Título');
    await post(`/api/generated-pages/${page.id}/approve`, {});
    await post(`/api/generated-pages/${page.id}/publish`, {});
    const pub = await request(app).get(`/api/public/generated-pages/${page.slug}`);
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body).sort()).toEqual(['meta_pixel_id', 'offer', 'sections', 'slug', 'theme', 'title']);
    expect(pub.body.offer).toEqual({ human_id: `OFF-T116${tag}` });
    expect(pub.body.theme).toBe('light');
    expect(Object.keys(pub.body.sections[0]).sort()).toEqual(['body', 'bullets', 'cta_label', 'headline', 'image_url', 'order', 'role']);
    const text = JSON.stringify(pub.body);
    for (const internal of ['copy_check', 'reference', 'image_prompt', 'removed_fields', 'created_by', 'human_id":"GEN', refId, page.id]) {
      expect(text).not.toContain(internal);
    }
    expect((await request(app).get('/api/public/generated-pages/nao-existe-123')).status).toBe(404);
    expect((await request(app).get('/api/public/generated-pages/..%2F..')).status).toBe(404);
  });

  it('lixeira: só ADMIN; página no ar não vai para a lixeira', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await request(app).delete(`/api/generated-pages/${page.id}`).set('Authorization', `Bearer ${creative}`)).status).toBe(403);
    expect((await request(app).delete(`/api/generated-pages/${page.id}`).set('Authorization', `Bearer ${admin}`)).status).toBe(200);
    const list = await get(`/api/generated-pages?reference_id=${refId}`);
    expect(list.body.trash.some((p: any) => p.id === page.id)).toBe(true);
    expect((await post(`/api/generated-pages/${page.id}/restore`, {})).status).toBe(200);
  });

  describe('imagens novas (KIE simulada)', () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const res = (body: any, ok = true, status = 200) => ({
      ok, status, headers: { get: () => null }, json: async () => body, arrayBuffer: async () => (Buffer.isBuffer(body) ? body.buffer.slice(body.byteOffset, body.byteOffset + body.length) : new ArrayBuffer(0))
    });
    const kie = (mode: 'success' | 'fail') => {
      const urls: string[] = [];
      const f: FetchLike = async (url, init) => {
        urls.push(url);
        if (url.endsWith('/createTask')) {
          const body = JSON.parse(init?.body || '{}');
          expect(body.model).toBe('google/nano-banana');
          expect(init?.headers?.Authorization).toBe('Bearer kie-teste');
          return res({ code: 200, data: { taskId: 'T1' } });
        }
        if (url.includes('/recordInfo')) {
          return mode === 'success'
            ? res({ data: { state: 'success', resultJson: JSON.stringify({ resultUrls: ['https://kie.example/img.png'] }) } })
            : res({ data: { state: 'fail', failMsg: 'sem créditos' } });
        }
        return res(PNG);
      };
      return { f, urls };
    };

    const genWithImages = async () => {
      setGenerationAiForTests(fakeAi().fn);
      const svc = new GenerationService(pool);
      const out = await svc.generate({ referenceId: refId, productId, offerId, adCount: 3, newImages: true }, null);
      return { svc, id: out.id, pending: out.imagesPending };
    };

    it('sucesso: imagem gerada, guardada no armazenamento e mostrada por link assinado', async () => {
      const k = kie('success');
      setKieForTests({ fetch: k.f, key: 'kie-teste' });
      const uploads: string[] = [];
      setImageStorageForTests({
        upload: async (bucket, path, data, mime) => {
          expect(mime).toBe('image/png');
          expect(data.length).toBe(PNG.length);
          uploads.push(`${bucket}/${path}`);
        },
        signedUrl: async (bucket, path) => `https://storage.test/${bucket}/${path}?token=x`
      });
      const { svc, id, pending } = await genWithImages();
      expect(pending).toBe(true);
      const before = await svc.get(id);
      expect(before.page.sections.filter((s: any) => s.image_status === 'PENDING')).toHaveLength(2);
      expect((await post(`/api/generated-pages/${id}/approve`, {})).status).toBe(409); // espera as imagens
      await svc.runImageJob(id);
      expect(uploads).toHaveLength(2);
      expect(uploads[0]).toMatch(new RegExp(`^creative-images/generated/${id}/1-\\d+\\.png$`));
      expect(k.urls.some(u => u === 'https://kie.example/img.png')).toBe(true);
      const after = await svc.get(id);
      const s1 = after.page.sections[0];
      expect(s1.image_status).toBe('READY');
      expect(s1.image_url).toMatch(/^storage:creative-images\//);
      expect(s1.image_preview_url).toMatch(/^https:\/\/storage\.test\/creative-images\//);
    });

    it('falha na KIE: fica a imagem do produto (ou nenhuma) e o motivo aparece', async () => {
      setKieForTests({ fetch: kie('fail').f, key: 'kie-teste' });
      setImageStorageForTests({ upload: async () => { throw new Error('não devia enviar'); }, signedUrl: async () => 'x' });
      const { svc, id } = await genWithImages();
      await svc.runImageJob(id);
      const after = await svc.get(id);
      expect(after.page.sections[0].image_status).toBe('FAILED');
      expect(after.page.sections[0].image_error).toContain('sem créditos');
      expect((await post(`/api/generated-pages/${id}/approve`, {})).status).toBe(200);
    });

    it('sem chave: nada é pedido à KIE e o aviso aparece', async () => {
      const k = kie('success');
      setKieForTests({ fetch: k.f, key: null });
      const { svc, id, pending } = await genWithImages();
      expect(pending).toBe(false);
      const after = await svc.get(id);
      expect(after.images.message).toBe(KIE_MISSING_MESSAGE);
      expect(after.page.sections.every((s: any) => s.image_status !== 'PENDING')).toBe(true);
      expect(k.urls).toHaveLength(0);
    });

    it('livro da coleção sem KIE usa as imagens que já estão no site', () => {
      expect(productImages({ collection_key: 'paes' })[0]).toBe('/images/livros/paes/capa.jpg');
      expect(productImages({ name: 'Dolci della Nonna' })[0]).toBe('/images/kit/capa_dolci.jpg');
      expect(productImages({ name: 'Bolso Blindado' })).toEqual([]);
    });
  });
});
