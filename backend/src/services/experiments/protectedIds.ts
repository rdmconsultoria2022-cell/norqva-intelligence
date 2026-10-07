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
