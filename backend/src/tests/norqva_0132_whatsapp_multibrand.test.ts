// NORQVA-0132: um número de WhatsApp atendendo mais de uma marca, com assunto pela origem da conversa.
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
import { sampleKeyFor, setSampleFetchForTests } from '../services/whatsapp/samples';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0132';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('NORQVA-0132 — fotos do bordado', () => {
  it('produto de bordado usa as fotos do kit de bordado', () => {
    expect(sampleKeyFor({ name: 'Bordado', product_name: 'Bordado' })).toBe('bordado');
    expect(sampleKeyFor({ name: 'Kit de Bordado NORQVA' })).toBe('bordado');
    expect(sampleKeyFor({ name: 'Kit Trattoria Completo' })).toBe('kit5');
  });
});

describe.sequential('NORQVA-0132 — número com marcas extras', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const cookBrand = crypto.randomUUID();
  const craftBrand = crypto.randomUUID();
  const cookProduct = crypto.randomUUID();
  const craftProduct = crypto.randomUUID();
  const cookOffer = crypto.randomUUID();
  const craftOffer = crypto.randomUUID();
  const cookCode = `OFF-C${tag}`;
  const craftCode = `OFF-B${tag}`;
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
  let lastSystem = '';
  const fakeAi = async (messages: any[]) => {
    lastSystem = String(messages[0]?.content || '');
    return script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };
  };

  const inbound = (jid: string, message: any) =>
    request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Ana', message }
    });
  const convOf = async (jid: string) => (await pool.query('SELECT id, focus_brand_id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0];
  const patch = (body: any) => request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send(body);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0132@norqva.test', 'Admin 0132', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0132'), ($3, $4, 'Bordado 0132')`, [cookBrand, `C32${tag}`, craftBrand, `K32${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES
       ($1, $2, 'Coleção 0132', 'Receitas', 'Cinco livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3),
       ($4, $5, 'Bordado', 'Artesanato', 'Riscos de bordado', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $6)`,
      [cookProduct, `PRD-C${tag}`, cookBrand, craftProduct, `PRD-B${tag}`, craftBrand]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance) VALUES
       ($1, $2, 'Kit Trattoria Completo', $3, 49.90, 29.90, 'ATIVA', '5 livros digitais', false, 'COMMERCIAL_PRODUCTION'),
       ($4, $5, 'Bordado', $6, 29.90, 19.90, 'ATIVA', 'Kit de bordado', false, 'COMMERCIAL_PRODUCTION')`,
      [cookOffer, cookCode, cookProduct, craftOffer, craftCode, craftProduct]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0132 Atendimento', brand_id: cookBrand });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511944445555@s.whatsapp.net' } });
    await patch({ bot_enabled: true });
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    setSampleFetchForTests(null);
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    await q('DELETE FROM whatsapp_refs WHERE number_id = $1', [numberId]);
    await q('DELETE FROM whatsapp_number_brands WHERE number_id = $1', [numberId]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[cookOffer, craftOffer]]);
    await q('DELETE FROM products WHERE id = ANY($1::uuid[])', [[cookProduct, craftProduct]]);
    await q('DELETE FROM brands WHERE id = ANY($1::uuid[])', [[cookBrand, craftBrand]]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    setAttendantAiForTests(fakeAi as any);
    setSampleFetchForTests(async () => ({ ok: true, contentType: 'image/jpeg', bytes: JPEG }));
    script = [];
    lastSystem = '';
    (provider.sendText as any).mockClear();
    (provider.sendImage as any).mockClear();
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0132'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null)
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  it('sem marca extra: o bordado não tem WhatsApp e o atendente só vê a marca do número', async () => {
    const off = await request(app).get(`/api/public/offers/${craftCode}`);
    expect(off.body.whatsapp).toBeNull();
    const ref = await request(app).post('/api/public/whatsapp/ref').send({ offer_human_id: craftCode });
    expect(ref.status).not.toBe(201);
    const jid = '5531900000001@s.whatsapp.net';
    await inbound(jid, { conversation: 'Oi' });
    await processConversation(pool, (await convOf(jid)).id, []);
    expect(lastSystem).toContain(cookCode);
    expect(lastSystem).not.toContain(craftCode);
    expect(lastSystem).not.toContain('ASSUNTO DA CONVERSA');
  });

  it('grava as marcas extras (sem a principal, sem repetir) e recusa marca que não existe', async () => {
    const bad = await patch({ extra_brand_ids: [crypto.randomUUID()] });
    expect(bad.status).toBe(400);
    const ok = await patch({ extra_brand_ids: [craftBrand, craftBrand, cookBrand] });
    expect(ok.status).toBe(200);
    expect(ok.body.extra_brand_ids).toEqual([craftBrand]);
    const list = await request(app).get('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`);
    expect(list.body.numbers.find((n: any) => n.id === numberId).extra_brand_ids).toEqual([craftBrand]);
    const off = await request(app).get(`/api/public/offers/${craftCode}`);
    expect(off.body.whatsapp).toEqual({ available: true });
  });

  it('veio pelo botão do bordado: só o bordado no catálogo, assunto gravado, fotos do bordado', async () => {
    const ref = await request(app).post('/api/public/whatsapp/ref').send({ offer_human_id: craftCode });
    expect(ref.status).toBe(201);
    const jid = '5531900000002@s.whatsapp.net';
    await inbound(jid, { conversation: ref.body.text });
    const conv = await convOf(jid);
    script = [
      { content: null, tool_calls: [{ id: 's1', name: 'send_samples', arguments: '{}' }] },
      { content: 'Olha só como é o kit.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect(lastSystem).toContain(craftCode);
    expect(lastSystem).not.toContain(cookCode);
    expect(lastSystem).toContain('marca Bordado 0132');
    expect((await convOf(jid)).focus_brand_id).toBe(craftBrand);
    const captions = (provider.sendImage as any).mock.calls.map((c: any[]) => c[3]);
    expect(captions.length).toBeGreaterThan(0);
    expect(captions.every((c: string) => /Bordado/.test(c))).toBe(true);

    // tentar cobrar o outro produto: fora do catálogo desta conversa
    script = [
      { content: null, tool_calls: [{ id: 'p1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: cookCode, full_name: 'Ana Souza', email: `ana.0132.${tag}@example.com` }) }] },
      { content: 'Certo.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, ['CPF 529.982.247-25']);
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM orders WHERE whatsapp_conversation_id = $1', [conv.id])).rows[0].n).toBe(0);
  });

  it('sem origem: pergunta o assunto; depois da escolha fica só nele', async () => {
    const jid = '5531900000003@s.whatsapp.net';
    await inbound(jid, { conversation: 'Boa noite' });
    const conv = await convOf(jid);
    await processConversation(pool, conv.id, []);
    expect(lastSystem).toContain('ASSUNTO DA CONVERSA');
    expect(lastSystem).toContain(cookCode);
    expect(lastSystem).toContain(craftCode);
    expect(lastSystem).toContain('ASSUNTO "Bordado 0132"');
    expect(lastSystem).toContain('atendimento NORQVA');

    // fotos sem dizer o produto: não adivinha
    (provider.sendImage as any).mockClear();
    script = [
      { content: null, tool_calls: [{ id: 's0', name: 'send_samples', arguments: '{}' }] },
      { content: 'Qual dos dois você quer ver?', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect((provider.sendImage as any).mock.calls.length).toBe(0);

    script = [
      { content: null, tool_calls: [{ id: 's2', name: 'send_samples', arguments: JSON.stringify({ offer_code: craftCode }) }] },
      { content: 'Aqui estão as fotos.', tool_calls: [] }
    ];
    await processConversation(pool, conv.id, []);
    expect((await convOf(jid)).focus_brand_id).toBe(craftBrand);
    await processConversation(pool, conv.id, []);
    expect(lastSystem).not.toContain('ASSUNTO DA CONVERSA');
    expect(lastSystem).toContain(craftCode);
    expect(lastSystem).not.toContain(cookCode);
  });

  it('anúncio de fora do NORQVA: fica com a marca principal do número', async () => {
    const jid = '5531900000004@s.whatsapp.net';
    await inbound(jid, { extendedTextMessage: { text: 'Quero saber mais', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: '120250149896859999' } } } });
    const conv = await convOf(jid);
    await processConversation(pool, conv.id, []);
    expect(lastSystem).toContain(cookCode);
    expect(lastSystem).not.toContain(craftCode);
    expect((await convOf(jid)).focus_brand_id).toBe(cookBrand);
  });

  it('anúncio de um plano do NORQVA: fica com a marca do plano', async () => {
    const adId = '120250149896858888';
    const planId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO launch_plans (id, code, brand_id, offer_human_id, status, spec, meta_ids, daily_budget_brl, max_spend_brl, question_text, created_by)
       VALUES ($1, $2, $3, $4, 'DRAFT', '{}'::jsonb, $5::jsonb, 30, 210, 'Ativar?', NULL)`,
      [planId, `NQ-0132-${tag}`, craftBrand, craftCode, JSON.stringify({ ads: { a1: adId } })]
    );
    try {
      const jid = '5531900000005@s.whatsapp.net';
      await inbound(jid, { extendedTextMessage: { text: 'Oi', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: adId } } } });
      const conv = await convOf(jid);
      await processConversation(pool, conv.id, []);
      expect(lastSystem).toContain(craftCode);
      expect(lastSystem).not.toContain(cookCode);
    } finally {
      await pool.query('DELETE FROM launch_plans WHERE id = $1', [planId]);
    }
  });

  it('trocar a marca principal tira ela da lista de extras', async () => {
    const r = await patch({ brand_id: craftBrand });
    expect(r.status).toBe(200);
    expect(r.body.extra_brand_ids).toEqual([]);
    await patch({ brand_id: cookBrand, extra_brand_ids: [craftBrand] });
  });
});
