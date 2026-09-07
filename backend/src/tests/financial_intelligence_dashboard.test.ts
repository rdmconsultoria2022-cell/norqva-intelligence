import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';
import { signSupabaseToken } from '../utils/token';

describe('DASHBOARD FINANCIAL INTELLIGENCE V1 — Comprehensive Data Integrity & Provenance Matrix', () => {
  let pool: Pool;
  let adminToken: string;
  let testAdAccountId: string;

  const cleanupRealTestData = async () => {
    try {
      await pool.query(`DELETE FROM meta_insights WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE OR entity_meta_id IN ('120249371827010097', 'demo_cmp_99', 'unconnected_cmp_99', 'democonn_cmp_99')`);
      await pool.query(`DELETE FROM meta_ads WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM meta_ad_sets WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM meta_campaigns WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE OR meta_campaign_id IN ('120249371827010097', 'demo_cmp_99', 'unconnected_cmp_99', 'democonn_cmp_99')`);
      await pool.query(`DELETE FROM meta_ad_accounts WHERE meta_account_id IN ('act_2887010388338951', 'demo_account_99', 'act_9999999999999999', 'act_demo_conn_01', 'act_test_01')`);
      await pool.query(`DELETE FROM payments WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM order_items WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR order_id IN (SELECT id FROM orders WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE)`);
      await pool.query(`DELETE FROM orders WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM offers WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM products WHERE data_provenance = 'COMMERCIAL_PRODUCTION' OR is_demo = FALSE`);
      await pool.query(`DELETE FROM customers WHERE email LIKE '%@testmatrix.com' OR email LIKE '%@commercialdomain.com.br'`);
    } catch (_) {}
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    await seedDemoData(pool);
    await cleanupRealTestData();

    const adminAuthId = crypto.randomUUID();
    const adminRes = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status)
       VALUES (gen_random_uuid(), $1, 'admin.fin.matrix@norqva.com', 'Admin Financial Matrix', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE'
       RETURNING id, auth_user_id, email, role`,
      [adminAuthId]
    );

    adminToken = signSupabaseToken({
      sub: adminRes.rows[0].auth_user_id,
      email: adminRes.rows[0].email,
      role: 'ADMIN'
    });

    const connRes = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, meta_user_id, token_reference, last_validated_at, updated_at)
       VALUES (FALSE, 'CONNECTED', '122108736465442354', 'env:META_ACCESS_TOKEN', NOW(), NOW())
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED', last_validated_at = NOW(), updated_at = NOW()
       RETURNING id`
    );
    const realConnId = connRes.rows[0].id;

    const accRes = await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, connection_id, name, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'act_matrix_01', $1, 'Matrix Ad Account', FALSE, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET connection_id = $1, data_provenance = 'COMMERCIAL_PRODUCTION'
       RETURNING id`,
      [realConnId]
    );
    testAdAccountId = accRes.rows[0].id;
  });

  afterAll(async () => {
    await cleanupRealTestData();
    try {
      await pool.query(`DELETE FROM meta_ad_accounts WHERE meta_account_id IN ('act_matrix_01')`);
    } catch (_) {}
  });

  it('F01: Rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/financial/dashboard');
    expect(res.status).toBe(401);
  });

  it('F02: Real mode fails closed on empty commercial database (0.00 values, no NaN/null crashes, 100% reconciled)', async () => {
    await cleanupRealTestData();
    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('real');
    expect(res.body.dataProvenanceAuthority).toBe('COMMERCIAL_PRODUCTION_ONLY');
    expect(res.body.summary.grossRevenue).toBe(0.00);
    expect(res.body.summary.totalSpend).toBe(0.00);
    expect(res.body.summary.netProfit).toBe(0.00);
    expect(res.body.summary.netMargin).toBeNull();
    expect(res.body.summary.roas).toBeNull();
    expect(res.body.reconciliation.isReconciled).toBe(true);
  });

  it('F03: Provenance Isolation — Excludes DEMO, QA, TEST, SEED, FIXTURE, and UNKNOWN from mode=real', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `test.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Test Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-PROV-01', 'Prov Product', 'Digital', 'Test Desc', 'PLANEJADO', FALSE, 'TEST')`,
      [prdId]
    );

    const provenances = ['DEMO', 'QA', 'TEST', 'SEED', 'FIXTURE', 'LOCAL_DEVELOPMENT', 'UNKNOWN'];
    for (const prov of provenances) {
      const ordId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
         VALUES ($1, $2, 100.00, 'PAID', $3, ${prov === 'DEMO'}, $4)`,
        [ordId, custId, crypto.randomUUID(), prov]
      );
    }

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.grossRevenue).toBe(0.00);
    expect(res.body.summary.paidOrdersCount).toBe(0);

    const demoRes = await request(app)
      .get('/api/financial/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(demoRes.status).toBe(200);
    expect(demoRes.body.summary.paidOrdersCount).toBeGreaterThanOrEqual(7);
  });

  it('F04: Commercial Production Inclusion — Computes exact Gross Revenue, Spend, and Result after Media', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `comm.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Comm Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-COMM-01', 'Trattoria Commercial', 'Gastronomia', 'Guia Prático', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [prdId]
    );

    const offId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES ($1, 'OFF-COMM-01', 'Trattoria Commercial Offer', 'Oferta Prática', $2, 19.90, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [offId, prdId]
    );

    // Insert 10 PAID commercial orders = R$ 199.00
    for (let i = 0; i < 10; i++) {
      const oId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
         VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
        [oId, custId, crypto.randomUUID()]
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Trattoria Commercial', 'Trattoria Commercial Offer', 19.90, 1, 19.90, 'COMMERCIAL_PRODUCTION')`,
        [oId, offId, prdId]
      );
    }

    // Insert Meta Ad Spend = R$ 50.00
    const campId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES ($1, '1209990001', $2, 'CAMPAIGN_COMMERCIAL_01', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [campId, testAdAccountId]
    );
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $2, $1, '1209990001', 'CAMPAIGN', 50.00, 2000, 100, NOW()::date, NOW()::date, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [campId, testAdAccountId]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.grossRevenue).toBe(199.00);
    expect(res.body.summary.totalSpend).toBe(50.00);
    expect(res.body.summary.resultAfterMedia).toBe(149.00); // 199 - 50
    expect(res.body.summary.paidOrdersCount).toBe(10);
    expect(res.body.summary.aov).toBe(19.90);
    expect(res.body.summary.roas).toBe(3.98); // 199 / 50
  });

  it('F05: Excludes PENDING and CANCELLED orders from Gross Revenue', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `status.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Status Cust', $2)`, [custId, custEmail]);

    // Insert 1 PAID order = R$ 19.90
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, 19.90, 'PAID', $2, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [custId, crypto.randomUUID()]
    );

    // Insert 1 PENDING, 1 CANCELLED
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, 100.00, 'PENDING', $2, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, 100.00, 'CANCELLED', $2, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [custId, crypto.randomUUID()]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.grossRevenue).toBe(19.90);
    expect(res.body.summary.pendingOrdersCount).toBe(1);
    expect(res.body.summary.cancelledOrdersCount).toBe(1);
  });

  it('F06: Refund Lifecycle & Prevention of Double Subtraction', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `refund.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Refund Cust', $2)`, [custId, custEmail]);

    // Insert 1 PAID order = 100.00
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, 100.00, 'PAID', $2, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [custId, crypto.randomUUID()]
    );

    // Insert a REFUNDED order of R$ 50.00
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, 50.00, 'REFUNDED', $2, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [custId, crypto.randomUUID()]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.grossRevenue).toBe(100.00);
    expect(res.body.summary.refundPrincipal).toBe(50.00);
    expect(res.body.summary.cumulativeGrossRevenue).toBe(150.00); // 100 + 50
    expect(res.body.summary.netCommercialRevenue).toBe(100.00);
    expect(res.body.summary.refundedOrdersCount).toBe(1);
    expect(res.body.summary.resultAfterMedia).toBe(100.00);
  });

  it('F07: Cost Knowledge Model — Distinguishes KNOWN_ZERO, KNOWN_VALUE, UNKNOWN, and PARTIAL coverage', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `cost.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Cost Cust', $2)`, [custId, custEmail]);

    // Insert an order with known payment fee = R$ 1.99
    const oId1 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oId1, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, amount, provider_fee, status, idempotency_key, external_reference, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'PAY-001', $1, 'ASAAS', 19.90, 1.99, 'CONFIRMED', $2, $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oId1, crypto.randomUUID(), `EXT-${crypto.randomUUID()}`]
    );

    // Insert an order with NULL payment fee (unknown)
    const oId2 = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oId2, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO payments (id, human_id, order_id, provider, amount, provider_fee, status, idempotency_key, external_reference, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'PAY-002', $1, 'ASAAS', 19.90, NULL, 'CONFIRMED', $2, $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oId2, crypto.randomUUID(), `EXT-${crypto.randomUUID()}`]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.costCoverage).toBe('PARTIAL');
    expect(res.body.gatewayCostState).toBe('PARTIAL');
    expect(res.body.summary.isCostKnown).toBe(false);
    expect(res.body.netResultSemantic).toBe('RESULTADO_LIQUIDO_CONHECIDO_PARCIAL');
    expect(res.body.summary.gatewayFees).toBe(1.99);
  });

  it('F08: Attribution Hardening & Conflict Detection — Verifies exact ID match, conflict isolation, and reconciliation checksum', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `attr.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Attr Cust', $2)`, [custId, custEmail]);

    const prdRes = await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'PRD-ATTR-01', 'Product Attr', 'Digital', 'Attr Desc', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')
       RETURNING id`
    );
    const prdId = prdRes.rows[0].id;

    const offRes = await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'OFF-ATTR-01', 'Offer Attr', 'Offer Description', $1, 100.00, FALSE, 'COMMERCIAL_PRODUCTION')
       RETURNING id`,
      [prdId]
    );
    const offId = offRes.rows[0].id;

    // Create 2 distinct campaigns
    const c1Id = crypto.randomUUID();
    const c2Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES ($1, '1208880001', $2, 'CAMPAIGN_ALPHA', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [c1Id, testAdAccountId]
    );
    await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES ($1, '1208880002', $2, 'CAMPAIGN_BETA', 'ACTIVE', 'ACTIVE', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [c2Id, testAdAccountId]
    );

    // Order 1: Matches Campaign ALPHA via utm_campaign (ID match)
    const o1Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, utm_campaign, is_demo, data_provenance)
       VALUES ($1, $2, 100.00, 'PAID', $3, '1208880001', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [o1Id, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Product Attr', 'Offer Attr', 100.00, 1, 100.00, 'COMMERCIAL_PRODUCTION')`,
      [o1Id, offId, prdId]
    );

    // Order 2: Conflict — utm_campaign points to ALPHA, but attribution_metadata points to BETA
    const o2Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, utm_campaign, attribution_metadata, is_demo, data_provenance)
       VALUES ($1, $2, 100.00, 'PAID', $3, '1208880001', '{"campaign_id": "1208880002"}', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [o2Id, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Product Attr', 'Offer Attr', 100.00, 1, 100.00, 'COMMERCIAL_PRODUCTION')`,
      [o2Id, offId, prdId]
    );

    // Order 3: Unattributed — direct checkout without UTM or fbclid
    const o3Id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 100.00, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [o3Id, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Product Attr', 'Offer Attr', 100.00, 1, 100.00, 'COMMERCIAL_PRODUCTION')`,
      [o3Id, offId, prdId]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.conflicted.ordersCount).toBe(1);
    expect(res.body.conflicted.revenue).toBe(100.00);
    expect(res.body.unattributed.ordersCount).toBeGreaterThanOrEqual(1);
    expect(res.body.reconciliation.isReconciled).toBe(true);
  });

  it('F09: Period Filters (7d, 30d, 90d, all) dynamically filter records by date', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `date.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Date Cust', $2)`, [custId, custEmail]);

    const prdRes = await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'PRD-DATE-01', 'Product Date', 'Digital', 'Date Desc', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')
       RETURNING id`
    );
    const prdId = prdRes.rows[0].id;

    const offRes = await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'OFF-DATE-01', 'Offer Date', 'Date Offer Desc', $1, 500.00, FALSE, 'COMMERCIAL_PRODUCTION')
       RETURNING id`,
      [prdId]
    );
    const offId = offRes.rows[0].id;

    // Insert an order created 45 days ago
    const oldDate = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
    const oldOrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, created_at, is_demo, data_provenance)
       VALUES ($1, $2, 500.00, 'PAID', $3, $4, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oldOrdId, custId, crypto.randomUUID(), oldDate]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Product Date', 'Offer Date', 500.00, 1, 500.00, 'COMMERCIAL_PRODUCTION')`,
      [oldOrdId, offId, prdId]
    );

    const res7d = await request(app)
      .get('/api/financial/dashboard?mode=real&period=7d')
      .set('Authorization', `Bearer ${adminToken}`);

    const res30d = await request(app)
      .get('/api/financial/dashboard?mode=real&period=30d')
      .set('Authorization', `Bearer ${adminToken}`);

    const resAll = await request(app)
      .get('/api/financial/dashboard?mode=real&period=all')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res7d.status).toBe(200);
    expect(res30d.status).toBe(200);
    expect(resAll.status).toBe(200);

    expect(resAll.body.summary.grossRevenue).toBeGreaterThan(res30d.body.summary.grossRevenue);
    expect(resAll.body.reconciliation.isReconciled).toBe(true);
  });

  it('F10: Canonical Taxonomy Matrix — Verifies strict fail-closed exclusion for all non-COMMERCIAL_PRODUCTION classes', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `taxonomy.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Taxonomy Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-TAX-01', 'Taxonomy Product', 'Digital', 'Desc', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [prdId]
    );

    const offId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES ($1, 'OFF-TAX-01', 'Taxonomy Offer', 'Desc', $2, 100.00, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [offId, prdId]
    );

    // Test each canonical class with PAID status
    const testClasses = [
      { prov: 'STAGING_SANDBOX_QA', isDemo: false, amount: 19.90 },
      { prov: 'QA_FIXTURE', isDemo: false, amount: 50.00 },
      { prov: 'DEMO_SEED', isDemo: true, amount: 80.00 },
      { prov: 'LEGACY_MIGRATION', isDemo: false, amount: 120.00 },
      { prov: 'UNKNOWN', isDemo: false, amount: 200.00 }
    ];

    for (const item of testClasses) {
      const oId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
         VALUES ($1, $2, $3, 'PAID', $4, $5, $6)`,
        [oId, custId, item.amount, crypto.randomUUID(), item.isDemo, item.prov]
      );
      await pool.query(
        `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Taxonomy Product', 'Taxonomy Offer', $4, 1, $4, $5)`,
        [oId, offId, prdId, item.amount, item.prov]
      );
    }

    // Now insert ONE genuine COMMERCIAL_PRODUCTION order = R$ 19.90
    const commOrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [commOrdId, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Taxonomy Product', 'Taxonomy Offer', 19.90, 1, 19.90, 'COMMERCIAL_PRODUCTION')`,
      [commOrdId, offId, prdId]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Only the 1 COMMERCIAL_PRODUCTION order must be in gross revenue (R$ 19.90), all 5 other classes excluded
    expect(res.body.summary.grossRevenue).toBe(19.90);
    expect(res.body.summary.paidOrdersCount).toBe(1);
    expect(res.body.reconciliation.isReconciled).toBe(true);
  });

  it('F11: Direct / Organic Commercial Production without Meta attribution is accounted as Unattributed Revenue', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `organic.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Organic Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-ORG-01', 'Trattoria Organic', 'Gastronomia', 'Desc', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [prdId]
    );

    const offId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES ($1, 'OFF-ORG-01', 'Trattoria Organic Offer', 'Desc', $2, 19.90, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [offId, prdId]
    );

    // Insert direct organic commercial order (no UTM, no fbclid)
    const oId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [oId, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Trattoria Organic', 'Trattoria Organic Offer', 19.90, 1, 19.90, 'COMMERCIAL_PRODUCTION')`,
      [oId, offId, prdId]
    );

    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.grossRevenue).toBe(19.90);
    expect(res.body.unattributed.ordersCount).toBe(1);
    expect(res.body.unattributed.revenue).toBe(19.90);
    expect(res.body.reconciliation.productTotalRevenue).toBe(19.90);
    expect(res.body.reconciliation.campaignPlusUnattributedRevenue).toBe(19.90);
    expect(res.body.reconciliation.isReconciled).toBe(true);
  });

  it('F12: STAGING_SANDBOX_QA Order Isolation (Known R$ 19.90 Order Simulation)', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `sandbox.${crypto.randomBytes(4).toString('hex')}@testmatrix.com`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Sandbox Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-SBX-01', 'Produto E2E Asaas Sandbox', 'Digital', 'Desc', 'PLANEJADO', FALSE, 'STAGING_SANDBOX_QA')`,
      [prdId]
    );

    const offId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, name, description, product_id, price, is_demo, data_provenance)
       VALUES ($1, 'OFF-SBX-01', 'TRATTORIA EM CASA', 'Desc', $2, 19.90, FALSE, 'STAGING_SANDBOX_QA')`,
      [offId, prdId]
    );

    // Insert the known R$ 19.90 order as STAGING_SANDBOX_QA
    const oId = 'd2c55dda-4d13-4338-8333-5f9e8cb20711';
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'STAGING_SANDBOX_QA')`,
      [oId, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Produto E2E Asaas Sandbox', 'TRATTORIA EM CASA', 19.90, 1, 19.90, 'STAGING_SANDBOX_QA')`,
      [oId, offId, prdId]
    );

    // In mode=real: STAGING_SANDBOX_QA must be strictly excluded from commercial revenue
    const realRes = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(realRes.status).toBe(200);
    expect(realRes.body.summary.grossRevenue).toBe(0.00);
    expect(realRes.body.summary.paidOrdersCount).toBe(0);

    // In mode=demo: STAGING_SANDBOX_QA is included in simulated/QA view
    const demoRes = await request(app)
      .get('/api/financial/dashboard?mode=demo')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(demoRes.status).toBe(200);
    expect(demoRes.body.summary.paidOrdersCount).toBeGreaterThanOrEqual(1);
  });

  it('F13: Provenance Immutability — Persisted database provenance is authoritative and independent of process.env changes', async () => {
    await cleanupRealTestData();
    const custId = crypto.randomUUID();
    const custEmail = `immutable.customer.${crypto.randomBytes(4).toString('hex')}@commercialdomain.com.br`;
    await pool.query(`INSERT INTO customers (id, name, email) VALUES ($1, 'Immutable Cust', $2)`, [custId, custEmail]);

    const prdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance)
       VALUES ($1, 'PRD-IMMUTABLE-01', 'Immutable Product', 'Digital', 'Test Desc', 'PLANEJADO', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [prdId]
    );

    const offId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, description, price, status, is_demo, data_provenance)
       VALUES ($1, 'OFF-IMMUTABLE-01', $2, 'Immutable Offer', 'Immutable Description', 19.90, 'ATIVA', FALSE, 'COMMERCIAL_PRODUCTION')`,
      [offId, prdId]
    );

    // 1. Persist 1 historical STAGING_SANDBOX_QA order (R$ 19.90) and 1 historical COMMERCIAL_PRODUCTION order (R$ 19.90)
    const sbxOrdId = 'd2c55dda-4d13-4338-8333-5f9e8cb20711';
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'STAGING_SANDBOX_QA')`,
      [sbxOrdId, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Immutable Product', 'Immutable Offer', 19.90, 1, 19.90, 'STAGING_SANDBOX_QA')`,
      [sbxOrdId, offId, prdId]
    );

    const commOrdId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, $2, 19.90, 'PAID', $3, FALSE, 'COMMERCIAL_PRODUCTION')`,
      [commOrdId, custId, crypto.randomUUID()]
    );
    await pool.query(
      `INSERT INTO order_items (id, order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Immutable Product', 'Immutable Offer', 19.90, 1, 19.90, 'COMMERCIAL_PRODUCTION')`,
      [commOrdId, offId, prdId]
    );

    // 2. Simulate environment change to production
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAppEnv = process.env.APP_ENV;
    const originalAsaasEnv = process.env.ASAAS_ENV;
    const originalAllowProd = process.env.ALLOW_PRODUCTION_PAYMENTS;

    try {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'production';
      process.env.ASAAS_ENV = 'production';
      process.env.ALLOW_PRODUCTION_PAYMENTS = 'true';

      // Query dashboard in mode=real under simulated production environment
      const res1 = await request(app)
        .get('/api/financial/dashboard?mode=real')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res1.status).toBe(200);
      // Only the COMMERCIAL_PRODUCTION order is included (R$ 19.90).
      // The STAGING_SANDBOX_QA order (d2c55dda) is NOT promoted, despite process.env being production!
      expect(res1.body.summary.grossRevenue).toBe(19.90);
      expect(res1.body.summary.paidOrdersCount).toBe(1);

      // 3. Simulate environment change to development / test
      process.env.NODE_ENV = 'development';
      process.env.APP_ENV = 'local';
      process.env.ASAAS_ENV = 'sandbox';
      process.env.ALLOW_PRODUCTION_PAYMENTS = 'false';

      // Query dashboard in mode=real under simulated local environment
      const res2 = await request(app)
        .get('/api/financial/dashboard?mode=real')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res2.status).toBe(200);
      // COMMERCIAL_PRODUCTION order remains included (R$ 19.90) because provenance is persisted in DB, not inferred from env!
      expect(res2.body.summary.grossRevenue).toBe(19.90);
      expect(res2.body.summary.paidOrdersCount).toBe(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      process.env.APP_ENV = originalAppEnv;
      process.env.ASAAS_ENV = originalAsaasEnv;
      process.env.ALLOW_PRODUCTION_PAYMENTS = originalAllowProd;
    }
  });

  it('F14: Positive Media Spend Verification Matrix & Adversarial Hardening (A-I)', async () => {
    await cleanupRealTestData();
    await pool.query(`DELETE FROM meta_insights WHERE entity_meta_id IN ('120249371827010097', 'demo_cmp_99', 'unconnected_cmp_99', 'democonn_cmp_99')`);

    // Ensure real connection exists (is_demo = FALSE, status = 'CONNECTED')
    const realConnRes = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, meta_user_id, token_reference, last_validated_at, updated_at)
       VALUES (FALSE, 'CONNECTED', '122108736465442354', 'env:META_ACCESS_TOKEN', NOW(), NOW())
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED', last_validated_at = NOW(), updated_at = NOW()
       RETURNING id`
    );
    const realConnId = realConnRes.rows[0].id;

    // Ensure demo connection exists (is_demo = TRUE, status = 'CONNECTED')
    const demoConnRes = await pool.query(
      `INSERT INTO meta_connections (is_demo, status, meta_user_id, token_reference, last_validated_at, updated_at)
       VALUES (TRUE, 'CONNECTED', 'demo_user_101', 'env:DEMO_MOCK', NOW(), NOW())
       ON CONFLICT (is_demo) DO UPDATE SET status = 'CONNECTED', last_validated_at = NOW(), updated_at = NOW()
       RETURNING id`
    );
    const demoConnId = demoConnRes.rows[0].id;

    // 1. Certified Real Meta Ad Account (act_2887010388338951) linked to real connection
    const realAdAccRes = await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, connection_id, name, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'act_2887010388338951', $1, 'Ricardo Real Meta', FALSE, 'LEGACY_MIGRATION')
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET connection_id = $1, data_provenance = 'LEGACY_MIGRATION'
       RETURNING id`,
      [realConnId]
    );
    const realAdAccId = realAdAccRes.rows[0].id;

    // 2. Adversarial Case C & H: Arbitrary Plausible Account without positive connection (connection_id = NULL)
    const unconnectedAccRes = await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, connection_id, name, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'act_9999999999999999', NULL, 'Plausible Unconnected Account', FALSE, 'LEGACY_MIGRATION')
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET connection_id = NULL, data_provenance = 'LEGACY_MIGRATION'
       RETURNING id`
    );
    const unconnectedAccId = unconnectedAccRes.rows[0].id;

    // 3. Adversarial Case D & E: Demo account linked to demo connection
    const demoAdAccRes = await pool.query(
      `INSERT INTO meta_ad_accounts (id, meta_account_id, connection_id, name, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'act_demo_conn_01', $1, 'Fake Demo Account', TRUE, 'DEMO_SEED')
       ON CONFLICT (meta_account_id, is_demo) DO UPDATE SET connection_id = $1, data_provenance = 'DEMO_SEED'
       RETURNING id`,
      [demoConnId]
    );
    const demoAdAccId = demoAdAccRes.rows[0].id;

    // 4. Campaign on Real Ad Account
    const realCmpRes = await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES (gen_random_uuid(), '120249371827010097', $1, 'Trattoria Real Campaign', 'ACTIVE', 'ACTIVE', FALSE, 'LEGACY_MIGRATION')
       ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET ad_account_id = $1, data_provenance = 'LEGACY_MIGRATION'
       RETURNING id`,
      [realAdAccId]
    );
    const realCmpId = realCmpRes.rows[0].id;

    // 5. Campaign on Unconnected Account (Adversarial Case C & H)
    const unconnectedCmpRes = await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'unconnected_cmp_99', $1, 'Unconnected Campaign', 'ACTIVE', 'ACTIVE', FALSE, 'LEGACY_MIGRATION')
       ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET ad_account_id = $1, data_provenance = 'LEGACY_MIGRATION'
       RETURNING id`,
      [unconnectedAccId]
    );
    const unconnectedCmpId = unconnectedCmpRes.rows[0].id;

    // 6. Campaign on Demo Ad Account (Adversarial Case D & E)
    const demoCmpRes = await pool.query(
      `INSERT INTO meta_campaigns (id, meta_campaign_id, ad_account_id, name, status, effective_status, is_demo, data_provenance)
       VALUES (gen_random_uuid(), 'democonn_cmp_99', $1, 'Demo Fake Campaign', 'ACTIVE', 'ACTIVE', TRUE, 'DEMO_SEED')
       ON CONFLICT (meta_campaign_id, is_demo) DO UPDATE SET ad_account_id = $1, data_provenance = 'DEMO_SEED'
       RETURNING id`,
      [demoAdAccId]
    );
    const demoCmpId = demoCmpRes.rows[0].id;

    // Test Case A: Certified REAL Meta source + LEGACY_MIGRATION -> INCLUDED (R$ 169.06)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, '120249371827010097', 'CAMPAIGN', 169.06, 2500, 120, '2026-09-06', '2026-09-06', FALSE, 'LEGACY_MIGRATION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [realAdAccId, realCmpId]
    );

    // Test Case B: Certified REAL Meta source + COMMERCIAL_PRODUCTION -> INCLUDED (R$ 135.38)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, '120249371827010097', 'CAMPAIGN', 135.38, 2000, 100, '2026-09-07', '2026-09-07', FALSE, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [realAdAccId, realCmpId]
    );

    // Test Case C & H: Arbitrary plausible account / missing connection evidence -> EXCLUDED (R$ 77.77)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, 'unconnected_cmp_99', 'CAMPAIGN', 77.77, 700, 30, '2026-09-07', '2026-09-07', FALSE, 'COMMERCIAL_PRODUCTION')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [unconnectedAccId, unconnectedCmpId]
    );

    // Test Case D & E: Demo/Test account -> EXCLUDED (R$ 500.00)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, 'democonn_cmp_99', 'CAMPAIGN', 500.00, 10000, 500, '2026-09-07', '2026-09-07', TRUE, 'DEMO_SEED')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [demoAdAccId, demoCmpId]
    );

    // Test Case F: UNKNOWN provenance on Real Ad Account -> EXCLUDED (R$ 50.00)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, '120249371827010097', 'CAMPAIGN', 50.00, 500, 20, '2026-09-05', '2026-09-05', FALSE, 'UNKNOWN')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [realAdAccId, realCmpId]
    );

    // Test Case G: STAGING_SANDBOX_QA provenance on Real Ad Account -> EXCLUDED (R$ 99.00)
    await pool.query(
      `INSERT INTO meta_insights (id, ad_account_id, campaign_id, entity_meta_id, entity_level, spend, impressions, clicks, date_start, date_stop, is_demo, data_provenance)
       VALUES (gen_random_uuid(), $1, $2, '120249371827010097', 'CAMPAIGN', 99.00, 900, 40, '2026-09-04', '2026-09-04', FALSE, 'STAGING_SANDBOX_QA')
       ON CONFLICT (ad_account_id, entity_level, entity_meta_id, date_start, is_demo) DO UPDATE SET spend = EXCLUDED.spend, data_provenance = EXCLUDED.data_provenance`,
      [realAdAccId, realCmpId]
    );

    // Query REAL mode dashboard
    const res = await request(app)
      .get('/api/financial/dashboard?mode=real')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('real');

    // Expected Verified Media Spend = 169.06 (Case A) + 135.38 (Case B) = 304.44
    // Cases C, D, E, F, G, H (77.77, 500.00, 50.00, 99.00) are strictly excluded!
    expect(res.body.summary.totalSpend).toBe(304.44);
    expect(res.body.summary.grossRevenue).toBe(0.00);
    expect(res.body.summary.paidOrdersCount).toBe(0);

    // Test Case I: R$0 revenue + verified real spend -> negative Result After Media (-304.44)
    expect(res.body.summary.resultAfterMedia).toBe(-304.44);
    expect(res.body.summary.netProfit).toBe(-304.44);

    // Verified campaign breakdown includes ONLY certified campaign
    expect(res.body.byCampaign.length).toBe(1);
    expect(res.body.byCampaign[0].campaignId).toBe(realCmpId);
    expect(res.body.byCampaign[0].spend).toBe(304.44);
  });
});



