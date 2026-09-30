import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { resolveBrandPixelId } from '../services/brands/brandService';
import { MetaCapiService } from '../services/meta/metaCapiService';

// NORQVA-0018 (fase B/C): pixel por marca. Só PIXEL VERIFIED e com roteamento ligado vale; sem ele, pixel padrão.

describe('NORQVA-0018 — pixel da marca', () => {
  let pool: Pool;
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  const brandPixel = '998877665544' + String(Date.now()).slice(-4);
  let brandId: string;
  let offerId: string;
  let offerHumanId: string;
  let orderId: string;
  let plainOrderId: string;
  const hadToken = process.env.META_ACCESS_TOKEN;

  const mkOrder = async (offer: string, product: string) => {
    const c = await pool.query(`INSERT INTO customers (name, email) VALUES ('Cliente 0018', $1) RETURNING id`, [`c${suffix}${Math.random()}@norqva.test`]);
    const o = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key) VALUES ($1, 19.9, 'PENDING', $2) RETURNING id`,
      [c.rows[0].id, `idem-0018-${suffix}-${Math.random()}`]
    );
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'P', 'O', 19.9, 1, 19.9)`,
      [o.rows[0].id, offer, product]
    );
    return o.rows[0].id as string;
  };

  beforeAll(async () => {
    pool = app.get('db') || initializeDB();
    await runMigrations(pool);
    delete process.env.META_ACCESS_TOKEN; // CAPI grava SKIPPED, sem rede

    brandId = (await pool.query(`INSERT INTO brands (code, name) VALUES ($1, 'Marca Pixel 0018') RETURNING id`, [`PIX_${suffix}`])).rows[0].id;
    const product = (
      await pool.query(
        `INSERT INTO products (human_id, name, category, description, brand_id) VALUES ($1, 'Produto Pixel', 'Teste', 'x', $2) RETURNING id`,
        [`PRD-PIX-${suffix}`, brandId]
      )
    ).rows[0].id;
    offerHumanId = `OFF-PIX-${suffix}`;
    offerId = (
      await pool.query(
        `INSERT INTO offers (human_id, product_id, name, price, description, status) VALUES ($1, $2, 'Oferta Pixel', 19.9, 'x', 'ATIVA') RETURNING id`,
        [offerHumanId, product]
      )
    ).rows[0].id;
    orderId = await mkOrder(offerId, product);

    const plainProduct = (
      await pool.query(`INSERT INTO products (human_id, name, category, description) VALUES ($1, 'Sem marca', 'Teste', 'x') RETURNING id`, [`PRD-NOB-${suffix}`])
    ).rows[0].id;
    const plainOffer = (
      await pool.query(
        `INSERT INTO offers (human_id, product_id, name, price, description, status) VALUES ($1, $2, 'Sem marca', 10, 'x', 'ATIVA') RETURNING id`,
        [`OFF-NOB-${suffix}`, plainProduct]
      )
    ).rows[0].id;
    plainOrderId = await mkOrder(plainOffer, plainProduct);
  });

  afterAll(() => {
    if (hadToken === undefined) delete process.env.META_ACCESS_TOKEN;
    else process.env.META_ACCESS_TOKEN = hadToken;
  });

  it('pixel não verificado não é usado', async () => {
    await pool.query(
      `INSERT INTO brand_meta_assets (brand_id, asset_type, external_id, status, created_by) VALUES ($1, 'PIXEL', $2, 'LINKED', 'OPERATOR')`,
      [brandId, brandPixel]
    );
    expect(await resolveBrandPixelId(pool, { offerId })).toBeNull();
    const pub = await request(app).get(`/api/public/offers/${offerHumanId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.meta_pixel_id).toBeNull();
  });

  it('pixel VERIFIED vai para a landing e para o CAPI da venda', async () => {
    await pool.query(`UPDATE brand_meta_assets SET status = 'VERIFIED', verified_at = NOW() WHERE brand_id = $1 AND asset_type = 'PIXEL'`, [brandId]);
    // Verificado, mas sem ativação do operador: continua no pixel padrão.
    expect(await resolveBrandPixelId(pool, { offerId })).toBeNull();
    await pool.query(`UPDATE brand_meta_assets SET routing_enabled = TRUE WHERE brand_id = $1 AND asset_type = 'PIXEL'`, [brandId]);
    expect(await resolveBrandPixelId(pool, { offerId })).toBe(brandPixel);
    expect(await resolveBrandPixelId(pool, { orderId })).toBe(brandPixel);

    const pub = await request(app).get(`/api/public/offers/${offerHumanId}`);
    expect(pub.body.meta_pixel_id).toBe(brandPixel);

    await MetaCapiService.sendEvent(pool, { orderId, eventName: 'Purchase', eventId: `purchase_${orderId}`, value: 19.9, currency: 'BRL' });
    const row = await pool.query(`SELECT pixel_id, status FROM capi_events WHERE event_id = $1`, [`purchase_${orderId}`]);
    expect(row.rows[0]).toMatchObject({ pixel_id: brandPixel, status: 'SKIPPED' });
  });

  it('venda de produto sem marca continua no pixel padrão', async () => {
    expect(await resolveBrandPixelId(pool, { orderId: plainOrderId })).toBeNull();
    await MetaCapiService.sendEvent(pool, { orderId: plainOrderId, eventName: 'Purchase', eventId: `purchase_${plainOrderId}`, value: 10, currency: 'BRL' });
    const row = await pool.query(`SELECT pixel_id FROM capi_events WHERE event_id = $1`, [`purchase_${plainOrderId}`]);
    expect(row.rows[0].pixel_id).not.toBe(brandPixel);
    expect(row.rows[0].pixel_id).toBeTruthy();
  });

  it('erro na consulta nunca derruba o envio', async () => {
    expect(await resolveBrandPixelId(pool, { orderId: 'nao-e-uuid' })).toBeNull();
    expect(await resolveBrandPixelId(pool, {})).toBeNull();
  });
});
