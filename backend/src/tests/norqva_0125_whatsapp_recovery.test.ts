// NORQVA-0125: WhatsApp para quem gerou um pagamento e não pagou.
// WhatsApp, Asaas e IA simulados; nada sai para a internet.
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
import { attendantInboundHandler, resetAttendantMemoryForTests } from '../services/whatsapp/attendant';
import { recordOutgoing } from '../services/whatsapp/whatsappService';
import {
  phoneKey, cleanFirstName, recoveryText, recoveryLink, withinRecoveryHours, nextGapSeconds, isExplicitStop, isRecoveryRefusal,
  redactLinkPersonalData, rowAllowsQueue, personId,
  computeRecoveryPeople, isSelectable, runRecoveryQueue, queueRecovery, recoveryOverview, OPT_OUT_ACK_TEXT,
  RECOVERY_ALERT_RULE, RECOVERY_STUCK_RULE, RECOVERY_RECHECK_RULE
} from '../services/whatsapp/paymentRecovery';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';

describe('NORQVA-0125 — regras puras', () => {
  it('telefone normalizado: com ou sem 55, com ou sem o 9; @lid não é telefone', () => {
    expect(phoneKey('(31) 98585-5642')).toBe('553185855642');
    expect(phoneKey('5531985855642')).toBe('553185855642');
    expect(phoneKey('553185855642@s.whatsapp.net')).toBe('553185855642');
    expect(phoneKey('3185855642')).toBe('553185855642');
    expect(phoneKey('31985855642@lid')).toBeNull();
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(personId('553185855642')).toMatch(/^[0-9a-f]{24}$/);
    expect(personId('553185855642')).not.toContain('5642');
  });

  it('primeiro nome limpo e texto fixo do contrato', () => {
    expect(cleanFirstName('  maria   da silva')).toBe('Maria');
    expect(cleanFirstName('JOÃO')).toBe('João');
    expect(cleanFirstName('1234')).toBeNull();
    expect(cleanFirstName('')).toBeNull();
    const link = 'https://acesso.norqva.com.br/p/OFF-1?checkout=1';
    expect(recoveryText('Maria', 'Kit Trattoria Completo', link)).toBe(
      `Oi, Maria! Aqui é da NORQVA. Vi que você começou a compra do Kit Trattoria Completo e o pagamento não chegou a ser concluído. Se ainda quiser, é só usar este link: ${link}. O acesso chega no seu e-mail logo depois do pagamento. Se tiver alguma dúvida, me responde aqui. Se não quiser mais receber mensagens, é só responder SAIR.`
    );
    expect(recoveryText(null, 'Kit', link)).toMatch(/^Oi, tudo bem\? Aqui é da NORQVA\./);
  });

  it('link com pagamento direto, nome, e-mail e origem; sem CPF; cópia guardada sem nome e e-mail', () => {
    const link = recoveryLink('https://acesso.norqva.com.br/', 'OFF-000005', 'Maria Silva', 'Maria@Example.com', 'ABC234');
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://acesso.norqva.com.br/p/OFF-000005');
    expect(url.searchParams.get('checkout')).toBe('1');
    expect(url.searchParams.get('name')).toBe('Maria Silva');
    expect(url.searchParams.get('email')).toBe('maria@example.com');
    expect(url.searchParams.get('utm_source')).toBe('whatsapp');
    expect(url.searchParams.get('utm_medium')).toBe('recuperacao');
    expect(url.searchParams.get('utm_content')).toBe('ABC234');
    expect([...url.searchParams.keys()].some(k => /cpf|document/i.test(k))).toBe(false);
    const stored = redactLinkPersonalData(recoveryText('Maria', 'Kit', link));
    expect(stored).not.toMatch(/name=|email=|maria%40|Maria\+Silva/i);
    expect(stored).toContain('utm_content=ABC234');
    expect(stored).toContain('. O acesso chega');
  });

  it('horário de Brasília calculado pelo fuso (servidor em UTC)', () => {
    expect(withinRecoveryHours(new Date('2026-10-24T12:00:00Z'))).toBe(true); // 09h00
    expect(withinRecoveryHours(new Date('2026-10-24T11:59:00Z'))).toBe(false); // 08h59
    expect(withinRecoveryHours(new Date('2026-10-24T22:59:00Z'))).toBe(true); // 19h59
    expect(withinRecoveryHours(new Date('2026-10-24T23:00:00Z'))).toBe(false); // 20h00
    expect(withinRecoveryHours(new Date('2026-10-25T02:00:00Z'))).toBe(false); // 23h
  });

  it('espaçamento de 2 a 4 minutos', () => {
    expect(nextGapSeconds(() => 0)).toBe(120);
    expect(nextGapSeconds(() => 0.9999999)).toBe(240);
    for (let i = 0; i < 50; i++) {
      const g = nextGapSeconds();
      expect(g).toBeGreaterThanOrEqual(120);
      expect(g).toBeLessThanOrEqual(240);
    }
  });

  it('SAIR explícito e recusas da primeira resposta', () => {
    expect(isExplicitStop('SAIR')).toBe(true);
    expect(isExplicitStop('Parar!!')).toBe(true);
    expect(isExplicitStop('pare 🙏')).toBe(true);
    expect(isExplicitStop('cancelar')).toBe(false);
    expect(isExplicitStop('não quero')).toBe(false);
    expect(isRecoveryRefusal('Não quero.')).toBe(true);
    expect(isRecoveryRefusal('Não, obrigado')).toBe(true);
    expect(isRecoveryRefusal('não quero cartão, quero Pix')).toBe(false);
  });

  it('FALHOU é final; só "Pulada" por motivo passageiro volta à fila', () => {
    expect(rowAllowsQueue(null)).toBe(true);
    expect(rowAllowsQueue({ status: 'FAILED', reason: 'SEND_FAILED:timeout' })).toBe(false);
    expect(rowAllowsQueue({ status: 'SENT', reason: null })).toBe(false);
    expect(rowAllowsQueue({ status: 'SKIPPED', reason: 'PAID' })).toBe(false);
    expect(rowAllowsQueue({ status: 'SKIPPED', reason: 'OPTED_OUT' })).toBe(false);
    for (const r of ['HUMAN_CONVERSATION', 'SEND_BLOCKED:NO_BRAND_NUMBER', 'PHONE_CHANGED', 'RECHECK_FAILED', 'OUTSIDE_HOURS']) {
      expect(rowAllowsQueue({ status: 'SKIPPED', reason: r })).toBe(true);
    }
  });
});

describe.sequential('NORQVA-0125 — lista, fila e envio', () => {
  let pool: Pool;
  let admin: string;
  let operations: string;
  const tag = crypto.randomUUID().slice(0, 6).toUpperCase();
  const digits = String(parseInt(crypto.randomBytes(3).toString('hex'), 16) % 100000).padStart(5, '0');
  const phone = (i: number) => `319${digits}${String(i).padStart(3, '0')}`; // 11 dígitos
  const keyOf = (i: number) => phoneKey(phone(i))!;
  const idOf = (i: number) => personId(keyOf(i));
  const emailOf = (i: number) => `p${i}.0125.${tag}@example.com`;
  const brandId = crypto.randomUUID();
  const brand2 = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const product2 = crypto.randomUUID();
  const offerActive = crypto.randomUUID();
  const offerOff = crypto.randomUUID();
  const offerBrand2 = crypto.randomUUID();
  const offerCodeActive = `OFF-R${tag}`;
  const offerIds = [offerActive, offerOff, offerBrand2];
  // 12h em Brasília de hoje (as rotas usam o relógio de verdade)
  const NOON = new Date(`${new Date().toISOString().slice(0, 10)}T15:00:00Z`);
  let numberId = '';
  let secretUrl = '';
  let seq = 0;
  const provider = {
    createInstance: vi.fn(async (_n: string, url: string) => { secretUrl = url; return { base64: 'QR', state: 'connecting' as const }; }),
    connect: vi.fn(), info: vi.fn(async () => { throw new ProviderError('nao existe', 404); }), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText: vi.fn(async () => ({ id: `T-${crypto.randomUUID()}` })),
    sendImage: vi.fn(async () => ({ id: `I-${crypto.randomUUID()}` }))
  } as unknown as WhatsAppProvider;

  const daysAgo = (d: number, from = NOON) => new Date(from.getTime() - d * 86400000).toISOString();

  async function customer(name: string, i: number, email?: string) {
    const r = await pool.query(
      `INSERT INTO customers (name, email, phone, is_demo) VALUES ($1, $2, $3, FALSE) RETURNING id`,
      [name, email || emailOf(i), phone(i)]
    );
    return r.rows[0].id as string;
  }
  async function order(customerId: string, opts: { offerId?: string; productId?: string; status?: string; createdAt?: string; provenance?: string; payStatus?: string; convId?: string } = {}) {
    seq++;
    const created = opts.createdAt || daysAgo(1);
    const o = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, created_at, updated_at, whatsapp_conversation_id)
       VALUES ($1, 29.90, $2, FALSE, $3, $4, $5, $5, $6) RETURNING id`,
      [customerId, opts.status || 'PENDING', opts.provenance || 'COMMERCIAL_PRODUCTION', `idem-0125-${tag}-${seq}`, created, opts.convId || null]
    );
    const orderId = o.rows[0].id as string;
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, created_at)
       VALUES ($1, $2, $3, 'Coleção 0125', 'Kit 0125', 29.90, 1, 29.90, $4)`,
      [orderId, opts.offerId || offerActive, opts.productId || productId, created]
    );
    const p = await pool.query(
      `INSERT INTO payments (human_id, order_id, provider, provider_payment_id, status, amount, idempotency_key, external_reference, created_at, updated_at)
       VALUES ($1, $2, 'ASAAS', $3, $4, 29.90, $5, $6, $7, $7) RETURNING id`,
      [`PAY-0125-${tag}-${seq}`, orderId, `pay_0125_${tag}_${seq}`, opts.payStatus || (opts.status === 'PAID' ? 'CONFIRMED' : 'PENDING'), `pi-0125-${tag}-${seq}`, `ext-0125-${tag}-${seq}`, created]
    );
    return { orderId, paymentId: p.rows[0].id as string };
  }
  const people = async () => computeRecoveryPeople(pool, { now: NOON, offerIds });
  const personOf = async (i: number) => (await people()).find(p => p.phone_keys.includes(keyOf(i))) || null;
  const recRow = async (i: number) => (await pool.query('SELECT * FROM whatsapp_recovery_messages WHERE phone_key = $1', [keyOf(i)])).rows[0] || null;
  const resetSlot = () => pool.query(`UPDATE whatsapp_recovery_state SET next_send_at = NULL WHERE id = 1`);
  const tick = (now = NOON, extra: any = {}) => runRecoveryQueue(pool, { now, provider, offerIds, random: () => 0, ...extra });
  const queue = (ids: number[]) => queueRecovery(pool, { ids: ids.map(idOf) }, null, { now: NOON, offerIds });
  const openAlerts = async (rule: string) => (await pool.query(`SELECT COUNT(*)::int AS n FROM ad_alerts WHERE rule_code = $1 AND status = 'OPEN' AND dismissed_at IS NULL`, [rule])).rows[0].n;
  const webhook = (jid: string, text: string, key: any = {}) => request(app).post(new URL(secretUrl).pathname).send({
    event: 'messages.upsert',
    data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}`, ...key }, pushName: 'Cliente', message: { conversation: text } }
  });
  const sentConv = async (i: number) => (await pool.query(`SELECT c.* FROM whatsapp_recovery_messages r JOIN whatsapp_conversations c ON c.id = r.conversation_id WHERE r.phone_key = $1`, [keyOf(i)])).rows[0];
  /** Põe na fila e envia agora (rodada com a vez livre). */
  async function sendTo(i: number) {
    await resetSlot();
    expect((await queue([i])).queued).toBe(1);
    const r = await tick();
    expect(r.outcome).toBe('SENT');
    return sentConv(i);
  }
  /** Some temporariamente com os números de outros testes (sem marca ou de outra marca). */
  async function hideOtherNumbers(): Promise<string[]> {
    return (await pool.query(`UPDATE whatsapp_numbers SET is_deleted = TRUE WHERE id <> $1 AND is_deleted = FALSE RETURNING id`, [numberId])).rows.map((r: any) => r.id);
  }
  const restoreNumbers = (ids: string[]) => ids.length ? pool.query(`UPDATE whatsapp_numbers SET is_deleted = FALSE WHERE id = ANY($1::uuid[])`, [ids]) : Promise.resolve();

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const mk = async (email: string, role: string) => {
      const u = await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, role, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE' RETURNING auth_user_id, email`,
        [crypto.randomUUID(), email, `User ${role}`, role]
      );
      return signSupabaseToken({ sub: u.rows[0].auth_user_id, email: u.rows[0].email, role });
    };
    admin = await mk('admin.norqva0125@norqva.test', 'ADMIN');
    operations = await mk('ops.norqva0125@norqva.test', 'OPERATIONS');
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0125'), ($3, $4, 'Outra 0125')`, [brandId, `B25${tag}`, brand2, `C25${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES
         ($1, $2, 'Coleção 0125', 'Receitas', 'Cinco livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3),
         ($4, $5, 'Outro 0125', 'Receitas', 'Outro', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $6)`,
      [productId, `PRD-R${tag}`, brandId, product2, `PRD-S${tag}`, brand2]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Kit Trattoria Completo', $3, 49.90, 29.90, 'ATIVA', '5 livros digitais', false, 'COMMERCIAL_PRODUCTION'),
              ($4, $5, 'Bolso Blindado', $3, 49.90, 29.90, 'PAUSADA', 'Descontinuado', false, 'COMMERCIAL_PRODUCTION'),
              ($6, $7, 'Outra Marca', $8, 49.90, 29.90, 'ATIVA', 'Outra', false, 'COMMERCIAL_PRODUCTION')`,
      [offerActive, offerCodeActive, productId, offerOff, `OFF-Q${tag}`, offerBrand2, `OFF-S${tag}`, product2]
    );
    setWhatsAppProviderForTests(provider);
    const r = await request(app).post('/api/whatsapp/numbers').set('Authorization', `Bearer ${admin}`).send({ label: 'T0125 Atendente', brand_id: brandId });
    numberId = r.body.id;
    await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set('Authorization', `Bearer ${admin}`);
    await request(app).post(new URL(secretUrl).pathname).send({ event: 'connection.update', data: { state: 'open', wuid: '5511900001111@s.whatsapp.net' } });
    await request(app).patch(`/api/whatsapp/numbers/${numberId}`).set('Authorization', `Bearer ${admin}`).send({ bot_enabled: true });
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    delete process.env.WHATSAPP_RECOVERY_ENABLED;
    if (!pool) return;
    const q = (sql: string, p: any[]) => pool.query(sql, p).catch(() => {});
    const custs = (await pool.query(`SELECT id FROM customers WHERE email LIKE $1`, [`%.0125.${tag}@example.com`])).rows.map((r: any) => r.id);
    const orders = (await pool.query(`SELECT id FROM orders WHERE customer_id = ANY($1::uuid[])`, [custs])).rows.map((r: any) => r.id);
    await q('DELETE FROM whatsapp_recovery_messages WHERE offer_id = ANY($1::uuid[]) OR order_id = ANY($2::uuid[]) OR phone_key LIKE $3', [offerIds, orders, `5531${digits}%`]);
    await q(`DELETE FROM whatsapp_recovery_optouts WHERE phone_key LIKE $1`, [`5531${digits}%`]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_refs WHERE number_id = $1', [numberId]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [custs]);
    await q(`DELETE FROM external_sales WHERE customer_email LIKE $1`, [`%.0125.${tag}@example.com`]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [offerIds]);
    await q('DELETE FROM products WHERE id = ANY($1::uuid[])', [[productId, product2]]);
    await q('DELETE FROM brands WHERE id = ANY($1::uuid[])', [[brandId, brand2]]);
    await q(`DELETE FROM ad_alerts WHERE rule_code LIKE 'WHATSAPP_RECOVERY_%'`, []);
    await resetSlot().catch(() => {});
  });

  beforeEach(async () => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    (provider.sendText as any).mockReset();
    (provider.sendText as any).mockImplementation(async () => ({ id: `T-${crypto.randomUUID()}` }));
    process.env.WHATSAPP_RECOVERY_ENABLED = 'true';
    await resetSlot();
    await pool.query(`UPDATE whatsapp_numbers SET status = 'CONNECTED', bot_enabled = TRUE WHERE id = $1`, [numberId]);
  });

  it('regras de quem entra: pagou (NORQVA, Kiwify, pagamento confirmado), teste, 30 dias, oferta fora do ar, sem telefone, duplicados, pediu para parar antes', async () => {
    const c1 = await customer('maria silva', 1);
    await order(c1, { createdAt: daysAgo(5) });
    const recent = await order(c1, { createdAt: daysAgo(1) });
    const c2 = await customer('Ana', 2);
    await order(c2, { createdAt: daysAgo(3) });
    await order(c2, { createdAt: daysAgo(2), status: 'PAID' });
    // 3: pagou com outro e-mail, mesmo telefone
    const c3 = await customer('Bruno', 3);
    await order(c3, { createdAt: daysAgo(3) });
    const c3b = (await pool.query(`INSERT INTO customers (name, email, phone) VALUES ('Bruno B', $1, $2) RETURNING id`, [`p3b.0125.${tag}@example.com`, `+55 ${phone(3)}`])).rows[0].id;
    await order(c3b, { createdAt: daysAgo(10), status: 'PAID' });
    const c4 = await customer('Carla', 4);
    await order(c4, { provenance: 'STAGING_SANDBOX_QA' });
    const c5 = await customer('Davi', 5);
    await order(c5, { createdAt: daysAgo(31) });
    const c6 = await customer('Eva', 6);
    await order(c6, { offerId: offerOff });
    const c7 = (await pool.query(`INSERT INTO customers (name, email, phone) VALUES ('Fabio', $1, NULL) RETURNING id`, [emailOf(7)])).rows[0].id;
    await order(c7);
    // 18: comprou na Kiwify com o mesmo e-mail
    const c18 = await customer('Kiwi', 18);
    await order(c18);
    await pool.query(`INSERT INTO external_sales (external_order_id, status, customer_email, is_demo) VALUES ($1, 'PAID', $2, FALSE)`, [`KW-${tag}`, emailOf(18)]);
    // 19: pedido pendente com um pagamento já confirmado
    const c19 = await customer('Lia', 19);
    await order(c19, { payStatus: 'CONFIRMED' });
    // 20: pediu para parar numa conversa antiga e depois voltou a escrever (conversa com pessoa)
    const c20 = await customer('Nina', 20);
    await order(c20);
    const conv20 = (await pool.query(`INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_phone, mode) VALUES ($1, $2, $3, 'HUMAN') RETURNING id`, [numberId, `55${phone(20)}@s.whatsapp.net`, `55${phone(20)}`])).rows[0].id;
    await pool.query(`INSERT INTO whatsapp_messages (conversation_id, direction, author, body) VALUES ($1, 'IN', 'CUSTOMER', 'parar'), ($1, 'IN', 'CUSTOMER', 'oi de novo')`, [conv20]);

    const list = await people();
    const p1 = list.find(p => p.phone_keys.includes(keyOf(1)))!;
    expect(isSelectable(p1)).toBe(true);
    expect(p1.order_id).toBe(recent.orderId);
    expect(p1.pending_orders).toBe(2);
    expect(p1.first_name).toBe('Maria');
    expect(list.filter(p => p.phone_keys.includes(keyOf(1))).length).toBe(1);
    expect((await personOf(2))?.exclusion).toBe('PAID');
    expect((await personOf(3))?.exclusion).toBe('PAID');
    expect(await personOf(4)).toBeNull();
    expect(await personOf(5)).toBeNull();
    expect((await personOf(6))?.exclusion).toBe('OFFER_INACTIVE');
    expect(list.some(p => p.email === emailOf(7).toLowerCase())).toBe(false);
    expect((await personOf(18))?.exclusion).toBe('PAID');
    expect((await personOf(19))?.exclusion).toBe('PAID');
    expect((await personOf(20))?.exclusion).toBe('OPTED_OUT');
  });

  it('rotas só para ADMIN; resposta sem telefone; chave desligada mostra a lista e não envia', async () => {
    expect((await request(app).get('/api/whatsapp/recovery').set('Authorization', `Bearer ${operations}`)).status).toBe(403);
    expect((await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${operations}`).send({ ids: [idOf(1)] })).status).toBe(403);

    delete process.env.WHATSAPP_RECOVERY_ENABLED;
    const g = await request(app).get('/api/whatsapp/recovery').set('Authorization', `Bearer ${admin}`);
    expect(g.status).toBe(200);
    expect(g.body.enabled).toBe(false);
    const row = g.body.people.find((p: any) => p.id === idOf(1));
    expect(row).toMatchObject({ first_name: 'Maria', selectable: true });
    expect(row.preview).toContain('Oi, Maria! Aqui é da NORQVA.');
    expect(row.preview).toContain(`/p/${offerCodeActive}?checkout=1`);
    expect(row.preview).not.toMatch(/cpf/i);
    expect(JSON.stringify(g.body)).not.toContain(keyOf(1));
    expect(JSON.stringify(g.body)).not.toContain(phone(1));
    const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ ids: [idOf(1)] });
    expect(s.status).toBe(409);
    expect(await recRow(1)).toBeNull();
    expect((await tick()).outcome).toBe('OFF');
  });

  it('número da marca desconectado ou atendente desligado: nada sai, aviso abre e fecha quando volta', async () => {
    await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = FALSE WHERE id = $1`, [numberId]);
    const hidden = await hideOtherNumbers();
    try {
      const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ ids: [idOf(1)] });
      expect(s.status).toBe(409);
      expect(s.body.error).toMatch(/Nada foi enviado/);
      expect(await openAlerts(RECOVERY_ALERT_RULE)).toBe(1);
      const center = await request(app).get('/api/alerts/center?mode=real').set('Authorization', `Bearer ${admin}`);
      const a = center.body.notifications.find((n: any) => n.rule_code === RECOVERY_ALERT_RULE);
      expect(a.link.section).toBe('whatsapp-recovery');
      expect(a.entity.type).toBe('WHATSAPP');

      // já na fila e o número cai: a fila espera e não envia
      await pool.query(`INSERT INTO whatsapp_recovery_messages (phone_key, offer_id, order_id, status) VALUES ($1, $2, (SELECT order_id FROM order_items WHERE offer_id = $2 ORDER BY created_at DESC LIMIT 1), 'QUEUED')`, [keyOf(1), offerActive]);
      expect((await tick()).outcome).toBe('NUMBER_OFF');
      expect((provider.sendText as any).mock.calls.length).toBe(0);
      expect((await recRow(1)).status).toBe('QUEUED');
      expect(await openAlerts(RECOVERY_ALERT_RULE)).toBe(1);
      await pool.query(`DELETE FROM whatsapp_recovery_messages WHERE phone_key = $1`, [keyOf(1)]);
    } finally {
      await restoreNumbers(hidden);
    }
    // número de volta: a tela fecha o aviso
    await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = TRUE WHERE id = $1`, [numberId]);
    await recoveryOverview(pool, { now: NOON, offerIds });
    expect(await openAlerts(RECOVERY_ALERT_RULE)).toBe(0);
  });

  it('envia uma por vez, só no horário, com espaçamento; grava na conversa sem nome e e-mail no link; uma por pessoa para sempre', async () => {
    const c9 = await customer('Gabi Souza', 9);
    await order(c9, { createdAt: daysAgo(1) });
    const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ ids: [idOf(1), idOf(9), idOf(2), 'zzz'] });
    expect(s.status).toBe(200);
    expect(s.body.queued).toBe(2); // 2 já pagou; 'zzz' é inválido
    expect((await recRow(1)).status).toBe('QUEUED');

    expect((await tick(new Date(NOON.getTime() - 5 * 3600 * 1000))).outcome).toBe('OUTSIDE_HOURS'); // 07h
    expect((await tick(new Date(NOON.getTime() + 9.5 * 3600 * 1000))).outcome).toBe('OUTSIDE_HOURS'); // 21h30
    expect((provider.sendText as any).mock.calls.length).toBe(0);

    const reconcile = vi.fn(async () => null);
    expect((await tick(NOON, { reconcile })).outcome).toBe('SENT');
    expect(reconcile).toHaveBeenCalled();
    expect((provider.sendText as any).mock.calls.length).toBe(1);
    const [, to, text] = (provider.sendText as any).mock.calls[0];
    expect(to).toMatch(/@s\.whatsapp\.net$/);
    expect(text).toMatch(/^Oi, (Maria|Gabi)! Aqui é da NORQVA\./);
    const u = new URL(text.match(/https?:\/\/\S+?(?=\. O acesso)/)[0]);
    expect(u.searchParams.get('checkout')).toBe('1');
    expect(u.searchParams.get('name')).toBeTruthy();
    expect(u.searchParams.get('email')).toMatch(/@example\.com$/);
    expect(u.searchParams.get('utm_medium')).toBe('recuperacao');
    const code = u.searchParams.get('utm_content')!;
    const ref = (await pool.query(`SELECT * FROM whatsapp_refs WHERE code = $1`, [code])).rows[0];
    expect(ref).toMatchObject({ utm_source: 'whatsapp', utm_medium: 'recuperacao', offer_id: offerActive });
    const sentRow = (await pool.query(`SELECT * FROM whatsapp_recovery_messages WHERE status = 'SENT' AND offer_id = $1`, [offerActive])).rows[0];
    expect(sentRow.ref_id).toBe(ref.id);
    expect(sentRow.email_key).toMatch(/@example\.com$/);
    const conv = (await pool.query(`SELECT * FROM whatsapp_conversations WHERE id = $1`, [sentRow.conversation_id])).rows[0];
    expect(conv.mode).toBe('BOT');
    expect(conv.ref_id).toBe(ref.id);
    const msgs = (await pool.query(`SELECT author, body FROM whatsapp_messages WHERE conversation_id = $1`, [conv.id])).rows;
    expect(msgs.length).toBe(1);
    expect(msgs[0].author).toBe('BOT');
    expect(msgs[0].body).toContain(`utm_content=${code}`);
    expect(msgs[0].body).not.toMatch(/name=|email=/);

    expect((await tick(new Date(NOON.getTime() + 60 * 1000))).outcome).toBe('WAIT');
    expect((await tick(new Date(NOON.getTime() + 121 * 1000))).outcome).toBe('SENT');
    expect((await recRow(1)).status).toBe('SENT');
    expect((await recRow(9)).status).toBe('SENT');

    expect((await queue([1, 9])).queued).toBe(0);
    expect(isSelectable((await personOf(1))!)).toBe(false);
    // mesmo e-mail com telefone novo: continua "já recebeu"
    await pool.query(`UPDATE customers SET phone = $2 WHERE id = $1`, [c9, phone(21)]);
    const moved = (await people()).find(p => p.email === emailOf(9).toLowerCase())!;
    expect(moved.phone_key).toBe(keyOf(21));
    expect(isSelectable(moved)).toBe(false);
    await resetSlot();
    expect((await tick(new Date(NOON.getTime() + 600 * 1000))).outcome).toBe('EMPTY');
    const ov = await recoveryOverview(pool, { now: NOON, offerIds });
    expect(ov.history.filter((h: any) => h.status === 'SENT').length).toBe(2);
  });

  it('envio sem confirmação (tempo esgotado/5xx) vira FALHOU, não volta para a fila e aparece sem poder marcar', async () => {
    const c13 = await customer('Olga', 13);
    await order(c13);
    expect((await queue([13])).queued).toBe(1);
    (provider.sendText as any).mockImplementationOnce(async () => { throw new ProviderError('timeout', 504); });
    expect((await tick()).outcome).toBe('FAILED');
    expect(await recRow(13)).toMatchObject({ status: 'FAILED' });
    expect((await queue([13])).queued).toBe(0);
    await resetSlot();
    expect((await tick()).outcome).toBe('EMPTY');
    expect((provider.sendText as any).mock.calls.length).toBe(1);
    const ov = await recoveryOverview(pool, { now: NOON, offerIds });
    const row = ov.people.find((p: any) => p.id === idOf(13));
    expect(row).toMatchObject({ selectable: false, note: 'Falhou — não reenviamos' });
  });

  it('horário conferido de novo na hora do envio: passou das 20h, volta para a fila', async () => {
    const c22 = await customer('Paula', 22);
    await order(c22);
    expect((await queue([22])).queued).toBe(1);
    const r = await tick(NOON, { clock: () => new Date(NOON.getTime() + 8.5 * 3600 * 1000) }); // 20h30
    expect(r.outcome).toBe('OUTSIDE_HOURS');
    expect((provider.sendText as any).mock.calls.length).toBe(0);
    expect((await recRow(22)).status).toBe('QUEUED');
    await resetSlot();
    expect((await tick()).outcome).toBe('SENT');
  });

  it('pagou no meio do caminho (qualquer pedido da pessoa): conferência no Asaas pula a pessoa', async () => {
    const c10 = await customer('Helena', 10);
    const older = await order(c10, { createdAt: daysAgo(4), payStatus: 'EXPIRED' });
    const newer = await order(c10, { createdAt: daysAgo(1) });
    expect((await queue([10])).queued).toBe(1);
    const reconcile = vi.fn(async (pid: string, p: Pool) => {
      if (pid === older.paymentId) await p.query(`UPDATE payments SET status = 'CONFIRMED' WHERE id = $1`, [pid]);
    });
    const r = await tick(NOON, { reconcile });
    expect(reconcile).toHaveBeenCalledWith(older.paymentId, pool);
    expect(reconcile).toHaveBeenCalledWith(newer.paymentId, pool);
    expect(r.outcome).toBe('SKIPPED_ALL');
    expect((provider.sendText as any).mock.calls.length).toBe(0);
    expect(await recRow(10)).toMatchObject({ status: 'SKIPPED', reason: 'PAID' });
    expect((await queue([10])).queued).toBe(0);
  });

  it('sem conferência no Asaas 3 vezes: a pessoa sai desta vez (pode voltar) e a fila não trava', async () => {
    const c14 = await customer('Rita', 14);
    const bad = await order(c14);
    const c15 = await customer('Sara', 15);
    await order(c15);
    expect((await queue([14])).queued).toBe(1);
    expect((await queue([15])).queued).toBe(1);
    const reconcile = vi.fn(async (pid: string) => { if (pid === bad.paymentId) throw new Error('asaas fora'); });
    const r1 = await tick(NOON, { reconcile });
    expect(r1.outcome).toBe('SENT');
    expect((await recRow(15)).status).toBe('SENT');
    expect(await recRow(14)).toMatchObject({ status: 'QUEUED', recheck_failures: 1 });
    for (let i = 0; i < 2; i++) { await resetSlot(); await tick(NOON, { reconcile }); }
    expect(await recRow(14)).toMatchObject({ status: 'SKIPPED', reason: 'RECHECK_FAILED' });
    expect(await openAlerts(RECOVERY_RECHECK_RULE)).toBe(1);
    expect(isSelectable((await personOf(14))!)).toBe(true);
    expect((await queue([14])).queued).toBe(1);
    expect((await recRow(14)).recheck_failures).toBe(0);
    await pool.query(`UPDATE whatsapp_recovery_messages SET status = 'SKIPPED', reason = 'RECHECK_FAILED' WHERE phone_key = $1`, [keyOf(14)]);
  });

  it('pedido mais recente de outro telefone (conversa do WhatsApp): PHONE_CHANGED, pode voltar', async () => {
    const c16 = await customer('Tina', 16);
    await order(c16, { createdAt: daysAgo(3) });
    expect((await queue([16])).queued).toBe(1);
    // pedido novo feito pela conversa do mesmo telefone, mas em outro cadastro com outro telefone
    const conv = (await pool.query(`INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_phone) VALUES ($1, $2, $3) RETURNING id`, [numberId, `55${phone(16)}@s.whatsapp.net`, `55${phone(16)}`])).rows[0].id;
    const c16b = (await pool.query(`INSERT INTO customers (name, email, phone) VALUES ('Tina B', $1, $2) RETURNING id`, [`p16b.0125.${tag}@example.com`, phone(23)])).rows[0].id;
    await order(c16b, { createdAt: daysAgo(1), convId: conv });
    expect((await tick()).outcome).toBe('SKIPPED_ALL');
    expect(await recRow(16)).toMatchObject({ status: 'SKIPPED', reason: 'PHONE_CHANGED' });
    expect((provider.sendText as any).mock.calls.length).toBe(0);
  });

  it('marca sem número: não usa o número de outra marca', async () => {
    const hidden = await hideOtherNumbers();
    try {
      const c24 = await customer('Vera', 24);
      await order(c24, { offerId: offerBrand2, productId: product2 });
      const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ ids: [idOf(24)] });
      expect(s.status).toBe(409);
      await pool.query(`INSERT INTO whatsapp_recovery_messages (phone_key, offer_id, status) VALUES ($1, $2, 'QUEUED')`, [keyOf(24), offerBrand2]);
      await tick();
      expect(await recRow(24)).toMatchObject({ status: 'SKIPPED', reason: 'SEND_BLOCKED:NO_BRAND_NUMBER' });
      expect((provider.sendText as any).mock.calls.length).toBe(0);
    } finally {
      await restoreNumbers(hidden);
    }
  });

  it('envio preso em "Enviando" por mais de 10 minutos: aviso, sem reenviar', async () => {
    await pool.query(`INSERT INTO whatsapp_recovery_messages (phone_key, offer_id, status, attempt_at) VALUES ($1, $2, 'SENDING', $3)`, [keyOf(25), offerActive, new Date(NOON.getTime() - 11 * 60 * 1000).toISOString()]);
    await tick();
    expect(await openAlerts(RECOVERY_STUCK_RULE)).toBe(1);
    expect((await recRow(25)).status).toBe('SENDING');
    expect((provider.sendText as any).mock.calls.length).toBe(0);
  });

  it('idempotente: duas rodadas ao mesmo tempo enviam uma vez só', async () => {
    const c11 = await customer('Igor', 11);
    await order(c11, { createdAt: daysAgo(1) });
    await queue([11]);
    await queue([11]);
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM whatsapp_recovery_messages WHERE phone_key = $1`, [keyOf(11)])).rows[0].n).toBe(1);
    const [a, b] = await Promise.all([tick(), tick()]);
    expect(a.sent + b.sent).toBe(1);
    expect((provider.sendText as any).mock.calls.length).toBe(1);
  });

  it('"Não quero" como primeira resposta (de um jid @lid): sai para sempre, origem herdada e o atendente confirma uma vez', async () => {
    const conv = await sentConv(11);
    expect(conv).toBeTruthy();
    const lidJid = `9${digits}011223@lid`;
    // @lid com o telefone sem o 9 no remoteJidAlt
    const w = await webhook(lidJid, 'Não quero.', { remoteJidAlt: `5531${phone(11).slice(-8)}@s.whatsapp.net` });
    expect(w.status).toBe(200);
    const lid = (await pool.query(`SELECT * FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, lidJid])).rows[0];
    expect(lid.mode).toBe('OPTED_OUT');
    expect(lid.ref_id).toBe(conv.ref_id);
    expect((await pool.query(`SELECT email_key FROM whatsapp_recovery_optouts WHERE phone_key = $1`, [keyOf(11)])).rows[0]).toEqual({ email_key: emailOf(11).toLowerCase() });
    await attendantInboundHandler(pool, numberId, [{ conversationId: lid.id, messageId: 'x', body: 'Não quero.', kind: 'TEXT', optOut: true }]);
    await attendantInboundHandler(pool, numberId, [{ conversationId: lid.id, messageId: 'y', body: 'SAIR', kind: 'TEXT', optOut: true }]);
    expect((provider.sendText as any).mock.calls.map((c: any[]) => c[2])).toEqual([OPT_OUT_ACK_TEXT]);
    const c11 = (await pool.query(`SELECT id FROM customers WHERE email = $1`, [emailOf(11)])).rows[0].id;
    await order(c11, { createdAt: daysAgo(0.1) });
    expect((await personOf(11))?.exclusion).toBe('OPTED_OUT');
  });

  it('"Não, obrigado" mais tarde na conversa (depois do atendente) não é pedido para parar; SAIR explícito é', async () => {
    const c17 = await customer('Ugo', 17);
    await order(c17);
    const conv = await sendTo(17);
    await webhook(conv.contact_jid, 'Quanto custa o kit?');
    await recordOutgoing(pool, conv.id, 'BOT', 'O kit sai por R$ 29,90. Quer levar também o Dolci?', `B-${crypto.randomUUID()}`);
    await webhook(conv.contact_jid, 'Não, obrigado');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE id = $1`, [conv.id])).rows[0].mode).toBe('BOT');
    expect((await pool.query(`SELECT 1 FROM whatsapp_recovery_optouts WHERE phone_key = $1`, [keyOf(17)])).rows.length).toBe(0);
    await webhook(conv.contact_jid, 'Sair!');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE id = $1`, [conv.id])).rows[0].mode).toBe('OPTED_OUT');
    expect((await pool.query(`SELECT 1 FROM whatsapp_recovery_optouts WHERE phone_key = $1`, [keyOf(17)])).rows.length).toBe(1);
  });

  it('conversa sem recuperação: "não quero" segue normal; o "parar" de sempre continua valendo e tira da recuperação', async () => {
    const jid = `55${phone(12)}@s.whatsapp.net`;
    await webhook(jid, 'não quero');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, jid])).rows[0].mode).toBe('BOT');
    // fora da recuperação a regra de sempre não muda (não ficou mais larga)
    await webhook(jid, 'sair 🙏');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, jid])).rows[0].mode).toBe('BOT');
    await webhook(jid, 'PARAR!');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, jid])).rows[0].mode).toBe('OPTED_OUT');
    const c12 = await customer('Julia', 12);
    await order(c12, { createdAt: daysAgo(1) });
    expect((await personOf(12))?.exclusion).toBe('OPTED_OUT');
    expect((await queue([12])).queued).toBe(0);
  });

  it('conversa com uma pessoa da equipe (por telefone, em qualquer forma de jid): pulada e pode voltar', async () => {
    const c26 = await customer('Xica', 26);
    await order(c26);
    expect((await queue([26])).queued).toBe(1);
    await pool.query(`INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_phone, mode) VALUES ($1, $2, $3, 'HUMAN')`, [numberId, `8${digits}026@lid`, `5531${phone(26).slice(-8)}`]);
    await tick();
    expect(await recRow(26)).toMatchObject({ status: 'SKIPPED', reason: 'HUMAN_CONVERSATION' });
    expect((await queue([26])).queued).toBe(1);
  });
});
