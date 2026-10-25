// NORQVA-0116 (D-0116): imagens da página gerada.
// - Com KIE_API_KEY: imagens novas na KIE (google/nano-banana, createTask + recordInfo, como norqva-ai/produtos/*/gerar_fotos.py),
//   a partir SÓ dos nossos dados (produto e papel da seção). Nunca uma imagem da referência.
// - Sem a chave: imagens que o produto já tem (capas e fotos dos livros em frontend/public/images).
// As imagens novas vão para o Supabase Storage (bucket CREATIVE_IMAGES_BUCKET, padrão "creative-images") e são
// mostradas por link assinado. Testes nunca falam com a KIE nem com o Supabase (tudo simulado).

export const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';
export const KIE_MODEL = 'google/nano-banana';
export const KIE_MISSING_MESSAGE = 'Imagens novas desligadas (falta KIE_API_KEY)';
export const MAX_NEW_IMAGES = 4;
export const KIE_TIMEOUT_MS = 4 * 60 * 1000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const STORAGE_PREFIX = 'storage:';

/** fetch mínimo (o global do Node 20 serve). Os testes trocam por um simulado. */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: any; signal?: any }) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<any>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

let testKieFetch: FetchLike | null = null;
let testKieKey: string | null | undefined;
let pollMs = 6000;

/** Só para testes: KIE simulada (fetch) e chave simulada (key null = sem chave). null volta ao normal. */
export function setKieForTests(opts: { fetch: FetchLike | null; key: string | null } | null) {
  testKieFetch = opts ? opts.fetch : null;
  testKieKey = opts ? opts.key : undefined;
  pollMs = opts ? 0 : 6000;
}

function kieKey(): string {
  if (testKieKey !== undefined) return testKieKey || '';
  if (process.env.NODE_ENV === 'test') return '';
  return (process.env.KIE_API_KEY || '').trim();
}

export function kieConfigured(): boolean {
  return !!kieKey();
}

function kieFetch(): FetchLike {
  if (testKieFetch) return testKieFetch;
  if (process.env.NODE_ENV === 'test') {
    return async () => {
      throw new Error('Teste sem KIE simulada.');
    };
  }
  return fetch as unknown as FetchLike;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Pede a imagem à KIE e espera ficar pronta. Devolve os bytes (PNG/JPG). */
export async function generateKieImage(prompt: string, ratio: '3:2' | '2:3' | '1:1' = '3:2'): Promise<{ data: Buffer; mime: string }> {
  const key = kieKey();
  if (!key) throw new Error(KIE_MISSING_MESSAGE);
  const f = kieFetch();
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const created = await f(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: KIE_MODEL, input: { prompt: prompt.slice(0, 1800), output_format: 'png', image_size: ratio } })
  });
  const cj: any = await created.json().catch(() => ({}));
  if (!created.ok || cj?.code !== 200 || !cj?.data?.taskId) throw new Error(`A KIE recusou o pedido (${cj?.msg || created.status}).`);
  const taskId = String(cj.data.taskId);
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > KIE_TIMEOUT_MS) throw new Error('A KIE demorou demais para gerar a imagem.');
    await sleep(pollMs);
    const r = await f(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { method: 'GET', headers: { Authorization: `Bearer ${key}` } });
    const j: any = await r.json().catch(() => ({}));
    const d = j?.data || {};
    if (d.state === 'fail') throw new Error(`A geração da imagem falhou na KIE${d.failMsg ? `: ${String(d.failMsg).slice(0, 200)}` : ''}.`);
    if (d.state !== 'success') continue;
    let urls: string[] = [];
    try {
      urls = JSON.parse(String(d.resultJson || '{}'))?.resultUrls || [];
    } catch {
      urls = [];
    }
    const url = urls.find(u => /^https:\/\//i.test(String(u)));
    if (!url) throw new Error('A KIE não devolveu a imagem.');
    const img = await f(url, { method: 'GET' });
    if (!img.ok) throw new Error(`Não foi possível baixar a imagem da KIE (HTTP ${img.status}).`);
    const data = Buffer.from(await img.arrayBuffer());
    if (!data.length || data.length > MAX_IMAGE_BYTES) throw new Error('Imagem da KIE vazia ou grande demais.');
    const mime = sniffImage(data);
    if (!mime) throw new Error('A KIE devolveu um arquivo que não é imagem.');
    return { data, mime };
  }
}

export function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Armazenamento (Supabase Storage)
// ---------------------------------------------------------------------------------------------

export interface ImageStorage {
  upload(bucket: string, path: string, data: Buffer, mime: string): Promise<void>;
  signedUrl(bucket: string, path: string, ttlSeconds: number): Promise<string>;
  /** O bucket existe? (antes de gastar créditos na KIE) */
  bucketExists(bucket: string): Promise<boolean>;
}

export const bucketMissingMessage = (bucket: string) => `Falta criar o bucket ${bucket} no Supabase: usando as imagens do produto.`;

export function imagesBucket(): string {
  return (process.env.CREATIVE_IMAGES_BUCKET || '').trim() || 'creative-images';
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key || key === 'MOCK') throw new Error('O armazenamento de arquivos não está configurado no servidor.');
  return { url, key };
}

const supabaseImages: ImageStorage = {
  async bucketExists(bucket) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const { url, key } = supabaseConfig();
    const r = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { method: 'GET', headers: { Authorization: `Bearer ${key}`, apikey: key } });
    if (r.ok) return true;
    if (r.status === 404 || r.status === 400) return false;
    throw new Error(`O armazenamento não respondeu como esperado (status ${r.status}).`);
  },
  async upload(bucket, path, data, mime) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const { url, key } = supabaseConfig();
    const r = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': mime, 'cache-control': 'max-age=86400', 'x-upsert': 'false' },
      body: data as any
    });
    if (!r.ok) throw new Error(`O armazenamento recusou a imagem (status ${r.status}).`);
  },
  async signedUrl(bucket, path, ttlSeconds) {
    if (process.env.NODE_ENV === 'test') throw new Error('STORAGE_DISABLED_IN_TESTS');
    const { url, key } = supabaseConfig();
    const r = await fetch(`${url}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds })
    });
    const j: any = await r.json().catch(() => ({}));
    const signed = j?.signedURL || j?.signedUrl;
    if (!r.ok || !signed) throw new Error(`Não foi possível assinar a imagem (status ${r.status}).`);
    const rel = String(signed).startsWith('/storage/v1') ? String(signed) : `/storage/v1${String(signed).startsWith('/') ? '' : '/'}${signed}`;
    return `${url}${rel}`;
  }
};

let storage: ImageStorage = supabaseImages;

// links assinados guardados por 50 minutos (assinados para valer pelo menos 1 h)
const SIGNED_CACHE_MS = 50 * 60 * 1000;
const signedCache = new Map<string, { url: string; signedAt: number; expiresAt: number }>();

/** Bucket existe? Erro de rede ou configuração conta como "não". */
export async function imagesBucketReady(): Promise<boolean> {
  try {
    return await storage.bucketExists(imagesBucket());
  } catch (err: any) {
    console.warn('[geração] bucket das imagens não conferido:', err?.message || err);
    return false;
  }
}
/** Só para testes: armazenamento simulado. */
export function setImageStorageForTests(s: ImageStorage | null) {
  storage = s || supabaseImages;
  signedCache.clear();
}
export function imageStorage(): ImageStorage {
  return storage;
}

/** "storage:bucket/caminho" -> link assinado; caminho do site (/images/...) fica como está. */
/** "storage:bucket/caminho" -> [bucket, caminho] (ou null). */
export function storageRef(raw: unknown): { bucket: string; path: string; key: string } | null {
  const v = String(raw || '').trim();
  if (!v.startsWith(STORAGE_PREFIX)) return null;
  const rest = v.slice(STORAGE_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1), key: rest };
}

/**
 * "storage:bucket/caminho" -> link assinado; caminho do site (/images/...) fica como está.
 * O link guardado só é reaproveitado se ainda valer pelo tempo pedido (e foi assinado há menos de 50 min).
 */
export async function resolveImageUrl(raw: unknown, ttlSeconds = 24 * 3600): Promise<string | null> {
  const v = String(raw || '').trim();
  if (!v) return null;
  if (v.startsWith('/images/')) return v;
  const ref = storageRef(v);
  if (!ref) return null;
  const ttl = Math.max(3600, ttlSeconds);
  const now = Date.now();
  const hit = signedCache.get(ref.key);
  if (hit && hit.signedAt + SIGNED_CACHE_MS > now && hit.expiresAt - now >= ttl * 1000 - SIGNED_CACHE_MS) return hit.url;
  try {
    const url = await storage.signedUrl(ref.bucket, ref.path, ttl);
    signedCache.set(ref.key, { url, signedAt: now, expiresAt: now + ttl * 1000 });
    if (signedCache.size > 2000) signedCache.delete(signedCache.keys().next().value as string);
    return url;
  } catch (err: any) {
    console.warn('[geração] imagem sem link assinado:', err?.message || err);
    return null;
  }
}

/** Link assinado NOVO (sem o guardado), para enviar a imagem à Meta agora. Lança se não conseguir. */
export async function freshSignedUrl(raw: unknown, ttlSeconds = 3600): Promise<string> {
  const ref = storageRef(raw);
  if (!ref) throw new Error('Imagem sem endereço de armazenamento.');
  return storage.signedUrl(ref.bucket, ref.path, Math.max(3600, ttlSeconds));
}

// ---------------------------------------------------------------------------------------------
// Imagens que o produto já tem (sem KIE)
// ---------------------------------------------------------------------------------------------

const BOOK_IMAGES: Record<string, string[]> = {
  paes: ['/images/livros/paes/capa.jpg', '/images/livros/paes/rustico.jpg', '/images/livros/paes/ciabatta.jpg', '/images/livros/paes/focaccia.jpg'],
  antipasti: ['/images/livros/antipasti/capa.jpg', '/images/livros/antipasti/caponata.jpg', '/images/livros/antipasti/arancini.jpg', '/images/livros/antipasti/tagliere.jpg'],
  risotos: ['/images/livros/risotos/capa.jpg', '/images/livros/risotos/funghi.jpg', '/images/livros/risotos/milanese.jpg', '/images/livros/risotos/polenta_grelhada.jpg']
};

/** Capa e fotos que já estão no site para este produto (vazio quando não há). */
export function productImages(p: { name?: unknown; collection_key?: unknown }): string[] {
  const key = String(p.collection_key || '').trim().toLowerCase();
  if (BOOK_IMAGES[key]) return BOOK_IMAGES[key];
  const name = String(p.name || '').toLowerCase();
  if (/dolci/.test(name)) return ['/images/kit/capa_dolci.jpg', '/images/kit/dolci_tiramisu.jpg', '/images/kit/dolci_cannoli.jpg', '/images/kit/dolci_pannacotta.jpg'];
  if (/trattoria/.test(name)) return ['/images/kit/capa_trat.jpg', '/images/kit/trat_carbonara.jpg', '/images/kit/trat_ragu.jpg', '/images/kit/trat_ravioli.jpg'];
  if (/bordado/.test(name)) return ['/images/bordado/capa.jpg', '/images/bordado/riscos.jpg', '/images/bordado/bichinhos.jpg', '/images/bordado/pontos.jpg'];
  if (/^kit\b/.test(name)) return ['/images/kit/capa_kit.jpg', '/images/kit/trat_pizza.jpg', '/images/kit/dolci_tiramisu.jpg', '/images/kit/trat_pesto.jpg'];
  return [];
}

/** Cenário das fotos dos livros de cozinha (D-0055) ou neutro para os outros produtos. */
export function imageStyle(p: { name?: unknown; collection_key?: unknown; category?: unknown }): string {
  const cooking = (productImages(p).length > 0 && !/bordado/i.test(String(p.name || ''))) || /receit|cozinha|culin/i.test(String(p.category || ''));
  return cooking
    ? 'Foto realista de comida, prato creme com borda dourada sobre linho rosado, mesa escura, luz quente lateral, sem texto, sem marca, sem mãos, sem pessoas.'
    : 'Foto realista e limpa, luz natural, fundo claro, sem texto, sem marca, sem logotipo, sem pessoas reconhecíveis.';
}
