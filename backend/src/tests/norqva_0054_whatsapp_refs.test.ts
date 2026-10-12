// NORQVA-0054 (contrato NORQVA-0053 item 3): página → WhatsApp → pagamento, com código de origem.
// IA, WhatsApp e Asaas simulados; nada fala com a Meta.
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
import { setWhatsAppProviderForTests, WhatsAppProvider, ProviderError } from '../services/whatsapp/provider';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiReply } from '../services/whatsapp/attendant';
import { REF_CODE_RE, newRefCode } from '../services/whatsapp/whatsappRefs';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0054';

describe('NORQVA-0054 — código de origem (regra pura)', () => {
  it('o código tem 6 letras/números sem caracteres que confundem e é lido da mensagem', () => {
    for (let i = 0; i < 50; i++) expect(newRefCode()).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect('Olá! Quero o Kit Cozinha Italiana. (código K7F3A2)'.match(REF_CODE_RE)?.[1]).toBe('K7F3A2');
    expect('codigo: k7f3a2 obrigado'.match(REF_CODE_RE)?.[1]).toBe('k7f3a2');
    expect('quero o kit'.match(REF_CODE_RE)).toBeNull();
  });
});

describe.sequential('NORQVA-0054 — página → WhatsApp → pagamento', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerCode = `OFF-W${tag}`;
  let numberId = '';
  let secretUrl = '';
  const spies: any[] = [];
  const provider = {
    createInstance: vi.fn(async (_n: string, url: string) => { secretUrl = url; return { base64: 'QR', state: 'connecting' as const }; }),
    connect: vi.fn(), info: vi.fn(async () => { throw new ProviderError('nao existe', 404); }), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText: vi.fn(async () => ({ id: `T-${crypto.randomUUID()}` })),
    sendImage: vi.fn(async () => ({ id: `I-${crypto.randomUUID()}` }))
  } as unknown as WhatsAppProvider;
  let script: AiReply[] = [];
  const fakeAi = async () => script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0054@norqva.test', 'Admin 0054', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0054')`, [brandId, `B54${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES ($1, $2, 'Kit 0054', 'Receitas', 'Dois livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-W${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Kit Cozinha Italiana', $3, 34.80, 27.90, 'ATIVA', 'Trattoria + Dolci', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, offerCode, productId]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0054 Atendente', brand_id: brandId });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511922223333@s.whatsapp.net' } });
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const orders = (await pool.query(`SELECT o.id FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id WHERE c.number_id = $1`, [numberId])).rows.map((r: any) => r.id);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_refs WHERE offer_id = $1', [offerId]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0054.${tag}@example.com`])).rows.map((r: any) => r.id);
    await q('DELETE FROM payment_provider_customers WHERE customer_id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM offers WHERE id = $1', [offerId]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
    await q('DELETE FROM brands WHERE id = $1', [brandId]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    setAttendantAiForTests(fakeAi as any);
    script = [];
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0054'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null)
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  it('sem atendente ligado, a página não oferece WhatsApp e o código é recusado', async () => {
    const offer = await request(app).get(`/api/public/offers/${offerCode}`);
    expect(offer.status).toBe(200);
    expect(offer.body.whatsapp).toBeNull();
    const ref = await request(app).post('/api/public/whatsapp/ref').send({ offer_human_id: offerCode });
    expect(ref.status).toBe(409);
  });

  it('com atendente ligado: link com mensagem e código; a conversa e o pedido herdam a origem do anúncio', async () => {
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
    const offer = await request(app).get(`/api/public/offers/${offerCode}`);
    expect(offer.body.whatsapp).toEqual({ available: true });

    const ref = await request(app)
      .post('/api/public/whatsapp/ref')
      .set('User-Agent', 'Mozilla/5.0 (iPhone) 0054')
      .set('X-Forwarded-For', '200.150.10.20')
      .send({
        offer_human_id: offerCode,
        visitor_id: `v-${tag}`,
        fbclid: 'IwAR0054',
        fbc: 'fb.1.1760000000000.IwAR0054',
        fbp: 'fb.1.1760000000000.123456',
        utm_source: 'meta',
        utm_medium: 'paid_social',
        utm_campaign: `CMP-${tag}`,
        utm_content: `TR-AD-${tag}`,
        attribution_metadata: { ad_id: '120000000000054' },
        event_source_url: `https://norqva-intelligence-frontend.vercel.app/kit/${offerCode}?utm_campaign=CMP-${tag}`
      });
    expect(ref.status).toBe(201);
    expect(ref.body.url).toMatch(/^https:\/\/wa\.me\/\d{12,13}\?text=/);
    expect(decodeURIComponent(ref.body.url)).toContain(`(código ${ref.body.code})`);
    expect(decodeURIComponent(ref.body.url)).not.toMatch(/R\$|27,90/); // a mensagem pronta não fala de preço

    // a pessoa manda a mensagem pronta
    const jid = '5521966665555@s.whatsapp.net';
    const w = await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Carla', message: { conversation: ref.body.text } }
    });
    expect(w.status).toBe(200);
    const conv = (await pool.query('SELECT id, ref_id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0];
    expect(conv.ref_id).toBeTruthy();

    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
      providerPaymentId: 'pay_0054_pix', pixCopyPaste: '00020101PIX0054', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'QR'
    } as any);
    spies.push(pix);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Carla Dias', email: `carla.0054.${tag}@example.com` }) }] },
      { content: 'Aqui está o seu Pix.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const order = (await pool.query(
      `SELECT utm_source, utm_medium, utm_campaign, utm_content, fbclid, fbc, fbp, client_ip_address, client_user_agent, event_source_url, attribution_metadata
       FROM orders WHERE whatsapp_conversation_id = $1`,
      [conv.id]
    )).rows[0];
    expect(order).toMatchObject({
      utm_source: 'meta',
      utm_medium: 'paid_social',
      utm_campaign: `CMP-${tag}`,
      utm_content: `TR-AD-${tag}`,
      fbclid: 'IwAR0054',
      fbc: 'fb.1.1760000000000.IwAR0054',
      fbp: 'fb.1.1760000000000.123456',
      client_ip_address: '200.150.10.20',
      client_user_agent: 'Mozilla/5.0 (iPhone) 0054'
    });
    expect(order.event_source_url).toContain(`/kit/${offerCode}`);
    expect(order.attribution_metadata.whatsapp_ref).toBe(ref.body.code);
  });

  it('sem código, o pedido fica com origem WhatsApp e sem o endereço do servidor', async () => {
    const jid = '5521977778888@s.whatsapp.net';
    await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Beto', message: { conversation: 'Oi, quero o kit' } }
    });
    const conv = (await pool.query('SELECT id, ref_id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0];
    expect(conv.ref_id).toBeNull();
    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
      providerPaymentId: 'pay_0054_pix2', pixCopyPaste: '00020101PIX0054B', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'QR'
    } as any);
    spies.push(pix);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Beto Reis', email: `beto.0054.${tag}@example.com` }) }] },
      { content: 'Aqui está.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const order = (await pool.query('SELECT utm_source, client_ip_address, client_user_agent FROM orders WHERE whatsapp_conversation_id = $1', [conv.id])).rows[0];
    expect(order.utm_source).toBe('whatsapp');
    expect(order.client_ip_address || null).toBeNull();
    expect(order.client_user_agent || null).toBeNull();
  });

  it('código de outro número ou inexistente não liga a conversa', async () => {
    const jid = '5521988889999@s.whatsapp.net';
    await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Dani', message: { conversation: 'Quero o kit (código ZZZZ22)' } }
    });
    const conv = (await pool.query('SELECT ref_id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0];
    expect(conv.ref_id).toBeNull();
  });
});
