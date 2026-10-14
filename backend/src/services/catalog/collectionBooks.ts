// NORQVA-0061: livros da coleção Cozinha Italiana em Casa vendidos separadamente (Volumes III, IV e V).
// O produto é identificado pelo nome criado na migration 062; a página da oferta e a página do kit usam a chave.
// NORQVA-0063: Trattoria e Dolci também entram como livros avulsos no checkout do kit. Eles são achados pelo
// código fixo da oferta que já vende cada um (OFF-000001 e OFF-000005, migrations 051 a 053), porque o produto
// do Trattoria tem mais de uma oferta e o nome não basta.
import { Pool, PoolClient } from 'pg';

export const COLLECTION_BOOKS = [
  { key: 'paes', product: 'Pães & Fermentação Natural' },
  { key: 'antipasti', product: 'Antipasti & Aperitivo' },
  { key: 'risotos', product: 'Risotos & Polentas' }
] as const;

export type CollectionBookKey = (typeof COLLECTION_BOOKS)[number]['key'];

/** NORQVA-0063: livros vendidos pelo código fixo da oferta (não têm chave no produto). */
export const FIXED_BOOK_OFFERS = { trattoria: 'OFF-000001', dolci: 'OFF-000005' } as const;
export type FixedBookKey = keyof typeof FIXED_BOOK_OFFERS;
export type SaleBookKey = CollectionBookKey | FixedBookKey;

/** Ordem dos livros no checkout do kit (Volume I primeiro, sobremesas por último). */
export const SALE_BOOK_ORDER: SaleBookKey[] = ['trattoria', 'risotos', 'antipasti', 'paes', 'dolci'];

/** Máximo de livros avulsos num pedido (o principal + 4 extras = os 5 da coleção). */
export const MAX_EXTRA_BOOKS = 4;

export function bookKeyForProductName(name: unknown): CollectionBookKey | null {
  const n = String(name || '').trim().toLowerCase();
  const hit = COLLECTION_BOOKS.find(b => b.product.toLowerCase() === n);
  return hit ? hit.key : null;
}

/** Chave fixa gravada pela migration 062 (products.collection_key); o nome é só o reserva. */
export function bookKeyForProduct(p: { collection_key?: unknown; name?: unknown }): CollectionBookKey | null {
  const k = String(p.collection_key || '').trim().toLowerCase();
  const byKey = COLLECTION_BOOKS.find(b => b.key === k);
  return byKey ? byKey.key : bookKeyForProductName(p.name);
}

/** NORQVA-0063: livro vendido avulso por esta oferta (código fixo ou produto da coleção), ou null. */
export function saleBookKey(offer: { human_id?: unknown }, product: { collection_key?: unknown; name?: unknown }): SaleBookKey | null {
  const code = String(offer.human_id || '').trim().toUpperCase();
  const fixed = (Object.keys(FIXED_BOOK_OFFERS) as FixedBookKey[]).find(k => FIXED_BOOK_OFFERS[k] === code);
  if (fixed) return fixed;
  return bookKeyForProduct(product);
}

const activePrice = (row: any) => {
  const promo = row.promotional_price !== null && row.promotional_price !== undefined ? parseFloat(row.promotional_price) : null;
  return promo && promo > 0 ? promo : parseFloat(row.price);
};

/**
 * Livros da coleção com oferta ATIVA na conta real (uma por livro), para a página do kit.
 * `offer` é a linha interna da oferta (para calcular o cartão); a rota pública escolhe o que mostrar.
 */
export async function activeCollectionBooks(pool: Pool) {
  const r = await pool.query(
    `SELECT p.name AS product_name, p.collection_key, o.*
     FROM offers o JOIN products p ON p.id = o.product_id
     WHERE (p.collection_key = ANY($2::text[]) OR p.name = ANY($1::text[]) OR o.human_id = ANY($3::text[]))
       AND o.status = 'ATIVA'
       AND o.is_demo = FALSE AND o.is_deleted = FALSE AND p.is_deleted = FALSE
       AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
     ORDER BY o.human_id`,
    [COLLECTION_BOOKS.map(b => b.product), COLLECTION_BOOKS.map(b => b.key), Object.values(FIXED_BOOK_OFFERS)]
  );
  const out: { book: SaleBookKey; human_id: string; price: number; offer_id: string; offer: any }[] = [];
  for (const row of r.rows) {
    const key = saleBookKey({ human_id: row.human_id }, { collection_key: row.collection_key, name: row.product_name });
    if (!key || out.some(b => b.book === key)) continue;
    out.push({ book: key, human_id: row.human_id, price: activePrice(row), offer_id: String(row.id), offer: row });
  }
  out.sort((a, b) => SALE_BOOK_ORDER.indexOf(a.book) - SALE_BOOK_ORDER.indexOf(b.book));
  return out;
}

export class CollectionOrderError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CollectionExtra {
  key: SaleBookKey;
  offer: any;
  product: any;
  price: number;
}

/**
 * NORQVA-0063: livros avulsos que entram no mesmo pedido do livro principal.
 * O navegador manda só os códigos das ofertas; preço, oferta e produto vêm daqui. Qualquer problema recusa tudo.
 */
export async function resolveCollectionExtras(
  q: Pool | PoolClient,
  mainOffer: any,
  mainProduct: any,
  rawCodes: unknown
): Promise<CollectionExtra[]> {
  if (!Array.isArray(rawCodes) || rawCodes.length === 0 || rawCodes.length > MAX_EXTRA_BOOKS || rawCodes.some(c => typeof c !== 'string' || !c.trim())) {
    throw new CollectionOrderError(400, 'Escolha de livros inválida.');
  }
  const codes = rawCodes.map(c => String(c).trim().toUpperCase());
  if (new Set(codes).size !== codes.length) throw new CollectionOrderError(400, 'O mesmo livro foi escolhido duas vezes.');

  const mainKey = saleBookKey(mainOffer, mainProduct);
  if (!mainKey) throw new CollectionOrderError(400, 'Esta oferta não vende livros avulsos da coleção.');
  if (mainOffer.status !== 'ATIVA') throw new CollectionOrderError(409, 'Um dos livros escolhidos não está à venda agora.');

  const keys = new Set<SaleBookKey>([mainKey]);
  const extras: CollectionExtra[] = [];
  for (const code of codes) {
    const o = await q.query('SELECT * FROM offers WHERE human_id = $1 AND is_deleted = FALSE', [code]);
    const offer = o.rows[0];
    if (
      !offer || offer.status !== 'ATIVA' || Boolean(offer.is_demo) !== Boolean(mainOffer.is_demo) ||
      String(offer.data_provenance || '') !== String(mainOffer.data_provenance || '')
    ) {
      throw new CollectionOrderError(409, 'Um dos livros escolhidos não está à venda agora.');
    }
    if (String(offer.id) === String(mainOffer.id)) throw new CollectionOrderError(400, 'O mesmo livro foi escolhido duas vezes.');
    const p = await q.query('SELECT * FROM products WHERE id = $1 AND is_deleted = FALSE', [offer.product_id]);
    const product = p.rows[0];
    if (!product || Boolean(product.is_demo) !== Boolean(mainOffer.is_demo)) {
      throw new CollectionOrderError(409, 'Um dos livros escolhidos não está à venda agora.');
    }
    const key = saleBookKey(offer, product);
    if (!key) throw new CollectionOrderError(400, 'Só livros da coleção podem ser comprados avulsos.');
    if (keys.has(key)) throw new CollectionOrderError(400, 'O mesmo livro foi escolhido duas vezes.');
    keys.add(key);
    // Mesmo preço que a lista pública mostra (promoção só quando maior que zero)
    const price = Math.round(activePrice(offer) * 100) / 100;
    if (!(price > 0)) throw new CollectionOrderError(409, 'Um dos livros escolhidos não está à venda agora.');
    extras.push({ key, offer, product, price });
  }

  // Cada livro precisa do seu próprio PDF, sem arquivo em comum (a entrega é por arquivo).
  const offerIds = [String(mainOffer.id), ...extras.map(e => String(e.offer.id))];
  const a = await q.query('SELECT offer_id, asset_id FROM offer_digital_assets WHERE offer_id = ANY($1::uuid[])', [offerIds]);
  const byOffer = new Map<string, string[]>();
  for (const row of a.rows) {
    const k = String(row.offer_id);
    byOffer.set(k, [...(byOffer.get(k) || []), String(row.asset_id)]);
  }
  const seen = new Set<string>();
  for (const id of offerIds) {
    const assets = byOffer.get(id) || [];
    if (assets.length === 0) throw new CollectionOrderError(409, 'Um dos livros escolhidos ainda não tem arquivo de entrega.');
    for (const asset of assets) {
      if (seen.has(asset)) throw new CollectionOrderError(409, 'Dois livros escolhidos têm o mesmo arquivo de entrega.');
      seen.add(asset);
    }
  }
  return extras;
}
