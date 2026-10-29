// NORQVA-0148: e-mail com acento recusado antes do Asaas, motivo real da recusa e pedido substituído.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { emailProblem, validateEmail } from '../utils/validation';
import { describeAsaasRejection } from '../utils/asaasRejection';
import { emailKey, phoneKey, findSupersededOrderIds } from '../services/commerce/supersededOrders';
import { listSales } from '../services/salesService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';

describe('NORQVA-0148 — e-mail que o Asaas recusaria', () => {
  it('acento, ç e espaço têm mensagem própria', () => {
    expect(emailProblem('lídia.souza@gmail.com')).toBe('Confira o e-mail: ele não pode ter acento nem ç.');
    expect(emailProblem('joão@gmail.com')).toBe('Confira o e-mail: ele não pode ter acento nem ç.');
    expect(emailProblem('conceição@uol.com.br')).toBe('Confira o e-mail: ele não pode ter acento nem ç.');
    expect(emailProblem('maria silva@gmail.com')).toBe('Confira o e-mail: ele não pode ter espaço.');
  });

  it('formatos quebrados continuam "Informe um e-mail válido."', () => {
    for (const bad of ['', 'maria', 'maria@', '@gmail.com', 'maria@gmail', 'maria..silva@gmail.com', '.maria@gmail.com', 'maria.@gmail.com', 'maria@gmail.c']) {
      expect(emailProblem(bad)).toBe('Informe um e-mail válido.');
      expect(validateEmail(bad)).toBe(false);
    }
  });

  it('e-mails comuns passam', () => {
    for (const ok of ['lidia.souza1605@gmail.com', 'Maria.Silva@Exemplo.com.br', 'joao+livros@hotmail.com', 'a_b-c@sub.dominio.net', '  maria@gmail.com  ']) {
      expect(emailProblem(ok)).toBeNull();
      expect(validateEmail(ok)).toBe(true);
    }
  });

  it('o cadastro do comprador devolve o motivo do e-mail com acento', async () => {
    const res = await request(app)
      .post('/api/customers')
      .send({ name: 'Lídia Souza', email: 'lídia.souza@gmail.com', cpf_cnpj: '52998224725', is_demo: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Confira o e-mail: ele não pode ter acento nem ç.');
    expect(res.body.field).toBe('email');
  });
});

describe('NORQVA-0148 — motivo da recusa do Asaas', () => {
  const err = (errors: any[], statusCode = 400) => ({ statusCode, responseBody: JSON.stringify({ errors }) });

  it('reconhece o campo pelo código', () => {
    expect(describeAsaasRejection(err([{ code: 'invalid_email', description: 'x' }]))).toMatchObject({ field: 'email', reason: 'ASAAS_400:invalid_email:email' });
    expect(describeAsaasRejection(err([{ code: 'invalid_cpfCnpj', description: 'x' }]))).toMatchObject({ field: 'cpf', reason: 'ASAAS_400:invalid_cpfCnpj:cpf' });
    expect(describeAsaasRejection(err([{ code: 'invalid_mobilePhone', description: 'x' }]))).toMatchObject({ field: 'phone' });
    expect(describeAsaasRejection(err([{ code: 'invalid_name', description: 'x' }]))).toMatchObject({ field: 'name' });
  });

  it('sem código do campo, usa a descrição só para achar o campo e nunca a grava', () => {
    const r = describeAsaasRejection(err([{ code: 'invalid_object', description: 'O e-mail joão@x.com é inválido.' }]));
    expect(r.field).toBe('email');
    expect(r.reason).toBe('ASAAS_400:invalid_object:email');
    expect(r.message).toMatch(/^Confira o e-mail/);
    expect(JSON.stringify(r)).not.toContain('joão');
  });

  it('sem corpo ou erro desconhecido: mensagem de sempre', () => {
    const r = describeAsaasRejection({ statusCode: 400 });
    expect(r.field).toBeNull();
    expect(r.reason).toBe('ASAAS_400:sem_codigo:outro');
    expect(r.message).toContain('Verifique seus dados');
    expect(describeAsaasRejection({ statusCode: 422, responseBody: 'não é json' }).reason).toBe('ASAAS_422:sem_codigo:outro');
  });

  it('código com caracteres estranhos é limpo e o motivo cabe na coluna', () => {
    const r = describeAsaasRejection(err([{ code: "abc'; DROP--" }, { code: 'x'.repeat(200) }, { code: 'b' }, { code: 'c' }]));
    expect(r.reason).not.toMatch(/['; ]/);
    expect(r.reason.length).toBeLessThanOrEqual(120);
  });
});

describe('NORQVA-0148 — chaves da mesma pessoa', () => {
  it('e-mail sem diferença de acento ou maiúscula', () => {
    expect(emailKey('Lídia.Souza1605@gmail.com ')).toBe(emailKey('lidia.souza1605@gmail.com'));
    expect(emailKey('sem-arroba')).toBeNull();
  });
  it('telefone com ou sem 55 e com ou sem o 9', () => {
    expect(phoneKey('558499846197')).toBe(phoneKey('84999846197'));
    expect(phoneKey('+55 (31) 98392-6969')).toBe(phoneKey('31983926969'));
    expect(phoneKey('123')).toBeNull();
    // número inventado (dígito repetido ou sequência) não liga pessoas diferentes
    expect(phoneKey('11999999999')).toBeNull();
    expect(phoneKey('31988888888')).toBeNull();
    expect(phoneKey('11912345678')).toBeNull();
  });
});

describe.sequential('NORQVA-0148 — pedido substituído (calculado, nada é gravado)', () => {
  let pool: Pool;
  const orders: string[] = [];
  const customers: string[] = [];
  const base = Date.now() - 3 * 60 * 60 * 1000;
  const at = (minutes: number) => new Date(base + minutes * 60 * 1000).toISOString();

  async function order(email: string, phone: string | null, status: 'PENDING' | 'PAID', minutes: number, customerId?: string) {
    let cid = customerId;
    if (!cid) {
      cid = crypto.randomUUID();
      await pool.query('INSERT INTO customers (id, name, email, phone, is_demo) VALUES ($1, $2, $3, $4, true)', [cid, 'Pessoa 0148', email, phone]);
      customers.push(cid);
    }
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO orders (id, customer_id, total_amount, status, idempotency_key, is_demo, created_at) VALUES ($1, $2, 29.9, $3, $4, true, $5)`,
      [id, cid, status, crypto.randomUUID(), at(minutes)]
    );
    orders.push(id);
    return { id, cid };
  }

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await pool.query('DELETE FROM customers WHERE id = ANY($1::uuid[])', [customers]);
  });

  it('marca só o aguardando cuja pessoa pagou outro pedido depois', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    // mesmo e-mail com acento diferente e telefone com 55 e sem o 9 (o caso da Lídia)
    const lidiaPend = await order(`lídia.${tag}@gmail.com`, '558499846197', 'PENDING', 0);
    await order(`lidia.${tag}@gmail.com`, '84999846197', 'PAID', 2);
    // mesmo cadastro
    const ana = await order(`ana.${tag}@x.com`, null, 'PENDING', 10);
    await order('', null, 'PAID', 12, ana.cid);
    // pagou ANTES: não substitui
    const biaPaid = await order(`bia.${tag}@x.com`, null, 'PAID', 20);
    const biaPend = await order('', null, 'PENDING', 30, biaPaid.cid);
    // ninguém pagou
    const solo = await order(`solo.${tag}@x.com`, '11911112222', 'PENDING', 40);

    const rows = await pool.query(
      `SELECT o.id, o.created_at, o.customer_id, o.is_demo, c.email, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ANY($1::uuid[]) AND o.status = 'PENDING'`,
      [[lidiaPend.id, ana.id, biaPend.id, solo.id]]
    );
    const ids = await findSupersededOrderIds(pool, rows.rows);
    expect(ids.has(lidiaPend.id)).toBe(true);
    expect(ids.has(ana.id)).toBe(true);
    expect(ids.has(biaPend.id)).toBe(false);
    expect(ids.has(solo.id)).toBe(false);

    // Vendas: aparece como substituído e sai da contagem de pendentes; o banco não muda
    const sales = await listSales(pool, {
      isDemo: true, includeTests: true, filter: 'ALL', startIso: at(-1), endIso: at(60), canSeeFullPII: true, canSeeName: true
    });
    const mine = sales.orders.filter((o: any) => orders.includes(o.id));
    expect(mine.find((o: any) => o.id === lidiaPend.id)?.superseded).toBe(true);
    expect(mine.find((o: any) => o.id === solo.id)?.superseded).toBe(false);
    expect(sales.summary.superseded).toBeGreaterThanOrEqual(2);
    const still = await pool.query('SELECT status FROM orders WHERE id = $1', [lidiaPend.id]);
    expect(still.rows[0].status).toBe('PENDING');
  });

  it('pagamento mais de 7 dias depois não conta', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const old = await order(`velho.${tag}@x.com`, null, 'PENDING', -60 * 24 * 9);
    await order('', null, 'PAID', 0, old.cid);
    const rows = await pool.query(
      `SELECT o.id, o.created_at, o.customer_id, o.is_demo, c.email, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
      [old.id]
    );
    expect((await findSupersededOrderIds(pool, rows.rows)).size).toBe(0);
  });
});
