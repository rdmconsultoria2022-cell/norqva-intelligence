/**
 * NORQVA-0023: varredura de pagamentos e entregas (a cada PAYMENT_SWEEP_INTERVAL_MIN, padrão 5 min).
 *
 * 1. Webhooks confirmados que falharam: processa de novo (até 5 vezes).
 * 2. Pagamentos reais ainda pendentes nas últimas 48 h: consulta o Asaas (a confirmação vem dele).
 * 3. Pedidos pagos sem e-mail de acesso (ou com falha, até 3 tentativas): envia.
 *
 * Só pedidos reais (is_demo = false). Nada aqui marca pagamento sem a resposta do Asaas.
 * PAYMENT_SWEEP_ENABLED=false desliga.
 */

import { Pool } from 'pg';
import { sendPaidOrderAccessEmail, PURCHASE_ACCESS_MAX_ATTEMPTS } from './purchaseAccessService';
import { shouldCheckProvider, withTimeout } from './paymentCheckThrottle';
import { sweepWhatsAppDeliveries } from './whatsapp/whatsappDelivery';

export interface PaymentSweepDeps {
  reconcile: (paymentId: string, pool: Pool) => Promise<any>;
  retryWebhookEvent: (pool: Pool, externalEventId: string, eventType: string, paymentId: string) => Promise<boolean | null>;
  sendAccessEmail?: (pool: Pool, orderId: string) => Promise<any>;
}

export interface PaymentSweepResult {
  webhooksRetried: number;
  paymentsChecked: number;
  emailsAttempted: number;
}

const BATCH = 25;

export async function runPaymentSweep(pool: Pool, deps: PaymentSweepDeps): Promise<PaymentSweepResult> {
  const result: PaymentSweepResult = { webhooksRetried: 0, paymentsChecked: 0, emailsAttempted: 0 };
  const sendAccessEmail = deps.sendAccessEmail || sendPaidOrderAccessEmail;

  // 1. Webhooks que falharam
  const failed = await pool.query(
    `SELECT external_event_id, event_type, payment_id
     FROM payment_webhook_events
     WHERE provider = 'ASAAS' AND processing_status = 'FAILED' AND is_demo = FALSE
       AND retry_count < 5 AND created_at > NOW() - INTERVAL '7 days'
     ORDER BY created_at ASC
     LIMIT ${BATCH}`
  );
  for (const ev of failed.rows) {
    try {
      const r = await deps.retryWebhookEvent(pool, ev.external_event_id, ev.event_type, ev.payment_id);
      if (r !== null) result.webhooksRetried++;
    } catch (err: any) {
      console.warn('[PAYMENT SWEEP] webhook retry error', err?.message);
    }
  }

  // 2. Pagamentos pendentes recentes (cobrança já criada no Asaas)
  const pending = await pool.query(
    `SELECT id FROM payments
     WHERE status IN ('PENDING', 'REQUIRES_RECONCILIATION') AND provider_payment_id IS NOT NULL
       AND is_demo = FALSE AND created_at > NOW() - INTERVAL '48 hours'
     ORDER BY updated_at ASC
     LIMIT ${BATCH}`
  );
  for (const p of pending.rows) {
    if (!shouldCheckProvider(p.id, 4 * 60 * 1000)) continue;
    try {
      await withTimeout(deps.reconcile(p.id, pool), 30000);
      result.paymentsChecked++;
    } catch (err: any) {
      console.warn('[PAYMENT SWEEP] reconcile error', err?.message);
    }
  }

  // 3. E-mail de acesso pendente — só pedidos pagos depois que esta funcionalidade entrou no ar,
  //    para não reenviar a quem já foi atendido manualmente antes.
  const needEmail = await pool.query(
    `SELECT DISTINCT o.id
     FROM orders o
     JOIN payments p ON p.order_id = o.id AND p.status = 'CONFIRMED'
     JOIN order_deliveries d ON d.order_id = o.id AND d.status = 'ACTIVE'
     LEFT JOIN order_access_emails e ON e.order_id = o.id
     WHERE o.status = 'PAID' AND o.is_demo = FALSE
       AND p.confirmed_at >= (SELECT executed_at FROM schema_migrations WHERE name = '043_purchase_access_email.sql')
       AND p.confirmed_at > NOW() - INTERVAL '7 days'
       AND (e.id IS NULL
            OR (e.status = 'FAILED' AND e.attempts < $1)
            OR (e.status = 'SENDING' AND e.updated_at < NOW() - INTERVAL '15 minutes' AND e.attempts < $1))
     LIMIT ${BATCH}`,
    [PURCHASE_ACCESS_MAX_ATTEMPTS]
  );
  for (const o of needEmail.rows) {
    try {
      await sendAccessEmail(pool, o.id);
      result.emailsAttempted++;
    } catch (err: any) {
      console.warn('[PAYMENT SWEEP] access email error', err?.message);
    }
  }

  // 4. NORQVA-0046: acesso pelo WhatsApp para pedidos feitos na conversa (só com o servidor do WhatsApp ligado)
  try {
    await sweepWhatsAppDeliveries(pool);
  } catch (err: any) {
    console.warn('[PAYMENT SWEEP] whatsapp delivery error', err?.message);
  }

  return result;
}

export function startPaymentSweepScheduler(pool: Pool, deps: PaymentSweepDeps): () => void {
  if (process.env.PAYMENT_SWEEP_ENABLED === 'false' || process.env.NODE_ENV === 'test') return () => {};
  const minutes = Math.min(Math.max(Number(process.env.PAYMENT_SWEEP_INTERVAL_MIN) || 5, 1), 60);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runPaymentSweep(pool, deps);
      if (r.webhooksRetried || r.paymentsChecked || r.emailsAttempted) {
        console.log('[PAYMENT SWEEP]', JSON.stringify(r));
      }
    } catch (err: any) {
      console.error('[PAYMENT SWEEP] cycle failed', err?.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 90 * 1000);
  const every = setInterval(tick, minutes * 60 * 1000);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
