// NORQVA-0046: camada própria entre o NORQVA e o WhatsApp.
// Hoje o motor é a Evolution API (não oficial, decisão do Ricardo em 10/10/2026 19h31).
// Trocar pela API oficial da Meta = escrever outra classe com esta mesma interface.

export type ProviderState = 'open' | 'connecting' | 'close' | 'unknown';

export interface ProviderQr {
  base64: string | null;
  state: ProviderState;
}

export interface ProviderInstanceInfo {
  state: ProviderState;
  phone: string | null;
  profileName: string | null;
}

export interface WhatsAppProvider {
  /** Cria a instância (se não existir) apontando o webhook para o NORQVA e devolve o QR Code. */
  createInstance(instanceName: string, webhookUrl: string): Promise<ProviderQr>;
  /** QR Code novo para conectar (ou estado "open" se já conectado). */
  connect(instanceName: string): Promise<ProviderQr>;
  info(instanceName: string): Promise<ProviderInstanceInfo>;
  /** Desconecta o aparelho (a instância continua, pronta para outro número). */
  logout(instanceName: string): Promise<void>;
  deleteInstance(instanceName: string): Promise<void>;
  setWebhook(instanceName: string, webhookUrl: string): Promise<void>;
  sendText(instanceName: string, to: string, text: string, opts?: { delayMs?: number }): Promise<{ id: string | null }>;
  sendImage(instanceName: string, to: string, base64Png: string, caption: string): Promise<{ id: string | null }>;
}

export class ProviderError extends Error {
  constructor(message: string, public status: number = 502) {
    super(message);
  }
}

const WEBHOOK_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT'];

function stripDataUrl(b64: string | null | undefined): string | null {
  if (!b64 || typeof b64 !== 'string') return null;
  return b64.replace(/^data:image\/[a-z]+;base64,/i, '');
}

function normState(s: any): ProviderState {
  const v = String(s || '').toLowerCase();
  if (v === 'open' || v === 'connected') return 'open';
  if (v === 'connecting') return 'connecting';
  if (v === 'close' || v === 'closed' || v === 'disconnected') return 'close';
  return 'unknown';
}

export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = String(jid).match(/^(\d{8,16})(:\d+)?@s\.whatsapp\.net$/);
  return m ? m[1] : null;
}

export class EvolutionProvider implements WhatsAppProvider {
  constructor(private baseUrl: string, private apiKey: string, private timeoutMs = 15000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async call(method: string, path: string, body?: any): Promise<any> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
      if (!res.ok) {
        const msg = data?.response?.message || data?.message || data?.error || `status ${res.status}`;
        throw new ProviderError(`Servidor do WhatsApp respondeu com erro: ${Array.isArray(msg) ? msg.join('; ') : String(msg).slice(0, 300)}`, res.status === 404 ? 404 : 502);
      }
      return data;
    } catch (err: any) {
      if (err instanceof ProviderError) throw err;
      if (err?.name === 'AbortError') throw new ProviderError('O servidor do WhatsApp demorou para responder.', 504);
      throw new ProviderError('Não foi possível falar com o servidor do WhatsApp.', 502);
    } finally {
      clearTimeout(t);
    }
  }

  private webhookBody(webhookUrl: string) {
    return { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: WEBHOOK_EVENTS };
  }

  async createInstance(instanceName: string, webhookUrl: string): Promise<ProviderQr> {
    const data = await this.call('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      groupsIgnore: true,
      rejectCall: true,
      msgCall: 'Não atendemos ligações por aqui. Pode mandar sua mensagem por escrito, por favor.',
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
      webhook: this.webhookBody(webhookUrl)
    });
    const qr = stripDataUrl(data?.qrcode?.base64);
    return { base64: qr, state: qr ? 'connecting' : normState(data?.instance?.status) };
  }

  async connect(instanceName: string): Promise<ProviderQr> {
    const data = await this.call('GET', `/instance/connect/${encodeURIComponent(instanceName)}`);
    const qr = stripDataUrl(data?.base64 || data?.qrcode?.base64);
    if (qr) return { base64: qr, state: 'connecting' };
    return { base64: null, state: normState(data?.instance?.state || data?.state) };
  }

  async info(instanceName: string): Promise<ProviderInstanceInfo> {
    const st = await this.call('GET', `/instance/connectionState/${encodeURIComponent(instanceName)}`);
    const state = normState(st?.instance?.state || st?.state);
    let phone: string | null = null;
    let profileName: string | null = null;
    try {
      const list = await this.call('GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
      const item = Array.isArray(list) ? list[0] : list;
      const inst = item?.instance || item;
      phone = phoneFromJid(inst?.ownerJid || inst?.owner || null) || (inst?.number ? String(inst.number).replace(/\D/g, '') || null : null);
      profileName = inst?.profileName || null;
    } catch {
      // só o estado é essencial
    }
    return { state, phone, profileName };
  }

  async logout(instanceName: string): Promise<void> {
    try {
      await this.call('DELETE', `/instance/logout/${encodeURIComponent(instanceName)}`);
    } catch (err: any) {
      // já desconectado: segue
      if (!(err instanceof ProviderError)) throw err;
    }
  }

  async deleteInstance(instanceName: string): Promise<void> {
    try {
      await this.call('DELETE', `/instance/delete/${encodeURIComponent(instanceName)}`);
    } catch (err: any) {
      if (!(err instanceof ProviderError) || err.status !== 404) throw err;
    }
  }

  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.call('POST', `/webhook/set/${encodeURIComponent(instanceName)}`, { webhook: this.webhookBody(webhookUrl) });
  }

  async sendText(instanceName: string, to: string, text: string, opts: { delayMs?: number } = {}): Promise<{ id: string | null }> {
    const data = await this.call('POST', `/message/sendText/${encodeURIComponent(instanceName)}`, {
      number: to,
      text,
      ...(opts.delayMs ? { delay: opts.delayMs } : {})
    });
    return { id: data?.key?.id || null };
  }

  async sendImage(instanceName: string, to: string, base64Png: string, caption: string): Promise<{ id: string | null }> {
    const data = await this.call('POST', `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      number: to,
      mediatype: 'image',
      mimetype: 'image/png',
      caption,
      media: stripDataUrl(base64Png),
      fileName: 'pix.png'
    });
    return { id: data?.key?.id || null };
  }
}

let testProvider: WhatsAppProvider | null = null;

/** Só para testes: troca o motor por um simulado (os testes nunca falam com o WhatsApp). */
export function setWhatsAppProviderForTests(p: WhatsAppProvider | null) {
  testProvider = p;
}

/** Motor configurado, ou null quando o servidor do WhatsApp ainda não foi ligado (EVOLUTION_API_URL / EVOLUTION_API_KEY). */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  if (testProvider) return testProvider;
  if (process.env.NODE_ENV === 'test') return null;
  const url = (process.env.EVOLUTION_API_URL || '').trim();
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  if (!url || !key) return null;
  return new EvolutionProvider(url, key);
}
