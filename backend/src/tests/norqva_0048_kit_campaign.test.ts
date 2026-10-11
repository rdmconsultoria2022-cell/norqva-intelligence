// NORQVA-0048: campanha do kit leva para a página do kit e pode usar os criativos aprovados dos livros do kit.
// Nenhum teste fala com a Meta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { computeContentHash } from '../services/creative/creativeFactoryService';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { DEFAULT_OFFER_BASE_URL } from '../services/aiTeam/launchSheet';

describe.sequential('NORQVA-0048 — campanha para a página do kit', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const trProduct = crypto.randomUUID();
  const kitProduct = crypto.randomUUID();
  const otherProduct = crypto.randomUUID();
  const trOffer = crypto.randomUUID();
  const kitOffer = crypto.randomUUID();
  const otherOffer = crypto.randomUUID();
  const asset = crypto.randomUUID();
  const kitHid = `OFF-K48${tag}`;
  const trHid = `OFF-T48${tag}`;
  const creatives: Record<string, string> = {};

  async function mkCreative(key: string, productId: string, offerId: string) {
    const fields = { hook: `Gancho ${key}`, mechanism: null, cta: 'Saiba mais', format: 'VIDEO', script: null, primary_text: `Texto ${key}`, headline: `Título ${key}`, file_url: `https://cdn.example.com/${key}.mp4` };
    const hash = computeContentHash(fields);
    const r = await pool.query(
      `INSERT INTO creatives (human_id, product_id, offer_id, hook, concept, copy, primary_text, headline, cta, format, file_url,
                              status, is_demo, utm_content_key, content_hash, approval_status)
       VALUES ($1, $2, $3, $4, 'c', $5, $5, $6, 'Saiba mais', 'VIDEO', $7, 'IDEIA', FALSE, $1, $8, 'APPROVED') RETURNING id`,
      [key, productId, offerId, fields.hook, fields.primary_text, fields.headline, fields.file_url, hash]
    );
    await pool.query(`INSERT INTO creative_reviews (creative_id, content_hash, decision, is_demo) VALUES ($1, $2, 'APPROVED', FALSE)`, [r.rows[0].id, hash]);
    creatives[key] = r.rows[0].id;
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0048@norqva.test', 'Admin 0048', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    for (const [id, name, hid] of [[trProduct, 'Trattoria 0048', `PRD-T48${tag}`], [kitProduct, 'Kit 0048', `PRD-K48${tag}`], [otherProduct, 'Outro 0048', `PRD-O48${tag}`]]) {
      await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, $3, 'Receitas', 'x', 'PLANEJADO', FALSE)`, [id, hid, name]);
    }
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Trattoria em Casa', $3, 19.90, 'ATIVA', 'x', FALSE)`, [trOffer, trHid, trProduct]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Kit Cozinha Italiana', $3, 27.90, 'ATIVA', 'x', FALSE)`, [kitOffer, kitHid, kitProduct]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Outro', $3, 9.90, 'ATIVA', 'x', FALSE)`, [otherOffer, `OFF-O48${tag}`, otherProduct]);
    await pool.query(`INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, 'Livro 0048', 'SUPABASE', 'digital-products', 'books/0048.pdf', FALSE)`, [asset]);
    // o kit entrega o mesmo PDF do Trattoria
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $3), ($2, $3)', [trOffer, kitOffer, asset]);
    await mkCreative(`T48${tag}-TR`, trProduct, trOffer);
    await mkCreative(`T48${tag}-OUT`, otherProduct, otherOffer);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offer_digital_assets WHERE asset_id = $1', [asset]).catch(() => {});
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [asset]).catch(() => {});
  });

  it('a trava aceita a página do kit só nos domínios do NORQVA e da marca', () => {
    const c = new MetaMutatingClient();
    expect(() => c.assertUrlWhitelisted('https://norqva-intelligence-frontend.vercel.app/kit/OFF-000006')).not.toThrow();
    expect(() => c.assertUrlWhitelisted('https://trattoria.norqva.com.br/kit/OFF-000006')).not.toThrow();
    expect(() => c.assertUrlWhitelisted('https://trattoria.norqva.com.br/kit/OFF-000006?utm_source=meta')).not.toThrow();
    for (const bad of [
      'https://evil.com/kit/OFF-000006',
      'https://trattoria.norqva.com.br/kits/OFF-000006',
      'https://trattoria.norqva.com.br/kit/OFF-000006/extra',
      'https://trattoria.norqva.com.br/kit/',
      'http://trattoria.norqva.com.br/kit/OFF-000006'
    ]) {
      expect(() => c.assertUrlWhitelisted(bad), bad).toThrow('Blocked non-whitelisted destination URL');
    }
  });

  it('o kit lista os criativos aprovados dos livros que ele contém (e não os de outro produto)', async () => {
    const r = await request(app).get('/api/campaigns/offer-creatives').query({ offer: kitHid }).set('Authorization', `Bearer ${admin}`);
    expect(r.status).toBe(200);
    expect(r.body.destination).toBe(`${DEFAULT_OFFER_BASE_URL}/kit/${kitHid}`);
    const keys = r.body.creatives.map((c: any) => c.human_id);
    expect(keys).toContain(`T48${tag}-TR`);
    expect(keys).not.toContain(`T48${tag}-OUT`);
    const tr = await request(app).get('/api/campaigns/offer-creatives').query({ offer: trHid }).set('Authorization', `Bearer ${admin}`);
    expect(tr.body.destination).toBe(`${DEFAULT_OFFER_BASE_URL}/p/${trHid}`);
  });

  it('campanha nova do kit leva para /kit/ e aceita o criativo do Trattoria; criativo de outro produto é recusado', async () => {
    const bad = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${admin}`).send({ offer_human_id: kitHid, creative_ids: [creatives[`T48${tag}-OUT`]] });
    expect(bad.status).toBe(409);
    const r = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${admin}`).send({
      offer_human_id: kitHid,
      creative_ids: [creatives[`T48${tag}-TR`]],
      daily_budget_brl: 20,
      max_spend_brl: 150
    });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('DRAFT');
    expect(r.body.spec.ads[0].destination_url).toBe(`${DEFAULT_OFFER_BASE_URL}/kit/${kitHid}`);
  });

  it('o Trattoria não aceita criativo de outro produto (regra antiga continua)', async () => {
    const r = await request(app).post('/api/campaigns').set('Authorization', `Bearer ${admin}`).send({ offer_human_id: trHid, creative_ids: [creatives[`T48${tag}-OUT`]] });
    expect(r.status).toBe(409);
  });
});
