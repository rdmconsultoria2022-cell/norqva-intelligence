import { Client } from 'pg';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';
import { encryptData, generateHmacHash } from './src/utils/crypto';

dotenv.config();

function fetchRealSupabaseToken(): Promise<string> {
  const email = process.env.SUPABASE_TEST_EMAIL;
  const password = process.env.SUPABASE_TEST_PASSWORD;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const jwksUrl = process.env.SUPABASE_JWKS_URL;
  
  if (!email || !password || !publishableKey || !jwksUrl) {
    throw new Error('Supabase Real credentials not fully configured.');
  }

  const jwks = new URL(jwksUrl);
  const supabaseUrl = process.env.SUPABASE_URL || `${jwks.protocol}//${jwks.host}`;

  return new Promise((resolve, reject) => {
    const fullUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    const urlObj = new URL(fullUrl);
    const payload = JSON.stringify({ email, password });
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port ? parseInt(urlObj.port, 10) : 443,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: 'POST',
      headers: {
        'apikey': publishableKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`Failed to obtain token: ${JSON.stringify(parsed)}`));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

function callCheckoutAPI(token: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/checkout',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(responseBody)
          });
        } catch (e) {
          reject(new Error(`Failed parsing response: ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

async function seedTestEntities(client: Client, sub: string) {
  // Ensure real mapped user is in DB
  const userCheckEmail = await client.query("SELECT id FROM users WHERE email = 'admin@norqva.com'");
  let userId;
  if (userCheckEmail.rows.length === 0) {
    userId = crypto.randomUUID();
    await client.query(`
      INSERT INTO users (id, auth_user_id, name, email, role, status, is_demo)
      VALUES ($1, $2, 'Admin User', 'admin@norqva.com', 'ADMIN', 'ACTIVE', true)
    `, [userId, sub]);
  } else {
    userId = userCheckEmail.rows[0].id;
    await client.query(`
      UPDATE users 
      SET auth_user_id = $1 
      WHERE id = $2
    `, [sub, userId]);
  }

  const prodId = crypto.randomUUID();
  await client.query(
    `INSERT INTO products (id, human_id, name, category, status, description, is_demo) 
     VALUES ($1, 'PRD-DEL-E2E', 'E2E Delivery Product', 'Downloads', 'PLANEJADO', 'Desc', true)`,
    [prodId]
  );

  const offerId = crypto.randomUUID();
  await client.query(
    `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo) 
     VALUES ($1, 'OFF-DEL-E2E', 'E2E Delivery Offer', $2, 40.00, 40.00, 'ATIVA', 'Desc', true)`,
    [offerId, prodId]
  );

  const custId = crypto.randomUUID();
  
  // Encrypt document
  const encKey = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
  const hmacSecret = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
  const demoCpfEnc = encryptData('12345678909', encKey).encryptedText;
  const demoCpfHash = generateHmacHash('12345678909', hmacSecret);

  await client.query(
    `INSERT INTO customers (id, name, email, phone, is_demo, cpf_cnpj_encrypted, cpf_cnpj_hash) 
     VALUES ($1, 'E2E Delivery Customer', 'e2e_del@cust.com', '11987654321', true, $2, $3)`,
    [custId, demoCpfEnc, demoCpfHash]
  );

  const assetId = crypto.randomUUID();
  await client.query(
    `INSERT INTO digital_assets (id, name, storage_provider, storage_bucket, storage_path, is_demo)
     VALUES ($1, 'E-Book Guide', 'SUPABASE', 'digital-products', 'books/guide.pdf', true)`,
    [assetId]
  );

  await client.query(
    `INSERT INTO offer_digital_assets (offer_id, asset_id) VALUES ($1, $2)`,
    [offerId, assetId]
  );

  return {
    customer: { id: custId },
    offer: { id: offerId, price: 40.00 }
  };
}

function callCheckoutPix(orderId: string, checkoutToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/checkout/orders/${orderId}/pix`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-checkout-token': checkoutToken
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(JSON.stringify({ idempotency_key: crypto.randomUUID() }));
    req.end();
  });
}

function simulateAsaasPayment(providerPaymentId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ASAAS_API_KEY;
    const url = `https://api-sandbox.asaas.com/v3/sandbox/payment/${providerPaymentId}/confirm`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: 'POST',
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'NORQVA Core E2E Test'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: data ? JSON.parse(data) : {}
          });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: { raw: data } });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(JSON.stringify({}));
    req.end();
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || 'postgresql://postgres:RicardoAndradeLucas@localhost:5432/norqva_test';
  const client = new Client({ connectionString });
  
  try {
    // Fetch real Supabase token first
    console.log('Fetching real Supabase Auth token...');
    const token = await fetchRealSupabaseToken();
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const sub = payload.sub;

    await client.connect();
    
    // Clear previous runs
    await client.query("DELETE FROM order_deliveries");
    await client.query("DELETE FROM offer_digital_assets");
    await client.query("DELETE FROM digital_assets");
    await client.query("DELETE FROM payment_webhook_events");
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM order_items");
    await client.query("DELETE FROM orders");
    await client.query("DELETE FROM customers");
    await client.query("DELETE FROM offers");
    await client.query("DELETE FROM products");
    
    console.log('Seeding fresh test entities...');
    const { customer, offer } = await seedTestEntities(client, sub);
    console.log(`Seeded Customer ID: ${customer.id}, Offer ID: ${offer.id}`);

    // 1. Create Order via checkout API
    console.log('Creating order via checkout API...');
    const orderRes = await callCheckoutAPI(token, {
      offer_id: offer.id,
      quantity: 1,
      customer_id: customer.id,
      idempotency_key: crypto.randomUUID()
    });

    console.log('Checkout API status:', orderRes.statusCode);
    if (orderRes.statusCode !== 201 && orderRes.statusCode !== 200) {
      throw new Error(`Checkout API failed: ${JSON.stringify(orderRes.body)}`);
    }
    const orderId = orderRes.body.id;
    const checkoutToken = orderRes.body.checkout_token;
    console.log(`Test Order created with ID: ${orderId}, Checkout Token: ${checkoutToken}`);

    // 2. Call checkout Pix to create Payment Sandbox at Asaas
    console.log('Initializing Pix payment at Asaas Sandbox...');
    const checkoutRes = await callCheckoutPix(orderId, checkoutToken);
    console.log('Checkout Pix response status:', checkoutRes.statusCode);
    
    if (checkoutRes.statusCode !== 200 && checkoutRes.statusCode !== 201) {
      throw new Error(`Checkout Pix failed: ${JSON.stringify(checkoutRes.body)}`);
    }

    // 3. Retrieve payment details from local DB
    const payQuery = await client.query("SELECT * FROM payments WHERE order_id = $1", [orderId]);
    if (payQuery.rows.length === 0) {
      throw new Error('Payment was not created in database.');
    }
    const payment = payQuery.rows[0];
    console.log(`Created payment in DB. ID: ${payment.id}, Provider Payment ID: ${payment.provider_payment_id}`);

    if (!payment.provider_payment_id) {
      throw new Error('Provider Payment ID (Asaas ID) is missing.');
    }

    // 4. Simulate payment payment confirmation in Asaas Sandbox to trigger Webhook
    console.log('Simulating payment payment confirmation in Asaas Sandbox...');
    const simRes = await simulateAsaasPayment(payment.provider_payment_id);
    console.log('Simulation response status:', simRes.statusCode);
    
    if (simRes.statusCode !== 200) {
      throw new Error(`Simulation failed: ${JSON.stringify(simRes.body)}`);
    }
    console.log('Simulation succeeded. Waiting 12 seconds for webhook reception and processing...');
    
    await new Promise(r => setTimeout(r, 12000));

    // 5. Query and check results
    const finalPay = (await client.query("SELECT * FROM payments WHERE id = $1", [payment.id])).rows[0];
    const finalOrder = (await client.query("SELECT * FROM orders WHERE id = $1", [orderId])).rows[0];
    const webhooks = await client.query("SELECT * FROM payment_webhook_events WHERE payment_id = $1", [payment.id]);
    const deliveries = await client.query("SELECT * FROM order_deliveries WHERE order_id = $1", [orderId]);

    console.log('--- TEST RESULTS ---');
    console.log(JSON.stringify({
      payment_status: finalPay.status,
      order_status: finalOrder.status,
      webhooks_received: webhooks.rows.length,
      webhook_duplicate_test: null,
      deliveries_created: deliveries.rows.length,
      delivery_token_hash_is_null: deliveries.rows.length > 0 && deliveries.rows[0].delivery_token_hash === null ? 'YES' : 'NO'
    }));

    if (webhooks.rows.length > 0) {
      // 6. Test duplicate webhook event (idempotency check)
      console.log('Sending duplicate webhook event to test idempotency...');
      const duplicatePayload = {
        event: webhooks.rows[0].event_type,
        payment: {
          id: payment.provider_payment_id,
          externalReference: payment.id
        }
      };

      const options = {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/webhooks/asaas',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'asaas-access-token': process.env.ASAAS_WEBHOOK_AUTH_TOKEN
        }
      };

      const dupRes = await new Promise((resResolve) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => resResolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
        req.write(JSON.stringify(duplicatePayload));
        req.end();
      });
      console.log('Duplicate webhook test response:', JSON.stringify(dupRes));
    }

  } catch (err) {
    console.error('E2E Webhook Test failed:', err);
  } finally {
    // Cleanup temporary tables to leave DB clean
    await client.query("DELETE FROM order_deliveries");
    await client.query("DELETE FROM offer_digital_assets");
    await client.query("DELETE FROM digital_assets");
    await client.query("DELETE FROM payment_webhook_events");
    await client.query("DELETE FROM payments");
    await client.query("DELETE FROM order_items");
    await client.query("DELETE FROM orders");
    await client.query("DELETE FROM customers");
    await client.query("DELETE FROM offers");
    await client.query("DELETE FROM products");
    await client.end();
  }
}

main();
