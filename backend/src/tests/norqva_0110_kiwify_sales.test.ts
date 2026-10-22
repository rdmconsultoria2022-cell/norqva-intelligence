// NORQVA-0110 (D-0110): vendas da Kiwify no NORQVA — webhook assinado, Vendas e Financeiro.
// Nada fala com a Kiwify: os eventos são montados aqui e assinados com o token de teste.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { stripKiwifyPii, centsToReais, parseKiwifyDate, kiwifyTargetStatus } from '../services/commerce/kiwifySales';

const TOKEN = 'kiwify_test_token_0110';
const uid = crypto.randomBytes(4).toString('hex');
const CAMPAIGN = `NQ – Seca Barriga – Teste – Vendas ${uid}`;
const AD = `SB_AD_01_${uid}`;

const sign = (raw: string, token = TOKEN) => crypto.createHmac('sha1', token).update(raw).digest('hex');

function event(orderId: string, over: any = {}) {
  return {
    order_id: orderId,
    order_ref: `ref_${orderId}`,
    order_status: 'paid',
    webhook_event_type: 'order_approved',
    payment_method: 'pix',
    created_at: '2026-10-21 15:00',
    approved_date: new Date().toISOString(),
    refunded_at: null,
    card_last4digits: '4242',
    Product: { product_id: 'prod_sb', product_name: `Desafio Seca Barriga ${uid}` },
    Customer: {
      full_name: 'Ana Teste', first_name: 'Ana', email: `ana_${uid}@example.com`, mobile: '+5531999990000',
      CPF: '12345678909', ip: '10.0.0.1', street: 'Rua A', number: '10', city: 'BH', state: 'MG', zipcode: '30000000'
    },
    Commissions: { charge_amount: '4700', product_base_price: 4700, kiwify_fee: '470', my_commission: 4230, currency: 'BRL' },
    TrackingParameters: { utm_source: 'meta', utm_medium: 'pago', utm_campaign: CAMPAIGN, utm_content: AD, utm_term: null, src: null, sck: null },
    ...over
  };
}

describe.sequential('NORQVA-0110 — vendas da Kiwify', () => {
  let pool: Pool;
  let adminToken: string;
  let perfToken: string;
  const created: Record<string, string> = {};

  const post = (body: any, opts: { sig?: string | null; raw?: string } = {}) => {
    const raw = opts.raw ?? JSON.stringify(body);
    const sig = opts.sig === undefined ? sign(raw) : opts.sig;
    const url = sig === null ? '/api/webhooks/kiwify' : `/api/webhooks/kiwify?signature=${sig}`;
    return request(app).post(url).set('Content-Type', 'application/json').send(raw);
  };
  const sale = async (orderId: string) =>
    (await pool.query(`SELECT * FROM external_sales WHERE source = 'KIWIFY' AND external_order_id = $1`, [orderId])).rows;

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
    adminToken = await mk('admin.norqva0110@norqva.test', 'ADMIN');
    perfToken = await mk('perf.norqva0110@norqva.test', 'PERFORMANCE');

    const conn = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, token_reference) VALUES (FALSE, 'CONNECTED', 'env:TEST')
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED' RETURNING id`
    );
    const acc = await pool.query(
      "INSERT INTO meta_ad_accounts (meta_account_id, connection_id, name, currency, timezone_name, account_status, is_demo, data_provenance) VALUES ($1, $2, 'Conta 0110', 'BRL', 'America/Sao_Paulo', 1, FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`act_0110_${uid}`, conn.rows[0].id]
    );
    created.account = acc.rows[0].id;
    const cmp = await pool.query(
      "INSERT INTO meta_campaigns (meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance) VALUES ($1, $2, $3, 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`cmp_0110_${uid}`, acc.rows[0].id, CAMPAIGN]
    );
    created.campaign = cmp.rows[0].id;
    const set = await pool.query(
      "INSERT INTO meta_ad_sets (meta_adset_id, campaign_id, name, status, effective_status, is_demo, data_provenance) VALUES ($1, $2, 'SB_SET', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`set_0110_${uid}`, created.campaign]
    );
    created.adset = set.rows[0].id;
    const ad = await pool.query(
      "INSERT INTO meta_ads (meta_ad_id, adset_id, name, status, effective_status, is_demo, data_provenance) VALUES ($1, $2, $3, 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION') RETURNING id",
      [`ad_0110_${uid}`, created.adset, AD]
    );
    created.ad = ad.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM external_sales WHERE external_order_id LIKE $1`, [`%_${uid}`]);
    await pool.query('DELETE FROM meta_ads WHERE id = $1', [created.ad]);
    await pool.query('DELETE FROM meta_ad_sets WHERE id = $1', [created.adset]);
    await pool.query('DELETE FROM meta_campaigns WHERE id = $1', [created.campaign]);
    await pool.query('DELETE FROM meta_ad_accounts WHERE id = $1', [created.account]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    process.env.KIWIFY_WEBHOOK_TOKEN = TOKEN;
    delete process.env.KIWIFY_PRODUCT_IDS;
  });

  it('funções: centavos em texto, data de Brasília, eventos e retirada de dados pessoais', () => {
    expect(centsToReais('4700')).toBe(47);
    expect(centsToReais(1990)).toBe(19.9);
    expect(centsToReais('abc')).toBeNull();
    expect(parseKiwifyDate('2026-10-21 20:52')?.toISOString()).toBe('2026-10-21T23:52:00.000Z');
    expect(kiwifyTargetStatus({ webhook_event_type: 'pix_created', order_status: 'waiting_payment' })).toBeNull();
    expect(kiwifyTargetStatus({ order_status: 'chargedback' })).toBe('CHARGEBACK');
    const clean = stripKiwifyPii(event('x'));
    const text = JSON.stringify(clean);
    expect(text).not.toContain('12345678909');
    expect(text).not.toContain('999990000');
    expect(text).not.toContain('Rua A');
    expect(text).not.toContain('4242');
    expect(text).not.toContain('10.0.0.1');
    expect(clean.Customer.full_name).toBe('Ana Teste');
  });

  it('sem KIWIFY_WEBHOOK_TOKEN: 503 e nada gravado', async () => {
    delete process.env.KIWIFY_WEBHOOK_TOKEN;
    const id = `notoken_${uid}`;
    const res = await post(event(id));
    expect(res.status).toBe(503);
    expect(await sale(id)).toHaveLength(0);
  });

  it('assinatura ausente ou errada: 401 e nada gravado', async () => {
    const id = `badsig_${uid}`;
    expect((await post(event(id), { sig: null })).status).toBe(401);
    expect((await post(event(id), { sig: sign(JSON.stringify(event(id)), 'outro_token') })).status).toBe(401);
    expect((await post(event(id), { sig: 'zz' })).status).toBe(401);
    expect(await sale(id)).toHaveLength(0);
  });

  it('JSON quebrado: 400 (nunca 500)', async () => {
    const raw = '{"order_id": "quebrado"';
    const res = await post(null, { raw, sig: sign(raw) });
    expect(res.status).toBe(400);
  });

  it('compra aprovada: PAID com valores em reais (centavos em texto), assinatura em maiúsculas aceita, sem CPF/telefone', async () => {
    const id = `paid_${uid}`;
    const raw = JSON.stringify(event(id));
    const res = await post(null, { raw, sig: sign(raw).toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAID');
    const rows = await sale(id);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.status).toBe('PAID');
    expect(Number(r.gross_amount)).toBe(47);
    expect(Number(r.net_amount)).toBe(42.3);
    expect(Number(r.fee_amount)).toBe(4.7);
    expect(r.currency).toBe('BRL');
    expect(r.utm_campaign).toBe(CAMPAIGN);
    expect(r.utm_content).toBe(AD);
    expect(r.customer_name).toBe('Ana Teste');
    expect(r.approved_at).toBeTruthy();
    const all = JSON.stringify(r);
    expect(all).not.toContain('12345678909');
    expect(all).not.toContain('999990000');
    expect(all).not.toContain('Rua A');
    expect(all).not.toContain('4242');
    const audit = await pool.query(`SELECT description FROM audit_logs WHERE event_type = 'KIWIFY_SALE_RECORDED' AND description LIKE $1`, [`%${id}%`]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].description).not.toContain('@');
  });

  it('sem kiwify_fee: tarifa = bruto - líquido', async () => {
    const id = `nofee_${uid}`;
    const ev = event(id, { Commissions: { charge_amount: 2990, my_commission: '2600' } });
    expect((await post(ev)).status).toBe(200);
    const r = (await sale(id))[0];
    expect(Number(r.gross_amount)).toBe(29.9);
    expect(Number(r.fee_amount)).toBe(3.9);
  });

  it('aprovada repetida não duplica', async () => {
    const id = `paid_${uid}`;
    const res = await post(event(id));
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(await sale(id)).toHaveLength(1);
  });

  it('reembolso depois do pago: REFUNDED com data; aprovada repetida depois não volta para PAID', async () => {
    const id = `refund_${uid}`;
    await post(event(id));
    const res = await post(event(id, { webhook_event_type: 'order_refunded', order_status: 'refunded', refunded_at: '2026-10-21 21:00' }));
    expect(res.status).toBe(200);
    let r = (await sale(id))[0];
    expect(r.status).toBe('REFUNDED');
    expect(new Date(r.refunded_at).toISOString()).toBe('2026-10-22T00:00:00.000Z');
    await post(event(id));
    r = (await sale(id))[0];
    expect(r.status).toBe('REFUNDED');
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'KIWIFY_SALE_REFUNDED' AND description LIKE $1`, [`%${id}%`]);
    expect(audit.rows).toHaveLength(1);
  });

  it('chargeback: CHARGEBACK e não volta para PAID', async () => {
    const id = `cb_${uid}`;
    await post(event(id));
    await post(event(id, { webhook_event_type: 'chargeback', order_status: 'chargedback' }));
    expect((await sale(id))[0].status).toBe('CHARGEBACK');
    await post(event(id));
    expect((await sale(id))[0].status).toBe('CHARGEBACK');
  });

  it('eventos sem efeito (Pix gerado, recusada): 200 ignored e nada gravado', async () => {
    const id = `pix_${uid}`;
    const a = await post(event(id, { webhook_event_type: 'pix_created', order_status: 'waiting_payment' }));
    expect(a.status).toBe(200);
    expect(a.body.ignored).toBe(true);
    const b = await post(event(id, { webhook_event_type: 'order_rejected', order_status: 'refused' }));
    expect(b.body.ignored).toBe(true);
    expect(await sale(id)).toHaveLength(0);
  });

  it('Financeiro: venda paga entra no resumo e na campanha/criativo pelo utm_campaign e utm_content', async () => {
    const before = await request(app).get('/api/financial/dashboard?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    const id = `fin_${uid}`;
    expect((await post(event(id))).status).toBe(200);
    const after = await request(app).get('/api/financial/dashboard?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(200);
    const s0 = before.body.summary;
    const s1 = after.body.summary;
    expect(Math.round((s1.grossRevenue - s0.grossRevenue) * 100) / 100).toBe(47);
    expect(s1.paidOrdersCount - s0.paidOrdersCount).toBe(1);
    expect(Math.round((s1.gatewayFees - s0.gatewayFees) * 100) / 100).toBe(4.7);

    const camp = after.body.byCampaign.find((c: any) => c.campaignName === CAMPAIGN);
    expect(camp).toBeTruthy();
    const campBefore = before.body.byCampaign.find((c: any) => c.campaignName === CAMPAIGN);
    expect(camp.attributedOrders - campBefore.attributedOrders).toBe(1);
    expect(Math.round((camp.attributedRevenue - campBefore.attributedRevenue) * 100) / 100).toBe(47);
    const ad = after.body.byCreative.find((a: any) => a.adName === AD);
    expect(ad.attributedOrders).toBeGreaterThanOrEqual(1);

    const product = after.body.byProduct.find((p: any) => p.productName === `Desafio Seca Barriga ${uid}`);
    expect(product).toBeTruthy();
    // a venda entra igual no total, na soma por produto e na soma campanha + sem atribuição
    const r0 = before.body.reconciliation;
    const r1 = after.body.reconciliation;
    const d = (k: string) => Math.round((r1[k] - r0[k]) * 100) / 100;
    expect(d('totalGrossRevenue')).toBe(47);
    expect(d('productTotalRevenue')).toBe(47);
    expect(d('campaignPlusUnattributedRevenue')).toBe(47);
  });

  it('Financeiro: utm_campaign sem campanha com esse nome fica sem atribuição; reembolsada sai da receita', async () => {
    const before = await request(app).get('/api/financial/dashboard?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    const id = `unattr_${uid}`;
    await post(event(id, { TrackingParameters: { utm_campaign: 'Campanha que não existe' } }));
    const after = await request(app).get('/api/financial/dashboard?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    expect(Math.round((after.body.unattributed.revenue - before.body.unattributed.revenue) * 100) / 100).toBe(47);

    await post(event(id, { webhook_event_type: 'order_refunded', order_status: 'refunded' }));
    const refunded = await request(app).get('/api/financial/dashboard?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    expect(Math.round((refunded.body.summary.grossRevenue - before.body.summary.grossRevenue) * 100) / 100).toBe(0);
    expect(refunded.body.summary.refundedOrdersCount - before.body.summary.refundedOrdersCount).toBe(1);
  });

  it('Vendas: a venda aparece com origem KIWIFY; e-mail escondido para quem não é ADMIN', async () => {
    const res = await request(app).get('/api/sales/orders?mode=real&period=7d').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.orders.find((o: any) => o.source === 'KIWIFY' && o.offer_name === `Desafio Seca Barriga ${uid}` && o.status === 'PAID');
    expect(row).toBeTruthy();
    expect(row.total_amount).toBe(47);
    expect(row.payment_status).toBe('CONFIRMED');
    expect(row.customer.email).toBe(`ana_${uid}@example.com`);
    expect(row.customer.phone).toBeNull();
    expect(res.body.orders.some((o: any) => o.source === 'KIWIFY' && o.status === 'CHARGEBACK')).toBe(true);

    const perf = await request(app).get('/api/sales/orders?mode=real&period=7d').set('Authorization', `Bearer ${perfToken}`);
    const prow = perf.body.orders.find((o: any) => o.id === row.id);
    expect(prow.customer.email).toBe('[REDACTED]');

    const pending = await request(app).get('/api/sales/orders?mode=real&period=7d&filter=PENDING').set('Authorization', `Bearer ${adminToken}`);
    expect(pending.body.orders.some((o: any) => o.source === 'KIWIFY')).toBe(false);

    // ações do NORQVA não valem para venda da Kiwify (não existe pedido Asaas com esse código)
    const resend = await request(app).post(`/api/sales/orders/${row.id}/resend-access?mode=real`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(resend.status).toBe(404);
  });

  it('KIWIFY_PRODUCT_IDS: produto fora da lista é ignorado', async () => {
    process.env.KIWIFY_PRODUCT_IDS = 'outro_produto';
    const id = `filtered_${uid}`;
    const res = await post(event(id));
    expect(res.body.ignored).toBe(true);
    expect(await sale(id)).toHaveLength(0);
  });
});
