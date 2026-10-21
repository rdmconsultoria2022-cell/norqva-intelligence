/**
 * NORQVA-0107: lembrete de download para quem pagou e nunca baixou o livro.
 * Aprovado pelo Ricardo em 21/10/2026 20h12 ("2 sim").
 *
 * Etapas, contadas a partir da confirmação do pagamento (Asaas):
 *   1 = 3 horas, 2 = 24 horas. No máximo essas duas por pedido.
 * Se as duas já venceram (pedido mais antigo), manda só a etapa 2, uma vez.
 * Entre dois lembretes do mesmo pedido passam pelo menos 12 horas.
 *
 * Só pedidos da conta real (is_demo = false, COMMERCIAL_PRODUCTION), PAID, pagos entre 3 horas e
 * 30 dias atrás, com e-mail, sem nenhum download, sem estorno nem entrega bloqueada.
 * Cada lembrete leva um link NOVO (finalidade RESEND, o link de reenvio anterior deixa de valer).
 * Um registro por pedido e etapa (order_download_reminders) reservado antes do envio impede repetição.
 * DOWNLOAD_REMINDER_ENABLED=false desliga.
 */

import { Pool } from 'pg';
import { emailService, SendPurchaseAccessEmailParams, EmailServiceResult } from './emailService';
import { accessUrlBase, issueAccessToken } from './purchaseAccessService';
import { prepareDelivery, revokePrevious } from './salesService';
import { brandSenderNameForOrder } from './emailSender';
import { writeAuditLog } from '../db/audit';
import { getCommercialOrderClause } from '../utils/commercialTruthPolicy';

export const DOWNLOAD_REMINDER_STEPS: Array<{ step: 1 | 2; afterHours: number }> = [
  { step: 1, afterHours: 3 },
  { step: 2, afterHours: 24 }
];
const MAX_AGE_DAYS = 30;
const MIN_GAP_HOURS = 12;
const BATCH = 25;

export interface DownloadReminderDeps {
  send?: (params: SendPurchaseAccessEmailParams) => Promise<EmailServiceResult>;
  now?: Date;
  /** Só para testes: limita a estes pedidos. */
  orderIds?: string[];
}

export interface DownloadReminderResult {
  considered: number;
  sent: number;
  failed: number;
}

export function downloadRemindersEnabled(): boolean {
  return String(process.env.DOWNLOAD_REMINDER_ENABLED || '').trim().toLowerCase() !== 'false';
}

/** Etapa que já venceu para um pagamento confirmado há esta quantidade de horas; 0 = nenhuma. */
export function dueDownloadStep(hoursSincePaid: number): 0 | 1 | 2 {
  let due: 0 | 1 | 2 = 0;
  for (const s of DOWNLOAD_REMINDER_STEPS) if (hoursSincePaid >= s.afterHours) due = s.step;
  return due;
}

export async function runDownloadReminders(pool: Pool, deps: DownloadReminderDeps = {}): Promise<DownloadReminderResult> {
  const result: DownloadReminderResult = { considered: 0, sent: 0, failed: 0 };
  if (!downloadRemindersEnabled()) return result;
  const now = deps.now || new Date();
  const send = deps.send || ((p: SendPurchaseAccessEmailParams) => emailService.sendPurchaseAccessEmail(p));
  const base = accessUrlBase();
  if (!base) return result; // produção com FRONTEND_URL inválido: não manda link quebrado

  const firstStepAt = new Date(now.getTime() - DOWNLOAD_REMINDER_STEPS[0].afterHours * 3600 * 1000).toISOString();
  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString();

  const rows = await pool.query(
    `SELECT o.id AS order_id, pay.confirmed_at, item.offer_name,
            COALESCE((SELECT MAX(r.step) FROM order_download_reminders r WHERE r.order_id = o.id), 0) AS last_step
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN LATERAL (
       SELECT MIN(p.confirmed_at) AS confirmed_at
       FROM payments p
       WHERE p.order_id = o.id AND p.status = 'CONFIRMED' AND p.confirmed_at IS NOT NULL
     ) pay ON TRUE
     LEFT JOIN LATERAL (
       SELECT oi.offer_name_snapshot AS offer_name
       FROM order_items oi
       WHERE oi.order_id = o.id
       ORDER BY oi.is_bump ASC, oi.created_at ASC, oi.id ASC
       LIMIT 1
     ) item ON TRUE
     WHERE o.status = 'PAID'
       AND ${getCommercialOrderClause('o', false)}
       AND pay.confirmed_at IS NOT NULL
       AND pay.confirmed_at <= $1::timestamptz
       AND pay.confirmed_at > $2::timestamptz
       AND c.email IS NOT NULL AND c.email LIKE '%@%'
       AND NOT EXISTS (SELECT 1 FROM payments rp WHERE rp.order_id = o.id AND rp.status = 'REFUNDED')
       AND EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = o.id)
       AND NOT EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = o.id AND d.status = 'REVOKED')
       AND COALESCE((SELECT SUM(d.download_count) FROM order_deliveries d WHERE d.order_id = o.id), 0) = 0
       AND (CASE WHEN pay.confirmed_at <= $4::timestamptz - INTERVAL '24 hours' THEN 2 ELSE 1 END)
           > COALESCE((SELECT MAX(r.step) FROM order_download_reminders r WHERE r.order_id = o.id), 0)
       AND NOT EXISTS (
         SELECT 1 FROM order_download_reminders r
         WHERE r.order_id = o.id AND r.created_at > $4::timestamptz - INTERVAL '${MIN_GAP_HOURS} hours'
       )
       AND ($3::uuid[] IS NULL OR o.id = ANY($3::uuid[]))
     ORDER BY pay.confirmed_at ASC
     LIMIT ${BATCH}`,
    [firstStepAt, oldest, deps.orderIds && deps.orderIds.length ? deps.orderIds : null, now.toISOString()]
  );

  for (const row of rows.rows) {
    const hours = (now.getTime() - new Date(row.confirmed_at).getTime()) / 3600000;
    const step = dueDownloadStep(hours);
    if (!step || step <= Number(row.last_step || 0)) continue;
    result.considered++;
    const orderId: string = row.order_id;

    // Reserva a etapa antes de mandar (duas varreduras nunca mandam em dobro) e confere de novo,
    // agora, que o pedido segue pago, sem download e sem entrega bloqueada.
    const claim = await pool.query(
      `INSERT INTO order_download_reminders (order_id, step, status)
       SELECT $1::uuid, $2::int, 'SENDING'
       WHERE EXISTS (SELECT 1 FROM orders WHERE id = $1::uuid AND status = 'PAID')
         AND NOT EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = $1::uuid AND d.status = 'REVOKED')
         AND COALESCE((SELECT SUM(d.download_count) FROM order_deliveries d WHERE d.order_id = $1::uuid), 0) = 0
       ON CONFLICT (order_id, step) DO NOTHING
       RETURNING id`,
      [orderId, step]
    );
    if (!claim.rows.length) continue;
    const reminderId: string = claim.rows[0].id;

    let res: EmailServiceResult;
    let tokenId: string | null = null;
    try {
      const contact = await pool.query(
        'SELECT c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1',
        [orderId]
      );
      const email: string = contact.rows[0]?.email || '';
      if (!email.includes('@')) throw new Error('NO_EMAIL');
      await prepareDelivery(pool, orderId);
      await revokePrevious(pool, orderId, 'RESEND');
      const t = await issueAccessToken(pool, orderId, 'RESEND');
      tokenId = t.tokenId;
      const senderName = await brandSenderNameForOrder(pool, orderId);
      res = await send({
        email,
        offerName: row.offer_name || 'sua compra',
        recoveryUrl: `${base.replace(/\/$/, '')}/acesso/${t.rawToken}`,
        orderId,
        isDemo: false,
        kind: 'DOWNLOAD_REMINDER',
        validityHours: t.ttlHours,
        senderName
      });
    } catch (err: any) {
      res = { success: false, error: String(err?.message || 'SEND_ERROR').slice(0, 200) };
    }

    if (!res.success && tokenId) {
      // O link não chegou a ninguém: revoga para não deixar credencial órfã.
      await pool.query(
        `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 AND status = 'ACTIVE'`,
        [tokenId]
      );
    }
    const status = res.success ? 'SENT' : 'FAILED';
    const error = res.success ? null : String(res.error || 'FAILED').slice(0, 200);
    await pool.query(
      `UPDATE order_download_reminders SET status = $2, error = $3, sent_at = CASE WHEN $4::boolean THEN NOW() ELSE sent_at END WHERE id = $1`,
      [reminderId, status, error, res.success]
    );
    await writeAuditLog(
      pool,
      null,
      res.success ? 'DOWNLOAD_REMINDER_SENT' : 'DOWNLOAD_REMINDER_FAILED',
      `Lembrete de download (etapa ${step}) ${res.success ? 'enviado' : 'não enviado'} para o pedido ${orderId}`,
      null,
      res.success ? (res.simulated ? 'SIMULATED' : 'SENT') : error,
      false
    );
    if (res.success) result.sent++;
    else result.failed++;
  }
  return result;
}
