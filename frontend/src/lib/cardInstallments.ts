// NORQVA-0041: mesma conta do servidor (backend/src/services/commerce/cardInstallments.ts), só para mostrar.
// O valor cobrado é sempre recalculado no servidor.
export const MIN_INSTALLMENT_CENTS = 500;

export interface CardPlan { max: number; free: number; rate: number }
export interface InstallmentOption { n: number; valueCents: number | null; totalCents: number; interest: boolean }

export function installmentOption(baseCents: number, n: number, plan: CardPlan): InstallmentOption | null {
  if (!Number.isInteger(n) || n < 1 || n > plan.max || !(baseCents > 0)) return null;
  if (n <= plan.free || plan.rate <= 0) {
    const even = baseCents % n === 0;
    if (n > 1 && Math.floor(baseCents / n) < MIN_INSTALLMENT_CENTS) return null;
    return { n, valueCents: even ? baseCents / n : null, totalCents: baseCents, interest: false };
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

export const brlCents = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
// CDC art. 52: mostrar também a taxa efetiva anual
export const annualRate = (r: number) => (Math.pow(1 + r / 100, 12) - 1) * 100;
export const rateLabel = (r: number) => `${r.toFixed(2).replace('.', ',')}% ao mês (${annualRate(r).toFixed(2).replace('.', ',')}% ao ano)`;
