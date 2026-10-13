// NORQVA-0057 (parte 1): descrição, custo estimado e observações do produto; upsell e cross-sell da oferta.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0057 — editar todos os campos do produto e da oferta', () => {
  let pool: Pool;
  let adminToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const put = (url: string, body: any) => request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0057@norqva.test', 'Admin 0057', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, observations) VALUES ($1, $2, 'Livro 0057', 'Receitas', 'Antiga', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', 'nota')`,
      [productId, `PRD-${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Oferta 0057', $3, 19.9, 'TESTE', 'Fixture', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, `OFF-F${tag}`, productId]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('salva descrição, custo e observações; limpa observações', async () => {
    const r = await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', description: '  12 receitas de pães  ', estimated_cost: 150.5, observations: null });
    expect(r.status).toBe(200);
    expect(r.body.product.description).toBe('12 receitas de pães');
    expect(Number(r.body.product.estimated_cost)).toBe(150.5);
    expect(r.body.product.observations).toBeNull();
  });

  it('recusa descrição vazia e custo inválido', async () => {
    expect((await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', description: '   ' })).status).toBe(400);
    expect((await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', estimated_cost: -1 })).status).toBe(400);
    expect((await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', estimated_cost: 'abc' })).status).toBe(400);
    expect((await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', estimated_cost: 1.234 })).status).toBe(400);
    const row = (await pool.query('SELECT description FROM products WHERE id = $1', [productId])).rows[0];
    expect(row.description).toBe('12 receitas de pães');
  });

  it('oferta: upsell e cross-sell editáveis e limpáveis', async () => {
    const r = await put(`/api/offers/${offerId}?mode=real`, { upsell: 'Kit Cozinha Italiana', cross_sell: 'Dolci della Nonna' });
    expect(r.status).toBe(200);
    expect(r.body.offer.upsell).toBe('Kit Cozinha Italiana');
    expect(r.body.offer.cross_sell).toBe('Dolci della Nonna');
    const c = await put(`/api/offers/${offerId}?mode=real`, { upsell: null, cross_sell: null });
    expect(c.status).toBe(200);
    expect(c.body.offer.upsell).toBeNull();
    expect(c.body.offer.status).toBe('TESTE');
  });
});
