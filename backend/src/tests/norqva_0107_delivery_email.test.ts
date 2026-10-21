// NORQVA-0107: remetente com o nome da marca, e-mail de acesso claro e lembrete de download (3 h e 24 h).
import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { runDownloadReminders, dueDownloadStep } from '../services/downloadReminderService';
import { runPaymentSweep } from '../services/paymentSweepService';
import { ResendEmailProvider, buildPurchaseAccessEmail, buildRecoveryAccessEmail } from '../services/resendProvider';
import { SendPurchaseAccessEmailParams } from '../services/emailService';
import { buildFromHeader, sanitizeSenderName, senderAddress, brandSenderNameForOrder } from '../services/emailSender';

const HOUR = 60 * 60 * 1000;

describe('NORQVA-0107 — remetente e e-mail de acesso', () => {
  test('nome do remetente: limpo, com o endereço de sempre e "NORQVA" como reserva', () => {
    expect(sanitizeSenderName('Trattoria em Casa')).toBe('Trattoria em Casa');
    expect(sanitizeSenderName('Evil <x@y.z>\r\nBcc: a@b.c')).toBe('Evil x@y.z Bcc: a@b.c');
    expect(sanitizeSenderName('  ')).toBeNull();
    expect(sanitizeSenderName(null)).toBeNull();
    expect((sanitizeSenderName('A'.repeat(100)) || '').length).toBe(60);
    expect(senderAddress('NORQVA <acesso@mail.norqva.com.br>')).toBe('acesso@mail.norqva.com.br');
    expect(senderAddress('outro@mail.norqva.com.br')).toBe('outro@mail.norqva.com.br');
    expect(senderAddress('')).toBe('acesso@mail.norqva.com.br');
    expect(buildFromHeader('NORQVA <acesso@mail.norqva.com.br>', 'Trattoria em Casa')).toBe('Trattoria em Casa <acesso@mail.norqva.com.br>');
    expect(buildFromHeader('NORQVA <acesso@mail.norqva.com.br>', undefined)).toBe('NORQVA <acesso@mail.norqva.com.br>');
    expect(buildFromHeader('NORQVA <acesso@mail.norqva.com.br>', 'Pães, Massas & Cia.')).toBe('"Pães, Massas & Cia." <acesso@mail.norqva.com.br>');
    expect(buildFromHeader('NORQVA <acesso@mail.norqva.com.br>', 'X\r\nBcc: <a@b.c>')).not.toMatch(/[\r\n]/);
  });

  test('e-mail de compra: visual claro, marca no topo, botão, link, aviso de spam e HTML escapado', () => {
    const url = 'https://app.test/acesso/abc123';
    const e = buildPurchaseAccessEmail({
      email: 'a@b.c', offerName: 'Trattoria <b>em</b> Casa', recoveryUrl: url, kind: 'PURCHASE', validityHours: 168, senderName: 'Trattoria em Casa'
    });
    expect(e.subject).toBe('Seu acesso a Trattoria <b>em</b> Casa está pronto');
    expect(e.html).toContain('#FBF7F0');
    expect(e.html).toContain('#B5472B');
    expect(e.html).toContain('Trattoria em Casa</p>');
    expect(e.html).toContain('Baixar meu livro');
    expect(e.html).toContain(`href="${url}"`);
    expect(e.html).toContain('Procure em Spam ou Lixo eletrônico');
    expect(e.html).toContain('7 dias');
    expect(e.html).toContain('Trattoria &lt;b&gt;em&lt;/b&gt; Casa');
    expect(e.html).not.toContain('<b>em</b>');
    expect(e.html).not.toContain('NORQVA');
    expect(e.text).toContain(url);
    expect(e.text).toContain('Não é spam');
    expect(e.text).toContain('Equipe Trattoria em Casa');

    const r = buildPurchaseAccessEmail({ email: 'a@b.c', offerName: 'Trattoria em Casa', recoveryUrl: url, kind: 'DOWNLOAD_REMINDER' });
    expect(r.subject).toBe('Você ainda não baixou Trattoria em Casa');
    expect(r.html).toContain('Vimos que você ainda não baixou o seu livro. O link abaixo é novo e já está liberado.');
    expect(r.html).toContain('NORQVA</p>'); // sem marca: NORQVA no topo
  });

  test('recuperação continua com o texto de antes', () => {
    const e = buildRecoveryAccessEmail({ email: 'a@b.c', offerName: 'Trattoria', recoveryUrl: 'https://app.test/acesso/x' });
    expect(e.subject).toBe('Recupere seu acesso à sua compra NORQVA');
    expect(e.text).toContain('uso único');
  });

  test('provedor Resend usa o nome da marca no remetente (compra e recuperação)', async () => {
    const payloads: any[] = [];
    const provider = new ResendEmailProvider('re_mock_key', 'NORQVA <acesso@mail.norqva.com.br>');
    (provider as any).resend = { emails: { send: vi.fn().mockImplementation(async (p: any) => { payloads.push(p); return { data: { id: 'm1' }, error: null }; }) } };
    await provider.sendPurchaseAccessEmail({ email: 'a@b.c', offerName: 'Trattoria', recoveryUrl: 'https://app.test/acesso/1', kind: 'PURCHASE', senderName: 'Trattoria em Casa' });
    await provider.sendPurchaseAccessEmail({ email: 'a@b.c', offerName: 'Trattoria', recoveryUrl: 'https://app.test/acesso/2', senderName: 'Trattoria em Casa' });
    await provider.sendPurchaseAccessEmail({ email: 'a@b.c', offerName: 'Trattoria', recoveryUrl: 'https://app.test/acesso/3', kind: 'PURCHASE' });
    expect(payloads[0].from).toBe('Trattoria em Casa <acesso@mail.norqva.com.br>');
    expect(payloads[0].subject).toBe('Seu acesso a Trattoria está pronto');
    expect(payloads[1].from).toBe('Trattoria em Casa <acesso@mail.norqva.com.br>');
    expect(payloads[1].subject).toBe('Recupere seu acesso à sua compra NORQVA');
    expect(payloads[2].from).toBe('NORQVA <acesso@mail.norqva.com.br>');
  });

  test('etapas: 3 h e 24 h', () => {
    expect(dueDownloadStep(2.9)).toBe(0);
    expect(dueDownloadStep(3)).toBe(1);
    expect(dueDownloadStep(23.9)).toBe(1);
    expect(dueDownloadStep(24)).toBe(2);
    expect(dueDownloadStep(24 * 20)).toBe(2);
  });
});

describe.sequential('NORQVA-0107 — lembrete de download', () => {
  let pool: Pool;
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const plainProductId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const plainOfferId = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  const created = { orders: [] as string[], customers: [] as string[] };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO brands (id, code, name, status) VALUES ($1, $2, 'Trattoria 0107', 'PILOT')`,
      [brandId, `T0107_${brandId.slice(0, 8)}`]
    );
    for (const [id, brand] of [[productId, brandId], [plainProductId, null]] as Array<[string, string | null]>) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, status, description, is_demo, brand_id)
         VALUES ($1, $2, 'Livro 0107', 'Downloads', 'PLANEJADO', 'Desc', false, $3)`,
        [id, `PRD-0107-${id.slice(0, 6)}`, brand]
      );
    }
    for (const [id, prod] of [[offerId, productId], [plainOfferId, plainProductId]]) {
      await pool.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo)
         VALUES ($1, $2, 'Trattoria em Casa 0107', $3, 19.90, 'ATIVA', 'Desc', false)`,
        [id, `OFF-0107-${id.slice(0, 6)}`, prod]
      );
    }
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
       VALUES ($1, 'Livro 0107', 'SUPABASE', 'digital-products', 'books/0107.pdf', false)`,
      [assetId]
    );
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2), ($3, $2)', [offerId, assetId, plainOfferId]);
  });

  afterAll(async () => {
    const ids = created.orders;
    if (ids.length) {
      await pool.query('DELETE FROM order_download_reminders WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM order_recovery_tokens WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids]);
    }
    if (created.customers.length) await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [created.customers]);
    await pool.query('DELETE FROM offer_digital_assets WHERE asset_id = $1', [assetId]);
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [assetId]);
    await pool.query('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[offerId, plainOfferId]]);
    await pool.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [[productId, plainProductId]]);
    await pool.query('DELETE FROM brands WHERE id = $1', [brandId]);
  });

  afterEach(() => {
    delete process.env.DOWNLOAD_REMINDER_ENABLED;
  });

  async function newPaidOrder(opts: {
    paidHoursAgo: number; downloads?: number; isDemo?: boolean; provenance?: string; email?: string | null;
    orderStatus?: string; paymentStatus?: string; deliveryStatus?: string; plain?: boolean;
  }) {
    const customerId = crypto.randomUUID();
    // sem e-mail válido: o campo é obrigatório e único no banco, então vai um texto sem "@"
    const email = opts.email === undefined ? `c0107_${customerId.slice(0, 8)}@example.com` : opts.email || `sem-email-${customerId}`;
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, NULL, false)', [customerId, 'Maria', email]);
    created.customers.push(customerId);
    const orderId = crypto.randomUUID();
    const paidAt = new Date(Date.now() - opts.paidHoursAgo * HOUR).toISOString();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance, created_at)
       VALUES ($1, $2, 19.90, $3, $4, $5, $6, $7)`,
      [orderId, customerId, opts.orderStatus || 'PAID', crypto.randomUUID(), Boolean(opts.isDemo), opts.provenance || 'COMMERCIAL_PRODUCTION', paidAt]
    );
    created.orders.push(orderId);
    const item = await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Livro 0107', 'Trattoria em Casa', 19.90, 1, 19.90) RETURNING id`,
      [orderId, opts.plain ? plainOfferId : offerId, opts.plain ? plainProductId : productId]
    );
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id, confirmed_at)
       VALUES ($1, $2, 'ASAAS', $3, 19.90, $4, $5, $6, $7, $8)`,
      [`PMT-0107-${crypto.randomUUID().slice(0, 8)}`, orderId, opts.paymentStatus || 'CONFIRMED', crypto.randomUUID(), Boolean(opts.isDemo),
       crypto.randomUUID(), `pay_${crypto.randomUUID().slice(0, 10)}`, paidAt]
    );
    await pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status, download_count) VALUES ($1, $2, $3, $4, $5)`,
      [orderId, item.rows[0].id, assetId, opts.deliveryStatus || 'ACTIVE', opts.downloads || 0]
    );
    return orderId;
  }

  function collector() {
    const sent: SendPurchaseAccessEmailParams[] = [];
    return { sent, send: async (p: SendPurchaseAccessEmailParams) => { sent.push(p); return { success: true, messageId: 'm' }; } };
  }

  test('remetente vem da marca do produto; sem marca, "NORQVA"', async () => {
    const withBrand = await newPaidOrder({ paidHoursAgo: 1, downloads: 1 });
    const noBrand = await newPaidOrder({ paidHoursAgo: 1, downloads: 1, plain: true });
    expect(await brandSenderNameForOrder(pool, withBrand)).toBe('Trattoria 0107');
    expect(await brandSenderNameForOrder(pool, noBrand)).toBe('NORQVA');
  });

  test('A: pago há 4 h sem download recebe a etapa 1 com link novo, uma vez só', async () => {
    const id = await newPaidOrder({ paidHoursAgo: 4 });
    const c = collector();
    const r = await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(r.sent).toBe(1);
    expect(c.sent[0].kind).toBe('DOWNLOAD_REMINDER');
    expect(c.sent[0].senderName).toBe('Trattoria 0107');
    expect(c.sent[0].offerName).toBe('Trattoria em Casa');
    expect(c.sent[0].recoveryUrl).toMatch(/\/acesso\/[0-9a-f]{64}$/);
    const tokens = await pool.query("SELECT status FROM order_recovery_tokens WHERE order_id = $1 AND purpose = 'RESEND'", [id]);
    expect(tokens.rows.map(t => t.status)).toEqual(['ACTIVE']);
    const again = await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(again.sent).toBe(0);
    const rows = await pool.query('SELECT step, status, sent_at FROM order_download_reminders WHERE order_id = $1', [id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].step).toBe(1);
    expect(rows.rows[0].status).toBe('SENT');
    expect(rows.rows[0].sent_at).not.toBeNull();
    const audit = await pool.query("SELECT description FROM audit_logs WHERE event_type = 'DOWNLOAD_REMINDER_SENT' AND description LIKE $1", [`%${id}%`]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].description).not.toContain('@');
  });

  test('B: pago há 3 dias recebe só a etapa 2, uma vez', async () => {
    const id = await newPaidOrder({ paidHoursAgo: 72 });
    const c = collector();
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent).toHaveLength(1);
    const rows = await pool.query('SELECT step FROM order_download_reminders WHERE order_id = $1', [id]);
    expect(rows.rows.map(x => x.step)).toEqual([2]);
  });

  test('C: etapa 1 e depois etapa 2; o link de reenvio anterior deixa de valer; nunca uma terceira', async () => {
    const id = await newPaidOrder({ paidHoursAgo: 4 });
    const c = collector();
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    // passou o tempo: pagamento há 30 h e lembrete anterior há 26 h
    await pool.query("UPDATE payments SET confirmed_at = NOW() - INTERVAL '30 hours' WHERE order_id = $1", [id]);
    await pool.query("UPDATE order_download_reminders SET created_at = NOW() - INTERVAL '26 hours' WHERE order_id = $1", [id]);
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent).toHaveLength(2);
    const tokens = await pool.query("SELECT status FROM order_recovery_tokens WHERE order_id = $1 AND purpose = 'RESEND' ORDER BY created_at ASC", [id]);
    expect(tokens.rows.map(t => t.status).sort()).toEqual(['ACTIVE', 'REVOKED']);
  });

  test('D: não manda para quem baixou, recente, antigo, demo, teste, estornado, bloqueado ou sem e-mail', async () => {
    const ids = [
      await newPaidOrder({ paidHoursAgo: 5, downloads: 1 }),
      await newPaidOrder({ paidHoursAgo: 2 }),
      await newPaidOrder({ paidHoursAgo: 31 * 24 }),
      await newPaidOrder({ paidHoursAgo: 5, isDemo: true, provenance: 'DEMO_SEED' }),
      await newPaidOrder({ paidHoursAgo: 5, provenance: 'STAGING_SANDBOX_QA' }),
      await newPaidOrder({ paidHoursAgo: 5, orderStatus: 'REFUNDED', paymentStatus: 'REFUNDED', deliveryStatus: 'REVOKED' }),
      await newPaidOrder({ paidHoursAgo: 5, deliveryStatus: 'REVOKED' }),
      await newPaidOrder({ paidHoursAgo: 5, email: null })
    ];
    const c = collector();
    const r = await runDownloadReminders(pool, { send: c.send, orderIds: ids });
    expect(r.sent).toBe(0);
    expect(c.sent).toHaveLength(0);
    const rows = await pool.query('SELECT 1 FROM order_download_reminders WHERE order_id = ANY($1::uuid[])', [ids]);
    expect(rows.rows).toHaveLength(0);
  });

  test('E: falha no envio fica registrada, revoga o link e não repete', async () => {
    const id = await newPaidOrder({ paidHoursAgo: 4 });
    const r = await runDownloadReminders(pool, { send: async () => ({ success: false, error: 'X' }), orderIds: [id] });
    expect(r.failed).toBe(1);
    const row = await pool.query('SELECT status, error FROM order_download_reminders WHERE order_id = $1', [id]);
    expect(row.rows[0]).toEqual({ status: 'FAILED', error: 'X' });
    const tokens = await pool.query("SELECT status FROM order_recovery_tokens WHERE order_id = $1 AND purpose = 'RESEND'", [id]);
    expect(tokens.rows.map(t => t.status)).toEqual(['REVOKED']);
    const c = collector();
    await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(c.sent).toHaveLength(0);
  });

  test('F: DOWNLOAD_REMINDER_ENABLED=false desliga', async () => {
    process.env.DOWNLOAD_REMINDER_ENABLED = 'false';
    const id = await newPaidOrder({ paidHoursAgo: 4 });
    const c = collector();
    const r = await runDownloadReminders(pool, { send: c.send, orderIds: [id] });
    expect(r.sent).toBe(0);
    expect(c.sent).toHaveLength(0);
  });

  test('G: a varredura de pagamentos manda o lembrete sem mudar o resto', async () => {
    const id = await newPaidOrder({ paidHoursAgo: 4 });
    const c = collector();
    const r = await runPaymentSweep(pool, {
      reconcile: async () => null,
      retryWebhookEvent: async () => null,
      sendAccessEmail: async () => ({ status: 'SKIPPED', reason: 'TEST' }),
      reminders: { orderIds: [crypto.randomUUID()] },
      downloadReminders: { send: c.send, orderIds: [id] }
    });
    expect(r.downloadRemindersSent).toBe(1);
    expect(typeof r.webhooksRetried).toBe('number');
    expect(typeof r.paymentsChecked).toBe('number');
    expect(c.sent.map(s => s.orderId)).toEqual([id]);
  });
});
