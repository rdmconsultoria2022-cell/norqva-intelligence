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
  /** legenda que o cliente vê embaixo da imagem (também identifica o envio no histórico) */
  caption: string;
}

const DEFAULT_CARDS: Record<string, OfferCard> = {
  'OFF-000016': { path: '/images/whatsapp/off-000016.jpg', pix: 47, caption: 'Coleção Trattoria Completa: 5 livros + bônus' },
  'OFF-000010': { path: '/images/whatsapp/off-000010.jpg', pix: 29.9, caption: 'Kit Trattoria Completo: 5 livros' },
  'OFF-000001': { path: '/images/whatsapp/off-000001.jpg', pix: 19.9, caption: 'Trattoria em Casa (livro avulso)' },
  'OFF-000005': { path: '/images/whatsapp/off-000005.jpg', pix: 14.9, caption: 'Dolci della Nonna (livro avulso)' },
  'OFF-000007': { path: '/images/whatsapp/off-000007.jpg', pix: 19.9, caption: 'Pães & Fermentação Natural (livro avulso)' },
  'OFF-000008': { path: '/images/whatsapp/off-000008.jpg', pix: 19.9, caption: 'Antipasti & Aperitivo (livro avulso)' },
  'OFF-000009': { path: '/images/whatsapp/off-000009.jpg', pix: 19.9, caption: 'Risotos & Polentas (livro avulso)' }
};

export let OFFER_CARDS: Record<string, OfferCard> = DEFAULT_CARDS;
/** Só para testes: troca a lista de imagens (null volta à lista de verdade). */
export function setOfferCardsForTests(cards: Record<string, OfferCard> | null) {
  OFFER_CARDS = cards || DEFAULT_CARDS;
}

export const cardLabel = (code: string) => `[imagem] ${OFFER_CARDS[code]?.caption || ''}`;

/** A imagem desta oferta pode ser enviada: existe e o preço do Pix escrito nela é o do catálogo. */
export function cardFor(code: string | null | undefined, pix: number | null | undefined): OfferCard | null {
  const card = code ? OFFER_CARDS[String(code).toUpperCase()] : undefined;
  if (!card || typeof pix !== 'number' || !Number.isFinite(pix)) return null;
  return Math.round(card.pix * 100) === Math.round(pix * 100) ? card : null;
}

/** Códigos das ofertas cuja imagem já foi enviada nesta conversa (pelo texto gravado no histórico). */
export async function cardsSent(pool: Pool, convId: string): Promise<Set<string>> {
  const codes = Object.keys(OFFER_CARDS);
  const r = await pool.query(
    `SELECT DISTINCT body FROM whatsapp_messages
     WHERE conversation_id = $1 AND author = 'BOT' AND kind = 'IMAGE' AND body = ANY($2::text[])`,
    [convId, codes.map(cardLabel)]
  );
  const bodies = new Set(r.rows.map((x: any) => String(x.body)));
  return new Set(codes.filter(c => bodies.has(cardLabel(c))));
}

export type CardStep = 'FEATURED' | 'ALTERNATIVE' | 'INDIVIDUAL';

/**
 * Pode enviar a imagem desta oferta agora? `featured`/`alternative` = códigos do catálogo (ou null se não há),
 * `sent` = imagens já enviadas (inclusive nesta resposta). Devolve o passo ou o motivo da recusa.
 */
export function cardOrderCheck(
  code: string,
  ctx: { featured: string | null; alternative: string | null; sent: Set<string>; askedIndividual: boolean }
): { ok: true; step: CardStep } | { ok: false; error: string } {
  if (ctx.sent.has(code)) return { ok: false, error: 'A imagem desta oferta já foi enviada acima. Não reenvie: responda em texto.' };
  if (code === ctx.featured) return { ok: true, step: 'FEATURED' };
  if (code === ctx.alternative) {
    if (ctx.featured && !ctx.sent.has(ctx.featured)) {
      return { ok: false, error: `Envie primeiro a imagem da oferta recomendada (código ${ctx.featured}). A alternativa só vai se o cliente não pedir para pagar a recomendada.` };
    }
    return { ok: true, step: 'ALTERNATIVE' };
  }
  const kitsShown = (!ctx.featured || ctx.sent.has(ctx.featured)) && (!ctx.alternative || ctx.sent.has(ctx.alternative));
  if (kitsShown || ctx.askedIndividual) return { ok: true, step: 'INDIVIDUAL' };
  return {
    ok: false,
    error: `Livro avulso só depois que o cliente recusar as duas ofertas de kit (${[ctx.featured, ctx.alternative].filter(Boolean).join(' e ')}), ou se ele pedir o preço de um livro avulso (aí informe customer_asked_individual = true).`
  };
}
