// NORQVA-0046 etapa 1: números (até 100), conexão por QR Code, troca, webhook e conversas.
// O servidor do WhatsApp é sempre simulado (nada sai para a internet).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import crypto from 'crypto';
import app from '../index';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { signSupabaseToken } from '../utils/token';
import { setWhatsAppProviderForTests, WhatsAppProvider, ProviderError } from '../services/whatsapp/provider';
import { MAX_WHATSAPP_NUMBERS, purgeOldWhatsAppMessages } from '../services/whatsapp/whatsappService';

function fakeProvider() {
  const created = new Set<string>();
  const hooks: Record<string, string> = {};
  const p = {
    createInstance: vi.fn(async (name: string, url: string) => { created.add(name); hooks[name] = url; return { base64: 'QRBASE64', state: 'connecting' as const }; }),
    connect: vi.fn(async () => ({ base64: 'QRBASE64-2', state: 'connecting' as const })),
    info: vi.fn(async (name: string) => {
      if (!created.has(name)) throw new ProviderError('nao existe', 404);
      return { state: 'connecting' as const, phone: null, profileName: null };
    }),
    logout: vi.fn(async () => {}),
    deleteInstance: vi.fn(async () => {}),
    setWebhook: vi.fn(async (name: string, url: string) => { hooks[name] = url; }),
    sendText: vi.fn(async () => ({ id: `SENT-${crypto.randomUUID()}` })),
    sendImage: vi.fn(async () => ({ id: null }))
  };
  return { p: p as unknown as WhatsAppProvider & typeof p, hooks };
}

describe.sequential('NORQVA-0046 — WhatsApp etapa 1', () => {
  let pool: Pool;
  let admin: string;
  let ops: string;
  const fake = fakeProvider();
  let numberId = '';
  let instance = '';

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const hookPath = () => new URL(fake.hooks[instance]).pathname;

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
    admin = await mk('admin.norqva0046@norqva.test', 'ADMIN');
    ops = await mk('ops.norqva0046@norqva.test', 'OPERATIONS');
    setWhatsAppProviderForTests(fake.p);
  });

  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    if (!pool) return;
    await pool.query(`DELETE FROM whatsapp_numbers WHERE label LIKE 'T0046%'`).catch(() => {});
  });

  it('cadastra o número com o atendente desligado; só ADMIN cadastra', async () => {
    const denied = await request(app).post('/api/whatsapp/numbers').set(auth(ops)).send({ label: 'T0046 Trattoria' });
    expect(denied.status).toBe(403);
    const r = await request(app).post('/api/whatsapp/numbers').set(auth(admin)).send({ label: 'T0046 Trattoria' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ label: 'T0046 Trattoria', status: 'NEW', bot_enabled: false });
    numberId = r.body.id;
    instance = (await pool.query('SELECT instance_name FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0].instance_name;
    const list = await request(app).get('/api/whatsapp/numbers').set(auth(ops));
    expect(list.status).toBe(200);
    expect(list.body.max).toBe(100);
    expect(list.body.server_configured).toBe(true);
    expect(list.body.numbers.some((n: any) => n.id === numberId)).toBe(true);
  });

  it('não passa de 100 números', async () => {
    const c = (await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_numbers WHERE is_deleted = FALSE')).rows[0].n;
    const extra = MAX_WHATSAPP_NUMBERS - c;
    for (let i = 0; i < extra; i++) {
      await pool.query(`INSERT INTO whatsapp_numbers (label, instance_name, webhook_secret_hash) VALUES ($1, $2, 'x')`, [`T0046 extra ${i}`, `t0046-${crypto.randomUUID().slice(0, 12)}`]);
    }
    const r = await request(app).post('/api/whatsapp/numbers').set(auth(admin)).send({ label: 'T0046 101' });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/100/);
    await pool.query(`DELETE FROM whatsapp_numbers WHERE label LIKE 'T0046 extra %'`);
  });

  it('conectar cria a instância com webhook e devolve o QR Code', async () => {
    const r = await request(app).post(`/api/whatsapp/numbers/${numberId}/connect`).set(auth(admin));
    expect(r.status).toBe(200);
    expect(r.body.qr_base64).toBe('QRBASE64');
    expect(r.body.number.status).toBe('CONNECTING');
    expect(fake.p.createInstance).toHaveBeenCalledTimes(1);
    expect(hookPath()).toMatch(new RegExp(`^/api/whatsapp/webhook/${numberId}/[0-9a-f]{48}$`));
  });

  it('webhook com segredo errado é recusado', async () => {
    const r = await request(app).post(`/api/whatsapp/webhook/${numberId}/errado`).send({ event: 'connection.update', data: { state: 'open' } });
    expect(r.status).toBe(404);
    const st = (await pool.query('SELECT status FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0].status;
    expect(st).toBe('CONNECTING');
  });

  it('conexão aberta grava o número do celular', async () => {
    const r = await request(app).post(hookPath()).send({ event: 'connection.update', instance, data: { state: 'open', wuid: '5511988887777@s.whatsapp.net', profileName: 'Trattoria' } });
    expect(r.status).toBe(200);
    const n = (await pool.query('SELECT status, phone FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0];
    expect(n).toEqual({ status: 'CONNECTED', phone: '5511988887777' });
  });

  it('mensagem do cliente vira conversa; repetida não duplica; grupo é ignorado', async () => {
    const msg = {
      event: 'messages.upsert',
      instance,
      data: { key: { remoteJid: '5521977776666@s.whatsapp.net', fromMe: false, id: 'MSG-1' }, pushName: 'Maria', message: { conversation: 'Oi, quanto custa o kit?' }, messageTimestamp: Math.floor(Date.now() / 1000) }
    };
    expect((await request(app).post(hookPath()).send(msg)).status).toBe(200);
    expect((await request(app).post(hookPath()).send(msg)).status).toBe(200);
    await request(app).post(hookPath()).send({ event: 'messages.upsert', data: { key: { remoteJid: '1203630@g.us', fromMe: false, id: 'G-1' }, message: { conversation: 'grupo' } } });
    const list = await request(app).get('/api/whatsapp/conversations').set(auth(ops)).query({ number_id: numberId });
    expect(list.status).toBe(200);
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0]).toMatchObject({ contact_name: 'Maria', contact_phone: '5521977776666', unread_count: 1, mode: 'BOT' });
    const conv = list.body.conversations[0].id;
    const msgs = await request(app).get(`/api/whatsapp/conversations/${conv}/messages`).set(auth(ops));
    expect(msgs.body.messages).toHaveLength(1);
    expect(msgs.body.messages[0]).toMatchObject({ direction: 'IN', author: 'CUSTOMER', body: 'Oi, quanto custa o kit?' });
  });

  it('operador responde pelo NORQVA e assume a conversa', async () => {
    const conv = (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1', [numberId])).rows[0].id;
    const r = await request(app).post(`/api/whatsapp/conversations/${conv}/messages`).set(auth(ops)).send({ text: 'Olá Maria! O kit sai por R$ 27,90 no Pix.' });
    expect(r.status).toBe(200);
    expect(fake.p.sendText).toHaveBeenCalledWith(instance, '5521977776666@s.whatsapp.net', 'Olá Maria! O kit sai por R$ 27,90 no Pix.');
    const c = (await pool.query('SELECT mode FROM whatsapp_conversations WHERE id = $1', [conv])).rows[0];
    expect(c.mode).toBe('HUMAN');
    const back = await request(app).post(`/api/whatsapp/conversations/${conv}/mode`).set(auth(ops)).send({ mode: 'BOT' });
    expect(back.status).toBe(200);
  });

  it('"parar" bloqueia novas mensagens para o cliente', async () => {
    await request(app).post(hookPath()).send({ event: 'messages.upsert', data: { key: { remoteJid: '5521977776666@s.whatsapp.net', fromMe: false, id: 'MSG-2' }, message: { conversation: 'Parar' } } });
    const conv = (await pool.query('SELECT id, mode FROM whatsapp_conversations WHERE number_id = $1', [numberId])).rows[0];
    expect(conv.mode).toBe('OPTED_OUT');
    const r = await request(app).post(`/api/whatsapp/conversations/${conv.id}/messages`).set(auth(ops)).send({ text: 'oi' });
    expect(r.status).toBe(409);
  });

  it('trocar número desconecta o aparelho e mostra QR novo, mantendo as conversas', async () => {
    const r = await request(app).post(`/api/whatsapp/numbers/${numberId}/swap`).set(auth(admin));
    expect(r.status).toBe(200);
    expect(fake.p.logout).toHaveBeenCalledWith(instance);
    expect(r.body.qr_base64).toBe('QRBASE64-2');
    expect(r.body.number.phone).toBeNull();
    const c = (await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_conversations WHERE number_id = $1', [numberId])).rows[0].n;
    expect(c).toBe(1);
  });

  it('banimento aparece no número', async () => {
    await request(app).post(hookPath()).send({ event: 'connection.update', data: { state: 'close', statusReason: 403 } });
    const n = (await pool.query('SELECT status, status_reason FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0];
    expect(n.status).toBe('BANNED');
  });

  it('retenção apaga mensagens com mais de 180 dias', async () => {
    const conv = (await pool.query('SELECT id FROM whatsapp_conversations WHERE number_id = $1', [numberId])).rows[0].id;
    await pool.query(`INSERT INTO whatsapp_messages (conversation_id, direction, author, body, created_at) VALUES ($1, 'IN', 'CUSTOMER', 'antiga', NOW() - INTERVAL '181 days')`, [conv]);
    await purgeOldWhatsAppMessages(pool);
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM whatsapp_messages WHERE conversation_id = $1 AND body = 'antiga'`, [conv])).rows[0].n;
    expect(n).toBe(0);
  });

  it('excluir remove do servidor e da lista', async () => {
    const r = await request(app).delete(`/api/whatsapp/numbers/${numberId}`).set(auth(admin));
    expect(r.status).toBe(200);
    expect(fake.p.deleteInstance).toHaveBeenCalledWith(instance);
    const list = await request(app).get('/api/whatsapp/numbers').set(auth(admin));
    expect(list.body.numbers.some((n: any) => n.id === numberId)).toBe(false);
  });
});
