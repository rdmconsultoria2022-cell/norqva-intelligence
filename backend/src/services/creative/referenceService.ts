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
import { referenceScore } from './referenceScore';

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
    (a === 192 && b === 88 && c === 99) ||
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
  if (zeros(0, 4) && h[4] === 0xffff && h[5] === 0) return ipv4Private(v4From(h[6], h[7])); // ::ffff:0:a.b.c.d
  if (zeros(0, 6)) return true; // IPv4 compatível (obsoleto)
  if (h[0] === 0x100 && zeros(1, 4)) return true; // 100::/64 (descarte)
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  if (h[0] === 0x64 && h[1] === 0xff9b && h[2] === 1) return true; // 64:ff9b:1::/48 (tradução local)
  if (h[0] === 0x64 && h[1] === 0xff9b) return ipv4Private(v4From(h[6], h[7])); // NAT64
  if (h[0] === 0x2002) return ipv4Private(v4From(h[1], h[2])); // 6to4
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentação
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  return false;
}

// D-0115: nada de raspar a Biblioteca de Anúncios da Meta; anúncio da Meta entra por prints
const META_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'fb.watch', 'fbcdn.net', 'instagram.com'];
export const META_LINK_MESSAGE = 'Para anúncios da Biblioteca da Meta, envie prints em vez do link.';
const isMetaHost = (host: string) => META_HOSTS.some(d => host === d || host.endsWith(`.${d}`));

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
  if (isMetaHost(host)) throw new CreativeReferenceError(400, META_LINK_MESSAGE, 'INPUT');
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

export const DNS_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new CreativeReferenceError(504, message, 'FETCH')), Math.max(1, ms));
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Resolve o nome (com tempo máximo) e recusa se QUALQUER endereço for interno. */
export async function assertPublicHost(url: URL, timeoutMs = DNS_TIMEOUT_MS): Promise<void> {
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new CreativeReferenceError(400, 'Endereço interno não é aceito.', 'INPUT');
    return;
  }
  let addrs: string[];
  try {
    addrs = await withTimeout(resolver()(host), Math.min(timeoutMs, DNS_TIMEOUT_MS), 'O endereço demorou para responder.');
  } catch (err) {
    if (err instanceof CreativeReferenceError) throw err;
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

let testLookup: ((hostname: string, options: any, cb: (err: any, addresses: any) => void) => void) | null = null;
/** Só para testes: troca o dns.lookup usado na hora de conectar. */
export function setDnsLookupForTests(fn: typeof testLookup) {
  testLookup = fn;
}

// A conexão confere o IP na hora de conectar (evita troca de DNS entre a checagem e o pedido).
export const guardedLookup = (hostname: string, options: any, callback: any) => {
  const opts = typeof options === 'object' && options ? options : {};
  const lookup: any = testLookup || dns.lookup;
  lookup(hostname, { ...opts, all: true }, (err: any, addresses: any) => {
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

/** Transporte real (http/https do Node). Exportado só para os testes com servidor local. */
export const nodeTransport: PageTransport = (url, { timeoutMs, maxBytes }) =>
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
        let decoder: zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null = null;
        if (enc === 'gzip' || enc === 'x-gzip') decoder = zlib.createGunzip();
        else if (enc === 'deflate') decoder = zlib.createInflate();
        else if (enc === 'br') decoder = zlib.createBrotliDecompress();
        const stream: NodeJS.ReadableStream = decoder ? res.pipe(decoder) : res;
        const chunks: Buffer[] = [];
        let total = 0;
        stream.on('data', (c: Buffer) => {
          if (settled) return;
          total += c.length;
          if (total > maxBytes) {
            res.destroy();
            decoder?.destroy();
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
  return nodeTransport;
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
export async function fetchPage(rawUrl: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ finalUrl: URL; html: string }> {
  // um prazo só para tudo (DNS + todos os redirecionamentos)
  const deadline = Date.now() + timeoutMs;
  const left = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new CreativeReferenceError(504, 'A página demorou mais de 10 segundos para responder.', 'FETCH');
    return ms;
  };
  let url = assertSafeUrl(rawUrl);
  await assertPublicHost(url, left());
  for (let hop = 0; ; hop++) {
    const res = await withTimeout(
      transport()(url, { timeoutMs: left(), maxBytes: MAX_PAGE_BYTES }),
      left(),
      'A página demorou mais de 10 segundos para responder.'
    );
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop >= MAX_REDIRECTS) throw new CreativeReferenceError(502, 'A página redireciona demais (mais de 3 vezes).', 'FETCH');
      let next: URL;
      try {
        next = new URL(res.location, url);
      } catch {
        throw new CreativeReferenceError(502, 'A página redirecionou para um endereço inválido.', 'FETCH');
      }
      url = assertSafeUrl(next.toString());
      await assertPublicHost(url, left());
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
export const MAX_BLOCKS = 600;

const MAX_ATTR_SCAN = 4000;
const MAX_STACK = 256;
const attr = (attrs: string, name: string): string => {
  const m = attrs.slice(0, MAX_ATTR_SCAN).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? m[1] ?? m[2] ?? m[3] ?? '' : '';
};

/** Minúsculas só em A-Z (mantém o tamanho da string, para os índices baterem). */
const asciiLower = (s: string) => s.replace(/[A-Z]/g, c => c.toLowerCase());
const TAG_NAME_RE = /^<([a-z][a-z0-9-]*)/;

/**
 * Tira comentários, declarações e as tags com conteúdo que não interessa (script, style, nav...) numa
 * passada linear com indexOf (sem regex com retrocesso: HTML sem fechamento não trava o servidor).
 * Comentário ou tag sem fechamento: descarta até o fim. iframe de vídeo vira um marcador <video>.
 */
export function stripNoise(html: string): string {
  let src = String(html || '');
  let lower = asciiLower(src);
  // só o <body>, quando houver
  const bodyAt = lower.indexOf('<body');
  if (bodyAt !== -1) {
    const gt = src.indexOf('>', bodyAt);
    if (gt !== -1) {
      const close = lower.lastIndexOf('</body');
      src = close > gt ? src.slice(gt + 1, close) : src.slice(gt + 1);
      lower = asciiLower(src);
    }
  }
  // posição do próximo fechamento de cada tag, guardada (e "não tem" também): nada é varrido duas vezes
  const closeCache = new Map<string, number>();
  const findClose = (name: string, from: number) => {
    const cached = closeCache.get(name);
    if (cached !== undefined && (cached === -1 || cached >= from)) return cached;
    const at = lower.indexOf(`</${name}`, from);
    closeCache.set(name, at);
    return at;
  };
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      out.push(src.slice(i));
      break;
    }
    out.push(src.slice(i, lt));
    if (lower.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) break;
      out.push(' ');
      i = end + 3;
      continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const gt = src.indexOf('>', lt + 1);
      if (gt === -1) break;
      out.push(' ');
      i = gt + 1;
      continue;
    }
    const m = TAG_NAME_RE.exec(lower.slice(lt, lt + 24));
    const name = m ? m[1] : '';
    if (name === 'iframe') {
      const gt = src.indexOf('>', lt);
      if (gt === -1) break;
      const attrs = src.slice(lt + 7, gt);
      const close = findClose('iframe', gt);
      const closeGt = close === -1 ? -1 : src.indexOf('>', close);
      out.push(VIDEO_HOSTS.test(attr(attrs, 'src') || attr(attrs, 'data-src')) ? '<video></video>' : ' ');
      i = close === -1 ? gt + 1 : closeGt === -1 ? src.length : closeGt + 1;
      continue;
    }
    if (name && DROP_WITH_CONTENT.includes(name)) {
      const gt = src.indexOf('>', lt);
      if (gt === -1) break;
      if (src[gt - 1] === '/') {
        out.push(' ');
        i = gt + 1;
        continue;
      }
      const close = findClose(name, gt);
      if (close === -1) break; // sem fechamento: descarta até o fim
      const closeGt = src.indexOf('>', close);
      out.push(' ');
      i = closeGt === -1 ? src.length : closeGt + 1;
      continue;
    }
    out.push('<');
    i = lt + 1;
  }
  return out.join('');
}

/** Lê o HTML em blocos ordenados (título, parágrafo, lista, botão, imagem, vídeo, formulário...). */
export function htmlToBlocks(html: string): PageBlock[] {
  const src = stripNoise(html);

  const blocks: PageBlock[] = [];
  type Frame = { tag: string; hint: 'testimonial' | 'faq' | null; button: boolean; list: boolean; form: boolean; effHint?: 'testimonial' | 'faq' | null };
  const stack: Frame[] = [];
  let buffer: string[] = [];
  let pendingKind: 'heading' | 'paragraph' | 'button' = 'paragraph';
  let pendingLevel = 0;
  let list: { parts: string[]; items: number; hint: Frame['hint'] } | null = null;

  // contadores (nada de percorrer a pilha a cada token: HTML muito aninhado continua linear)
  const depth = { form: 0, button: 0, heading: 0, list: 0 };
  const isHeading = (t: string) => t.length === 2 && t[0] === 'h' && t[1] >= '1' && t[1] <= '6';
  const pushFrame = (f: Frame) => {
    if (stack.length >= MAX_STACK) return;
    f.effHint = f.hint || (stack.length ? stack[stack.length - 1].effHint || null : null);
    stack.push(f);
    if (f.form) depth.form++;
    if (f.button) depth.button++;
    if (f.list) depth.list++;
    if (isHeading(f.tag)) depth.heading++;
  };
  const popTo = (idx: number) => {
    for (let k = stack.length - 1; k >= idx; k--) {
      const f = stack[k];
      if (f.form) depth.form--;
      if (f.button) depth.button--;
      if (f.list) depth.list--;
      if (isHeading(f.tag)) depth.heading--;
    }
    stack.length = idx;
  };
  const hint = (): Frame['hint'] => (stack.length ? stack[stack.length - 1].effHint || null : null);
  const inForm = () => depth.form > 0;
  const inButton = () => depth.button > 0;
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

  const handleText = (raw: string) => {
    if (inForm() && !inButton()) return;
    const t = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    if (t) buffer.push(t);
  };

  // tokenizador linear: indexOf para '<' e '>' (o próximo '>' fica guardado para não varrer de novo)
  let pos = 0;
  let nextGt = -2;
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    const textEnd = lt === -1 ? src.length : lt;
    if (textEnd > pos) handleText(src.slice(pos, textEnd));
    if (lt === -1) break;
    if (nextGt !== -1 && nextGt <= lt) nextGt = src.indexOf('>', lt + 1);
    if (nextGt === -1) {
      handleText(src.slice(lt));
      break;
    }
    const inner = src.slice(lt + 1, nextGt);
    const tm = /^(\/?)([a-zA-Z][\w:-]*)/.exec(inner);
    if (!tm) {
      handleText('<');
      pos = lt + 1;
      continue;
    }
    pos = nextGt + 1;
    const m = [tm[0], tm[1], tm[2], inner.slice(tm[0].length)];
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    const selfClosing = attrs.trimEnd().endsWith('/');

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
        if (!selfClosing) pushFrame({ tag, hint: null, button: false, list: false, form: false });
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
        if (pendingKind !== 'button' && depth.heading === 0) pendingKind = 'paragraph';
      }
      if (!selfClosing) pushFrame(frame);
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
    popTo(idx);
    if (frame.button) pendingKind = 'paragraph';
    if (/^h[1-6]$/.test(tag)) pendingKind = 'paragraph';
    if (frame.list && list && depth.list === 0) {
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

/**
 * Tudo que a limpeza precisa saber da referência. Só as impressões de 6 palavras vão para o banco;
 * o resto (janelas de 3 palavras, textos normalizados e nomes) vive só em memória e some com a requisição.
 */
export interface SourceFingerprint {
  shingles: Set<string>;
  properNouns: Set<string>;
  trigrams: Set<string>;
  normalizedTexts: string[];
  nameSequences: string[];
  truncated: boolean;
}

const MAX_TOKEN = 64;
const MAX_TRIGRAMS = 300_000;
const MAX_RUN = 8;

const normToken = (t: string) =>
  t
    .slice(0, MAX_TOKEN)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

const stripPunct = (t: string) => (t.length > MAX_TOKEN ? '' : t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));

/**
 * Impressões + nomes próprios (palavra com maiúscula no meio da frase que nunca aparece em minúscula)
 * + sequências de 2 ou mais palavras com maiúscula (marcas feitas de palavras comuns, como "Seca Barriga").
 */
export function buildFingerprint(texts: string[]): SourceFingerprint {
  const candidates = new Set<string>();
  const lowerSeen = new Set<string>();
  const sequences = new Set<string>();
  const trigrams = new Set<string>();
  const normalizedTexts: string[] = [];
  let truncated = false;
  const addRun = (run: string[]) => {
    const r = run.slice(0, MAX_RUN);
    for (let a = 0; a < r.length; a++) {
      for (let b = a + 2; b <= r.length; b++) {
        const part = r.slice(a, b);
        if (part.some(w => w.length >= 3 && !STOPWORDS.has(w))) sequences.add(part.join(' '));
      }
    }
  };
  for (const text of texts) {
    const words = normalizeWords(text);
    if (words.length) normalizedTexts.push(` ${words.join(' ')} `);
    for (let i = 0; i + 3 <= words.length; i++) {
      if (trigrams.size >= MAX_TRIGRAMS) {
        truncated = true;
        break;
      }
      trigrams.add(words.slice(i, i + 3).join(' '));
    }
    for (const sentence of String(text || '').split(/[.!?…:\n;|•]+/)) {
      const tokens = sentence.split(/\s+/).map(stripPunct).filter(Boolean);
      let run: string[] = [];
      tokens.forEach((tok, i) => {
        const n = normToken(tok);
        const capital = /^\p{Lu}/u.test(tok) && n.length >= 2 && !/^\d/.test(n);
        if (capital) run.push(n);
        else {
          if (run.length >= 2) addRun(run);
          run = [];
        }
        if (n.length < 3 || STOPWORDS.has(n)) return;
        if (/^\p{Ll}/u.test(tok)) {
          lowerSeen.add(n);
          return;
        }
        const allCaps = /^[\p{Lu}\p{N}]{3,}$/u.test(tok) && /\p{Lu}/u.test(tok);
        if ((i > 0 && /^\p{Lu}/u.test(tok)) || allCaps) candidates.add(n);
      });
      if (run.length >= 2) addRun(run);
    }
  }
  const properNouns = new Set<string>();
  candidates.forEach(c => {
    if (!lowerSeen.has(c)) properNouns.add(c);
  });
  const shingles = new Set(sourceShingles(texts));
  if (shingles.size >= MAX_SHINGLES) truncated = true;
  return { shingles, properNouns, trigrams, normalizedTexts, nameSequences: Array.from(sequences), truncated };
}

/**
 * true se o texto pode ter vindo da referência: qualquer número, janela de 6 ou de 3 palavras igual,
 * o texto inteiro dentro de um trecho da referência, nome próprio ou sequência de nomes da referência.
 */
export function looksCopied(s: string, fp: SourceFingerprint): boolean {
  if (!s) return false;
  if (/\d/.test(s)) return true;
  const words = normalizeWords(s);
  if (!words.length) return false;
  if (shingleHashes(s).some(h => fp.shingles.has(h))) return true;
  for (let i = 0; i + 3 <= words.length; i++) if (fp.trigrams.has(words.slice(i, i + 3).join(' '))) return true;
  const whole = ` ${words.join(' ')} `;
  if (fp.normalizedTexts.some(t => t.includes(whole))) return true;
  if (fp.nameSequences.some(seq => whole.includes(` ${seq} `))) return true;
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
/**
 * NORQVA-0119: sinais de força vistos nos prints da Biblioteca de Anúncios da Meta (data de início e quantos
 * anúncios usam o mesmo criativo). Não é texto da referência; servem só para a nota estimada da Fábrica.
 */
export interface ReferenceSignals {
  /** Data de "Veiculação iniciada em", se aparece nos prints (AAAA-MM-DD). */
  started_on: string | null;
  /** Último dia no ar, quando o anúncio já saiu do ar (a Biblioteca mostra um intervalo). Null = ainda no ar. */
  ended_on: string | null;
  /** Dias no ar (do início até o fim ou até a análise), calculado no servidor. */
  active_days: number | null;
  /** Quantos anúncios usam esse criativo/texto, se aparece. */
  ads_using_creative: number | null;
  /** Data da análise (AAAA-MM-DD), base do cálculo de dias. */
  observed_on: string;
}

export interface SalesStructure {
  kind: 'SALES_PAGE';
  sections: SalesSection[];
  tone: string;
  length_class: (typeof LENGTH_CLASSES)[number];
  cta_text_style: string;
  color_mood: string;
  signals?: ReferenceSignals | null;
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
  signals?: ReferenceSignals | null;
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

const DAY_MS = 86400000;
const BR_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Dia de hoje no horário de Brasília (AAAA-MM-DD). */
export const brDay = (now: Date = new Date()) => BR_DAY.format(now);

const validDay = (v: unknown): string | null => {
  const d = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d ? d : null;
};

/**
 * NORQVA-0119: confere os sinais vindos da IA. Datas só no formato AAAA-MM-DD, de 2010 até hoje (horário de
 * Brasília); fim antes do início é descartado. Dias no ar calculados aqui (a IA não faz conta): até o fim, se o
 * anúncio já saiu do ar, ou até hoje. Quantidade de anúncios de 1 a 10000. Sem nenhum sinal válido = null.
 */
export function validateSignals(raw: any, now: Date = new Date()): ReferenceSignals | null {
  if (!raw || typeof raw !== 'object') return null;
  const today = brDay(now);
  const inRange = (d: string | null) => (d && d >= '2010-01-01' && d <= today ? d : null);
  const started = inRange(validDay(raw.started_on));
  let ended = inRange(validDay(raw.ended_on));
  if (ended && started && ended < started) ended = null;
  const days = started ? Math.round((Date.parse(`${ended || today}T00:00:00Z`) - Date.parse(`${started}T00:00:00Z`)) / DAY_MS) : null;
  const n = Number(raw.ads_using_creative);
  const ads = raw.ads_using_creative !== null && raw.ads_using_creative !== undefined && Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null;
  if (started === null && ads === null) return null;
  return { started_on: started, ended_on: started ? ended : null, active_days: days, ads_using_creative: ads, observed_on: today };
}

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
    color_mood: clampStr(raw.color_mood, 80),
    signals: validateSignals(raw.signals)
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
    cta_style: clampStr(raw.cta_style, 80),
    signals: validateSignals(raw.signals)
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

/** Troca todo texto livre pelos textos fixos do NORQVA (prints sem texto suficiente para conferir cópia). */
export function genericStructure(s: ReferenceStructure): ReferenceStructure {
  if (s.kind === 'SALES_PAGE') {
    return {
      ...s,
      sections: s.sections.map(sec => ({ ...sec, purpose: ROLE_PURPOSE[sec.role] })),
      tone: GENERIC,
      cta_text_style: GENERIC,
      color_mood: GENERIC
    };
  }
  return { ...s, angle: GENERIC, cta_style: GENERIC, structure_beats: s.structure_beats.map(b => ({ ...b, purpose: BEAT_PURPOSE[b.role] })) };
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
        max_completion_tokens: 8000,
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

// NORQVA-0119: só nos prints (a Biblioteca de Anúncios mostra a data de início e quantos anúncios usam o criativo)
const SIGNALS_SCHEMA = obj({ started_on: { type: ['string', 'null'] }, ended_on: { type: ['string', 'null'] }, ads_using_creative: { type: ['integer', 'null'] } });

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
  if (withVisibleText) {
    props.visible_text = { type: 'string' };
    props.signals = SIGNALS_SCHEMA;
  }
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
  if (withVisibleText) {
    props.visible_text = { type: 'string' };
    props.signals = SIGNALS_SCHEMA;
  }
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

const VISIBLE_TEXT_RULE = [
  'O campo visible_text deve trazer a transcrição literal do texto visível nos prints (até 6000 caracteres). Ele serve só para conferir que nada foi copiado e é descartado em seguida; não use esse texto nos outros campos.',
  'O campo signals é a única exceção à regra dos números: se o print for da Biblioteca de Anúncios da Meta, informe em started_on a data de "Veiculação iniciada em" no formato AAAA-MM-DD; se o anúncio estiver inativo e aparecer um intervalo de datas, informe o último dia em ended_on (senão null); em ads_using_creative, quantos anúncios usam esse criativo e texto (quando aparecer). Se não aparecer, use null. Não invente.'
].join('\n');

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
    const intro = `Tipo: ${label}. Hoje é ${brDay()}. Prints em ordem (de cima para baixo).${
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
const PUBLIC_COLUMNS = `r.id, r.human_id, r.product_id, p.name AS product_name, r.source_kind, r.source_host, r.reference_type,
  r.status, r.failure_reason, r.extraction_method, r.structure, r.source_word_count, r.source_shingle_count AS shingle_count, r.fingerprint_truncated,
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
  // NORQVA-0119: nota de força estimada (conta pura sobre a estrutura e os sinais dos prints)
  return { ...row, structure, shingle_count: Number(row.shingle_count || 0), score: row.status === 'READY' ? referenceScore(structure) : null };
}

export const MIN_SCREENSHOT_WORDS = 15;
const NOTES_REMOVED = 'Observação removida (parecia texto da referência).';
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|ttclid|msclkid|src|ref|sck|xcod)$/i;

/** sha256 do link normalizado (domínio em minúsculas, sem #, sem parâmetros de rastreio, parâmetros em ordem). */
export function urlHash(url: URL): string {
  const params = Array.from(url.searchParams.entries())
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1));
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const qs = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  return crypto.createHash('sha256').update(`${url.protocol}//${url.hostname.toLowerCase()}${path}${qs}`).digest('hex');
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
    const rawNotes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim().slice(0, 1000) : null;

    const isShots = input.images !== undefined && input.images !== null;
    const kind: 'PAGE_URL' | 'SCREENSHOTS' = isShots ? 'SCREENSHOTS' : 'PAGE_URL';
    let sourceUrlHash: string | null = null;
    let sourceHost: string | null = null;
    // textos da referência: só nesta função, nunca gravados
    let texts: string[] = [];
    let blocksTruncated = false;
    let extraction: ExtractResult;
    const base = () => ({ type, productId, sourceKind: kind, sourceUrlHash, sourceHost });

    if (isShots) {
      const images = parseScreenshots(input.images);
      const adText = typeof input.adText === 'string' ? input.adText.slice(0, 5000) : '';
      extraction = await extractStructure({ images, adText: adText || undefined }, type);
      texts = [adText, extraction.ok ? extraction.visibleText : ''].filter(Boolean);
    } else {
      const url = assertSafeUrl(input.url);
      // D-0115: o caminho do link não é guardado; só o domínio e um hash do link para achar repetidos
      sourceUrlHash = urlHash(url);
      sourceHost = url.hostname.toLowerCase().slice(0, 255);
      let blocks: PageBlock[] = [];
      try {
        const page = await fetchPage(url.toString());
        blocks = htmlToBlocks(page.html);
      } catch (err) {
        if (err instanceof CreativeReferenceError && err.kind === 'FETCH') {
          return this.persist({ ...base(), notes: rawNotes, failure: err.message }, userId);
        }
        throw err;
      }
      blocksTruncated = blocks.length >= MAX_BLOCKS;
      const words = blocks.reduce((a, b) => a + b.wordCount, 0);
      if (words < 20) {
        return this.persist(
          { ...base(), notes: rawNotes, failure: 'Não deu para ler o texto da página (pode ser feita só de imagens ou montada por script). Envie prints.' },
          userId
        );
      }
      texts = blocks.map(b => b.text).filter(Boolean);
      extraction = await extractStructure({ blocks }, type);
    }

    const fp = buildFingerprint(texts);
    const notes = rawNotes ? sanitizeText(rawNotes, fp, NOTES_REMOVED) : null;
    if (!extraction.ok) {
      return this.persist({ ...base(), notes, failure: extraction.reason }, userId);
    }
    const wordCount = texts.reduce((a, t) => a + countWords(t), 0);
    // prints com pouco texto conferível: nada de texto livre da IA, só os textos fixos do NORQVA
    const structure =
      isShots && wordCount < MIN_SCREENSHOT_WORDS ? genericStructure(extraction.structure) : sanitizeStructure(extraction.structure, fp);
    const shingles = Array.from(fp.shingles);
    const truncated = blocksTruncated || fp.truncated;
    if (truncated) console.warn('[referências] impressões truncadas (página muito grande); a checagem anticópia cobre só o começo.');
    texts = [];
    return this.persist({ ...base(), notes, structure, method: extraction.method, shingles, wordCount, truncated }, userId);
  }

  private async persist(
    r: {
      type: string;
      productId: string;
      notes: string | null;
      sourceKind: 'PAGE_URL' | 'SCREENSHOTS';
      sourceUrlHash: string | null;
      sourceHost: string | null;
      failure?: string;
      structure?: ReferenceStructure;
      method?: 'AI' | 'HEURISTIC';
      shingles?: string[];
      wordCount?: number;
      truncated?: boolean;
    },
    userId: string | null
  ) {
    const actor = await actorId(this.pool, userId);
    const hid = await nextHumanId(this.pool);
    const status = r.failure ? 'FAILED' : 'READY';
    const ins = await this.pool.query(
      `INSERT INTO creative_references
         (human_id, product_id, source_kind, source_url_hash, source_host, reference_type, status, failure_reason, extraction_method,
          structure, source_word_count, source_shingles, source_shingle_count, fingerprint_truncated, notes, data_provenance, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::text[], $13, $14, $15, 'COMMERCIAL_PRODUCTION', $16)
       RETURNING id`,
      [
        hid, r.productId, r.sourceKind, r.sourceUrlHash, r.sourceHost, r.type, status, r.failure ? r.failure.slice(0, 500) : null,
        r.method || null, r.structure ? JSON.stringify(r.structure) : null, r.wordCount || 0, r.shingles || [], (r.shingles || []).length,
        !!r.truncated, r.notes, actor
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
