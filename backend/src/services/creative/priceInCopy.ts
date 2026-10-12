// NORQVA-0053 (D-0053): anúncio sem preço. O preço aparece só na página, no WhatsApp e no pagamento.
// Esta trava olha o TEXTO do anúncio (título, texto principal, gancho, chamada, roteiro). O vídeo é
// conferido por quem aprova (a tela pede a confirmação) e pela fábrica de criativos, que nunca põe preço.

const RULES: { re: RegExp; label: string }[] = [
  { re: /R\s?\$\s*\d[\d.,]*\d|R\s?\$\s*\d/i, label: 'valor em reais (R$)' },
  // 19,90 · 27.90 (não pega data 12.10.2026, hora 19:30, porcentagem 4,99% nem 1.000)
  { re: /(?<![\d/.,:])\d{1,5}[.,]\d{2}(?!\d|[.,/:]\d|\s?%)/, label: 'valor com centavos' },
  { re: /\b\d{1,2}\s?x\s?(?:de\s)?(?:R\s?\$\s?)?\d/i, label: 'parcelas' },
  { re: /\b(?:reais|centavos)\b/i, label: 'a palavra "reais"' },
  { re: /\bpor\s+(?:apenas|somente|s[oó])\b/i, label: '"por apenas"' },
  { re: /\bpre[cç]os?\b/i, label: 'a palavra "preço"' },
  { re: /\d{1,3}\s?%\s?(?:de\s)?(?:desconto|off)\b/i, label: 'desconto em %' },
  { re: /\b(?:desconto|cupom)\s+de\s+\d/i, label: 'desconto' }
];

/** Primeiro trecho de preço encontrado no texto (ou null). */
export function findPriceInText(text: unknown): { match: string; label: string } | null {
  const s = String(text ?? '');
  if (!s.trim()) return null;
  for (const r of RULES) {
    const m = s.match(r.re);
    if (m) return { match: m[0].trim(), label: r.label };
  }
  return null;
}

export const PRICE_FIELD_LABEL: Record<string, string> = {
  hook: 'gancho',
  primary_text: 'texto principal',
  copy: 'texto principal',
  headline: 'título',
  description: 'descrição',
  cta: 'chamada',
  script: 'roteiro'
};

/** Campos com preço. Vazio = pode seguir. */
export function findPriceInFields(fields: Record<string, unknown>): { field: string; match: string; label: string }[] {
  const out: { field: string; match: string; label: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const hit = findPriceInText(value);
    if (hit) out.push({ field, ...hit });
  }
  return out;
}

/** Mensagem para a tela: qual campo e qual trecho barrou. */
export function priceErrorMessage(hits: { field: string; match: string }[], prefix = 'Anúncio sem preço'): string {
  const parts = hits.map(h => `${PRICE_FIELD_LABEL[h.field] || h.field}: "${h.match}"`);
  return `${prefix}: tire o preço do anúncio (${parts.join('; ')}). O preço aparece só na página, no WhatsApp e no pagamento.`;
}
