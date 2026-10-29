/**
 * NORQVA-0148: pedido "substituído".
 *
 * Pedido ainda aguardando cuja pessoa pagou outro pedido logo depois (até 7 dias): o primeiro Pix
 * foi abandonado porque a pessoa refez a compra. Ele aparece como "Substituído" em Vendas e sai da
 * contagem "aguardando" do painel. Nada é gravado: o cálculo é feito na hora, sobre os pedidos PAID.
 *
 * A mesma pessoa = mesmo cadastro, mesmo e-mail (sem diferença de maiúscula ou acento) ou
 * mesmo telefone (DDD + 8 últimos dígitos, com ou sem 55 e com ou sem o 9 da frente; número com
 * dígito repetido, comum quando a pessoa inventa um, não conta). O pedido pago precisa ser da mesma
 * origem (real com real, teste com teste) e de valor igual ou maior que o do pedido aguardando.
 */

import { Pool } from 'pg';

export const SUPERSEDED_WINDOW_DAYS = 7;

export interface PendingCandidate {
  id: string;
  created_at: string | Date;
  customer_id: string | null;
  email: string | null;
  phone: string | null;
  is_demo: boolean;
  data_provenance?: string | null;
  total_amount?: number | string | null;
}

export function emailKey(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const key = email.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return key.includes('@') ? key : null;
}

export function phoneKey(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  let d = phone.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  const last8 = d.slice(-8);
  if (/^(\d)\1+$/.test(last8) || last8 === '12345678' || last8 === '87654321') return null;
  return d.slice(0, 2) + last8;
}

const time = (v: string | Date) => new Date(v).getTime();

/** Ids dos pedidos da lista que foram substituídos por um pedido pago da mesma pessoa. */
export async function findSupersededOrderIds(pool: Pool, pending: PendingCandidate[]): Promise<Set<string>> {
  const result = new Set<string>();
  const list = pending.filter(p => p && p.id && p.created_at && !Number.isNaN(time(p.created_at)));
  if (!list.length) return result;

  const windowMs = SUPERSEDED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const from = new Date(Math.min(...list.map(p => time(p.created_at)))).toISOString();
  const to = new Date(Math.max(...list.map(p => time(p.created_at))) + windowMs).toISOString();

  const paid = await pool.query(
    `SELECT o.id, o.created_at, o.customer_id, o.is_demo, o.data_provenance, o.total_amount, c.email, c.phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.status = 'PAID' AND o.created_at > $1::timestamptz AND o.created_at <= $2::timestamptz`,
    [from, to]
  );
  const paidRows = paid.rows.map((r: any) => ({
    at: time(r.created_at),
    customerId: r.customer_id ? String(r.customer_id) : null,
    isDemo: !!r.is_demo,
    provenance: r.data_provenance ? String(r.data_provenance) : null,
    amount: Number(r.total_amount) || 0,
    email: emailKey(r.email),
    phone: phoneKey(r.phone)
  }));

  for (const p of list) {
    const at = time(p.created_at);
    const email = emailKey(p.email);
    const phone = phoneKey(p.phone);
    const customerId = p.customer_id ? String(p.customer_id) : null;
    const provenance = p.data_provenance ? String(p.data_provenance) : null;
    const amount = Number(p.total_amount) || 0;
    const replaced = paidRows.some(r =>
      r.isDemo === !!p.is_demo &&
      (!provenance || r.provenance === provenance) &&
      r.amount + 0.005 >= amount &&
      r.at > at &&
      r.at <= at + windowMs &&
      ((customerId && r.customerId === customerId) || (email && r.email === email) || (phone && r.phone === phone))
    );
    if (replaced) result.add(p.id);
  }
  return result;
}
