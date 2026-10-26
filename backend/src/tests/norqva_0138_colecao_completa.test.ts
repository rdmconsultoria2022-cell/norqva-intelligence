// NORQVA-0138: Coleção Trattoria Completa (5 livros + bônus do cardápio) a R$ 47,00.
// - preço e parcelas (D-0080), sem nada que dependa de campanha;
// - migration 086 (bloco DO: só no PostgreSQL do CI): oferta em RASCUNHO com os 5 PDFs do kit, "de" = soma real dos avulsos;
// - entrega dos 6 PDFs (5 livros + bônus enviado pela tela) só com PAID;
// - atendente: com as duas ATIVAS, a coleção vem primeiro e o kit de 5 é a alternativa; RASCUNHO nunca é oferecido.
// IA, WhatsApp, Asaas e armazenamento simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import app from '../index';
import { initializeDB, isDbInMemory } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { AsaasPaymentProvider } from '../utils/payment';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { installmentOptions, planFromOffer } from '../services/commerce/cardInstallments';
import { publicCardTerms } from '../services/commerce/cardTerms';
import { setStorageClient, StorageClient } from '../services/delivery/deliveryFileService';
import { finalizePaidOrder } from '../controllers/api';
import { setWhatsAppProviderForTests, WhatsAppProvider, ProviderError } from '../services/whatsapp/provider';
import {
  setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiReply, loadCatalog, catalogText, orderForAttendant
} from '../services/whatsapp/attendant';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0138';

const SQL = fs.readFileSync(path.join(__dirname, '../db/migrations/086_colecao_trattoria_completa.sql'), 'utf8');
const pdf = (label: string) => Buffer.from(`%PDF-1.7\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n`, 'latin1');

class FakeStorage implements StorageClient {
  files = new Map<string, Buffer>();
  async exists(bucket: string, p: string) {
    return this.files.has(`${bucket}/${p}`);
  }
  async upload(bucket: string, p: string, data: Buffer) {
    const key = `${bucket}/${p}`;
    if (this.files.has(key)) throw new Error('já existe');
    this.files.set(key, Buffer.from(data));
  }
}

describe('NORQVA-0138 — preço e parcelas da coleção (D-0080)', () => {
  it('"de" é a soma real dos 5 livros avulsos (4 × R$ 19,90 + Dolci R$ 14,90); o bônus não entra', () => {
    const avulsos = [19.9, 19.9, 19.9, 19.9, 14.9];
    expect(Math.round(avulsos.reduce((a, b) => a + b, 0) * 100) / 100).toBe(94.5);
  });

  it('R$ 47,00: 1x sem acréscimo, 2,99% ao mês acima, e com a parcela mínima de R$ 5,00 chega a 10x', () => {
    const plan = planFromOffer({ card_max_installments: 10, card_free_installments: 1, card_interest_monthly: 2.99 });
    const opts = installmentOptions(4700, plan);
    expect(opts).toHaveLength(10);
    expect(opts[0]).toEqual({ n: 1, valueCents: 4700, totalCents: 4700, interest: false });
    expect(opts[1]).toEqual({ n: 2, valueCents: 2456, totalCents: 4912, interest: true });
    expect(opts[9]).toEqual({ n: 10, valueCents: 551, totalCents: 5510, interest: true });
    expect(opts.every(o => (o.valueCents ?? 0) >= 500)).toBe(true);
    const terms = publicCardTerms({ price: 94.5, promotional_price: 47, card_enabled: true, card_max_installments: 10, card_free_installments: 1, card_interest_monthly: 2.99, card_total_price: null })!;
    expect(terms.total).toBe(47);
    expect(terms.max_installments).toBe(1);
    expect(terms.options.slice(-1)[0]).toEqual({ n: 10, installment_value: 5.51, total: 55.1, interest: true });
  });

  it('ordem do atendente: destaque primeiro, a alternativa logo depois, o resto na ordem de antes', () => {
    const rows = [
      { id: 'livro', attendant_featured: false, attendant_alternative_offer_id: null },
      { id: 'kit', attendant_featured: false, attendant_alternative_offer_id: null },
      { id: 'dolci', attendant_featured: false, attendant_alternative_offer_id: null },
      { id: 'colecao', attendant_featured: true, attendant_alternative_offer_id: 'kit' }
    ];
    expect(orderForAttendant(rows).map(r => r.id)).toEqual(['colecao', 'kit', 'livro', 'dolci']);
    // alternativa fora do catálogo (pausada, rascunho): nada é inventado
    expect(orderForAttendant(rows.filter(r => r.id !== 'kit')).map(r => r.id)).toEqual(['colecao', 'livro', 'dolci']);
    // sem destaque, nada muda
    expect(orderForAttendant(rows.filter(r => r.id !== 'colecao')).map(r => r.id)).toEqual(['livro', 'kit', 'dolci']);
  });
});

describe.skipIf(!process.env.DATABASE_URL_TEST || isDbInMemory())('NORQVA-0138 — migration 086', () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const code = (n: string) => `OFF-${n}X${tag}`;
  let sql = SQL;
  for (const n of ['000001', '000005', '000007', '000008', '000009', '000010']) sql = sql.split(`'OFF-${n}'`).join(`'${code(n)}'`);

  async function fixtures(c: any, opts: { kitFiles?: number } = {}) {
    const brand = crypto.randomUUID();
    await c.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Trattoria 0138')`, [brand, `T38${tag}`]);
    const prd = crypto.randomUUID();
    await c.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id)
       VALUES ($1, $2, 'KIT TRATTORIA COMPLETO', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [prd, `PRD-0138${tag}`, brand]
    );
    const pdfs: string[] = [];
    for (const b of ['trattoria', 'dolci', 'paes', 'antipasti', 'risotos']) {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`,
        [id, b, `books/0138-${tag}-${b}.pdf`]
      );
      pdfs.push(id);
    }
    const offer = async (human: string, name: string, price: number, promo: number | null, files: string[]) => {
      const id = crypto.randomUUID();
      await c.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance,
                             card_enabled, card_max_installments, card_free_installments, card_interest_monthly)
         VALUES ($1, $2, $3, $4, $5, $6, 'ATIVA', 'x', false, 'COMMERCIAL_PRODUCTION', TRUE, 10, 1, 2.99)`,
        [id, human, name, prd, price, promo]
      );
      for (const a of files) await c.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [id, a]);
      return id;
    };
    await offer(code('000001'), 'TRATTORIA EM CASA', 19.9, null, [pdfs[0]]);
    await offer(code('000005'), 'DOLCI DELLA NONNA', 14.9, null, [pdfs[1]]);
    await offer(code('000007'), 'Pães & Fermentação Natural', 19.9, null, [pdfs[2]]);
    await offer(code('000008'), 'Antipasti & Aperitivo', 19.9, null, [pdfs[3]]);
    await offer(code('000009'), 'Risotos & Polentas', 19.9, null, [pdfs[4]]);
    const kit = await offer(code('000010'), 'KIT TRATTORIA COMPLETO — 5 LIVROS', 94.5, 29.9, pdfs.slice(0, opts.kitFiles ?? 5));
    return { brand, prd, pdfs, kit };
  }
  const collection = async (c: any) =>
    (await c.query(
      `SELECT o.*, p.brand_id, p.name AS product_name FROM offers o JOIN products p ON p.id = o.product_id
       WHERE o.name = 'Coleção Trattoria Completa' AND o.is_deleted = FALSE`
    )).rows;

  it('cria a coleção em RASCUNHO: de R$ 94,50 por R$ 47,00, cartão dos livros, os 5 PDFs do kit e o kit como alternativa', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const f = await fixtures(c);
      await c.query(sql);
      const rows = await collection(c);
      expect(rows).toHaveLength(1);
      const o = rows[0];
      expect(o.status).toBe('RASCUNHO');
      expect(Number(o.price)).toBe(94.5);
      expect(Number(o.promotional_price)).toBe(47);
      expect(o.card_enabled).toBe(true);
      expect(o.card_max_installments).toBe(10);
      expect(o.card_free_installments).toBe(1);
      expect(Number(o.card_interest_monthly)).toBe(2.99);
      expect(o.card_total_price).toBeNull();
      expect(o.attendant_featured).toBe(true);
      expect(o.attendant_alternative_offer_id).toBe(f.kit);
      expect(o.data_provenance).toBe('COMMERCIAL_PRODUCTION');
      expect(o.is_demo).toBe(false);
      expect(o.brand_id).toBe(f.brand);
      expect(o.product_name).toBe('Coleção Trattoria Completa');
      expect(o.bonus).toMatch(/Cardápio italiano de 4 semanas/);
      expect(`${o.description} ${o.bonus}`).not.toMatch(/R\$|vitalíci/i);
      const files = await c.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1 ORDER BY asset_id', [o.id]);
      expect(files.rows.map((r: any) => r.asset_id)).toEqual([...f.pdfs].sort());
      // o kit não muda
      const kit = (await c.query('SELECT * FROM offers WHERE id = $1', [f.kit])).rows[0];
      expect(Number(kit.promotional_price)).toBe(29.9);
      expect(kit.status).toBe('ATIVA');
      expect(kit.attendant_featured).toBe(false);
      const audit = await c.query(`SELECT description FROM audit_logs WHERE event_type = 'COLLECTION_FULL_CREATED' AND created_at = now()`);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].description).toContain('de R$ 94,50 por R$ 47,00');

      // rodar de novo não duplica
      await c.query(sql);
      expect(await collection(c)).toHaveLength(1);
      const skip = await c.query(`SELECT description FROM audit_logs WHERE event_type = 'COLLECTION_FULL_SKIPPED' AND created_at = now()`);
      expect(skip.rows.map((r: any) => r.description).join(' ')).toContain('já existe');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('kit sem os 5 PDFs: não cria nada e registra o motivo', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await fixtures(c, { kitFiles: 4 });
      await c.query(sql);
      expect(await collection(c)).toHaveLength(0);
      const skip = await c.query(`SELECT description FROM audit_logs WHERE event_type = 'COLLECTION_FULL_SKIPPED' AND created_at = now()`);
      expect(skip.rows[0].description).toContain('não entrega exatamente 5 PDFs');
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});

describe.sequential('NORQVA-0138 — entrega dos 6 PDFs (5 livros + bônus) só com PAID', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const assets: string[] = [];
  const ids = { orders: [] as string[], customers: [] as string[] };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0138@norqva.test', 'Admin 0138', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Coleção 0138', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-D${tag}`]
    );
    // como a migration deixa: RASCUNHO, de R$ 94,50 por R$ 47,00, com os 5 PDFs dos livros
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance,
                           card_enabled, card_max_installments, card_free_installments, card_interest_monthly)
       VALUES ($1, $2, 'Coleção Trattoria Completa 0138', $3, 94.50, 47.00, 'RASCUNHO', 'x', false, 'COMMERCIAL_PRODUCTION', TRUE, 10, 1, 2.99)`,
      [offerId, `OFF-D${tag}`, productId]
    );
    for (const b of ['Trattoria em Casa', 'Dolci della Nonna', 'Pães & Fermentação Natural', 'Antipasti & Aperitivo', 'Risotos & Polentas']) {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`,
        [id, b, `books/0138-${tag}-${id.slice(0, 6)}.pdf`]
      );
      await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [offerId, id]);
      assets.push(id);
    }
    setStorageClient(new FakeStorage());
  });

  afterAll(async () => {
    setStorageClient(null);
    if (!pool) return;
    const q = (s: string, p: any[]) => pool.query(s, p).catch(() => {});
    await q('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [ids.orders]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [ids.orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids.orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids.orders]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [ids.customers]);
    const all = (await pool.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [offerId])).rows.map((r: any) => r.asset_id);
    await q('DELETE FROM offer_digital_assets WHERE offer_id = $1', [offerId]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [all]);
    await q('DELETE FROM offers WHERE id = $1', [offerId]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
  });

  it('o bônus entra pela tela ("Adicionar mais PDFs") como o 6º arquivo, com o nome que o comprador vê', async () => {
    const r = await request(app)
      .post(`/api/offers/${offerId}/delivery-files/extra?title=${encodeURIComponent('Cardápio italiano de 4 semanas com lista de compras')}`)
      .set('Authorization', `Bearer ${admin}`)
      .set('Content-Type', 'application/pdf')
      .set('x-file-name', encodeURIComponent('CARDAPIO_ITALIANO_4_SEMANAS.pdf'))
      .send(pdf('cardapio'));
    expect(r.status).toBe(201);
    const list = await request(app).get(`/api/offers/${offerId}/delivery-files`).set('Authorization', `Bearer ${admin}`);
    expect(list.body.assets).toHaveLength(6);
    expect(list.body.assets.map((a: any) => a.name)).toContain('Cardápio italiano de 4 semanas com lista de compras');
  });

  it('pedido pendente não recebe nada; depois de PAID recebe os 6 arquivos', async () => {
    const customerId = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, is_demo) VALUES ($1, $2, $3, false)', [customerId, 'Ana Souza', `c0138_${tag.toLowerCase()}@example.com`]);
    ids.customers.push(customerId);
    const orderId = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance, checkout_token_hash)
       VALUES ($1, $2, 47.00, 'PENDING', $3, false, 'COMMERCIAL_PRODUCTION', $4)`,
      [orderId, customerId, crypto.randomUUID(), hash]
    );
    ids.orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Coleção Trattoria Completa', 'Coleção Trattoria Completa', 47.00, 1, 47.00)`,
      [orderId, offerId, productId]
    );
    const pending = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(pending.status).toBe(403);
    expect((await pool.query('SELECT count(*)::int AS n FROM order_deliveries WHERE order_id = $1', [orderId])).rows[0].n).toBe(0);

    const paymentId = crypto.randomUUID();
    const providerPaymentId = `pay_${crypto.randomUUID().slice(0, 10)}`;
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, $3, 'ASAAS', 'PENDING', 47.00, $4, false, $5, $6)`,
      [paymentId, `PMT-0138-${tag}`, orderId, crypto.randomUUID(), paymentId, providerPaymentId]
    );
    const client = await pool.connect();
    try {
      await finalizePaidOrder(
        paymentId,
        { providerPaymentId, externalReference: paymentId, amount: 47, status: 'CONFIRMED', environment: 'SANDBOX', reconciledAt: new Date() },
        client
      );
    } finally {
      client.release();
    }
    const paid = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(paid.status).toBe(200);
    expect(paid.body.deliveries).toHaveLength(6);
    expect(paid.body.deliveries.every((d: any) => d.status === 'ACTIVE' && typeof d.rawToken === 'string')).toBe(true);
    expect(paid.body.deliveries.map((d: any) => d.assetTitle).sort()).toEqual(
      ['Antipasti & Aperitivo', 'Cardápio italiano de 4 semanas com lista de compras', 'Dolci della Nonna', 'Pães & Fermentação Natural', 'Risotos & Polentas', 'Trattoria em Casa'].sort()
    );
  });
});

describe.sequential('NORQVA-0138 — atendente: coleção primeiro, kit de 5 como alternativa, nunca rascunho', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const bookId = crypto.randomUUID();
  const kitId = crypto.randomUUID();
  const colId = crypto.randomUUID();
  const bookCode = `OFF-L${tag}`;
  const kitCode = `OFF-K${tag}`;
  const colCode = `OFF-C${tag}`;
  let numberId = '';
  let secretUrl = '';
  const spies: any[] = [];
  const provider = {
    createInstance: vi.fn(async (_n: string, url: string) => { secretUrl = url; return { base64: 'QR', state: 'connecting' as const }; }),
    connect: vi.fn(), info: vi.fn(async () => { throw new ProviderError('nao existe', 404); }), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText: vi.fn(async () => ({ id: `T-${crypto.randomUUID()}` })),
    sendImage: vi.fn(async () => ({ id: `I-${crypto.randomUUID()}` }))
  } as unknown as WhatsAppProvider;
  let script: AiReply[] = [];
  let lastSystem = '';
  const fakeAi = async (messages: any[]) => {
    lastSystem = String(messages[0]?.content || '');
    return script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };
  };
  const convOf = async (jid: string) => (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0].id as string;
  const says = async (jid: string, text: string) => {
    await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Ana', message: { conversation: text } }
    });
    return convOf(jid);
  };
  const ordersOf = async (conv: string) =>
    (await pool.query(
      `SELECT o.total_amount, oi.offer_id FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.whatsapp_conversation_id = $1 ORDER BY o.created_at`,
      [conv]
    )).rows;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0138b@norqva.test', 'Admin 0138', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Trattoria 0138')`, [brandId, `B38${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id)
       VALUES ($1, $2, 'Livros 0138', 'Receitas', 'Livros de cozinha', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-E${tag}`, brandId]
    );
    const card = `TRUE, 10, 1, 2.99`;
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance,
                           card_enabled, card_max_installments, card_free_installments, card_interest_monthly, created_at)
       VALUES ($1, $2, 'Trattoria em Casa', $3, 19.90, NULL, 'ATIVA', 'Livro', false, 'COMMERCIAL_PRODUCTION', ${card}, '2026-09-01T12:00:00Z'),
              ($4, $5, 'Kit Trattoria Completo — 5 livros', $3, 94.50, 29.90, 'ATIVA', 'Os 5 livros', false, 'COMMERCIAL_PRODUCTION', ${card}, '2026-10-01T12:00:00Z')`,
      [bookId, bookCode, productId, kitId, kitCode]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, bonus, status, description, is_demo, data_provenance,
                           card_enabled, card_max_installments, card_free_installments, card_interest_monthly, created_at,
                           attendant_featured, attendant_alternative_offer_id)
       VALUES ($1, $2, 'Coleção Trattoria Completa 0138', $3, 94.50, 47.00, 'Cardápio italiano de 4 semanas com lista de compras (PDF)', 'RASCUNHO',
               'Os 5 livros e o bônus', false, 'COMMERCIAL_PRODUCTION', ${card}, '2026-10-26T12:00:00Z', TRUE, $4)`,
      [colId, colCode, productId, kitId]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0138 Atendimento', brand_id: brandId });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511933334444@s.whatsapp.net' } });
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    if (!pool) return;
    const q = (s: string, p: any[]) => pool.query(s, p).catch(() => {});
    const orders = (await pool.query(`SELECT o.id FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id WHERE c.number_id = $1`, [numberId])).rows.map((r: any) => r.id);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0138.${tag}@example.com`])).rows.map((r: any) => r.id);
    await q('DELETE FROM payment_provider_customers WHERE customer_id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [custs]);
    await q('UPDATE offers SET attendant_alternative_offer_id = NULL WHERE id = $1', [colId]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[colId, kitId, bookId]]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
    await q('DELETE FROM brands WHERE id = $1', [brandId]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    setAttendantAiForTests(fakeAi as any);
    script = [];
    lastSystem = '';
    let n = 0;
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0138'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCardPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockImplementation(async () => ({
        providerPaymentId: `pay_0138_${tag}_${++n}_${crypto.randomUUID().slice(0, 6)}`, pixCopyPaste: '00020101PIX0138', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'QRPNG'
      }) as any)
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  it('coleção em RASCUNHO: fora do catálogo, sem destaque, e a cobrança dela é recusada', async () => {
    const catalog = await loadCatalog(pool, brandId);
    expect(catalog.map(c => c.code)).toEqual([bookCode, kitCode]);
    expect(catalog.some(c => c.featured)).toBe(false);

    const conv = await says('5531911110001@s.whatsapp.net', 'Oi, quero os livros');
    script = [
      { content: null, tool_calls: [{ id: 'p1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: colCode, full_name: 'Ana Souza', email: `ana.0138.${tag}@example.com` }) }] },
      { content: 'Certo.', tool_calls: [] }
    ];
    await processConversation(pool, conv, ['CPF 529.982.247-25']);
    expect(lastSystem).toContain(kitCode);
    expect(lastSystem).not.toContain(colCode);
    expect(lastSystem).not.toContain('[RECOMENDADO]');
    expect(await ordersOf(conv)).toHaveLength(0);
  });

  it('as duas ATIVAS: coleção primeiro e recomendada, kit de 5 logo depois como alternativa, o resto em seguida', async () => {
    await pool.query(`UPDATE offers SET status = 'ATIVA' WHERE id = $1`, [colId]);
    const catalog = await loadCatalog(pool, brandId);
    expect(catalog.map(c => c.code)).toEqual([colCode, kitCode, bookCode]);
    expect(catalog[0].featured).toBe(true);
    expect(catalog[0].alternativeCode).toBe(kitCode);
    const text = catalogText(catalog);
    expect(text).toContain(`Código ${colCode}: Coleção Trattoria Completa 0138 [RECOMENDADO]`);
    expect(text).toContain('Pix (à vista): R$ 47,00 (preço cheio R$ 94,50)');
    expect(text).toContain('10x de R$ 5,51 com juros (total R$ 55,10)');
    expect(text).toContain(`apresente o código ${kitCode}`);
    expect(text).toContain(`alternativa mais em conta ao código ${colCode}`);
    expect(text).toContain('Bônus: Cardápio italiano de 4 semanas');

    const conv = await says('5531911110002@s.whatsapp.net', 'Boa noite');
    await processConversation(pool, conv, []);
    const iCol = lastSystem.indexOf(`Código ${colCode}`);
    const iKit = lastSystem.indexOf(`Código ${kitCode}`);
    const iBook = lastSystem.indexOf(`Código ${bookCode}`);
    expect(iCol).toBeGreaterThan(-1);
    expect(iCol).toBeLessThan(iKit);
    expect(iKit).toBeLessThan(iBook);
  });

  it('o cliente escolhe: gera o Pix do kit (R$ 29,90) ou da coleção (R$ 47,00)', async () => {
    const pix = AsaasPaymentProvider.prototype.createPixPayment as any;
    const conv = await says('5531911110003@s.whatsapp.net', 'Prefiro o kit mais barato');
    script = [
      { content: null, tool_calls: [{ id: 'k1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: kitCode, full_name: 'Ana Souza', email: `ana.0138.${tag}@example.com` }) }] },
      { content: 'Aqui está o Pix do kit.', tool_calls: [] }
    ];
    await processConversation(pool, conv, ['CPF 529.982.247-25']);
    expect(pix).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 29.9 }));

    const conv2 = await says('5531911110004@s.whatsapp.net', 'Quero a coleção completa');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: colCode, full_name: 'Bia Lima', email: `bia.0138.${tag}@example.com` }) }] },
      { content: 'Aqui está o Pix da coleção.', tool_calls: [] }
    ];
    await processConversation(pool, conv2, ['CPF 111.444.777-35']);
    expect(pix).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 47 }));
    const a = await ordersOf(conv);
    const b = await ordersOf(conv2);
    expect(a.map((r: any) => [r.offer_id, Number(r.total_amount)])).toEqual([[kitId, 29.9]]);
    expect(b.map((r: any) => [r.offer_id, Number(r.total_amount)])).toEqual([[colId, 47]]);
  });

  it('kit fora de venda: a coleção continua em destaque, sem citar alternativa', async () => {
    await pool.query(`UPDATE offers SET status = 'PAUSADA' WHERE id = $1`, [kitId]);
    try {
      const catalog = await loadCatalog(pool, brandId);
      expect(catalog.map(c => c.code)).toEqual([colCode, bookCode]);
      expect(catalog[0].alternativeCode).toBeNull();
      const text = catalogText(catalog);
      expect(text).toContain('[RECOMENDADO]');
      expect(text).not.toContain(kitCode);
      expect(text).not.toContain('alternativa mais em conta');
    } finally {
      await pool.query(`UPDATE offers SET status = 'ATIVA' WHERE id = $1`, [kitId]);
    }
  });

  it('coleção de volta a RASCUNHO: some do catálogo de novo', async () => {
    await pool.query(`UPDATE offers SET status = 'RASCUNHO' WHERE id = $1`, [colId]);
    const catalog = await loadCatalog(pool, brandId);
    expect(catalog.map(c => c.code)).toEqual([bookCode, kitCode]);
    expect(catalogText(catalog)).not.toContain('[RECOMENDADO]');
  });
});

describe.sequential('NORQVA-0138 — ativar a coleção só depois do PDF do bônus', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const kitId = crypto.randomUUID();
  const colId = crypto.randomUUID();
  const plainId = crypto.randomUUID();
  const assets: string[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0138c@norqva.test', 'Admin 0138', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, $2, 'Coleção 0138c', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION')`,
      [productId, `PRD-F${tag}`]
    );
    for (let i = 0; i < 6; i++) {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, false)`,
        [id, `arquivo ${i}`, `books/0138c-${tag}-${i}.pdf`]
      );
      assets.push(id);
    }
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Kit 0138c', $3, 94.50, 29.90, 'ATIVA', 'Os 5 livros', false, 'COMMERCIAL_PRODUCTION'),
              ($4, $5, 'Livro com bônus 0138c', $3, 19.90, NULL, 'RASCUNHO', 'Livro', false, 'COMMERCIAL_PRODUCTION')`,
      [kitId, `OFF-G${tag}`, productId, plainId, `OFF-P${tag}`]
    );
    await pool.query(`UPDATE offers SET bonus = 'Um bônus' WHERE id = $1`, [plainId]);
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, bonus, status, description, is_demo, data_provenance,
                           attendant_featured, attendant_alternative_offer_id)
       VALUES ($1, $2, 'Coleção 0138c', $3, 94.50, 47.00, 'Cardápio italiano de 4 semanas com lista de compras (PDF)', 'RASCUNHO', 'Os 5 livros e o bônus',
               false, 'COMMERCIAL_PRODUCTION', TRUE, $4)`,
      [colId, `OFF-H${tag}`, productId, kitId]
    );
    for (const a of assets.slice(0, 5)) {
      await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [kitId, a]);
      await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [colId, a]);
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const q = (s: string, p: any[]) => pool.query(s, p).catch(() => {});
    await q('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [[kitId, colId, plainId]]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [assets]);
    await q('UPDATE offers SET attendant_alternative_offer_id = NULL WHERE id = $1', [colId]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[colId, kitId, plainId]]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
  });

  const activate = (id: string) => request(app).put(`/api/offers/${id}`).set('Authorization', `Bearer ${admin}`).send({ status: 'ATIVA' });

  it('só com os 5 PDFs do kit: recusa com "Envie o PDF do bônus antes de ativar"', async () => {
    const r = await activate(colId);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('Envie o PDF do bônus antes de ativar.');
    expect((await pool.query('SELECT status FROM offers WHERE id = $1', [colId])).rows[0].status).toBe('RASCUNHO');
  });

  it('com o 6º PDF (o bônus) ligado: ativa', async () => {
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [colId, assets[5]]);
    const r = await activate(colId);
    expect(r.status).toBe(200);
    expect(r.body.offer.status).toBe('ATIVA');
  });

  it('oferta com bônus mas sem destaque nem alternativa: a regra antiga continua', async () => {
    const r = await activate(plainId);
    expect(r.status).toBe(200);
    expect(r.body.offer.status).toBe('ATIVA');
  });
});
