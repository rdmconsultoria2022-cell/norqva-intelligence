// NORQVA-0079: WhatsApp oficial (Cloud API da Meta). A Graph API é sempre simulada (nada sai para a Meta).
// Cobre: contas por operação e ambiente, segredos nunca expostos, webhook (verificação, assinatura, idempotência,
// status), travas de envio, janela de 24h, erros da Meta, isolamento entre contas, teste x produção.
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
import { maskPath } from '../middleware/logging';
import { setWhatsAppInboundHandler } from '../controllers/whatsappController';
import { setGraphFetchForTests, GraphFetch, MetaCloudProvider, describeCloudError, phoneVariants, SendBlockedError, CloudApiError } from '../services/whatsapp/metaCloudProvider';
import { providerForNumber } from '../services/whatsapp/cloudAccounts';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiReply } from '../services/whatsapp/attendant';
import { whatsappNumberForOffer } from '../services/whatsapp/whatsappRefs';
import { windowOpenAt } from '../services/whatsapp/serviceWindow';
import { evolutionEnabled } from '../services/whatsapp/provider';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0079';

const SECRETS_KEY = crypto.randomBytes(32).toString('base64');
const TOKEN_A = `EAAG${'a'.repeat(60)}TKA1`;
const TOKEN_B = `EAAG${'b'.repeat(60)}TKB2`;
const APP_SECRET_A = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const APP_SECRET_B = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3';
const RECIPIENT = '5531988887777';
const STRANGER = '5511944443333';

interface GraphCall { url: string; method: string; auth: string; body: any }

describe.sequential('NORQVA-0079 — WhatsApp oficial (Cloud API)', () => {
  let pool: Pool;
  let admin: string;
  let ops: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerCode = `OFF-C${tag}`;
  const wabaA = `1${Date.now()}`.slice(0, 15);
  const wabaB = `2${Date.now()}`.slice(0, 15);
  const pnA = `3${Date.now()}`.slice(0, 15);
  const pnB = `4${Date.now()}`.slice(0, 15);
  const wabaC = `5${Date.now()}`.slice(0, 15);
  const pnC = `6${Date.now()}`.slice(0, 15);
  let accountC = '';
  let numberC = '';
  let accountA = '';
  let accountB = '';
  let verifyTokenA = '';
  let numberA = '';
  let numberB = '';
  const calls: GraphCall[] = [];
  let failNext: { code: number; times: number } | null = null;
  let scopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
  const inbound: { numberId: string; n: number }[] = [];
  const spies: any[] = [];
  let script: AiReply[] = [];
  const fakeAi = async () => script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const graph: GraphFetch = async (url, init) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v\d+\.\d+/, '');
    calls.push({ url, method: init.method, auth: init.headers.Authorization, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
    if (failNext && failNext.times > 0 && path.endsWith('/messages')) {
      failNext.times--;
      return { status: 400, json: { error: { code: failNext.code, message: 'simulado' } } };
    }
    if (path === '/debug_token') return { status: 200, json: { data: { is_valid: true, scopes } } };
    if (path === `/${wabaA}` || path === `/${wabaB}`) return { status: 200, json: { id: path.slice(1), name: 'WABA' } };
    if (path === `/${wabaA}/phone_numbers`) return { status: 200, json: { data: [{ id: pnA, display_phone_number: '+1 555-010-0001', verified_name: 'Trattoria Teste', quality_rating: 'GREEN' }] } };
    if (path === `/${wabaB}/phone_numbers`) return { status: 200, json: { data: [{ id: pnB, display_phone_number: '+1 555-010-0002', verified_name: 'Outra Marca', quality_rating: 'GREEN' }] } };
    if (path.endsWith('/subscribed_apps')) return { status: 200, json: { success: true } };
    if (path.endsWith('/media')) return { status: 200, json: { id: 'MEDIA-1' } };
    if (path.endsWith('/messages')) return { status: 200, json: { messages: [{ id: `wamid.${crypto.randomUUID()}` }] } };
    if (path === `/${pnA}`) return { status: 200, json: { display_phone_number: '+1 555-010-0001', verified_name: 'Trattoria Teste', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_250' } };
    return { status: 404, json: { error: { code: 100, message: 'nao simulado' } } };
  };

  const sign = (body: string, secret: string) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const messagePayload = (waba: string, pn: string, from: string, id: string, text: string, name = 'Maria') => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: waba,
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550100001', phone_number_id: pn },
          contacts: [{ wa_id: from, profile: { name } }],
          messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }]
        }
      }]
    }]
  });
  const post = (accountId: string, payload: any, secret: string | null) => {
    const raw = JSON.stringify(payload);
    const r = request(app).post(`/api/whatsapp/cloud/webhook/${accountId}`).set('Content-Type', 'application/json');
    if (secret) r.set('X-Hub-Signature-256', sign(raw, secret));
    return r.send(raw);
  };
  const convOf = async (number: string, phone: string) =>
    (await pool.query('SELECT * FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [number, `${phone}@s.whatsapp.net`])).rows[0];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const r = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, role, role]
      );
      return signSupabaseToken({ sub: r.rows[0].auth_user_id, email: r.rows[0].email, role });
    };
    admin = await mk('admin.norqva0079@norqva.test', 'ADMIN');
    ops = await mk('ops.norqva0079@norqva.test', 'OPERATIONS');
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Trattoria 0079')`, [brandId, `B79${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES ($1, $2, 'Livro 0079', 'Receitas', 'PDF', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-C${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Trattoria em Casa 0079', $3, 29.90, 19.90, 'ATIVA', '28 receitas', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, offerCode, productId]
    );
    setGraphFetchForTests(graph);
    setWhatsAppInboundHandler(async (_pool, numberId, msgs) => {
      inbound.push({ numberId, n: msgs.length });
    });
  });

  afterAll(async () => {
    setGraphFetchForTests(null);
    setWhatsAppInboundHandler(null);
    setAttendantAiForTests(null);
    delete process.env.WHATSAPP_SECRETS_KEY;
    delete process.env.WHATSAPP_CLOUD_SEND_ENABLED;
    delete process.env.WHATSAPP_CLOUD_ENVIRONMENTS;
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const nums = [numberA, numberB, numberC].filter(Boolean);
    const orders = (await pool.query(
      `SELECT o.id FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id WHERE c.number_id = ANY($1::uuid[])`, [nums]
    ).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => r.id);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_numbers WHERE id = ANY($1::uuid[])', [nums]);
    await q('DELETE FROM whatsapp_cloud_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB, accountC].filter(Boolean)]);
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0079.${tag}@example.com`])).rows.map((r: any) => r.id);
    await q('DELETE FROM payment_provider_customers WHERE customer_id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM offers WHERE id = $1', [offerId]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
    await q('DELETE FROM brands WHERE id = $1', [brandId]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    calls.length = 0;
    failNext = null;
    process.env.WHATSAPP_SECRETS_KEY = SECRETS_KEY;
    delete process.env.WHATSAPP_CLOUD_SEND_ENABLED;
    delete process.env.WHATSAPP_CLOUD_ENVIRONMENTS;
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  // ---------- contas ----------

  it('sem WHATSAPP_SECRETS_KEY nada é salvo; só ADMIN cadastra conta', async () => {
    delete process.env.WHATSAPP_SECRETS_KEY;
    const body = { label: 'T0079 A', brand_id: brandId, environment: 'TEST', waba_id: wabaA, app_id: '1234567890', access_token: TOKEN_A, app_secret: APP_SECRET_A, test_recipients: '+55 31 98888-7777' };
    const noKey = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(admin)).send(body);
    expect(noKey.status).toBe(503);
    process.env.WHATSAPP_SECRETS_KEY = SECRETS_KEY;
    const denied = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(ops)).send(body);
    expect(denied.status).toBe(403);
    const count = (await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_cloud_accounts WHERE waba_id = $1', [wabaA])).rows[0].n;
    expect(count).toBe(0);
  });

  it('cadastra contas TEST isoladas por operação; token e chave secreta nunca voltam para a tela', async () => {
    const a = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(admin)).send({
      label: 'T0079 A', brand_id: brandId, environment: 'TEST', waba_id: wabaA, app_id: '1234567890',
      access_token: TOKEN_A, app_secret: APP_SECRET_A, test_recipients: '+55 31 98888-7777'
    });
    expect(a.status).toBe(201);
    expect(a.body.verify_token).toMatch(/^[0-9a-f]{48}$/);
    expect(a.body.account).toMatchObject({ environment: 'TEST', status: 'NEW', token_last4: 'TKA1' });
    accountA = a.body.account.id;
    verifyTokenA = a.body.verify_token;
    const b = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(admin)).send({
      label: 'T0079 B', environment: 'TEST', waba_id: wabaB, app_id: '9876543210', access_token: TOKEN_B, app_secret: APP_SECRET_B, test_recipients: RECIPIENT
    });
    expect(b.status).toBe(201);
    accountB = b.body.account.id;

    const dupe = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(admin)).send({
      label: 'T0079 A2', environment: 'TEST', waba_id: wabaA, app_id: '1234567890', access_token: TOKEN_A, app_secret: APP_SECRET_A
    });
    expect(dupe.status).toBe(409);

    const list = await request(app).get('/api/whatsapp/cloud/accounts').set(auth(ops));
    expect(list.status).toBe(200);
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain(TOKEN_A);
    expect(raw).not.toContain(APP_SECRET_A);
    expect(raw).not.toContain(verifyTokenA);
    expect(raw).not.toContain(RECIPIENT);
    expect(list.body.locks).toMatchObject({ send_enabled: false, environments: ['TEST'], evolution_enabled: false, secrets_key_configured: true });
    const row = (await pool.query('SELECT access_token_enc, app_secret_enc FROM whatsapp_cloud_accounts WHERE id = $1', [accountA])).rows[0];
    expect(row.access_token_enc).not.toContain(TOKEN_A);
    expect(row.app_secret_enc).not.toContain(APP_SECRET_A);
  });

  it('ambiente e IDs da Meta não mudam numa conta existente', async () => {
    const env = await request(app).patch(`/api/whatsapp/cloud/accounts/${accountA}`).set(auth(admin)).send({ environment: 'PRODUCTION' });
    expect(env.status).toBe(400);
    const ids = await request(app).patch(`/api/whatsapp/cloud/accounts/${accountA}`).set(auth(admin)).send({ waba_id: '999999999' });
    expect(ids.status).toBe(400);
  });

  it('conferir: permissões, WABA, números e assinatura do webhook', async () => {
    scopes = ['whatsapp_business_messaging'];
    const bad = await request(app).post(`/api/whatsapp/cloud/accounts/${accountA}/check`).set(auth(admin)).send({});
    expect(bad.body.ok).toBe(false);
    expect(bad.body.missing_scopes).toEqual(['whatsapp_business_management']);
    scopes = ['whatsapp_business_messaging', 'whatsapp_business_management'];
    const ok = await request(app).post(`/api/whatsapp/cloud/accounts/${accountA}/check`).set(auth(admin)).send({ subscribe: true });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.subscribed).toBe(true);
    expect(ok.body.phone_numbers[0]).toMatchObject({ phone_number_id: pnA, verified_name: 'Trattoria Teste' });
    expect(ok.body.account.status).toBe('VERIFIED');
    // cada conta usa o próprio token
    expect(calls.every(c => c.auth === `Bearer ${TOKEN_A}`)).toBe(true);
    const okB = await request(app).post(`/api/whatsapp/cloud/accounts/${accountB}/check`).set(auth(admin)).send({});
    expect(okB.body.ok).toBe(true);
  });

  it('número oficial: só da própria WABA, nasce conectado com o atendente desligado', async () => {
    const foreign = await request(app).post('/api/whatsapp/cloud/numbers').set(auth(admin)).send({ cloud_account_id: accountA, phone_number_id: pnB, label: 'T0079 errado' });
    expect(foreign.status).toBe(400);
    const r = await request(app).post('/api/whatsapp/cloud/numbers').set(auth(admin)).send({ cloud_account_id: accountA, phone_number_id: pnA, label: 'T0079 Trattoria oficial' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ provider: 'META_CLOUD', status: 'CONNECTED', bot_enabled: false, phone_number_id: pnA, brand_id: brandId });
    numberA = r.body.id;
    const again = await request(app).post('/api/whatsapp/cloud/numbers').set(auth(admin)).send({ cloud_account_id: accountA, phone_number_id: pnA, label: 'T0079 repetido' });
    expect(again.status).toBe(409);
    const rb = await request(app).post('/api/whatsapp/cloud/numbers').set(auth(admin)).send({ cloud_account_id: accountB, phone_number_id: pnB, label: 'T0079 Outra' });
    numberB = rb.body.id;
    const swap = await request(app).post(`/api/whatsapp/numbers/${numberA}/swap`).set(auth(admin));
    expect(swap.status).toBe(409);
    const conf = await request(app).post(`/api/whatsapp/numbers/${numberA}/connect`).set(auth(admin));
    expect(conf.status).toBe(200);
    expect(conf.body.number.messaging_limit).toBe('TIER_250');
  });

  // ---------- webhook ----------

  it('verificação do webhook: token certo devolve o challenge; errado é recusado', async () => {
    const wrong = await request(app).get(`/api/whatsapp/cloud/webhook/${accountA}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'errado', 'hub.challenge': '123' });
    expect(wrong.status).toBe(403);
    const other = await request(app).get(`/api/whatsapp/cloud/webhook/${accountB}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyTokenA, 'hub.challenge': '123' });
    expect(other.status).toBe(403);
    const ok = await request(app).get(`/api/whatsapp/cloud/webhook/${accountA}`).query({ 'hub.mode': 'subscribe', 'hub.verify_token': verifyTokenA, 'hub.challenge': '98765' });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('98765');
    const row = (await pool.query('SELECT webhook_verified_at FROM whatsapp_cloud_accounts WHERE id = $1', [accountA])).rows[0];
    expect(row.webhook_verified_at).toBeTruthy();
    expect(maskPath(`/api/whatsapp/cloud/webhook/${accountA}?hub.mode=subscribe&hub.verify_token=${verifyTokenA}&hub.challenge=1`)).not.toContain(verifyTokenA);
  });

  it('sem assinatura, assinatura errada ou de outra conta: 401 e nada gravado', async () => {
    const p = messagePayload(wabaA, pnA, RECIPIENT, `wamid.SIG-${tag}`, 'oi');
    expect((await post(accountA, p, null)).status).toBe(401);
    expect((await post(accountA, p, 'segredo-errado-0079')).status).toBe(401);
    expect((await post(accountA, p, APP_SECRET_B)).status).toBe(401);
    expect(await convOf(numberA, RECIPIENT)).toBeUndefined();
  });

  it('mensagem válida cria a conversa; a mesma mensagem 3 vezes vira 1 registro e aciona o atendente 1 vez', async () => {
    inbound.length = 0;
    const p = messagePayload(wabaA, pnA, RECIPIENT, `wamid.IN-${tag}`, 'Oi, quero o livro', 'Ricardo');
    for (let i = 0; i < 3; i++) expect((await post(accountA, p, APP_SECRET_A)).status).toBe(200);
    await new Promise(r => setTimeout(r, 50));
    const conv = await convOf(numberA, RECIPIENT);
    expect(conv).toMatchObject({ contact_phone: RECIPIENT, contact_name: 'Ricardo', unread_count: 1 });
    const msgs = (await pool.query('SELECT * FROM whatsapp_messages WHERE conversation_id = $1', [conv.id])).rows;
    expect(msgs).toHaveLength(1);
    expect(inbound).toEqual([{ numberId: numberA, n: 1 }]);
  });

  it('mensagem de número de outra conta é ignorada', async () => {
    const p = messagePayload(wabaA, pnB, STRANGER, `wamid.X-${tag}`, 'oi');
    expect((await post(accountA, p, APP_SECRET_A)).status).toBe(200);
    expect(await convOf(numberB, STRANGER)).toBeUndefined();
    expect(await convOf(numberA, STRANGER)).toBeUndefined();
  });

  it('um app com duas contas: o evento vai para a conta da WABA certa; app diferente é ignorado', async () => {
    const c = await request(app).post('/api/whatsapp/cloud/accounts').set(auth(admin)).send({
      label: 'T0079 C', brand_id: brandId, environment: 'TEST', waba_id: wabaC, app_id: '1234567890', access_token: TOKEN_A, app_secret: APP_SECRET_A
    });
    expect(c.status).toBe(201);
    accountC = c.body.account.id;
    const n = await pool.query(
      `INSERT INTO whatsapp_numbers (label, brand_id, instance_name, webhook_secret_hash, provider, cloud_account_id, phone_number_id, status)
       VALUES ('T0079 C', $1, $2, 'x', 'META_CLOUD', $3, $4, 'CONNECTED') RETURNING id`,
      [brandId, `cloud-t79-${tag.toLowerCase()}`, accountC, pnC]
    );
    numberC = n.rows[0].id;
    // chega no endereço da conta A (mesmo app), assinado com a mesma chave secreta
    expect((await post(accountA, messagePayload(wabaC, pnC, RECIPIENT, `wamid.C-${tag}`, 'oi C'), APP_SECRET_A)).status).toBe(200);
    expect(await convOf(numberC, RECIPIENT)).toBeTruthy();
    expect(await convOf(numberA, RECIPIENT).then(cv => cv?.last_message_preview)).not.toBe('oi C');
    // conta B é de outro app: evento com a WABA dela no endereço da A é ignorado
    expect((await post(accountA, messagePayload(wabaB, pnB, STRANGER, `wamid.B-${tag}`, 'oi B'), APP_SECRET_A)).status).toBe(200);
    expect(await convOf(numberB, STRANGER)).toBeUndefined();
  });

  it('CPF chega mascarado e "parar" é respeitado', async () => {
    await post(accountA, messagePayload(wabaA, pnA, STRANGER, `wamid.CPF-${tag}`, 'meu cpf 529.982.247-25'), APP_SECRET_A);
    const conv = await convOf(numberA, STRANGER);
    const body = (await pool.query('SELECT body FROM whatsapp_messages WHERE conversation_id = $1', [conv.id])).rows[0].body;
    expect(body).not.toContain('529.982.247-25');
    await post(accountA, messagePayload(wabaA, pnA, STRANGER, `wamid.STOP-${tag}`, 'Parar'), APP_SECRET_A);
    expect((await convOf(numberA, STRANGER)).mode).toBe('OPTED_OUT');
  });

  // ---------- travas e envio ----------

  it('com o envio desligado: a resposta fica BLOCKED e nada sai para a Meta', async () => {
    const conv = await convOf(numberA, RECIPIENT);
    const r = await request(app).post(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops)).send({ text: 'Olá! Já te respondo.' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/homologação/);
    expect(calls.filter(c => c.url.endsWith('/messages'))).toHaveLength(0);
    const m = (await pool.query(`SELECT * FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'OUT' ORDER BY created_at DESC LIMIT 1`, [conv.id])).rows[0];
    expect(m).toMatchObject({ delivery_status: 'BLOCKED', error_code: 'SEND_DISABLED', send_status: 'FAILED' });
  });

  it('envio liberado: só para destinatário de teste; envia pelo phone_number_id com o token da conta', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    const conv = await convOf(numberA, RECIPIENT);
    const r = await request(app).post(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops)).send({ text: 'Olá Ricardo!' });
    expect(r.status).toBe(200);
    const sent = calls.filter(c => c.url.endsWith(`/${pnA}/messages`));
    expect(sent).toHaveLength(1);
    expect(sent[0].auth).toBe(`Bearer ${TOKEN_A}`);
    expect(sent[0].body).toMatchObject({ messaging_product: 'whatsapp', to: RECIPIENT, type: 'text', text: { body: 'Olá Ricardo!' } });
    const m = (await pool.query(`SELECT * FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'OUT' ORDER BY created_at DESC LIMIT 1`, [conv.id])).rows[0];
    expect(m.delivery_status).toBe('SENT');
    expect(m.provider_message_id).toMatch(/^wamid\./);

    // cliente fora da lista de teste
    await post(accountA, messagePayload(wabaA, pnA, '5511933332222', `wamid.STR-${tag}`, 'oi'), APP_SECRET_A);
    const c2 = await convOf(numberA, '5511933332222');
    const blocked = await request(app).post(`/api/whatsapp/conversations/${c2.id}/messages`).set(auth(ops)).send({ text: 'oi' });
    expect(blocked.status).toBe(409);
    expect((await pool.query(`SELECT error_code FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'OUT'`, [c2.id])).rows[0].error_code).toBe('RECIPIENT_NOT_ALLOWED');
  });

  it('status da Meta atualizam a mensagem sem voltar atrás; falha marca a conversa para pessoa', async () => {
    const conv = await convOf(numberA, RECIPIENT);
    const m = (await pool.query(`SELECT provider_message_id FROM whatsapp_messages WHERE conversation_id = $1 AND delivery_status = 'SENT' LIMIT 1`, [conv.id])).rows[0];
    const st = (status: string, errors?: any[]) => ({
      object: 'whatsapp_business_account',
      entry: [{ id: wabaA, changes: [{ field: 'messages', value: { metadata: { phone_number_id: pnA }, statuses: [{ id: m.provider_message_id, status, recipient_id: RECIPIENT, ...(errors ? { errors } : {}) }] } }] }]
    });
    await post(accountA, st('read'), APP_SECRET_A);
    await post(accountA, st('delivered'), APP_SECRET_A); // chega atrasado: não rebaixa
    let row = (await pool.query('SELECT delivery_status FROM whatsapp_messages WHERE provider_message_id = $1', [m.provider_message_id])).rows[0];
    expect(row.delivery_status).toBe('READ');
    await post(accountA, st('failed', [{ code: 131026, title: 'undeliverable' }]), APP_SECRET_A);
    row = (await pool.query('SELECT delivery_status, error_code, send_status FROM whatsapp_messages WHERE provider_message_id = $1', [m.provider_message_id])).rows[0];
    expect(row).toMatchObject({ delivery_status: 'FAILED', error_code: '131026', send_status: 'FAILED' });
    expect((await convOf(numberA, RECIPIENT)).needs_human).toBe(true);
  });

  it('janela de 24h fechada: resposta manual recusada antes de chamar a Meta', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    const conv = await convOf(numberA, RECIPIENT);
    await pool.query(`UPDATE whatsapp_messages SET created_at = NOW() - INTERVAL '25 hours' WHERE conversation_id = $1 AND direction = 'IN'`, [conv.id]);
    const r = await request(app).post(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops)).send({ text: 'Oi de novo' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/24 horas/);
    expect(calls.filter(c => c.url.endsWith('/messages'))).toHaveLength(0);
    const thread = await request(app).get(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops));
    expect(thread.body.conversation.window_open).toBe(false);
    await pool.query(`UPDATE whatsapp_messages SET created_at = NOW() WHERE conversation_id = $1 AND direction = 'IN'`, [conv.id]);
  });

  it('ambiente fora da lista do servidor fica bloqueado', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    process.env.WHATSAPP_CLOUD_ENVIRONMENTS = 'PRODUCTION';
    const conv = await convOf(numberA, RECIPIENT);
    const r = await request(app).post(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops)).send({ text: 'oi' });
    expect(r.status).toBe(409);
    expect(calls.filter(c => c.url.endsWith('/messages'))).toHaveLength(0);
  });

  it('erros da Meta: limite tenta de novo; token inválido desconecta; bloqueio por política para o número', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    const nRow = (await pool.query('SELECT * FROM whatsapp_numbers WHERE id = $1', [numberA])).rows[0];
    const p = await providerForNumber(pool, nRow);
    expect(p).toBeInstanceOf(MetaCloudProvider);
    failNext = { code: 130429, times: 2 };
    const ok = await p!.sendText('', `${RECIPIENT}@s.whatsapp.net`, 'teste de limite');
    expect(ok.id).toMatch(/^wamid\./);
    expect(calls.filter(c => c.url.endsWith('/messages'))).toHaveLength(3);

    failNext = { code: 368, times: 1 };
    await expect(p!.sendText('', RECIPIENT, 'x')).rejects.toBeInstanceOf(CloudApiError);
    let n = (await pool.query('SELECT status, bot_enabled FROM whatsapp_numbers WHERE id = $1', [numberA])).rows[0];
    expect(n).toMatchObject({ status: 'BANNED', bot_enabled: false });

    failNext = { code: 190, times: 1 };
    await expect(p!.sendText('', RECIPIENT, 'x')).rejects.toBeInstanceOf(CloudApiError);
    const acc = (await pool.query('SELECT status FROM whatsapp_cloud_accounts WHERE id = $1', [accountA])).rows[0];
    expect(acc.status).toBe('INVALID');

    // volta ao normal para os próximos testes
    await pool.query(`UPDATE whatsapp_cloud_accounts SET status = 'VERIFIED', last_error = NULL WHERE id = $1`, [accountA]);
    await pool.query(`UPDATE whatsapp_numbers SET status = 'CONNECTED', status_reason = NULL WHERE id = $1`, [numberA]);
    n = (await pool.query('SELECT status FROM whatsapp_numbers WHERE id = $1', [numberA])).rows[0];
    expect(n.status).toBe('CONNECTED');
  });

  // ---------- atendente e teste x produção ----------

  it('envio bloqueado: o atendente não gera cobrança e a resposta fica registrada como bloqueada', async () => {
    await pool.query('UPDATE whatsapp_numbers SET bot_enabled = TRUE WHERE id = $1', [numberA]);
    setAttendantAiForTests(fakeAi as any);
    const conv = await convOf(numberA, RECIPIENT);
    await pool.query(`UPDATE whatsapp_conversations SET mode = 'BOT', needs_human = FALSE WHERE id = $1`, [conv.id]);
    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment');
    spies.push(pix);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Ricardo Teste', email: `ricardo.0079.${tag}@example.com` }) }] },
      { content: 'Uma pessoa da equipe vai continuar.', tool_calls: [] }
    ];
    const r = await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    expect(r.replied).toBe(true);
    expect(pix).not.toHaveBeenCalled();
    const orders = (await pool.query('SELECT COUNT(*)::int AS n FROM orders WHERE whatsapp_conversation_id = $1', [conv.id])).rows[0].n;
    expect(orders).toBe(0);
    const last = (await pool.query(`SELECT delivery_status FROM whatsapp_messages WHERE conversation_id = $1 AND author = 'BOT' ORDER BY created_at DESC LIMIT 1`, [conv.id])).rows[0];
    expect(last.delivery_status).toBe('BLOCKED');
    expect(calls.filter(c => c.url.endsWith('/messages'))).toHaveLength(0);
  });

  it('número de TESTE: pedido feito na conversa é marcado como teste (fora das vendas)', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    setAttendantAiForTests(fakeAi as any);
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0079'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
        providerPaymentId: `pay_0079_${tag}`, pixCopyPaste: '00020101PIX0079', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'UVI='
      } as any)
    );
    const conv = await convOf(numberA, RECIPIENT);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Ricardo Teste', email: `ricardo.0079.${tag}@example.com` }) }] },
      { content: 'Aqui está o seu Pix.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const order = (await pool.query('SELECT data_provenance FROM orders WHERE whatsapp_conversation_id = $1', [conv.id])).rows[0];
    expect(order.data_provenance).toBe('STAGING_SANDBOX_QA');
    // imagem do Pix sobe como mídia e vai pelo ID
    expect(calls.some(c => c.url.endsWith(`/${pnA}/media`))).toBe(true);
    expect(calls.some(c => c.body?.type === 'image' && c.body?.image?.id === 'MEDIA-1')).toBe(true);
  });

  it('página pública nunca mostra número de TESTE, mesmo com tudo ligado', async () => {
    process.env.WHATSAPP_CLOUD_SEND_ENABLED = 'true';
    process.env.WHATSAPP_CLOUD_ENVIRONMENTS = 'TEST,PRODUCTION';
    await pool.query('UPDATE whatsapp_numbers SET bot_enabled = TRUE WHERE id = $1', [numberA]);
    expect(await whatsappNumberForOffer(pool, offerId)).toBeNull();
    const offer = await request(app).get(`/api/public/offers/${offerCode}`);
    expect(offer.body.whatsapp).toBeNull();
    await pool.query('UPDATE whatsapp_numbers SET bot_enabled = FALSE WHERE id = $1', [numberA]);
  });

  it('desativar a conta para o atendente nos números dela', async () => {
    const r = await request(app).patch(`/api/whatsapp/cloud/accounts/${accountB}`).set(auth(admin)).send({ active: false });
    expect(r.body.account.status).toBe('DISABLED');
    const n = (await pool.query('SELECT status, bot_enabled FROM whatsapp_numbers WHERE id = $1', [numberB])).rows[0];
    expect(n).toMatchObject({ status: 'DISCONNECTED', bot_enabled: false });
    expect(await providerForNumber(pool, { id: numberB, provider: 'META_CLOUD', cloud_account_id: accountB, phone_number_id: pnB })).toBeNull();
  });

  // ---------- unidades ----------

  it('regras puras: erros, janela, variantes do celular e Evolution desligada', () => {
    expect(describeCloudError(131047).outsideWindow).toBe(true);
    expect(describeCloudError(130429).retry).toBe(true);
    expect(describeCloudError(190).effect).toBe('TOKEN_INVALID');
    expect(describeCloudError(368).effect).toBe('NUMBER_BANNED');
    const now = new Date();
    expect(windowOpenAt(new Date(now.getTime() - 23 * 3600e3), now)).toBe(true);
    expect(windowOpenAt(new Date(now.getTime() - 24 * 3600e3), now)).toBe(false);
    expect(windowOpenAt(null, now)).toBe(false);
    expect(phoneVariants('5531988887777')).toContain('553188887777');
    expect(phoneVariants('553188887777')).toContain('5531988887777');
    delete process.env.WHATSAPP_EVOLUTION_ENABLED;
    expect(evolutionEnabled()).toBe(false);
    const blocked = new MetaCloudProvider({ accountId: 'x', environment: 'TEST', phoneNumberId: '1', accessToken: 't', graphVersion: 'v26.0', testRecipients: [] }, graph);
    expect(blocked.blockReason(RECIPIENT)).toBe('RECIPIENT_NOT_ALLOWED');
    expect(new SendBlockedError('x', 'SEND_DISABLED').status).toBe(409);
  });
});
