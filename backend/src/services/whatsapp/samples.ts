// NORQVA-0123 etapa C: fotos de amostra que o atendente pode enviar na conversa.
// Regras: só as fotos que já estão no site (lista fixa abaixo, nunca páginas do PDF); só para produto do
// catálogo do número; no máximo MAX_SAMPLE_IMAGES_PER_CONVERSATION por conversa; JPEG/PNG até 5 MB.
import { Pool } from 'pg';
import { accessUrlBase } from '../purchaseAccessService';

export const MAX_SAMPLE_IMAGES_PER_CONVERSATION = 4;
export const SAMPLE_CAPTION_PREFIX = 'Amostra · ';
const MAX_BYTES = 5 * 1024 * 1024;

export type SampleKey = 'trattoria' | 'dolci' | 'kit2' | 'kit4' | 'kit5' | 'paes' | 'antipasti' | 'risotos';

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
