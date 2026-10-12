// ─── TEMA DO PACOTE ───────────────────────────────────────────────────────────
// Configure com a paleta e a fonte DO FUNIL do usuário (extraídas na Fase 3).
// End card que parece a página de destino = coerência ad → página.

export const THEME = {
  brand: "trattoria",              // wordmark exibido no end card (minúsculo fica moderno)
  navy: "#3B2A20",             // cor de texto principal do end card
  accent: "#B5523B",   // NORQVA: terracota dos livros de cozinha           // cor de ação (botões) — copie do CTA do funil
  accent2: "#D9A441",          // cor secundária de highlight
  soft: "#8C6B4F",             // cor do wordmark / detalhes
  bg: "#F6EFE3",       // NORQVA: creme               // fundo do end card (claro, da paleta da página)
  // FONTE — default = stack do SISTEMA (Mac + Windows), zero download, zero delayRender.
  // Segoe UI cobre Windows, Helvetica Neue/Avenir cobre Mac, Arial é fallback universal.
  // Por que o default NÃO é uma .ttf custom: carregar fonte via FontFace/delayRender
  // estourava timeout em máquina fria e travava o render inteiro. Fonte de marca é OPT-IN:
  // só pra usar a fonte do funil, ponha o .ttf em public/ e preencha fontFile — aí o
  // Root.tsx carrega; com fontFile vazio ele nem tenta (usa a stack do sistema).
  // Ao ativar uma fonte custom, ponha "BrandFont" no INÍCIO desta string (ex.:
  // "BrandFont, 'Segoe UI', Arial, sans-serif") — o Root.tsx registra a face como BrandFont.
  fontFamily: "'Segoe UI', 'Helvetica Neue', Avenir, Arial, sans-serif",
  fontFile: "", // ex.: "BrandFont.ttf" (arquivo em public/) — vazio = fonte do sistema
};

// Contraste automático do texto do end card: a luminância do FUNDO decide texto
// claro ou escuro. Bug clássico que isso mata: usuário tematiza pra fundo escuro e a
// headline (navy) fica INVISÍVEL — texto da mesma cor do fundo. Nunca use THEME.navy
// direto sobre THEME.bg; use textOn(THEME.bg).
const _lum = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const textOn = (bg: string, dark: string = THEME.navy) =>
  _lum(bg) < 0.45 ? "#ffffff" : dark;

// highlight das legendas por persona (who do script.json) — cor de fundo da palavra
export const HIGHLIGHT: Record<string, string> = {
  // "ugc_sofa": "#2FBF9B",
  // "gs_avatar": "#F4A55C",
};
export const highlightFor = (who: string) => HIGHLIGHT[who] ?? THEME.accent;
