import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import https from 'https';
import { EventEmitter } from 'events';
import { downloadDelivery } from '../controllers/api';

describe('NORQVA P0.1 Customer Delivery UX Remediation Tests', () => {
  let app: express.Express;
  let pool: Pool;
  let testOrderId: string;
  let testAssetId: string;
  let validRawToken: string;
  let validTokenHash: string;
  let expiredRawToken: string;
  let expiredTokenHash: string;
  let exhaustedRawToken: string;
  let exhaustedTokenHash: string;
  let httpsSpy: any;

  beforeAll(async () => {
    process.env.STORAGE_SIGNED_URL_TTL_SECONDS = '60';
    process.env.SUPABASE_URL = 'https://ikekbotxngcgqyojtwjb.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_key';

    httpsSpy = vi.spyOn(https, 'request').mockImplementation((options: any, callback: any) => {
      const mockReq = new EventEmitter() as any;
      mockReq.write = vi.fn();
      mockReq.end = vi.fn();

      const mockRes = new EventEmitter() as any;
      mockRes.statusCode = 200;
      process.nextTick(() => {
        if (callback) callback(mockRes);
        mockRes.emit('data', JSON.stringify({
          signedURL: 'https://ikekbotxngcgqyojtwjb.supabase.co/storage/v1/object/sign/digital-products/TRATTORIA_EM_CASA_FINAL.pdf?token=mock_signed_token'
        }));
        mockRes.emit('end');
      });
      return mockReq;
    });

    pool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST || 'postgresql://postgres:RicardoAndradeLucas@localhost:5432/norqva_test'
    });

    app = express();
    app.set('db', pool);
    app.use(express.json());
    app.get('/api/delivery/:token', downloadDelivery);
    app.head('/api/delivery/:token', downloadDelivery);

    const uid = crypto.randomBytes(4).toString('hex');
    const productRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo)
       VALUES ($1, 'Trattoria em Casa Test', 'INFOPRODUTO', 'Test Product', false)
       RETURNING id`,
      [`PRD-UX-${uid}`]
    );
    const productId = productRes.rows[0].id;

    const offerRes = await pool.query(
      `INSERT INTO offers (product_id, human_id, name, description, price, status, is_demo)
       VALUES ($1, $2, 'Trattoria UX Test', 'Test Description', 19.90, 'ATIVA', false)
       RETURNING id`,
      [productId, `OFF-UX-${uid}`]
    );
    const offerId = offerRes.rows[0].id;

    const assetRes = await pool.query(
      `INSERT INTO digital_assets (name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ('Trattoria em Casa — PDF Oficial', 'SUPABASE', 'digital-products', 'TRATTORIA_EM_CASA_FINAL.pdf', false)
       RETURNING id`
    );
    testAssetId = assetRes.rows[0].id;

    const createOrderForTest = async (suffix: string) => {
      const cRes = await pool.query(
        `INSERT INTO customers (name, email, phone, is_demo) VALUES ('Customer Test', $1, '11987654321', false) RETURNING id`,
        [`cust-${uid}-${suffix}@test.com`]
      );
      const oRes = await pool.query(
        `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo) VALUES ($1, 19.90, 'PAID', $2, false) RETURNING id`,
        [cRes.rows[0].id, `idemp-${uid}-${suffix}`]
      );
      const iRes = await pool.query(
        `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
         VALUES ($1, $2, $3, 'Trattoria em Casa Test', 'Trattoria UX Test', 19.90, 1, 19.90) RETURNING id`,
        [oRes.rows[0].id, offerId, productId]
      );
      return { orderId: oRes.rows[0].id, orderItemId: iRes.rows[0].id };
    };

    const activeOrder = await createOrderForTest('active');
    testOrderId = activeOrder.orderId;
    validRawToken = crypto.randomBytes(32).toString('hex');
    validTokenHash = crypto.createHash('sha256').update(validRawToken).digest('hex');
    await pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status, download_count, max_downloads, delivery_token_hash, delivery_token_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', 0, 5, $4, NOW() + INTERVAL '7 days')`,
      [activeOrder.orderId, activeOrder.orderItemId, testAssetId, validTokenHash]
    );

    const expiredOrder = await createOrderForTest('expired');
    expiredRawToken = crypto.randomBytes(32).toString('hex');
    expiredTokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    await pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status, download_count, max_downloads, delivery_token_hash, delivery_token_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', 0, 5, $4, NOW() - INTERVAL '1 hour')`,
      [expiredOrder.orderId, expiredOrder.orderItemId, testAssetId, expiredTokenHash]
    );

    const exhaustedOrder = await createOrderForTest('exhausted');
    exhaustedRawToken = crypto.randomBytes(32).toString('hex');
    exhaustedTokenHash = crypto.createHash('sha256').update(exhaustedRawToken).digest('hex');
    await pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status, download_count, max_downloads, delivery_token_hash, delivery_token_expires_at)
       VALUES ($1, $2, $3, 'ACTIVE', 5, 5, $4, NOW() + INTERVAL '7 days')`,
      [exhaustedOrder.orderId, exhaustedOrder.orderItemId, testAssetId, exhaustedTokenHash]
    );
  });

  afterAll(async () => {
    if (httpsSpy) httpsSpy.mockRestore();
    await pool.query('DELETE FROM order_deliveries WHERE asset_id = $1', [testAssetId]);
    await pool.query('DELETE FROM order_items WHERE product_id = $1', [testAssetId]);
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [testAssetId]);
    await pool.end();
  });

  it('UX-01: Direct browser navigation with valid token returns HTTP 302 redirect and never raw JSON', async () => {
    const res = await request(app)
      .get(`/api/delivery/${validRawToken}`)
      .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
      .set('sec-fetch-dest', 'document');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBeDefined();
    expect(res.headers.location).toContain('https://ikekbotxngcgqyojtwjb.supabase.co/storage/v1/object/sign/digital-products/TRATTORIA_EM_CASA_FINAL.pdf');
    expect(res.headers['content-type']).not.toContain('application/json');
  });

  it('UX-02: Programmatic API / fetch request receives clean JSON with signed URL', async () => {
    const res = await request(app)
      .get(`/api/delivery/${validRawToken}?format=json`)
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.download_url).toBeDefined();
    expect(res.body.download_url).toContain('TRATTORIA_EM_CASA_FINAL.pdf');
    expect(res.body.downloads_remaining).toBe(3);
  });

  it('UX-03: Direct browser navigation with invalid token returns branded HTML error page', async () => {
    const res = await request(app)
      .get('/api/delivery/invalid_token_999999')
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8')
      .set('sec-fetch-dest', 'document');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NORQVA INTELLIGENCE');
    expect(res.text).toContain('Link Não Encontrado');
    expect(res.text).not.toContain('password');
    expect(res.text).not.toContain('secret');
  });

  it('UX-04: Direct browser navigation with expired token returns branded HTML error page', async () => {
    const res = await request(app)
      .get(`/api/delivery/${expiredRawToken}`)
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8');

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NORQVA INTELLIGENCE');
    expect(res.text).toContain('Link Expirado');
  });

  it('UX-05: Direct browser navigation with exhausted quota returns branded HTML error page', async () => {
    const res = await request(app)
      .get(`/api/delivery/${exhaustedRawToken}`)
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8');

    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NORQVA INTELLIGENCE');
    expect(res.text).toContain('Limite de Downloads Atingido');
  });

  it('UX-06: HEAD request does not increment download count or consume quota', async () => {
    const initialDel = await pool.query('SELECT download_count FROM order_deliveries WHERE delivery_token_hash = $1', [validTokenHash]);
    const initialCount = initialDel.rows[0].download_count;

    const res = await request(app).head(`/api/delivery/${validRawToken}`);
    expect(res.status).toBe(200);

    const postDel = await pool.query('SELECT download_count FROM order_deliveries WHERE delivery_token_hash = $1', [validTokenHash]);
    expect(postDel.rows[0].download_count).toBe(initialCount);
  });
});