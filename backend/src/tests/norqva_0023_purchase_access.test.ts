// NORQVA-0023: entrega do PDF que não depende da aba do checkout.
// E-mail de acesso no PAID (uma vez por pedido), link reutilizável, webhook que falhou é reprocessado,
// a tela do comprador confirma com o Asaas e a varredura recupera o que ficou para trás.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { AsaasPaymentProvider } from '../utils/payment';
import { reconcileAndFinalizePayment, retryFailedWebhookEvent } from '../controllers/api';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { emailService, dispatchedEmailsForTesting, clearTestEmails } from '../services/emailService';
import { sendPaidOrderAccessEmail } from '../services/purchaseAccessService';
import { resetProviderCheckThrottle, shouldCheckProvider } from '../services/paymentCheckThrottle';
import { runPaymentSweep } from '../services/paymentSweepService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.ASAAS_WEBHOOK_AUTH_TOKEN = 'test_webhook_secret_token_0023';

const AMOUNT = 19.9;
const created = { orders: [] as string[], customers: [] as string[], offers: [] as string[], products: [] as string[], assets: [] as string[] };

describe.sequential('NORQVA-0023 — entrega do PDF sem depender da aba', () => {
  let pool: Pool;
  let offerId: string;
  let productId: string;
  let assetId: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);

    productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria 0023', 'Downloads', 'PLANEJADO', 'Desc', false)`,
      [productId, `PRD-0023-${productId.slice(0, 6)}`]
    );
    created.products.push(productId);
    offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria em Casa 0023', $3, $4, 'ATIVA', 'Desc', false)`,
      [offerId, `OFF-0023-${offerId.slice(0, 6)}`, productId, AMOUNT]
    );
    created.offers.push(offerId);
    assetId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, 'Livro 0023', 'SUPABASE', 'digital-products', 'books/0023.pdf', false)`,
      [assetId]
    );
    created.assets.push(assetId);
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerId, assetId]);
  });

  afterAll(async () => {
    const ids = created.orders;
    if (ids.length) {
      await pool.query('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM payment_webhook_events WHERE payment_id IN (SELECT id FROM payments WHERE order_id = ANY($1::uuid[]))', [ids]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids]);
    }
    await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [created.customers]);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [created.assets]);
  });

  let spies: any[] = [];
  beforeEach(() => {
    resetAllRateLimits();
    resetProviderCheckThrottle();
    clearTestEmails();
    (emailService as any).setProvider(null);
    spies = [
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({
        id,
        status: 'CONFIRMED',
        amount: AMOUNT
      }) as any)
    ];
  });

  afterEach(() => {
    for (const s of spies) s.mockRestore();
    (emailService as any).setProvider(null);
  });

  async function newPendingOrder(opts: { email?: string; isDemo?: boolean } = {}) {
    const isDemo = Boolean(opts.isDemo);
    const customerId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, NULL, $4)',
      [customerId, 'Comprador 0023', opts.email || `c0023_${customerId.slice(0, 8)}@example.com`, isDemo]
    );
    created.customers.push(customerId);
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo)
       VALUES ($1, $2, $3, 'PENDING', $4, $5)`,
      [orderId, customerId, AMOUNT, crypto.randomUUID(), isDemo]
    );
    created.orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Trattoria 0023', 'Trattoria em Casa — Edição Digital', $4, 1, $4)`,
      [orderId, offerId, productId, AMOUNT]
    );
    const providerPaymentId = `pay_${crypto.randomUUID().slice(0, 10)}`;
    const pay = await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', $3, $4, $5, $6, $7) RETURNING id`,
      [`PMT-0023-${crypto.randomUUID().slice(0, 8)}`, orderId, AMOUNT, crypto.randomUUID(), isDemo, crypto.randomUUID(), providerPaymentId]
    );
    return { orderId, paymentId: pay.rows[0].id as string, providerPaymentId };
  }

  async function sessionToken(orderId: string): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    await pool.query(
      `INSERT INTO order_customer_sessions (order_id, session_token_hash, status, expires_at)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 day')`,
      [orderId, hash]
    );
    return raw;
  }

  function purchaseEmailsFor(orderId: string) {
    return dispatchedEmailsForTesting.filter(e => e.orderId === orderId && e.kind === 'PURCHASE');
  }

  test('A: pagamento confirmado envia o e-mail de acesso uma única vez', async () => {
    const { orderId, paymentId } = await newPendingOrder();

    await reconcileAndFinalizePayment(paymentId, pool);
    await reconcileAndFinalizePayment(paymentId, pool); // repetição (webhook duplicado, varredura)

    const order = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(order.rows[0].status).toBe('PAID');
    expect(purchaseEmailsFor(orderId)).toHaveLength(1);
    const email = purchaseEmailsFor(orderId)[0];
    expect(email.recoveryUrl).toMatch(/\/acesso\/[a-f0-9]{64}$/);

    const row = await pool.query('SELECT status, attempts FROM order_access_emails WHERE order_id = $1', [orderId]);
    expect(row.rows[0].status).toBe('SIMULATED');
    expect(row.rows[0].attempts).toBe(1);

    const tok = await pool.query("SELECT purpose, max_uses, status FROM order_recovery_tokens WHERE order_id = $1", [orderId]);
    expect(tok.rows).toHaveLength(1);
    expect(tok.rows[0].purpose).toBe('PURCHASE');
    expect(tok.rows[0].max_uses).toBeGreaterThan(1);
  });

  test('B: pedido não pago não recebe e-mail nem link', async () => {
    const { orderId } = await newPendingOrder();
    const out = await sendPaidOrderAccessEmail(pool, orderId);
    expect(out.status).toBe('SKIPPED');
    expect(purchaseEmailsFor(orderId)).toHaveLength(0);
    const tok = await pool.query('SELECT 1 FROM order_recovery_tokens WHERE order_id = $1', [orderId]);
    expect(tok.rows).toHaveLength(0);
  });

  test('C: o link do e-mail de compra abre mais de uma vez; a recuperação continua de uso único', async () => {
    const { orderId, paymentId } = await newPendingOrder();
    await reconcileAndFinalizePayment(paymentId, pool);
    const raw = purchaseEmailsFor(orderId)[0].recoveryUrl.split('/acesso/')[1];

    const first = await request(app).get('/api/checkout/recovery/' + raw);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('PAID');
    resetAllRateLimits();
    const second = await request(app).get('/api/checkout/recovery/' + raw);
    expect(second.status).toBe(200);

    // Recuperação comum (max_uses padrão 1) continua de uso único
    const rec = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at)
       VALUES ($1, $2, 'ACTIVE', NOW() + INTERVAL '1 day')`,
      [orderId, crypto.createHash('sha256').update(rec).digest('hex')]
    );
    resetAllRateLimits();
    expect((await request(app).get('/api/checkout/recovery/' + rec)).status).toBe(200);
    resetAllRateLimits();
    expect((await request(app).get('/api/checkout/recovery/' + rec)).status).toBe(410);
  });

  test('D: falha de envio fica FAILED, o link é revogado e a nova tentativa respeita o limite', async () => {
    const { orderId, paymentId } = await newPendingOrder();
    (emailService as any).setProvider({
      sendPurchaseAccessEmail: async () => ({ success: false, error: 'PROVIDER_DOWN' })
    });
    await reconcileAndFinalizePayment(paymentId, pool);

    let row = await pool.query('SELECT status, attempts, error_code FROM order_access_emails WHERE order_id = $1', [orderId]);
    expect(row.rows[0].status).toBe('FAILED');
    expect(row.rows[0].error_code).toBe('PROVIDER_DOWN');
    const revoked = await pool.query("SELECT status FROM order_recovery_tokens WHERE order_id = $1", [orderId]);
    expect(revoked.rows.every((r: any) => r.status === 'REVOKED')).toBe(true);

    (emailService as any).setProvider(null);
    const retry = await sendPaidOrderAccessEmail(pool, orderId);
    expect(retry.status).toBe('SIMULATED');
    row = await pool.query('SELECT status, attempts FROM order_access_emails WHERE order_id = $1', [orderId]);
    expect(row.rows[0].status).toBe('SIMULATED');
    expect(row.rows[0].attempts).toBe(2);

    // já enviado: não envia de novo
    expect((await sendPaidOrderAccessEmail(pool, orderId)).status).toBe('SKIPPED');
  });

  test('E: webhook que falhou é reprocessado quando o mesmo evento chega de novo', async () => {
    const { orderId, paymentId, providerPaymentId } = await newPendingOrder();
    spies[1].mockRejectedValueOnce(new Error('Asaas fora do ar'));
    const body = { event: 'PAYMENT_RECEIVED', payment: { id: providerPaymentId, externalReference: paymentId } };

    const first = await request(app).post('/api/webhooks/asaas')
      .set('asaas-access-token', process.env.ASAAS_WEBHOOK_AUTH_TOKEN as string).send(body);
    expect(first.status).toBe(200);
    expect(first.body.processed).toBe(false);
    let ev = await pool.query('SELECT processing_status FROM payment_webhook_events WHERE payment_id = $1', [paymentId]);
    expect(ev.rows[0].processing_status).toBe('FAILED');
    expect((await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status).toBe('PENDING');

    resetAllRateLimits();
    const again = await request(app).post('/api/webhooks/asaas')
      .set('asaas-access-token', process.env.ASAAS_WEBHOOK_AUTH_TOKEN as string).send(body);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    ev = await pool.query('SELECT processing_status, retry_count FROM payment_webhook_events WHERE payment_id = $1', [paymentId]);
    expect(ev.rows[0].processing_status).toBe('PROCESSED');
    expect(ev.rows[0].retry_count).toBe(1);
    expect((await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status).toBe('PAID');

    // evento já processado não é refeito
    resetAllRateLimits();
    expect(await retryFailedWebhookEvent(pool, providerPaymentId + '_PAYMENT_RECEIVED', 'PAYMENT_RECEIVED', paymentId)).toBeNull();
  });

  test('F: a verificação da tela confirma com o Asaas quando o webhook não chegou', async () => {
    const { orderId } = await newPendingOrder();
    const token = await sessionToken(orderId);
    spies[1].mockImplementation(async (id: string) => ({ id, status: 'PENDING', amount: AMOUNT }) as any);

    const pendingRes = await request(app).get('/api/orders/' + orderId).set('x-checkout-token', token);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.status).toBe('PENDING');

    // Pagou no banco; o webhook não chegou. Depois do intervalo, a tela consulta o Asaas de novo.
    spies[1].mockImplementation(async (id: string) => ({ id, status: 'RECEIVED', amount: AMOUNT }) as any);
    resetProviderCheckThrottle();
    resetAllRateLimits();
    const paidRes = await request(app).get('/api/orders/' + orderId).set('x-checkout-token', token);
    expect(paidRes.body.status).toBe('PAID');
    expect(purchaseEmailsFor(orderId)).toHaveLength(1);

    // A tela de entrega diz a verdade sobre o e-mail
    resetAllRateLimits();
    const tokens = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(tokens.status).toBe(200);
    expect(tokens.body.accessEmailSent).toBe(true);
  });

  test('G: pagamento não confirmado no Asaas não libera nada pela tela', async () => {
    const { orderId } = await newPendingOrder();
    const token = await sessionToken(orderId);
    spies[1].mockImplementation(async (id: string) => ({ id, status: 'PENDING', amount: AMOUNT }) as any);
    const res = await request(app).get('/api/orders/' + orderId).set('x-checkout-token', token);
    expect(res.body.status).toBe('PENDING');
    resetAllRateLimits();
    const tokens = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(tokens.status).toBe(403);
    expect(purchaseEmailsFor(orderId)).toHaveLength(0);
  });

  test('H: pedidos de demonstração não consultam o Asaas pela tela', async () => {
    const { orderId } = await newPendingOrder({ isDemo: true });
    const token = await sessionToken(orderId);
    const res = await request(app).get('/api/orders/' + orderId).set('x-checkout-token', token);
    expect(res.body.status).toBe('PENDING');
    expect(spies[1]).not.toHaveBeenCalled();
  });

  test('I: varredura reprocessa webhook que falhou e envia e-mail que faltou', async () => {
    const { orderId, paymentId, providerPaymentId } = await newPendingOrder();
    await pool.query(
      `INSERT INTO payment_webhook_events (provider, provider_environment, external_event_id, event_type, provider_payment_id, payment_id, payload_hash, is_demo, processing_status)
       VALUES ('ASAAS', 'sandbox', $1, 'PAYMENT_CONFIRMED', $2, $3, 'h', false, 'FAILED')`,
      [providerPaymentId + '_PAYMENT_CONFIRMED', providerPaymentId, paymentId]
    );
    const sent: string[] = [];
    const r = await runPaymentSweep(pool, {
      reconcile: reconcileAndFinalizePayment,
      retryWebhookEvent: retryFailedWebhookEvent,
      sendAccessEmail: async (_p, id) => { sent.push(id); return { status: 'SKIPPED', reason: 'TEST' }; }
    });
    expect(r.webhooksRetried).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status).toBe('PAID');
    const ev = await pool.query('SELECT processing_status FROM payment_webhook_events WHERE payment_id = $1', [paymentId]);
    expect(ev.rows[0].processing_status).toBe('PROCESSED');

    // pedido pago com e-mail que falhou volta a ser tentado
    await pool.query("UPDATE order_access_emails SET status = 'FAILED', attempts = 1 WHERE order_id = $1", [orderId]);
    const r2 = await runPaymentSweep(pool, {
      reconcile: reconcileAndFinalizePayment,
      retryWebhookEvent: retryFailedWebhookEvent,
      sendAccessEmail: async (_p, id) => { sent.push(id); return { status: 'SKIPPED', reason: 'TEST' }; }
    });
    expect(r2.emailsAttempted).toBeGreaterThanOrEqual(1);
    expect(sent).toContain(orderId);
  });

  test('J: limite de consultas ao Asaas por pagamento', () => {
    resetProviderCheckThrottle();
    expect(shouldCheckProvider('p1', 15000, 1000)).toBe(true);
    expect(shouldCheckProvider('p1', 15000, 5000)).toBe(false);
    expect(shouldCheckProvider('p1', 15000, 17000)).toBe(true);
  });
});
