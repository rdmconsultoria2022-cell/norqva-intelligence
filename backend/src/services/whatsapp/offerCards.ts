// NORQVA-0153: imagens das ofertas (conteúdo e preço) que o atendente envia na conversa, numa ordem fixa:
// 1º a oferta recomendada (offers.attendant_featured); 2º a alternativa dela, se o cliente não pediu para pagar;
// livros avulsos só depois dos dois kits, ou quando o cliente pede o preço de um livro avulso.
// As imagens são geradas por norqva-ai/produtos/whatsapp_cards/build_cards.py e ficam no site.
// Cada imagem tem o preço do Pix escrito: só sai quando o preço do catálogo é o mesmo (preço mudou = texto).
import { Pool } from 'pg';

export interface OfferCard {
  path: string;
  /** preço do Pix escrito na imagem */
  pix: number;
  /** preço cheio riscado na imagem ("de R$ ..."), ou null se a imagem não mostra */
  from: number | null;
  /** a imagem diz "ou no cartão" (só vale se a oferta aceita cartão) */
  card: boolean;
  /** legenda que o cliente vê embaixo da imagem (também identifica o envio no histórico: mudar a legenda faz as
   *  conversas antigas não reconhecerem mais o envio, e a imagem pode sair de novo) */
  caption: string;
  /** NORQVA-0154: número do livro avulso (escrito na imagem): o cliente escolhe respondendo o número */
  number?: number;
}

const DEFAULT_CARDS: Record<string, OfferCard> = {
  'OFF-000016': { path: '/images/whatsapp/off-000016.jpg', pix: 47, from: 94.5, card: true, caption: 'Coleção Trattoria Completa: 5 livros + bônus' },
  'OFF-000010': { path: '/images/whatsapp/off-000010.jpg', pix: 29.9, from: 94.5, card: true, caption: 'Kit Trattoria Completo: 5 livros' },
  'OFF-000001': { path: '/images/whatsapp/off-000001.jpg', pix: 19.9, from: null, card: true, number: 1, caption: 'Livro 1 · Trattoria em Casa · R$ 19,90' },
  'OFF-000005': { path: '/images/whatsapp/off-000005.jpg', pix: 14.9, from: null, card: false, number: 5, caption: 'Livro 5 · Dolci della Nonna · R$ 14,90' },
  'OFF-000007': { path: '/images/whatsapp/off-000007.jpg', pix: 19.9, from: null, card: true, number: 4, caption: 'Livro 4 · Pães & Fermentação Natural · R$ 19,90' },
  'OFF-000008': { path: '/images/whatsapp/off-000008.jpg', pix: 19.9, from: null, card: true, number: 3, caption: 'Livro 3 · Antipasti & Aperitivo · R$ 19,90' },
  'OFF-000009': { path: '/images/whatsapp/off-000009.jpg', pix: 19.9, from: null, card: true, number: 2, caption: 'Livro 2 · Risotos & Polentas · R$ 19,90' }
};

export let OFFER_CARDS: Record<string, OfferCard> = DEFAULT_CARDS;
/** Só para testes: troca a lista de imagens (null volta à lista de verdade). */
export function setOfferCardsForTests(cards: Record<string, OfferCard> | null) {
  OFFER_CARDS = cards || DEFAULT_CARDS;
}

export const cardLabel = (code: string) => `[imagem] ${OFFER_CARDS[code]?.caption || ''}`;

/**
 * A imagem desta oferta pode ser enviada: existe e o que está escrito nela vale hoje (preço do Pix, preço cheio
 * riscado e "ou no cartão"). Qualquer diferença = sem imagem (o atendente apresenta em texto).
 */
export function cardFor(code: string | null | undefined, pix: number | null | undefined, from: number | null | undefined = null, cardEnabled = true): OfferCard | null {
  const card = code ? OFFER_CARDS[String(code).toUpperCase()] : undefined;
  if (!card || typeof pix !== 'number' || !Number.isFinite(pix) || card.card !== cardEnabled) return null;
  const cents = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null);
  if (cents(card.pix) !== cents(pix)) return null;
  if (cents(card.from) !== cents(from ?? null)) return null;
  return card;
}

/** Códigos das ofertas cuja imagem já foi enviada nesta conversa (pelo texto gravado no histórico; envio que falhou não conta). */
export async function cardsSent(pool: Pool, convId: string): Promise<Set<string>> {
  const codes = Object.keys(OFFER_CARDS);
  const r = await pool.query(
    `SELECT DISTINCT body FROM whatsapp_messages
     WHERE conversation_id = $1 AND author = 'BOT' AND kind = 'IMAGE' AND send_status = 'OK' AND body = ANY($2::text[])`,
    [convId, codes.map(cardLabel)]
  );
  const bodies = new Set(r.rows.map((x: any) => String(x.body)));
  return new Set(codes.filter(c => bodies.has(cardLabel(c))));
}

export type CardStep = 'FEATURED' | 'ALTERNATIVE' | 'INDIVIDUAL';

/**
 * Pode enviar a imagem desta oferta agora? `featured`/`alternative` = códigos do catálogo (ou null se não há).
 * `shown` = ofertas já mostradas ao cliente em respostas ANTERIORES (a ordem depende de o cliente ter respondido
 * depois delas); `queued` = imagens já na fila desta resposta (só para não repetir).
 */
export function cardOrderCheck(
  code: string,
  ctx: { featured: string | null; alternative: string | null; shown: Set<string>; queued: Set<string>; askedIndividual: boolean }
): { ok: true; step: CardStep } | { ok: false; error: string } {
  if (ctx.shown.has(code) || ctx.queued.has(code)) return { ok: false, error: 'A imagem desta oferta já foi enviada. Não reenvie: responda em texto.' };
  if (code === ctx.featured) return { ok: true, step: 'FEATURED' };
  if (code === ctx.alternative) {
    if (ctx.featured && !ctx.shown.has(ctx.featured)) {
      return {
        ok: false,
        error: ctx.queued.has(ctx.featured)
          ? 'A 1ª opção vai nesta resposta: espere o cliente responder. A 2ª opção só vai se ele não pedir para pagar a 1ª.'
          : `Mostre primeiro a oferta recomendada (código ${ctx.featured}). A 2ª opção só vai se o cliente não pedir para pagar a recomendada.`
      };
    }
    return { ok: true, step: 'ALTERNATIVE' };
  }
  const kitsShown = (!ctx.featured || ctx.shown.has(ctx.featured)) && (!ctx.alternative || ctx.shown.has(ctx.alternative));
  if (kitsShown || ctx.askedIndividual) return { ok: true, step: 'INDIVIDUAL' };
  return {
    ok: false,
    error: `Livro avulso só depois que o cliente recusar as duas ofertas de kit (${[ctx.featured, ctx.alternative].filter(Boolean).join(' e ')}), ou se ele pedir o preço de um livro avulso (aí informe customer_asked_individual = true).`
  };
}
