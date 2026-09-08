import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';
import {
  getProducts,
  getOffers,
  getOrders,
  getExecutiveDashboard,
  getFinancialDashboard,
  getDashboard,
  getPublicOffer,
  createOrder,
  checkoutPix
} from '../controllers/api';
import {
  isCommercialEligible,
  isOrderEligibleForRevenue,
  isPaymentEligibleForRevenue,
  isProductEligibleForCatalog,
  isOfferEligibleForCommerce,
  getCommercialOrderClause,
  getCommercialPaymentClause,
  getCommercialProductClause,
  getCommercialOfferClause
} from '../utils/commercialTruthPolicy';
import { runMigrations } from '../db/migrations';

describe('NORQVA Commercial Truth Layer V1 — Deterministic Verification Suite', () => {
  let app: express.Express;
  let pool: Pool;
  let testUserId: string;

  let qaProductId: string;
  let commercialProductId: string;
  let demoProductId: string;
  let legacyProductId: string;
  let unknownProductId: string;

  let commercialOfferId: string;
  let qaOfferId: string;

  let qaOrderId: string;
  let commercialPaidOrderId: string;
  let commercialPendingOrderId: string;
  let legacyOrderId: string;
  let unknownOrderId: string;

  const adminAuth = (req: any, res: any, next: any) => {
    req.user = {
      id: testUserId || '486d6688-3c33-41f1-8f86-8cee0311c733',
      name: 'Admin User',
      email: 'rdmconsultoria2022@gmail.com',
      role: 'ADMIN',
      status: 'ATIVO',
      is_demo: false
    };
    next();
  };

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL_TEST || 'postgresql://postgres:RicardoAndradeLucas@localhost:5432/norqva_test'
    });

    await runMigrations(pool);

    // Create a test user for foreign keys
    const userRes = await pool.query(
      `INSERT INTO users (name, email, role, status, is_demo)
       VALUES ('Test Admin', 'admin.test@norqva.com', 'ADMIN', 'ATIVO', false)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    testUserId = userRes.rows[0].id;

    app = express();
    app.set('db', pool);
    app.use(express.json());

    app.get('/api/products', adminAuth, getProducts);
    app.get('/api/offers', adminAuth, getOffers);
    app.get('/api/orders', adminAuth, getOrders);
    app.get('/api/executive/dashboard', adminAuth, getExecutiveDashboard);
    app.get('/api/financial/dashboard', adminAuth, getFinancialDashboard);
    app.get('/api/dashboard', adminAuth, getDashboard);
    app.get('/api/public/offers/:humanId', getPublicOffer);
    app.post('/api/checkout', createOrder);
    app.post('/api/checkout/orders/:orderId/pix', checkoutPix);

    // Setup Fixtures for Provenance Isolation
    const uid = crypto.randomBytes(4).toString('hex');

    // 1. Historical QA Product
    const qaProdRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo, data_provenance, status, observations, origin_provenance, origin_responsible_id, origin_evidence, origin_notes)
       VALUES ($1, 'Produto E2E Asaas Sandbox', 'Teste Operacional', 'Historical QA Product', false, 'STAGING_SANDBOX_QA', 'ATIVO', 'E2E STAGING — ASAAS SANDBOX — NÃO UTILIZAR EM PRODUÇÃO', 'ORIGINAL', $2, 'E2E Staging Testing', 'QA sandbox product')
       RETURNING id`,
      [`PRD-QA-${uid}`, testUserId]
    );
    qaProductId = qaProdRes.rows[0].id;

    // 2. Clean Commercial Product
    const commProdRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo, data_provenance, status, origin_provenance, origin_responsible_id, origin_evidence, origin_notes)
       VALUES ($1, 'TRATTORIA EM CASA', 'INFOPRODUTO', 'Método comercial oficial', false, 'COMMERCIAL_PRODUCTION', 'ATIVO', 'ORIGINAL', $2, 'Receitas Italianas', 'Comercial')
       RETURNING id`,
      [`PRD-COM-${uid}`, testUserId]
    );
    commercialProductId = commProdRes.rows[0].id;

    // 3. Demo Product
    const demoProdRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo, data_provenance, status, origin_provenance, origin_responsible_id, origin_evidence)
       VALUES ($1, 'Demo Product Seed', 'INFOPRODUTO', 'Demo Product', true, 'DEMO_SEED', 'ATIVO', 'ORIGINAL', $2, 'Demo Evidence')
       RETURNING id`,
      [`PRD-DEM-${uid}`, testUserId]
    );
    demoProductId = demoProdRes.rows[0].id;

    // 4. Legacy Product
    const legProdRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo, data_provenance, status, origin_provenance, origin_responsible_id, origin_evidence)
       VALUES ($1, 'Legacy Unclassified Product', 'INFOPRODUTO', 'Legacy Product', false, 'LEGACY_MIGRATION', 'ATIVO', 'ORIGINAL', $2, 'Legacy Evidence')
       RETURNING id`,
      [`PRD-LEG-${uid}`, testUserId]
    );
    legacyProductId = legProdRes.rows[0].id;

    // 5. Unknown Product
    const unkProdRes = await pool.query(
      `INSERT INTO products (human_id, name, category, description, is_demo, data_provenance, status, origin_provenance, origin_responsible_id, origin_evidence)
       VALUES ($1, 'Unknown Provenance Product', 'INFOPRODUTO', 'Unknown Product', false, 'UNKNOWN', 'ATIVO', 'ORIGINAL', $2, 'Unknown Evidence')
       RETURNING id`,
      [`PRD-UNK-${uid}`, testUserId]
    );
    unknownProductId = unkProdRes.rows[0].id;

    // Commercial Offer
    const commOffRes = await pool.query(
      `INSERT INTO offers (human_id, product_id, name, price, status, is_demo, data_provenance, description)
       VALUES ($1, $2, 'TRATTORIA EM CASA', 19.90, 'ATIVA', false, 'COMMERCIAL_PRODUCTION', 'Oferta comercial oficial')
       RETURNING id`,
      [`OFF-COM-${uid}`, commercialProductId]
    );
    commercialOfferId = commOffRes.rows[0].id;

    // QA Offer
    const qaOffRes = await pool.query(
      `INSERT INTO offers (human_id, product_id, name, price, status, is_demo, data_provenance, description)
       VALUES ($1, $2, 'Oferta QA Sandbox', 17.90, 'TESTE', false, 'STAGING_SANDBOX_QA', 'Oferta sandbox')
       RETURNING id`,
      [`OFF-QA-${uid}`, qaProductId]
    );
    qaOfferId = qaOffRes.rows[0].id;

    // Customer
    const custRes = await pool.query(
      `INSERT INTO customers (name, email, phone)
       VALUES ('Customer Test', $1, '31999999999')
       RETURNING id`,
      [`test-${uid}@norqva.com`]
    );
    const customerId = custRes.rows[0].id;

    // Historical QA Paid Order ($17.90)
    const qaOrdRes = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, 17.90, 'PAID', $2, false, 'STAGING_SANDBOX_QA')
       RETURNING id`,
      [customerId, `idemp-qa-${uid}`]
    );
    qaOrderId = qaOrdRes.rows[0].id;
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES ($1, $2, $3, 'Produto E2E Asaas Sandbox', 'Oferta QA Sandbox', 17.90, 1, 17.90, 'STAGING_SANDBOX_QA')`,
      [qaOrderId, qaOfferId, qaProductId]
    );
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, data_provenance, external_reference)
       VALUES ($1, $2, 'ASAAS', 'CONFIRMED', 17.90, $3, false, 'STAGING_SANDBOX_QA', $4)`,
      [`PAY-QA-${uid}`, qaOrderId, `idemp-pay-qa-${uid}`, String(qaOrderId)]
    );

    // Commercial Paid Order ($19.90)
    const commOrdRes = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, 19.90, 'PAID', $2, false, 'COMMERCIAL_PRODUCTION')
       RETURNING id`,
      [customerId, `idemp-comm-paid-${uid}`]
    );
    commercialPaidOrderId = commOrdRes.rows[0].id;
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, data_provenance)
       VALUES ($1, $2, $3, 'TRATTORIA EM CASA', 'TRATTORIA EM CASA', 19.90, 1, 19.90, 'COMMERCIAL_PRODUCTION')`,
      [commercialPaidOrderId, commercialOfferId, commercialProductId]
    );
    await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, status, amount, idempotency_key, is_demo, data_provenance, external_reference)
       VALUES ($1, $2, 'ASAAS', 'CONFIRMED', 19.90, $3, false, 'COMMERCIAL_PRODUCTION', $4)`,
      [`PAY-COMM-${uid}`, commercialPaidOrderId, `idemp-pay-comm-${uid}`, String(commercialPaidOrderId)]
    );

    // Legacy Order ($10.00)
    const legOrdRes = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, 10.00, 'PAID', $2, false, 'LEGACY_MIGRATION')
       RETURNING id`,
      [customerId, `idemp-leg-${uid}`]
    );
    legacyOrderId = legOrdRes.rows[0].id;

    // Unknown Order ($5.00)
    const unkOrdRes = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, idempotency_key, is_demo, data_provenance)
       VALUES ($1, 5.00, 'PAID', $2, false, 'UNKNOWN')
       RETURNING id`,
      [customerId, `idemp-unk-${uid}`]
    );
    unknownOrderId = unkOrdRes.rows[0].id;
  });

  afterAll(async () => {
    await pool.end();
  });

  // Test 1 & 2: QA order and sandbox payment excluded from commercial revenue
  it('1. QA order and sandbox payment excluded from commercial revenue', async () => {
    const res = await request(app).get('/api/executive/dashboard?mode=real');
    expect(res.status).toBe(200);
    expect(res.body.commerce.grossRevenue).toBeGreaterThanOrEqual(19.90);
    // QA order total (17.90) and legacy/unknown orders must not be present in commercial revenue
    expect(isOrderEligibleForRevenue({ is_demo: false, data_provenance: 'STAGING_SANDBOX_QA', status: 'PAID' })).toBe(false);
    expect(isPaymentEligibleForRevenue({ is_demo: false, data_provenance: 'STAGING_SANDBOX_QA', status: 'CONFIRMED' })).toBe(false);
  });

  // Test 3: QA conversion excluded from commercial conversion count
  it('2. QA conversion excluded from commercial conversion count', async () => {
    expect(isCommercialEligible({ is_demo: false, data_provenance: 'STAGING_SANDBOX_QA' })).toBe(false);
    expect(isCommercialEligible({ is_demo: false, data_provenance: 'QA_FIXTURE' })).toBe(false);
  });

  // Test 4: Commercial production paid order included in commercial revenue
  it('3. Commercial production paid order included in commercial revenue', async () => {
    expect(isOrderEligibleForRevenue({ is_demo: false, data_provenance: 'COMMERCIAL_PRODUCTION', status: 'PAID' })).toBe(true);
    expect(isPaymentEligibleForRevenue({ is_demo: false, data_provenance: 'COMMERCIAL_PRODUCTION', status: 'CONFIRMED' })).toBe(true);
  });

  // Test 5 & 6: Demo and QA products excluded from commercial catalog
  it('4. Demo product and QA product excluded from commercial catalog', async () => {
    const res = await request(app).get('/api/products?mode=real');
    expect(res.status).toBe(200);
    const names = res.body.products.map((p: any) => p.name);
    expect(names).toContain('TRATTORIA EM CASA');
    expect(names).not.toContain('Produto E2E Asaas Sandbox');
    expect(names).not.toContain('Demo Product Seed');
  });

  // Test 7 & 8: UNKNOWN and LEGACY_MIGRATION fail closed
  it('5. UNKNOWN and LEGACY_MIGRATION fail closed (not commercial)', async () => {
    expect(isCommercialEligible({ is_demo: false, data_provenance: 'UNKNOWN' })).toBe(false);
    expect(isCommercialEligible({ is_demo: false, data_provenance: 'LEGACY_MIGRATION' })).toBe(false);

    const res = await request(app).get('/api/products?mode=real');
    const ids = res.body.products.map((p: any) => p.id);
    expect(ids).not.toContain(unknownProductId);
    expect(ids).not.toContain(legacyProductId);
  });

  // Test 9: Clean commercial product eligible for commercial catalog
  it('6. TRATTORIA clean commercial product eligible for commercial catalog', async () => {
    expect(isProductEligibleForCatalog({ is_demo: false, data_provenance: 'COMMERCIAL_PRODUCTION', is_deleted: false })).toBe(true);
  });

  // Test 10: Historical QA product remains auditable
  it('7. Historical QA product remains auditable in audit scope', async () => {
    const res = await request(app).get('/api/products?mode=real&scope=audit');
    expect(res.status).toBe(200);
    const ids = res.body.products.map((p: any) => p.id);
    expect(ids).toContain(qaProductId);
    expect(ids).toContain(commercialProductId);
  });

  // Test 11 & 12: Offers segregation and commercial eligibility
  it('8. Commercial offers segregated from QA offers', async () => {
    const res = await request(app).get('/api/offers?mode=real');
    expect(res.status).toBe(200);
    const ids = res.body.offers.map((o: any) => o.id);
    expect(ids).toContain(commercialOfferId);
    expect(ids).not.toContain(qaOfferId);
  });

  // Test 13 & 14: Safety guardrails
  it('9. Safety guardrails: Meta write is OFF and Asaas production charges is OFF', () => {
    const metaWrite = process.env.META_WRITE === 'true';
    const asaasProd = process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
    expect(metaWrite).toBe(false);
    expect(asaasProd).toBe(false);
  });
});
