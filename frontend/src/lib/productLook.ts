// NORQVA-0112: visual das telas do comprador (pagamento, Pix/cartão e entrega) escolhido pelo nome da oferta.
// 'light' = livros de cozinha (creme e terracota, NORQVA-0041/0043); 'dark' = Bolso Blindado;
// 'fresh' = Desafio Seca Barriga 21 Dias (fundo claro, verde e coral, Inter).

export type ProductLook = 'dark' | 'light' | 'fresh';

/** Cores do visual 'fresh' (Seca Barriga). */
export const FRESH = {
  bg: '#F7F8F4',
  card: '#FFFFFF',
  ink: '#18211C',
  muted: '#5B665F',
  line: '#E3E7DF',
  from: '#10B981',
  to: '#059669',
  accent: '#F0795B'
} as const;

/** Botão principal do visual 'fresh': degradê verde com texto branco. */
export const FRESH_BUTTON_STYLE = {
  backgroundImage: `linear-gradient(135deg, ${FRESH.from}, ${FRESH.to})`,
  color: '#FFFFFF'
} as const;

const FRESH_RE = /seca\s*barriga/i;

/** Algum dos nomes (oferta, produto, item do pedido) é do Seca Barriga. */
export function isFreshName(...names: Array<string | null | undefined>): boolean {
  return names.some(n => FRESH_RE.test(String(n || '')));
}

/** Visual a partir dos nomes da oferta/produto. Livros de cozinha continuam 'light'. */
export function lookForNames(...names: Array<string | null | undefined>): ProductLook {
  if (isFreshName(...names)) return 'fresh';
  if (names.some(n => /bolso/i.test(String(n || '')))) return 'dark';
  return 'light';
}

/** NORQVA-0135: Kit de Bordado (não é livro de cozinha, mesmo com "Kit" no nome). */
export function isBordadoName(...names: Array<string | null | undefined>): boolean {
  return names.some(n => /bordad/i.test(String(n || '')));
}

export const BORDADO_INFO = {
  title: 'Kit de Bordado NORQVA',
  cover: '/images/bordado/capa.jpg',
  label: 'Kit digital em PDF',
  subtitle: '50 riscos para iniciantes • PDF para imprimir',
  info: '50 riscos para iniciantes e guia de pontos (PDF)',
  /** NORQVA-0155: bônus da página de entrega (endereço difícil de adivinhar, sem proteção: o arquivo é público no site) */
  lesson: { src: '/videos/bordado/aula_gatinho_0e9f11545fcc.mp4', poster: '/videos/bordado/aula_gatinho_0e9f11545fcc.jpg', title: 'Aula em vídeo: o Gatinho do risco ao bastidor', info: '2 min 39 s · do risco impresso ao bordado pronto' }
};
