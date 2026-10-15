// NORQVA-0074: lembrete de pagamento para pedidos pendentes (15 min, 2 h, 20 h).
import { describe, test, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { runPaymentReminders, dueStep, firstName } from '../services/paymentReminderService';
import { buildPaymentReminderEmail } from '../services/resendProvider';
import { SendPaymentReminderEmailParams } from '../services/emailService';

const created = { orders: [] as string[], customers: [] as string[] };
const MIN = 60 * 1000;

describe.sequential('NORQVA-0074 — lembrete de Pix pendente', () => {
  let pool: Pool;
  let offerId: string;
  let offerHumanId: string;
  let productId: string;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria 0074', 'Downloads', 'PLANEJADO', 'Desc', false)`,
      [productId, `PRD-0074-${productId.slice(0, 6)}`]
    );
    offerId = crypto.randomUUID();
    offerHumanId = `OFF-0074-${offerId.slice(0, 6)}`;
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
       VALUES ($1, $2, 'Trattoria em Casa 0074', $3, 19.90, 'ATIVA', 'Desc', false)`,
      [offerId, offerHumanId, productId]
    );
  });

  afterAll(async () => {
    const ids = created.orders;
    if (ids.length) {
      await pool.query('DELETE FROM order_payment_reminders WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids]);
    }
    if (created.customers.length) await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [created.customers]);
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]);
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  });

  afterEach(() => {
    delete process.env.PAYMENT_REMINDER_ENABLED;
  });

  async function newCustomer(name = 'maria DA silva') {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, NULL, false)', [id, name, `c0074_${id.slice(0, 8)}@example.com`]);
    created.customers.push(id);
    return id;
  }

  async function newOrder(opts: { customerId?: string; ageMin: number; status?: string; provenance?: string; isDemo?: boolean; method?: 'PIX' | 'CREDIT_CARD'; pixExpiresInMin?: number }) {
    const customerId = opts.customerId || (await newCustomer());
    const orderId = crypto.randomUUID();
    const createdAt = new Date(Date.now() - opts.ageMin * MIN).toISOString();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance, created_at)
       VALUES ($1, $2, 19.90, $3, $4, $5, $6, $7)`,
      [orderId, customerId, opts.status || 'PENDING', crypto.randomUUID(), Boolean(opts.isDemo), opts.provenance || 'COMMERCIAL_PRODUCTION', createdAt]
    );
    created.orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Trattoria 0074', 'Trattoria em Casa', 19.90, 1, 19.90)`,
      [orderId, offerId, productId]
    );
    const method = opts.method || 'PIX';
    const expiresAt = new Date(Date.now() + (opts.pixExpiresInMin ?? 600) * MIN).toISOString();
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id,
                             payment_method, pix_copy_paste, expires_at, invoice_url, created_at)
       VALUES ($1, $2, 'ASAAS', 'PENDING', 19.90, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `PMT-0074-${crypto.randomUUID().slice(0, 8)}`, orderId, crypto.randomUUID(), Boolean(opts.isDemo), crypto.randomUUID(),
        `pay_${crypto.randomUUID().slice(0, 10)}`, method,
        method === 'PIX' ? '00020126PIXCODE0074' : null,
        method === 'PIX' ? expiresAt : null,
        method === 'CREDIT_CARD' ? 'https://www.asaas.com/i/abc0074' : null,
        createdAt
      ]
    );
    return orderId;
  }

  function collector() {
    const sent: SendPaymentReminderEmailParams[] = [];
    return { sent, send: async (p: SendPaymentReminderEmailParams) => { sent.push(p); return { success: true }; } };
  }

  test('etapas: 15 min, 2 h e 20 h', () => {
    expect(dueStep(10)).toBe(0);
    expect(dueStep(15)).toBe(1);
    expect(dueStep(119)).toBe(1);
    expect(dueStep(120)).toBe(2);
    expect(dueStep(20 * 60)).toBe(3);
    expect(firstName('maria DA silva')).toBe('Maria');
    expect(firstName('')).toBe('');
  });

  test('A: pedido de 20 min recebe a etapa 1 com o código Pix, uma vez só', async () => {
    const id = await newOrder({ ageMin: 20 });
    const c = collector();
    const r = await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(r.sent).toBe(1);
    expect(c.sent[0].step).toBe(1);
    expect(c.sent[0].pixCopyPaste).toBe('00020126PIXCODE0074');
    expect(c.sent[0].firstName).toBe('Maria');
    expect(c.sent[0].offerUrl).toContain(`/p/${offerHumanId}`);
    const again = await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(again.sent).toBe(0);
    const rows = await pool.query('SELECT step, status FROM order_payment_reminders WHERE order_id = $1', [id]);
    expect(rows.rows).toEqual([{ step: 1, status: 'SENT' }]);
  });

  test('B: depois de 2 h vem a etapa 2', async () => {
    const id = await newOrder({ ageMin: 20 });
    const c = collector();
    await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    await pool.query("UPDATE orders SET created_at = NOW() - INTERVAL '3 hours' WHERE id = $1", [id]);
    await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent.map(s => s.step)).toEqual([1, 2]);
  });

  test('C: Pix vencido manda para a página gerar outro (etapa 3, sem código)', async () => {
    const id = await newOrder({ ageMin: 21 * 60, pixExpiresInMin: -60 });
    const c = collector();
    await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent).toHaveLength(1);
    expect(c.sent[0].step).toBe(3);
    expect(c.sent[0].pixCopyPaste).toBeNull();
    const row = await pool.query('SELECT pix_expired FROM order_payment_reminders WHERE order_id = $1', [id]);
    expect(row.rows[0].pix_expired).toBe(true);
  });

  test('D: cartão recebe o link da página segura do Asaas', async () => {
    const id = await newOrder({ ageMin: 30, method: 'CREDIT_CARD' });
    const c = collector();
    await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent[0].invoiceUrl).toBe('https://www.asaas.com/i/abc0074');
  });

  test('E: não manda para teste, demo, pago, recente, antigo ou quem pagou outro pedido', async () => {
    const demo = await newOrder({ ageMin: 30, isDemo: true, provenance: 'STAGING_SANDBOX_QA' });
    const qa = await newOrder({ ageMin: 30, provenance: 'STAGING_SANDBOX_QA' });
    const paid = await newOrder({ ageMin: 30, status: 'PAID' });
    const recent = await newOrder({ ageMin: 5 });
    const old = await newOrder({ ageMin: 31 * 60 });
    const buyer = await newCustomer('Joana');
    const pendingThenPaid = await newOrder({ customerId: buyer, ageMin: 40 });
    await newOrder({ customerId: buyer, ageMin: 35, status: 'PAID' });
    const c = collector();
    const r = await runPaymentReminders(pool, { send: c.send, orderIds: [demo, qa, paid, recent, old, pendingThenPaid] });
    expect(r.sent).toBe(0);
    expect(c.sent).toHaveLength(0);
  });

  test('F: com dois pendentes do mesmo comprador, só o mais novo recebe', async () => {
    const buyer = await newCustomer('Ana');
    const older = await newOrder({ customerId: buyer, ageMin: 50 });
    const newer = await newOrder({ customerId: buyer, ageMin: 30 });
    const c = collector();
    await runPaymentReminders(pool, { send: c.send, orderIds: [older, newer] });
    expect(c.sent.map(s => s.orderId)).toEqual([newer]);
  });

  test('G: falha no envio fica registrada e não repete a etapa', async () => {
    const id = await newOrder({ ageMin: 20 });
    const r = await runPaymentReminders(pool, { send: async () => ({ success: false, error: 'X' }), orderIds: [id] });
    expect(r.failed).toBe(1);
    const row = await pool.query('SELECT status, error FROM order_payment_reminders WHERE order_id = $1', [id]);
    expect(row.rows[0]).toEqual({ status: 'FAILED', error: 'X' });
    const c = collector();
    await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent).toHaveLength(0);
  });

  test('H: PAYMENT_REMINDER_ENABLED=false desliga', async () => {
    process.env.PAYMENT_REMINDER_ENABLED = 'false';
    const id = await newOrder({ ageMin: 20 });
    const c = collector();
    const r = await runPaymentReminders(pool, { send: c.send, orderIds: [id] });
    expect(r.sent).toBe(0);
  });

  test('I: e-mail com Pix válido, cartão e Pix vencido', () => {
    const base = { email: 'a@b.c', firstName: 'Maria', offerName: 'Trattoria em Casa', amount: 19.9, offerUrl: 'https://x.test/p/OFF-1' };
    const now = new Date('2026-10-15T15:00:00Z');
    const pix = buildPaymentReminderEmail({ ...base, step: 1, pixCopyPaste: '000201ABC<script>', pixExpiresAt: '2026-10-16T02:59:00Z' }, now);
    expect(pix.subject).toContain('Trattoria em Casa');
    expect(pix.text).toContain('000201ABC<script>');
    expect(pix.html).toContain('000201ABC&lt;script&gt;');
    expect(pix.html).not.toContain('<script>');
    expect(pix.text).toContain('R$ 19,90');
    const card = buildPaymentReminderEmail({ ...base, step: 2, invoiceUrl: 'https://www.asaas.com/i/1' }, now);
    expect(card.html).toContain('Concluir pagamento');
    const expired = buildPaymentReminderEmail({ ...base, step: 3, pixCopyPaste: '000201', pixExpiresAt: '2026-10-15T10:00:00Z' }, now);
    expect(expired.html).toContain('Gerar novo Pix');
    expect(expired.subject).toContain('Último lembrete');
  });
});
