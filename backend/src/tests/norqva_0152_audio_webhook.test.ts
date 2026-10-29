// NORQVA-0152: o áudio vem junto com o webhook da Evolution (sem a Evolution guardar mensagens). WhatsApp e OpenAI simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { setWhatsAppProviderForTests, WhatsAppProvider } from '../services/whatsapp/provider';
import { handleWebhook, ensureMediaWebhook } from '../services/whatsapp/whatsappService';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests } from '../services/whatsapp/attendant';
import { setVoiceForTests, clearInboundAudioForTests } from '../services/whatsapp/voice';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe.sequential('NORQVA-0152 — áudio pelo webhook', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6);
  const secret = crypto.randomBytes(24).toString('hex');
  let numberId = '';
  const setWebhook = vi.fn(async () => {});
  const getMediaBase64 = vi.fn(async () => null);
  const sendText = vi.fn(async () => ({ id: `W-${crypto.randomUUID()}` }));
  const sendAudio = vi.fn(async () => ({ id: `A-${crypto.randomUUID()}` }));
  const provider = {
    createInstance: vi.fn(), connect: vi.fn(), info: vi.fn(), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook,
    sendText, sendImage: vi.fn(async () => ({ id: 'I' })), sendAudio, getMediaBase64
  } as unknown as WhatsAppProvider;
  const transcribe = vi.fn(async () => 'quero o kit');

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const n = await pool.query(
      `INSERT INTO whatsapp_numbers (label, instance_name, webhook_secret_hash, status, phone, bot_enabled) VALUES ('T0152', $1, $2, 'CONNECTED', '5511900000152', TRUE) RETURNING id`,
      [`t152-${tag}`, sha(secret)]
    );
    numberId = n.rows[0].id;
  });
  afterAll(async () => {
    setWhatsAppProviderForTests(null);
    setAttendantAiForTests(null);
    setVoiceForTests(null);
    delete process.env.WHATSAPP_AUDIO_ENABLED;
    if (!pool) return;
    await pool.query('DELETE FROM whatsapp_messages WHERE conversation_id IN (SELECT id FROM whatsapp_conversations WHERE number_id = $1)', [numberId]).catch(() => {});
    await pool.query('DELETE FROM whatsapp_conversations WHERE number_id = $1', [numberId]).catch(() => {});
    await pool.query('DELETE FROM whatsapp_numbers WHERE id = $1', [numberId]).catch(() => {});
  });
  beforeEach(() => {
    process.env.WHATSAPP_AUDIO_ENABLED = 'true';
    resetAttendantMemoryForTests();
    clearInboundAudioForTests();
    for (const f of [setWebhook, getMediaBase64, sendText, sendAudio, transcribe]) f.mockClear();
    setWhatsAppProviderForTests(provider);
    setVoiceForTests({ transcribe, speak: async () => Buffer.from('voz') });
    setAttendantAiForTests((async () => ({ content: 'Claro!', tool_calls: [] })) as any);
  });

  it('áudio do webhook vai para a transcrição sem pedir ao servidor; nada do arquivo vai para o banco', async () => {
    const id = `MSG${crypto.randomUUID().slice(0, 8)}`;
    const jid = `55219${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`;
    const b64 = Buffer.from('ogg-do-webhook').toString('base64');
    const r = await handleWebhook(pool, numberId, secret, {
      event: 'messages.upsert',
      data: { key: { id, remoteJid: jid, fromMe: false }, pushName: 'Ana', messageTimestamp: Math.floor(Date.now() / 1000), message: { audioMessage: { seconds: 7, mimetype: 'audio/ogg; codecs=opus' }, base64: b64 } }
    });
    expect(r.inbound).toHaveLength(1);
    const stored = await pool.query('SELECT body FROM whatsapp_messages WHERE provider_message_id = $1', [id]);
    expect(stored.rows[0].body).toBe('[áudio 0:07]');
    await processConversation(pool, r.inbound[0].conversationId, []);
    expect(getMediaBase64).not.toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledWith(Buffer.from('ogg-do-webhook'), 'audio/ogg');
    expect((await pool.query('SELECT body FROM whatsapp_messages WHERE provider_message_id = $1', [id])).rows[0].body).toBe('[áudio] quero o kit');
    const all = await pool.query('SELECT body FROM whatsapp_messages WHERE conversation_id = $1', [r.inbound[0].conversationId]);
    expect(JSON.stringify(all.rows)).not.toContain(b64);
    expect(sendAudio).toHaveBeenCalledTimes(1);
  });

  it('chave desligada: o arquivo do webhook é ignorado', async () => {
    delete process.env.WHATSAPP_AUDIO_ENABLED;
    const id = `MSG${crypto.randomUUID().slice(0, 8)}`;
    const jid = `55219${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`;
    const r = await handleWebhook(pool, numberId, secret, {
      event: 'messages.upsert',
      data: { key: { id, remoteJid: jid, fromMe: false }, message: { audioMessage: { seconds: 3 }, base64: 'AAAA' } }
    });
    process.env.WHATSAPP_AUDIO_ENABLED = 'true';
    await processConversation(pool, r.inbound[0].conversationId, []);
    // sem o arquivo na memória, tenta o servidor (que não tem): fica "não transcrito"
    expect(getMediaBase64).toHaveBeenCalledTimes(1);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('número antigo: webhook novo uma vez só (segredo trocado); falha volta o segredo', async () => {
    await pool.query('UPDATE whatsapp_numbers SET webhook_media_base64 = FALSE WHERE id = $1', [numberId]);
    setWebhook.mockRejectedValueOnce(new Error('fora do ar'));
    expect(await ensureMediaWebhook(pool, provider, numberId, 'https://api.exemplo.com')).toBe(false);
    let row = (await pool.query('SELECT webhook_secret_hash, webhook_media_base64 FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0];
    expect(row.webhook_secret_hash).toBe(sha(secret));
    expect(row.webhook_media_base64).toBe(false);

    expect(await ensureMediaWebhook(pool, provider, numberId, 'https://api.exemplo.com')).toBe(true);
    expect(setWebhook).toHaveBeenLastCalledWith(`t152-${tag}`, expect.stringMatching(new RegExp(`^https://api.exemplo.com/api/whatsapp/webhook/${numberId}/[0-9a-f]+$`)));
    row = (await pool.query('SELECT webhook_secret_hash, webhook_media_base64 FROM whatsapp_numbers WHERE id = $1', [numberId])).rows[0];
    expect(row.webhook_media_base64).toBe(true);
    expect(row.webhook_secret_hash).not.toBe(sha(secret));
    expect(await ensureMediaWebhook(pool, provider, numberId, 'https://api.exemplo.com')).toBe(false);
    expect(setWebhook).toHaveBeenCalledTimes(2);
  });

  it('chave desligada: não mexe no webhook', async () => {
    delete process.env.WHATSAPP_AUDIO_ENABLED;
    await pool.query('UPDATE whatsapp_numbers SET webhook_media_base64 = FALSE WHERE id = $1', [numberId]);
    expect(await ensureMediaWebhook(pool, provider, numberId, 'https://api.exemplo.com')).toBe(false);
    expect(setWebhook).not.toHaveBeenCalled();
  });
});
