// NORQVA-0079 (D-0079): motor oficial do WhatsApp — Cloud API da Meta.
// Implementa a mesma interface do motor da Evolution (enviar texto e imagem), mais o envio de template.
// Cada instância fica presa a UM número (phone_number_id) de UMA conta Meta: o parâmetro instanceName é ignorado.
//
// Travas (nenhuma é ligada sem o "sim" do Ricardo):
// - WHATSAPP_CLOUD_SEND_ENABLED=true libera o envio real (padrão: bloqueado, nada sai para a Meta)
// - WHATSAPP_CLOUD_ENVIRONMENTS lista os ambientes que podem enviar (padrão: só TEST)
// - conta TEST só envia para os destinatários de teste cadastrados nela
import { WhatsAppProvider, ProviderError, ProviderQr, ProviderInstanceInfo } from './provider';

export type CloudEnvironment = 'TEST' | 'PRODUCTION';

export interface GraphResponse {
  status: number;
  json: any;
}

/** Chamada à Graph API. Os testes trocam por uma simulada (nunca falam com a Meta). */
export type GraphFetch = (url: string, init: { method: string; headers: Record<string, string>; body?: any }) => Promise<GraphResponse>;

let testGraphFetch: GraphFetch | null = null;
let retryBaseMs = 1000;

/** Só para testes. */
export function setGraphFetchForTests(f: GraphFetch | null, opts: { retryBaseMs?: number } = {}) {
  testGraphFetch = f;
  retryBaseMs = opts.retryBaseMs ?? (f ? 0 : 1000);
}

const realGraphFetch: GraphFetch = async (url, init) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: controller.signal });
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
    return { status: res.status, json };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new ProviderError('A Meta demorou para responder.', 504);
    throw new ProviderError('Não foi possível falar com a Meta.', 502);
  } finally {
    clearTimeout(t);
  }
};

export function graphFetch(): GraphFetch {
  if (testGraphFetch) return testGraphFetch;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new ProviderError('Teste sem Graph API simulada.', 502);
    };
  }
  return realGraphFetch;
}

export function graphBase(version: string) {
  const v = /^v\d+\.\d+$/.test(String(version || '')) ? version : (process.env.META_API_VERSION || 'v26.0');
  return `https://graph.facebook.com/${v}`;
}

// ---------- travas ----------

export function cloudSendEnabled(): boolean {
  return String(process.env.WHATSAPP_CLOUD_SEND_ENABLED || '').trim().toLowerCase() === 'true';
}

export function allowedCloudEnvironments(): Set<CloudEnvironment> {
  const raw = String(process.env.WHATSAPP_CLOUD_ENVIRONMENTS ?? 'TEST').toUpperCase();
  const out = new Set<CloudEnvironment>();
  for (const part of raw.split(/[\s,;]+/)) {
    if (part === 'TEST' || part === 'PRODUCTION') out.add(part);
  }
  return out;
}

export type BlockCode = 'SEND_DISABLED' | 'ENVIRONMENT_NOT_ALLOWED' | 'RECIPIENT_NOT_ALLOWED';

/** Envio barrado por uma trava do NORQVA: nada foi enviado à Meta. */
export class SendBlockedError extends ProviderError {
  constructor(message: string, public code: BlockCode) {
    super(message, 409);
  }
}

/** Erro devolvido pela Meta (código numérico da Meta em metaCode). */
export class CloudApiError extends ProviderError {
  constructor(message: string, status: number, public metaCode: number | null) {
    super(message, status);
  }
}

export interface CloudErrorInfo {
  message: string;
  retry: boolean;
  /** efeito no número/conta, aplicado por quem tem acesso ao banco */
  effect: 'NONE' | 'TOKEN_INVALID' | 'NUMBER_BANNED';
  outsideWindow: boolean;
}

/** Tradução dos códigos de erro da Meta (contrato NORQVA-0079, tabela de erros). */
export function describeCloudError(code: number | null, metaMessage?: string): CloudErrorInfo {
  switch (code) {
    case 190:
      return { message: 'O token da Meta está inválido ou expirou. Cadastre um token novo na conta.', retry: false, effect: 'TOKEN_INVALID', outsideWindow: false };
    case 131047:
      return { message: 'Passaram mais de 24h desde a última mensagem do cliente: só template aprovado pode ser enviado.', retry: false, effect: 'NONE', outsideWindow: true };
    case 131030:
      return { message: 'Este número não está na lista de destinatários de teste da Meta.', retry: false, effect: 'NONE', outsideWindow: false };
    case 130429:
      return { message: 'Limite de envio da Meta atingido. Tente de novo em instantes.', retry: true, effect: 'NONE', outsideWindow: false };
    case 131056:
      // limite por par (número → cliente): esperar 1 ou 2 segundos não resolve
      return { message: 'Muitas mensagens seguidas para este cliente. Aguarde alguns minutos.', retry: false, effect: 'NONE', outsideWindow: false };
    case 131026:
      return { message: 'A mensagem não chegou: o número do cliente não tem WhatsApp ou está inalcançável.', retry: false, effect: 'NONE', outsideWindow: false };
    case 368:
      return { message: 'A Meta bloqueou o envio por política. O atendente foi parado neste número.', retry: false, effect: 'NUMBER_BANNED', outsideWindow: false };
    case 133010:
      return { message: 'O número ainda não foi ativado na API oficial: use "Ativar número" no cartão do número.', retry: false, effect: 'NONE', outsideWindow: false };
    case 133005:
      return { message: 'PIN errado: use o PIN de 6 números da verificação em duas etapas deste número.', retry: false, effect: 'NONE', outsideWindow: false };
    case 133006:
      return { message: 'A Meta pede para verificar o número (código por SMS) antes de ativá-lo.', retry: false, effect: 'NONE', outsideWindow: false };
    case 133016:
      return { message: 'A Meta bloqueou novas ativações deste número por excesso de tentativas. Espere 3 dias sem tentar e faça uma tentativa só.', retry: false, effect: 'NONE', outsideWindow: false };
    case 133015:
      return { message: 'O número foi apagado há pouco e a Meta ainda está terminando. Espere uns 5 minutos.', retry: false, effect: 'NONE', outsideWindow: false };
    case 133009:
      return { message: 'Tentativas de PIN rápidas demais. Aguarde alguns minutos e tente de novo.', retry: false, effect: 'NONE', outsideWindow: false };
    case 10:
    case 200:
      return { message: 'O token não tem permissão para esta conta do WhatsApp (whatsapp_business_messaging e whatsapp_business_management).', retry: false, effect: 'TOKEN_INVALID', outsideWindow: false };
    default:
      return { message: `A Meta recusou o envio${code ? ` (código ${code})` : ''}${metaMessage ? `: ${String(metaMessage).slice(0, 200)}` : '.'}`, retry: false, effect: 'NONE', outsideWindow: false };
  }
}

// ---------- telefone ----------

/** "5531999998888@s.whatsapp.net" ou "+55 (31) 99999-8888" → "5531999998888". */
export function digitsOf(jidOrPhone: string | null | undefined): string {
  return String(jidOrPhone || '').split('@')[0].replace(/\D/g, '');
}

/** Formato interno do contato (o mesmo do motor da Evolution), para conversas e telas funcionarem igual. */
export function jidFromWaId(waId: string): string {
  return `${digitsOf(waId)}@s.whatsapp.net`;
}

/**
 * No Brasil o WhatsApp pode devolver o celular sem o 9 (55 + DDD + 8 dígitos).
 * Para comparar com a lista de teste, as duas formas valem.
 */
export function phoneVariants(digits: string): string[] {
  const d = digitsOf(digits);
  const out = new Set<string>([d]);
  if (/^55\d{2}9\d{8}$/.test(d)) out.add(d.slice(0, 4) + d.slice(5));
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) out.add(d.slice(0, 4) + '9' + d.slice(4));
  return [...out];
}

// ---------- motor ----------

export interface CloudBinding {
  accountId: string;
  environment: CloudEnvironment;
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
  testRecipients: string[];
  /** chamado quando a Meta devolve um erro com efeito no número ou na conta */
  onError?: (info: CloudErrorInfo, metaCode: number | null) => Promise<void>;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MetaCloudProvider implements WhatsAppProvider {
  readonly kind = 'META_CLOUD' as const;
  private fetcher: GraphFetch;

  constructor(private b: CloudBinding, fetcher?: GraphFetch) {
    this.fetcher = fetcher || graphFetch();
  }

  get environment(): CloudEnvironment {
    return this.b.environment;
  }

  /** Confere as travas antes de qualquer chamada à Meta. Devolve o destino só com dígitos. */
  private guard(to: string): string {
    const digits = digitsOf(to);
    if (digits.length < 10) throw new ProviderError('Número do cliente inválido.', 400);
    if (!allowedCloudEnvironments().has(this.b.environment)) {
      throw new SendBlockedError(`Envio bloqueado: o ambiente ${this.b.environment} não está liberado neste servidor (WHATSAPP_CLOUD_ENVIRONMENTS).`, 'ENVIRONMENT_NOT_ALLOWED');
    }
    if (this.b.environment === 'TEST') {
      const allowed = new Set(this.b.testRecipients.flatMap(phoneVariants));
      if (!phoneVariants(digits).some(v => allowed.has(v))) {
        throw new SendBlockedError('Envio bloqueado: na conta de teste só é possível enviar para os destinatários de teste cadastrados.', 'RECIPIENT_NOT_ALLOWED');
      }
    }
    if (!cloudSendEnabled()) {
      throw new SendBlockedError('Envio real bloqueado até a homologação (WHATSAPP_CLOUD_SEND_ENABLED desligado). A mensagem foi registrada, mas não saiu.', 'SEND_DISABLED');
    }
    return digits;
  }

  /** Motivo pelo qual um envio para este destino seria barrado agora (null = liberado). Não chama a Meta. */
  blockReason(to: string): BlockCode | null {
    try {
      this.guard(to);
      return null;
    } catch (err) {
      if (err instanceof SendBlockedError) return err.code;
      return null;
    }
  }

  private async call(method: string, path: string, body: any, json = true): Promise<any> {
    const url = `${graphBase(this.b.graphVersion)}${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.b.accessToken}` };
    if (json) headers['Content-Type'] = 'application/json';
    let attempt = 0;
    for (;;) {
      attempt++;
      const res = await this.fetcher(url, { method, headers, body: json && body !== undefined ? JSON.stringify(body) : body });
      if (res.status >= 200 && res.status < 300 && !res.json?.error) return res.json;
      const err = res.json?.error || {};
      const code = Number.isFinite(Number(err.code)) ? Number(err.code) : null;
      // detalhe por mensagem (ex.: 131047 vem também em errors[].code)
      const info = describeCloudError(code, err.error_data?.details || err.error_user_msg || err.message);
      if (info.retry && attempt < 3) {
        await sleep(retryBaseMs * 2 ** (attempt - 1));
        continue;
      }
      if (this.b.onError && info.effect !== 'NONE') {
        await this.b.onError(info, code).catch(() => {});
      }
      throw new CloudApiError(info.message, res.status === 401 ? 502 : res.status >= 500 ? 502 : 422, code);
    }
  }

  async sendText(_instanceName: string, to: string, text: string): Promise<{ id: string | null }> {
    const digits = this.guard(to);
    const data = await this.call('POST', `/${encodeURIComponent(this.b.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'text',
      text: { body: String(text).slice(0, 4096), preview_url: true }
    });
    return { id: data?.messages?.[0]?.id ? String(data.messages[0].id) : null };
  }

  async sendImage(_instanceName: string, to: string, base64Png: string, caption: string): Promise<{ id: string | null }> {
    const digits = this.guard(to);
    // a Cloud API não aceita base64 direto: sobe a imagem e envia pelo ID da mídia
    const raw = String(base64Png || '').replace(/^data:image\/[a-z]+;base64,/i, '');
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'image/png');
    form.append('file', new Blob([Buffer.from(raw, 'base64')], { type: 'image/png' }), 'pix.png');
    const up = await this.call('POST', `/${encodeURIComponent(this.b.phoneNumberId)}/media`, form, false);
    const mediaId = up?.id ? String(up.id) : null;
    if (!mediaId) throw new CloudApiError('A Meta não devolveu o ID da imagem enviada.', 502, null);
    const data = await this.call('POST', `/${encodeURIComponent(this.b.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'image',
      image: { id: mediaId, caption: String(caption || '').slice(0, 1024) }
    });
    return { id: data?.messages?.[0]?.id ? String(data.messages[0].id) : null };
  }

  /** Template aprovado na Meta (o único envio permitido com a janela de 24h fechada). */
  async sendTemplate(to: string, name: string, language: string, components: any[] = []): Promise<{ id: string | null }> {
    const digits = this.guard(to);
    const data = await this.call('POST', `/${encodeURIComponent(this.b.phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits,
      type: 'template',
      template: { name, language: { code: language }, ...(components.length ? { components } : {}) }
    });
    return { id: data?.messages?.[0]?.id ? String(data.messages[0].id) : null };
  }

  // A Cloud API não usa QR Code nem instância: estes métodos não se aplicam a número oficial.
  private notApplicable(): never {
    throw new ProviderError('Número oficial da Meta não usa QR Code. Use "Conferir número" na conta Meta.', 400);
  }
  async createInstance(): Promise<ProviderQr> { return this.notApplicable(); }
  async connect(): Promise<ProviderQr> { return this.notApplicable(); }
  async info(): Promise<ProviderInstanceInfo> { return this.notApplicable(); }
  async logout(): Promise<void> { /* nada a desconectar */ }
  async deleteInstance(): Promise<void> { /* nada a apagar na Meta */ }
  async setWebhook(): Promise<void> { return this.notApplicable(); }
}

export function isCloudProvider(p: WhatsAppProvider | null | undefined): p is MetaCloudProvider {
  return !!p && (p as any).kind === 'META_CLOUD';
}
