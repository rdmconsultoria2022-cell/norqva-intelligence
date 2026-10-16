import React from 'react';
import { ArrowRight, QrCode, CreditCard } from 'lucide-react';
import { installmentOptions, CardPlan } from '../../lib/cardInstallments';
import type { CheckoutOffer } from '../checkout/checkoutTypes';
import { BuyChoice } from './WhatsAppChoice';

// NORQVA-0080: oferta "livro + Dolci" na página de cada livro.
// Tudo vem do servidor: preço do livro, preço do adicional e preço do Dolci sozinho (o "de" é a soma real).
// O botão principal abre o pagamento com o Dolci já marcado. O servidor recalcula o valor.

export const DOLCI_COVER = '/images/kit/capa_dolci.jpg';

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const toCents = (v: unknown) => Math.round(Number(v) * 100);

export interface ComboMath {
  bookCents: number;
  comboCents: number;
  fullCents: number;
  extraCents: number;
  /** maior parcelamento válido no cartão para o combo (null = sem cartão) */
  maxCard: { n: number; valueCents: number | null; totalCents: number; interest: boolean } | null;
  rate: number;
}

/** Contas da oferta. null quando a página não deve mostrar o combo (sem adicional ou sem preço cheio maior). */
export function comboMath(offer: Pick<CheckoutOffer, 'price' | 'promotional_price' | 'bump' | 'card'>): ComboMath | null {
  const bump = offer.bump;
  if (!bump || !(Number(bump.price) > 0) || !(Number(bump.regular_price) > 0)) return null;
  const own = offer.promotional_price !== null && offer.promotional_price !== undefined ? offer.promotional_price : offer.price;
  const bookCents = toCents(own);
  const extraCents = toCents(bump.price);
  const fullCents = bookCents + toCents(bump.regular_price);
  const comboCents = bookCents + extraCents;
  if (!(bookCents > 0) || !(fullCents > comboCents)) return null;
  let maxCard: ComboMath['maxCard'] = null;
  let rate = 0;
  const card = offer.card;
  if (card && Number(card.total) > 0) {
    const plan: CardPlan = card.plan || { max: Math.max(1, Number(card.max_installments) || 1), free: Math.max(1, Number(card.max_installments) || 1), rate: 0 };
    rate = plan.rate;
    // igual ao pagamento: total do livro no cartão + adicional pelo preço do Pix
    const opts = installmentOptions(toCents(card.total) + extraCents, plan);
    maxCard = opts.length ? opts[opts.length - 1] : null;
  }
  return { bookCents, comboCents, fullCents, extraCents, maxCard, rate };
}

interface Props {
  offer: CheckoutOffer & { whatsapp?: { available: boolean } | null };
  bookTitle: string;
  bookCover: string;
  onBuyBoth: () => void;
  onBuyBook: () => void;
}

export const BookComboOffer: React.FC<Props> = ({ offer, bookTitle, bookCover, onBuyBoth, onBuyBook }) => {
  const m = comboMath(offer);
  if (!m || !offer.bump) return null;
  const bumpName = /dolci/i.test(offer.bump.name) ? 'Dolci della Nonna' : offer.bump.name;
  const phrase = offer.bump.headline || `Leve mais um livro de sobremesa por apenas ${brl(m.extraCents)} comprando os dois.`;
  const card = m.maxCard;
  const cardLine = !card
    ? null
    : card.n === 1
      ? `ou ${brl(card.totalCents)} no cartão`
      : card.interest
        ? `ou em até ${card.n}x de ${brl(card.valueCents || 0)} no cartão, com acréscimo de ${m.rate.toFixed(2).replace('.', ',')}% ao mês (total ${brl(card.totalCents)})`
        : `ou em até ${card.n}x no cartão, sem acréscimo (total ${brl(card.totalCents)})`;

  return (
    <section id="oferta" data-testid="book-combo-offer" className="scroll-mt-20 rounded-2xl sm:rounded-3xl border-2 border-[#B83B1E]/40 bg-white p-5 sm:p-8 shadow-xl">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-5 flex items-end justify-center gap-3" aria-hidden="true">
          <img src={bookCover} alt="" className="w-32 sm:w-40 rounded-lg shadow-lg border border-stone-200 object-cover" onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
          <span className="pb-10 text-2xl font-serif font-bold text-[#B83B1E]">+</span>
          <img src={DOLCI_COVER} alt="" className="w-24 sm:w-32 rounded-lg shadow-lg border border-stone-200 object-cover" onError={e => { (e.target as HTMLElement).style.display = 'none'; }} />
        </div>

        <div className="md:col-span-7 space-y-3 text-center md:text-left">
          <span className="text-xs font-bold uppercase tracking-widest text-[#B83B1E]">Oferta dos dois livros</span>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 leading-tight">
            {bookTitle} + {bumpName}
          </h2>
          <p className="text-sm sm:text-base text-stone-700" data-testid="combo-phrase">{phrase}</p>

          <div className="space-y-0.5">
            <span className="block text-sm text-stone-500">
              de <s data-testid="combo-full">{brl(m.fullCents)}</s> por
            </span>
            <span className="block text-3xl sm:text-4xl font-serif font-black text-[#B83B1E]" data-testid="combo-price">{brl(m.comboCents)}</span>
            <span className="flex items-center justify-center md:justify-start gap-1.5 text-xs text-stone-600">
              <QrCode className="h-3.5 w-3.5 text-[#2B3D2B]" /> à vista no Pix
            </span>
            {cardLine && (
              <span className="flex items-center justify-center md:justify-start gap-1.5 text-xs text-stone-600" data-testid="combo-card">
                <CreditCard className="h-3.5 w-3.5 text-[#2B3D2B]" /> {cardLine}
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
            <BuyChoice available={!!offer.whatsapp?.available} offerHumanId={offer.human_id || ''} onCheckout={onBuyBoth} dark={false}>
              <button
                type="button"
                onClick={onBuyBoth}
                data-testid="combo-buy-both"
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#B83B1E] hover:bg-[#8F2810] text-white font-bold text-sm tracking-wide transition shadow-lg shadow-[#B83B1E]/25 flex items-center justify-center gap-2 active:scale-95"
              >
                <span>Quero os dois por {brl(m.comboCents)}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </BuyChoice>
            <button
              type="button"
              onClick={onBuyBook}
              data-testid="combo-buy-book"
              className="text-sm font-medium text-stone-600 underline hover:text-[#B83B1E]"
            >
              Só o livro por {brl(m.bookCents)}
            </button>
          </div>
          <p className="text-[11px] text-stone-500">Os dois livros em PDF chegam juntos assim que o pagamento é confirmado.</p>
        </div>
      </div>
    </section>
  );
};
