// NORQVA-0146: PDF enviado direto no WhatsApp (depois do PAID e a pedido, com limite). Asaas, WhatsApp e IA simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { AsaasPaymentProvider } from '../utils/payment';
import { reconcileAndFinalizePayment } from '../controllers/api';
import { clearTestEmails, emailService } from '../services/emailService';
import { resetProviderCheckThrottle } from '../services/paymentCheckThrottle';
import { setWhatsAppProviderForTests, WhatsAppProvider } from '../services/whatsapp/provider';
import { pdfFileName, sendOrderPdfs, WHATSAPP_PDF_MAX_SENDS, lastPdfSendForTests } from '../services/whatsapp/whatsappDelivery';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiReply, paidOrderForConversation } from '../services/whatsapp/attendant';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mockproject.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'MOCK';

const AMOUNT = 29.9;

describe('NORQVA-0146 — nome do arquivo', () => {
  it('usa o nome do upload e termina em .pdf, sem caracteres proibidos', () => {
    expect(pdfFileName({ file_original_name: 'KIT_DE_BORDADO_NORQVA.pdf' })).toBe('KIT_DE_BORDADO_NORQVA.pdf');
    expect(pdfFileName({ name: 'Trattoria em Casa' })).toBe('Trattoria em Casa.pdf');
    expect(pdfFileName({ name: 'a/b:c*?.PDF' })).toBe('a b c .PDF');
    expect(pdfFileName({ storage_path: 'books/x.docx' })).toBe('x.pdf');
  });
});

describe.sequential('NORQVA-0146 — PDF no WhatsApp', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6);
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const assetA = crypto.randomUUID();
  const assetB = crypto.randomUUID();
  const assetBig = crypto.randomUUID();
  let numberId = '';
  const orders: string[] = [];
  const customers: string[] = [];
  const sendText = vi.fn(async () => ({ id: `W-${crypto.randomUUID()}` }));
  const sendDocument = vi.fn(async () => ({ id: `D-${crypto.randomUUID()}` }));
  const provider = {
    createInstance: vi.fn(), connect: vi.fn(), info: vi.fn(), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText, sendImage: vi.fn(async () => ({ id: 'I' })), sendDocument
  } as unknown as WhatsAppProvider;
  let script: AiReply[] = [];
  let spies: any[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(`INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, 'Kit 0137', 'Receitas', 'x', 'PLANEJADO', false)`, [productId, `PRD-P${tag}`]);
    await pool.query(`INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Kit 0137', $3, $4, 'ATIVA', 'x', false)`, [offerId, `OFF-P${tag}`, productId, AMOUNT]);
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo, file_original_name, file_size_bytes) VALUES
       ($1, 'Livro A', 'SUPABASE', 'digital-products', 'books/a0137.pdf', false, 'LIVRO_A.pdf', 1000),
       ($2, 'Livro B', 'SUPABASE', 'digital-products', 'books/b0137.pdf', false, NULL, NULL),
       ($3, 'Livro Grande', 'SUPABASE', 'digital-products', 'books/big0137.pdf', false, 'GRANDE.pdf', 80000000)`,
      [assetA, assetB, assetBig]
    );
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2), ($1, $3), ($1, $4)', [offerId, assetA, assetB, assetBig]);
    const n = await pool.query(
      `INSERT INTO whatsapp_numbers (label, instance_name, webhook_secret_hash, status, phone, bot_enabled) VALUES ('T0137', $1, 'x', 'CONNECTED', '5511900000137', TRUE) RETURNING id`,
      [`t137-${tag}`]
    );
    numberId = n.rows[0].id;
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM whatsapp_pdf_sends WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_recovery_tokens WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_access_emails WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await q('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [[assetA, assetB, assetBig]]);
    await q('DELETE FROM offers WHERE id = $1', [offerId]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
  });

  beforeEach(() => {
    resetProviderCheckThrottle();
    resetAttendantMemoryForTests();
    clearTestEmails();
    (emailService as any).setProvider(null);
    sendText.mockClear();
    sendDocument.mockClear();
    setWhatsAppProviderForTests(provider);
    setAttendantAiForTests((async () => script.shift() || { content: 'Certo!', tool_calls: [] }) as any);
    script = [];
    spies = [
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({ id, status: 'CONFIRMED', amount: AMOUNT }) as any)
    ];
  });
  afterEach(() => {
    for (const s of spies) s.mockRestore();
  });

  async function order(opts: { inConversation: boolean; phone?: string | null; jidDigits?: string }) {
    const jid = `${opts.jidDigits || `55219${Math.floor(10000000 + Math.random() * 89999999)}`}@s.whatsapp.net`;
    const conv = await pool.query(`INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_name, mode) VALUES ($1, $2, 'Ana Lima', 'BOT') RETURNING id`, [numberId, jid]);
    const customerId = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, false)', [customerId, 'Ana Lima', `p0137_${customerId.slice(0, 8)}@example.com`, opts.phone ?? null]);
    customers.push(customerId);
    const orderId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, whatsapp_conversation_id) VALUES ($1, $2, $3, 'PENDING', $4, false, $5)`,
      [orderId, customerId, AMOUNT, crypto.randomUUID(), opts.inConversation ? conv.rows[0].id : null]
    );
    orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Kit 0137', 'Kit 0137', $4, 1, $4)`,
      [orderId, offerId, productId, AMOUNT]
    );
    const pay = await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', $3, $4, false, $5, $6) RETURNING id`,
      [`PMT-P137-${crypto.randomUUID().slice(0, 8)}`, orderId, AMOUNT, crypto.randomUUID(), crypto.randomUUID(), `pay_${crypto.randomUUID().slice(0, 10)}`]
    );
    return { orderId, paymentId: pay.rows[0].id as string, convId: conv.rows[0].id as string, jid };
  }

  it('depois do PAID: o link e, logo depois, os PDFs (o grande fica só no link)', async () => {
    const { paymentId, orderId, convId, jid } = await order({ inConversation: true });
    await reconcileAndFinalizePayment(paymentId, pool);
    await lastPdfSendForTests();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(String((sendText.mock.calls[0] as any)[2])).toContain('arquivo em PDF');
    expect(sendDocument).toHaveBeenCalledTimes(2);
    const names = sendDocument.mock.calls.map((c: any[]) => c[3]).sort();
    expect(names).toEqual(['LIVRO_A.pdf', 'Livro B.pdf']);
    for (const c of sendDocument.mock.calls as any[]) {
      expect(c[1]).toBe(jid);
      expect(String(c[2])).toMatch(/^https:\/\/.+\/storage\/v1\/object\/sign\//);
    }
    const s = await pool.query('SELECT reason, files_sent, files_skipped FROM whatsapp_pdf_sends WHERE order_id = $1', [orderId]);
    expect(s.rows).toEqual([{ reason: 'PAID', files_sent: 2, files_skipped: 1 }]);
    const m = await pool.query(`SELECT body FROM whatsapp_messages WHERE conversation_id = $1 AND kind = 'DOCUMENT' ORDER BY body`, [convId]);
    expect(m.rows.map((r: any) => r.body)).toEqual(['[arquivo] LIVRO_A.pdf', '[arquivo] Livro B.pdf']);
  });

  it('não pago ou entrega revogada: nada sai', async () => {
    const a = await order({ inConversation: true });
    expect(await sendOrderPdfs(pool, provider, { orderId: a.orderId, convId: a.convId, jid: a.jid, instanceName: 'x' }, 'RESEND')).toEqual({ ok: false, reason: 'NOT_PAID' });
    await reconcileAndFinalizePayment(a.paymentId, pool);
    await lastPdfSendForTests();
    sendDocument.mockClear();
    await pool.query(`UPDATE order_deliveries SET status = 'REVOKED' WHERE order_id = $1`, [a.orderId]);
    expect(await sendOrderPdfs(pool, provider, { orderId: a.orderId, convId: a.convId, jid: a.jid, instanceName: 'x' }, 'RESEND')).toEqual({ ok: false, reason: 'NO_ACTIVE_DELIVERY' });
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it('reenvio pelo atendente: só pedido pago da conversa ou do mesmo telefone; no máximo 3 envios', async () => {
    // comprou pela página com o telefone (31) 9 8888-7777 e escreve depois do mesmo número
    const page = await order({ inConversation: false, phone: '(31) 98888-7777', jidDigits: '5531988887777' });
    await reconcileAndFinalizePayment(page.paymentId, pool);
    await lastPdfSendForTests();
    expect(await paidOrderForConversation(pool, { id: page.convId, contact_jid: page.jid })).toBe(page.orderId);
    sendDocument.mockClear();
    script = [
      { content: null, tool_calls: [{ id: 'r1', name: 'resend_files', arguments: '{}' }] },
      { content: 'Te mando os arquivos aqui.', tool_calls: [] }
    ];
    await processConversation(pool, page.convId, ['não consigo baixar']);
    expect(sendDocument).toHaveBeenCalledTimes(2);
    // até o limite
    for (let i = 1; i < WHATSAPP_PDF_MAX_SENDS; i++) {
      script = [{ content: null, tool_calls: [{ id: `r${i + 1}`, name: 'resend_files', arguments: '{}' }] }, { content: 'Ok.', tool_calls: [] }];
      await processConversation(pool, page.convId, ['de novo']);
    }
    sendDocument.mockClear();
    script = [{ content: null, tool_calls: [{ id: 'rx', name: 'resend_files', arguments: '{}' }] }, { content: 'Vou chamar a equipe.', tool_calls: [] }];
    await processConversation(pool, page.convId, ['ainda não']);
    expect(sendDocument).not.toHaveBeenCalled();
    const n = await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_pdf_sends WHERE order_id = $1 AND files_sent > 0', [page.orderId]);
    expect(n.rows[0].n).toBe(WHATSAPP_PDF_MAX_SENDS);
  });

  it('outro telefone sem compra: o atendente não manda arquivo nenhum', async () => {
    const other = await order({ inConversation: false, phone: '(31) 97777-1111', jidDigits: '5531966665555' });
    await reconcileAndFinalizePayment(other.paymentId, pool);
    await lastPdfSendForTests();
    expect(await paidOrderForConversation(pool, { id: other.convId, contact_jid: other.jid })).toBeNull();
    sendDocument.mockClear();
    script = [{ content: null, tool_calls: [{ id: 'z1', name: 'resend_files', arguments: '{}' }] }, { content: 'Me passa o e-mail da compra?', tool_calls: [] }];
    await processConversation(pool, other.convId, ['quero o pdf']);
    expect(sendDocument).not.toHaveBeenCalled();
  });

  it('pedido pago com entrega revogada: a ferramenta não promete arquivo', async () => {
    const r = await order({ inConversation: false, phone: '(31) 95555-4444', jidDigits: '5531955554444' });
    await reconcileAndFinalizePayment(r.paymentId, pool);
    await lastPdfSendForTests();
    await pool.query(`UPDATE order_deliveries SET status = 'REVOKED' WHERE order_id = $1`, [r.orderId]);
    expect(await paidOrderForConversation(pool, { id: r.convId, contact_jid: r.jid })).toBeNull();
  });

  it('telefone gravado sem o 9 casa com o WhatsApp que tem o 9; @lid sem pedido na conversa não casa', async () => {
    const r = await order({ inConversation: false, phone: '3188881234', jidDigits: '5531988881234' });
    await reconcileAndFinalizePayment(r.paymentId, pool);
    await lastPdfSendForTests();
    expect(await paidOrderForConversation(pool, { id: r.convId, contact_jid: r.jid })).toBe(r.orderId);
    expect(await paidOrderForConversation(pool, { id: r.convId, contact_jid: '5531988881234@lid' })).toBeNull();
  });
});
