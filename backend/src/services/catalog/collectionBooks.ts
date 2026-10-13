// NORQVA-0061: livros da coleção Cozinha Italiana em Casa vendidos separadamente (Volumes III, IV e V).
// O produto é identificado pelo nome criado na migration 062; a página da oferta e a página do kit usam a chave.
import { Pool } from 'pg';

export const COLLECTION_BOOKS = [
  { key: 'paes', product: 'Pães & Fermentação Natural' },
  { key: 'antipasti', product: 'Antipasti & Aperitivo' },
  { key: 'risotos', product: 'Risotos & Polentas' }
] as const;

export type CollectionBookKey = (typeof COLLECTION_BOOKS)[number]['key'];

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

/** Livros da coleção com oferta ATIVA na conta real (uma por livro), para a página do kit. */
export async function activeCollectionBooks(pool: Pool) {
  const r = await pool.query(
    `SELECT p.name AS product_name, p.collection_key, o.human_id, o.price, o.promotional_price
     FROM offers o JOIN products p ON p.id = o.product_id
     WHERE (p.collection_key = ANY($2::text[]) OR p.name = ANY($1::text[])) AND o.status = 'ATIVA'
       AND o.is_demo = FALSE AND o.is_deleted = FALSE AND p.is_deleted = FALSE
       AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
     ORDER BY o.human_id`,
    [COLLECTION_BOOKS.map(b => b.product), COLLECTION_BOOKS.map(b => b.key)]
  );
  const out: { book: CollectionBookKey; human_id: string; price: number }[] = [];
  for (const row of r.rows) {
    const key = bookKeyForProduct({ collection_key: row.collection_key, name: row.product_name });
    if (!key || out.some(b => b.book === key)) continue;
    const promo = row.promotional_price !== null && row.promotional_price !== undefined ? parseFloat(row.promotional_price) : null;
    out.push({ book: key, human_id: row.human_id, price: promo && promo > 0 ? promo : parseFloat(row.price) });
  }
  return out;
}
