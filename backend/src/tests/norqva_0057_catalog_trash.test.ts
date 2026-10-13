// NORQVA-0057 (parte 2): excluir para a lixeira e restaurar produto e oferta. Sem serviços externos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';

describe.sequential('NORQVA-0057 — lixeira de produtos e ofertas', () => {
  let pool: Pool;
  let admin: string;
  let productRole: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerA = crypto.randomUUID(); // ativa
  const offerB = crypto.randomUUID(); // pausada, sem uso
  const offerC = crypto.randomUUID(); // arquivada
  const otherProduct = crypto.randomUUID();
  const offerMain = crypto.randomUUID(); // oferta de outro produto com adicional = B
  const hid = (s: string) => `OFF-${s}${tag}`;
  const prdHid = `PRD-T57${tag}`;
  const orderId = crypto.randomUUID();
  const post = (url: string, body: any, token = admin) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, 'U 0057', $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = $3, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.trash0057@norqva.test', 'ADMIN');
    productRole = await mk('product.trash0057@norqva.test', 'PRODUCT');
    for (const [id, h, name] of [[productId, prdHid, 'Livro 0057'], [otherProduct, `PRD-O57${tag}`, 'Outro 0057']]) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance) VALUES ($1, $2, $3, 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
        [id, h, name]
      );
    }
    const off = (id: string, h: string, status: string, prd = productId) =>
      pool.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, $3, $4, 19.9, $5, 'x', false, 'COMMERCIAL_PRODUCTION')`,
        [id, h, `Oferta ${h}`, prd, status]
      );
    await off(offerA, hid('A'), 'ATIVA');
    await off(offerB, hid('B'), 'PAUSADA');
    await off(offerC, hid('C'), 'ARQUIVADA');
    await off(offerMain, hid('M'), 'ATIVA', otherProduct);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM order_items WHERE order_id = $1', [orderId]).catch(() => {});
    await pool.query('DELETE FROM orders WHERE id = $1', [orderId]).catch(() => {});
    await pool.query('DELETE FROM customers WHERE email = $1', [`buyer.${tag.toLowerCase()}@example.com`]).catch(() => {});
    await pool.query('DELETE FROM offer_bumps WHERE offer_id = $1', [offerMain]).catch(() => {});
    await pool.query('DELETE FROM launch_plans WHERE code = $1', [`T57-${tag}`]).catch(() => {});
    await pool.query('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[offerA, offerB, offerC, offerMain]]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [[productId, otherProduct]]).catch(() => {});
  });

  it('só ADMIN e com o código digitado', async () => {
    expect((await post(`/api/offers/${offerB}/delete?mode=real`, { confirm_code: hid('B') }, productRole)).status).toBe(403);
    const r = await post(`/api/offers/${offerB}/delete?mode=real`, { confirm_code: 'ERRADO' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain(hid('B'));
  });

  it('oferta ativa não é excluída: pede para pausar', async () => {
    const r = await post(`/api/offers/${offerA}/delete?mode=real`, { confirm_code: hid('A') });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/pause antes/);
  });

  it('oferta em uso (campanha, adicional, pedido aguardando) não é excluída', async () => {
    await pool.query(
      `INSERT INTO launch_plans (id, code, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text)
       VALUES (gen_random_uuid(), $1, 'OFF-000001', 'ACTIVE', $2, '{}', 20, 140, 'q')`,
      [`T57-${tag}`, JSON.stringify({ ads: [{ name: 'X', destination_url: `https://norqva-intelligence-frontend.vercel.app/p/${hid('B')}` }] })]
    );
    await pool.query(`INSERT INTO offer_bumps (offer_id, bump_offer_id, bump_price, is_active, is_demo) VALUES ($1, $2, 9.9, TRUE, FALSE)`, [offerMain, offerB]);
    const cust = (await pool.query(`INSERT INTO customers (id, email, name) VALUES (gen_random_uuid(), $1, 'Comprador 0057') RETURNING id`, [`buyer.${tag.toLowerCase()}@example.com`])).rows[0].id;
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, is_demo, data_provenance, idempotency_key) VALUES ($1, $2, 19.9, 'PENDING', FALSE, 'COMMERCIAL_PRODUCTION', $3)`,
      [orderId, cust, `T57-${tag}`]
    );
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Livro 0057', 'Oferta B', 19.9, 1, 19.9)`,
      [orderId, offerB, productId]
    );
    const r = await post(`/api/offers/${offerB}/delete?mode=real`, { confirm_code: hid('B') });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain(`T57-${tag}`);
    expect(r.body.error).toContain(hid('M'));
    expect(r.body.error).toMatch(/aguardando pagamento/);
    // tira os usos
    await pool.query(`UPDATE launch_plans SET status = 'REJECTED' WHERE code = $1`, [`T57-${tag}`]);
    await pool.query(`UPDATE offer_bumps SET is_active = FALSE WHERE offer_id = $1`, [offerMain]);
    await pool.query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [orderId]);
  });

  it('exclui para a lixeira: some da lista, aparece na lixeira, com auditoria', async () => {
    const r = await post(`/api/offers/${offerB}/delete?mode=real`, { confirm_code: hid('B').toLowerCase() });
    expect(r.status).toBe(200);
    const list = await request(app).get('/api/offers?mode=real').set('Authorization', `Bearer ${admin}`);
    expect(list.body.offers.map((o: any) => o.id)).not.toContain(offerB);
    const trash = await request(app).get('/api/catalog/trash').set('Authorization', `Bearer ${admin}`);
    expect(trash.status).toBe(200);
    expect(trash.body.offers.map((o: any) => o.id)).toContain(offerB);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'OFFER_DELETED' AND description LIKE $1`, [`%${hid('B')}%`]);
    expect(audit.rows.length).toBe(1);
    // o cadastro continua no banco (pedidos e downloads dependem dele)
    const row = (await pool.query('SELECT is_deleted, deleted_at FROM offers WHERE id = $1', [offerB])).rows[0];
    expect(row.is_deleted).toBe(true);
    expect(row.deleted_at).toBeTruthy();
  });

  it('produto só é excluído sem ofertas abertas; arquivadas vão junto', async () => {
    const blocked = await post(`/api/products/${productId}/delete?mode=real`, { confirm_code: prdHid });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain(hid('A'));
    await pool.query(`UPDATE offers SET status = 'PAUSADA' WHERE id = $1`, [offerA]);
    expect((await post(`/api/offers/${offerA}/delete?mode=real`, { confirm_code: hid('A') })).status).toBe(200);
    const r = await post(`/api/products/${productId}/delete?mode=real`, { confirm_code: prdHid });
    expect(r.status).toBe(200);
    const c = (await pool.query('SELECT is_deleted FROM offers WHERE id = $1', [offerC])).rows[0];
    expect(c.is_deleted).toBe(true);
    const list = await request(app).get('/api/products?mode=real').set('Authorization', `Bearer ${admin}`);
    expect(list.body.products.map((p: any) => p.id)).not.toContain(productId);
  });

  it('oferta de produto na lixeira só volta depois do produto; tudo volta pausado', async () => {
    const early = await post(`/api/offers/${offerB}/restore?mode=real`, { confirm_code: hid('B') });
    expect(early.status).toBe(409);
    expect(early.body.error).toContain(prdHid);
    const p = await post(`/api/products/${productId}/restore?mode=real`, { confirm_code: prdHid });
    expect(p.status).toBe(200);
    expect(p.body.item.status).toBe('PLANEJADO');
    const b = await post(`/api/offers/${offerB}/restore?mode=real`, { confirm_code: hid('B') });
    expect(b.status).toBe(200);
    expect(b.body.item.status).toBe('PAUSADA');
    // arquivada volta pausada (antes o arquivo não tinha volta)
    const c = await post(`/api/offers/${offerC}/restore?mode=real`, { confirm_code: hid('C') });
    expect(c.status).toBe(200);
    expect(c.body.item.status).toBe('PAUSADA');
    expect(c.body.item.is_deleted).toBe(false);
  });

  it('restaurar o que não está na lixeira nem arquivado é recusado', async () => {
    const r = await post(`/api/offers/${offerMain}/restore?mode=real`, { confirm_code: hid('M') });
    expect(r.status).toBe(409);
  });
});
