// NORQVA-0038: cartão de crédito parcelado no Asaas (página segura do Asaas), entrega na confirmação e
// bloqueio em estorno/contestação. O Asaas é sempre simulado aqui.
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
import { emailService, clearTestEmails } from '../services/emailService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'test_webhook_secret_token_0038';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0038';

const WEBHOOK = 'test_webhook_secret_token_0038';

describe.sequential('NORQVA-0038 — cartão de crédito e kit', () => {
  let pool: Pool;
  let adminToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const kitOffer = crypto.randomUUID();
  const pixOnlyOffer = crypto.randomUUID();
  const assetA = crypto.randomUUID();
  const assetB = crypto.randomUUID();
  const orders: string[] = [];
  const customers: string[] = [];
  const spies: any[] = [];
  let installmentTotal = 27.96;
  let providerStatus = 'CONFIRMED';

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    put: (url: string, body: any = {}) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body)
  });

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.norqva0038@norqva.test', 'Admin 0038', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });

    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Kit 0038', 'Receitas', 'Fixture', 'PLANEJADO', true)`,
      [productId, `PRD-K${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo)
       VALUES ($1, $2, 'Kit Cozinha Italiana 0038', $3, 34.80, 27.90, 'ATIVA', 'Fixture', true)`,
      [kitOffer, `OFF-K${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Só Pix 0038', $3, 19.90, 'ATIVA', 'Fixture', true)`,
      [pixOnlyOffer, `OFF-P${tag}`, productId]
    );
    for (const [id, path] of [[assetA, 'books/0038-a.pdf'], [assetB, 'books/0038-b.pdf']]) {
      await pool.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, true)`,
        [id, path, path]
      );
    }
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2), ($1, $3)', [kitOffer, assetA, assetB]);
  });

  afterAll(async () => {
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM payment_webhook_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id = ANY($1::uuid[]))', [orders]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_access_emails WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_recovery_tokens WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM payment_provider_customers WHERE customer_id = ANY($1::uuid[])', [customers]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await q('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [[kitOffer, pixOnlyOffer]]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [[assetA, assetB]]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    clearTestEmails();
    (emailService as any).setProvider(null);
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0038'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCardPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({
        status: providerStatus,
        amount: 6.99,
        netAmount: 6.6,
        installmentId: 'ins_0038'
      }) as any),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getInstallmentTotals').mockImplementation(async () => ({ total: installmentTotal, netTotal: 26.4, count: 4 }))
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  async function newOrder(offerId: string) {
    const cid = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [cid, 'Ana 0038', `a0038_${cid.slice(0, 8)}@example.com`, '11999990000']);
    customers.push(cid);
    const r = await request(app)
      .post('/api/checkout?mode=demo')
      .send({ offer_id: offerId, customer_id: cid, quantity: 1, idempotency_key: crypto.randomUUID() });
    expect(r.status).toBe(201);
    orders.push(r.body.id);
    return { id: r.body.id as string, token: r.body.checkout_token as string };
  }

  const pay = (o: { id: string; token: string }, method: 'card' | 'pix') =>
    request(app).post(`/api/checkout/orders/${o.id}/${method}`).set('x-checkout-token', o.token).send({ idempotency_key: crypto.randomUUID() });

  const hook = (event: string, payment: any) =>
    request(app).post('/api/webhooks/asaas').set('asaas-access-token', WEBHOOK).send({ event, payment });

  it('o editor recusa parcelas fora de 1–12, total menor que o Pix e parcelas desiguais', async () => {
    const url = `/api/offers/${kitOffer}?mode=demo`;
    expect((await as(adminToken).put(url, { card_enabled: true, card_max_installments: 13 })).status).toBe(400);
    expect((await as(adminToken).put(url, { card_enabled: true, card_max_installments: 4, card_total_price: 20 })).status).toBe(400);
    const uneven = await as(adminToken).put(url, { card_enabled: true, card_max_installments: 4, card_total_price: 27.9 });
    expect(uneven.status).toBe(400);
    expect(uneven.body.error).toMatch(/27,92/);
    const ok = await as(adminToken).put(url, { card_enabled: true, card_max_installments: 4, card_total_price: 27.96 });
    expect(ok.status).toBe(200);
    expect(ok.body.offer.card_enabled).toBe(true);
  });

  it('a oferta pública mostra o parcelamento exato; sem cartão, null', async () => {
    const r = await request(app).get(`/api/public/offers/OFF-K${tag}`);
    expect(r.status).toBe(200);
    expect(r.body.card).toEqual({ max_installments: 4, total: 27.96, installment_value: 6.99 });
    const p = await request(app).get(`/api/public/offers/OFF-P${tag}`);
    expect(p.body.card).toBeNull();
  });

  it('oferta sem cartão recusa a cobrança de cartão', async () => {
    const o = await newOrder(pixOnlyOffer);
    const r = await pay(o, 'card');
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('CARD_NOT_ENABLED');
  });

  let cardOrder: { id: string; token: string };
  it('cria a cobrança parcelada no Asaas com o valor do servidor e devolve a página segura', async () => {
    const create = vi.spyOn(AsaasPaymentProvider.prototype, 'createCardPayment').mockResolvedValue({
      providerPaymentId: 'pay_0038_1',
      installmentId: 'ins_0038',
      invoiceUrl: 'https://sandbox.asaas.com/i/abc',
      dueDate: '2026-10-11',
      status: 'PENDING'
    });
    spies.push(create);
    cardOrder = await newOrder(kitOffer);
    const r = await pay(cardOrder, 'card');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ payment_method: 'CREDIT_CARD', invoice_url: 'https://sandbox.asaas.com/i/abc', installments: 4, installment_value: 6.99, amount: 27.96 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 27.96, installments: 4, providerCustomerId: 'cus_0038' }));
    const row = (await pool.query('SELECT * FROM payments WHERE order_id = $1', [cardOrder.id])).rows[0];
    expect(row).toMatchObject({ payment_method: 'CREDIT_CARD', status: 'PENDING', provider_installment_id: 'ins_0038', installment_count: 4 });
    expect(Number(row.amount)).toBe(27.96);
  });

  it('o mesmo pedido não troca para Pix no meio do caminho', async () => {
    const r = await pay(cardOrder, 'pix');
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYMENT_METHOD_LOCKED', payment_method: 'CREDIT_CARD' });
  });

  it('parcela confirmada sem a nossa referência: acha pelo parcelamento, confere o total e libera os dois PDFs', async () => {
    installmentTotal = 27.96;
    providerStatus = 'CONFIRMED';
    const r = await hook('PAYMENT_CONFIRMED', { id: 'pay_0038_2', installment: 'ins_0038' });
    expect(r.status).toBe(200);
    expect(r.body.processed).toBe(true);
    const o = (await pool.query('SELECT status FROM orders WHERE id = $1', [cardOrder.id])).rows[0];
    expect(o.status).toBe('PAID');
    const d = await pool.query("SELECT asset_id FROM order_deliveries WHERE order_id = $1 AND status = 'ACTIVE'", [cardOrder.id]);
    expect(d.rows.map((x: any) => x.asset_id).sort()).toEqual([assetA, assetB].sort());
    const p = (await pool.query('SELECT net_amount, provider_fee FROM payments WHERE order_id = $1', [cardOrder.id])).rows[0];
    expect(Number(p.net_amount)).toBe(26.4);
    expect(Number(p.provider_fee)).toBe(1.56);
  });

  it('contestação bloqueia os downloads e uma confirmação posterior não reativa', async () => {
    const r = await hook('PAYMENT_CHARGEBACK_REQUESTED', { id: 'pay_0038_1', installment: 'ins_0038' });
    expect(r.status).toBe(200);
    const o = (await pool.query('SELECT status FROM orders WHERE id = $1', [cardOrder.id])).rows[0];
    expect(o.status).toBe('REFUNDED');
    const active = await pool.query("SELECT COUNT(*)::int AS n FROM order_deliveries WHERE order_id = $1 AND status = 'ACTIVE'", [cardOrder.id]);
    expect(active.rows[0].n).toBe(0);
    const tokens = await request(app).get(`/api/checkout/orders/${cardOrder.id}/delivery-tokens`).set('x-checkout-token', cardOrder.token);
    expect(tokens.status).not.toBe(200);

    const again = await hook('PAYMENT_RECEIVED', { id: 'pay_0038_3', installment: 'ins_0038' });
    expect(again.status).toBe(200);
    const after = (await pool.query('SELECT status FROM orders WHERE id = $1', [cardOrder.id])).rows[0];
    expect(after.status).toBe('REFUNDED');
  });

  it('total do parcelamento diferente do cobrado: não libera', async () => {
    const create = vi.spyOn(AsaasPaymentProvider.prototype, 'createCardPayment').mockResolvedValue({
      providerPaymentId: 'pay_0038_x1',
      installmentId: 'ins_0038_x',
      invoiceUrl: 'https://sandbox.asaas.com/i/x',
      dueDate: '2026-10-11',
      status: 'PENDING'
    });
    spies.push(create);
    const o = await newOrder(kitOffer);
    expect((await pay(o, 'card')).status).toBe(201);
    installmentTotal = 20;
    const r = await hook('PAYMENT_CONFIRMED', { id: 'pay_0038_x1', installment: 'ins_0038_x' });
    expect(r.status).toBe(200);
    const ord = (await pool.query('SELECT status FROM orders WHERE id = $1', [o.id])).rows[0];
    expect(ord.status).toBe('PENDING');
    const d = await pool.query('SELECT COUNT(*)::int AS n FROM order_deliveries WHERE order_id = $1', [o.id]);
    expect(d.rows[0].n).toBe(0);
    installmentTotal = 27.96;
  });

  it('parcela de um parcelamento que não é nosso: responde 200 sem fazer nada', async () => {
    const r = await hook('PAYMENT_CONFIRMED', { id: 'pay_alheio', installment: 'ins_alheio' });
    expect(r.status).toBe(200);
    expect(r.body.ignored).toBe(true);
  });

  it('Pix continua igual e informa o meio de pagamento', async () => {
    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
      providerPaymentId: 'pay_0038_pix',
      pixCopyPaste: '000201pix',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'PENDING',
      qrCodeImage: null
    });
    spies.push(pix);
    const o = await newOrder(kitOffer);
    const r = await pay(o, 'pix');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ payment_method: 'PIX', pix_copy_paste: '000201pix', amount: 27.9 });
    expect(pix).toHaveBeenCalledWith(expect.objectContaining({ amount: 27.9 }));
  });
});
