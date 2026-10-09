// NORQVA-0034: produto/oferta criados pela tela na conta real nascem como produção comercial; os que ficaram
// "UNKNOWN" antes da correção voltam para a lista só quando o ADMIN pede. Nenhum serviço externo é chamado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0034 — produto criado pela tela aparece na conta real', () => {
  let pool: Pool;
  let adminToken: string;
  let productToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const created: string[] = [];
  const legacyId = crypto.randomUUID();
  const legacyOffer = crypto.randomUUID();
  const qaId = crypto.randomUUID();
  const demoId = crypto.randomUUID();

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body)
  });

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
    adminToken = await mk('admin.norqva0034@norqva.test', 'ADMIN');
    productToken = await mk('product.norqva0034@norqva.test', 'PRODUCT');
    const ins = (id: string, name: string, demo: boolean, prov: string) =>
      pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, $3, 'Receitas', 'Fixture', 'PLANEJADO', $4, $5)`,
        [id, `PRD-${tag}-${id.slice(0, 4)}`, name, demo, prov]
      );
    await ins(legacyId, `Dolci 0034 ${tag}`, false, 'UNKNOWN');
    await ins(qaId, `QA 0034 ${tag}`, false, 'QA_FIXTURE');
    await ins(demoId, `Demo 0034 ${tag}`, true, 'UNKNOWN');
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Dolci 0034', $3, 14.9, 'RASCUNHO', 'Fixture', false, 'UNKNOWN')`,
      [legacyOffer, `OFF-L${tag}`, legacyId]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const ids = [legacyId, qaId, demoId, ...created];
    await q('DELETE FROM offers WHERE product_id = ANY($1::uuid[])', [ids]);
    await q('DELETE FROM products WHERE id = ANY($1::uuid[])', [ids]);
  });

  it('produto e oferta criados pela tela na conta real aparecem nas listas', async () => {
    const p = await as(productToken).post('/api/products?mode=real', { name: `Novo 0034 ${tag}`, category: 'Receitas', description: 'Teste' });
    expect(p.status).toBe(201);
    created.push(p.body.product.id);
    expect(p.body.product.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    const list = await as(adminToken).get('/api/products?mode=real');
    expect(list.body.products.some((x: any) => x.id === p.body.product.id)).toBe(true);

    const o = await as(adminToken).post('/api/offers?mode=real', { product_id: p.body.product.id, name: `Oferta 0034 ${tag}`, price: 14.9, description: 'Teste' });
    expect(o.status).toBe(201);
    expect(o.body.offer.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    const offers = await as(adminToken).get('/api/offers?mode=real');
    const rows = offers.body.offers || offers.body;
    expect(rows.some((x: any) => x.id === o.body.offer.id)).toBe(true);
  });

  it('oferta de produto que ainda está fora da lista continua fora', async () => {
    const o = await as(adminToken).post('/api/offers?mode=real', { product_id: legacyId, name: `Oferta presa ${tag}`, price: 9.9, description: 'Teste' });
    expect(o.status).toBe(201);
    expect(o.body.offer.data_provenance).toBe('UNKNOWN');
  });

  it('só ADMIN vê e traz; a lista mostra só os da conta real com procedência desconhecida', async () => {
    expect((await as(productToken).get('/api/products/hidden')).status).toBe(403);
    expect((await as(productToken).post(`/api/products/${legacyId}/bring-to-list`)).status).toBe(403);
    const h = await as(adminToken).get('/api/products/hidden');
    expect(h.status).toBe(200);
    const ids = h.body.products.map((x: any) => x.id);
    expect(ids).toContain(legacyId);
    expect(ids).not.toContain(qaId);
    expect(ids).not.toContain(demoId);
  });

  it('trazer para a lista marca o produto e as ofertas dele, com auditoria', async () => {
    const r = await as(adminToken).post(`/api/products/${legacyId}/bring-to-list`);
    expect(r.status).toBe(200);
    expect(r.body.offers).toContain(`OFF-L${tag}`);
    const p = (await pool.query('SELECT data_provenance FROM products WHERE id = $1', [legacyId])).rows[0];
    expect(p.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    const offs = (await pool.query('SELECT data_provenance FROM offers WHERE product_id = $1', [legacyId])).rows;
    expect(offs.every((x: any) => x.data_provenance === 'COMMERCIAL_PRODUCTION')).toBe(true);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'PRODUCT_BROUGHT_TO_COMMERCIAL' AND description LIKE $1`, [`%Dolci 0034 ${tag}%`]);
    expect(audit.rows).toHaveLength(1);
    const list = await as(adminToken).get('/api/products?mode=real');
    expect(list.body.products.some((x: any) => x.id === legacyId)).toBe(true);
    expect((await as(adminToken).post(`/api/products/${legacyId}/bring-to-list`)).status).toBe(409);
  });

  it('não traz produto de teste (QA) nem de demonstração', async () => {
    const qa = await as(adminToken).post(`/api/products/${qaId}/bring-to-list`);
    expect(qa.status).toBe(409);
    const demo = await as(adminToken).post(`/api/products/${demoId}/bring-to-list`);
    expect(demo.status).toBe(409);
    expect((await pool.query('SELECT data_provenance FROM products WHERE id = $1', [qaId])).rows[0].data_provenance).toBe('QA_FIXTURE');
    expect((await as(adminToken).post(`/api/products/${crypto.randomUUID()}/bring-to-list`)).status).toBe(404);
  });
});
