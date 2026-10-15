/**
 * NORQVA-0074: lembrete de pagamento para pedidos pendentes (Pix ou cartão).
 * Aprovado pelo Ricardo em 15/10/2026 10h38 (item 2 do diagnóstico).
 *
 * Etapas, contadas a partir da criação do pedido:
 *   1 = 15 minutos, 2 = 2 horas, 3 = 20 horas.
 * Se a varredura atrasar e mais de uma etapa já tiver vencido, manda só a mais recente.
 *
 * Só pedidos da conta real (is_demo = false, COMMERCIAL_PRODUCTION), ainda PENDING, criados nas
 * últimas 30 horas e com e-mail. Não manda quando o mesmo comprador já pagou outro pedido
 * desde 1 dia antes deste, nem para um pedido pendente se o comprador tem outro pendente mais novo
 * (só o mais novo recebe). Um registro por pedido e etapa (order_payment_reminders) impede repetição.
 * PAYMENT_REMINDER_ENABLED=false desliga.
 */

import { Pool } from 'pg';
import { emailService, SendPaymentReminderEmailParams, EmailServiceResult } from './emailService';
import { accessUrlBase } from './purchaseAccessService';

export const REMINDER_STEPS: Array<{ step: 1 | 2 | 3; afterMinutes: number }> = [
  { step: 1, afterMinutes: 15 },
  { step: 2, afterMinutes: 120 },
  { step: 3, afterMinutes: 20 * 60 }
];
const MAX_AGE_HOURS = 30;
const BATCH = 25;

export interface PaymentReminderDeps {
  send?: (params: SendPaymentReminderEmailParams) => Promise<EmailServiceResult>;
  now?: Date;
  /** Só para testes: limita a estes pedidos. */
  orderIds?: string[];
}

export interface PaymentReminderResult {
  considered: number;
  sent: number;
  failed: number;
}

export function remindersEnabled(): boolean {
  return String(process.env.PAYMENT_REMINDER_ENABLED || '').toLowerCase() !== 'false';
}

/** Etapa que já venceu para um pedido com esta idade (em minutos); 0 = nenhuma. */
export function dueStep(ageMinutes: number): 0 | 1 | 2 | 3 {
  let due: 0 | 1 | 2 | 3 = 0;
  for (const s of REMINDER_STEPS) if (ageMinutes >= s.afterMinutes) due = s.step;
  return due;
}

export function firstName(fullName: string | null | undefined): string {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export async function runPaymentReminders(pool: Pool, deps: PaymentReminderDeps = {}): Promise<PaymentReminderResult> {
  const result: PaymentReminderResult = { considered: 0, sent: 0, failed: 0 };
  if (!remindersEnabled()) return result;
  const now = deps.now || new Date();
  const send = deps.send || ((p: SendPaymentReminderEmailParams) => emailService.sendPaymentReminderEmail(p));
  const base = accessUrlBase();
  if (!base) return result; // produção com FRONTEND_URL inválido: não manda link quebrado

  const firstStepAt = new Date(now.getTime() - REMINDER_STEPS[0].afterMinutes * 60 * 1000).toISOString();
  const oldest = new Date(now.getTime() - MAX_AGE_HOURS * 3600 * 1000).toISOString();

  const rows = await pool.query(
    `SELECT o.id AS order_id, o.created_at, o.total_amount, o.customer_id,
            c.email, c.name AS customer_name,
            p.pix_copy_paste, p.expires_at, p.invoice_url, p.payment_method,
            oi.offer_name_snapshot, off.human_id AS offer_human_id,
            (SELECT COUNT(*) FROM offer_digital_assets oda WHERE oda.offer_id = oi.offer_id) AS asset_count,
            COALESCE((SELECT MAX(r.step) FROM order_payment_reminders r WHERE r.order_id = o.id), 0) AS last_step
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN LATERAL (
       SELECT pay.pix_copy_paste, pay.expires_at, pay.invoice_url, pay.payment_method
       FROM payments pay
       WHERE pay.order_id = o.id AND pay.status IN ('PENDING', 'CREATED')
       ORDER BY pay.created_at DESC
       LIMIT 1
     ) p ON TRUE
     JOIN LATERAL (
       SELECT i.offer_id, i.offer_name_snapshot
       FROM order_items i
       WHERE i.order_id = o.id
       ORDER BY COALESCE(i.is_bump, FALSE) ASC, i.created_at ASC
       LIMIT 1
     ) oi ON TRUE
     JOIN offers off ON off.id = oi.offer_id
     WHERE o.status = 'PENDING'
       AND o.is_demo = FALSE
       AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
       AND o.created_at <= $1::timestamptz
       AND o.created_at > $2::timestamptz
       AND c.email IS NOT NULL AND c.email <> ''
       AND NOT EXISTS (
         SELECT 1 FROM orders paid
         WHERE paid.customer_id = o.customer_id AND paid.status = 'PAID'
           AND paid.created_at >= o.created_at - INTERVAL '1 day'
       )
       AND NOT EXISTS (
         SELECT 1 FROM orders newer
         WHERE newer.customer_id = o.customer_id AND newer.status = 'PENDING'
           AND newer.created_at > o.created_at
       )
       AND ($3::uuid[] IS NULL OR o.id = ANY($3::uuid[]))
     ORDER BY o.created_at ASC
     LIMIT ${BATCH}`,
    [firstStepAt, oldest, deps.orderIds && deps.orderIds.length ? deps.orderIds : null]
  );

  for (const row of rows.rows) {
    const age = (now.getTime() - new Date(row.created_at).getTime()) / 60000;
    const step = dueStep(age);
    if (!step || step <= Number(row.last_step || 0)) continue;
    result.considered++;

    const pixExpired = Boolean(row.pix_copy_paste) && Boolean(row.expires_at) && new Date(row.expires_at).getTime() <= now.getTime();
    const path = Number(row.asset_count || 0) >= 2 ? 'kit' : 'p';
    const params: SendPaymentReminderEmailParams = {
      email: row.email,
      firstName: firstName(row.customer_name),
      offerName: row.offer_name_snapshot,
      amount: Number(row.total_amount),
      step,
      pixCopyPaste: pixExpired ? null : row.pix_copy_paste || null,
      pixExpiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      invoiceUrl: row.payment_method === 'CREDIT_CARD' ? row.invoice_url || null : null,
      offerUrl: `${base.replace(/\/$/, '')}/${path}/${encodeURIComponent(row.offer_human_id)}`,
      orderId: row.order_id,
      isDemo: false
    };

    // Reserva a etapa antes de mandar: duas varreduras ao mesmo tempo nunca mandam em dobro.
    const claim = await pool.query(
      `INSERT INTO order_payment_reminders (order_id, step, status, pix_expired)
       VALUES ($1, $2, 'SKIPPED', $3)
       ON CONFLICT (order_id, step) DO NOTHING
       RETURNING id`,
      [row.order_id, step, pixExpired]
    );
    if (!claim.rows.length) continue;

    let res: EmailServiceResult;
    try {
      res = await send(params);
    } catch (err: any) {
      res = { success: false, error: String(err?.message || 'SEND_ERROR').slice(0, 200) };
    }
    await pool.query(
      `UPDATE order_payment_reminders SET status = $2, error = $3, sent_at = NOW() WHERE id = $1`,
      [claim.rows[0].id, res.success ? 'SENT' : 'FAILED', res.success ? null : String(res.error || 'FAILED').slice(0, 200)]
    );
    if (res.success) result.sent++;
    else result.failed++;
  }
  return result;
}
