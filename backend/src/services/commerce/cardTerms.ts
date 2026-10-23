// NORQVA-0038/0041: condições públicas do cartão de uma oferta. Saiu de controllers/api.ts na NORQVA-0116
// (sem mudar a conta) para a página gerada mostrar o mesmo preço e parcelas do pagamento.
import { planFromOffer, installmentOptions } from './cardInstallments';

/**
 * NORQVA-0038/0041: condições públicas do cartão de uma oferta (só a oferta principal, sem adicional).
 * `max_installments`/`installment_value` = o parcelamento SEM JUROS (o que a página anuncia);
 * `options` = todas as escolhas do comprador, com juros acima das sem juros.
 */
export function publicCardTerms(offer: any): {
  max_installments: number;
  total: number;
  installment_value: number;
  interest_monthly: number;
  plan: { max: number; free: number; rate: number };
  options: { n: number; installment_value: number | null; total: number; interest: boolean }[];
} | null {
  if (!offer.card_enabled) return null;
  const pix = offer.promotional_price !== null && offer.promotional_price !== undefined ? parseFloat(offer.promotional_price) : parseFloat(offer.price);
  const total = offer.card_total_price !== null && offer.card_total_price !== undefined ? Math.max(parseFloat(offer.card_total_price), pix) : pix;
  const baseCents = Math.round(total * 100);
  const plan = planFromOffer(offer);
  const options = installmentOptions(baseCents, plan).map(o => ({
    n: o.n,
    installment_value: o.valueCents === null ? null : o.valueCents / 100,
    total: o.totalCents / 100,
    interest: o.interest
  }));
  const freeOpts = options.filter(o => !o.interest);
  const n = freeOpts.length ? freeOpts[freeOpts.length - 1].n : 1;
  return {
    max_installments: n,
    total,
    installment_value: Math.floor(baseCents / n) / 100,
    interest_monthly: plan.rate,
    plan,
    options
  };
}
