// NORQVA-0053 (D-0053): anúncio sem preço. O preço aparece só na página, no WhatsApp e no pagamento.
// Esta trava olha o TEXTO do anúncio (título, texto principal, gancho, chamada, roteiro). O vídeo é
// conferido por quem aprova (a tela pede a confirmação) e pela fábrica de criativos, que nunca põe preço.

// Número "solto" (preço) = não seguido de palavra: "por apenas 27" é preço, "por apenas 3 ingredientes" não.
const NUM_END = '(?!\\s*[a-zà-úç\\d])';

const RULES: { re: RegExp; label: string }[] = [
  { re: /R\s?\$\s*\d[\d.,]*\d|R\s?\$\s*\d|\bUS\s?\$\s*\d/i, label: 'valor em reais (R$)' },
  // 19,90 · 27.90 (não pega data 12.10.2026, hora 19:30, porcentagem 4,99%, 1.000 nem 1,25 kg)
  { re: /(?<![\dA-Za-z/.,:])\d{1,5}[.,]\d{2}(?!\d|[.,/:]\d|\s?%|\s?(?:kg|mg|g|ml|l|cm|mm|m|°|º)(?![a-zà-ú]))/i, label: 'valor com centavos' },
  // parcelas: "4x de R$ 7", "4x de 7,48", "12x sem juros", "em até 12x", "parcele em 12 vezes" (não pega "forma 20x30 cm")
  { re: /\b\d{1,2}\s?x\s?(?:de\s+)?(?:R\s?\$|\d+,\d{2}(?!\d))/i, label: 'parcelas' },
  { re: /\b\d{1,2}\s?x\s+sem\s+juros\b|\bem\s+at[eé]\s+\d{1,2}\s?(?:x|vezes)(?![a-z])|\bparcel\w*\s+em\s+(?:at[eé]\s+)?\d|\b\d{1,2}\s+vezes\s+(?:sem\s+juros|no\s+cart[aã]o)/i, label: 'parcelas' },
  { re: /\b\d+\s*(?:real|reais|contos?|pila)\b|\b(?:reais|centavos)\b/i, label: 'valor em reais' },
  { re: new RegExp('\\bpor\\s+(?:apenas|somente|s[oó])\\s+(?:R\\s?\\$\\s?\\d|\\d+(?:[.,]\\d{2})?' + NUM_END + '|um\\s+caf[eé])', 'i'), label: '"por apenas"' },
  { re: new RegExp('\\b(?:custa|custando|a\\s+partir\\s+de|valor\\s+de|investimento\\s+de|sai\\s+por|apenas)\\s+(?:R\\s?\\$\\s?\\d|\\d+(?:[.,]\\d{2})?' + NUM_END + ')', 'i'), label: 'valor' },
  { re: /\bde\s+(?:R\s?\$\s?)?\d+(?:[.,]\d{2})?\s+por\s+(?:R\s?\$\s?)?\d/i, label: '"de X por Y"' },
  { re: /(?<![a-zà-ú])pre[cç]os?(?![a-zà-ú])/i, label: 'a palavra "preço"' },
  { re: /\d{1,3}\s?%\s?(?:de\s)?(?:desconto|off)\b|\b(?:desconto|cupom)\s+de\s+\d/i, label: 'desconto' }
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
