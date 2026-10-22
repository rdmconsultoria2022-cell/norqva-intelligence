// NORQVA-0063: livros da coleção que o checkout do kit oferece como avulsos.
import { READY_BOOKS } from '../public/bookPages';
import type { CollectionSaleBook } from './checkoutTypes';
import { isFreshName } from '../../lib/productLook';
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

/**
 * Kit com os 5 livros: a oferta entrega 5 PDFs ou mais.
 * NORQVA-0112: o Seca Barriga entrega 10 PDFs e não é o kit de livros (sem escolha de livros no pagamento).
 */
export const isFullKit = (offer: { delivery_files?: number | null; name?: string | null } | null | undefined) =>
  Number(offer?.delivery_files) >= 5 && !isFreshName(offer?.name);

/**
 * NORQVA-0064: livros da lista pública (/public/collection) que podem ser vendidos avulsos no checkout:
 * Trattoria e Dolci, e os volumes com página pronta no site (READY_BOOKS). Preço e oferta vêm do servidor.
 */
export function toSaleBooks(raw: unknown): CollectionSaleBook[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b: any) => b && b.book && b.human_id && b.offer_id && Number(b.price) > 0 && SALE_BOOK_INFO[String(b.book)] && (READY_BOOKS.has(String(b.book)) || b.book === 'trattoria' || b.book === 'dolci'))
    .map((b: any) => ({ book: String(b.book), human_id: String(b.human_id), offer_id: String(b.offer_id), price: Number(b.price), card: b.card || null }));
}
