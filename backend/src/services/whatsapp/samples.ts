// NORQVA-0123 etapa C: fotos de amostra que o atendente pode enviar na conversa.
// Regras: só as fotos que já estão no site (lista fixa abaixo, nunca páginas do PDF); só para produto do
// catálogo do número; no máximo MAX_SAMPLE_IMAGES_PER_CONVERSATION por conversa; JPEG/PNG até 5 MB.
import { Pool } from 'pg';
import { accessUrlBase } from '../purchaseAccessService';

export const MAX_SAMPLE_IMAGES_PER_CONVERSATION = 4;
export const SAMPLE_CAPTION_PREFIX = 'Amostra · ';
const MAX_BYTES = 5 * 1024 * 1024;

export type SampleKey = 'trattoria' | 'dolci' | 'kit2' | 'kit4' | 'kit5' | 'paes' | 'antipasti' | 'risotos' | 'bordado';

/** Caminhos públicos do site (frontend/public). A ordem é a ordem de envio. */
export const SAMPLE_IMAGES: Record<SampleKey, { path: string; caption: string }[]> = {
  trattoria: [
    { path: '/images/kit/capa_trat.jpg', caption: 'Trattoria em Casa (capa)' },
    { path: '/images/kit/trat_carbonara.jpg', caption: 'Trattoria em Casa: carbonara' },
    { path: '/images/kit/trat_ragu.jpg', caption: 'Trattoria em Casa: ragù alla bolognese' },
    { path: '/images/kit/trat_pizza.jpg', caption: 'Trattoria em Casa: pizza de fermentação lenta' }
  ],
  dolci: [
    { path: '/images/kit/capa_dolci.jpg', caption: 'Dolci della Nonna (capa)' },
    { path: '/images/kit/dolci_tiramisu.jpg', caption: 'Dolci della Nonna: tiramisù' },
    { path: '/images/kit/dolci_cannoli.jpg', caption: 'Dolci della Nonna: cannoli em taça' },
    { path: '/images/kit/dolci_pannacotta.jpg', caption: 'Dolci della Nonna: panna cotta' }
  ],
  kit2: [
    { path: '/images/kit/capa_kit.jpg', caption: 'Kit Cozinha Italiana (Trattoria + Dolci)' },
    { path: '/images/kit/trat_carbonara.jpg', caption: 'Trattoria em Casa: carbonara' },
    { path: '/images/kit/dolci_tiramisu.jpg', caption: 'Dolci della Nonna: tiramisù' },
    { path: '/images/kit/trat_ravioli.jpg', caption: 'Trattoria em Casa: ravioli' }
  ],
  kit5: [
    { path: '/images/kit/trat_carbonara.jpg', caption: 'Trattoria em Casa: carbonara' },
    { path: '/images/livros/risotos/milanese.jpg', caption: 'Risotos & Polentas: risoto alla milanese' },
    { path: '/images/livros/antipasti/caponata.jpg', caption: 'Antipasti & Aperitivo: caponata siciliana' },
    { path: '/images/kit/dolci_tiramisu.jpg', caption: 'Dolci della Nonna: tiramisù' }
  ],
  // "Complete a coleção: +4 livros" (sem o Trattoria)
  kit4: [
    { path: '/images/livros/risotos/milanese.jpg', caption: 'Risotos & Polentas: risoto alla milanese' },
    { path: '/images/livros/antipasti/caponata.jpg', caption: 'Antipasti & Aperitivo: caponata siciliana' },
    { path: '/images/livros/paes/focaccia.jpg', caption: 'Pães & Fermentação Natural: focaccia barese' },
    { path: '/images/kit/dolci_tiramisu.jpg', caption: 'Dolci della Nonna: tiramisù' }
  ],
  paes: [
    { path: '/images/livros/paes/capa.jpg', caption: 'Pães & Fermentação Natural (capa)' },
    { path: '/images/livros/paes/rustico.jpg', caption: 'Pães & Fermentação Natural: pão rústico' },
    { path: '/images/livros/paes/ciabatta.jpg', caption: 'Pães & Fermentação Natural: ciabatta' },
    { path: '/images/livros/paes/focaccia.jpg', caption: 'Pães & Fermentação Natural: focaccia barese' }
  ],
  antipasti: [
    { path: '/images/livros/antipasti/capa.jpg', caption: 'Antipasti & Aperitivo (capa)' },
    { path: '/images/livros/antipasti/caponata.jpg', caption: 'Antipasti & Aperitivo: caponata siciliana' },
    { path: '/images/livros/antipasti/arancini.jpg', caption: 'Antipasti & Aperitivo: arancini' },
    { path: '/images/livros/antipasti/tagliere.jpg', caption: 'Antipasti & Aperitivo: tábua de frios e queijos' }
  ],
  // NORQVA-0132: imagens tiradas do próprio PDF do kit (as mesmas dos anúncios)
  bordado: [
    { path: '/images/bordado/capa.jpg', caption: 'Kit de Bordado (capa)' },
    { path: '/images/bordado/riscos.jpg', caption: 'Kit de Bordado: riscos para bordar' },
    { path: '/images/bordado/bichinhos.jpg', caption: 'Kit de Bordado: riscos de bichinhos' },
    { path: '/images/bordado/pontos.jpg', caption: 'Kit de Bordado: pontos passo a passo' }
  ],
  risotos: [
    { path: '/images/livros/risotos/capa.jpg', caption: 'Risotos & Polentas (capa)' },
    { path: '/images/livros/risotos/milanese.jpg', caption: 'Risotos & Polentas: risoto alla milanese' },
    { path: '/images/livros/risotos/funghi.jpg', caption: 'Risotos & Polentas: risoto de cogumelos' },
    { path: '/images/livros/risotos/polenta_grelhada.jpg', caption: 'Risotos & Polentas: polenta grelhada' }
  ]
};

const norm = (s: unknown) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Qual conjunto de fotos vale para um item do catálogo (null = não há fotos para ele). */
export function sampleKeyFor(item: { name?: string | null; product_name?: string | null; collection_key?: string | null }): SampleKey | null {
  const ck = norm(item.collection_key);
  if (ck === 'paes' || ck === 'antipasti' || ck === 'risotos') return ck;
  const n = `${norm(item.name)} ${norm(item.product_name)}`;
  if (/bordad/.test(n)) return 'bordado';
  if (/\+\s*4|\b4 livros|quatro livros/.test(n)) return 'kit4';
  if (/\bkit\b|colecao/.test(n)) return /complet|5 livros|cinco/.test(n) ? 'kit5' : 'kit2';
  if (/risoto|polenta/.test(n)) return 'risotos';
  if (/antipast|aperitiv/.test(n)) return 'antipasti';
  if (/\bpaes\b|fermentacao/.test(n)) return 'paes';
  if (/dolci/.test(n)) return 'dolci';
  if (/trattoria/.test(n)) return 'trattoria';
  return null;
}

/** Quantas fotos de amostra o atendente já mandou nesta conversa. */
export async function samplesSent(pool: Pool, convId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM whatsapp_messages
     WHERE conversation_id = $1 AND author = 'BOT' AND kind = 'IMAGE' AND body LIKE $2`,
    [convId, `[imagem] ${SAMPLE_CAPTION_PREFIX}%`]
  );
  return Number(r.rows[0]?.n || 0);
}

let testFetch: ((url: string) => Promise<{ ok: boolean; contentType: string; bytes: Buffer }>) | null = null;
/** Só para testes: os testes nunca baixam imagem de verdade. */
export function setSampleFetchForTests(f: typeof testFetch) {
  testFetch = f;
}

/** Baixa a foto do próprio site. Devolve base64 e o tipo, ou null se não for JPEG/PNG até 5 MB. */
export async function loadSampleImage(path: string): Promise<{ base64: string; mimetype: 'image/jpeg' | 'image/png' } | null> {
  if (!/^\/images\/[a-z0-9_/.-]+\.(jpg|jpeg|png)$/i.test(path) || path.includes('..')) return null;
  const base = accessUrlBase();
  if (!base) return null;
  const url = `${base.replace(/\/+$/, '')}${path}`;
  let res: { ok: boolean; contentType: string; bytes: Buffer };
  if (testFetch) {
    res = await testFetch(url);
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      const len = Number(r.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      res = { ok: r.ok, contentType: String(r.headers.get('content-type') || ''), bytes: buf };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!res.ok || !res.bytes.length || res.bytes.length > MAX_BYTES) return null;
  const ct = res.contentType.toLowerCase();
  // confere pelo conteúdo, não só pelo cabeçalho (o site devolve o index.html para caminho errado)
  const isJpeg = res.bytes[0] === 0xff && res.bytes[1] === 0xd8;
  const isPng = res.bytes[0] === 0x89 && res.bytes[1] === 0x50 && res.bytes[2] === 0x4e && res.bytes[3] === 0x47;
  if (isJpeg && (!ct || ct.includes('jpeg') || ct.includes('jpg') || ct.includes('octet-stream'))) return { base64: res.bytes.toString('base64'), mimetype: 'image/jpeg' };
  if (isPng && (!ct || ct.includes('png') || ct.includes('octet-stream'))) return { base64: res.bytes.toString('base64'), mimetype: 'image/png' };
  return null;
}

// ---------- NORQVA-0161: o que vem no kit (capas dos livros) ----------
// Quando o assunto da conversa é um kit, a NORQVA manda UMA imagem com as capas numeradas dos livros do kit (sem
// preço), uma vez por conversa, logo depois da resposta. Imagens geradas por
// norqva-ai/produtos/whatsapp_cards/build_kit_covers.py. Sem preço: não mexe na ordem das ofertas (D-0153).

export const KIT_COVER_PREFIX = 'O que vem no ';
export type KitCoverKey = 'colecao' | 'kit5' | 'kit4' | 'kit2';

export const KIT_COVER_IMAGES: Record<KitCoverKey, { path: string; caption: string }> = {
  colecao: { path: '/images/whatsapp/kit-capas-colecao.jpg', caption: `${KIT_COVER_PREFIX}Coleção Trattoria Completa: 5 livros + bônus` },
  kit5: { path: '/images/whatsapp/kit-capas-kit5.jpg', caption: `${KIT_COVER_PREFIX}Kit Trattoria Completo: 5 livros` },
  kit4: { path: '/images/whatsapp/kit-capas-kit4.jpg', caption: `${KIT_COVER_PREFIX}kit +4 livros` },
  kit2: { path: '/images/whatsapp/kit-capas-kit2.jpg', caption: `${KIT_COVER_PREFIX}Kit Cozinha Italiana: 2 livros` }
};

/** Kits com os mesmos livros (a coleção = o kit de 5 + bônus): mostrou um, não manda o outro. */
const SAME_BOOKS: Record<KitCoverKey, KitCoverKey[]> = { colecao: ['colecao', 'kit5'], kit5: ['kit5', 'colecao'], kit4: ['kit4'], kit2: ['kit2'] };

/** Qual imagem de capas vale para um kit do catálogo (null = não é kit de livros). */
export function kitCoverKeyFor(item: { name?: string | null; product_name?: string | null; collection_key?: string | null }): KitCoverKey | null {
  const key = sampleKeyFor(item);
  if (key === 'kit5') return /colecao/.test(`${norm(item.name)} ${norm(item.product_name)}`) ? 'colecao' : 'kit5';
  if (key === 'kit4' || key === 'kit2') return key;
  return null;
}

/**
 * Kit citado pelo CLIENTE (texto livre). "não quero kit" não conta. "coleção" = coleção; "+4"/"4 livros" = kit +4;
 * "2 livros"/"Trattoria e Dolci" = kit de 2; "kit" sem detalhe = kit de 5. Bordado nunca é kit de livros.
 */
export function kitCoverKeyFromText(text: string): KitCoverKey | null {
  const t = norm(text);
  if (/bordad/.test(t)) return null;
  if (!/\bkit\b|\bkits\b|colecao/.test(t)) return null;
  // negação perto da palavra: "não quero kit", "nao preciso do kit", "sem kit"
  if (/\b(nao|sem|nem)\b(\s+\S+){0,3}\s+(o\s+|a\s+|do\s+|da\s+)?(kit|kits|colecao)\b/.test(t)) return null;
  if (/colecao/.test(t)) return 'colecao';
  if (/\+\s*4|\b4 livros|quatro livros/.test(t)) return 'kit4';
  if (/\b2 livros|dois livros|trattoria\s*(e|\+)\s*dolci/.test(t)) return 'kit2';
  return 'kit5';
}

/** Já foi mandada nesta conversa a imagem deste kit (ou de um kit com os mesmos livros)? Envio que falhou não conta. */
export async function kitCoversSent(pool: Pool, convId: string, key: KitCoverKey): Promise<boolean> {
  const bodies = SAME_BOOKS[key].map(k => `[imagem] ${KIT_COVER_IMAGES[k].caption}`);
  const r = await pool.query(
    `SELECT 1 FROM whatsapp_messages
     WHERE conversation_id = $1 AND author = 'BOT' AND kind = 'IMAGE' AND send_status = 'OK' AND body = ANY($2::text[]) LIMIT 1`,
    [convId, bodies]
  );
  return r.rows.length > 0;
}
