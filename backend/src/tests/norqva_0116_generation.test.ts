// NORQVA-0116: geração (página original + anúncios na fábrica) a partir de uma referência.
// IA, KIE e armazenamento sempre simulados: nada sai para a internet.
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
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
  numbersOf,
  validateGeneratedPage,
  validateAdVariants,
  setGenerationAiForTests,
  buildPagePlan,
  GenerationService,
  ProductFacts,
  factLines,
  livePriceBlock,
  claimsUsedIn,
  resetGenerationRateLimitsForTests,
  RATE_LIMITS
} from '../services/creative/generationService';
import { setKieForTests, setImageStorageForTests, FetchLike, KIE_MISSING_MESSAGE, productImages, ImageStorage } from '../services/creative/generatedImages';

// texto da "referência": só as impressões dele vão para o banco (como na etapa 1)
const SECRET = 'Minha avó Lucia guardava este caderno secreto de massas frescas na cozinha de Bolonha e agora ele chegou até você.';
const COPIED = 'guardava este caderno secreto de massas frescas';

const baseCtx = (over: Partial<CheckContext> = {}): CheckContext => ({
  shingles: new Set(sourceShingles([SECRET])),
  allowedNumbers: numbersOf(['Livro com 28 receitas em 10 PDFs']),
  approvedClaims: [],
  ownNames: ['Desafio Seca Barriga 21 Dias'],
  ...over
});
const codes = (t: string, ctx = baseCtx()) => checkText(t, ctx).map(i => i.code);

afterEach(() => {
  setGenerationAiForTests(null);
  setKieForTests(null);
  setImageStorageForTests(null);
});

describe('NORQVA-0116 — checagem de cada texto', () => {
  it('anticópia: pega uma janela de 6 palavras da referência com o hash da etapa 1', () => {
    const text = `Nosso livro ${COPIED} para você`;
    expect(shingleHashes(text).some(h => sourceShingles([SECRET]).includes(h))).toBe(true);
    expect(codes(text)).toContain('COPY');
    expect(codes('Nosso caderno secreto de massas frescas chegou')).not.toContain('COPY'); // 5 palavras não bastam
    expect(codes('GUARDAVA, este caderno: secreto — de massas FRESCAS!')).toContain('COPY');
  });

  it('preço e parcelas são barrados em qualquer texto (o preço da página vem da oferta)', () => {
    expect(codes('Por R$ 19,90 hoje')).toContain('PRICE');
    expect(codes('Em até 4x sem juros')).toContain('PRICE');
    expect(codes('Veja o preço logo abaixo')).toContain('PRICE');
  });

  it('números: só os que são fatos do produto, inteiros e com unidade; números por extenso também contam', () => {
    expect(checkText('São 28 receitas em 10 PDFs.', baseCtx())).toEqual([]);
    expect(codes('Mais de 3000 alunas.')).toEqual(['DIGIT']);
    expect(codes('Faça em 2x menos tempo')).toEqual(['DIGIT']); // "2x" não é fato
    expect(codes('São 28,5 receitas')).toEqual(['DIGIT']); // número inteiro diferente do fato
    expect(codes('Milhares de leitoras aprovaram')).toEqual(['DIGIT']);
    expect(codes('Dois livros em um')).toEqual(['DIGIT']);
    expect(codes('Um livro para uma família')).toEqual([]); // "um/uma" são artigos
    expect(checkText('Dois livros', baseCtx({ allowedNumbers: numbersOf(['Kit com dois livros']) }))).toEqual([]);
  });

  it('promessas de saúde/emagrecimento barradas; nome do produto não conta; promessa aprovada só se vier inteira', () => {
    for (const t of [
      'Perca 5 kg em pouco tempo', 'Emagreça rápido', 'Elimine a gordura localizada', 'Queime gordura dormindo', 'Seque a barriga',
      'Barriga chapada no verão', 'Resultados em 7 dias', 'Perder medidas', 'Sem dieta', 'Sem exercícios', 'Sem esforço nenhum',
      'Resultado garantido', 'Garantia de resultado', 'A cura que você procurava', 'Trata a inflamação', 'Um detox completo'
    ]) {
      expect(codes(t, baseCtx({ allowedNumbers: numbersOf(['5 kg 7']) })), t).toContain('HEALTH');
    }
    expect(codes('Queijo curado com garantia de 7 dias', baseCtx({ allowedNumbers: numbersOf(['7 dias']) }))).toEqual([]);
    expect(codes('Trata-se de um guia de receitas')).toEqual([]);
    expect(codes('Conheça o Desafio Seca Barriga 21 Dias', baseCtx({ allowedNumbers: numbersOf(['21']) }))).toEqual([]);
    const claim = 'Quem segue o cardápio pode perder medidas com acompanhamento';
    const approved = baseCtx({ approvedClaims: [claim] });
    expect(codes(`Sabia? ${claim}.`, approved)).not.toContain('HEALTH');
    expect(codes('Você vai perder medidas', approved)).toContain('HEALTH'); // pedaço da promessa não vale
  });
});

describe('NORQVA-0116 — esquema da IA, plano e preço', () => {
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
      variants: Array.from({ length: 7 }, () => ({ hook: 'Gancho', beats: [{ role: 'XYZ', text: 'oi' }], primary_text: 'p', headline: 'h', description: 'd', cta: 'Saiba mais' }))
    });
    expect(v).toHaveLength(5);
    expect(v![0].beats[0].role).toBe('OTHER');
  });

  const facts = (claims: ProductFacts['claims'] = []): ProductFacts => ({
    product: { id: 'p', name: 'Livro', description: 'd', category: 'Receitas', collection_key: null },
    offer: { id: 'o', human_id: 'OFF-1', name: 'Livro', description: 'd', bonus: null, status: 'ATIVA' },
    deliveryTitles: ['Livro em PDF'],
    claims
  });
  const mk = (role: string, order: number, cta = 0) => ({ order, role, purpose: 'x', headline_style: 'NONE', approx_words: 50, has_image: false, has_video: false, cta_count: cta });
  const sp = (sections: any[]) => ({ kind: 'SALES_PAGE', tone: '', length_class: 'MEDIUM', cta_text_style: '', color_mood: '', sections } as any);

  it('plano: sem prova aprovada, depoimento vira prévia; urgência e autoria saem; sempre há seção de preço e botão', () => {
    const { plan, notes } = buildPagePlan(sp([mk('HERO_HOOK', 1), mk('TESTIMONIALS', 2), mk('URGENCY', 3), mk('AUTHORITY', 4), mk('BONUS', 5)]), facts());
    expect(plan.map(p => p.role)).toEqual(['HERO_HOOK', 'CONTENTS', 'OFFER_PRICE']);
    expect(plan[1].replaced_from).toBe('TESTIMONIALS');
    expect(plan[2].cta).toBe(true);
    expect(notes.join(' ')).toContain('depoimentos');
  });

  it('plano: com depoimento aprovado, a seção usa o texto da promessa (fixo, sem IA)', () => {
    const { plan } = buildPagePlan(sp([mk('HERO_HOOK', 1, 1), mk('TESTIMONIALS', 2), mk('OFFER_PRICE', 3, 1)]), facts([{ id: 'c', human_id: 'C', text: 'Aprovado pela Ana', type: 'TESTIMONIAL' }]));
    expect(plan[1].fixed).toEqual({ headline: 'O que dizem de nós', bullets: ['Aprovado pela Ana'] });
  });

  it('a IA nunca recebe preço, parcelas nem o prazo legal', () => {
    const t = factLines(facts()).join(' ');
    expect(t).not.toMatch(/R\$|\d+x|parcel|7 dias/i);
  });

  it('preço da página: mesma conta do pagamento, com parcela mínima de R$ 5,00', () => {
    const offer = { price: '19.90', promotional_price: null, card_enabled: true, card_max_installments: 4, card_free_installments: 4, card_interest_monthly: 0, card_total_price: null };
    expect(livePriceBlock(offer)).toEqual({ price_text: 'R$ 19,90', installments_text: 'ou 3x de R$ 6,63 sem juros no cartão', value: 19.9 });
    expect(livePriceBlock({ ...offer, price: '29.90' }).installments_text).toBe('ou 4x de R$ 7,47 sem juros no cartão');
    expect(livePriceBlock({ ...offer, card_enabled: false }).installments_text).toBeNull();
  });

  it('promessa só é ligada ao anúncio quando o texto dela aparece inteiro', () => {
    const c = [{ id: '1', human_id: 'A', text: 'Receitas com passo a passo', type: 'FEATURE' }];
    expect(claimsUsedIn({ primary_text: 'São receitas com passo a passo!' }, c)).toHaveLength(1);
    expect(claimsUsedIn({ primary_text: 'Receitas fáceis' }, c)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// IA simulada: responde pelo nome do esquema
// ---------------------------------------------------------------------------------------------

type Behavior = { pageCopies?: 'once' | 'always'; adPrice?: 'always'; adCopies?: 'once'; testimonial?: string };

function fakeAi(b: Behavior = {}) {
  let sectionCalls = 0;
  let adRetries = 0;
  const fn = async (messages: any[], schema: { name: string }) => {
    const user = JSON.parse(messages[1].content);
    if (schema.name === 'generated_sales_page') {
      return JSON.stringify({
        sections: user.esqueleto.map((it: any, i: number) => ({
          headline: i === 0 && b.pageCopies ? `Nosso livro ${COPIED} hoje` : `Título original da parte ${['um', 'b', 'c', 'd', 'e', 'f'][i] || 'x'}`.replace(' um', ' primeira'),
          body: b.testimonial || 'Receitas italianas explicadas passo a passo para fazer em casa.',
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
          hook: b.adCopies === 'once' && !retry && i === 0 ? `Sabia que ${COPIED} existe` : `Gancho original ${['um', 'outro', 'terceiro', 'quarto', 'quinto'][i]}`,
          beats: [{ role: 'HOOK', text: 'Abertura' }, { role: 'CTA', text: 'Conheça' }],
          primary_text: b.adPrice === 'always' ? 'Livro de receitas por apenas R$ 19,90' : 'Receitas com passo a passo para fazer em casa.',
          headline: 'Cozinha italiana em casa',
          description: 'Livro digital de receitas',
          cta: 'Saiba mais'
        }))
      });
    }
    return null;
  };
  return { fn, stats: () => ({ sectionCalls, adRetries }) };
}

const okStorage = (over: Partial<ImageStorage> = {}): ImageStorage => ({
  upload: async () => {},
  signedUrl: async (bucket, path) => `https://storage.test/${bucket}/${path}?token=x`,
  bucketExists: async () => true,
  ...over
});

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
  const publishNew = async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await post(`/api/generated-pages/${page.id}/approve`, {})).status).toBe(200);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).status).toBe(200);
    return page;
  };

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
        { order: 4, role: 'OFFER_PRICE', purpose: 'Oferta', headline_style: 'STATEMENT', approx_words: 40, has_image: false, has_video: false, cta_count: 1 },
        { order: 5, role: 'GUARANTEE', purpose: 'Garantia', headline_style: 'STATEMENT', approx_words: 40, has_image: false, has_video: false, cta_count: 0 }
      ]
    };
    await pool.query(
      `INSERT INTO creative_references (id, human_id, product_id, source_kind, reference_type, status, structure, source_shingles, source_shingle_count, data_provenance)
       VALUES ($1, $2, $3, 'PAGE_URL', 'SALES_PAGE', 'READY', $4::jsonb, $5::text[], $6, 'COMMERCIAL_PRODUCTION')`,
      [refId, `REF-T116${tag}`, productId, JSON.stringify(structure), sourceShingles([SECRET]), sourceShingles([SECRET]).length]
    );
    process.env.CREATIVE_REFERENCES_ENABLED = 'true';
  });

  beforeEach(() => resetGenerationRateLimitsForTests());

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

  it('gera página (rascunho) e 3 anúncios na fábrica; cópia gerada de novo; depoimento vira prévia; preço e garantia fixos', async () => {
    const ai = fakeAi({ pageCopies: 'once' });
    setGenerationAiForTests(ai.fn);
    const r = await generate({ new_images: true });
    expect(r.status).toBe(201);
    const { page, ads, reference, images } = r.body;
    expect(page.human_id).toMatch(/^GEN-\d{6}$/);
    expect(page.status).toBe('DRAFT');
    expect(page.slug).toMatch(/^livro-0116-[0-9a-f]{6}$/);
    expect(reference.human_id).toBe(`REF-T116${tag}`);
    expect(images.message).toBe(KIE_MISSING_MESSAGE);
    expect(page.copy_check.images.message).toBe(KIE_MISSING_MESSAGE);
    expect(page.sections.map((s: any) => s.role)).toEqual(['HERO_HOOK', 'CONTENTS', 'CONTENTS', 'OFFER_PRICE', 'GUARANTEE']);
    expect(page.sections[2].replaced_from).toBe('TESTIMONIALS');
    expect(ai.stats().sectionCalls).toBe(1);
    expect(page.sections[0].headline).toBe('Abertura escrita do zero');
    expect(page.copy_check.blocked_count).toBe(0);
    // preço e parcelas vêm da oferta (parcela mínima de R$ 5,00: 3x, não 4x)
    expect(page.sections[3].price).toEqual({ price_text: 'R$ 19,90', installments_text: 'ou 3x de R$ 6,63 sem juros no cartão' });
    expect(page.sections[4].fixed_note).toContain('7 dias');
    expect(JSON.stringify(page)).not.toContain('caderno secreto');
    expect(ads).toHaveLength(3);
    expect(ads[0].human_id).toBe(`${page.human_id}-A1`);
    expect(ads.every((a: any) => a.approval_status === 'DRAFT' && a.copy_check.blocked === false)).toBe(true);
    expect(ads[0].claims.map((c: any) => c.text)).toEqual(['Receitas com passo a passo']);
    const row = (await pool.query('SELECT reference_id, generated_page_id, generation_source, utm_content_key, script FROM creatives WHERE id = $1', [ads[0].id])).rows[0];
    expect(row).toMatchObject({ reference_id: refId, generated_page_id: page.id, generation_source: 'AI_REFERENCE', utm_content_key: `${page.human_id}-A1` });
    expect(row.script).toContain('Gancho: Abertura');
  });

  it('cópia que continua: o campo é esvaziado e fica bloqueado; o dono reescreve e libera', async () => {
    setGenerationAiForTests(fakeAi({ pageCopies: 'always' }).fn);
    const page = (await generate()).body.page;
    expect(page.sections[0].headline).toBe('');
    expect(page.sections[0].removed_fields).toContain('headline');
    expect(page.copy_check.fields['1.headline'].ok).toBe(false);
    const row = JSON.stringify((await pool.query('SELECT sections, copy_check FROM generated_pages WHERE id = $1', [page.id])).rows[0]);
    expect(row).not.toContain('caderno secreto');
    const ap = await post(`/api/generated-pages/${page.id}/approve`, {});
    expect(ap.status).toBe(409);
    expect(ap.body.error).toContain('bloqueada');
    const ed = await patch(`/api/generated-pages/${page.id}/sections/1`, { headline: 'Aprenda massas italianas em casa' }, creative);
    expect(ed.status).toBe(200);
    expect(ed.body.page.copy_check.fields['1.headline'].ok).toBe(true);
  });

  it('edição manual com cópia, número inventado, número por extenso, preço ou promessa é recusada', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    const try2 = (body: any) => patch(`/api/generated-pages/${page.id}/sections/2`, body, creative);
    expect((await try2({ body: `Veja: ${COPIED}.` })).body.issues.map((i: any) => i.code)).toContain('COPY');
    expect((await try2({ body: 'Já são 3000 leitoras.' })).body.issues.map((i: any) => i.code)).toEqual(['DIGIT']);
    expect((await try2({ body: 'Milhares de leitoras.' })).body.issues.map((i: any) => i.code)).toEqual(['DIGIT']);
    expect((await try2({ body: 'Tudo por R$ 19,90.' })).body.issues.map((i: any) => i.code)).toContain('PRICE');
    const health = await try2({ bullets: ['Resultado garantido'] });
    expect(health.status).toBe(422);
    expect(health.body.issues.map((i: any) => i.code)).toContain('HEALTH');
    // seção de texto fixo não é editada aqui
    expect((await try2({ body: 'ok' })).status).toBe(200);
  });

  it('gerar de novo uma seção: troca o texto, volta para rascunho; seção no ar recusa', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await post(`/api/generated-pages/${page.id}/approve`, {})).status).toBe(200);
    const rg = await post(`/api/generated-pages/${page.id}/sections/2/regenerate`, {}, creative);
    expect(rg.status).toBe(200);
    expect(rg.body.page.sections[1].headline).toBe('Abertura escrita do zero');
    expect(rg.body.page.status).toBe('DRAFT');
    expect((await post(`/api/generated-pages/${page.id}/approve`, {})).status).toBe(200);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).status).toBe(200);
    expect((await post(`/api/generated-pages/${page.id}/sections/2/regenerate`, {}, creative)).status).toBe(409);
    expect((await patch(`/api/generated-pages/${page.id}/sections/2`, { headline: 'Outro' }, creative)).status).toBe(409);
  });

  it('anúncio com preço: bloqueado; a fábrica não aprova; corrigido em versão nova, aprova', async () => {
    const ai = fakeAi({ adPrice: 'always' });
    setGenerationAiForTests(ai.fn);
    const r = await generate();
    const ad = r.body.ads[0];
    expect(ai.stats().adRetries).toBeGreaterThanOrEqual(2);
    expect(ad.copy_check.blocked).toBe(true);
    expect(ad.copy_check.fields.primary_text.issues.map((i: any) => i.code)).toContain('PRICE');
    const rv = await post(`/api/creative-factory/creatives/${ad.id}/review`, { decision: 'APPROVED' });
    expect(rv.status).toBe(409);
    expect(rv.body.error).toMatch(/bloquead/i);
    expect((await patch(`/api/generated-pages/${r.body.page.id}/ads/${ad.id}`, { primary_text: 'Só hoje por 19,90' }, creative)).status).toBe(422);
    expect((await post(`/api/creative-factory/creatives/${ad.id}/review`, { decision: 'REVISION_REQUESTED', notes: 'Tirar o preço' })).status).toBe(200);
    const good = await patch(`/api/generated-pages/${r.body.page.id}/ads/${ad.id}`, { primary_text: 'Receitas com passo a passo, explicadas para fazer em casa.' }, creative);
    expect(good.status).toBe(200);
    const fixed = good.body.ads.find((a: any) => a.root_creative_id === ad.id);
    expect(fixed.human_id).toBe(`${ad.human_id}-V2`);
    expect(fixed.copy_check.blocked).toBe(false);
    expect(good.body.ads.some((a: any) => a.id === ad.id)).toBe(false);
    const ok = await post(`/api/creative-factory/creatives/${fixed.id}/review`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);
  });

  it('fábrica: edição no lugar (rascunho) e versão nova levam a ligação; a aprovação confere o texto de novo', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const r = await generate();
    const [a1, a2] = r.body.ads;
    // (a) rascunho nunca revisado: edição no lugar pela fábrica com texto copiado da referência
    const ed = await post(`/api/creative-factory/creatives/${a1.id}/revise`, { primary_text: `Receitas com passo a passo: ${COPIED}.` }, creative);
    expect(ed.status).toBe(200);
    expect(ed.body.mode).toBe('EDITED_IN_PLACE');
    const row1 = (await pool.query('SELECT reference_id, generated_page_id, copy_check FROM creatives WHERE id = $1', [a1.id])).rows[0];
    expect(row1.generated_page_id).toBe(r.body.page.id);
    expect(row1.copy_check).toEqual({ stale: true });
    const bad1 = await post(`/api/creative-factory/creatives/${a1.id}/review`, { decision: 'APPROVED' });
    expect(bad1.status).toBe(409);
    expect(bad1.body.error).toContain('Parecido com a referência');
    // (b) já revisado: versão nova pela fábrica com preço; a ligação vai junto e a aprovação barra
    expect((await post(`/api/creative-factory/creatives/${a2.id}/review`, { decision: 'REVISION_REQUESTED', notes: 'ajuste' })).status).toBe(200);
    const nv = await post(`/api/creative-factory/creatives/${a2.id}/revise`, { primary_text: 'Receitas com passo a passo por apenas R$ 9,90' }, creative);
    expect(nv.status).toBe(200);
    expect(nv.body.mode).toBe('NEW_VERSION');
    const v2 = nv.body.creative.id;
    const row2 = (await pool.query('SELECT reference_id, generated_page_id, copy_check FROM creatives WHERE id = $1', [v2])).rows[0];
    expect(row2).toMatchObject({ reference_id: refId, generated_page_id: r.body.page.id });
    const bad2 = await post(`/api/creative-factory/creatives/${v2}/review`, { decision: 'APPROVED' });
    expect(bad2.status).toBe(409);
    // texto limpo: a mesma aprovação passa (a checagem roda de novo e grava o resultado)
    const clean = await post(`/api/creative-factory/creatives/${v2}/revise`, { primary_text: 'Receitas com passo a passo para fazer em casa, sem pressa.' }, creative);
    expect(clean.status).toBe(200);
    const ok = await post(`/api/creative-factory/creatives/${v2}/review`, { decision: 'APPROVED' });
    expect(ok.status).toBe(200);
    const after = (await pool.query('SELECT copy_check FROM creatives WHERE id = $1', [v2])).rows[0].copy_check;
    expect(after.blocked).toBe(false);
  });

  it('anúncio que copiou é gerado de novo', async () => {
    const ai = fakeAi({ adCopies: 'once' });
    setGenerationAiForTests(ai.fn);
    const r = await generate();
    expect(ai.stats().adRetries).toBe(1);
    expect(r.body.ads[0].hook).not.toContain('caderno');
    expect(r.body.ads[0].copy_check.blocked).toBe(false);
  });

  it('aprovar e publicar só ADMIN; publicar exige aprovação e oferta à venda; tirar do ar', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await post(`/api/generated-pages/${page.id}/approve`, {}, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {}, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).status).toBe(409);
    expect((await post(`/api/generated-pages/${page.id}/approve`, {})).body.page.status).toBe('APPROVED');
    expect((await post(`/api/generated-pages/${page.id}/publish`, {})).body.page.status).toBe('PUBLISHED');
    expect((await patch(`/api/generated-pages/${page.id}/sections/1`, { headline: 'Outro título' }, creative)).status).toBe(409);
    expect((await post(`/api/generated-pages/${page.id}/unpublish`, {}, creative)).status).toBe(403);
    expect((await post(`/api/generated-pages/${page.id}/unpublish`, {})).body.page.status).toBe('UNPUBLISHED');
    expect((await request(app).get(`/api/public/generated-pages/${page.slug}`)).status).toBe(404);
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
    expect((await request(app).get(`/api/public/generated-pages/${page.slug}`)).status).toBe(404);
    await post(`/api/generated-pages/${page.id}/approve`, {});
    await post(`/api/generated-pages/${page.id}/publish`, {});
    const pub = await request(app).get(`/api/public/generated-pages/${page.slug}`);
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body).sort()).toEqual(['delivery_pdf', 'gallery', 'meta_pixel_id', 'offer', 'sections', 'slug', 'theme', 'title']);
    expect(pub.body.offer).toEqual({ human_id: `OFF-T116${tag}`, value: 19.9 });
    // NORQVA-0129: a oferta tem o PDF ligado (x.pdf): só o sim/não sai, nunca o arquivo
    expect(pub.body.delivery_pdf).toBe(true);
    expect(JSON.stringify(pub.body)).not.toContain('x.pdf');
    expect(Object.keys(pub.body.sections[0]).sort()).toEqual(['body', 'bullets', 'cta_label', 'headline', 'image_url', 'note', 'order', 'price', 'role']);
    const text = JSON.stringify(pub.body);
    for (const internal of ['copy_check', 'reference', 'image_prompt', 'removed_fields', 'created_by', 'human_id":"GEN', refId, page.id]) {
      expect(text).not.toContain(internal);
    }
    expect((await request(app).get('/api/public/generated-pages/nao-existe-123')).status).toBe(404);
    expect((await request(app).get('/api/public/generated-pages/..%2F..')).status).toBe(404);
  });

  it('preço mudou na oferta depois de publicar: a página mostra o preço novo', async () => {
    const page = await publishNew();
    const before = await request(app).get(`/api/public/generated-pages/${page.slug}`);
    expect(before.body.sections.find((s: any) => s.role === 'OFFER_PRICE').price.price_text).toBe('R$ 19,90');
    await pool.query('UPDATE offers SET price = 29.90 WHERE id = $1', [offerId]);
    try {
      const after = await request(app).get(`/api/public/generated-pages/${page.slug}`);
      expect(after.body.sections.find((s: any) => s.role === 'OFFER_PRICE').price).toEqual({ price_text: 'R$ 29,90', installments_text: 'ou 4x de R$ 7,47 sem juros no cartão' });
      expect(after.body.offer.value).toBe(29.9);
    } finally {
      await pool.query('UPDATE offers SET price = 19.90 WHERE id = $1', [offerId]);
    }
  });

  it('depoimento inventado pela IA é ignorado: só o texto do depoimento aprovado aparece', async () => {
    const claim = await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, source, status, is_demo)
       VALUES ($1, $2, 'Aprovado pela leitora Carla', 'TESTIMONIAL', 'teste', 'VERIFIED', false) RETURNING id`,
      [`CLM-T116T${tag}`, productId]
    );
    try {
      setGenerationAiForTests(fakeAi({ testimonial: 'Maria disse que mudou a vida dela.' }).fn);
      const page = (await generate()).body.page;
      const t = page.sections[2];
      expect(t.role).toBe('TESTIMONIALS');
      expect(t.fixed).toBe(true);
      expect(t.bullets).toEqual(['Aprovado pela leitora Carla']);
      expect(t.body).toBe('');
      expect(JSON.stringify(t)).not.toContain('Maria');
      expect((await patch(`/api/generated-pages/${page.id}/sections/3`, { body: 'Maria adorou' }, creative)).status).toBe(409);
    } finally {
      await pool.query('DELETE FROM claims_registry WHERE id = $1', [claim.rows[0].id]);
    }
  });

  it('lixeira: só ADMIN; página no ar não vai para a lixeira', async () => {
    setGenerationAiForTests(fakeAi().fn);
    const page = (await generate()).body.page;
    expect((await request(app).delete(`/api/generated-pages/${page.id}`).set('Authorization', `Bearer ${creative}`)).status).toBe(403);
    expect((await request(app).delete(`/api/generated-pages/${page.id}`).set('Authorization', `Bearer ${admin}`)).status).toBe(200);
    expect((await get(`/api/generated-pages?reference_id=${refId}`)).body.trash.some((p: any) => p.id === page.id)).toBe(true);
    expect((await post(`/api/generated-pages/${page.id}/restore`, {})).status).toBe(200);
  });

  it(`limite: no máximo ${RATE_LIMITS.generate} gerações por pessoa por hora`, async () => {
    setGenerationAiForTests(fakeAi().fn);
    const svc = new GenerationService(pool);
    const input = { referenceId: refId, productId, offerId, adCount: 3 };
    for (let i = 0; i < RATE_LIMITS.generate; i++) await svc.generate(input, 'limite-teste');
    await expect(svc.generate(input, 'limite-teste')).rejects.toMatchObject({ status: 429 });
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
          expect(JSON.parse(init?.body || '{}').model).toBe('google/nano-banana');
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

    it('sucesso: imagem gerada, guardada e mostrada por link assinado; edição durante a imagem não se perde', async () => {
      const k = kie('success');
      setKieForTests({ fetch: k.f, key: 'kie-teste' });
      const uploads: string[] = [];
      setImageStorageForTests(okStorage({ upload: async (bucket, path, data, mime) => { expect(mime).toBe('image/png'); expect(data.length).toBe(PNG.length); uploads.push(`${bucket}/${path}`); } }));
      const { svc, id, pending } = await genWithImages();
      expect(pending).toBe(true);
      expect((await svc.get(id)).page.sections.filter((s: any) => s.image_status === 'PENDING')).toHaveLength(2);
      expect((await post(`/api/generated-pages/${id}/approve`, {})).status).toBe(409);
      // o dono edita enquanto a imagem é feita
      expect((await patch(`/api/generated-pages/${id}/sections/1`, { headline: 'Título do dono' }, creative)).status).toBe(200);
      await svc.runImageJob(id);
      expect(uploads).toHaveLength(2);
      expect(uploads[0]).toMatch(new RegExp(`^creative-images/generated/${id}/1-\\d+\\.png$`));
      expect(k.urls).toContain('https://kie.example/img.png');
      const after = await svc.get(id);
      expect(after.page.sections[0].headline).toBe('Título do dono');
      expect(after.page.sections[0].image_status).toBe('READY');
      expect(after.page.sections[0].image_url).toMatch(/^storage:creative-images\//);
      expect(after.page.sections[0].image_preview_url).toMatch(/^https:\/\/storage\.test\/creative-images\//);
    });

    it('falha na KIE: fica a imagem do produto (ou nenhuma) e o motivo aparece', async () => {
      setKieForTests({ fetch: kie('fail').f, key: 'kie-teste' });
      setImageStorageForTests(okStorage({ upload: async () => { throw new Error('não devia enviar'); } }));
      const { svc, id } = await genWithImages();
      await svc.runImageJob(id);
      const after = await svc.get(id);
      expect(after.page.sections[0].image_status).toBe('FAILED');
      expect(after.page.sections[0].image_error).toContain('sem créditos');
      expect((await post(`/api/generated-pages/${id}/approve`, {})).status).toBe(200);
    });

    it('bucket não existe: nada é pedido à KIE e o aviso pede para criar o bucket', async () => {
      const k = kie('success');
      setKieForTests({ fetch: k.f, key: 'kie-teste' });
      setImageStorageForTests(okStorage({ bucketExists: async () => false }));
      const { svc, id, pending } = await genWithImages();
      expect(pending).toBe(false);
      expect((await svc.get(id)).page.copy_check.images.message).toContain('Falta criar o bucket creative-images');
      expect(k.urls).toHaveLength(0);
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
