// NORQVA-0123 etapa B: um único lembrete pelo WhatsApp para o Pix gerado na conversa e não pago.
// Regras (contrato NORQVA-0123): texto fixo, sem IA; Pix criado entre 30 e 120 minutos atrás; só o Pix mais novo
// da conversa; conversa no atendente automático; número conectado e atendente ligado; ninguém escreveu nos últimos
// 25 minutos; limites por hora do atendente; só entre 08h e 22h de Brasília (fora do horário, não guarda para depois);
// confere o pagamento no Asaas antes; uma linha por pagamento (whatsapp_payment_reminders) impede repetir.
// Cartão fica de fora. Número oficial: só com a janela de 24h aberta. WHATSAPP_PIX_REMINDER_ENABLED=true liga.
import { Pool } from 'pg';
import { providerForNumber } from './cloudAccounts';
import { isCloudProvider, SendBlockedError } from './metaCloudProvider';
import { isServiceWindowOpen } from './serviceWindow';
import { recordOutgoing } from './whatsappService';
import { BOT_REPLIES_PER_CONVERSATION_HOUR, BOT_MESSAGES_PER_NUMBER_HOUR } from './attendant';
import { writeAuditLog } from '../../db/audit';
import { WhatsAppProvider } from './provider';

export const PIX_REMINDER_AFTER_MINUTES = 30;
export const PIX_REMINDER_MAX_AGE_MINUTES = 120;
export const PIX_REMINDER_QUIET_MINUTES = 25;
export const PIX_REMINDER_START_HOUR = 8;
export const PIX_REMINDER_END_HOUR = 22;
const BATCH = 25;

export function pixRemindersEnabled(): boolean {
  return String(process.env.WHATSAPP_PIX_REMINDER_ENABLED || '').trim().toLowerCase() === 'true';
}

/** Hora (0–23) em Brasília. */
export function brasiliaHour(now: Date): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(h) % 24;
}

export function withinReminderHours(now: Date): boolean {
  const h = brasiliaHour(now);
  return h >= PIX_REMINDER_START_HOUR && h < PIX_REMINDER_END_HOUR;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

export function pixReminderText(customerName: string | null, amount: number, offerName: string | null): string {
  const first = String(customerName || '').trim().split(/\s+/)[0] || '';
  const name = first ? `, ${first.charAt(0).toUpperCase()}${first.slice(1).toLowerCase()}` : '';
  const what = offerName ? ` (${offerName})` : '';
  return `Oi${name}! O seu Pix de ${brl(amount)}${what} ainda está disponível. Se quiser, é só usar o código que mandei acima. Qualquer dúvida, me chame aqui. 😊`;
}

export interface PixReminderDeps {
  now?: Date;
  /** Confere o pagamento no Asaas (a varredura passa reconcileAndFinalizePayment). */
  reconcile?: (paymentId: string, pool: Pool) => Promise<any>;
  /** Só para testes: motor do WhatsApp simulado. */
  provider?: WhatsAppProvider | null;
}

export interface PixReminderResult {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

async function finish(pool: Pool, paymentId: string, order: any, status: 'SKIPPED' | 'SENT' | 'FAILED', reason: string | null) {
  await pool.query(
    `INSERT INTO whatsapp_payment_reminders (payment_id, order_id, conversation_id, status, reason, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
     ON CONFLICT (payment_id) DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason,
       sent_at = EXCLUDED.sent_at, updated_at = NOW()`,
    [paymentId, order.order_id, order.conv_id, status, reason ? reason.slice(0, 120) : null, status === 'SENT' ? new Date().toISOString() : null]
  );
}

export async function runWhatsAppPixReminders(pool: Pool, deps: PixReminderDeps = {}): Promise<PixReminderResult> {
  const result: PixReminderResult = { considered: 0, sent: 0, skipped: 0, failed: 0 };
  if (!pixRemindersEnabled()) return result;
  const now = deps.now || new Date();
  if (!withinReminderHours(now)) return result;

  const r = await pool.query(
    `SELECT p.id AS payment_id, p.amount, o.id AS order_id, o.whatsapp_conversation_id AS conv_id, cu.name AS customer_name,
            (SELECT string_agg(oi.offer_name_snapshot, ' + ') FROM order_items oi WHERE oi.order_id = o.id) AS offer_name,
            wc.mode, wc.contact_jid, n.id AS number_id, n.instance_name, n.status AS number_status, n.bot_enabled,
            n.is_deleted AS number_deleted, n.provider AS number_provider, n.cloud_account_id, n.phone_number_id
     FROM payments p
     JOIN orders o ON o.id = p.order_id
     JOIN whatsapp_conversations wc ON wc.id = o.whatsapp_conversation_id
     JOIN whatsapp_numbers n ON n.id = wc.number_id
     LEFT JOIN customers cu ON cu.id = o.customer_id
     LEFT JOIN whatsapp_payment_reminders wr ON wr.payment_id = p.id
     WHERE p.status = 'PENDING' AND COALESCE(p.payment_method, 'PIX') = 'PIX' AND p.pix_copy_paste IS NOT NULL
       AND o.status = 'PENDING' AND o.is_demo = FALSE
       AND p.created_at <= $1::timestamptz - ($2::int * INTERVAL '1 minute')
       AND p.created_at > $1::timestamptz - ($3::int * INTERVAL '1 minute')
       AND wr.payment_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM orders o2 JOIN payments p2 ON p2.order_id = o2.id
         WHERE o2.whatsapp_conversation_id = o.whatsapp_conversation_id AND p2.created_at > p.created_at
       )
     ORDER BY p.created_at ASC
     LIMIT ${BATCH}`,
    [now.toISOString(), PIX_REMINDER_AFTER_MINUTES, PIX_REMINDER_MAX_AGE_MINUTES]
  );

  for (const o of r.rows) {
    result.considered++;
    try {
      if (o.mode !== 'BOT') { await finish(pool, o.payment_id, o, 'SKIPPED', `MODE_${o.mode}`); result.skipped++; continue; }
      if (o.number_deleted || !o.bot_enabled || o.number_status !== 'CONNECTED') { await finish(pool, o.payment_id, o, 'SKIPPED', 'NUMBER_OFF'); result.skipped++; continue; }

      // alguém conversando agora: não interrompe (tenta de novo na próxima varredura, dentro da janela de 120 min)
      const recent = await pool.query(
        `SELECT 1 FROM whatsapp_messages WHERE conversation_id = $1 AND created_at > $2::timestamptz - ($3::int * INTERVAL '1 minute') LIMIT 1`,
        [o.conv_id, now.toISOString(), PIX_REMINDER_QUIET_MINUTES]
      );
      if (recent.rows.length) continue;

      // limites por hora do atendente (contra banimento)
      const lim = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM whatsapp_messages m WHERE m.conversation_id = $1 AND m.author = 'BOT' AND m.created_at > $3::timestamptz - INTERVAL '1 hour') AS conv_n,
           (SELECT COUNT(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id = m.conversation_id
             WHERE c.number_id = $2 AND m.author = 'BOT' AND m.created_at > $3::timestamptz - INTERVAL '1 hour') AS num_n`,
        [o.conv_id, o.number_id, now.toISOString()]
      );
      if (lim.rows[0].conv_n >= BOT_REPLIES_PER_CONVERSATION_HOUR || lim.rows[0].num_n >= BOT_MESSAGES_PER_NUMBER_HOUR) continue;

      // confere no Asaas antes: pago ou cancelado não recebe lembrete
      if (deps.reconcile) {
        try { await deps.reconcile(o.payment_id, pool); } catch { /* segue com o que está no banco */ }
      }
      const st = await pool.query(
        `SELECT o.status AS order_status, p.status AS payment_status FROM orders o JOIN payments p ON p.order_id = o.id WHERE p.id = $1`,
        [o.payment_id]
      );
      if (st.rows[0]?.order_status !== 'PENDING' || st.rows[0]?.payment_status !== 'PENDING') {
        await finish(pool, o.payment_id, o, 'SKIPPED', 'NOT_PENDING'); result.skipped++; continue;
      }

      const provider = deps.provider !== undefined
        ? deps.provider
        : await providerForNumber(pool, { id: o.number_id, provider: o.number_provider, cloud_account_id: o.cloud_account_id, phone_number_id: o.phone_number_id });
      if (!provider) continue;
      const official = isCloudProvider(provider);
      if (isCloudProvider(provider)) {
        const blocked = provider.blockReason(o.contact_jid);
        if (blocked) { await finish(pool, o.payment_id, o, 'SKIPPED', `SEND_BLOCKED:${blocked}`); result.skipped++; continue; }
        if (!(await isServiceWindowOpen(pool, o.conv_id, now))) { await finish(pool, o.payment_id, o, 'SKIPPED', 'OUTSIDE_WINDOW'); result.skipped++; continue; }
      }

      // reserva no banco: só uma varredura envia
      const claim = await pool.query(
        `INSERT INTO whatsapp_payment_reminders (payment_id, order_id, conversation_id, status)
         VALUES ($1, $2, $3, 'SENDING') ON CONFLICT (payment_id) DO NOTHING RETURNING payment_id`,
        [o.payment_id, o.order_id, o.conv_id]
      );
      if (!claim.rows.length) continue;

      const text = pixReminderText(o.customer_name, Number(o.amount), o.offer_name || null);
      try {
        const sent = await provider.sendText(o.instance_name, o.contact_jid, text);
        await recordOutgoing(pool, o.conv_id, 'BOT', text, sent.id, { deliveryStatus: official ? 'SENT' : null });
        await finish(pool, o.payment_id, o, 'SENT', null);
        await writeAuditLog(pool, null, 'WHATSAPP_PIX_REMINDER_SENT', `Lembrete de Pix (${brl(Number(o.amount))}) enviado na conversa ${o.conv_id}.`, null, o.order_id).catch(() => {});
        result.sent++;
      } catch (err: any) {
        const reason = err instanceof SendBlockedError ? `SEND_BLOCKED:${err.code}` : String(err?.message || 'SEND_FAILED');
        await finish(pool, o.payment_id, o, err instanceof SendBlockedError ? 'SKIPPED' : 'FAILED', reason);
        if (err instanceof SendBlockedError) result.skipped++; else result.failed++;
      }
    } catch (err: any) {
      console.warn('[WhatsApp] lembrete de Pix falhou (não fatal):', err?.message || err);
      result.failed++;
    }
  }
  return result;
}
