// NORQVA-0115 (D-0115): Referências. O dono cola o link de uma página de venda (ou envia de 1 a 5 prints
// de página ou anúncio) e escolhe um produto nosso. O NORQVA tira SÓ a estrutura (esqueleto): função e
// forma de cada parte. Texto, HTML, imagens, nomes, marcas, depoimentos e números da referência NUNCA são
// gravados. Para a checagem anticópia da etapa 2 ficam apenas impressões (sha256 cortado em 16) de cada
// janela de 6 palavras do texto de origem. Tudo que é texto da referência vive só em memória.
import crypto from 'crypto';
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import zlib from 'zlib';
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from '../../db/audit';

// ---------------------------------------------------------------------------------------------
// Erros e trava
// ---------------------------------------------------------------------------------------------

/** INPUT = pedido inválido (400, nada é gravado). FETCH = a página não pôde ser lida (vira FAILED). */
export class CreativeReferenceError extends Error {
  constructor(public status: number, message: string, public kind: 'INPUT' | 'FETCH' | 'OTHER' = 'OTHER') {
    super(message);
  }
}

export function referencesEnabled(): boolean {
  return String(process.env.CREATIVE_REFERENCES_ENABLED || '').trim().toLowerCase() === 'true';
}

export const REFERENCES_DISABLED_MESSAGE = 'Referências estão desligadas neste ambiente (CREATIVE_REFERENCES_ENABLED).';

// ---------------------------------------------------------------------------------------------
// Leitura da página com proteção contra SSRF
// ---------------------------------------------------------------------------------------------

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function ipv4Private(ip: string): boolean {
  const p = ip.split('.').map(n => Number(n));
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Hextets(addr: string): number[] | null {
  let s = addr;
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (m) {
    const p = m[2].split('.').map(Number);
    if (p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${m[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const all = [...head, ...Array(fill).fill('0'), ...tail];
  if (all.length !== 8) return null;
  const nums = all.map(h => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
  return nums.some(n => Number.isNaN(n)) ? null : nums;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** true = endereço interno/reservado (bloqueado). Formato desconhecido também bloqueia. */
export function isPrivateAddress(ip: string): boolean {
  let addr = String(ip || '').trim().toLowerCase();
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1);
  addr = addr.split('%')[0];
  if (net.isIPv4(addr)) return ipv4Private(addr);
  if (!net.isIPv6(addr)) return true;
  const h = ipv6Hextets(addr);
  if (!h) return true;
  const zeros = (from: number, to: number) => h.slice(from, to).every(x => x === 0);
  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && h[7] === 1) return true; // ::1
  if (zeros(0, 5) && h[5] === 0xffff) return ipv4Private(v4From(h[6], h[7])); // ::ffff:a.b.c.d
  if (zeros(0, 6)) return true; // IPv4 compatível (obsoleto)
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x64 && h[1] === 0xff9b) return ipv4Private(v4From(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return ipv4Private(v4From(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentação
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  return false;
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home.arpa', '.corp'];

/** Confere o endereço (sem rede): só http/https, sem usuário/senha, portas 80/443, host público. */
export function assertSafeUrl(raw: unknown): URL {
  const text = String(raw ?? '').trim();
  if (!text) throw new CreativeReferenceError(400, 'Cole o link da página ou do anúncio.', 'INPUT');
  if (text.length > 2048) throw new CreativeReferenceError(400, 'Link longo demais.', 'INPUT');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new CreativeReferenceError(400, 'Link inválido. Use o endereço completo, começando com https://', 'INPUT');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CreativeReferenceError(400, 'Só links http ou https.', 'INPUT');
  }
  if (url.username || url.password) throw new CreativeReferenceError(400, 'Link com usuário e senha não é aceito.', 'INPUT');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new CreativeReferenceError(400, 'Só links nas portas padrão (80 ou 443).', 'INPUT');
  }
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (!host) throw new CreativeReferenceError(400, 'Link sem endereço.', 'INPUT');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT');
    return url;
  }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some(s => host.endsWith(s)) || !host.includes('.')) {
    throw new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT');
  }
  return url;
}

export type HostResolver = (host: string) => Promise<string[]>;

const realResolver: HostResolver = async host => {
  const list = await dns.promises.lookup(host, { all: true, verbatim: true });
  return list.map(a => a.address);
};

let testResolver: HostResolver | null = null;

function resolver(): HostResolver {
  if (testResolver) return testResolver;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new Error('Teste sem DNS simulado.');
    };
  }
  return realResolver;
}

/** Resolve o nome e recusa se QUALQUER endereço for interno. */
export async function assertPublicHost(url: URL): Promise<void> {
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT');
    return;
  }
  let addrs: string[];
  try {
    addrs = await resolver()(host);
  } catch {
    throw new CreativeReferenceError(502, 'Não encontramos esse endereço. Confira o link.', 'FETCH');
  }
  if (!addrs.length || addrs.some(a => isPrivateAddress(a))) {
    throw new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT');
  }
}

export interface RawPageResponse {
  status: number;
  location: string | null;
  contentType: string;
  body: Buffer;
}

/** Faz UM pedido (sem seguir redirecionamento). Os testes trocam por um simulado. */
export type PageTransport = (url: URL, opts: { timeoutMs: number; maxBytes: number }) => Promise<RawPageResponse>;

// A conexão confere o IP na hora de conectar (evita troca de DNS entre a checagem e o pedido).
const guardedLookup = (hostname: string, options: any, callback: any) => {
  const opts = typeof options === 'object' && options ? options : {};
  dns.lookup(hostname, { ...opts, all: true }, (err: any, addresses: any) => {
    if (err) return callback(err);
    const list: { address: string; family: number }[] = Array.isArray(addresses) ? addresses : [];
    if (!list.length || list.some(a => isPrivateAddress(a.address))) {
      const e: any = new Error('Endereço interno bloqueado.');
      e.code = 'ENORQVA_BLOCKED';
      return callback(e);
    }
    if (opts.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
};

const realTransport: PageTransport = (url, { timeoutMs, maxBytes }) =>
  new Promise<RawPageResponse>((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https.request : http.request) as typeof http.request;
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const req = request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup as any,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      },
      res => {
        const status = res.statusCode || 0;
        const location = typeof res.headers.location === 'string' ? res.headers.location : null;
        const contentType = String(res.headers['content-type'] || '');
        if (status >= 300 && status < 400) {
          res.resume();
          return done(() => resolve({ status, location, contentType, body: Buffer.alloc(0) }));
        }
        const declared = Number(res.headers['content-length'] || 0);
        if (declared > maxBytes) {
          res.destroy();
          return done(() => reject(new CreativeReferenceError(413, 'A página é grande demais (mais de 3 MB).', 'FETCH')));
        }
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        let stream: NodeJS.ReadableStream = res;
        if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on('data', (c: Buffer) => {
          total += c.length;
          if (total > maxBytes) {
            res.destroy();
            done(() => reject(new CreativeReferenceError(413, 'A página é grande demais (mais de 3 MB).', 'FETCH')));
            return;
          }
          chunks.push(c);
        });
        stream.on('end', () => done(() => resolve({ status, location, contentType, body: Buffer.concat(chunks) })));
        stream.on('error', () => done(() => reject(new CreativeReferenceError(502, 'Não foi possível ler a página.', 'FETCH'))));
      }
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(() => reject(new CreativeReferenceError(504, 'A página demorou mais de 10 segundos para responder.', 'FETCH')));
    }, timeoutMs);
    req.on('error', (err: any) => {
      if (err?.code === 'ENORQVA_BLOCKED') {
        return done(() => reject(new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT')));
      }
      done(() => reject(new CreativeReferenceError(502, 'Não foi possível abrir a página. Confira o link.', 'FETCH')));
    });
    req.end();
  });

let testTransport: PageTransport | null = null;

/** Só para testes: rede e DNS simulados (os testes nunca saem para a internet). */
export function setPageFetchForTests(transport: PageTransport | null, dnsResolver: HostResolver | null = null) {
  testTransport = transport;
  testResolver = dnsResolver;
}

function transport(): PageTransport {
  if (testTransport) return testTransport;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new CreativeReferenceError(502, 'Teste sem página simulada.', 'FETCH');
    };
  }
  return realTransport;
}

function decodeBody(body: Buffer, contentType: string): string {
  const cs = (contentType.match(/charset=["']?([\w-]+)/i)?.[1] || '').toLowerCase();
  let charset = cs;
  if (!charset) {
    const head = body.subarray(0, 2048).toString('latin1');
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
  }
  if (charset === 'iso-8859-1' || charset === 'latin1' || charset === 'windows-1252') return body.toString('latin1');
  return body.toString('utf8');
}

/** Baixa a página (só http/https, IP público, até 3 redirecionamentos conferidos, 10 s, 3 MB). */
export async function fetchPage(rawUrl: string): Promise<{ finalUrl: URL; html: string }> {
  let url = assertSafeUrl(rawUrl);
  await assertPublicHost(url);
  for (let hop = 0; ; hop++) {
    const res = await transport()(url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_PAGE_BYTES });
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop >= MAX_REDIRECTS) throw new CreativeReferenceError(502, 'A página redireciona demais (mais de 3 vezes).', 'FETCH');
      let next: URL;
      try {
        next = new URL(res.location, url);
      } catch {
        throw new CreativeReferenceError(502, 'A página redirecionou para um endereço inválido.', 'FETCH');
      }
      url = assertSafeUrl(next.toString());
      await assertPublicHost(url);
      continue;
    }
    if (res.status >= 400 || res.status < 200) {
      throw new CreativeReferenceError(502, `A página respondeu com erro (HTTP ${res.status}).`, 'FETCH');
    }
    if (res.body.length > MAX_PAGE_BYTES) throw new CreativeReferenceError(413, 'A página é grande demais (mais de 3 MB).', 'FETCH');
    const ct = res.contentType.toLowerCase();
    if (ct && !ct.includes('html') && !ct.startsWith('text/')) {
      throw new CreativeReferenceError(415, 'O link não abre uma página (é outro tipo de arquivo). Envie prints.', 'FETCH');
    }
    return { finalUrl: url, html: decodeBody(res.body, res.contentType) };
  }
}

// ---------------------------------------------------------------------------------------------
// HTML -> blocos (determinístico, sem dependências)
// ---------------------------------------------------------------------------------------------

export type BlockKind = 'heading' | 'paragraph' | 'list' | 'button' | 'image' | 'video' | 'form' | 'testimonial-like' | 'faq-like';

export interface PageBlock {
  kind: BlockKind;
  level?: number;
  wordCount: number;
  /** Texto do bloco: só em memória, nunca gravado. */
  text: string;
  items?: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€',
  ordm: 'º', ordf: 'ª', deg: '°', szlig: 'ß', iexcl: '¡', iquest: '¿', times: '×'
};
const COMBINING: Record<string, string> = { acute: '́', grave: '̀', circ: '̂', tilde: '̃', uml: '̈', cedil: '̧' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ' ';
      try {
        return String.fromCodePoint(code);
      } catch {
        return ' ';
      }
    }
    const lower = body.toLowerCase();
    if (NAMED_ENTITIES[lower] !== undefined) return NAMED_ENTITIES[lower];
    const acc = body.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml|cedil)$/);
    if (acc) return (acc[1] + COMBINING[acc[2]]).normalize('NFC');
    return m.endsWith(';') ? ' ' : m;
  });
}

export function countWords(text: string): number {
  return String(text || '')
    .split(/\s+/)
    .filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

const DROP_WITH_CONTENT = ['script', 'style', 'noscript', 'svg', 'template', 'head', 'nav', 'footer', 'select', 'canvas', 'math', 'object', 'textarea'];
const INLINE = new Set([
  'a', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'mark', 'sup', 'sub', 'label', 'font', 'abbr', 'code', 'del', 'ins',
  'time', 'q', 'cite', 'big', 'kbd', 'var', 'bdi', 'bdo', 'data', 'picture', 'source', 'wbr', 'br'
]);
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const VIDEO_HOSTS = /(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|wistia\.|vturb|pandavideo|panda\.video|converteai|jwplayer|vidalytics|loom\.com)/i;
const BUTTONISH = /(^|[\s_-])(btn|button|botao|cta|comprar|checkout|buy)([\s_-]|$)/i;
const TESTIMONIAL_HINT = /(depoiment|testimon|review|avaliac|avaliaç|feedback|prova-social|social-proof)/i;
const FAQ_HINT = /(faq|pergunta|duvida|dúvida|accordion)/i;
const MAX_BLOCKS = 600;

const attr = (attrs: string, name: string): string => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? m[1] ?? m[2] ?? m[3] ?? '' : '';
};

/** Lê o HTML em blocos ordenados (título, parágrafo, lista, botão, imagem, vídeo, formulário...). */
export function htmlToBlocks(html: string): PageBlock[] {
  let src = String(html || '');
  const body = src.match(/<body\b[^>]*>([\s\S]*)<\/body\s*>/i);
  if (body) src = body[1];
  src = src.replace(/<!--[\s\S]*?-->/g, ' ');
  src = src.replace(/<![^>]*>|<\?[^>]*>/g, ' ');
  // vídeos incorporados viram um marcador; os outros iframes saem
  src = src.replace(/<iframe\b([^>]*)>(?:[\s\S]*?<\/iframe\s*>)?/gi, (_m, a: string) =>
    VIDEO_HOSTS.test(attr(a, 'src') || attr(a, 'data-src')) ? '<video></video>' : ' '
  );
  for (const t of DROP_WITH_CONTENT) {
    src = src.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), ' ');
    src = src.replace(new RegExp(`<${t}\\b[^>]*\\/?>`, 'gi'), ' ');
  }

  const blocks: PageBlock[] = [];
  type Frame = { tag: string; hint: 'testimonial' | 'faq' | null; button: boolean; list: boolean; form: boolean };
  const stack: Frame[] = [];
  let buffer: string[] = [];
  let pendingKind: 'heading' | 'paragraph' | 'button' = 'paragraph';
  let pendingLevel = 0;
  let list: { parts: string[]; items: number; hint: Frame['hint'] } | null = null;

  const hint = (): Frame['hint'] => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].hint) return stack[i].hint;
    return null;
  };
  const inForm = () => stack.some(f => f.form);
  const inButton = () => stack.some(f => f.button);
  const push = (b: PageBlock) => {
    if (blocks.length < MAX_BLOCKS) blocks.push(b);
  };

  const flush = () => {
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];
    if (!text) return;
    const wc = countWords(text);
    if (wc === 0) return;
    if (pendingKind === 'button' && wc <= 20) {
      push({ kind: 'button', wordCount: wc, text });
      return;
    }
    if (list) {
      list.parts.push(text);
      return;
    }
    const h = hint();
    if (pendingKind === 'heading') {
      push({ kind: h === 'faq' ? 'faq-like' : 'heading', level: pendingLevel || 2, wordCount: wc, text });
      return;
    }
    let kind: BlockKind = 'paragraph';
    if (h === 'testimonial') kind = 'testimonial-like';
    else if (h === 'faq') kind = 'faq-like';
    else if (/^["“«]/.test(text) && wc >= 8) kind = 'testimonial-like';
    push({ kind, wordCount: wc, text });
  };

  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined || (m[0] === '<' && m[2] === undefined)) {
      const raw = m[4] !== undefined ? m[4] : '<';
      if (inForm() && !inButton()) continue;
      const t = decodeEntities(raw).replace(/\s+/g, ' ');
      if (t.trim()) buffer.push(t.trim());
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClosing = /\/\s*$/.test(attrs);

    if (!closing) {
      if (tag === 'img') {
        const w = Number(attr(attrs, 'width') || 0);
        const hgt = Number(attr(attrs, 'height') || 0);
        const s = attr(attrs, 'src') || attr(attrs, 'data-src');
        const tracking = (w > 0 && w <= 2) || (hgt > 0 && hgt <= 2) || /facebook\.com\/tr|pixel/i.test(s);
        if (!tracking) {
          if (!list) flush();
          push({ kind: 'image', wordCount: 0, text: '' });
        }
        continue;
      }
      if (tag === 'video') {
        flush();
        push({ kind: 'video', wordCount: 0, text: '' });
        if (!selfClosing) stack.push({ tag, hint: null, button: false, list: false, form: false });
        continue;
      }
      if (tag === 'input') {
        const type = attr(attrs, 'type').toLowerCase();
        if (type === 'submit' || type === 'button') {
          const v = decodeEntities(attr(attrs, 'value')).trim();
          if (v) push({ kind: 'button', wordCount: countWords(v), text: v });
        }
        continue;
      }
      if (VOID.has(tag)) {
        if (tag === 'br') buffer.push(' ');
        else if (tag === 'hr') flush();
        continue;
      }
      const cls = `${attr(attrs, 'class')} ${attr(attrs, 'id')}`;
      const frame: Frame = {
        tag,
        hint: TESTIMONIAL_HINT.test(cls) ? 'testimonial' : FAQ_HINT.test(cls) ? 'faq' : null,
        button: tag === 'button' || (tag === 'a' && (BUTTONISH.test(cls) || attr(attrs, 'role').toLowerCase() === 'button')),
        list: tag === 'ul' || tag === 'ol',
        form: tag === 'form'
      };
      if (frame.form) {
        flush();
        push({ kind: 'form', wordCount: 0, text: '' });
      } else if (frame.button) {
        flush();
        pendingKind = 'button';
      } else if (/^h[1-6]$/.test(tag)) {
        flush();
        pendingKind = 'heading';
        pendingLevel = Number(tag[1]);
      } else if (frame.list) {
        flush();
        if (!list) list = { parts: [], items: 0, hint: hint() || frame.hint };
      } else if (tag === 'li') {
        flush();
        if (list) list.items += 1;
      } else if (!INLINE.has(tag)) {
        flush();
        if (pendingKind !== 'button' && !stack.some(f => /^h[1-6]$/.test(f.tag))) pendingKind = 'paragraph';
      }
      if (!selfClosing) stack.push(frame);
      continue;
    }

    // fechamento: desempilha até a tag correspondente (HTML mal formado é tolerado)
    let idx = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) {
        idx = i;
        break;
      }
    }
    if (idx === -1) continue;
    const frame = stack[idx];
    const isInline = INLINE.has(tag) && !frame.button;
    if (!isInline) flush();
    stack.splice(idx);
    if (frame.button) pendingKind = 'paragraph';
    if (/^h[1-6]$/.test(tag)) pendingKind = 'paragraph';
    if (frame.list && list && !stack.some(f => f.list)) {
      const text = list.parts.join(' ').replace(/\s+/g, ' ').trim();
      const wc = countWords(text);
      if (wc > 0) push({ kind: list.hint === 'faq' ? 'faq-like' : list.hint === 'testimonial' ? 'testimonial-like' : 'list', wordCount: wc, text, items: Math.max(1, list.items) });
      list = null;
    }
  }
  flush();
  if (list) {
    const text = (list as { parts: string[] }).parts.join(' ').trim();
    if (countWords(text) > 0) push({ kind: 'list', wordCount: countWords(text), text, items: Math.max(1, (list as { items: number }).items) });
  }

  // perguntas depois de um título de FAQ viram faq-like
  let faqSection = false;
  for (const b of blocks) {
    if (b.kind === 'heading' && (b.level || 2) <= 2) {
      faqSection = /perguntas frequentes|d[uú]vidas|\bfaq\b/i.test(b.text);
      continue;
    }
    if (faqSection && (b.kind === 'heading' || b.kind === 'paragraph') && /\?\s*$/.test(b.text)) b.kind = 'faq-like';
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Impressões de 6 palavras (anticópia) e limpeza
// ---------------------------------------------------------------------------------------------

export const SHINGLE_SIZE = 6;
const MAX_SHINGLES = 50_000;

export function normalizeWords(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export const shingleHash = (window: string) => crypto.createHash('sha256').update(window).digest('hex').slice(0, 16);

/** Impressões (sha256 cortado em 16) de cada janela de 6 palavras normalizadas. */
export function shingleHashes(text: string, size = SHINGLE_SIZE): string[] {
  const w = normalizeWords(text);
  const out = new Set<string>();
  for (let i = 0; i + size <= w.length; i++) out.add(shingleHash(w.slice(i, i + size).join(' ')));
  return Array.from(out);
}

export function sourceShingles(texts: string[]): string[] {
  const all = new Set<string>();
  for (const t of texts) {
    for (const h of shingleHashes(t)) {
      if (all.size >= MAX_SHINGLES) break;
      all.add(h);
    }
  }
  return Array.from(all);
}

const STOPWORDS = new Set(
  'a o as os um uma uns umas de da do das dos e em no na nos nas por para com sem que se seu sua seus suas voce voces eu ele ela eles elas nos isso isto este esta esse essa aquele aquela mais menos muito muita como quando onde porque pois mas ou ja nao sim the and for with you your this that from are our'.split(
    ' '
  )
);

export interface SourceFingerprint {
  shingles: Set<string>;
  properNouns: Set<string>;
}

const normToken = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Impressões + nomes próprios (palavra com maiúscula no meio da frase que nunca aparece em minúscula). */
export function buildFingerprint(texts: string[]): SourceFingerprint {
  const candidates = new Set<string>();
  const lowerSeen = new Set<string>();
  for (const text of texts) {
    for (const sentence of String(text || '').split(/[.!?…:\n;|•]+/)) {
      const tokens = sentence.split(/\s+/).map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
      tokens.forEach((tok, i) => {
        const n = normToken(tok);
        if (n.length < 3 || STOPWORDS.has(n)) return;
        if (/^\p{Ll}/u.test(tok)) {
          lowerSeen.add(n);
          return;
        }
        const allCaps = /^[\p{Lu}\p{N}]{3,}$/u.test(tok) && /\p{Lu}/u.test(tok);
        if ((i > 0 && /^\p{Lu}/u.test(tok)) || allCaps) candidates.add(n);
      });
    }
  }
  const properNouns = new Set<string>();
  candidates.forEach(c => {
    if (!lowerSeen.has(c)) properNouns.add(c);
  });
  return { shingles: new Set(sourceShingles(texts)), properNouns };
}

const MONEY_OR_MEASURE =
  /((r\$|us\$|u\$|\$|€|£)\s*\d)|(\d\s*(%|por\s*cento|kg\b|kgs\b|quilos?\b|g\b|gramas?\b|reais\b|real\b|d[oó]lar(es)?\b|cm\b|ml\b|lbs?\b))|(\d+[.,]\d{2}\b)/i;

/** true se o texto copia a referência, tem preço/porcentagem/peso ou nome próprio da referência. */
export function looksCopied(s: string, fp: SourceFingerprint): boolean {
  if (!s) return false;
  if (MONEY_OR_MEASURE.test(s)) return true;
  if (shingleHashes(s).some(h => fp.shingles.has(h))) return true;
  for (const tok of s.split(/\s+/)) {
    const n = normToken(tok);
    if (n.length >= 3 && fp.properNouns.has(n)) return true;
  }
  return false;
}

export function sanitizeText(s: string, fp: SourceFingerprint, placeholder: string): string {
  const v = String(s || '').trim();
  if (!v) return placeholder;
  return looksCopied(v, fp) ? placeholder : v;
}

// ---------------------------------------------------------------------------------------------
// Esquema da estrutura
// ---------------------------------------------------------------------------------------------

export const SECTION_ROLES = [
  'HERO_HOOK', 'PAIN', 'AGITATION', 'MECHANISM', 'PRODUCT_REVEAL', 'BENEFITS', 'CONTENTS', 'PROOF_RESULTS', 'TESTIMONIALS',
  'AUTHORITY', 'BONUS', 'OFFER_PRICE', 'GUARANTEE', 'URGENCY', 'FAQ', 'CTA', 'OTHER'
] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];
export const HEADLINE_STYLES = ['QUESTION', 'BOLD_PROMISE', 'CURIOSITY', 'STATEMENT', 'NUMBERED', 'NONE'] as const;
export const LENGTH_CLASSES = ['SHORT', 'MEDIUM', 'LONG'] as const;
export const HOOK_TYPES = ['QUESTION', 'PAIN_POINT', 'BOLD_CLAIM', 'CURIOSITY', 'DEMONSTRATION', 'BEFORE_AFTER', 'STORY', 'TESTIMONIAL', 'OFFER', 'OTHER'] as const;
export const AD_FORMATS = ['VIDEO', 'IMAGE', 'CAROUSEL'] as const;
export const BEAT_ROLES = ['HOOK', 'PROBLEM', 'DEMONSTRATION', 'BENEFIT', 'PROOF', 'OFFER', 'CTA', 'OTHER'] as const;

export const ROLE_PURPOSE: Record<SectionRole, string> = {
  HERO_HOOK: 'Abertura que prende a atenção e diz para quem é a página',
  PAIN: 'Mostra o problema que o leitor sente',
  AGITATION: 'Aprofunda o incômodo e as consequências do problema',
  MECHANISM: 'Explica por que o método funciona',
  PRODUCT_REVEAL: 'Apresenta o produto como a solução',
  BENEFITS: 'Lista os ganhos de quem compra',
  CONTENTS: 'Mostra o que vem dentro do produto',
  PROOF_RESULTS: 'Mostra resultados como prova',
  TESTIMONIALS: 'Depoimentos de clientes',
  AUTHORITY: 'Mostra quem está por trás e por que confiar',
  BONUS: 'Bônus que somam valor à oferta',
  OFFER_PRICE: 'Apresenta a oferta e a forma de pagamento',
  GUARANTEE: 'Garantia que tira o risco da compra',
  URGENCY: 'Motivo para decidir agora',
  FAQ: 'Responde às dúvidas mais comuns',
  CTA: 'Chamada para comprar',
  OTHER: 'Seção de apoio'
};

export const BEAT_PURPOSE: Record<(typeof BEAT_ROLES)[number], string> = {
  HOOK: 'Gancho nos primeiros segundos',
  PROBLEM: 'Mostra o problema',
  DEMONSTRATION: 'Mostra o produto em uso',
  BENEFIT: 'Mostra o ganho principal',
  PROOF: 'Prova ou resultado',
  OFFER: 'Apresenta a oferta',
  CTA: 'Chamada para a ação',
  OTHER: 'Trecho de apoio'
};

const GENERIC = 'Não identificado';

export interface SalesSection {
  order: number;
  role: SectionRole;
  purpose: string;
  headline_style: (typeof HEADLINE_STYLES)[number];
  approx_words: number;
  has_image: boolean;
  has_video: boolean;
  cta_count: number;
}
export interface SalesStructure {
  kind: 'SALES_PAGE';
  sections: SalesSection[];
  tone: string;
  length_class: (typeof LENGTH_CLASSES)[number];
  cta_text_style: string;
  color_mood: string;
}
export interface AdBeat {
  t_from_s: number | null;
  role: (typeof BEAT_ROLES)[number];
  purpose: string;
}
export interface AdStructure {
  kind: 'AD';
  hook_type: (typeof HOOK_TYPES)[number];
  angle: string;
  format: (typeof AD_FORMATS)[number];
  duration_s: number | null;
  on_screen_text: boolean;
  voiceover: boolean;
  structure_beats: AdBeat[];
  cta_style: string;
}
export type ReferenceStructure = SalesStructure | AdStructure;
export type ReferenceType = 'SALES_PAGE' | 'AD';

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => {
  const s = String(v ?? '').trim().toUpperCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
};
const clampInt = (v: unknown, min: number, max: number, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const clampStr = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const bool = (v: unknown) => v === true || v === 'true';
const lengthFromWords = (w: number): (typeof LENGTH_CLASSES)[number] => (w < 600 ? 'SHORT' : w < 2000 ? 'MEDIUM' : 'LONG');

/** Confere o JSON da IA para página de venda; valor desconhecido vira o padrão; sem seções = inválido. */
export function validateSalesStructure(raw: any): SalesStructure | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) return null;
  const sections: SalesSection[] = raw.sections
    .filter((s: any) => s && typeof s === 'object')
    .slice(0, 40)
    .map((s: any, i: number) => ({
      order: i + 1,
      role: pick(s.role, SECTION_ROLES, 'OTHER'),
      purpose: clampStr(s.purpose, 140),
      headline_style: pick(s.headline_style, HEADLINE_STYLES, 'NONE'),
      approx_words: clampInt(s.approx_words, 0, 5000),
      has_image: bool(s.has_image),
      has_video: bool(s.has_video),
      cta_count: clampInt(s.cta_count, 0, 20)
    }));
  if (!sections.length) return null;
  const total = sections.reduce((a, s) => a + s.approx_words, 0);
  return {
    kind: 'SALES_PAGE',
    sections,
    tone: clampStr(raw.tone, 80),
    length_class: pick(raw.length_class, LENGTH_CLASSES, lengthFromWords(total)),
    cta_text_style: clampStr(raw.cta_text_style, 80),
    color_mood: clampStr(raw.color_mood, 80)
  };
}

/** Confere o JSON da IA para anúncio; sem nenhum trecho = inválido. */
export function validateAdStructure(raw: any): AdStructure | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.structure_beats)) return null;
  const beats: AdBeat[] = raw.structure_beats
    .filter((b: any) => b && typeof b === 'object')
    .slice(0, 20)
    .map((b: any) => {
      const t = b.t_from_s === null || b.t_from_s === undefined || b.t_from_s === '' ? null : Number(b.t_from_s);
      return {
        t_from_s: t !== null && Number.isFinite(t) ? Math.min(600, Math.max(0, Math.round(t * 10) / 10)) : null,
        role: pick(b.role, BEAT_ROLES, 'OTHER'),
        purpose: clampStr(b.purpose, 140)
      };
    });
  if (!beats.length) return null;
  const d = raw.duration_s === null || raw.duration_s === undefined || raw.duration_s === '' ? null : Number(raw.duration_s);
  return {
    kind: 'AD',
    hook_type: pick(raw.hook_type, HOOK_TYPES, 'OTHER'),
    angle: clampStr(raw.angle, 140),
    format: pick(raw.format, AD_FORMATS, 'IMAGE'),
    duration_s: d !== null && Number.isFinite(d) && d > 0 ? Math.min(600, Math.round(d)) : null,
    on_screen_text: bool(raw.on_screen_text),
    voiceover: bool(raw.voiceover),
    structure_beats: beats,
    cta_style: clampStr(raw.cta_style, 80)
  };
}

/** Passa a limpeza em TODO texto livre da estrutura. */
export function sanitizeStructure(s: ReferenceStructure, fp: SourceFingerprint): ReferenceStructure {
  if (s.kind === 'SALES_PAGE') {
    return {
      ...s,
      sections: s.sections.map(sec => ({ ...sec, purpose: sanitizeText(sec.purpose, fp, ROLE_PURPOSE[sec.role]) })),
      tone: sanitizeText(s.tone, fp, GENERIC),
      cta_text_style: sanitizeText(s.cta_text_style, fp, GENERIC),
      color_mood: sanitizeText(s.color_mood, fp, GENERIC)
    };
  }
  return {
    ...s,
    angle: sanitizeText(s.angle, fp, GENERIC),
    cta_style: sanitizeText(s.cta_style, fp, GENERIC),
    structure_beats: s.structure_beats.map(b => ({ ...b, purpose: sanitizeText(b.purpose, fp, BEAT_PURPOSE[b.role]) }))
  };
}

// ---------------------------------------------------------------------------------------------
// Estrutura sem IA (palavras-chave), a partir dos blocos
// ---------------------------------------------------------------------------------------------

function guessRole(text: string, blocks: PageBlock[], first: boolean): SectionRole {
  const t = text.toLowerCase();
  if (blocks.some(b => b.kind === 'faq-like') || /perguntas frequentes|d[uú]vidas|\bfaq\b/.test(t)) return 'FAQ';
  if (/garantia|reembolso|devolu[cç]/.test(t)) return 'GUARANTEE';
  if (/b[oô]nus|brinde|de presente/.test(t)) return 'BONUS';
  if (blocks.some(b => b.kind === 'testimonial-like') || /depoimento|o que (dizem|falam)|quem (j[aá] )?(comprou|usou)/.test(t)) return 'TESTIMONIALS';
  if (/r\$\s*\d|por apenas|\bde\s+r\$|oferta|parcel|desconto|investimento|\bpre[cç]o/.test(t)) return 'OFFER_PRICE';
  if (/s[oó] hoje|[uú]ltimas|tempo limitado|acaba (hoje|em)|vagas/.test(t)) return 'URGENCY';
  if (/o que voc[eê] vai (aprender|receber)|conte[uú]do|m[oó]dulo|cap[ií]tulo|dentro d/.test(t)) return 'CONTENTS';
  if (/quem sou|sobre (mim|a autora|o autor|n[oó]s)|criador|criadora/.test(t)) return 'AUTHORITY';
  if (/resultado|antes e depois|comprovad/.test(t)) return 'PROOF_RESULTS';
  if (/benef[ií]cio|vantage|voc[eê] vai/.test(t)) return 'BENEFITS';
  if (/cansad|dificuldade|problema|sofre|frustr/.test(t)) return 'PAIN';
  if (first) return 'HERO_HOOK';
  if (blocks.length > 0 && blocks.every(b => b.kind === 'button')) return 'CTA';
  return 'OTHER';
}

function headlineStyle(text: string | null): (typeof HEADLINE_STYLES)[number] {
  if (!text) return 'NONE';
  const t = text.trim();
  if (/\?\s*$/.test(t)) return 'QUESTION';
  if (/^\d/.test(t)) return 'NUMBERED';
  if (/descubra|segredo|o que ningu[eé]m|por que|conhe[cç]a/i.test(t)) return 'CURIOSITY';
  if (/!\s*$/.test(t) || /garant|transform|nunca mais|f[aá]cil|definitiv/i.test(t)) return 'BOLD_PROMISE';
  return 'STATEMENT';
}

/** Estrutura por palavras-chave (sem IA). Só textos fixos do NORQVA: nada da referência entra. */
export function heuristicStructure(blocks: PageBlock[], type: ReferenceType): ReferenceStructure {
  if (type === 'AD') {
    const beats: AdBeat[] = [{ t_from_s: null, role: 'HOOK', purpose: BEAT_PURPOSE.HOOK }];
    if (blocks.some(b => b.kind === 'paragraph' || b.kind === 'list')) beats.push({ t_from_s: null, role: 'BENEFIT', purpose: BEAT_PURPOSE.BENEFIT });
    if (blocks.some(b => b.kind === 'testimonial-like')) beats.push({ t_from_s: null, role: 'PROOF', purpose: BEAT_PURPOSE.PROOF });
    if (blocks.some(b => b.kind === 'button')) beats.push({ t_from_s: null, role: 'CTA', purpose: BEAT_PURPOSE.CTA });
    const firstHeading = blocks.find(b => b.kind === 'heading');
    return {
      kind: 'AD',
      hook_type: firstHeading && /\?\s*$/.test(firstHeading.text) ? 'QUESTION' : 'OTHER',
      angle: `${GENERIC} (sem IA)`,
      format: blocks.some(b => b.kind === 'video') ? 'VIDEO' : 'IMAGE',
      duration_s: null,
      on_screen_text: false,
      voiceover: false,
      structure_beats: beats,
      cta_style: `${GENERIC} (sem IA)`
    };
  }
  const groups: { heading: PageBlock | null; blocks: PageBlock[] }[] = [];
  for (const b of blocks) {
    const startsSection = b.kind === 'heading' && (b.level || 2) <= 3;
    if (startsSection || groups.length === 0) groups.push({ heading: startsSection ? b : null, blocks: startsSection ? [] : [b] });
    else groups[groups.length - 1].blocks.push(b);
  }
  const sections: SalesSection[] = groups.slice(0, 40).map((g, i) => {
    const text = [g.heading?.text || '', ...g.blocks.map(b => b.text)].join(' ');
    const role = guessRole(text, g.blocks, i === 0);
    return {
      order: i + 1,
      role,
      purpose: ROLE_PURPOSE[role],
      headline_style: headlineStyle(g.heading?.text || null),
      approx_words: (g.heading?.wordCount || 0) + g.blocks.reduce((a, b) => a + b.wordCount, 0),
      has_image: g.blocks.some(b => b.kind === 'image'),
      has_video: g.blocks.some(b => b.kind === 'video'),
      cta_count: g.blocks.filter(b => b.kind === 'button').length
    };
  });
  const total = blocks.reduce((a, b) => a + b.wordCount, 0);
  return {
    kind: 'SALES_PAGE',
    sections: sections.length ? sections : [{ order: 1, role: 'OTHER', purpose: ROLE_PURPOSE.OTHER, headline_style: 'NONE', approx_words: total, has_image: false, has_video: false, cta_count: 0 }],
    tone: `${GENERIC} (sem IA)`,
    length_class: lengthFromWords(total),
    cta_text_style: `${GENERIC} (sem IA)`,
    color_mood: `${GENERIC} (sem IA)`
  };
}

// ---------------------------------------------------------------------------------------------
// IA (OpenAI, como o atendente do WhatsApp)
// ---------------------------------------------------------------------------------------------

export type ReferenceAiClient = (messages: any[], schema: { name: string; schema: any }) => Promise<string | null>;

let testAi: ReferenceAiClient | null = null;
/** Só para testes: IA simulada (os testes nunca falam com a OpenAI). */
export function setReferenceAiForTests(ai: ReferenceAiClient | null) {
  testAi = ai;
}

export function referenceAiConfigured(): boolean {
  if (testAi) return true;
  if (process.env.NODE_ENV === 'test') return false;
  return !!(process.env.OPENAI_API_KEY || '').trim();
}

const openAiClient: ReferenceAiClient = async (messages, schema) => {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  const model = process.env.CREATIVE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 3000,
        messages,
        response_format: { type: 'json_schema', json_schema: { name: schema.name, strict: true, schema: schema.schema } }
      }),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } finally {
    clearTimeout(timer);
  }
};

function ai(): ReferenceAiClient {
  return testAi || openAiClient;
}

const obj = (properties: Record<string, any>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

export function salesSchema(withVisibleText: boolean) {
  const props: Record<string, any> = {
    sections: {
      type: 'array',
      items: obj({
        order: { type: 'integer' },
        role: { type: 'string', enum: [...SECTION_ROLES] },
        purpose: { type: 'string' },
        headline_style: { type: 'string', enum: [...HEADLINE_STYLES] },
        approx_words: { type: 'integer' },
        has_image: { type: 'boolean' },
        has_video: { type: 'boolean' },
        cta_count: { type: 'integer' }
      })
    },
    tone: { type: 'string' },
    length_class: { type: 'string', enum: [...LENGTH_CLASSES] },
    cta_text_style: { type: 'string' },
    color_mood: { type: 'string' }
  };
  if (withVisibleText) props.visible_text = { type: 'string' };
  return { name: 'sales_page_structure', schema: obj(props) };
}

export function adSchema(withVisibleText: boolean) {
  const props: Record<string, any> = {
    hook_type: { type: 'string', enum: [...HOOK_TYPES] },
    angle: { type: 'string' },
    format: { type: 'string', enum: [...AD_FORMATS] },
    duration_s: { type: ['number', 'null'] },
    on_screen_text: { type: 'boolean' },
    voiceover: { type: 'boolean' },
    structure_beats: {
      type: 'array',
      items: obj({ t_from_s: { type: ['number', 'null'] }, role: { type: 'string', enum: [...BEAT_ROLES] }, purpose: { type: 'string' } })
    },
    cta_style: { type: 'string' }
  };
  if (withVisibleText) props.visible_text = { type: 'string' };
  return { name: 'ad_structure', schema: obj(props) };
}

export const SYSTEM_PROMPT = [
  'Você analisa a ESTRUTURA de páginas de venda e de anúncios para um time que vai criar material 100% ORIGINAL.',
  'Descreva só a FUNÇÃO e a FORMA de cada parte (para que serve, como é montada, tamanho aproximado).',
  'Regras obrigatórias:',
  '- nunca copie, cite nem parafraseie frases da referência;',
  '- nunca escreva nomes de marcas, produtos, pessoas, lugares ou empresas;',
  '- nunca escreva números, preços, porcentagens, pesos, medidas ou prazos;',
  '- nunca reproduza depoimentos;',
  '- use descrições curtas e genéricas em português (até 140 caracteres), por exemplo "Abertura com pergunta sobre a dor do leitor".',
  'Responda somente com o JSON do esquema.'
].join('\n');

const VISIBLE_TEXT_RULE =
  'O campo visible_text deve trazer a transcrição literal do texto visível nos prints (até 6000 caracteres). Ele serve só para conferir que nada foi copiado e é descartado em seguida; não use esse texto nos outros campos.';

export interface ScreenshotImage {
  mime: string;
  base64: string;
}

function blocksOutline(blocks: PageBlock[]): string {
  const lines: string[] = [];
  let size = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const line = `${i + 1}. ${b.kind}${b.level ? ` h${b.level}` : ''}${b.items ? ` (${b.items} itens)` : ''} (${b.wordCount} palavras)${b.text ? `: ${b.text.slice(0, 240)}` : ''}`;
    size += line.length + 1;
    if (size > 20000) {
      lines.push(`... (${blocks.length - i} blocos a mais)`);
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function parseJson(content: string | null): any {
  if (!content) return null;
  const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export type ExtractInput = { blocks: PageBlock[] } | { images: ScreenshotImage[]; adText?: string };

export type ExtractResult =
  | { ok: true; structure: ReferenceStructure; method: 'AI' | 'HEURISTIC'; visibleText: string }
  | { ok: false; reason: string };

/** Tira a estrutura: IA quando configurada; sem IA, palavras-chave (só para página lida pelo link). */
export async function extractStructure(input: ExtractInput, type: ReferenceType): Promise<ExtractResult> {
  const shots = 'images' in input ? input : null;
  const blocks: PageBlock[] = 'blocks' in input ? input.blocks : [];
  const isShots = shots !== null;
  if (!referenceAiConfigured()) {
    if (isShots) return { ok: false, reason: 'IA não configurada' };
    return { ok: true, structure: heuristicStructure(blocks, type), method: 'HEURISTIC', visibleText: '' };
  }
  const schema = type === 'AD' ? adSchema(isShots) : salesSchema(isShots);
  const label = type === 'AD' ? 'anúncio' : 'página de venda';
  let messages: any[];
  if (shots) {
    const intro = `Tipo: ${label}. Prints em ordem (de cima para baixo).${
      shots.adText ? `\nTexto do anúncio colado pelo dono (só para entender a estrutura):\n${shots.adText.slice(0, 4000)}` : ''
    }`;
    messages = [
      { role: 'system', content: `${SYSTEM_PROMPT}\n${VISIBLE_TEXT_RULE}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: intro },
          ...shots.images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mime};base64,${img.base64}`, detail: 'high' } }))
        ]
      }
    ];
  } else {
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Tipo: ${label}. Blocos da página em ordem (tipo, palavras e trecho):\n${blocksOutline(blocks)}` }
    ];
  }
  let raw: any = null;
  try {
    raw = parseJson(await ai()(messages, schema));
  } catch (err: any) {
    console.error('[referências] IA falhou:', err?.message || err);
    raw = null;
  }
  const structure = raw ? (type === 'AD' ? validateAdStructure(raw) : validateSalesStructure(raw)) : null;
  if (!structure) {
    if (isShots) return { ok: false, reason: 'A IA não devolveu uma estrutura válida. Tente de novo.' };
    return { ok: true, structure: heuristicStructure(blocks, type), method: 'HEURISTIC', visibleText: '' };
  }
  const visibleText = isShots && typeof raw?.visible_text === 'string' ? raw.visible_text.slice(0, 20000) : '';
  return { ok: true, structure, method: 'AI', visibleText };
}

// ---------------------------------------------------------------------------------------------
// Prints
// ---------------------------------------------------------------------------------------------

export const MAX_SCREENSHOTS = 5;
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

/** Confere os prints (1 a 5, até 4 MB cada, PNG/JPEG/WEBP/GIF). Nada é gravado. */
export function parseScreenshots(list: unknown): ScreenshotImage[] {
  if (!Array.isArray(list) || list.length === 0) throw new CreativeReferenceError(400, 'Envie de 1 a 5 prints.', 'INPUT');
  if (list.length > MAX_SCREENSHOTS) throw new CreativeReferenceError(400, 'No máximo 5 prints por referência.', 'INPUT');
  return list.map((item: any, i: number) => {
    const raw = String(typeof item === 'string' ? item : item?.data || '');
    const b64 = raw.replace(/^data:[^;,]+;base64,/i, '').replace(/\s+/g, '');
    if (!b64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) throw new CreativeReferenceError(400, `O print ${i + 1} não pôde ser lido.`, 'INPUT');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_SCREENSHOT_BYTES) throw new CreativeReferenceError(400, `O print ${i + 1} passa de 4 MB.`, 'INPUT');
    const mime = sniffMime(buf);
    if (!mime) throw new CreativeReferenceError(400, `O print ${i + 1} não é uma imagem PNG, JPG, WEBP ou GIF.`, 'INPUT');
    return { mime, base64: b64 };
  });
}

// ---------------------------------------------------------------------------------------------
// Gravação, lista, lixeira
// ---------------------------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_COLUMNS = `r.id, r.human_id, r.product_id, p.name AS product_name, r.source_kind, r.source_url, r.source_host, r.reference_type,
  r.status, r.failure_reason, r.extraction_method, r.structure, r.source_word_count, r.source_shingle_count AS shingle_count,
  r.notes, r.data_provenance, r.created_at, r.updated_at, r.deleted_at, u.name AS created_by_name`;
const FROM = `FROM creative_references r LEFT JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.created_by`;

async function nextHumanId(db: Pool | PoolClient): Promise<string> {
  try {
    for (;;) {
      const res = await db.query(`SELECT nextval('seq_creative_references_human_id') AS num`);
      const candidate = `REF-${String(parseInt(res.rows[0].num, 10)).padStart(6, '0')}`;
      const taken = await db.query('SELECT 1 FROM creative_references WHERE human_id = $1 LIMIT 1', [candidate]);
      if (taken.rows.length === 0) return candidate;
    }
  } catch {
    const res = await db.query(`SELECT human_id FROM creative_references WHERE human_id LIKE 'REF-%' ORDER BY human_id DESC LIMIT 1`);
    const last = res.rows[0]?.human_id;
    const n = last ? parseInt(String(last).replace('REF-', ''), 10) : 0;
    return `REF-${String((Number.isFinite(n) ? n : 0) + 1).padStart(6, '0')}`;
  }
}

async function actorId(pool: Pool, userId: string | null) {
  if (!userId || !UUID_RE.test(userId)) return null;
  return (await pool.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0]?.id || null;
}

function publicRow(row: any) {
  if (!row) return null;
  let structure = row.structure;
  if (typeof structure === 'string') {
    try {
      structure = JSON.parse(structure);
    } catch {
      structure = null;
    }
  }
  return { ...row, structure, shingle_count: Number(row.shingle_count || 0) };
}

export interface CreateReferenceInput {
  url?: unknown;
  images?: unknown;
  adText?: unknown;
  productId: unknown;
  referenceType: unknown;
  notes?: unknown;
}

export class CreativeReferenceService {
  constructor(private pool: Pool) {}

  async createReference(input: CreateReferenceInput, userId: string | null) {
    const type = String(input.referenceType || '').toUpperCase();
    if (type !== 'SALES_PAGE' && type !== 'AD') throw new CreativeReferenceError(400, 'Escolha o tipo: página de venda ou anúncio.', 'INPUT');
    const productId = String(input.productId || '');
    if (!UUID_RE.test(productId)) throw new CreativeReferenceError(400, 'Escolha um produto.', 'INPUT');
    const prod = await this.pool.query('SELECT id FROM products WHERE id = $1 AND deleted_at IS NULL', [productId]);
    if (!prod.rows.length) throw new CreativeReferenceError(400, 'Produto não encontrado.', 'INPUT');
    const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 1000) : null;

    const isShots = input.images !== undefined && input.images !== null;
    let sourceUrl: string | null = null;
    let sourceHost: string | null = null;
    // textos da referência: só nesta função, nunca gravados
    let texts: string[] = [];
    let extraction: ExtractResult;

    if (isShots) {
      const images = parseScreenshots(input.images);
      const adText = typeof input.adText === 'string' ? input.adText.slice(0, 5000) : '';
      extraction = await extractStructure({ images, adText: adText || undefined }, type);
      texts = [adText, extraction.ok ? extraction.visibleText : ''].filter(Boolean);
    } else {
      const url = assertSafeUrl(input.url);
      sourceUrl = `${url.origin}${url.pathname}`.slice(0, 2048);
      sourceHost = url.hostname.toLowerCase().slice(0, 255);
      let blocks: PageBlock[] = [];
      try {
        const page = await fetchPage(url.toString());
        blocks = htmlToBlocks(page.html);
      } catch (err) {
        if (err instanceof CreativeReferenceError && err.kind === 'FETCH') {
          return this.persist({ type, productId, notes, sourceKind: 'PAGE_URL', sourceUrl, sourceHost, failure: err.message }, userId);
        }
        throw err;
      }
      const words = blocks.reduce((a, b) => a + b.wordCount, 0);
      if (words < 20) {
        return this.persist(
          {
            type, productId, notes, sourceKind: 'PAGE_URL', sourceUrl, sourceHost,
            failure: 'Não deu para ler o texto da página (pode ser feita só de imagens ou montada por script). Envie prints.'
          },
          userId
        );
      }
      texts = blocks.map(b => b.text).filter(Boolean);
      extraction = await extractStructure({ blocks }, type);
    }

    if (!extraction.ok) {
      return this.persist({ type, productId, notes, sourceKind: isShots ? 'SCREENSHOTS' : 'PAGE_URL', sourceUrl, sourceHost, failure: extraction.reason }, userId);
    }
    const fp = buildFingerprint(texts);
    const structure = sanitizeStructure(extraction.structure, fp);
    const shingles = Array.from(fp.shingles);
    const wordCount = texts.reduce((a, t) => a + countWords(t), 0);
    texts = [];
    return this.persist(
      { type, productId, notes, sourceKind: isShots ? 'SCREENSHOTS' : 'PAGE_URL', sourceUrl, sourceHost, structure, method: extraction.method, shingles, wordCount },
      userId
    );
  }

  private async persist(
    r: {
      type: string;
      productId: string;
      notes: string | null;
      sourceKind: 'PAGE_URL' | 'SCREENSHOTS';
      sourceUrl: string | null;
      sourceHost: string | null;
      failure?: string;
      structure?: ReferenceStructure;
      method?: 'AI' | 'HEURISTIC';
      shingles?: string[];
      wordCount?: number;
    },
    userId: string | null
  ) {
    const actor = await actorId(this.pool, userId);
    const hid = await nextHumanId(this.pool);
    const status = r.failure ? 'FAILED' : 'READY';
    const ins = await this.pool.query(
      `INSERT INTO creative_references
         (human_id, product_id, source_kind, source_url, source_host, reference_type, status, failure_reason, extraction_method,
          structure, source_word_count, source_shingles, source_shingle_count, notes, data_provenance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::text[], $13, $14, 'COMMERCIAL_PRODUCTION', $15)
       RETURNING id`,
      [
        hid, r.productId, r.sourceKind, r.sourceUrl, r.sourceHost, r.type, status, r.failure ? r.failure.slice(0, 500) : null,
        r.method || null, r.structure ? JSON.stringify(r.structure) : null, r.wordCount || 0, r.shingles || [], (r.shingles || []).length, r.notes, actor
      ]
    );
    const what = r.type === 'AD' ? 'anúncio' : 'página de venda';
    const from = r.sourceKind === 'SCREENSHOTS' ? 'prints' : r.sourceHost || 'link';
    await writeAuditLog(
      this.pool, actor, 'CREATIVE_REFERENCE_CREATED',
      `Referência ${hid} (${what}, ${from}): ${status === 'READY' ? 'estrutura pronta' : 'falhou'}.`,
      null, JSON.stringify({ status, method: r.method || null, sections: r.structure ? (r.structure.kind === 'SALES_PAGE' ? r.structure.sections.length : r.structure.structure_beats.length) : 0 }),
      false, false
    );
    return this.get(ins.rows[0].id, true);
  }

  async list() {
    const active = await this.pool.query(`SELECT ${PUBLIC_COLUMNS} ${FROM} WHERE r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 200`);
    const trash = await this.pool.query(`SELECT ${PUBLIC_COLUMNS} ${FROM} WHERE r.deleted_at IS NOT NULL ORDER BY r.deleted_at DESC LIMIT 100`);
    return { references: active.rows.map(publicRow), trash: trash.rows.map(publicRow) };
  }

  async get(id: string, includeDeleted = false) {
    if (!UUID_RE.test(String(id || ''))) throw new CreativeReferenceError(404, 'Referência não encontrada.');
    const r = await this.pool.query(`SELECT ${PUBLIC_COLUMNS} ${FROM} WHERE r.id = $1`, [id]);
    const row = r.rows[0];
    if (!row || (!includeDeleted && row.deleted_at)) throw new CreativeReferenceError(404, 'Referência não encontrada.');
    return publicRow(row);
  }

  async softDelete(id: string, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CreativeReferenceError(404, 'Referência não encontrada.');
    const actor = await actorId(this.pool, userId);
    const upd = await this.pool.query(
      `UPDATE creative_references SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING human_id`,
      [id, actor]
    );
    if (!upd.rows.length) throw new CreativeReferenceError(404, 'Referência não encontrada (ou já está na lixeira).');
    await writeAuditLog(this.pool, actor, 'CREATIVE_REFERENCE_DELETED', `Referência ${upd.rows[0].human_id} foi para a lixeira.`, null, null, false, false);
    return { id, human_id: upd.rows[0].human_id };
  }

  async restore(id: string, userId: string | null) {
    if (!UUID_RE.test(String(id || ''))) throw new CreativeReferenceError(404, 'Referência não encontrada.');
    const actor = await actorId(this.pool, userId);
    const upd = await this.pool.query(
      `UPDATE creative_references SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING human_id`,
      [id]
    );
    if (!upd.rows.length) throw new CreativeReferenceError(409, 'A referência não está na lixeira.');
    await writeAuditLog(this.pool, actor, 'CREATIVE_REFERENCE_RESTORED', `Referência ${upd.rows[0].human_id} restaurada da lixeira.`, null, null, false, false);
    return { id, human_id: upd.rows[0].human_id };
  }
}
