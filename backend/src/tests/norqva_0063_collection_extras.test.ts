// NORQVA-0063: checkout do kit com livros avulsos. O navegador manda só os códigos das ofertas dos livros;
// preço, oferta e produto vêm do servidor; tudo num pedido só; entrega de todos só com PAID (Asaas simulado).
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
import { saleBookKey, FIXED_BOOK_OFFERS } from '../services/catalog/collectionBooks';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';

describe('NORQVA-0063 — qual livro cada oferta vende', () => {
  it('Trattoria e Dolci pelo código fixo da oferta; os volumes pela chave do produto', () => {
    expect(saleBookKey({ human_id: FIXED_BOOK_OFFERS.trattoria }, { name: 'Qualquer nome' })).toBe('trattoria');
    expect(saleBookKey({ human_id: 'off-000005' }, { name: 'x' })).toBe('dolci');
    expect(saleBookKey({ human_id: 'OFF-999999' }, { collection_key: 'paes', name: 'x' })).toBe('paes');
    expect(saleBookKey({ human_id: 'OFF-999999' }, { name: 'Risotos & Polentas' })).toBe('risotos');
    expect(saleBookKey({ human_id: 'OFF-999999' }, { name: 'Kit Cozinha Italiana' })).toBeNull();
  });
});

describe.sequential('NORQVA-0063 — pedido com livros avulsos', () => {
  let pool: Pool;
  let adminToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const prod = { paes: crypto.randomUUID(), antipasti: crypto.randomUUID(), risotos: crypto.randomUUID(), outro: crypto.randomUUID() };
  const off = { paes: crypto.randomUUID(), antipasti: crypto.randomUUID(), risotos: crypto.randomUUID(), outro: crypto.randomUUID(), paes2: crypto.randomUUID() };
  const code = { paes: `OFF-P63${tag}`, antipasti: `OFF-A63${tag}`, risotos: `OFF-R63${tag}`, outro: `OFF-X63${tag}`, paes2: `OFF-Q63${tag}` };
  const asset = { paes: crypto.randomUUID(), antipasti: crypto.randomUUID(), risotos: crypto.randomUUID(), outro: crypto.randomUUID(), paes2: crypto.randomUUID() };
  const PRICE = { paes: 19.9, antipasti: 19.9, risotos: 14.9 };
  const orders: string[] = [];
  const customers: string[] = [];
  let payAmount = 0;
  let spy: any;

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const r = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.norqva0063@norqva.test', 'admin 0063', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE'
       RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    adminToken = signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role: 'ADMIN' });

    const products: [string, string, string | null][] = [
      [prod.paes, `Pães 0063 ${tag}`, 'paes'],
      [prod.antipasti, `Antipasti 0063 ${tag}`, 'antipasti'],
      [prod.risotos, `Risotos 0063 ${tag}`, 'risotos'],
      [prod.outro, `Outro 0063 ${tag}`, null]
    ];
    for (const [id, name, key] of products) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo, collection_key) VALUES ($1, $2, $3, 'Receitas', 'Fixture', 'PLANEJADO', true, $4)`,
        [id, `PRD-${tag}-${id.slice(0, 4)}`, name, key]
      );
    }
    const offers: [string, string, string, number, string][] = [
      [off.paes, code.paes, prod.paes, PRICE.paes, 'ATIVA'],
      [off.antipasti, code.antipasti, prod.antipasti, PRICE.antipasti, 'ATIVA'],
      [off.risotos, code.risotos, prod.risotos, PRICE.risotos, 'ATIVA'],
      [off.outro, code.outro, prod.outro, 9.9, 'ATIVA'],
      // segunda oferta do mesmo livro (Pães), em TESTE: não pode entrar como avulso
      [off.paes2, code.paes2, prod.paes, 9.9, 'TESTE']
    ];
    for (const [id, human, product, price, status] of offers) {
      await pool.query(
        `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, $3, $4, $5, $6, 'Fixture', true)`,
        [id, human, `Livro ${human}`, product, price, status]
      );
    }
    for (const k of Object.keys(asset) as (keyof typeof asset)[]) {
      await pool.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, true)`,
        [asset[k], `0063-${k}.pdf`, `books/0063-${k}-${tag}.pdf`]
      );
      await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [off[k], asset[k]]);
    }
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
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await q('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [Object.values(off)]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [Object.values(asset)]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [Object.values(off)]);
    await q('DELETE FROM products WHERE id = ANY($1::uuid[])', [Object.values(prod)]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    clearTestEmails();
    (emailService as any).setProvider(null);
    spy = vi.spyOn(AsaasPaymentProvider.prototype, 'getPayment').mockImplementation(async (id: string) => ({ id, status: 'RECEIVED', amount: payAmount }) as any);
  });
  afterEach(() => spy.mockRestore());

  async function customer() {
    const id = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [id, 'Maria 0063', `m0063_${id.slice(0, 8)}@example.com`, '11999990000']);
    customers.push(id);
    return id;
  }

  async function checkout(mainOffer: string, body: any = {}) {
    const r = await request(app)
      .post('/api/checkout?mode=demo')
      .send({ offer_id: mainOffer, customer_id: await customer(), quantity: 1, idempotency_key: crypto.randomUUID(), ...body });
    if (r.body?.id) orders.push(r.body.id);
    return r;
  }

  let orderId = '';
  const TOTAL = Math.round((PRICE.paes + PRICE.antipasti + PRICE.risotos) * 100) / 100;

  it('três livros num pedido: total do servidor (preço do navegador é ignorado), um item por livro', async () => {
    const r = await checkout(off.paes, { extra_offer_human_ids: [code.antipasti, code.risotos.toLowerCase()], total_amount: 1, price: 0.01 });
    expect(r.status).toBe(201);
    expect(Number(r.body.total_amount)).toBeCloseTo(TOTAL, 2);
    expect(r.body.items).toHaveLength(3);
    expect(r.body.items[0].offer_id).toBe(off.paes);
    expect(r.body.items[0].is_bump).toBe(false);
    expect(r.body.items.slice(1).every((i: any) => i.is_bump === true)).toBe(true);
    expect(r.body.items.map((i: any) => i.offer_id).sort()).toEqual([off.paes, off.antipasti, off.risotos].sort());
    orderId = r.body.id;
  });

  it('sem livros extras, o pedido continua igual ao de hoje', async () => {
    const r = await checkout(off.risotos);
    expect(r.status).toBe(201);
    expect(r.body.items).toHaveLength(1);
    expect(Number(r.body.total_amount)).toBeCloseTo(PRICE.risotos, 2);
  });

  it('recusa livro repetido, o próprio livro principal e lista vazia ou grande demais', async () => {
    expect((await checkout(off.paes, { extra_offer_human_ids: [code.antipasti, code.antipasti] })).status).toBe(400);
    expect((await checkout(off.paes, { extra_offer_human_ids: [code.paes] })).status).toBe(400);
    expect((await checkout(off.paes, { extra_offer_human_ids: [] })).status).toBe(400);
    expect((await checkout(off.paes, { extra_offer_human_ids: ['A', 'B', 'C', 'D', 'E'] })).status).toBe(400);
    expect((await checkout(off.paes, { extra_offer_human_ids: 'OFF-1' })).status).toBe(400);
  });

  it('recusa a segunda oferta do mesmo livro (não está ATIVA e repetiria o livro)', async () => {
    const r = await checkout(off.antipasti, { extra_offer_human_ids: [code.paes2] });
    expect(r.status).toBe(409);
    await pool.query(`UPDATE offers SET status = 'ATIVA' WHERE id = $1`, [off.paes2]);
    const dup = await checkout(off.paes, { extra_offer_human_ids: [code.paes2] });
    expect(dup.status).toBe(400);
    await pool.query(`UPDATE offers SET status = 'TESTE' WHERE id = $1`, [off.paes2]);
  });

  it('recusa livro de fora da coleção, como extra ou como principal', async () => {
    expect((await checkout(off.paes, { extra_offer_human_ids: [code.outro] })).status).toBe(400);
    expect((await checkout(off.outro, { extra_offer_human_ids: [code.paes] })).status).toBe(400);
  });

  it('recusa livros avulsos junto com o adicional, ou com quantidade maior que 1', async () => {
    expect((await checkout(off.paes, { extra_offer_human_ids: [code.antipasti], with_bump: true })).status).toBe(400);
    expect((await checkout(off.paes, { extra_offer_human_ids: [code.antipasti], quantity: 2 })).status).toBe(400);
  });

  it('recusa dois livros com o mesmo arquivo de entrega', async () => {
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [off.risotos, asset.paes]);
    const r = await checkout(off.paes, { extra_offer_human_ids: [code.risotos] });
    expect(r.status).toBe(409);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1 AND asset_id = $2', [off.risotos, asset.paes]);
  });

  it('pedido não pago não tem entrega; pago (confirmado no Asaas), libera os três livros', async () => {
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM order_deliveries WHERE order_id = $1', [orderId]);
    expect(before.rows[0].n).toBe(0);
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', $3, $4, true, $5, $6)`,
      [`PMT-0063-${crypto.randomUUID().slice(0, 8)}`, orderId, TOTAL, crypto.randomUUID(), crypto.randomUUID(), `pay_${crypto.randomUUID().slice(0, 10)}`]
    );
    payAmount = TOTAL;
    const r = await request(app).post(`/api/sales/orders/${orderId}/check-payment?mode=demo`).set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PAID');
    const d = await pool.query('SELECT asset_id FROM order_deliveries WHERE order_id = $1', [orderId]);
    expect(d.rows.map((x: any) => x.asset_id).sort()).toEqual([asset.paes, asset.antipasti, asset.risotos].sort());
  });
});

describe.sequential('NORQVA-0063 — lista pública da coleção', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const prd = crypto.randomUUID();
  const offId = crypto.randomUUID();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, collection_key) VALUES ($1, $2, 'Antipasti & Aperitivo', 'Receitas', 'x', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', 'antipasti')`,
      [prd, `PRD-L63${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo, data_provenance) VALUES ($1, $2, 'Antipasti', $3, 19.90, 'ATIVA', 'x', false, 'COMMERCIAL_PRODUCTION')`,
      [offId, `OFF-0000L${tag}`, prd]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query('DELETE FROM offers WHERE id = $1', [offId]).catch(() => {});
    await pool.query('DELETE FROM products WHERE id = $1', [prd]).catch(() => {});
  });

  it('cada livro traz o id da oferta e o cartão (null quando a oferta não aceita cartão)', async () => {
    const r = await request(app).get('/api/public/collection');
    expect(r.status).toBe(200);
    const b = r.body.books.find((x: any) => x.human_id === `OFF-0000L${tag}`) || r.body.books.find((x: any) => x.book === 'antipasti');
    expect(b).toBeTruthy();
    expect(Object.keys(b).sort()).toEqual(['book', 'card', 'human_id', 'offer_id', 'price']);
    expect(typeof b.offer_id).toBe('string');
  });

  it('a oferta pública diz quantos PDFs entrega', async () => {
    const r = await request(app).get(`/api/public/offers/OFF-0000L${tag}`);
    expect(r.status).toBe(200);
    expect(r.body.delivery_files).toBe(0);
  });
});
