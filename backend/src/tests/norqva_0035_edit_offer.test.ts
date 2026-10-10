// NORQVA-0035: edição de oferta e produto pela tela — validação e auditoria. Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0035 — editar oferta e produto', () => {
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
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0035@norqva.test', 'Admin 0035', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, 'Dormi 0035', 'Receitas', 'Fixture', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Dormi Della Nonna', $3, 14.9, 'TESTE', 'Fixture', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, `OFF-E${tag}`, productId]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [productId]).catch(() => {});
  });

  it('corrige o nome da oferta sem mexer no status, com auditoria de edição', async () => {
    const r = await put(`/api/offers/${offerId}?mode=real`, { name: '  Dolci della Nonna ', price: 14.9, promotional_price: null, description: '10 sobremesas', bonus: null });
    expect(r.status).toBe(200);
    expect(r.body.offer.name).toBe('Dolci della Nonna');
    expect(r.body.offer.status).toBe('TESTE');
    expect(r.body.offer.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    // a auditoria é gravada logo depois da resposta: espera até 2 s
    let found = 0;
    for (let i = 0; i < 20 && !found; i++) {
      found = (await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'OFFER_UPDATE' AND description LIKE $1`, [`%OFF-E${tag}%`])).rows.length;
      if (!found) await new Promise(res => setTimeout(res, 100));
    }
    expect(found).toBeGreaterThan(0);
  });

  it('recusa nome vazio, preço zero e promocional inválido', async () => {
    expect((await put(`/api/offers/${offerId}?mode=real`, { name: '   ' })).status).toBe(400);
    expect((await put(`/api/offers/${offerId}?mode=real`, { price: 0 })).status).toBe(400);
    expect((await put(`/api/offers/${offerId}?mode=real`, { price: 'abc' })).status).toBe(400);
    expect((await put(`/api/offers/${offerId}?mode=real`, { promotional_price: -1 })).status).toBe(400);
    const o = (await pool.query('SELECT name, price FROM offers WHERE id = $1', [offerId])).rows[0];
    expect(o.name).toBe('Dolci della Nonna');
    expect(Number(o.price)).toBe(14.9);
  });

  it('promocional em branco limpa o campo', async () => {
    await put(`/api/offers/${offerId}?mode=real`, { promotional_price: 12.9 });
    const r = await put(`/api/offers/${offerId}?mode=real`, { promotional_price: '' });
    expect(r.status).toBe(200);
    expect(r.body.offer.promotional_price).toBeNull();
  });

  it('edita nome e categoria do produto; recusa vazio', async () => {
    const r = await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', name: 'Dolci della Nonna', category: 'Receitas' });
    expect(r.status).toBe(200);
    expect(r.body.product.name).toBe('Dolci della Nonna');
    expect((await put(`/api/products/${productId}?mode=real`, { status: 'PLANEJADO', name: '  ' })).status).toBe(400);
  });
});
