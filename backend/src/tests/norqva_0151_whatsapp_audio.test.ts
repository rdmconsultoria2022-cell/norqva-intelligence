// NORQVA-0151: atendente entende áudio (transcrição) e responde em áudio a quem mandou áudio. WhatsApp, IA e OpenAI simulados.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import crypto from 'crypto';
import { initializeDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { setWhatsAppProviderForTests, WhatsAppProvider } from '../services/whatsapp/provider';
import { setAttendantAiForTests, processConversation, resetAttendantMemoryForTests, systemPrompt } from '../services/whatsapp/attendant';
import { setVoiceForTests, audioBody, untranscribedAudio, speechText, AUDIO_TOO_LONG, AUDIO_FAILED, AUDIO_SENT_LABEL } from '../services/whatsapp/voice';

describe('NORQVA-0151 — peças do áudio', () => {
  it('marcador com duração e leitura de volta', () => {
    expect(audioBody(45)).toBe('[áudio 0:45]');
    expect(audioBody(125)).toBe('[áudio 2:05]');
    expect(audioBody(undefined)).toBe('[áudio]');
    expect(untranscribedAudio('[áudio 2:05]')).toEqual({ seconds: 125 });
    expect(untranscribedAudio('[áudio]')).toEqual({ seconds: null });
    expect(untranscribedAudio('[áudio] quero o kit')).toBe(false);
  });
  it('fala sem emoji, marcação e link; longa demais vira null', () => {
    expect(speechText('Oi, *Ana*! 😊\n\nVeja: https://x.com/a')).toBe('Oi, Ana! Veja:');
    expect(speechText('a'.repeat(601))).toBeNull();
  });
  it('regras do prompt só com o áudio ligado', () => {
    const base = { brandName: 'T', catalog: '-', globalConditions: '', numberConditions: '', customerName: null, cpfOnFile: null };
    expect(systemPrompt(base)).toContain('peça com gentileza para escrever a mensagem');
    expect(systemPrompt({ ...base, audio: true })).toContain('chegam transcritos');
    expect(systemPrompt({ ...base, audio: true })).not.toContain('mensagem de voz');
    expect(systemPrompt({ ...base, audio: true, voiceReply: true })).toContain('mensagem de voz');
  });
});

describe.sequential('NORQVA-0151 — conversa com áudio', () => {
  let pool: Pool;
  const tag = crypto.randomUUID().slice(0, 6);
  let numberId = '';
  const sendText = vi.fn(async () => ({ id: `W-${crypto.randomUUID()}` }));
  const sendAudio = vi.fn(async () => ({ id: `A-${crypto.randomUUID()}` }));
  const getMediaBase64 = vi.fn(async () => ({ base64: Buffer.from('ogg-fake').toString('base64'), mimetype: 'audio/ogg; codecs=opus' }));
  const provider = {
    createInstance: vi.fn(), connect: vi.fn(), info: vi.fn(), logout: vi.fn(), deleteInstance: vi.fn(), setWebhook: vi.fn(),
    sendText, sendImage: vi.fn(async () => ({ id: 'I' })), sendAudio, getMediaBase64
  } as unknown as WhatsAppProvider;
  const transcribe = vi.fn(async () => 'Oi, quero saber do kit. Meu CPF é 529.982.247-25');
  const speak = vi.fn(async () => Buffer.from('voz'));
  let lastMessages: any[] = [];

  beforeAll(async () => {
    pool = initializeDB();
    await runMigrations(pool);
    const n = await pool.query(
      `INSERT INTO whatsapp_numbers (label, instance_name, webhook_secret_hash, status, phone, bot_enabled) VALUES ('T0151', $1, 'x', 'CONNECTED', '5511900000151', TRUE) RETURNING id`,
      [`t151-${tag}`]
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
    for (const f of [sendText, sendAudio, getMediaBase64, transcribe, speak]) f.mockClear();
    setWhatsAppProviderForTests(provider);
    setVoiceForTests({ transcribe, speak });
    setAttendantAiForTests((async (messages: any[]) => { lastMessages = messages; return { content: 'Claro, Ana! 😊 O kit tem 5 livros.', tool_calls: [] }; }) as any);
  });
  afterEach(() => {
    delete process.env.WHATSAPP_AUDIO_ENABLED;
  });

  async function convWith(body: string, kind: string) {
    const jid = `55219${Math.floor(10000000 + Math.random() * 89999999)}@s.whatsapp.net`;
    const c = await pool.query(`INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_name, mode) VALUES ($1, $2, 'Ana', 'BOT') RETURNING id`, [numberId, jid]);
    const m = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, author, body, kind, provider_message_id) VALUES ($1, 'IN', 'CUSTOMER', $2, $3, $4) RETURNING id`,
      [c.rows[0].id, body, kind, `M-${crypto.randomUUID()}`]
    );
    return { convId: c.rows[0].id as string, msgId: m.rows[0].id as string, jid };
  }
  const bodyOf = async (id: string) => (await pool.query('SELECT body FROM whatsapp_messages WHERE id = $1', [id])).rows[0].body as string;

  it('áudio: transcreve (CPF mascarado, nunca para a IA), responde em voz e por escrito', async () => {
    const { convId, msgId, jid } = await convWith('[áudio 0:12]', 'AUDIO');
    const r = await processConversation(pool, convId, []);
    expect(r.replied).toBe(true);
    expect(getMediaBase64).toHaveBeenCalledWith(`t151-${tag}`, expect.stringMatching(/^M-/), jid);
    const stored = await bodyOf(msgId);
    expect(stored.startsWith('[áudio] Oi, quero saber do kit.')).toBe(true);
    expect(stored).not.toContain('529.982.247-25');
    expect(JSON.stringify(lastMessages)).not.toContain('529.982.247-25');
    expect(lastMessages[0].content).toContain('mensagem de voz');
    expect(lastMessages[0].content).toContain('final 25');
    expect(speak).toHaveBeenCalledWith('Claro, Ana! O kit tem 5 livros.');
    expect(sendAudio).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    const out = await pool.query(`SELECT body, kind FROM whatsapp_messages WHERE conversation_id = $1 AND direction = 'OUT' ORDER BY created_at`, [convId]);
    expect(out.rows.map((x: any) => x.kind)).toEqual(['AUDIO', 'TEXT']);
    expect(out.rows[0].body).toBe(AUDIO_SENT_LABEL);
  });

  it('áudio com mais de 2 minutos: não baixa nem transcreve; resposta só por texto', async () => {
    const { convId, msgId } = await convWith('[áudio 2:30]', 'AUDIO');
    await processConversation(pool, convId, []);
    expect(getMediaBase64).not.toHaveBeenCalled();
    expect(await bodyOf(msgId)).toBe(AUDIO_TOO_LONG);
    expect(sendAudio).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalled();
  });

  it('transcrição falha: marca não transcrito e responde por texto', async () => {
    transcribe.mockRejectedValueOnce(new Error('boom'));
    const { convId, msgId } = await convWith('[áudio 0:05]', 'AUDIO');
    await processConversation(pool, convId, []);
    expect(await bodyOf(msgId)).toBe(AUDIO_FAILED);
    expect(sendAudio).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalled();
  });

  it('voz falha: a resposta vai por texto mesmo assim', async () => {
    speak.mockRejectedValueOnce(new Error('tts'));
    const { convId } = await convWith('[áudio 0:05]', 'AUDIO');
    await processConversation(pool, convId, []);
    expect(sendAudio).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('cliente que escreve recebe só texto', async () => {
    const { convId } = await convWith('Oi, quero o kit', 'TEXT');
    await processConversation(pool, convId, []);
    expect(speak).not.toHaveBeenCalled();
    expect(sendAudio).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('chave desligada: nada é baixado; regra antiga (pedir para escrever)', async () => {
    delete process.env.WHATSAPP_AUDIO_ENABLED;
    const { convId, msgId } = await convWith('[áudio 0:05]', 'AUDIO');
    await processConversation(pool, convId, []);
    expect(getMediaBase64).not.toHaveBeenCalled();
    expect(await bodyOf(msgId)).toBe('[áudio 0:05]');
    expect(lastMessages[0].content).toContain('peça com gentileza para escrever a mensagem');
    expect(sendAudio).not.toHaveBeenCalled();
  });
});
