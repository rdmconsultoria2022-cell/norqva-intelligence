// NORQVA-0163: cliente do Asaas recusado (apagado/inválido) é refeito uma vez e a cobrança sai.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { encryptData, generateHmacHash } from '../utils/crypto';
import { AsaasPaymentProvider } from '../utils/payment';
import { isAsaasCustomerRejection } from '../utils/asaasRejection';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'default_hmac_secret_for_testing';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.AUTH_MODE = 'demo';

const asaasErr = (errors: any[], statusCode = 400) => {
  const e: any = new Error(`Asaas API error status ${statusCode}`);
  e.statusCode = statusCode;
  e.responseBody = JSON.stringify({ errors });
  return e;
};

describe('NORQVA-0163 — reconhece recusa por causa do cliente', () => {
  it('código ou descrição de cliente inválido/removido', () => {
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_customer', description: 'Cliente inválido ou não informado.' }]))).toBe(true);
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_action', description: 'O cliente informado foi removido.' }]))).toBe(true);
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_object', description: 'Customer not found' }], 404))).toBe(true);
  });
  it('outras recusas e erros do servidor não contam', () => {
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_cpfCnpj', description: 'CPF inválido' }]))).toBe(false);
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_email', description: 'E-mail inválido' }]))).toBe(false);
    expect(isAsaasCustomerRejection(asaasErr([{ code: 'invalid_customer' }], 500))).toBe(false);
    expect(isAsaasCustomerRejection({ statusCode: 400 })).toBe(false);
    expect(isAsaasCustomerRejection(null)).toBe(false);
  });
});

describe.sequential('NORQVA-0163 — Pix de quem já comprou', () => {
  let pool: Pool;
  let offerId: string;
  let productId: string;
  const customers: string[] = [];
  const spies: any[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    productId = crypto.randomUUID();
    offerId = crypto.randomUUID();
    const tag = crypto.randomUUID().slice(0, 6);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, status, description, is_demo) VALUES ($1, $2, 'Livro 0163', 'Livro', 'PLANEJADO', 'x', true)`,
      [productId, `PRD-0163-${tag}`]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, status, description, is_demo) VALUES ($1, $2, 'Oferta 0163', $3, 29.90, 'ATIVA', 'x', true)`,
      [offerId, `OFF-0163-${tag}`, productId]
    );
  });

  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  afterAll(async () => {
    await pool.query('DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ANY($1::uuid[]))', [customers]);
    await pool.query('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id = ANY($1::uuid[]))', [customers]);
    await pool.query('DELETE FROM orders WHERE customer_id = ANY($1::uuid[])', [customers]);
    await pool.query('DELETE FROM payment_provider_customers WHERE customer_id = ANY($1::uuid[])', [customers]);
    await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]);
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
  });

  async function returningCustomer(withCpf: boolean) {
    const id = crypto.randomUUID();
    customers.push(id);
    const enc = withCpf ? encryptData('52998224725', process.env.ENCRYPTION_KEY!).encryptedText : null;
    const hash = withCpf ? generateHmacHash('52998224725', process.env.CPF_CNPJ_HASH_SECRET!) : null;
    await pool.query(
      `INSERT INTO customers (id, name, email, phone, is_demo, cpf_cnpj_encrypted, cpf_cnpj_hash) VALUES ($1, 'Jean Teste', $2, '31988887777', true, $3, $4)`,
      [id, `jean.${id.slice(0, 8)}@x.com`, enc, hash]
    );
    // vínculo antigo com um cliente que o Asaas não aceita mais
    for (const envName of ['SANDBOX', 'PRODUCTION']) {
      await pool.query(
        `INSERT INTO payment_provider_customers (customer_id, provider, provider_customer_id, provider_environment, is_demo)
         VALUES ($1, 'ASAAS', $2, $3, true)`,
        [id, `cus_antigo_${id.slice(0, 8)}`, envName]
      );
    }
    const orderRes = await request(app)
      .post('/api/checkout')
      .set('x-user-role', 'ADMIN')
      .send({ offer_id: offerId, quantity: 1, customer_id: id, idempotency_key: crypto.randomUUID() });
    expect(orderRes.status).toBe(201);
    return { id, order: orderRes.body };
  }

  function baseSpies() {
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByEmail').mockResolvedValue([])
    );
  }

  it('refaz o cliente, gera o Pix e o vínculo passa a apontar para o novo', async () => {
    const { id, order } = await returningCustomer(true);
    baseSpies();
    const createPix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment')
      .mockRejectedValueOnce(asaasErr([{ code: 'invalid_customer', description: 'Cliente inválido ou não informado.' }]))
      .mockResolvedValue({ providerPaymentId: 'pay_0163', pixCopyPaste: '000201pix0163', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING' } as any);
    const createCustomer = vi.spyOn(AsaasPaymentProvider.prototype, 'createCustomer').mockResolvedValue('cus_novo');
    spies.push(createPix, createCustomer);

    const res = await request(app)
      .post(`/api/checkout/orders/${order.id}/pix`)
      .set('x-checkout-token', order.checkout_token)
      .send({ idempotency_key: crypto.randomUUID() });

    expect(res.status).toBe(201);
    expect(res.body.pix_copy_paste).toBe('000201pix0163');
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(createPix).toHaveBeenCalledTimes(2);
    expect(createPix.mock.calls[0][0]).toMatchObject({ providerCustomerId: `cus_antigo_${id.slice(0, 8)}` });
    expect(createPix.mock.calls[1][0]).toMatchObject({ providerCustomerId: 'cus_novo' });
    const map = await pool.query(`SELECT DISTINCT provider_customer_id FROM payment_provider_customers WHERE customer_id = $1 AND provider_customer_id = 'cus_novo'`, [id]);
    expect(map.rows.length).toBe(1);
    const audit = await pool.query(`SELECT 1 FROM audit_logs WHERE event_type = 'ASAAS_CUSTOMER_RECREATED' AND new_value = 'cus_novo'`);
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('tenta só uma vez: se recusar de novo, o pedido falha como antes', async () => {
    const { order } = await returningCustomer(true);
    baseSpies();
    const rej = asaasErr([{ code: 'invalid_customer', description: 'Cliente inválido ou não informado.' }]);
    const createPix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockRejectedValue(rej);
    const createCustomer = vi.spyOn(AsaasPaymentProvider.prototype, 'createCustomer').mockResolvedValue('cus_novo2');
    spies.push(createPix, createCustomer);

    const res = await request(app)
      .post(`/api/checkout/orders/${order.id}/pix`)
      .set('x-checkout-token', order.checkout_token)
      .send({ idempotency_key: crypto.randomUUID() });

    expect(res.status).toBe(400);
    expect(createPix).toHaveBeenCalledTimes(2);
    expect(createCustomer).toHaveBeenCalledTimes(1);
    const pay = await pool.query('SELECT status, failure_reason FROM payments WHERE order_id = $1', [order.id]);
    expect(pay.rows[0].status).toBe('FAILED');
    expect(pay.rows[0].failure_reason).toBe('ASAAS_400:invalid_customer:outro');
  });

  it('recusa de outro tipo (CPF) não refaz o cliente', async () => {
    const { order } = await returningCustomer(true);
    baseSpies();
    const createPix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment')
      .mockRejectedValue(asaasErr([{ code: 'invalid_cpfCnpj', description: 'CPF inválido' }]));
    const createCustomer = vi.spyOn(AsaasPaymentProvider.prototype, 'createCustomer').mockResolvedValue('cus_x');
    spies.push(createPix, createCustomer);

    const res = await request(app)
      .post(`/api/checkout/orders/${order.id}/pix`)
      .set('x-checkout-token', order.checkout_token)
      .send({ idempotency_key: crypto.randomUUID() });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('cpf');
    expect(createPix).toHaveBeenCalledTimes(1);
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('sem CPF guardado nem enviado: não refaz (o Asaas exige CPF)', async () => {
    const { order } = await returningCustomer(false);
    baseSpies();
    const createPix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment')
      .mockRejectedValue(asaasErr([{ code: 'invalid_customer', description: 'Cliente inválido' }]));
    const createCustomer = vi.spyOn(AsaasPaymentProvider.prototype, 'createCustomer').mockResolvedValue('cus_y');
    spies.push(createPix, createCustomer);

    const res = await request(app)
      .post(`/api/checkout/orders/${order.id}/pix`)
      .set('x-checkout-token', order.checkout_token)
      .send({ idempotency_key: crypto.randomUUID() });

    expect(res.status).toBe(400);
    expect(createPix).toHaveBeenCalledTimes(1);
    expect(createCustomer).not.toHaveBeenCalled();
  });
});
