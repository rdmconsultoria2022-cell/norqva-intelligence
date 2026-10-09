// NORQVA-0032: adicional na hora do Pix (preço do servidor, mesmo pedido, entrega dos dois só com PAID) e
// promessas verificadas por produto. Nenhum teste fala com a Meta nem com o Asaas (Asaas simulado).
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
import { OpportunityService } from '../services/aiTeam/opportunityService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';

const MAIN = 19.9;
const BUMP = 14.9;

describe.sequential('NORQVA-0032 — adicional no Pix e promessas', () => {
  let pool: Pool;
  let adminToken: string;
  let productToken: string;
  let perfToken: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const productId = crypto.randomUUID();
  const bumpProductId = crypto.randomUUID();
  const otherProductId = crypto.randomUUID();
  const mainOffer = crypto.randomUUID();
  const bumpOffer = crypto.randomUUID();
  const mainAsset = crypto.randomUUID();
  const bumpAsset = crypto.randomUUID();
  const orders: string[] = [];
  const customers: string[] = [];
  const TOTAL = Math.round((MAIN + BUMP) * 100) / 100;
  let payAmount = TOTAL;
  let spy: any;

  const as = (token: string) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string, body: any = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    put: (url: string, body: any = {}) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url: string, body: any = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body)
  });

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
    adminToken = await mk('admin.norqva0032@norqva.test', 'ADMIN');
    productToken = await mk('product.norqva0032@norqva.test', 'PRODUCT');
    perfToken = await mk('perf.norqva0032@norqva.test', 'PERFORMANCE');

    for (const [id, name] of [[productId, 'Trattoria 0032'], [bumpProductId, 'Molhos 0032'], [otherProductId, 'Outro 0032']]) {
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, is_demo) VALUES ($1, $2, $3, 'Receitas', 'Fixture', 'PLANEJADO', true)`,
        [id, `PRD-${tag}-${id.slice(0, 4)}`, name]
      );
    }
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Trattoria 0032', $3, $4, 'ATIVA', 'Fixture', true)`,
      [mainOffer, `OFF-M${tag}`, productId, MAIN]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Molhos da Nonna 0032', $3, 29.9, 'TESTE', 'Fixture', true)`,
      [bumpOffer, `OFF-B${tag}`, bumpProductId]
    );
    for (const [id, path] of [[mainAsset, 'books/0032-main.pdf'], [bumpAsset, 'books/0032-bump.pdf']]) {
      await pool.query(
        `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, $2, 'SUPABASE', 'digital-products', $3, true)`,
        [id, path, path]
      );
    }
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [mainOffer, mainAsset]);
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
    await q('DELETE FROM offer_bumps WHERE offer_id = $1', [mainOffer]);
    await q('DELETE FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [[mainOffer, bumpOffer]]);
    await q('DELETE FROM digital_assets WHERE id = ANY($1::uuid[])', [[mainAsset, bumpAsset]]);
    await q('DELETE FROM claims_registry WHERE product_id = ANY($1::uuid[])', [[productId, otherProductId]]);
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
    await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [id, 'Maria 0032', `m0032_${id.slice(0, 8)}@example.com`, '11999990000']);
    customers.push(id);
    return id;
  }

  async function checkout(body: any) {
    const r = await request(app)
      .post('/api/checkout?mode=demo')
      .send({ offer_id: mainOffer, customer_id: await customer(), quantity: 1, idempotency_key: crypto.randomUUID(), ...body });
    if (r.body?.id) orders.push(r.body.id);
    return r;
  }

  it('só ADMIN configura o adicional', async () => {
    const r = await as(productToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: bumpOffer, bump_price: BUMP, is_active: true });
    expect(r.status).toBe(403);
  });

  it('não liga adicional sem arquivo próprio, nem com o mesmo arquivo da principal', async () => {
    const noFile = await as(adminToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: bumpOffer, bump_price: BUMP, is_active: true });
    expect(noFile.status).toBe(409);
    expect(noFile.body.error).toMatch(/arquivo/);

    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [bumpOffer, mainAsset]);
    const shared = await as(adminToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: bumpOffer, bump_price: BUMP, is_active: true });
    expect(shared.status).toBe(409);
    expect(shared.body.error).toMatch(/mesmo arquivo/);
    await pool.query('DELETE FROM offer_digital_assets WHERE offer_id = $1 AND asset_id = $2', [bumpOffer, mainAsset]);

    const bad = await as(adminToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: mainOffer, bump_price: BUMP });
    expect(bad.status).toBe(400);
  });

  it('desligado, o checkout recusa adicional e a página pública não mostra', async () => {
    const off = await as(adminToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: bumpOffer, bump_price: BUMP, is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.sellable).toBe(false);
    const pub = await request(app).get(`/api/public/offers/OFF-M${tag}`);
    expect(pub.body.bump).toBeNull();
    const r = await checkout({ with_bump: true });
    expect(r.status).toBe(409);
  });

  it('ligado, a página pública mostra o adicional com o preço do servidor', async () => {
    await pool.query('INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)', [bumpOffer, bumpAsset]);
    const on = await as(adminToken).put(`/api/offers/${mainOffer}/bump?mode=demo`, { bump_offer_id: bumpOffer, bump_price: '14,90', headline: 'Molhos para as receitas', is_active: true });
    expect(on.status).toBe(200);
    expect(on.body.sellable).toBe(true);
    const pub = await request(app).get(`/api/public/offers/OFF-M${tag}`);
    expect(pub.body.bump).toEqual({ offer_human_id: `OFF-B${tag}`, name: 'Molhos da Nonna 0032', headline: 'Molhos para as receitas', price: BUMP });
  });

  it('sem marcar, o pedido é igual ao de hoje', async () => {
    const r = await checkout({});
    expect(r.status).toBe(201);
    expect(Number(r.body.total_amount)).toBeCloseTo(MAIN, 2);
    expect(r.body.items).toHaveLength(1);
  });

  let bumpOrderId = '';
  let checkoutToken = '';
  it('marcado, o pedido tem os dois itens e o total vem do servidor (preço do navegador é ignorado)', async () => {
    const r = await checkout({ with_bump: true, bump_price: 0.01, total_amount: 1 });
    expect(r.status).toBe(201);
    expect(Number(r.body.total_amount)).toBeCloseTo(MAIN + BUMP, 2);
    expect(r.body.items).toHaveLength(2);
    expect(r.body.items[0].is_bump).toBe(false);
    expect(r.body.items[1].is_bump).toBe(true);
    expect(Number(r.body.items[1].unit_price)).toBeCloseTo(BUMP, 2);
    bumpOrderId = r.body.id;
    checkoutToken = r.body.checkout_token;
  });

  it('pedido não pago não tem entrega', async () => {
    const d = await pool.query('SELECT COUNT(*)::int AS n FROM order_deliveries WHERE order_id = $1', [bumpOrderId]);
    expect(d.rows[0].n).toBe(0);
  });

  it('pago (confirmado no Asaas), libera os dois arquivos', async () => {
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, external_reference, provider_payment_id)
       VALUES ($1, $2, 'ASAAS', 'PENDING', $3, $4, true, $5, $6)`,
      [`PMT-0032-${crypto.randomUUID().slice(0, 8)}`, bumpOrderId, TOTAL, crypto.randomUUID(), crypto.randomUUID(), `pay_${crypto.randomUUID().slice(0, 10)}`]
    );
    payAmount = TOTAL;
    const r = await as(adminToken).post(`/api/sales/orders/${bumpOrderId}/check-payment?mode=demo`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('PAID');
    const d = await pool.query('SELECT asset_id FROM order_deliveries WHERE order_id = $1 ORDER BY asset_id', [bumpOrderId]);
    expect(d.rows.map((x: any) => x.asset_id).sort()).toEqual([mainAsset, bumpAsset].sort());
  });

  it('a tela do comprador recebe as duas ofertas, principal primeiro', async () => {
    const r = await request(app).get(`/api/orders/${bumpOrderId}`).set('x-checkout-token', checkoutToken);
    expect(r.status).toBe(200);
    expect(r.body.offer_human_id).toBe(`OFF-M${tag}`);
    expect(r.body.offer_human_ids).toEqual([`OFF-M${tag}`, `OFF-B${tag}`]);
  });

  it('Vendas mostra o adicional; reenvio sem dizer qual arquivo é recusado', async () => {
    const s = await as(adminToken).get('/api/sales/orders?mode=demo&include_tests=true&period=all');
    const o = s.body.orders.find((x: any) => x.id === bumpOrderId);
    expect(o.offer_name).toBe('Trattoria 0032');
    expect(o.items.map((i: any) => i.is_bump)).toEqual([false, true]);
    const other = crypto.randomUUID();
    await pool.query(
      `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo) VALUES ($1, 'x', 'SUPABASE', 'digital-products', 'books/x.pdf', true)`,
      [other]
    );
    const re = await as(adminToken).post(`/api/admin/orders/${bumpOrderId}/reissue-delivery`, { assetId: other });
    expect(re.status).toBe(409);
    const same = await as(adminToken).post(`/api/admin/orders/${bumpOrderId}/reissue-delivery`, { assetId: bumpAsset });
    expect(same.status).toBe(200);
    const d = await pool.query('SELECT COUNT(*)::int AS n FROM order_deliveries WHERE order_id = $1', [bumpOrderId]);
    expect(d.rows[0].n).toBe(2);
    await pool.query('DELETE FROM digital_assets WHERE id = $1', [other]);
  });

  it('o rendimento do adicional aparece nos custos, mas só entra no equilíbrio a partir de 20 pedidos', async () => {
    await pool.query(
      `INSERT INTO offer_unit_economics (offer_id, tax_rate, gateway_fixed_fee, gateway_pct_fee, other_variable_cost, target_net_margin, is_demo)
       VALUES ($1, 0.06, 1.99, 0, 0, 0, true) ON CONFLICT (offer_id, is_demo) DO NOTHING`,
      [mainOffer]
    );
    const r = await as(adminToken).get(`/api/offers/${mainOffer}/unit-economics?mode=demo`);
    expect(r.status).toBe(200);
    expect(r.body.bump_stats).toMatchObject({ orders: 1, avg_bump: BUMP, min_orders: 20 });
    const { breakevenByProduct } = await import('../services/alerts/adAlertService');
    const be = await breakevenByProduct(pool, true);
    expect(be.get(productId)).toBeCloseTo(19.9 - (19.9 * 0.06 + 1.99), 2);
    await pool.query('DELETE FROM offer_unit_economics WHERE offer_id = $1', [mainOffer]);
  });

  it('promessas: PRODUCT cadastra (a verificar), análise só lê, ADMIN verifica', async () => {
    expect((await as(perfToken).post(`/api/products/${productId}/claims?mode=demo`, { claim_text: 'Pagamento por Pix', claim_type: 'OFFER_TERM' })).status).toBe(403);
    const c = await as(productToken).post(`/api/products/${productId}/claims?mode=demo`, { claim_text: 'Pagamento por Pix', claim_type: 'OFFER_TERM' });
    expect(c.status).toBe(201);
    expect(c.body.status).toBe('UNVERIFIED');
    const dup = await as(productToken).post(`/api/products/${productId}/claims?mode=demo`, { claim_text: 'pagamento por pix' });
    expect(dup.status).toBe(409);
    const list = await as(perfToken).get(`/api/products/${productId}/claims?mode=demo`);
    expect(list.status).toBe(200);
    expect(list.body.claims).toHaveLength(1);
    expect((await as(productToken).patch(`/api/creative-factory/claims/${c.body.id}?mode=demo`, { status: 'VERIFIED' })).status).toBe(403);
    const v = await as(adminToken).patch(`/api/creative-factory/claims/${c.body.id}?mode=demo`, { status: 'VERIFIED', note: 'ok' });
    expect(v.status).toBe(200);
  });

  it('o Time de IAs recebe só as promessas verificadas e válidas do produto da oportunidade', async () => {
    await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, is_demo) VALUES ($1, $2, 'Outro produto', 'FEATURE', 'VERIFIED', true)`,
      [`CLM-O${tag}`, otherProductId]
    );
    await pool.query(
      `INSERT INTO claims_registry (human_id, product_id, claim_text, claim_type, status, valid_until, is_demo) VALUES ($1, $2, 'Vencida', 'PRICE', 'VERIFIED', NOW() - INTERVAL '1 day', true)`,
      [`CLM-V${tag}`, productId]
    );
    const ctx = await new OpportunityService().context(pool, { product_id: productId }, true);
    const texts = ctx.verified_claims.map((c: any) => c.claim_text);
    expect(texts).toContain('Pagamento por Pix');
    expect(texts).not.toContain('Outro produto');
    expect(texts).not.toContain('Vencida');
  });
});
