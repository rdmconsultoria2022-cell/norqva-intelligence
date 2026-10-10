// NORQVA-0046 etapa 2: pedido feito pelo WhatsApp recebe o acesso na conversa quando o Asaas confirma.
// Asaas e WhatsApp simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { AsaasPaymentProvider } from '../utils/payment';
import { reconcileAndFinalizePayment } from '../controllers/api';
import { emailService, clearTestEmails } from '../services/emailService';
import { resetProviderCheckThrottle } from '../services/paymentCheckThrottle';
import { setWhatsAppProviderForTests, WhatsAppProvider } from '../services/whatsapp/provider';
import { sendPaidOrderWhatsApp } from '../services/whatsapp/whatsappDelivery';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';

const AMOUNT = 27.9;

describe.sequential('NORQVA-0046 — entrega pelo WhatsApp', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6);
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  let numberId = '';
  const orders: string[] = [];
  const customers: string[] = [];
  const sendText = vi.fn(async () => ({ id: `W-${crypto.randomUUID()}` }));
  const provider = {
    createInstance: vi.fn(), connect: vi.fn(), info: vi.fn(), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText, sendImage: vi.fn()
  } as unknown as WhatsAppProvider;
  let spies: any[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Kit 0046', 'Receitas', 'x', 'PLANEJADO', false)`, [productId, `PRD-W${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Kit Cozinha Italiana', $3, $4, 'ATIVA', 'x', false)`, [offerId, `OFF-W${tag}`, productId, AMOUNT]);
    await pool.query(`INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, 'Livro 0046', 'SUPABASE', 'digital-products', 'books/0046.pdf', false)`, [assetId]);
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerId, assetId]);
    const n = await pool.query(
      `INSERT INTO whatsapp_numbers (label, instance_name, webhook_secret_hash, status, phone) VALUES ('T0046 entrega', $1, 'x', 'CONNECTED', '5511900000000') RETURNING id`,
      [`t46d-${tag}`]
    );
    numberId = n.rows[0].id;
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    if (!pool) return;
    if (orders.length) {
      await pool.query('DELETE FROM whatsapp_order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM order_recovery_tokens WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM order_access_emails WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    }
    await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await pool.query('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [assetId]);
  });

  beforeEach(() => {
    resetProviderCheckThrottle();
    clearTestEmails();
    (emailService as any).setProvider(null);
    sendText.mockClear();
    setWhatsAppProviderForTests(provider);
    spies = [
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({ id, status: 'CONFIRMED', amount: AMOUNT }) as any)
    ];
  });

  afterEach(() => {
    for (const s of spies) s.mockRestore();
  });

  async function whatsappOrder(mode: 'BOT' | 'OPTED_OUT' = 'BOT') {
    const jid = `55219${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`;
    const conv = await pool.query(
      `INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_name, mode) VALUES ($1, $2, 'Maria Souza', $3) RETURNING id`,
      [numberId, jid, mode]
    );
    const customerId = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, NULL, false)', [customerId, 'Maria Souza', `w0046_${customerId.slice(0, 8)}@example.com`]);
    customers.push(customerId);
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, whatsapp_conversation_id) VALUES ($1, $2, $3, 'PENDING', $4, false, $5)`,
      [orderId, customerId, AMOUNT, crypto.randomUUID(), conv.rows[0].id]
    );
    orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Kit 0046', 'Kit Cozinha Italiana', $4, 1, $4)`,
      [orderId, offerId, productId, AMOUNT]
    );
    const pay = await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', $3, $4, false, $5, $6) RETURNING id`,
      [`PMT-W46-${crypto.randomUUID().slice(0, 8)}`, orderId, AMOUNT, crypto.randomUUID(), crypto.randomUUID(), `pay_${crypto.randomUUID().slice(0, 10)}`]
    );
    return { orderId, paymentId: pay.rows[0].id as string, convId: conv.rows[0].id as string, jid };
  }

  it('não manda nada antes do pagamento confirmado', async () => {
    const { orderId } = await whatsappOrder();
    const r = await sendPaidOrderWhatsApp(pool, orderId);
    expect(r).toEqual({ status: 'SKIPPED', reason: 'NOT_PAID' });
    expect(sendText).not.toHaveBeenCalled();
  });

  it('confirmação do Asaas manda o link de acesso na conversa, uma vez só', async () => {
    const { orderId, paymentId, convId, jid } = await whatsappOrder();
    await reconcileAndFinalizePayment(paymentId, pool);
    expect(sendText).toHaveBeenCalledTimes(1);
    const [, to, text] = (sendText.mock.calls[0] as unknown) as [string, string, string];
    expect(to).toBe(jid);
    expect(text).toMatch(/^Maria, pagamento confirmado!/);
    expect(text).toMatch(/\/acesso\/[0-9a-f]{64}/);
    expect(text).toContain('Kit Cozinha Italiana');
    const d = await pool.query('SELECT status FROM whatsapp_order_deliveries WHERE order_id = $1', [orderId]);
    expect(d.rows[0].status).toBe('SENT');
    // no histórico fica sem o código do link
    const m = await pool.query(`SELECT body, author FROM whatsapp_messages WHERE conversation_id = $1`, [convId]);
    expect(m.rows[0].author).toBe('SYSTEM');
    expect(m.rows[0].body).not.toMatch(/[0-9a-f]{64}/);
    const again = await sendPaidOrderWhatsApp(pool, orderId);
    expect(again).toEqual({ status: 'SKIPPED', reason: 'ALREADY_HANDLED' });
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('cliente que pediu para parar não recebe pelo WhatsApp (o e-mail continua)', async () => {
    const { paymentId } = await whatsappOrder('OPTED_OUT');
    await reconcileAndFinalizePayment(paymentId, pool);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('falha no envio fica para nova tentativa e o link não enviado é cancelado', async () => {
    const { orderId, paymentId } = await whatsappOrder();
    sendText.mockRejectedValueOnce(new Error('caiu'));
    await reconcileAndFinalizePayment(paymentId, pool);
    const d = await pool.query('SELECT status, attempts FROM whatsapp_order_deliveries WHERE order_id = $1', [orderId]);
    expect(d.rows[0]).toMatchObject({ status: 'FAILED', attempts: 1 });
    const t = await pool.query(`SELECT status FROM order_recovery_tokens WHERE order_id = $1 AND purpose = 'WHATSAPP'`, [orderId]);
    expect(t.rows.every((r: any) => r.status === 'REVOKED')).toBe(true);
    const retry = await sendPaidOrderWhatsApp(pool, orderId);
    expect(retry).toEqual({ status: 'SENT' });
  });
});
