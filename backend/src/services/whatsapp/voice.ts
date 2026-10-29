// NORQVA-0151 (D-0151): o atendente entende áudio (transcrição) e responde em áudio a quem mandou áudio.
// Chave WHATSAPP_AUDIO_ENABLED=true (padrão desligada). O áudio do cliente e o da resposta não são guardados:
// só a transcrição entra no histórico. Testes simulam a OpenAI com setVoiceForTests.

export const MAX_INBOUND_AUDIO_SECONDS = 120;
/** ~2 min de mensagem de voz do WhatsApp ficam bem abaixo disso; acima, nem tenta transcrever */
export const MAX_INBOUND_AUDIO_BYTES = 3 * 1024 * 1024;
/** fala da resposta: até ~30 s; texto maior vai só por escrito */
export const MAX_SPOKEN_CHARS = 600;

export const AUDIO_MARK = '[áudio]';
export const AUDIO_TOO_LONG = '[áudio longo, com mais de 2 minutos: não transcrito]';
export const AUDIO_FAILED = '[áudio não transcrito]';
export const AUDIO_SENT_LABEL = '[áudio enviado]';

export interface VoiceClient {
  transcribe(audio: Buffer, mimetype: string): Promise<string>;
  speak(text: string): Promise<Buffer>;
}

let testVoice: VoiceClient | null = null;
/** Só para testes: transcrição e voz simuladas (os testes nunca falam com a OpenAI). */
export function setVoiceForTests(v: VoiceClient | null) {
  testVoice = v;
}

export function audioEnabled(): boolean {
  return String(process.env.WHATSAPP_AUDIO_ENABLED || '').trim().toLowerCase() === 'true';
}

/** Corpo gravado para um áudio recebido, com a duração quando o WhatsApp informa: "[áudio 0:45]". */
export function audioBody(seconds: unknown): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return AUDIO_MARK;
  const n = Math.round(s);
  return `[áudio ${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}]`;
}

/** Áudio ainda não transcrito? Devolve a duração em segundos (null = desconhecida). */
export function untranscribedAudio(body: string): { seconds: number | null } | false {
  const m = String(body || '').match(/^\[áudio(?: (\d+):(\d{2}))?\]$/);
  if (!m) return false;
  return { seconds: m[1] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : null };
}

/**
 * Números ditos em pedaços ("529 982 247 25", "529.982.247 - 25") viram dígitos seguidos quando somam 11,
 * para a busca de CPF achar e mascarar.
 */
export function compactSpokenNumbers(text: string): string {
  return String(text || '').replace(/\d(?:[\s.,\-–]*\d){10,14}/g, run => {
    const digits = run.replace(/\D/g, '');
    return digits.length === 11 ? digits : run;
  });
}

/** Pedido falado para parar de receber mensagens. */
export function isSpokenStop(text: string): boolean {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(para|pare|parar) de (me )?(mandar|enviar|chamar)\b|\bnao (quero|quer) (mais )?receber\b|\b(me )?(tira|tire|remove|remova) (da lista|daqui|o meu numero|meu numero)\b/.test(t);
}

/** Texto da resposta como fala: sem emojis, marcações, links e listas; null quando é longo demais para áudio. */
export function speechText(text: string): string | null {
  const t = String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[*_~`]/g, '')
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!t || t.length > MAX_SPOKEN_CHARS) return null;
  return t;
}

function openAiBase() {
  return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

const openAiVoice: VoiceClient = {
  async transcribe(audio, mimetype) {
    const key = (process.env.OPENAI_API_KEY || '').trim();
    const ext = /mpeg|mp3/.test(mimetype) ? 'mp3' : /mp4|m4a|aac/.test(mimetype) ? 'm4a' : /wav/.test(mimetype) ? 'wav' : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimetype || 'audio/ogg' }), `audio.${ext}`);
    form.append('model', process.env.WHATSAPP_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
    form.append('language', 'pt');
    form.append('response_format', 'json');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${openAiBase()}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: controller.signal });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`OpenAI transcrição HTTP ${res.status}`);
      return String(data?.text || '').trim();
    } finally {
      clearTimeout(timer);
    }
  },
  async speak(text) {
    const key = (process.env.OPENAI_API_KEY || '').trim();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(`${openAiBase()}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.WHATSAPP_TTS_MODEL || 'gpt-4o-mini-tts',
          voice: process.env.WHATSAPP_TTS_VOICE || 'nova',
          input: text,
          instructions: 'Fale em português do Brasil, com sotaque brasileiro, tom simpático e natural, no ritmo de uma conversa de WhatsApp.',
          response_format: 'opus'
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`OpenAI voz HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }
};

export function voice(): VoiceClient {
  return testVoice || openAiVoice;
}
