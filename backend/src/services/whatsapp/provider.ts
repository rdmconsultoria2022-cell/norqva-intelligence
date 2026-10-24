// NORQVA-0046: camada própria entre o NORQVA e o WhatsApp.
// Motor 1: Evolution API (não oficial, D-0046), desligada por padrão desde a NORQVA-0079.
// Motor 2: Cloud API oficial da Meta (metaCloudProvider.ts, D-0079), escolhido por número em cloudAccounts.providerForNumber.

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
  /** NORQVA-0123: `opts.mimetype` (padrão PNG, o QR Code do Pix) para as fotos de amostra em JPEG. */
  sendImage(instanceName: string, to: string, base64Png: string, caption: string, opts?: { mimetype?: 'image/png' | 'image/jpeg' }): Promise<{ id: string | null }>;
}

export interface ServerCheck {
  ok: boolean;
  step: 'CONFIG' | 'REACH' | 'ADDRESS' | 'KEY' | 'OK';
  problem: string | null;
  version: string | null;
  host: string | null;
}

/** NORQVA-0047: diagnóstico do servidor do WhatsApp em linguagem simples (endereço, senha, versão). */
export async function checkEvolutionServer(urlArg?: string, keyArg?: string, timeoutMs = 30000): Promise<ServerCheck> {
  const url = (urlArg ?? process.env.EVOLUTION_API_URL ?? '').trim().replace(/\/+$/, '');
  const key = (keyArg ?? process.env.EVOLUTION_API_KEY ?? '').trim();
  let host: string | null = null;
  try { host = url ? new URL(url).host : null; } catch { host = null; }
  if (!url || !key) {
    return { ok: false, step: 'CONFIG', host, version: null, problem: 'Falta configurar no norqva-staging-api: ' + [!url && 'EVOLUTION_API_URL', !key && 'EVOLUTION_API_KEY'].filter(Boolean).join(' e ') + '.' };
  }
  if (!host || !/^https?:\/\//i.test(url)) {
    return { ok: false, step: 'CONFIG', host, version: null, problem: 'EVOLUTION_API_URL precisa ser um endereço completo, começando com https:// (ex.: https://norqva-whatsapp.onrender.com).' };
  }
  const get = async (path: string, withKey: boolean) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}${path}`, { headers: withKey ? { apikey: key } : {}, signal: controller.signal });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { status: res.status, data };
    } finally {
      clearTimeout(t);
    }
  };
  let root: { status: number; data: any };
  try {
    root = await get('/', false);
  } catch (err: any) {
    return {
      ok: false, step: 'REACH', host, version: null,
      problem: err?.name === 'AbortError'
        ? `O servidor ${host} não respondeu a tempo. Se acabou de ser criado ou reiniciado, espere 2 minutos e teste de novo; se continuar, veja a aba Logs do serviço no Render.`
        : `Não foi possível falar com ${host}. Confira se o endereço está certo e se o serviço está no ar (status "Live" no Render).`
    };
  }
  if (root.status >= 500) {
    return { ok: false, step: 'REACH', host, version: null, problem: `O servidor ${host} está fora do ar ou ainda iniciando (erro ${root.status}). Espere 2 minutos e teste de novo; se continuar, veja a aba Logs do serviço no Render.` };
  }
  const looksEvolution = root.data && (String(root.data.message || '').toLowerCase().includes('evolution') || root.data.version || root.data.clientName);
  if (root.status === 404 || !looksEvolution) {
    return {
      ok: false, step: 'ADDRESS', host, version: null,
      problem: `O endereço ${host} respondeu, mas não é o servidor do WhatsApp (resposta ${root.status}). Copie o endereço do serviço da imagem Evolution no Render e coloque em EVOLUTION_API_URL, sem barra no final.`
    };
  }
  const version = root.data?.version ? String(root.data.version) : null;
  let auth: { status: number; data: any };
  try {
    auth = await get('/instance/fetchInstances', true);
  } catch {
    return { ok: false, step: 'REACH', host, version, problem: 'O servidor respondeu, mas caiu ao conferir a senha. Teste de novo em instantes.' };
  }
  if (auth.status === 401 || auth.status === 403) {
    return { ok: false, step: 'KEY', host, version, problem: 'A senha não confere: EVOLUTION_API_KEY (no norqva-staging-api) precisa ser igual a AUTHENTICATION_API_KEY (no serviço do WhatsApp).' };
  }
  if (auth.status >= 400) {
    return { ok: false, step: 'KEY', host, version, problem: `O servidor do WhatsApp respondeu com erro ${auth.status} ao listar os números. Veja a aba Logs do serviço no Render.` };
  }
  return { ok: true, step: 'OK', host, version, problem: null };
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
        if (res.status === 401 || res.status === 403) throw new ProviderError('O servidor do WhatsApp recusou a senha: EVOLUTION_API_KEY precisa ser igual a AUTHENTICATION_API_KEY. Use "Testar servidor".', 502);
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

  async sendImage(instanceName: string, to: string, base64Png: string, caption: string, opts: { mimetype?: 'image/png' | 'image/jpeg' } = {}): Promise<{ id: string | null }> {
    const jpeg = opts.mimetype === 'image/jpeg';
    const data = await this.call('POST', `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      number: to,
      mediatype: 'image',
      mimetype: jpeg ? 'image/jpeg' : 'image/png',
      caption,
      media: stripDataUrl(base64Png),
      fileName: jpeg ? 'amostra.jpg' : 'pix.png'
    });
    return { id: data?.key?.id || null };
  }
}

let testProvider: WhatsAppProvider | null = null;

/** Só para testes: troca o motor por um simulado (os testes nunca falam com o WhatsApp). */
export function setWhatsAppProviderForTests(p: WhatsAppProvider | null) {
  testProvider = p;
}

/** NORQVA-0079 (D-0079): a Evolution (não oficial) só funciona com WHATSAPP_EVOLUTION_ENABLED=true. Padrão: desligada. */
export function evolutionEnabled(): boolean {
  return String(process.env.WHATSAPP_EVOLUTION_ENABLED || '').trim().toLowerCase() === 'true';
}

/**
 * Motor da Evolution, ou null quando está desligada (WHATSAPP_EVOLUTION_ENABLED) ou sem servidor
 * (EVOLUTION_API_URL / EVOLUTION_API_KEY). Números oficiais usam providerForNumber (cloudAccounts).
 */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  if (testProvider) return testProvider;
  if (process.env.NODE_ENV === 'test') return null;
  if (!evolutionEnabled()) return null;
  const url = (process.env.EVOLUTION_API_URL || '').trim();
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  if (!url || !key) return null;
  return new EvolutionProvider(url, key);
}
