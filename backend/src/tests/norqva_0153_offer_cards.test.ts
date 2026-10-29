// NORQVA-0153: o atendente envia a imagem de cada oferta (conteúdo e preço) uma de cada vez:
// 1ª opção (recomendada) → 2ª opção (se não pediu para pagar) → livros avulsos (depois da recusa das duas ou se pedir avulso).
// IA, WhatsApp e imagens simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { resetAllRateLimits } from '../middleware/rateLimiter';
import { setWhatsAppProviderForTests, WhatsAppProvider, ProviderError } from '../services/whatsapp/provider';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, AiReply, loadCatalog, catalogText, systemPrompt } from '../services/whatsapp/attendant';
import { setSampleFetchForTests } from '../services/whatsapp/samples';
import { cardFor, cardOrderCheck, setOfferCardsForTests, OFFER_CARDS } from '../services/whatsapp/offerCards';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('NORQVA-0153 — regras puras', () => {
  it('as imagens de verdade têm o preço atual das ofertas', () => {
    expect(OFFER_CARDS['OFF-000016'].pix).toBe(47);
    expect(OFFER_CARDS['OFF-000010'].pix).toBe(29.9);
    expect(cardFor('OFF-000016', 47)).not.toBeNull();
    expect(cardFor('off-000016', 47)).not.toBeNull();
    // preço mudou: a imagem não sai (estaria com preço errado)
    expect(cardFor('OFF-000016', 49.9)).toBeNull();
    expect(cardFor('OFF-999999', 10)).toBeNull();
  });

  it('ordem: recomendada, depois alternativa, avulso só depois das duas ou a pedido', () => {
    const base = { featured: 'COL', alternative: 'KIT', askedIndividual: false };
    expect(cardOrderCheck('COL', { ...base, sent: new Set() })).toEqual({ ok: true, step: 'FEATURED' });
    expect(cardOrderCheck('KIT', { ...base, sent: new Set() }).ok).toBe(false);
    expect(cardOrderCheck('LIVRO', { ...base, sent: new Set() }).ok).toBe(false);
    expect(cardOrderCheck('KIT', { ...base, sent: new Set(['COL']) })).toEqual({ ok: true, step: 'ALTERNATIVE' });
    expect(cardOrderCheck('LIVRO', { ...base, sent: new Set(['COL']) }).ok).toBe(false);
    expect(cardOrderCheck('LIVRO', { ...base, sent: new Set(['COL', 'KIT']) })).toEqual({ ok: true, step: 'INDIVIDUAL' });
    expect(cardOrderCheck('LIVRO', { ...base, askedIndividual: true, sent: new Set() })).toEqual({ ok: true, step: 'INDIVIDUAL' });
    expect(cardOrderCheck('COL', { ...base, sent: new Set(['COL']) }).ok).toBe(false);
    // sem recomendada: a alternativa e os avulsos não esperam por ela
    expect(cardOrderCheck('LIVRO', { featured: null, alternative: null, askedIndividual: false, sent: new Set() }).ok).toBe(true);
  });

  it('o prompt manda uma oferta por vez, pela ferramenta, acima das condições', () => {
    const p = systemPrompt({ brandName: 'Trattoria', catalog: '- Código X', globalConditions: 'liste todos os livros', numberConditions: '', customerName: null, cpfOnFile: null });
    expect(p).toMatch(/Nunca liste vários produtos com preço de uma vez/);
    expect(p).toMatch(/send_offer_card/);
    expect(p.indexOf('6b.')).toBeLessThan(p.indexOf('CONDIÇÕES DE ATENDIMENTO'));
  });
});

describe.sequential('NORQVA-0153 — atendente envia as imagens na ordem', () => {
  let pool: Pool;
  let admin: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const bookId = crypto.randomUUID();
  const kitId = crypto.randomUUID();
  const colId = crypto.randomUUID();
  const bookCode = `OFF-L${tag}`;
  const kitCode = `OFF-K${tag}`;
  const colCode = `OFF-C${tag}`;
  let numberId = '';
  let secretUrl = '';
  const provider = {
    createInstance: vi.fn(async (_n: string, url: string) => { secretUrl = url; return { base64: 'QR', state: 'connecting' as const }; }),
    connect: vi.fn(), info: vi.fn(async () => { throw new ProviderError('nao existe', 404); }), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText: vi.fn(async () => ({ id: `T-${crypto.randomUUID()}` })),
    sendImage: vi.fn(async () => ({ id: `I-${crypto.randomUUID()}` }))
  } as unknown as WhatsAppProvider;
  let script: AiReply[] = [];
  const toolResults: any[] = [];
  const seenTools = new Set<string>();
  const fakeAi = async (messages: any[]) => {
    for (const m of messages) {
      if (m?.role === 'tool' && !seenTools.has(m.tool_call_id)) {
        seenTools.add(m.tool_call_id);
        toolResults.push(JSON.parse(String(m.content)));
      }
    }
    return script.shift() || { content: 'Posso ajudar em algo mais?', tool_calls: [] };
  };
  const says = async (jid: string, text: string) => {
    await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Alba', message: { conversation: text } }
    });
    // a resposta automática (com atraso) fica de fora: o teste chama processConversation na hora
    resetAttendantMemoryForTests();
    return (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2', [numberId, jid])).rows[0].id as string;
  };
  const card = (id: string, code: string) => ({ id: `c${id}-${crypto.randomUUID().slice(0, 4)}`, name: 'send_offer_card', arguments: JSON.stringify({ offer_code: code }) });
  const captions = () => (provider.sendImage as any).mock.calls.map((c: any[]) => c[3]);

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const u = await pool.query(
      `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, 'admin.norqva0153@norqva.test', 'Admin 0153', 'ADMIN', 'ACTIVE')
       ON CONFLICT (email) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE' RETURNING auth_user_id, email`,
      [crypto.randomUUID()]
    );
    admin = signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role: 'ADMIN' });
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Trattoria 0153')`, [brandId, `B53${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id)
       VALUES ($1, $2, 'Livros 0153', 'Receitas', 'Livros de cozinha', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-F${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance, created_at)
       VALUES ($1, $2, 'Trattoria em Casa', $3, 19.90, NULL, 'ATIVA', 'Livro', false, 'COMMERCIAL_PRODUCTION', '2026-09-01T12:00:00Z'),
              ($4, $5, 'Kit Trattoria Completo — 5 livros', $3, 94.50, 29.90, 'ATIVA', 'Os 5 livros', false, 'COMMERCIAL_PRODUCTION', '2026-10-01T12:00:00Z')`,
      [bookId, bookCode, productId, kitId, kitCode]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance, created_at,
                           attendant_featured, attendant_alternative_offer_id)
       VALUES ($1, $2, 'Coleção Trattoria Completa 0153', $3, 94.50, 47.00, 'ATIVA', 'Os 5 livros e o bônus', false, 'COMMERCIAL_PRODUCTION', '2026-10-26T12:00:00Z', TRUE, $4)`,
      [colId, colCode, productId, kitId]
    );
    setOfferCardsForTests({
      [colCode]: { path: '/images/whatsapp/off-000016.jpg', pix: 47, caption: 'Coleção 0153' },
      [kitCode]: { path: '/images/whatsapp/off-000010.jpg', pix: 29.9, caption: 'Kit 0153' },
      [bookCode]: { path: '/images/whatsapp/off-000001.jpg', pix: 19.9, caption: 'Livro 0153' }
    });
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0153 Atendimento', brand_id: brandId });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511955556666@s.whatsapp.net' } });
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
  });

  afterAll(async () => {
    setOfferCardsForTests(null);
    setSampleFetchForTests(null);
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    if (!pool) return;
    const q = (s: string, p: any[]) => pool.query(s, p).catch(() => {});
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await q('UPDATE offers SET attendant_alternative_offer_id = NULL WHERE id = $1', [colId]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [[colId, kitId, bookId]]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
    await q('DELETE FROM brands WHERE id = $1', [brandId]);
  });

  beforeEach(() => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    setAttendantAiForTests(fakeAi as any);
    setSampleFetchForTests(async () => ({ ok: true, contentType: 'image/jpeg', bytes: JPEG }));
    script = [];
    toolResults.length = 0;
    (provider.sendImage as any).mockClear();
  });

  it('o catálogo marca 1ª e 2ª opção, os avulsos e as imagens disponíveis', async () => {
    const text = catalogText(await loadCatalog(pool, brandId));
    expect(text).toContain('1ª opção');
    expect(text).toContain(`2ª opção: alternativa mais em conta ao código ${colCode}`);
    expect(text).toContain('Como apresentar: avulso.');
    expect(text).toContain('Imagem com conteúdo e preço: disponível (send_offer_card).');
  });

  it('conversa: livro antes da hora é recusado; coleção, depois kit, depois livro', async () => {
    const jid = '5531922220001@s.whatsapp.net';
    let conv = await says(jid, 'Quero o link do e-book');
    // a IA tenta o livro avulso e o kit antes da coleção: recusados; a coleção sai
    script = [
      { content: null, tool_calls: [card('1', bookCode), card('2', kitCode)] },
      { content: null, tool_calls: [card('3', colCode)] },
      { content: 'Olha a nossa opção mais completa 👇 Quer garantir?', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(toolResults.slice(0, 2).map(r => r.ok)).toEqual([false, false]);
    expect(toolResults[2].ok).toBe(true);
    expect(captions()).toEqual(['Coleção 0153']);

    // não pediu para pagar: vai o kit (o livro ainda não)
    (provider.sendImage as any).mockClear();
    conv = await says(jid, 'Achei caro');
    script = [
      { content: null, tool_calls: [card('4', bookCode), card('5', kitCode)] },
      { content: 'Tenho uma opção mais em conta 👇', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(captions()).toEqual(['Kit 0153']);

    // recusou as duas: agora o livro avulso sai; a coleção não é reenviada
    (provider.sendImage as any).mockClear();
    conv = await says(jid, 'Não quero kit, só um livro');
    script = [
      { content: null, tool_calls: [card('6', colCode), card('7', bookCode)] },
      { content: 'Aqui está o livro avulso 👇', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(captions()).toEqual(['Livro 0153']);
  });

  it('cliente pede o preço de um livro avulso logo de cara: sai com customer_asked_individual', async () => {
    const conv = await says('5531922220002@s.whatsapp.net', 'Quanto custa só o Trattoria?');
    script = [
      { content: null, tool_calls: [{ id: 'i1', name: 'send_offer_card', arguments: JSON.stringify({ offer_code: bookCode, customer_asked_individual: true }) }] },
      { content: 'Aqui está 👇', tool_calls: [] }
    ];
    await processConversation(pool, conv, []);
    expect(captions()).toEqual(['Livro 0153']);
  });

  it('preço da oferta mudou: a imagem não sai e a IA é avisada para apresentar em texto', async () => {
    await pool.query('UPDATE offers SET promotional_price = 49.90 WHERE id = $1', [colId]);
    try {
      const conv = await says('5531922220003@s.whatsapp.net', 'Oi');
      script = [
        { content: null, tool_calls: [card('p1', colCode)] },
        { content: 'Temos a Coleção Trattoria Completa por R$ 49,90.', tool_calls: [] }
      ];
      await processConversation(pool, conv, []);
      expect(captions()).toEqual([]);
      expect(toolResults.some(r => r?.ok === false && /texto/.test(String(r.error)))).toBe(true);
    } finally {
      await pool.query('UPDATE offers SET promotional_price = 47.00 WHERE id = $1', [colId]);
    }
  });
});
