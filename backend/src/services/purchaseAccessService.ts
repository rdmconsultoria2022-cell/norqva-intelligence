/**
 * NORQVA-0023: e-mail de acesso enviado quando o pedido vira PAID.
 *
 * Antes, o PDF só chegava ao comprador pela aba do checkout. Agora, ao confirmar o pagamento,
 * o comprador recebe por e-mail um link /acesso/<token> (o mesmo fluxo da recuperação de acesso),
 * que pode ser aberto mais de uma vez dentro da validade.
 *
 * Regras:
 * - só envia para pedido PAID com entrega ACTIVE (a confirmação continua vindo do Asaas);
 * - um e-mail por pedido: a linha em order_access_emails é o "claim" atômico; uma falha pode ser
 *   tentada de novo até PURCHASE_ACCESS_MAX_ATTEMPTS vezes (pela varredura de pagamentos);
 * - nunca lança exceção para quem chama: falha de e-mail não pode afetar o pagamento.
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import { emailService, validateFrontendUrl } from './emailService';

export const PURCHASE_ACCESS_MAX_ATTEMPTS = 3;
const DEFAULT_FRONTEND_URL = 'https://norqva-intelligence-frontend.vercel.app';

export type PurchaseAccessEmailOutcome =
  | { status: 'SENT' | 'SIMULATED' }
  | { status: 'FAILED'; error: string }
  | { status: 'SKIPPED'; reason: string };

function purchaseTokenTtlHours(): number {
  const n = parseInt(process.env.PURCHASE_ACCESS_TOKEN_TTL_HOURS || '168', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 90) : 168;
}

function purchaseTokenMaxUses(): number {
  const n = parseInt(process.env.PURCHASE_ACCESS_MAX_USES || '10', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }));
}

export async function sendPaidOrderAccessEmail(pool: Pool, orderId: string): Promise<PurchaseAccessEmailOutcome> {
  try {
    const orderRes = await pool.query(
      `SELECT o.id, o.status, o.is_demo, c.email AS customer_email,
              (SELECT oi.offer_name_snapshot FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1) AS offer_name,
              EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = o.id AND d.status = 'ACTIVE') AS has_active_delivery,
              EXISTS (
                SELECT 1 FROM payments p
                WHERE p.order_id = o.id AND p.status = 'CONFIRMED'
                  AND p.confirmed_at >= (SELECT executed_at FROM schema_migrations WHERE name = '043_purchase_access_email.sql')
              ) AS paid_after_launch
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) return { status: 'SKIPPED', reason: 'ORDER_NOT_FOUND' };
    const order = orderRes.rows[0];
    if (order.status !== 'PAID') return { status: 'SKIPPED', reason: 'NOT_PAID' };
    if (!order.has_active_delivery) return { status: 'SKIPPED', reason: 'NO_ACTIVE_DELIVERY' };
    if (!order.customer_email) return { status: 'SKIPPED', reason: 'NO_EMAIL' };
    // Pedidos pagos antes desta entrega já foram atendidos (alguns à mão): não reenviar.
    if (!order.paid_after_launch) return { status: 'SKIPPED', reason: 'PAID_BEFORE_LAUNCH' };

    // Claim atômico: só uma execução envia; falha anterior pode ser retomada até o limite;
    // "SENDING" preso há mais de 15 min (queda no meio do envio) pode ser retomado.
    const claim = await pool.query(
      `INSERT INTO order_access_emails (order_id, status, attempts)
       VALUES ($1, 'SENDING', 1)
       ON CONFLICT (order_id) DO UPDATE
         SET status = 'SENDING', attempts = order_access_emails.attempts + 1, error_code = NULL, updated_at = NOW()
         WHERE order_access_emails.attempts < $2
           AND (order_access_emails.status = 'FAILED'
                OR (order_access_emails.status = 'SENDING' AND order_access_emails.updated_at < NOW() - INTERVAL '15 minutes'))
       RETURNING attempts`,
      [orderId, PURCHASE_ACCESS_MAX_ATTEMPTS]
    );
    if (claim.rows.length === 0) return { status: 'SKIPPED', reason: 'ALREADY_HANDLED' };
    const attempt = Number(claim.rows[0].attempts);

    const markFailed = async (error: string) => {
      await pool.query(
        `UPDATE order_access_emails SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE order_id = $1`,
        [orderId, error.slice(0, 120)]
      );
      log('PURCHASE_ACCESS_EMAIL_FAILED', { order_id: orderId, attempt, error_code: error });
      return { status: 'FAILED' as const, error };
    };

    const isProd = process.env.NODE_ENV === 'production';
    const frontend = validateFrontendUrl(process.env.FRONTEND_URL, isProd);
    if (!frontend.valid && isProd) {
      return await markFailed('FRONTEND_URL_INVALID');
    }
    const frontendUrl = frontend.url || DEFAULT_FRONTEND_URL;

    // Nova tentativa: links de compra de tentativas anteriores deixam de valer.
    await pool.query(
      `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW()
       WHERE order_id = $1 AND purpose = 'PURCHASE' AND status = 'ACTIVE'`,
      [orderId]
    );

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const ttlHours = purchaseTokenTtlHours();
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const tokenRes = await pool.query(
      `INSERT INTO order_recovery_tokens (order_id, token_hash, status, expires_at, max_uses, purpose)
       VALUES ($1, $2, 'ACTIVE', $3, $4, 'PURCHASE')
       RETURNING id`,
      [orderId, tokenHash, expiresAt, purchaseTokenMaxUses()]
    );
    const tokenId = tokenRes.rows[0].id;

    const correlationId = crypto.randomUUID();
    const result = await emailService.sendPurchaseAccessEmail({
      email: order.customer_email,
      offerName: order.offer_name || 'sua compra',
      recoveryUrl: `${frontendUrl}/acesso/${rawToken}`,
      orderId,
      correlationId,
      isDemo: order.is_demo,
      kind: 'PURCHASE',
      validityHours: ttlHours
    });

    if (!result.success) {
      // O link não chegou a ninguém: revoga para não deixar credencial órfã.
      await pool.query(
        `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 AND status = 'ACTIVE'`,
        [tokenId]
      );
      return await markFailed(result.error || 'EMAIL_SEND_FAILED');
    }

    const finalStatus = result.simulated ? 'SIMULATED' : 'SENT';
    await pool.query(
      `UPDATE order_access_emails
       SET status = $2, provider_message_id = $3, error_code = NULL, sent_at = NOW(), updated_at = NOW()
       WHERE order_id = $1`,
      [orderId, finalStatus, result.messageId || null]
    );
    log('PURCHASE_ACCESS_EMAIL_SENT', { order_id: orderId, attempt, simulated: Boolean(result.simulated), correlation_id: correlationId });
    return { status: finalStatus };
  } catch (err: any) {
    console.warn('[PurchaseAccessEmail] non-fatal error:', err?.message);
    try {
      await pool.query(
        `UPDATE order_access_emails SET status = 'FAILED', error_code = 'INTERNAL_ERROR', updated_at = NOW()
         WHERE order_id = $1 AND status = 'SENDING'`,
        [orderId]
      );
    } catch (_) {
      // ignora: a varredura tenta de novo depois
    }
    return { status: 'FAILED', error: 'INTERNAL_ERROR' };
  }
}

/** Situação do e-mail de acesso para a tela de entrega e o painel. */
export async function getAccessEmailStatus(pool: Pool, orderId: string): Promise<string | null> {
  try {
    const r = await pool.query('SELECT status FROM order_access_emails WHERE order_id = $1', [orderId]);
    return r.rows[0]?.status || null;
  } catch (_) {
    return null;
  }
}
