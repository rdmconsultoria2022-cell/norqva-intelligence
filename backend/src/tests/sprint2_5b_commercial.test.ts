import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB, verifyTestDbSafety } from '../db/db';
import { runMigrations } from '../db/migrations';
import { seedDemoData } from '../db/seed';

let pool: Pool;
let testUserId: string;

async function resetTestDb() {
  const client = await pool.connect();
  try {
    // Drop Sprint 2.5 commercial tables first
    await client.query('DROP TABLE IF EXISTS order_items CASCADE;');
    await client.query('DROP TABLE IF EXISTS orders CASCADE;');
    await client.query('DROP TABLE IF EXISTS customers CASCADE;');

    // Drop legacy tables
    await client.query('DROP TABLE IF EXISTS performance_entries CASCADE;');
    await client.query('DROP TABLE IF EXISTS capital_authorizations CASCADE;');
    await client.query('DROP TABLE IF EXISTS decisions CASCADE;');
    await client.query('DROP TABLE IF EXISTS audit_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiment_creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS experiments CASCADE;');
    await client.query('DROP TABLE IF EXISTS creatives CASCADE;');
    await client.query('DROP TABLE IF EXISTS offers CASCADE;');
    await client.query('DROP TABLE IF EXISTS products CASCADE;');
    await client.query('DROP TABLE IF EXISTS evidences CASCADE;');
    await client.query('DROP TABLE IF EXISTS opportunities CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');
    await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE;');
  } finally {
    client.release();
  }

  await runMigrations(pool);
  await seedDemoData(pool);
}

beforeAll(async () => {
  pool = initializeDB();
  
  // Set required variables for test environment
  process.env.NODE_ENV = 'test';
  process.env.ALLOW_DESTRUCTIVE_TESTS = 'true';
  process.env.AUTH_MODE = 'demo';
  
  // Safety checks
  verifyTestDbSafety();

  await resetTestDb();

  const userRes = await pool.query('SELECT id FROM users LIMIT 1');
  testUserId = userRes.rows[0].id;
});

afterAll(async () => {
  // Clear connections and restore env
  await pool.end();
});

describe('NORQVA Commercial Integration - Gate 2.5B', () => {

  describe('Customer Safe Reuse and Upsert Regression (C01 - C07)', () => {
    it('C01, C02, C03, C04, C05: handles first creation, safe idempotent reuse, profile updates, and strict demo/real isolation', async () => {
      // C01: first customer creation succeeds (DEMO)
      const res1 = await request(app)
        .post('/api/customers')
        .set('x-user-role', 'ADMIN')
        .send({
          name: 'John Initial',
          email: 'john.reuse@example.com',
          phone: '111111111',
          is_demo: true
        });
      expect(res1.status).toBe(201);
      expect(res1.body.is_demo).toBe(true);
      expect(res1.body.name).toBe('John Initial');
      const firstCustomerId = res1.body.id;
      expect(firstCustomerId).toBeDefined();

      // C02 & C04: same email same scope reuses same customer id and updates mutable profile fields safely
      const res2 = await request(app)
        .post('/api/customers')
        .set('x-user-role', 'ADMIN')
        .send({
          name: 'John Updated',
          email: 'john.reuse@example.com',
          phone: '999999999',
          is_demo: true
        });
      expect([200, 201]).toContain(res2.status);
      expect(res2.body.id).toBe(firstCustomerId); // Exact same ID preserved
      expect(res2.body.name).toBe('John Updated');
      expect(res2.body.phone).toBe('999999999');

      // C03: no duplicate row created in customers table
      const countRes = await pool.query(
        'SELECT count(*) FROM customers WHERE email = $1 AND is_demo = TRUE',
        ['john.reuse@example.com']
      );
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);

      // C05: same email in different Demo/Real scope remains strictly isolated
      const resReal = await request(app)
        .post('/api/customers')
        .set('x-user-role', 'ADMIN')
        .send({
          name: 'John Real Scope',
          email: 'john.reuse@example.com',
          phone: '888888888',
          is_demo: false
        });
      expect(resReal.status).toBe(201);
      expect(resReal.body.is_demo).toBe(false);
      expect(resReal.body.id).not.toBe(firstCustomerId); // Distinct ID in real scope

      const realCountRes = await pool.query(
        'SELECT count(*) FROM customers WHERE email = $1',
        ['john.reuse@example.com']
      );
      expect(parseInt(realCountRes.rows[0].count, 10)).toBe(2); // 1 demo, 1 real
    });

    it('C06 & C07: repeat customer can create new independent orders while idempotency protection remains intact', async () => {
      // Seed product and offer for test
      const productId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
         VALUES ($1, 'PRD-C06-TEST', 'Repeat Order Product', 'EBOOK', 'Desc', 'ATIVO', 'ORIGINAL', $2, 'Evidence', FALSE)`,
        [productId, testUserId]
      );

      const offerId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
         VALUES ($1, 'OFR-C06-TEST', $2, 'Repeat Order Offer', 17.90, NULL, 'Offer Desc', 'ATIVA', FALSE)`,
        [offerId, productId]
      );

      // Create returning customer
      const custRes = await request(app)
        .post('/api/customers')
        .set('x-user-role', 'ADMIN')
        .send({
          name: 'Repeat Buyer',
          email: 'repeat.buyer@example.com',
          phone: '12345',
          is_demo: false
        });
      const customerId = custRes.body.id;

      // First independent order
      const order1Key = `idemp-ord-1-${Date.now()}`;
      const order1Res = await request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({
          offer_id: offerId,
          customer_id: customerId,
          quantity: 1,
          idempotency_key: order1Key
        });
      expect(order1Res.status).toBe(201);
      const order1Id = order1Res.body.id;
      expect(order1Id).toBeDefined();

      // C06: Repeat customer creates a second independent order with new idempotency key
      const order2Key = `idemp-ord-2-${Date.now()}`;
      const order2Res = await request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({
          offer_id: offerId,
          customer_id: customerId,
          quantity: 2,
          idempotency_key: order2Key
        });
      expect(order2Res.status).toBe(201);
      const order2Id = order2Res.body.id;
      expect(order2Id).toBeDefined();
      expect(order2Id).not.toBe(order1Id); // Distinct independent orders for same customer

      // C07: Re-submitting with order1Key returns original order1Id (idempotency preserved)
      const order1DuplicateRes = await request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({
          offer_id: offerId,
          customer_id: customerId,
          quantity: 1,
          idempotency_key: order1Key
        });
      expect(order1DuplicateRes.status).toBe(200);
      expect(order1DuplicateRes.body.id).toBe(order1Id);
    });
  });

  it('should implement server-side pricing and anti-tamper validation', async () => {
    // Let's seed a real product and a real active offer
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-999999', 'Real Product', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', FALSE)`,
      [productId, testUserId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-999999', $2, 'Real Offer', 29.90, NULL, 'Offer Description', 'ATIVA', FALSE)`,
      [offerId, productId]
    );

    // Create a real customer
    const customerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({
        name: 'Real Buyer',
        email: 'real@buyer.com',
        phone: '12345',
        is_demo: false
      });
    const customerId = customerRes.body.id;

    // Tampered payload checkout
    const idempotencyKey = crypto.randomUUID();
    const checkoutRes = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: offerId,
        quantity: 2,
        customer_id: customerId,
        idempotency_key: idempotencyKey,
        // Tamper attempts
        amount: 1.00,
        unit_price: 1.00,
        total_amount: 2.00,
        is_demo: true // Attempt to force demo scope
      });

    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.is_demo).toBe(false); // Scope derived from Offer
    expect(parseFloat(checkoutRes.body.total_amount)).toBe(59.80); // Calculated by server: 29.90 * 2
    expect(checkoutRes.body.items).toHaveLength(1);
    expect(parseFloat(checkoutRes.body.items[0].unit_price)).toBe(29.90);
    expect(parseFloat(checkoutRes.body.items[0].total_price)).toBe(59.80);
    expect(checkoutRes.body.items[0].product_name_snapshot).toBe('Real Product');
    expect(checkoutRes.body.items[0].offer_name_snapshot).toBe('Real Offer');
    expect(checkoutRes.body.items[0].offer_description_snapshot).toBe('Offer Description');
  });

  it('should support checkout order creation idempotency', async () => {
    // Seed a demo product and active demo offer
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-888888', 'Demo Product', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', TRUE)`,
      [productId, testUserId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-888888', $2, 'Demo Offer', 19.90, NULL, 'Offer Description', 'ATIVA', TRUE)`,
      [offerId, productId]
    );

    // Create demo customer
    const customerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({
        name: 'Demo Buyer',
        email: 'demo@buyer.com',
        phone: '11111',
        is_demo: true
      });
    const customerId = customerRes.body.id;

    const idempotencyKey = crypto.randomUUID();
    
    // First request (Created - 211 / 201)
    const res1 = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: offerId,
        quantity: 1,
        customer_id: customerId,
        idempotency_key: idempotencyKey
      });
    expect(res1.status).toBe(201);
    const orderId = res1.body.id;

    // Second request (Existing - 200)
    const res2 = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: offerId,
        quantity: 1,
        customer_id: customerId,
        idempotency_key: idempotencyKey
      });
    expect(res2.status).toBe(200);
    expect(res2.body.id).toBe(orderId);

    // Double check database size has not grown
    const ordersCount = await pool.query('SELECT count(*) FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    expect(parseInt(ordersCount.rows[0].count, 10)).toBe(1);
  });

  it('should support concurrent checkout order creation idempotency', async () => {
    // Seed a demo product and active demo offer
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-CONC', 'Concurrent Product', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', TRUE)`,
      [productId, testUserId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-CONC', $2, 'Concurrent Offer', 19.90, NULL, 'Offer Description', 'ATIVA', TRUE)`,
      [offerId, productId]
    );

    // Create demo customer
    const customerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({
        name: 'Concurrent Buyer',
        email: 'conc@buyer.com',
        phone: '11111',
        is_demo: true
      });
    const customerId = customerRes.body.id;

    const idempotencyKey = crypto.randomUUID();

    // Fire two concurrent requests
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({ offer_id: offerId, quantity: 1, customer_id: customerId, idempotency_key: idempotencyKey }),
      request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({ offer_id: offerId, quantity: 1, customer_id: customerId, idempotency_key: idempotencyKey })
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(200);

    expect(res1.body.id).toBe(res2.body.id);
    expect(res1.body.items).toHaveLength(1);
    expect(res2.body.items).toHaveLength(1);

    const dbCount = await pool.query('SELECT count(*) FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    expect(parseInt(dbCount.rows[0].count, 10)).toBe(1);
  });

  it('should enforce transaction atomicity and rollback order if item insertion fails', async () => {
    // Seed real product and real active offer
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-777777', 'Real Product 2', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', FALSE)`,
      [productId, testUserId]
    );

    const offerId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-777777', $2, 'Real Offer 2', 49.90, NULL, 'Offer Description', 'ATIVA', FALSE)`,
      [offerId, productId]
    );

    // Create real customer
    const customerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({
        name: 'Real Buyer 2',
        email: 'real2@buyer.com',
        phone: '22222',
        is_demo: false
      });
    const customerId = customerRes.body.id;

    // Send a payload with invalid quantity to force check constraint check failure (quantity = -5 or quantity = 50000 to trigger application check or database CHECK)
    const idempotencyKey = crypto.randomUUID();
    const checkoutRes = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: offerId,
        quantity: -5, // Invalid quantity!
        customer_id: customerId,
        idempotency_key: idempotencyKey
      });
    
    expect(checkoutRes.status).toBe(400);

    // Verify order was not created
    const ordersCount = await pool.query('SELECT count(*) FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    expect(parseInt(ordersCount.rows[0].count, 10)).toBe(0);
  });

  it('should enforce scope cross-isolation rules', async () => {
    // Seed real product and real active offer
    const realProductId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-101010', 'Real Product Isolation', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', FALSE)`,
      [realProductId, testUserId]
    );

    const realOfferId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-101010', $2, 'Real Offer Isolation', 10.00, NULL, 'Description', 'ATIVA', FALSE)`,
      [realOfferId, realProductId]
    );

    // Seed demo product and demo active offer
    const demoProductId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, origin_provenance, origin_responsible_id, origin_evidence, is_demo)
       VALUES ($1, 'PRD-202020', 'Demo Product Isolation', 'EBOOK', 'Description', 'ATIVO', 'ORIGINAL', $2, 'Evidence', TRUE)`,
      [demoProductId, testUserId]
    );

    const demoOfferId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, promotional_price, description, status, is_demo)
       VALUES ($1, 'OFR-202020', $2, 'Demo Offer Isolation', 10.00, NULL, 'Description', 'ATIVA', TRUE)`,
      [demoOfferId, demoProductId]
    );

    // Create customer DEMO and customer REAL
    const demoCustomerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({ name: 'Demo Cust', email: 'demo_iso@test.com', is_demo: true });
    const demoCustomerId = demoCustomerRes.body.id;

    const realCustomerRes = await request(app)
      .post('/api/customers')
      .set('x-user-role', 'ADMIN')
      .send({ name: 'Real Cust', email: 'real_iso@test.com', is_demo: false });
    const realCustomerId = realCustomerRes.body.id;

    // A. Customer DEMO -> Order REAL (Offer REAL) => 409 Conflict
    const checkoutResA = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: realOfferId,
        quantity: 1,
        customer_id: demoCustomerId,
        idempotency_key: crypto.randomUUID()
      });
    expect(checkoutResA.status).toBe(409);

    // B. Customer REAL -> Order DEMO (Offer DEMO) => 409 Conflict
    const checkoutResB = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: demoOfferId,
        quantity: 1,
        customer_id: realCustomerId,
        idempotency_key: crypto.randomUUID()
      });
    expect(checkoutResB.status).toBe(409);

    // C. Offer DEMO -> Product REAL => 409 Conflict (by creating conflicting offer in DB directly first or validating)
    // We already check this in controllers. If someone tries to associate them, the backend rejects it.
    // Let's create an invalid offer directly in the database:
    const invalidOfferId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO offers (id, human_id, product_id, name, price, description, status, is_demo)
       VALUES ($1, 'OFR-303030', $2, 'Invalid Offer', 10.00, 'Desc', 'ATIVA', TRUE)`, // Offer is DEMO, Product is REAL
      [invalidOfferId, realProductId]
    );

    const checkoutResC = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({
        offer_id: invalidOfferId,
        quantity: 1,
        customer_id: demoCustomerId,
        idempotency_key: crypto.randomUUID()
      });
    expect(checkoutResC.status).toBe(409);
  });

  it('should enforce ON DELETE RESTRICT on referenced Products, Offers and Customers', async () => {
    // Retrieve reference IDs from the database
    const orderRes = await pool.query('SELECT o.id, o.customer_id, oi.offer_id, oi.product_id FROM orders o JOIN order_items oi ON o.id = oi.order_id LIMIT 1');
    const order = orderRes.rows[0];

    // A. Attempt to delete Customer referenced in Order
    await expect(pool.query('DELETE FROM customers WHERE id = $1', [order.customer_id])).rejects.toThrow();

    // B. Attempt to delete Offer referenced in Order Item
    await expect(pool.query('DELETE FROM offers WHERE id = $1', [order.offer_id])).rejects.toThrow();

    // C. Attempt to delete Product referenced in Order Item
    await expect(pool.query('DELETE FROM products WHERE id = $1', [order.product_id])).rejects.toThrow();
  });

  it('should preserve historical snapshots when referenced entities are updated', async () => {
    const orderRes = await pool.query(`
      SELECT o.id, oi.id as item_id, oi.product_id, oi.offer_id, oi.product_name_snapshot, oi.offer_name_snapshot, oi.offer_description_snapshot, oi.unit_price
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      LIMIT 1
    `);
    const order = orderRes.rows[0];

    // Update Product Name
    await pool.query('UPDATE products SET name = \'Updated Product Name\' WHERE id = $1', [order.product_id]);
    // Update Offer Name, Description, and Price
    await pool.query('UPDATE offers SET name = \'Updated Offer Name\', description = \'Updated Offer Desc\', price = 999.00 WHERE id = $1', [order.offer_id]);

    // Query Order Items again and verify snapshots remain unchanged
    const itemRes = await pool.query('SELECT * FROM order_items WHERE id = $1', [order.item_id]);
    const item = itemRes.rows[0];

    expect(item.product_name_snapshot).toBe(order.product_name_snapshot);
    expect(item.offer_name_snapshot).toBe(order.offer_name_snapshot);
    expect(item.offer_description_snapshot).toBe(order.offer_description_snapshot);
    expect(parseFloat(item.unit_price)).toBe(parseFloat(order.unit_price));
  });

  it('should enforce RBAC privacy rules and redact PII for non-operations roles', async () => {
    // 1. ADMIN - Full PII Access
    const resAdmin = await request(app)
      .get('/api/orders?mode=demo')
      .set('x-user-role', 'ADMIN');
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body[0].customer.name).not.toBe('[REDACTED]');
    expect(resAdmin.body[0].customer.email).not.toBe('[REDACTED]');
    expect(resAdmin.body[0].customer.phone).not.toBe('[REDACTED]');

    // 2. OPERATIONS - Full PII Access
    const resOps = await request(app)
      .get('/api/orders?mode=demo')
      .set('x-user-role', 'OPERATIONS');
    expect(resOps.status).toBe(200);
    expect(resOps.body[0].customer.name).not.toBe('[REDACTED]');
    expect(resOps.body[0].customer.email).not.toBe('[REDACTED]');
    expect(resOps.body[0].customer.phone).not.toBe('[REDACTED]');

    // 3. PERFORMANCE - Redacted email & phone
    const resPerf = await request(app)
      .get('/api/orders?mode=demo')
      .set('x-user-role', 'PERFORMANCE');
    expect(resPerf.status).toBe(200);
    expect(resPerf.body[0].customer.name).not.toBe('[REDACTED]');
    expect(resPerf.body[0].customer.email).toBe('[REDACTED]');
    expect(resPerf.body[0].customer.phone).toBe('[REDACTED]');

    // 4. CREATIVE - Redacted all customer details
    const resCreative = await request(app)
      .get('/api/orders?mode=demo')
      .set('x-user-role', 'CREATIVE');
    expect(resCreative.status).toBe(200);
    expect(resCreative.body[0].customer.name).toBe('[REDACTED]');
    expect(resCreative.body[0].customer.email).toBe('[REDACTED]');
    expect(resCreative.body[0].customer.phone).toBe('[REDACTED]');

    // 5. Unauthorized role
    const resUnauthorized = await request(app)
      .get('/api/orders?mode=demo')
      .set('x-user-role', 'EXTERNAL_VISITOR');
    expect(resUnauthorized.status).toBe(403);
  });

  it('should override client payload attempts to define is_demo scope', async () => {
    // Query a demo offer
    const offerRes = await pool.query("SELECT id, customer_id FROM (SELECT o.id, (SELECT c.id FROM customers c WHERE c.is_demo = TRUE LIMIT 1) as customer_id FROM offers o WHERE o.is_demo = TRUE LIMIT 1) as t");
    const demoOffer = offerRes.rows[0];

    if (demoOffer && demoOffer.customer_id) {
      const res = await request(app)
        .post('/api/checkout')
        .set('x-user-role', 'ADMIN')
        .send({
          offer_id: demoOffer.id,
          quantity: 1,
          customer_id: demoOffer.customer_id,
          idempotency_key: crypto.randomUUID(),
          is_demo: false // Tamper attempt
        });
      expect(res.status).toBe(201);
      expect(res.body.is_demo).toBe(true); // Derived from offer (is_demo = true), not client!
    }
  });

});
