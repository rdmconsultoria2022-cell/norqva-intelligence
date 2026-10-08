// NORQVA-0026: tela Vendas — lista, filtro "com problema" e ações só para pedido pago.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AsaasPaymentProvider } from '../utils/payment';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { emailService, dispatchedEmailsForTesting, clearTestEmails } from '../services/emailService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';

const AMOUNT = 19.9;

describe.sequential('NORQVA-0026 — tela Vendas', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  let creativeToken: string;
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const orders: string[] = [];
  const customers: string[] = [];

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
    adminToken = await mk('admin.norqva0026@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0026@norqva.test', 'PERFORMANCE');
    creativeToken = await mk('creative.norqva0026@norqva.test', 'CREATIVE');

    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo)
       VALUES ($1, $2, 'Trattoria 0026', 'Receitas', 'Fixture', 'PLANEJADO', true)`,
      [productId, `PRD-0026-${productId.slice(0, 6)}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria em Casa 0026', $3, $4, 'ATIVA', 'Fixture', true)`,
      [offerId, `OFF-0026-${offerId.slice(0, 6)}`, productId, AMOUNT]
    );
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, 'Livro 0026', 'SUPABASE', 'digital-products', 'books/0026.pdf', true)`,
      [assetId]
    );
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerId, assetId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM payment_webhook_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id = ANY($1::uuid[]))', [orders]);
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [assetId]);
  });

  let spy: any;
  beforeEach(() => {
    resetAllRateLimits();
    clearTestEmails();
    (emailService as any).setProvider(null);
    spy = vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({ id, status: 'RECEIVED', amount: AMOUNT }) as any);
  });
  afterEach(() => {
    spy.mockRestore();
    (emailService as any).setProvider(null);
  });

  async function newOrder(status: 'PENDING' | 'PAID', delivery?: { status: string; downloads: number }) {
    const customerId = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [
      customerId, 'Maria 0026', `m0026_${customerId.slice(0, 8)}@example.com`, '11999990000'
    ]);
    customers.push(customerId);
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo) VALUES ($1, $2, $3, $4, $5, true)`,
      [orderId, customerId, AMOUNT, status, crypto.randomUUID()]
    );
    orders.push(orderId);
    const item = await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Trattoria 0026', 'Trattoria em Casa 0026', $4, 1, $4) RETURNING id`,
      [orderId, offerId, productId, AMOUNT]
    );
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id, confirmed_at)
       VALUES ($1, $2, 'ASAAS', $3, $4, $5, true, $6, $7, $8)`,
      [`PMT-0026-${crypto.randomUUID().slice(0, 8)}`, orderId, status === 'PAID' ? 'CONFIRMED' : 'PENDING', AMOUNT, crypto.randomUUID(), crypto.randomUUID(),
       `pay_${crypto.randomUUID().slice(0, 10)}`, status === 'PAID' ? new Date(Date.now() - 60 * 60 * 1000) : null]
    );
    if (delivery) {
      await pool.query(
        `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status, download_count) VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.rows[0].id, assetId, delivery.status, delivery.downloads]
      );
    }
    return orderId;
  }

  it('lista os pedidos com pagamento e entrega; filtro "com problema"', async () => {
    const paidNoDownload = await newOrder('PAID', { status: 'ACTIVE', downloads: 0 });
    const paidDownloaded = await newOrder('PAID', { status: 'ACTIVE', downloads: 2 });
    const pending = await newOrder('PENDING');

    const all = await as(adminToken).get('/api/sales/orders?mode=demo&include_tests=true&period=all');
    expect(all.status).toBe(200);
    const byId = (id: string) => all.body.orders.find((o: any) => o.id === id);
    expect(byId(paidNoDownload).delivery_status).toBe('ACTIVE');
    expect(byId(paidNoDownload).problem).toBe(true);
    expect(byId(paidDownloaded).download_count).toBe(2);
    expect(byId(paidDownloaded).problem).toBe(false);
    expect(byId(pending).payment_status).toBe('PENDING');
    expect(byId(paidNoDownload).customer.email).toContain('@example.com');

    const problem = await as(adminToken).get('/api/sales/orders?mode=demo&include_tests=true&period=all&filter=problem');
    const ids = problem.body.orders.map((o: any) => o.id);
    expect(ids).toContain(paidNoDownload);
    expect(ids).not.toContain(paidDownloaded);
    expect(ids).not.toContain(pending);
  });

  it('perfil de análise vê nome mas não e-mail; perfil criativo não acessa', async () => {
    const r = await as(perfToken).get('/api/sales/orders?mode=demo&include_tests=true&period=all');
    expect(r.status).toBe(200);
    expect(r.body.orders[0].customer.email).toBe('[REDACTED]');
    const denied = await as(creativeToken).get('/api/sales/orders?mode=demo');
    expect(denied.status).toBe(403);
  });

  it('pedido não pago: link e reenvio recusados', async () => {
    const pending = await newOrder('PENDING');
    expect((await as(adminToken).post(`/api/sales/orders/${pending}/access-link?mode=demo`)).status).toBe(409);
    expect((await as(adminToken).post(`/api/sales/orders/${pending}/resend-access?mode=demo`)).status).toBe(409);
    const tokens = await pool.query('SELECT 1 FROM order_recovery_tokens WHERE order_id = $1', [pending]);
    expect(tokens.rows).toHaveLength(0);
  });

  it('copiar link: só ADMIN; link abre o acesso; entrega vencida é reativada', async () => {
    const orderId = await newOrder('PAID', { status: 'EXPIRED', downloads: 0 });
    expect((await as(perfToken).post(`/api/sales/orders/${orderId}/access-link?mode=demo`)).status).toBe(403);

    const r = await as(adminToken).post(`/api/sales/orders/${orderId}/access-link?mode=demo`);
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/\/acesso\/[a-f0-9]{64}$/);
    const del = await pool.query('SELECT status FROM order_deliveries WHERE order_id = $1', [orderId]);
    expect(del.rows[0].status).toBe('ACTIVE');

    const raw = r.body.url.split('/acesso/')[1];
    const stored = await pool.query('SELECT token_hash, purpose FROM order_recovery_tokens WHERE order_id = $1', [orderId]);
    expect(stored.rows[0].token_hash).not.toBe(raw);
    expect(stored.rows[0].purpose).toBe('MANUAL');
    resetAllRateLimits();
    const claim = await request(app).get('/api/checkout/recovery/' + raw);
    expect(claim.status).toBe(200);
    expect(claim.body.status).toBe('PAID');

    // novo link substitui o anterior
    const again = await as(adminToken).post(`/api/sales/orders/${orderId}/access-link?mode=demo`);
    expect(again.status).toBe(200);
    const active = await pool.query("SELECT 1 FROM order_recovery_tokens WHERE order_id = $1 AND purpose = 'MANUAL' AND status = 'ACTIVE'", [orderId]);
    expect(active.rows).toHaveLength(1);
  });

  it('reenviar acesso manda e-mail e marca como enviado; falha devolve erro claro', async () => {
    const orderId = await newOrder('PAID', { status: 'ACTIVE', downloads: 0 });
    const ok = await as(adminToken).post(`/api/sales/orders/${orderId}/resend-access?mode=demo`);
    expect(ok.status).toBe(200);
    expect(dispatchedEmailsForTesting.filter(e => e.orderId === orderId)).toHaveLength(1);
    const row = await pool.query('SELECT status FROM order_access_emails WHERE order_id = $1', [orderId]);
    expect(['SENT', 'SIMULATED']).toContain(row.rows[0].status);

    (emailService as any).setProvider({ sendPurchaseAccessEmail: async () => ({ success: false, error: 'DOWN' }) });
    const fail = await as(adminToken).post(`/api/sales/orders/${orderId}/resend-access?mode=demo`);
    expect(fail.status).toBe(502);
    // falha do reenvio manual não estraga o e-mail que já tinha saído
    const after = await pool.query('SELECT status FROM order_access_emails WHERE order_id = $1', [orderId]);
    expect(['SENT', 'SIMULATED']).toContain(after.rows[0].status);
  });

  it('conferir pagamento: pendente confirmado no Asaas vira pago', async () => {
    const orderId = await newOrder('PENDING');
    const r = await as(adminToken).post(`/api/sales/orders/${orderId}/check-payment?mode=demo`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PAID');
    expect(r.body.changed).toBe(true);
  });

  it('reemissão antiga recusa pedido não pago', async () => {
    const pending = await newOrder('PENDING');
    const r = await as(adminToken).post(`/api/admin/orders/${pending}/reissue-delivery`, { assetId });
    expect(r.status).toBe(409);
  });
});
