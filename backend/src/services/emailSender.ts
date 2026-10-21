/**
 * NORQVA-0107: nome do remetente pela marca do produto.
 *
 * O comprador compra "Trattoria em Casa" e não reconhece "NORQVA" na caixa de entrada.
 * O e-mail de acesso sai com o nome da marca do produto principal do pedido
 * (products.brand_id -> brands.name), no mesmo endereço de sempre. Sem marca: "NORQVA".
 */

import { Pool } from 'pg';

export const DEFAULT_SENDER_NAME = 'NORQVA';
export const DEFAULT_SENDER_ADDRESS = 'acesso@mail.norqva.com.br';
const MAX_SENDER_NAME = 60;

/** Limpa o nome do remetente: sem <>, aspas, quebras de linha e caracteres de controle; até 60 caracteres. */
export function sanitizeSenderName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f<>"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SENDER_NAME)
    .trim();
  return cleaned || null;
}

/** Endereço do remetente (parte entre < > de EMAIL_FROM, ou o próprio endereço). */
export function senderAddress(from?: string | null): string {
  const raw = String(from || '').trim();
  const m = raw.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (m) return m[1];
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(raw)) return raw;
  return DEFAULT_SENDER_ADDRESS;
}

/**
 * Monta o "From": com nome válido, "Nome <endereço>" (entre aspas se o nome tiver pontuação especial);
 * sem nome, mantém o remetente configurado.
 */
export function buildFromHeader(defaultFrom: string | null | undefined, senderName?: string | null): string {
  const fallback = String(defaultFrom || '').trim() || `${DEFAULT_SENDER_NAME} <${DEFAULT_SENDER_ADDRESS}>`;
  const name = sanitizeSenderName(senderName);
  if (!name) return fallback;
  const display = /[()<>\[\]:;@,.]/.test(name) ? `"${name}"` : name;
  return `${display} <${senderAddress(fallback)}>`;
}

/** Nome da marca do produto principal do pedido; "NORQVA" quando não há marca (ou em caso de erro). */
export async function brandSenderNameForOrder(pool: Pool, orderId: string): Promise<string> {
  try {
    const r = await pool.query(
      `SELECT b.name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN brands b ON b.id = p.brand_id
       WHERE oi.order_id = $1
       ORDER BY oi.is_bump ASC, oi.created_at ASC, oi.id ASC
       LIMIT 1`,
      [orderId]
    );
    return sanitizeSenderName(r.rows[0]?.name) || DEFAULT_SENDER_NAME;
  } catch (_) {
    return DEFAULT_SENDER_NAME;
  }
}
