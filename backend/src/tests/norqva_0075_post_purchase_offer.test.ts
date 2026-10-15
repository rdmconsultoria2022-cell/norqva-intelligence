// NORQVA-0075: oferta depois da compra na tela de entrega.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { resolvePostPurchaseOffer } from '../controllers/api';

const ids = { orders: [] as string[], customers: [] as string[], offers: [] as string[], assets: [] as string[], products: [] as string[] };

describe.sequential('NORQVA-0075 — oferta depois da compra', () => {
  let pool: Pool;
  let trattId: string;
  let upsellId: string;
  let upsellHuman: string;
  let dolciOfferId: string;
  let productId: string;
  const assets: Record<string, string> = {};

  async function offer(name: string, price: number, opts: { status?: string } = {}) {
    const id = crypto.randomUUID();
    const human = `OFF-0075-${id.slice(0, 6)}`;
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, 'Desc', false)`,
      [id, human, name, productId, price, opts.status || 'ATIVA']
    );
    ids.offers.push(id);
    return { id, human };
  }

  async function asset(name: string) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`,
      [id, name, `books/0075-${id.slice(0, 6)}.pdf`]
    );
    ids.assets.push(id);
    return id;
  }

  async function paidOrder(items: Array<{ offerId: string; isBump?: boolean }>, opts: { status?: string; customerId?: string; isDemo?: boolean } = {}) {
    let customerId = opts.customerId;
    if (!customerId) {
      customerId = crypto.randomUUID();
      await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, NULL, false)', [customerId, 'Cliente 0075', `c0075_${customerId.slice(0, 8)}@example.com`]);
      ids.customers.push(customerId);
    }
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, $3, $4, $5, 'COMMERCIAL_PRODUCTION')`,
      [orderId, customerId, opts.status || 'PAID', crypto.randomUUID(), Boolean(opts.isDemo)]
    );
    ids.orders.push(orderId);
    for (const it of items) {
      await pool.query(
        `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, is_bump)
         VALUES ($1, $2, $3, 'P', 'O', 19.90, 1, 19.90, $4)`,
        [orderId, it.offerId, productId, Boolean(it.isBump)]
      );
    }
    return { orderId, customerId };
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, status, description, is_demo)
       VALUES ($1, $2, 'Coleção 0075', 'Downloads', 'PLANEJADO', 'Desc', false)`,
      [productId, `PRD-0075-${productId.slice(0, 6)}`]
    );
    ids.products.push(productId);
    for (const n of ['Trattoria em Casa', 'Dolci della Nonna', 'Pães & Fermentação Natural', 'Antipasti & Aperitivo', 'Risotos & Polentas']) assets[n] = await asset(n);
    const t = await offer('Trattoria 0075', 19.9);
    trattId = t.id;
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [trattId, assets['Trattoria em Casa']]);
    const d = await offer('Dolci 0075', 14.9);
    dolciOfferId = d.id;
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [dolciOfferId, assets['Dolci della Nonna']]);
    const u = await offer('COMPLETE A COLEÇÃO — +4 LIVROS', 27.9);
    upsellId = u.id;
    upsellHuman = u.human;
    for (const n of ['Dolci della Nonna', 'Pães & Fermentação Natural', 'Antipasti & Aperitivo', 'Risotos & Polentas']) {
      await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [upsellId, assets[n]]);
    }
    await pool.query('UPDATE offers SET post_purchase_offer_id = $1 WHERE id = $2', [upsellId, trattId]);
  });

  afterAll(async () => {
    if (ids.orders.length) {
      await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids.orders]);
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids.orders]);
    }
    if (ids.customers.length) await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [ids.customers]);
    await pool.query('UPDATE offers SET post_purchase_offer_id = NULL WHERE id = ANY($1::uuid[])', [ids.offers]);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [ids.offers]);
    await pool.query('DELETE FROM offers WHERE id = ANY($1::uuid[])', [ids.offers]);
    await pool.query('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [ids.assets]);
    await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [ids.products]);
  });

  test('A: comprou só o Trattoria e pagou: aparece a oferta com os 4 livros', async () => {
    const { orderId } = await paidOrder([{ offerId: trattId }]);
    const r = await resolvePostPurchaseOffer(pool, orderId);
    expect(r).not.toBeNull();
    expect(r!.human_id).toBe(upsellHuman);
    expect(r!.price).toBe(27.9);
    expect(r!.books).toHaveLength(4);
  });

  test('B: levou o Dolci no adicional: não aparece (já tem um dos livros)', async () => {
    const { orderId } = await paidOrder([{ offerId: trattId }, { offerId: dolciOfferId, isBump: true }]);
    expect(await resolvePostPurchaseOffer(pool, orderId)).toBeNull();
  });

  test('C: pedido não pago ou demo: não aparece', async () => {
    const pending = await paidOrder([{ offerId: trattId }], { status: 'PENDING' });
    expect(await resolvePostPurchaseOffer(pool, pending.orderId)).toBeNull();
    const demo = await paidOrder([{ offerId: trattId }], { isDemo: true });
    expect(await resolvePostPurchaseOffer(pool, demo.orderId)).toBeNull();
  });

  test('D: quem já comprou a oferta não vê de novo', async () => {
    const first = await paidOrder([{ offerId: trattId }]);
    await paidOrder([{ offerId: upsellId }], { customerId: first.customerId });
    expect(await resolvePostPurchaseOffer(pool, first.orderId)).toBeNull();
  });

  test('E: oferta pausada não aparece', async () => {
    const { orderId } = await paidOrder([{ offerId: trattId }]);
    await pool.query("UPDATE offers SET status = 'PAUSADA' WHERE id = $1", [upsellId]);
    try {
      expect(await resolvePostPurchaseOffer(pool, orderId)).toBeNull();
    } finally {
      await pool.query("UPDATE offers SET status = 'ATIVA' WHERE id = $1", [upsellId]);
    }
  });
});
