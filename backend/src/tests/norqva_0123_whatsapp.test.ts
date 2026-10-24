// NORQVA-0123: anúncio clique-para-WhatsApp → origem do pedido; fotos de amostra; um lembrete de Pix.
// IA, WhatsApp, Asaas e imagens simulados; nada fala com a Meta.
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
import { adReferralFromEvolution, adReferralFromCloud } from '../services/whatsapp/whatsappRefs';
import { sampleKeyFor, setSampleFetchForTests, MAX_SAMPLE_IMAGES_PER_CONVERSATION } from '../services/whatsapp/samples';
import { runWhatsAppPixReminders, pixReminderText, withinReminderHours } from '../services/whatsapp/pixReminder';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0123';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const AD_ID = '120250149896850097';

describe('NORQVA-0123 — regras puras', () => {
  it('lê o anúncio da mensagem da Evolution e da Meta; ignora o que não é anúncio', () => {
    const evo = { message: { extendedTextMessage: { text: 'Oi', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: AD_ID, ctwaClid: 'CLID1', sourceUrl: 'https://fb.me/x', title: 'texto do anúncio' } } } } };
    expect(adReferralFromEvolution(evo)).toEqual({ adId: AD_ID, ctwaClid: 'CLID1', sourceUrl: 'https://fb.me/x' });
    expect(adReferralFromEvolution({ contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: AD_ID } }, message: { conversation: 'Oi' } })?.adId).toBe(AD_ID);
    expect(adReferralFromEvolution({ message: { conversation: 'Oi' } })).toBeNull();
    expect(adReferralFromEvolution({ message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceType: 'post', sourceId: AD_ID } } } } })).toBeNull();
    expect(adReferralFromEvolution({ message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: 'abc; drop' } } } } })).toBeNull();
    expect(adReferralFromCloud({ referral: { source_type: 'ad', source_id: AD_ID, ctwa_clid: 'C2', source_url: 'javascript:x' } })).toEqual({ adId: AD_ID, ctwaClid: 'C2', sourceUrl: null });
  });

  it('escolhe as fotos certas para cada produto', () => {
    expect(sampleKeyFor({ name: 'Kit Trattoria Completo', product_name: '5 livros' })).toBe('kit5');
    expect(sampleKeyFor({ name: 'Kit Cozinha Italiana' })).toBe('kit2');
    expect(sampleKeyFor({ name: 'COMPLETE A COLEÇÃO — +4 LIVROS' })).toBe('kit4');
    expect(sampleKeyFor({ name: 'KIT TRATTORIA COMPLETO — 5 LIVROS' })).toBe('kit5');
    expect(sampleKeyFor({ name: 'Trattoria em Casa' })).toBe('trattoria');
    expect(sampleKeyFor({ name: 'Dolci della Nonna' })).toBe('dolci');
    expect(sampleKeyFor({ name: 'Volume III', collection_key: 'paes' })).toBe('paes');
    expect(sampleKeyFor({ name: 'Risotos & Polentas' })).toBe('risotos');
    expect(sampleKeyFor({ name: 'Desafio Seca Barriga' })).toBeNull();
  });

  it('texto do lembrete e horário de Brasília', () => {
    expect(pixReminderText('carla dias', 29.9, 'Kit Trattoria Completo')).toBe('Oi, Carla! O seu Pix de R$ 29,90 (Kit Trattoria Completo) ainda está disponível. Se quiser, é só usar o código que mandei acima. Qualquer dúvida, me chame aqui. 😊');
    expect(withinReminderHours(new Date('2026-10-24T15:00:00Z'))).toBe(true); // 12h em Brasília
    expect(withinReminderHours(new Date('2026-10-24T10:30:00Z'))).toBe(false); // 07h30
    expect(withinReminderHours(new Date('2026-10-25T01:30:00Z'))).toBe(false); // 22h30
  });
});

describe.sequential('NORQVA-0123 — anúncio, amostras e lembrete', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerCode = `OFF-X${tag}`;
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
  const NOON = new Date('2026-10-24T15:00:00Z');

  const inbound = (jid: string, message: any, extra: any = {}) =>
    request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Carla', message, ...extra }
    });
  const convOf = async (jid: string) => (await pool.query('SELECT id, ref_id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0];
  const mockPix = (id: string) => {
    const s = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
      providerPaymentId: id, pixCopyPaste: `00020101${id}`, expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'QR'
    } as any);
    spies.push(s);
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0123@norqva.test', 'Admin 0123', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0123')`, [brandId, `B23${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES ($1, $2, 'Coleção 0123', 'Receitas', 'Cinco livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-X${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Kit Trattoria Completo', $3, 49.90, 29.90, 'ATIVA', '5 livros digitais', false, 'COMMERCIAL_PRODUCTION')`,
      [offerId, offerCode, productId]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0123 Atendente', brand_id: brandId });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511933334444@s.whatsapp.net' } });
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    setSampleFetchForTests(null);
    delete process.env.WHATSAPP_PIX_REMINDER_ENABLED;
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const orders = (await pool.query(`SELECT o.id FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id WHERE c.number_id = $1`, [numberId])).rows.map((r: any) => r.id);
    await q('DELETE FROM whatsapp_payment_reminders WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_refs WHERE number_id = $1', [numberId]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0123.${tag}@example.com`])).rows.map((r: any) => r.id);
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
    setSampleFetchForTests(async () => ({ ok: true, contentType: 'image/jpeg', bytes: JPEG }));
    script = [];
    (provider.sendText as any).mockClear();
    (provider.sendImage as any).mockClear();
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0123'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null)
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  it('A: conversa vinda do anúncio liga a origem e o pedido herda o ad_id', async () => {
    const jid = '5531911112222@s.whatsapp.net';
    const w = await inbound(jid, { extendedTextMessage: { text: 'Olá! Pode me dar mais informações?', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: AD_ID, ctwaClid: 'CLID-0123' } } } });
    expect(w.status).toBe(200);
    const conv = await convOf(jid);
    expect(conv.ref_id).toBeTruthy();
    const ref = (await pool.query('SELECT utm_source, utm_medium, utm_content, attribution_metadata FROM whatsapp_refs WHERE id = $1', [conv.ref_id])).rows[0];
    expect(ref).toMatchObject({ utm_source: 'facebook', utm_medium: 'whatsapp_ad', utm_content: AD_ID });
    expect(ref.attribution_metadata).toMatchObject({ ad_id: AD_ID, ctwa_clid: 'CLID-0123', source: 'ctwa' });

    // segunda mensagem do mesmo anúncio não cria outra origem
    await inbound(jid, { extendedTextMessage: { text: 'Oi de novo', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: AD_ID } } } });
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_refs WHERE conversation_id = $1', [conv.id])).rows[0].n).toBe(1);

    mockPix('pay_0123_a');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Carla Dias', email: `carla.0123.${tag}@example.com` }) }] },
      { content: 'Aqui está o seu Pix.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const order = (await pool.query('SELECT utm_source, utm_medium, utm_content, attribution_metadata FROM orders WHERE whatsapp_conversation_id = $1', [conv.id])).rows[0];
    expect(order).toMatchObject({ utm_source: 'facebook', utm_medium: 'whatsapp_ad', utm_content: AD_ID });
    expect(order.attribution_metadata.ad_id).toBe(AD_ID);
  });

  it('A: código da página tem preferência sobre o anúncio', async () => {
    const jid = '5531933334444@s.whatsapp.net';
    const ref = await request(app).post('/api/public/whatsapp/ref').send({ offer_human_id: offerCode, utm_source: 'meta' });
    expect(ref.status).toBe(201);
    await inbound(jid, { extendedTextMessage: { text: ref.body.text, contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: AD_ID } } } });
    const conv = await convOf(jid);
    const row = (await pool.query('SELECT code, utm_medium FROM whatsapp_refs WHERE id = $1', [conv.ref_id])).rows[0];
    expect(row.code).toBe(ref.body.code);
  });

  it('C: manda até 4 fotos de amostra por conversa, em JPEG', async () => {
    const jid = '5531955556666@s.whatsapp.net';
    await inbound(jid, { conversation: 'Quero ver como é o livro' });
    const conv = await convOf(jid);
    script = [
      { content: null, tool_calls: [{ id: 's1', name: 'send_samples', arguments: JSON.stringify({ offer_code: offerCode }) }] },
      { content: 'Vou te mandar algumas fotos.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect((provider.sendImage as any).mock.calls.length).toBe(MAX_SAMPLE_IMAGES_PER_CONVERSATION);
    const call = (provider.sendImage as any).mock.calls[0];
    expect(call[3]).toMatch(/^Amostra · /);
    expect(call[4]).toEqual({ mimetype: 'image/jpeg' });

    (provider.sendImage as any).mockClear();
    script = [
      { content: null, tool_calls: [{ id: 's2', name: 'send_samples', arguments: JSON.stringify({ offer_code: offerCode }) }] },
      { content: 'As fotos já foram enviadas acima.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect((provider.sendImage as any).mock.calls.length).toBe(0);
  });

  it('C: foto que não é imagem (página do site) não é enviada', async () => {
    setSampleFetchForTests(async () => ({ ok: true, contentType: 'text/html', bytes: Buffer.from('<!doctype html>') }));
    const jid = '5531977778888@s.whatsapp.net';
    await inbound(jid, { conversation: 'tem foto?' });
    const conv = await convOf(jid);
    script = [
      { content: null, tool_calls: [{ id: 's3', name: 'send_samples', arguments: JSON.stringify({ offer_code: offerCode }) }] },
      { content: 'Te conto em texto.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect((provider.sendImage as any).mock.calls.length).toBe(0);
  });

  it('B: um único lembrete de Pix, só com a chave ligada, de dia e com a conversa parada', async () => {
    const jid = '5531999990000@s.whatsapp.net';
    await inbound(jid, { conversation: 'quero a coleção' });
    const conv = await convOf(jid);
    mockPix('pay_0123_b');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Bruna Lima', email: `bruna.0123.${tag}@example.com` }) }] },
      { content: 'Aqui está o seu Pix.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const pay = (await pool.query(`SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.whatsapp_conversation_id = $1`, [conv.id])).rows[0];
    expect(pay).toBeTruthy();
    // Pix de 40 minutos atrás, conversa parada há 40 minutos
    const ago = new Date(NOON.getTime() - 40 * 60 * 1000).toISOString();
    await pool.query('UPDATE payments SET created_at = $2 WHERE id = $1', [pay.id, ago]);
    await pool.query('UPDATE whatsapp_messages SET created_at = $2 WHERE conversation_id = $1', [conv.id, ago]);
    (provider.sendText as any).mockClear();
    const reconcile = vi.fn(async () => null);

    delete process.env.WHATSAPP_PIX_REMINDER_ENABLED;
    expect((await runWhatsAppPixReminders(pool, { now: NOON, reconcile, provider })).sent).toBe(0);

    process.env.WHATSAPP_PIX_REMINDER_ENABLED = 'true';
    expect((await runWhatsAppPixReminders(pool, { now: new Date('2026-10-24T10:00:00Z'), reconcile, provider })).sent).toBe(0); // 07h

    const r1 = await runWhatsAppPixReminders(pool, { now: NOON, reconcile, provider });
    expect(r1.sent).toBe(1);
    expect(reconcile).toHaveBeenCalledWith(pay.id, pool);
    const sent = (provider.sendText as any).mock.calls.map((c: any[]) => c[2]);
    expect(sent).toEqual([expect.stringContaining('ainda está disponível')]);

    const r2 = await runWhatsAppPixReminders(pool, { now: new Date(NOON.getTime() + 10 * 60 * 1000), reconcile, provider });
    expect(r2.sent).toBe(0);
    expect((await pool.query(`SELECT status FROM whatsapp_payment_reminders WHERE payment_id = $1`, [pay.id])).rows[0].status).toBe('SENT');
  });

  it('B: pago, conversa com pessoa ou alguém escrevendo agora não recebe lembrete', async () => {
    process.env.WHATSAPP_PIX_REMINDER_ENABLED = 'true';
    const jid = '5531988887777@s.whatsapp.net';
    await inbound(jid, { conversation: 'quero' });
    const conv = await convOf(jid);
    mockPix('pay_0123_c');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Davi Souza', email: `davi.0123.${tag}@example.com` }) }] },
      { content: 'Pix aqui.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    const pay = (await pool.query(`SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.whatsapp_conversation_id = $1`, [conv.id])).rows[0];
    const ago = new Date(NOON.getTime() - 40 * 60 * 1000).toISOString();
    await pool.query('UPDATE payments SET created_at = $2 WHERE id = $1', [pay.id, ago]);
    (provider.sendText as any).mockClear();

    // alguém escreveu há 5 minutos: não interrompe e não grava nada
    await pool.query('UPDATE whatsapp_messages SET created_at = $2 WHERE conversation_id = $1', [conv.id, new Date(NOON.getTime() - 5 * 60 * 1000).toISOString()]);
    expect((await runWhatsAppPixReminders(pool, { now: NOON, reconcile: async () => null, provider })).sent).toBe(0);
    expect((await pool.query('SELECT 1 FROM whatsapp_payment_reminders WHERE payment_id = $1', [pay.id])).rows.length).toBe(0);

    // conversa parada, mas o Asaas confirmou o pagamento na conferência
    await pool.query('UPDATE whatsapp_messages SET created_at = $2 WHERE conversation_id = $1', [conv.id, ago]);
    const paid = async (paymentId: string, p: Pool) => {
      await p.query(`UPDATE payments SET status = 'CONFIRMED' WHERE id = $1`, [paymentId]);
    };
    expect((await runWhatsAppPixReminders(pool, { now: NOON, reconcile: paid, provider })).sent).toBe(0);
    expect((await pool.query('SELECT status, reason FROM whatsapp_payment_reminders WHERE payment_id = $1', [pay.id])).rows[0]).toEqual({ status: 'SKIPPED', reason: 'NOT_PENDING' });
    expect((provider.sendText as any).mock.calls.length).toBe(0);
  });

  it('B: conversa esperando uma pessoa (needs_human) ou com pessoa não recebe lembrete', async () => {
    process.env.WHATSAPP_PIX_REMINDER_ENABLED = 'true';
    for (const [i, setup] of [[0, `needs_human = TRUE`], [1, `mode = 'HUMAN'`]] as const) {
      const jid = `553196666000${i}@s.whatsapp.net`;
      await inbound(jid, { conversation: 'quero' });
      const conv = await convOf(jid);
      mockPix(`pay_0123_h${i}`);
      script = [
        { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Eva Melo', email: `eva${i}.0123.${tag}@example.com` }) }] },
        { content: 'Pix aqui.', tool_calls: [] }
      ];
      await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
      const pay = (await pool.query(`SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.whatsapp_conversation_id = $1`, [conv.id])).rows[0];
      const ago = new Date(NOON.getTime() - 40 * 60 * 1000).toISOString();
      await pool.query('UPDATE payments SET created_at = $2 WHERE id = $1', [pay.id, ago]);
      await pool.query('UPDATE whatsapp_messages SET created_at = $2 WHERE conversation_id = $1', [conv.id, ago]);
      await pool.query(`UPDATE whatsapp_conversations SET ${setup} WHERE id = $1`, [conv.id]);
      (provider.sendText as any).mockClear();
      expect((await runWhatsAppPixReminders(pool, { now: NOON, reconcile: async () => null, provider })).sent).toBe(0);
      expect((await pool.query('SELECT status, reason FROM whatsapp_payment_reminders WHERE payment_id = $1', [pay.id])).rows[0]).toEqual({ status: 'SKIPPED', reason: i === 0 ? 'NEEDS_HUMAN' : 'MODE_HUMAN' });
      expect((provider.sendText as any).mock.calls.length).toBe(0);
    }
  });
});
