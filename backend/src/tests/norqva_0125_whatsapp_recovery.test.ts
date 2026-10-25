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
import {
  phoneKey, cleanFirstName, recoveryText, recoveryLink, withinRecoveryHours, nextGapSeconds, isOptOutText, isRecoveryRefusal,
  computeRecoveryPeople, isSelectable, runRecoveryQueue, queueRecovery, recoveryOverview, OPT_OUT_ACK_TEXT, RECOVERY_ALERT_RULE
} from '../services/whatsapp/paymentRecovery';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_32_byte_key_for_testing_123';

describe('NORQVA-0125 — regras puras', () => {
  it('telefone normalizado: com ou sem 55, com ou sem o 9 da frente', () => {
    expect(phoneKey('(31) 98585-5642')).toBe('553185855642');
    expect(phoneKey('5531985855642')).toBe('553185855642');
    expect(phoneKey('553185855642@s.whatsapp.net')).toBe('553185855642');
    expect(phoneKey('3185855642')).toBe('553185855642');
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it('primeiro nome limpo e texto fixo do contrato', () => {
    expect(cleanFirstName('  maria   da silva')).toBe('Maria');
    expect(cleanFirstName('JOÃO')).toBe('João');
    expect(cleanFirstName('<script>')).toBe('Script');
    expect(cleanFirstName('1234')).toBeNull();
    expect(cleanFirstName('')).toBeNull();
    const link = 'https://acesso.norqva.com.br/p/OFF-1?checkout=1';
    expect(recoveryText('Maria', 'Kit Trattoria Completo', link)).toBe(
      `Oi, Maria! Aqui é da NORQVA. Vi que você começou a compra do Kit Trattoria Completo e o pagamento não chegou a ser concluído. Se ainda quiser, é só usar este link: ${link}. O acesso chega no seu e-mail logo depois do pagamento. Se tiver alguma dúvida, me responde aqui. Se não quiser mais receber mensagens, é só responder SAIR.`
    );
    expect(recoveryText(null, 'Kit', link)).toMatch(/^Oi, tudo bem\? Aqui é da NORQVA\./);
  });

  it('link com pagamento direto, nome, e-mail e origem; sem CPF', () => {
    const url = new URL(recoveryLink('https://acesso.norqva.com.br/', 'OFF-000005', 'Maria Silva', 'Maria@Example.com', 'ABC234'));
    expect(url.origin + url.pathname).toBe('https://acesso.norqva.com.br/p/OFF-000005');
    expect(url.searchParams.get('checkout')).toBe('1');
    expect(url.searchParams.get('name')).toBe('Maria Silva');
    expect(url.searchParams.get('email')).toBe('maria@example.com');
    expect(url.searchParams.get('utm_source')).toBe('whatsapp');
    expect(url.searchParams.get('utm_medium')).toBe('recuperacao');
    expect(url.searchParams.get('utm_content')).toBe('ABC234');
    expect([...url.searchParams.keys()].some(k => /cpf|document/i.test(k))).toBe(false);
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

  it('SAIR, parar e não quero (com acento, maiúsculas e pontuação)', () => {
    expect(isOptOutText('SAIR')).toBe(true);
    expect(isOptOutText('Parar!!')).toBe(true);
    expect(isOptOutText('Não quero mais 🙏')).toBe(true);
    expect(isOptOutText('não quero')).toBe(false);
    expect(isRecoveryRefusal('Não quero.')).toBe(true);
    expect(isRecoveryRefusal('nao tenho interesse')).toBe(true);
    expect(isRecoveryRefusal('não quero cartão, quero Pix')).toBe(false);
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
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const offerActive = crypto.randomUUID();
  const offerOff = crypto.randomUUID();
  const offerCodeActive = `OFF-R${tag}`;
  const offerCodeOff = `OFF-Q${tag}`;
  const offerIds = [offerActive, offerOff];
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
      [name, email || `p${i}.0125.${tag}@example.com`, phone(i)]
    );
    return r.rows[0].id as string;
  }
  async function order(customerId: string, opts: { offerId?: string; status?: string; createdAt?: string; provenance?: string; isDemo?: boolean; payStatus?: string } = {}) {
    seq++;
    const created = opts.createdAt || daysAgo(1);
    const o = await pool.query(
      `INSERT INTO orders (customer_id, total_amount, status, is_demo, data_provenance, idempotency_key, created_at, updated_at)
       VALUES ($1, 29.90, $2, $3, $4, $5, $6, $6) RETURNING id`,
      [customerId, opts.status || 'PENDING', opts.isDemo || false, opts.provenance || 'COMMERCIAL_PRODUCTION', `idem-0125-${tag}-${seq}`, created]
    );
    const orderId = o.rows[0].id as string;
    await pool.query(
      `INSERT INTO order_items (order_id, offer_id, product_id, product_name_snapshot, offer_name_snapshot, unit_price, quantity, total_price, created_at)
       VALUES ($1, $2, $3, 'Coleção 0125', 'Kit 0125', 29.90, 1, 29.90, $4)`,
      [orderId, opts.offerId || offerActive, productId, created]
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
    await pool.query(`INSERT INTO brands (id, code, name) VALUES ($1, $2, 'Cozinha 0125')`, [brandId, `B25${tag}`]);
    await pool.query(
      `INSERT INTO products (id, human_id, name, category, description, status, is_demo, data_provenance, brand_id) VALUES ($1, $2, 'Coleção 0125', 'Receitas', 'Cinco livros', 'PLANEJADO', false, 'COMMERCIAL_PRODUCTION', $3)`,
      [productId, `PRD-R${tag}`, brandId]
    );
    await pool.query(
      `INSERT INTO offers (id, human_id, name, product_id, price, promotional_price, status, description, is_demo, data_provenance)
       VALUES ($1, $2, 'Kit Trattoria Completo', $3, 49.90, 29.90, 'ATIVA', '5 livros digitais', false, 'COMMERCIAL_PRODUCTION'),
              ($4, $5, 'Bolso Blindado', $3, 49.90, 29.90, 'PAUSADA', 'Descontinuado', false, 'COMMERCIAL_PRODUCTION')`,
      [offerActive, offerCodeActive, productId, offerOff, offerCodeOff]
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
    await q('DELETE FROM whatsapp_recovery_messages WHERE offer_id = ANY($1::uuid[]) OR order_id = ANY($2::uuid[])', [offerIds, orders]);
    await q(`DELETE FROM whatsapp_recovery_optouts WHERE phone_key LIKE $1`, [`5531${digits}%`]);
    await q('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM order_items WHERE order_id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM orders WHERE id = ANY($1::uuid[])', [orders]);
    await q('DELETE FROM whatsapp_refs WHERE number_id = $1', [numberId]);
    await q('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]);
    await q('DELETE FROM customers WHERE id = ANY($1::uuid[])', [custs]);
    await q('DELETE FROM offers WHERE id = ANY($1::uuid[])', [offerIds]);
    await q('DELETE FROM products WHERE id = $1', [productId]);
    await q('DELETE FROM brands WHERE id = $1', [brandId]);
    await q(`DELETE FROM ad_alerts WHERE rule_code = $1`, [RECOVERY_ALERT_RULE]);
    await resetSlot().catch(() => {});
  });

  beforeEach(async () => {
    resetAllRateLimits();
    resetAttendantMemoryForTests();
    (provider.sendText as any).mockClear();
    process.env.WHATSAPP_RECOVERY_ENABLED = 'true';
    await resetSlot();
    await pool.query(`UPDATE whatsapp_numbers SET status = 'CONNECTED', bot_enabled = TRUE WHERE id = $1`, [numberId]);
  });

  it('regras de quem entra: pagou depois, teste, mais de 30 dias, oferta fora do ar, sem telefone, duplicados', async () => {
    // 1: elegível, com dois pedidos pendentes (vira uma pessoa, pedido mais recente)
    const c1 = await customer('maria silva', 1);
    await order(c1, { createdAt: daysAgo(5) });
    const recent = await order(c1, { createdAt: daysAgo(1) });
    // 2: pagou depois com o mesmo e-mail (outro cadastro? mesmo e-mail é o mesmo cliente): pedido pago fica de fora
    const c2 = await customer('Ana', 2);
    await order(c2, { createdAt: daysAgo(3) });
    await order(c2, { createdAt: daysAgo(2), status: 'PAID' });
    // 3: pagou com outro e-mail, mesmo telefone
    const c3 = await customer('Bruno', 3);
    await order(c3, { createdAt: daysAgo(3) });
    const c3b = (await pool.query(`INSERT INTO customers (name, email, phone) VALUES ('Bruno B', $1, $2) RETURNING id`, [`p3b.0125.${tag}@example.com`, `+55 ${phone(3)}`])).rows[0].id;
    await order(c3b, { createdAt: daysAgo(10), status: 'PAID' });
    // 4: pedido de teste (provenance)
    const c4 = await customer('Carla', 4);
    await order(c4, { provenance: 'STAGING_SANDBOX_QA' });
    // 5: mais de 30 dias
    const c5 = await customer('Davi', 5);
    await order(c5, { createdAt: daysAgo(31) });
    // 6: oferta descontinuada
    const c6 = await customer('Eva', 6);
    await order(c6, { offerId: offerOff });
    // 7: sem telefone
    const c7 = (await pool.query(`INSERT INTO customers (name, email, phone) VALUES ('Fabio', $1, NULL) RETURNING id`, [`p7.0125.${tag}@example.com`])).rows[0].id;
    await order(c7);
    // 8: mesmo e-mail que o 1 com outro telefone: mesma pessoa
    // (customers.email é único: usa o telefone de outro cadastro na conversa do WhatsApp)

    const list = await people();
    const p1 = list.find(p => p.phone_keys.includes(keyOf(1)))!;
    expect(p1).toBeTruthy();
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
    expect(list.some(p => p.email === `p7.0125.${tag}@example.com`)).toBe(false);
  });

  it('rotas só para ADMIN; chave desligada mostra a lista e não envia', async () => {
    const ops = await request(app).get('/api/whatsapp/recovery').set('Authorization', `Bearer ${operations}`);
    expect(ops.status).toBe(403);
    expect((await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${operations}`).send({ phone_keys: [keyOf(1)] })).status).toBe(403);

    delete process.env.WHATSAPP_RECOVERY_ENABLED;
    const g = await request(app).get('/api/whatsapp/recovery').set('Authorization', `Bearer ${admin}`);
    expect(g.status).toBe(200);
    expect(g.body.enabled).toBe(false);
    const row = g.body.people.find((p: any) => p.phone_masked.endsWith(keyOf(1).slice(-4)) && p.first_name === 'Maria');
    expect(row).toBeTruthy();
    expect(row.preview).toContain('Oi, Maria! Aqui é da NORQVA.');
    expect(row.preview).toContain(`/p/${offerCodeActive}?checkout=1`);
    expect(row.preview).not.toMatch(/cpf/i);
    expect(JSON.stringify(g.body)).not.toContain(phone(1));
    const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ phone_keys: [keyOf(1)] });
    expect(s.status).toBe(409);
    expect(await recRow(1)).toBeNull();
    expect((await tick()).outcome).toBe('OFF');
  });

  it('número desconectado ou atendente desligado: nada sai e abre aviso', async () => {
    await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = FALSE WHERE id = $1`, [numberId]);
    // outros números conectados de outros testes não podem existir para este caso: desliga todos temporariamente
    const others = (await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = FALSE WHERE id <> $1 AND bot_enabled = TRUE AND is_deleted = FALSE RETURNING id`, [numberId])).rows.map((r: any) => r.id);
    try {
      const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ phone_keys: [keyOf(1)] });
      expect(s.status).toBe(409);
      expect(s.body.error).toMatch(/Nada foi enviado/);
      const alerts = (await pool.query(`SELECT * FROM ad_alerts WHERE rule_code = $1 AND status = 'OPEN'`, [RECOVERY_ALERT_RULE])).rows;
      expect(alerts.length).toBe(1);

      // já na fila e o número cai: a fila espera e não envia
      await pool.query(
        `INSERT INTO whatsapp_recovery_messages (phone_key, offer_id, status) VALUES ($1, $2, 'QUEUED')`,
        [keyOf(1), offerActive]
      );
      expect((await tick()).outcome).toBe('NUMBER_OFF');
      expect((provider.sendText as any).mock.calls.length).toBe(0);
      expect((await recRow(1)).status).toBe('QUEUED');
      // aviso não duplica
      expect((await pool.query(`SELECT COUNT(*)::int AS n FROM ad_alerts WHERE rule_code = $1 AND status = 'OPEN'`, [RECOVERY_ALERT_RULE])).rows[0].n).toBe(1);
      await pool.query(`DELETE FROM whatsapp_recovery_messages WHERE phone_key = $1`, [keyOf(1)]);
    } finally {
      if (others.length) await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = TRUE WHERE id = ANY($1::uuid[])`, [others]);
    }
  });

  it('envia uma por vez, só no horário, com espaçamento; grava na conversa e a origem; uma por pessoa para sempre', async () => {
    const c9 = await customer('Gabi Souza', 9);
    await order(c9, { createdAt: daysAgo(1) });
    const s = await request(app).post('/api/whatsapp/recovery/send').set('Authorization', `Bearer ${admin}`).send({ phone_keys: [keyOf(1), keyOf(9), keyOf(2), '123'] });
    expect(s.status).toBe(200);
    expect(s.body.queued).toBe(2); // 2 já pagou; '123' é inválido
    expect((await recRow(1)).status).toBe('QUEUED');

    // fora do horário: espera (07h e 21h em Brasília)
    expect((await tick(new Date(NOON.getTime() - 5 * 3600 * 1000))).outcome).toBe('OUTSIDE_HOURS'); // 07h
    expect((await tick(new Date(NOON.getTime() + 9.5 * 3600 * 1000))).outcome).toBe('OUTSIDE_HOURS'); // 21h30
    expect((provider.sendText as any).mock.calls.length).toBe(0);

    const reconcile = vi.fn(async () => null);
    const r1 = await tick(NOON, { reconcile });
    expect(r1.outcome).toBe('SENT');
    expect(reconcile).toHaveBeenCalled();
    expect((provider.sendText as any).mock.calls.length).toBe(1);
    const [, to, text] = (provider.sendText as any).mock.calls[0];
    expect(to).toMatch(/@s\.whatsapp\.net$/);
    expect(text).toMatch(/^Oi, (Maria|Gabi)! Aqui é da NORQVA\./);
    const link = text.match(/https?:\/\/\S+?(?=\. O acesso)/)[0];
    const u = new URL(link);
    expect(u.searchParams.get('checkout')).toBe('1');
    expect(u.searchParams.get('utm_medium')).toBe('recuperacao');
    const code = u.searchParams.get('utm_content')!;
    const ref = (await pool.query(`SELECT * FROM whatsapp_refs WHERE code = $1`, [code])).rows[0];
    expect(ref).toMatchObject({ utm_source: 'whatsapp', utm_medium: 'recuperacao', offer_id: offerActive });
    const sentRow = (await pool.query(`SELECT * FROM whatsapp_recovery_messages WHERE status = 'SENT' AND offer_id = $1`, [offerActive])).rows[0];
    expect(sentRow.ref_id).toBe(ref.id);
    const conv = (await pool.query(`SELECT * FROM whatsapp_conversations WHERE id = $1`, [sentRow.conversation_id])).rows[0];
    expect(conv.mode).toBe('BOT');
    expect(conv.ref_id).toBe(ref.id);
    const msgs = (await pool.query(`SELECT author, body FROM whatsapp_messages WHERE conversation_id = $1`, [conv.id])).rows;
    expect(msgs).toEqual([expect.objectContaining({ author: 'BOT', body: text })]);

    // próxima só depois de 2 a 4 minutos
    expect((await tick(new Date(NOON.getTime() + 60 * 1000))).outcome).toBe('WAIT');
    const r2 = await tick(new Date(NOON.getTime() + 121 * 1000));
    expect(r2.outcome).toBe('SENT');
    expect((provider.sendText as any).mock.calls.length).toBe(2);
    expect((await recRow(1)).status).toBe('SENT');
    expect((await recRow(9)).status).toBe('SENT');

    // nunca mais: não aparece para envio e mandar de novo não põe na fila
    const again = await queueRecovery(pool, { phone_keys: [keyOf(1), keyOf(9)] }, null, { now: NOON, offerIds });
    expect(again.queued).toBe(0);
    expect(isSelectable((await personOf(1))!)).toBe(false);
    await resetSlot();
    expect((await tick(new Date(NOON.getTime() + 600 * 1000))).outcome).toBe('EMPTY');
    // aviso da central resolvido quando voltou a enviar
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM ad_alerts WHERE rule_code = $1 AND status = 'OPEN'`, [RECOVERY_ALERT_RULE])).rows[0].n).toBe(0);
    const ov = await recoveryOverview(pool, { now: NOON, offerIds });
    expect(ov.history.filter((h: any) => h.status === 'SENT').length).toBe(2);
  });

  it('pagou no meio do caminho: conferência antes do envio pula a pessoa', async () => {
    const c10 = await customer('Helena', 10);
    const { paymentId } = await order(c10, { createdAt: daysAgo(1) });
    expect((await queueRecovery(pool, { phone_keys: [keyOf(10)] }, null, { now: NOON, offerIds })).queued).toBe(1);
    const paid = vi.fn(async (pid: string, p: Pool) => {
      await p.query(`UPDATE payments SET status = 'CONFIRMED' WHERE id = $1`, [pid]);
      await p.query(`UPDATE orders SET status = 'PAID' WHERE id = (SELECT order_id FROM payments WHERE id = $1)`, [pid]);
    });
    const r = await tick(NOON, { reconcile: paid });
    expect(paid).toHaveBeenCalledWith(paymentId, pool);
    expect(r.outcome).toBe('SKIPPED_ALL');
    expect((provider.sendText as any).mock.calls.length).toBe(0);
    expect(await recRow(10)).toMatchObject({ status: 'SKIPPED', reason: 'PAID' });
  });

  it('idempotente: duas rodadas ao mesmo tempo enviam uma vez só', async () => {
    const c11 = await customer('Igor', 11);
    await order(c11, { createdAt: daysAgo(1) });
    await queueRecovery(pool, { phone_keys: [keyOf(11)] }, null, { now: NOON, offerIds });
    await queueRecovery(pool, { phone_keys: [keyOf(11)] }, null, { now: NOON, offerIds });
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM whatsapp_recovery_messages WHERE phone_key = $1`, [keyOf(11)])).rows[0].n).toBe(1);
    const [a, b] = await Promise.all([tick(), tick()]);
    expect([a.sent, b.sent].reduce((x, y) => x + y, 0)).toBe(1);
    expect((provider.sendText as any).mock.calls.length).toBe(1);
  });

  it('responder SAIR: pede para parar, o atendente confirma uma vez e a pessoa sai da lista para sempre', async () => {
    const sentRow = (await pool.query(`SELECT * FROM whatsapp_recovery_messages WHERE phone_key = $1`, [keyOf(11)])).rows[0];
    expect(sentRow.status).toBe('SENT');
    const conv = (await pool.query(`SELECT * FROM whatsapp_conversations WHERE id = $1`, [sentRow.conversation_id])).rows[0];
    (provider.sendText as any).mockClear();
    const w = await request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: conv.contact_jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Igor', message: { conversation: 'Não quero.' } }
    });
    expect(w.status).toBe(200);
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE id = $1`, [conv.id])).rows[0].mode).toBe('OPTED_OUT');
    expect((await pool.query(`SELECT 1 FROM whatsapp_recovery_optouts WHERE phone_key = $1`, [keyOf(11)])).rows.length).toBe(1);
    // a confirmação curta (o webhook nos testes não chama o atendente: chama direto)
    await attendantInboundHandler(pool, numberId, [{ conversationId: conv.id, messageId: 'x', body: 'Não quero.', kind: 'TEXT', optOut: true }]);
    await attendantInboundHandler(pool, numberId, [{ conversationId: conv.id, messageId: 'y', body: 'SAIR', kind: 'TEXT', optOut: true }]);
    const calls = (provider.sendText as any).mock.calls.map((c: any[]) => c[2]);
    expect(calls).toEqual([OPT_OUT_ACK_TEXT]);

    // novo pedido não pago da mesma pessoa: fica de fora (pediu para parar)
    const c11 = (await pool.query(`SELECT id FROM customers WHERE email = $1`, [`p11.0125.${tag}@example.com`])).rows[0].id;
    await order(c11, { createdAt: daysAgo(0.1) });
    expect((await personOf(11))?.exclusion).toBe('OPTED_OUT');
  });

  it('quem pediu para parar antes (em qualquer conversa) não entra; "não quero" fora da recuperação não é parar', async () => {
    const jid = `55${phone(12)}@s.whatsapp.net`;
    const send = (text: string) => request(app).post(new URL(secretUrl).pathname).send({
      event: 'messages.upsert',
      data: { key: { remoteJid: jid, fromMe: false, id: `M-${crypto.randomUUID()}` }, pushName: 'Julia', message: { conversation: text } }
    });
    await send('não quero');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, jid])).rows[0].mode).toBe('BOT');
    await send('PARAR!');
    expect((await pool.query(`SELECT mode FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid = $2`, [numberId, jid])).rows[0].mode).toBe('OPTED_OUT');
    const c12 = await customer('Julia', 12);
    await order(c12, { createdAt: daysAgo(1) });
    expect((await personOf(12))?.exclusion).toBe('OPTED_OUT');
    expect((await queueRecovery(pool, { phone_keys: [keyOf(12)] }, null, { now: NOON, offerIds })).queued).toBe(0);
  });
});
