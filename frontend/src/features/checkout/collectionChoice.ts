// NORQVA-0063: livros da coleção que o checkout do kit oferece como avulsos.
// Nome, capa e número de receitas são fixos aqui; preço, oferta e cartão vêm sempre do servidor (/public/collection).

export interface SaleBookInfo {
  name: string;
  note: string;
  cover: string;
}

export const SALE_BOOK_INFO: Record<string, SaleBookInfo> = {
  trattoria: { name: 'Trattoria em Casa', note: 'Massas e molhos · 28 receitas', cover: '/images/kit/capa_trat.jpg' },
  risotos: { name: 'Risotos & Polentas', note: '12 receitas', cover: '/images/livros/risotos/capa.jpg' },
  antipasti: { name: 'Antipasti & Aperitivo', note: '12 receitas', cover: '/images/livros/antipasti/capa.jpg' },
  paes: { name: 'Pães & Fermentação Natural', note: '12 receitas', cover: '/images/livros/paes/capa.jpg' },
  dolci: { name: 'Dolci della Nonna', note: 'Sobremesas · 10 receitas', cover: '/images/kit/capa_dolci.jpg' }
};

/** Ordem dos livros na tela (a mesma do servidor). */
export const SALE_BOOK_ORDER = ['trattoria', 'risotos', 'antipasti', 'paes', 'dolci'];

/** Total de receitas dos 5 livros (28 + 12 + 12 + 12 + 10). */
export const FULL_KIT_RECIPES = 74;

/** Kit com os 5 livros: a oferta entrega 5 PDFs ou mais. */
export const isFullKit = (offer: { delivery_files?: number | null } | null | undefined) => Number(offer?.delivery_files) >= 5;
