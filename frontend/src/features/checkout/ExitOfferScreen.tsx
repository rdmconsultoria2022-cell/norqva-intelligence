import React from 'react';
import { Gift, Loader2 } from 'lucide-react';
import type { CheckoutOffer } from './checkoutTypes';
import { FULL_KIT_RECIPES } from './collectionChoice';

// NORQVA-0069: proposta de preço menor mostrada quando a pessoa clica em Voltar no pagamento do kit.
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

export const ExitOfferScreen: React.FC<{
  offer: CheckoutOffer;
  step: number;
  loading?: boolean;
  onAccept: () => void;
  onBack: () => void;
}> = ({ offer, step, loading = false, onAccept, onBack }) => {
  const price = Number(offer.promotional_price ?? offer.price);
  const card = offer.card && Number(offer.card.max_installments) > 1 ? offer.card : null;
  return (
    <div className="fixed inset-0 z-50 bg-stone-900/70 backdrop-blur-sm flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] antialiased" data-testid="exit-offer">
      <div className="bg-[#FAF7F2] border border-stone-200 rounded-2xl max-w-md w-full p-7 sm:p-9 text-center shadow-2xl text-stone-800 font-sans">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#B83B1E] text-white shadow-md">
          <Gift className="h-6 w-6" />
        </div>
        <h3 className="text-2xl font-serif font-bold text-stone-900" data-testid="exit-offer-title">
          {step <= 1 ? 'Você desbloqueou uma oferta especial' : 'Temos uma proposta ainda melhor'}
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          Leve o kit completo, com os 5 livros e as {FULL_KIT_RECIPES} receitas, por apenas
        </p>
        <div className="mt-3 text-5xl font-serif font-bold text-[#B83B1E]" data-testid="exit-offer-price">{brl(price)}</div>
        <p className="mt-2 text-xs text-stone-500">
          {card ? `à vista no Pix ou em até ${card.max_installments}x de ${brl(Number(card.installment_value))} no cartão` : 'à vista no Pix'}
        </p>
        <button
          type="button"
          onClick={onAccept}
          disabled={loading}
          data-testid="exit-offer-accept"
          className="mt-6 w-full rounded-xl bg-[#B83B1E] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#B83B1E]/20 transition hover:bg-[#8F2810] active:scale-95 disabled:opacity-60"
        >
          Quero o kit por {brl(price)}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          data-testid="exit-offer-back"
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-stone-200 px-4 py-2.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-300 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Voltar
        </button>
      </div>
    </div>
  );
};
