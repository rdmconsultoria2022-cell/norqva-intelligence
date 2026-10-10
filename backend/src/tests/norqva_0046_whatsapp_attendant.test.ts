// NORQVA-0046 etapa 3: atendente automático. IA, WhatsApp e Asaas simulados.
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
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiMessage, AiReply } from '../services/whatsapp/attendant';
import { maskCpfInText, findCpfs } from '../services/whatsapp/whatsappService';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';
process.env.ASAAS_API_KEY = process.env.ASAAS_API_KEY || 'MOCK';
process.env.CPF_CNPJ_HASH_SECRET = process.env.CPF_CNPJ_HASH_SECRET || 'test_hash_secret_0046';

const CPF = '52998224725';

describe.sequential('NORQVA-0046 — atendente do WhatsApp', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offerId = crypto.randomUUID();
  const offerCode = `OFF-A${tag}`;
  let numberId = '';
  let instance = '';
  let secretUrl = '';
  const spies: any[] = [];
  const sent: { kind: string; to: string; text: string }[] = [];
  const provider = {
    createInstance: vi.fn(async (_n: string, url: string) => { secretUrl = url; return { base64: 'QR', state: 'connecting' as const }; }),
    connect: vi.fn(), info: vi.fn(async () => { throw new ProviderError('nao existe', 404); }), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText: vi.fn(async (_i: string, to: string, text: string) => { sent.push({ kind: 'text', to, text }); return { id: `T-${crypto.randomUUID()}` }; }),
    sendImage: vi.fn(async (_i: string, to: string, _b: string, caption: string) => { sent.push({ kind: 'image', to, text: caption }); return { id: `I-${crypto.randomUUID()}` }; })
  } as unknown as WhatsAppProvider;

  // IA simulada: devolve a sequência programada e guarda o que recebeu
  let script: AiReply[] = [];
  const seen: AiMessage[][] = [];
  const fakeAi = async (messages: AiMessage[]) => {
    seen.push(JSON.parse(JSON.stringify(messages)));
    return script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };
  };

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0046a@norqva.test', 'Admin 0046', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0046')`, [brandId, `B46${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES ($1, $2, 'Kit 0046', 'Receitas', 'Dois livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-A${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance,
                           card_enabled, card_max_installments, card_total_price, card_free_installments, card_interest_monthly)
       VALUES ($1, $2, 'Kit Cozinha Italiana', $3, 34.80, 27.90, 'ATIVA', 'Trattoria + Dolci', false, 'COMMERCIAL_PRODUCTION', TRUE, 12, 27.96, 4, 2.99)`,
      [offerId, offerCode, productId]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0046 Atendente', brand_id: brandId });
    numberId = r.body.id;
    instance = (await pool.query('SELECT instance_name FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0].instance_name;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511911112222@s.whatsapp.net' } });
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
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
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0046.${tag}@example.com`])).rows.map((r: any) => r.id);
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
    sent.length = 0;
    seen.length = 0;
    script = [];
    spies.push(
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCustomerByExternalReference').mockResolvedValue('cus_0046'),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchPaymentByExternalReference').mockResolvedValue(null),
      vi.spyOn(AsaasPaymentProvider.prototype, 'searchCardPaymentByExternalReference').mockResolvedValue(null)
    );
  });
  afterEach(() => {
    while (spies.length) spies.pop().mockRestore();
  });

  async function customerSays(text: string, jid = '5521955554444@s.whatsapp.net') {
    const r = await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Maria', message: { conversation: text } }
    });
    expect(r.status).toBe(200);
    return (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0].id as string;
  }

  it('CPF é reconhecido e mascarado; telefone não', () => {
    expect(findCpfs('meu cpf é 529.982.247-25')).toEqual([CPF]);
    expect(maskCpfInText('cpf 52998224725 tel 21977776666')).toBe('cpf [CPF final 25] tel 21977776666');
    expect(maskCpfInText('cpf 529 982 247 25')).toBe('cpf [CPF final 25]');
  });

  it('responde com o catálogo da marca e o CPF nunca vai para a IA nem para o banco', async () => {
    const conv = await customerSays(`Quero o kit no Pix. Maria Souza, maria.0046.${tag}@example.com, CPF 529.982.247-25`);
    const stored = await pool.query('SELECT body FROM whatsapp_messages WHERE conversation_id = $1', [conv]);
    expect(stored.rows[0].body).toContain('[CPF final 25]');
    expect(stored.rows[0].body).not.toContain('247-25');

    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment').mockResolvedValue({
      providerPaymentId: 'pay_0046_pix', pixCopyPaste: '00020101PIXCODE', expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'PENDING', qrCodeImage: 'QRPNG'
    } as any);
    spies.push(pix);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Maria Souza', email: `maria.0046.${tag}@example.com` }) }] },
      { content: 'Perfeito, Maria! Aqui está o seu Pix.', tool_calls: [] }
    ];
    const r = await processConversation(pool, conv, [`CPF 529.982.247-25`]);
    expect(r.replied).toBe(true);

    const all = JSON.stringify(seen);
    expect(all).not.toMatch(/52998224725|529\.982\.247-25/);
    expect(seen[0][0].content).toContain(offerCode);
    expect(seen[0][0].content).toContain('R$ 27,90');
    expect(seen[0][0].content).toContain('6x de R$ 5,16 com juros');
    expect(seen[0][0].content).toContain('final 25');

    expect(pix).toHaveBeenCalledWith(expect.objectContaining({ amount: 27.9 }));
    expect(sent.map(s => s.kind)).toEqual(['text', 'image', 'text', 'text']);
    expect(sent[0].text).toBe('Perfeito, Maria! Aqui está o seu Pix.');
    expect(sent[3].text).toBe('00020101PIXCODE');
    const order = await pool.query(`SELECT o.utm_source, o.total_amount FROM orders o WHERE o.whatsapp_conversation_id = $1`, [conv]);
    expect(order.rows).toHaveLength(1);
    expect(order.rows[0].utm_source).toBe('whatsapp');

    // pedir de novo em seguida reenvia o mesmo Pix, sem nova cobrança
    script = [
      { content: null, tool_calls: [{ id: 'c2', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Maria Souza', email: `maria.0046.${tag}@example.com` }) }] },
      { content: 'Reenviei o Pix.', tool_calls: [] }
    ];
    sent.length = 0;
    await processConversation(pool, conv, []);
    expect(pix).toHaveBeenCalledTimes(1);
    expect(sent.some(s => s.text === '00020101PIXCODE')).toBe(true);
  });

  it('cartão em 6x cobra o total com juros calculado no servidor', async () => {
    const conv = await customerSays(`Prefiro cartão em 6x. Ana Lima, ana.0046.${tag}@example.com, cpf 52998224725`, '5521944443333@s.whatsapp.net');
    const card = vi.spyOn(AsaasPaymentProvider.prototype, 'createCardPayment').mockResolvedValue({
      providerPaymentId: 'pay_0046_card', installmentId: 'ins_0046', invoiceUrl: 'https://sandbox.asaas.com/i/w46', dueDate: '2026-10-11', status: 'PENDING'
    } as any);
    spies.push(card);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_card_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'Ana Lima', email: `ana.0046.${tag}@example.com`, installments: 6 }) }] },
      { content: 'Pronto, Ana! Segue o link.', tool_calls: [] }
    ];
    await processConversation(pool, conv, ['cpf 52998224725']);
    expect(card).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 30.96, installments: 6 }));
    const link = sent.find(s => s.text.includes('https://sandbox.asaas.com/i/w46'));
    expect(link?.text).toContain('6x de R$ 5,16 com juros, total R$ 30,96');
  });

  it('sem CPF a ferramenta pede o CPF e nada é cobrado', async () => {
    const conv = await customerSays('Quero o kit', '5521933332222@s.whatsapp.net');
    const pix = vi.spyOn(AsaasPaymentProvider.prototype, 'createPixPayment');
    spies.push(pix);
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: offerCode, full_name: 'João Alves', email: 'joao@example.com' }) }] },
      { content: 'Para gerar o Pix preciso do seu CPF.', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(pix).not.toHaveBeenCalled();
    const toolMsg = seen[1].find(m => m.role === 'tool');
    expect(toolMsg?.content).toMatch(/Falta o CPF/);
  });

  it('produto fora do catálogo da marca é recusado', async () => {
    const conv = await customerSays('Quero outro produto', '5521922221111@s.whatsapp.net');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'create_pix_payment', arguments: JSON.stringify({ offer_code: 'OFF-000001', full_name: 'X Y', email: 'x@example.com' }) }] },
      { content: 'Esse produto não está disponível por aqui.', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(seen[1].find(m => m.role === 'tool')?.content).toMatch(/não está no catálogo/);
  });

  it('pedir uma pessoa pausa o atendente na conversa', async () => {
    const conv = await customerSays('Quero falar com uma pessoa', '5521911110000@s.whatsapp.net');
    script = [
      { content: null, tool_calls: [{ id: 'c1', name: 'request_human', arguments: JSON.stringify({ reason: 'cliente pediu' }) }] },
      { content: 'Claro! Uma pessoa da equipe já vai te responder.', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    const c = (await pool.query('SELECT mode, needs_human FROM whatsapp_conversations WHERE id = $1', [conv])).rows[0];
    expect(c).toEqual({ mode: 'HUMAN', needs_human: true });
    script = [{ content: 'não deveria responder', tool_calls: [] }];
    sent.length = 0;
    const again = await processConversation(pool, conv, []);
    expect(again).toEqual({ replied: false, reason: 'NOT_BOT_MODE' });
    expect(sent).toHaveLength(0);
  });

  it('atendente pausado no número não responde', async () => {
    const conv = await customerSays('oi', '5521900009999@s.whatsapp.net');
    await pool.query('UPDATE whatsapp_numbers SET bot_enabled = FALSE WHERE id = $1', [numberId]);
    const r = await processConversation(pool, conv, []);
    expect(r).toEqual({ replied: false, reason: 'BOT_OFF' });
    await pool.query('UPDATE whatsapp_numbers SET bot_enabled = TRUE WHERE id = $1', [numberId]);
  });

  it('condições de atendimento: salva, guarda versão e vão para a IA', async () => {
    const put = await request(app).put('/api/whatsapp/conditions').set('Authorization', `Bearer ${admin}`).send({ number_id: numberId, conditions: 'Atendimento das 8h às 22h. Ofereça primeiro o kit.' });
    expect(put.status).toBe(200);
    const hist = await request(app).get('/api/whatsapp/conditions/history').set('Authorization', `Bearer ${admin}`).query({ number_id: numberId });
    expect(hist.body.versions[0].conditions).toBe('Atendimento das 8h às 22h. Ofereça primeiro o kit.');
    const conv = await customerSays('Olá', '5521988887777@s.whatsapp.net');
    script = [{ content: 'Olá! Temos o Kit Cozinha Italiana.', tool_calls: [] }];
    await processConversation(pool, conv, []);
    expect(seen[0][0].content).toContain('Ofereça primeiro o kit.');
    const too = await request(app).put('/api/whatsapp/conditions').set('Authorization', `Bearer ${admin}`).send({ conditions: 'x'.repeat(8001) });
    expect(too.status).toBe(400);
  });

  it('resultados por número contam conversas, pedidos e vendas pagas', async () => {
    const conv = (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1 LIMIT 1', [numberId])).rows[0].id;
    const o = (await pool.query('SELECT id FROM orders WHERE whatsapp_conversation_id IS NOT NULL AND whatsapp_conversation_id IN (SELECT id FROM whatsapp_conversations WHERE number_id = $1) LIMIT 1', [numberId])).rows[0];
    await pool.query(`UPDATE orders SET status = 'PAID' WHERE id = $1`, [o.id]);
    const r = await request(app).get('/api/whatsapp/results').set('Authorization', `Bearer ${admin}`).query({ days: 7 });
    expect(r.status).toBe(200);
    const row = r.body.numbers.find((n: any) => n.id === numberId);
    expect(row.new_conversations).toBeGreaterThanOrEqual(6);
    expect(row.orders_created).toBeGreaterThanOrEqual(2);
    expect(row.orders_paid).toBe(1);
    expect(row.revenue).toBeGreaterThan(0);
    expect(row.conversion).toBeGreaterThan(0);
    expect(conv).toBeTruthy();
  });
});

