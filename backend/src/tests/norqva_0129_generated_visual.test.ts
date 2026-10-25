// NORQVA-0129: página gerada sem imagens mostra as do produto na hora (sem gravar) e devolve a galeria "Veja por dentro".
// Nada sai para a internet: sem IA, sem KIE, sem armazenamento.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { GenerationService, renderImageFallback, NON_HERO_ROLES } from '../services/creative/generationService';

const BORDADO = ['/images/bordado/capa.jpg', '/images/bordado/riscos.jpg', '/images/bordado/bichinhos.jpg', '/images/bordado/pontos.jpg'];

const sec = (order: number, role: string, over: any = {}) => ({
  order, ref_order: null, role, replaced_from: null, fixed: false, fixed_note: null, headline: `Seção ${order}`, body: 'Texto.', bullets: [], cta_label: '',
  image_url: null, image_status: 'NONE', image_prompt: '', image_started_at: null, image_error: null, removed_fields: [], retries: 0, ...over
});

// esqueleto real da página do Bordado (GEN-000001)
const BORDADO_ROLES = ['HERO_HOOK', 'PAIN', 'MECHANISM', 'BENEFITS', 'PRODUCT_REVEAL', 'OFFER_PRICE', 'GUARANTEE', 'CTA', 'OTHER', 'FAQ'];

describe('NORQVA-0129 — imagens na hora de mostrar', () => {
  it('abertura recebe a capa; as outras vão para conteúdo/benefícios/apresentação, nunca preço, garantia, dúvidas ou botão final', () => {
    const out = renderImageFallback(BORDADO_ROLES.map(role => ({ role, image_url: null })), BORDADO);
    expect(out[0]).toBe('/images/bordado/capa.jpg');
    const byRole = Object.fromEntries(BORDADO_ROLES.map((r, i) => [r, out[i]]));
    // ordem da página: BENEFITS (4ª) e PRODUCT_REVEAL (5ª) entram antes de MECHANISM (3ª), mas aparecem na ordem da página
    expect(byRole.MECHANISM).toBe('/images/bordado/riscos.jpg');
    expect(byRole.BENEFITS).toBe('/images/bordado/bichinhos.jpg');
    expect(byRole.PRODUCT_REVEAL).toBe('/images/bordado/pontos.jpg');
    for (const r of ['OFFER_PRICE', 'GUARANTEE', 'CTA', 'FAQ', 'PAIN', 'OTHER']) expect(byRole[r]).toBeNull();
  });

  it('conteúdo e benefícios têm preferência; sem repetir imagem', () => {
    const roles = ['HERO_HOOK', 'PAIN', 'AGITATION', 'CONTENTS', 'BENEFITS', 'OFFER_PRICE'];
    const out = renderImageFallback(roles.map(role => ({ role })), BORDADO);
    // CONTENTS e BENEFITS sempre; a terceira vai para a dor (antes da agitação); preço nunca
    expect(out).toEqual(['/images/bordado/capa.jpg', '/images/bordado/riscos.jpg', null, '/images/bordado/bichinhos.jpg', '/images/bordado/pontos.jpg', null]);
    expect(new Set(out.filter(Boolean)).size).toBe(4);
  });

  it('seção de texto aprovado (fixa) e depoimentos não recebem imagem', () => {
    const out = renderImageFallback([{ role: 'HERO_HOOK' }, { role: 'TESTIMONIALS', fixed: true }, { role: 'BONUS', fixed: true }, { role: 'CONTENTS' }], BORDADO);
    expect(out).toEqual(['/images/bordado/capa.jpg', null, null, '/images/bordado/riscos.jpg']);
  });

  it('página que abre com preço/garantia/dúvidas/botão: a capa vai para a primeira seção que pode ter imagem', () => {
    expect(renderImageFallback([{ role: 'OFFER_PRICE' }, { role: 'GUARANTEE' }, { role: 'PAIN' }, { role: 'CONTENTS' }], BORDADO)).toEqual([
      null, null, '/images/bordado/capa.jpg', '/images/bordado/riscos.jpg'
    ]);
    expect(renderImageFallback([{ role: 'CTA' }, { role: 'FAQ' }], BORDADO)).toEqual([null, null]);
    expect(NON_HERO_ROLES.has('OFFER_PRICE') && NON_HERO_ROLES.has('CTA') && !NON_HERO_ROLES.has('HERO_HOOK')).toBe(true);
  });

  it('página que já tem imagem própria fica como está; produto sem imagens não ganha nenhuma', () => {
    expect(renderImageFallback([{ role: 'HERO_HOOK', image_url: 'storage:b/x.png' }, { role: 'CONTENTS', image_url: null }], BORDADO)).toEqual(['storage:b/x.png', null]);
    expect(renderImageFallback([{ role: 'HERO_HOOK' }, { role: 'CONTENTS' }], [])).toEqual([null, null]);
  });
});

describe.sequential('NORQVA-0129 — página pública e prévia com as imagens do produto', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6).toLowerCase();
  const bordadoId = crypto.randomUUID();
  const plainId = crypto.randomUUID();
  const offerB = crypto.randomUUID();
  const offerP = crypto.randomUUID();
  const pageB = crypto.randomUUID();
  const assetPdf = crypto.randomUUID();
  const assetZip = crypto.randomUUID();
  const pageP = crypto.randomUUID();
  const slugB = `bordado-t129-${tag}`;
  const slugP = `outro-t129-${tag}`;
  const sections = BORDADO_ROLES.map((role, i) => sec(i + 1, role, role === 'GUARANTEE' ? { fixed_note: 'Pela lei, 7 dias.' } : {}));

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const product = (id: string, name: string, hid: string) =>
      pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
         VALUES ($1, $2, $3, 'Artesanato', 'Riscos para bordar', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
        [id, hid, name]
      );
    const offer = (id: string, productId: string, hid: string) =>
      pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo, data_provenance)
         VALUES ($1, $2, $3, 'Oferta 0129', 29.90, 'Digital', 'ATIVA', false, 'COMMERCIAL_PRODUCTION')`,
        [id, hid, productId]
      );
    await product(bordadoId, 'Kit de Bordado 0129', `PRD-T129B${tag}`);
    await product(plainId, 'Bolso Blindado 0129', `PRD-T129P${tag}`);
    await offer(offerB, bordadoId, `OFF-T129B${tag}`);
    await offer(offerP, plainId, `OFF-T129P${tag}`);
    // Bordado entrega um PDF; o outro produto só um arquivo que não é PDF
    await pool.query(`INSERT INTO digital_assets (id, name, storage_bucket, storage_path, is_demo) VALUES ($1, 'Kit 0129', 'digital-products', 'kits/KIT_0129.pdf', false)`, [assetPdf]);
    await pool.query(`INSERT INTO digital_assets (id, name, storage_bucket, storage_path, is_demo) VALUES ($1, 'Pacote 0129', 'digital-products', 'kits/pacote_0129.zip', false)`, [assetZip]);
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerB, assetPdf]);
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerP, assetZip]);
    const page = (id: string, hid: string, slug: string, productId: string, offerId: string) =>
      pool.query(
        `INSERT INTO generated_pages (id, human_id, product_id, offer_id, slug, status, sections, theme, data_provenance)
         VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', $6::jsonb, 'light', 'COMMERCIAL_PRODUCTION')`,
        [id, hid, productId, offerId, slug, JSON.stringify(sections)]
      );
    await page(pageB, `GEN-T129B${tag}`, slugB, bordadoId, offerB);
    await page(pageP, `GEN-T129P${tag}`, slugP, plainId, offerP);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM generated_pages WHERE id IN ($1, $2)', [pageB, pageP]).catch(() => {});
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id IN ($1, $2)', [offerB, offerP]).catch(() => {});
    await pool.query('DELETE FROM digital_assets WHERE id IN ($1, $2)', [assetPdf, assetZip]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id IN ($1, $2)', [offerB, offerP]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id IN ($1, $2)', [bordadoId, plainId]).catch(() => {});
  });

  it('pública: abertura com a capa, imagens nas seções certas, galeria; nada gravado no banco', async () => {
    const before = JSON.stringify((await pool.query('SELECT sections, version, updated_at FROM generated_pages WHERE id = $1', [pageB])).rows[0]);
    const res = await request(app).get(`/api/public/generated-pages/${slugB}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['delivery_pdf', 'gallery', 'meta_pixel_id', 'offer', 'sections', 'slug', 'theme', 'title', 'whatsapp']);
    expect(res.body.gallery).toEqual(BORDADO);
    expect(res.body.delivery_pdf).toBe(true);
    const img = Object.fromEntries(res.body.sections.map((s: any) => [s.role, s.image_url]));
    expect(img.HERO_HOOK).toBe('/images/bordado/capa.jpg');
    expect([img.MECHANISM, img.BENEFITS, img.PRODUCT_REVEAL].sort()).toEqual(BORDADO.slice(1).sort());
    for (const r of ['OFFER_PRICE', 'GUARANTEE', 'FAQ', 'CTA']) expect(img[r]).toBeNull();
    expect(Object.keys(res.body.sections[0]).sort()).toEqual(['body', 'bullets', 'cta_label', 'headline', 'image_url', 'note', 'order', 'price', 'role']);
    const text = JSON.stringify(res.body);
    for (const internal of [pageB, bordadoId, offerB, 'image_status', 'image_prompt', 'collection_key', 'GEN-T129', 'KIT_0129', 'image_fallback']) expect(text).not.toContain(internal);
    const after = JSON.stringify((await pool.query('SELECT sections, version, updated_at FROM generated_pages WHERE id = $1', [pageB])).rows[0]);
    expect(after).toBe(before);
  });

  it('pública: produto sem imagens no site continua sem imagens e com galeria vazia', async () => {
    const res = await request(app).get(`/api/public/generated-pages/${slugP}`);
    expect(res.status).toBe(200);
    expect(res.body.gallery).toEqual([]);
    expect(res.body.delivery_pdf).toBe(false);
    expect(res.body.sections.every((s: any) => s.image_url === null)).toBe(true);
  });

  it('prévia do dono (tela de geração): mesmas imagens, sem gravar; o campo guardado continua vazio', async () => {
    const out = await new GenerationService(pool).get(pageB);
    expect(out.page.gallery).toEqual(BORDADO);
    expect(out.page.sections[0].image_preview_url).toBe('/images/bordado/capa.jpg');
    expect(out.page.sections[0].image_url).toBeNull();
    expect(out.page.sections[0].image_fallback).toBe(true);
    expect(out.page.sections.find((s: any) => s.role === 'OFFER_PRICE').image_fallback).toBe(false);
    expect(out.page.delivery_pdf).toBe(true);
    expect(out.page.sections.find((s: any) => s.role === 'OFFER_PRICE').image_preview_url).toBeNull();
    const row = (await pool.query('SELECT sections FROM generated_pages WHERE id = $1', [pageB])).rows[0];
    const stored = typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections;
    expect(stored.every((s: any) => s.image_url === null)).toBe(true);
  });
});
