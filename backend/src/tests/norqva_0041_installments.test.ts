// NORQVA-0041: o comprador escolhe as parcelas; juros acima das sem juros. O Asaas é sempre simulado aqui.
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
import { installmentOptions, installmentOption, planFromOffer } from '../services/commerce/cardInstallments';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'test_webhook_secret_token_0041';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0041';

const WEBHOOK = 'test_webhook_secret_token_0041';

describe.sequential('NORQVA-0041 — parcelamento escolhido pelo comprador', () => {
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
       VALUES (gen_random_uuid(), $1, 'admin.norqva0041@norqva.test', 'Admin 0041', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });

    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Kit 0041', 'Receitas', 'Fixture', 'PLANEJADO', true)`,
      [productId, `PRD-K${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo)
       VALUES ($1, $2, 'Kit Cozinha Italiana 0041', $3, 34.80, 27.90, 'ATIVA', 'Fixture', true)`,
      [kitOffer, `OFF-K${tag}`, productId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Só Pix 0041', $3, 19.90, 'ATIVA', 'Fixture', true)`,
      [pixOnlyOffer, `OFF-P${tag}`, productId]
    );
    for (const [id, path] of [[assetA, 'books/0041-a.pdf'], [assetB, 'books/0041-b.pdf']]) {
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
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0041'),
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
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [cid, 'Ana 0041', `a0041_${cid.slice(0, 8)}@example.com`, '11999990000']);
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

  it('tabela: 4x sem juros e 5x/6x com 2,99% ao mês; 7x fica abaixo de R$ 5,00', () => {
    const plan = { max: 12, free: 4, rate: 2.99 };
    const opts = installmentOptions(2796, plan);
    expect(opts.map(o => [o.n, o.valueCents, o.totalCents, o.interest])).toEqual([
      [1, 2796, 2796, false], [2, 1398, 2796, false], [3, 932, 2796, false], [4, 699, 2796, false],
      [5, 611, 3055, true], [6, 516, 3096, true]
    ]);
    expect(installmentOption(2796, 7, plan)).toBeNull();
    expect(planFromOffer({ card_max_installments: 4, card_free_installments: null })).toEqual({ max: 4, free: 4, rate: 0 });
  });

  it('o editor exige juros quando há parcelas acima das sem juros', async () => {
    const url = `/api/offers/${kitOffer}?mode=demo`;
    const noRate = await as(adminToken).put(url, { card_enabled: true, card_max_installments: 12, card_free_installments: 4, card_total_price: 27.96, card_interest_monthly: 0 });
    expect(noRate.status).toBe(400);
    const ok = await as(adminToken).put(url, { card_enabled: true, card_max_installments: 12, card_free_installments: 4, card_total_price: 27.96, card_interest_monthly: 2.99 });
    expect(ok.status).toBe(200);
  });

  it('a oferta pública lista as opções e anuncia 4x sem juros', async () => {
    const r = await request(app).get(`/api/public/offers/OFF-K${tag}`);
    expect(r.body.card).toMatchObject({ max_installments: 4, installment_value: 6.99, total: 27.96, interest_monthly: 2.99 });
    expect(r.body.card.options.map((o: any) => o.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.body.card.options[5]).toEqual({ n: 6, installment_value: 5.16, total: 30.96, interest: true });
  });

  it('6x cobra o total com juros calculado no servidor; 7x é recusado', async () => {
    const create = vi.spyOn(AsaasPaymentProvider.prototype, 'createCardPayment').mockResolvedValue({
      providerPaymentId: 'pay_0041_1', installmentId: 'ins_0041', invoiceUrl: 'https://sandbox.asaas.com/i/z', dueDate: '2026-10-11', status: 'PENDING'
    });
    spies.push(create);
    const bad = await newOrder(kitOffer);
    const r7 = await request(app).post(`/api/checkout/orders/${bad.id}/card`).set('x-checkout-token', bad.token).send({ idempotency_key: crypto.randomUUID(), installments: 7 });
    expect(r7.status).toBe(400);
    expect(r7.body.code).toBe('INVALID_INSTALLMENTS');
    const o = await newOrder(kitOffer);
    const r = await request(app).post(`/api/checkout/orders/${o.id}/card`).set('x-checkout-token', o.token).send({ idempotency_key: crypto.randomUUID(), installments: 6, amount: 1 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ installments: 6, installment_value: 5.16, amount: 30.96, interest: true });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 30.96, installments: 6 }));
  });

  it('3x sem juros cobra o total do cartão', async () => {
    const create = vi.spyOn(AsaasPaymentProvider.prototype, 'createCardPayment').mockResolvedValue({
      providerPaymentId: 'pay_0041_2', installmentId: 'ins_0041b', invoiceUrl: 'https://sandbox.asaas.com/i/y', dueDate: '2026-10-11', status: 'PENDING'
    });
    spies.push(create);
    const o = await newOrder(kitOffer);
    const r = await request(app).post(`/api/checkout/orders/${o.id}/card`).set('x-checkout-token', o.token).send({ idempotency_key: crypto.randomUUID(), installments: 3 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ installments: 3, installment_value: 9.32, amount: 27.96, interest: false });
  });
});
