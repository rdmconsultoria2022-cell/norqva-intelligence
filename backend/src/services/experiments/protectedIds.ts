// R-0019-01 / CONTROL: IDs da Meta que o NORQVA nunca pausa nem altera automaticamente.
/** CONTROL (TRATTORIA_REVENUE_V1): campanha, conjunto e anúncio. */
export const DEFAULT_PROTECTED_META_IDS = ['120249666098740097', '120249666098760097', '120249666532700097'];

/** Lista fixa + PROTECTED_META_IDS (separados por vírgula). */
export function protectedMetaIds(env: Record<string, string | undefined> = process.env): Set<string> {
  const extra = String(env.PROTECTED_META_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d{5,25}$/.test(s));
  return new Set([...DEFAULT_PROTECTED_META_IDS, ...extra]);
}

/**
 * H8: a Meta exige um mínimo para o limite de gastos da campanha (em BRL: R$ 300,00, erro 100/2446307).
 * Quando o teto do NORQVA fica abaixo disso, o limite na Meta vira trava de segurança (backstop) no mínimo
 * aceito, e quem pausa no teto real é o vigia do NORQVA (H6/H7).
 */
export const metaMinCampaignSpendCapBRL = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.META_MIN_CAMPAIGN_SPEND_CAP_BRL);
  return Number.isFinite(n) && n > 0 ? n : 300;
};
export const metaSpendCapFor = (capBrl: number, env: Record<string, string | undefined> = process.env) => Math.max(capBrl, metaMinCampaignSpendCapBRL(env));

/**
 * Lê o mínimo citado no erro da Meta: "pelo menos R$300,00" (mínimo da moeda, 100/2446307) ou
 * "não pode ser inferior a R$448,62 agora porque algumas cobranças podem estar pendentes" (100/1885058:
 * gasto atual + R$ 300). Em inglês: "at least" / "cannot be less than".
 */
export function minimumFromMetaError(message: string): number | null {
  const m = String(message || '').match(/(?:pelo menos|at least|n[ãa]o pode ser inferior a|cannot be (?:less|lower) than|can't be (?:less|lower) than)\s*R\$\s?([\d.,]+)/i);
  if (!m) return null;
  const raw = m[1].replace(/[.,]$/, '');
  const n = /,\d{2}$/.test(raw) ? parseFloat(raw.replace(/\./g, '').replace(',', '.')) : parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
