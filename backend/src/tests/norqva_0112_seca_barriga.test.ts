// NORQVA-0112: Seca Barriga vendido pelo checkout do NORQVA. Confere, pelo mesmo caminho que o administrador vai
// usar depois do deploy, que dá para criar marca, produto e oferta com cartão, ligar vários PDFs à oferta, e que
// a entrega dos vários arquivos só sai com o pedido PAID. Armazenamento simulado (nunca fala com o Supabase).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setStorageClient, StorageClient, deliveryTitle, MAX_OFFER_FILES } from '../services/delivery/deliveryFileService';
import { finalizePaidOrder, publicCardTerms } from '../controllers/api';
import { brandSenderNameForOrder } from '../services/emailSender';

const pdf = (label: string) => Buffer.from(`%PDF-1.7\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n`, 'latin1');

class FakeStorage implements StorageClient {
  files = new Map<string, Buffer>();
  uploads: string[] = [];
  async exists(bucket: string, path: string) {
    return this.files.has(`${bucket}/${path}`);
  }
  async upload(bucket: string, path: string, data: Buffer) {
    const key = `${bucket}/${path}`;
    if (this.files.has(key)) throw new Error('já existe');
    this.uploads.push(key);
    this.files.set(key, Buffer.from(data));
  }
}

describe('NORQVA-0112 — nome do arquivo que o comprador vê', () => {
  it('usa o título enviado; sem título, o nome do arquivo sem .pdf e sem "_"', () => {
    expect(deliveryTitle(undefined, '01_Guia_do_Desafio.pdf')).toBe('01 Guia do Desafio');
    expect(deliveryTitle(encodeURIComponent('03 · Cardápio Acumulador — Padrão'), '03_Cardapio_Acumulador_Padrao.pdf')).toBe('03 · Cardápio Acumulador — Padrão');
    expect(deliveryTitle('', null)).toBeNull();
    expect(MAX_OFFER_FILES).toBe(20);
  });
});

describe.sequential('NORQVA-0112 — Seca Barriga: cadastro pela API, vários PDFs e entrega só com PAID', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  let fake: FakeStorage;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const ids = { brand: '', product: '', offer: '', orders: [] as string[], customers: [] as string[], payments: [] as string[] };

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) => request(app).put(url).set('Authorization', `Bearer ${token}`)
  });
  const sendPdf = (r: request.Test, buf: Buffer, name: string) =>
    r.set('Content-Type', 'application/pdf').set('x-file-name', encodeURIComponent(name)).send(buf);

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
    adminToken = await mk('admin.norqva0112@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0112@norqva.test', 'PERFORMANCE');
  });

  beforeEach(() => {
    fake = new FakeStorage();
    setStorageClient(fake);
  });

  afterAll(async () => {
    setStorageClient(null);
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    if (ids.orders.length) {
      await q('DELETE FROM order_deliveries WHERE order_id = ANY($1::uuid[])', [ids.orders]);
      await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [ids.orders]);
      await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [ids.orders]);
      await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [ids.orders]);
    }
    if (ids.customers.length) await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [ids.customers]);
    if (ids.offer) {
      const assets = await pool.query('SELECT asset_id FROM offer_digital_assets WHERE offer_id = $1', [ids.offer]).catch(() => ({ rows: [] as any[] }));
      await q('DELETE FROM offer_digital_assets WHERE offer_id = $1', [ids.offer]);
      await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [assets.rows.map((r: any) => r.asset_id)]);
      await q('DELETE FROM offers WHERE id = $1', [ids.offer]);
    }
    if (ids.product) await q('DELETE FROM products WHERE id = $1', [ids.product]);
    if (ids.brand) await q('DELETE FROM brands WHERE id = $1', [ids.brand]);
  });

  it('cria marca, produto ligado à marca e oferta ATIVA de R$ 37,00 com Pix e cartão (regras dos livros)', async () => {
    const brand = await as(adminToken).post('/api/brands').send({ name: `Seca Barriga 21 Dias ${tag}` });
    expect(brand.status).toBe(201);
    ids.brand = brand.body.id;
    expect(brand.body.code).toBe(`SECA_BARRIGA_21_DIAS_${tag}`);

    const product = await as(adminToken).post('/api/products').send({
      name: 'Desafio Seca Barriga 21 Dias',
      category: 'Emagrecimento',
      description: 'Desafio de 21 dias com guia, receitas, 6 cardápios e 2 bônus (10 PDFs).'
    });
    expect(product.status).toBe(201);
    ids.product = product.body.product.id;
    expect(product.body.product.data_provenance).toBe('COMMERCIAL_PRODUCTION');

    const link = await as(adminToken).put(`/api/brands/${ids.brand}/products/${ids.product}`).send({});
    expect(link.status).toBe(200);
    expect(link.body.brand_id).toBe(ids.brand);

    const offer = await as(adminToken).post('/api/offers').send({
      product_id: ids.product,
      name: 'Desafio Seca Barriga 21 Dias',
      price: 37,
      description: 'Desafio Seca Barriga 21 Dias: 10 PDFs entregues depois do pagamento confirmado.'
    });
    expect(offer.status).toBe(201);
    ids.offer = offer.body.offer.id;
    expect(offer.body.offer.status).toBe('RASCUNHO');

    const card = await as(adminToken).put(`/api/offers/${ids.offer}`).send({
      card_enabled: true, card_max_installments: 10, card_free_installments: 1, card_interest_monthly: 2.99, card_total_price: null
    });
    expect(card.status).toBe(200);
    expect(card.body.offer.card_enabled).toBe(true);
  });

  it('só ADMIN adiciona PDF; /delivery-files/extra liga um PDF atrás do outro (a rota antiga segue só para o primeiro)', async () => {
    expect((await sendPdf(as(perfToken).post(`/api/offers/${ids.offer}/delivery-files/extra`), pdf('x'), 'x.pdf')).status).toBe(403);
    expect((await request(app).post(`/api/offers/${ids.offer}/delivery-files/extra`).set('Content-Type', 'application/pdf').send(pdf('x'))).status).toBe(401);
    expect(fake.uploads).toHaveLength(0);

    const first = await sendPdf(as(adminToken).post(`/api/offers/${ids.offer}/delivery-files/extra`), pdf('guia'), '01_Guia_do_Desafio.pdf');
    expect(first.status).toBe(201);
    expect(first.body.name).toBe('01 Guia do Desafio');
    // a rota antiga continua recusando um segundo arquivo
    const again = await sendPdf(as(adminToken).post(`/api/offers/${ids.offer}/delivery-files`), pdf('receitas'), '02_Livro_de_Receitas.pdf');
    expect(again.status).toBe(409);

    const second = await sendPdf(as(adminToken).post(`/api/offers/${ids.offer}/delivery-files/extra`), pdf('receitas'), '02_Livro_de_Receitas.pdf');
    expect(second.status).toBe(201);
    expect(second.body.name).toBe('02 Livro de Receitas');
    const third = await sendPdf(
      as(adminToken).post(`/api/offers/${ids.offer}/delivery-files/extra?title=${encodeURIComponent('03 · Cardápio Acumulador — Padrão')}`),
      pdf('cardapio'),
      '03_Cardapio_Acumulador_Padrao.pdf'
    );
    expect(third.status).toBe(201);
    expect(third.body.name).toBe('03 · Cardápio Acumulador — Padrão');
    expect(fake.uploads).toHaveLength(3);
    expect(new Set(fake.uploads).size).toBe(3);

    // o mesmo PDF duas vezes não entra
    const dup = await sendPdf(as(adminToken).post(`/api/offers/${ids.offer}/delivery-files/extra`), pdf('receitas'), 'copia.pdf');
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/já está na entrega/);
    // o que não é PDF não entra
    const bad = await sendPdf(as(adminToken).post(`/api/offers/${ids.offer}/delivery-files/extra`), Buffer.from('<html>'), 'x.pdf');
    expect(bad.status).toBe(400);

    const list = await as(adminToken).get(`/api/offers/${ids.offer}/delivery-files`);
    expect(list.status).toBe(200);
    expect(list.body.assets.map((a: any) => a.name)).toEqual(['01 Guia do Desafio', '02 Livro de Receitas', '03 · Cardápio Acumulador — Padrão']);
    expect(list.body.assets.map((a: any) => a.file_original_name)).toEqual(['01_Guia_do_Desafio.pdf', '02_Livro_de_Receitas.pdf', '03_Cardapio_Acumulador_Padrao.pdf']);

    const audit = await pool.query("SELECT count(*)::int AS n FROM audit_logs WHERE event_type = 'DELIVERY_FILE_ADDED' AND description LIKE $1", [`%${list.body.offer_human_id}%`]);
    expect(audit.rows[0].n).toBe(3);
  });

  it('oferta passa a ATIVA com R$ 37,00 e o cartão dos livros (1x sem juros, até 10x com 2,99% a.m.)', async () => {
    const act = await as(adminToken).put(`/api/offers/${ids.offer}`).send({ status: 'ATIVA' });
    expect(act.status).toBe(200);
    expect(act.body.offer.status).toBe('ATIVA');
    expect(Number(act.body.offer.price)).toBe(37);
    expect(act.body.offer.data_provenance).toBe('COMMERCIAL_PRODUCTION');
    const card = publicCardTerms(act.body.offer)!;
    expect(card.plan).toEqual({ max: 10, free: 1, rate: 2.99 });
    expect(card.total).toBe(37);
    expect(card.max_installments).toBe(1);
  });

  it('pedido pendente não recebe nada; depois de PAID recebe todos os PDFs, e o e-mail sai com o nome da marca', async () => {
    const customerId = crypto.randomUUID();
    await pool.query('INSERT INTO customers (id, name, email, is_demo) VALUES ($1, $2, $3, false)', [customerId, 'Ana Souza', `c0112_${tag.toLowerCase()}@example.com`]);
    ids.customers.push(customerId);
    const orderId = crypto.randomUUID();
    const token = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance, checkout_token_hash)
       VALUES ($1, $2, 37.00, 'PENDING', $3, false, 'COMMERCIAL_PRODUCTION', $4)`,
      [orderId, customerId, crypto.randomUUID(), hash]
    );
    ids.orders.push(orderId);
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price)
       VALUES ($1, $2, $3, 'Desafio Seca Barriga 21 Dias', 'Desafio Seca Barriga 21 Dias', 37.00, 1, 37.00)`,
      [orderId, ids.offer, ids.product]
    );

    const pending = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(pending.status).toBe(403);
    expect((await pool.query('SELECT count(*)::int AS n FROM order_deliveries WHERE order_id = $1', [orderId])).rows[0].n).toBe(0);

    // pagamento confirmado pelo provedor (a mesma função que o webhook e a conferência do Asaas usam)
    const paymentId = crypto.randomUUID();
    const providerPaymentId = `pay_${crypto.randomUUID().slice(0, 10)}`;
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, $3, 'ASAAS', 'PENDING', 37.00, $4, false, $5, $6)`,
      [paymentId, `PMT-0112-${tag}`, orderId, crypto.randomUUID(), paymentId, providerPaymentId]
    );
    ids.payments.push(paymentId);
    const client = await pool.connect();
    try {
      await finalizePaidOrder(
        paymentId,
        { providerPaymentId, externalReference: paymentId, amount: 37, status: 'CONFIRMED', environment: 'SANDBOX', reconciledAt: new Date() },
        client
      );
    } finally {
      client.release();
    }
    expect((await pool.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0].status).toBe('PAID');
    const paid = await request(app).get(`/api/checkout/orders/${orderId}/delivery-tokens`).set('x-checkout-token', token);
    expect(paid.status).toBe(200);
    expect(paid.body.deliveries).toHaveLength(3);
    expect(paid.body.deliveries.every((d: any) => d.status === 'ACTIVE' && typeof d.rawToken === 'string')).toBe(true);
    expect(paid.body.deliveries.map((d: any) => d.assetTitle).sort()).toEqual(['01 Guia do Desafio', '02 Livro de Receitas', '03 · Cardápio Acumulador — Padrão']);

    expect(await brandSenderNameForOrder(pool, orderId)).toBe(`Seca Barriga 21 Dias ${tag}`);
  });
});
