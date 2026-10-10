// NORQVA-0041: parcelamento escolhido pelo comprador. Até `free` parcelas sem juros (o vendedor absorve);
// acima disso, juros mensais pela Tabela Price repassados ao comprador. Parcela mínima R$ 5,00.
// Tudo em centavos. A mesma conta vale na tela e no servidor (o servidor nunca aceita valor do navegador).

export const MIN_INSTALLMENT_CENTS = 500;
export const MAX_INSTALLMENTS = 12;

export interface CardPlan {
  /** máximo de parcelas permitido na oferta (1–12) */
  max: number;
  /** parcelas sem juros (1–max) */
  free: number;
  /** juros ao mês, em %, acima das parcelas sem juros (0 = todas sem juros) */
  rate: number;
}

export interface InstallmentOption {
  n: number;
  /** valor de cada parcela; null quando as parcelas sem juros não dividem igual (o Asaas ajusta a última) */
  valueCents: number | null;
  totalCents: number;
  interest: boolean;
}

export function planFromOffer(o: { card_max_installments?: any; card_free_installments?: any; card_interest_monthly?: any }): CardPlan {
  const max = Math.min(MAX_INSTALLMENTS, Math.max(1, Math.floor(Number(o.card_max_installments) || 1)));
  const freeRaw = o.card_free_installments === null || o.card_free_installments === undefined ? max : Math.floor(Number(o.card_free_installments) || 1);
  const free = Math.min(max, Math.max(1, freeRaw));
  const rate = Math.max(0, Number(o.card_interest_monthly) || 0);
  return { max, free, rate };
}

export function installmentOption(baseCents: number, n: number, plan: CardPlan): InstallmentOption | null {
  if (!Number.isInteger(n) || n < 1 || n > plan.max || !(baseCents > 0)) return null;
  if (n <= plan.free || plan.rate <= 0) {
    const even = baseCents % n === 0;
    const per = even ? baseCents / n : Math.ceil(baseCents / n);
    if (n > 1 && Math.floor(baseCents / n) < MIN_INSTALLMENT_CENTS) return null;
    return { n, valueCents: even ? per : null, totalCents: baseCents, interest: false };
  }
  const i = plan.rate / 100;
  const pmt = (baseCents * i) / (1 - Math.pow(1 + i, -n));
  const valueCents = Math.ceil(pmt - 1e-9);
  if (valueCents < MIN_INSTALLMENT_CENTS) return null;
  return { n, valueCents, totalCents: valueCents * n, interest: true };
}

export function installmentOptions(baseCents: number, plan: CardPlan): InstallmentOption[] {
  const out: InstallmentOption[] = [];
  for (let n = 1; n <= plan.max; n++) {
    const o = installmentOption(baseCents, n, plan);
    if (o) out.push(o);
  }
  return out;
}
