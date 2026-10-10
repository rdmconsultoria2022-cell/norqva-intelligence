// NORQVA-0046 etapa 2: entrega pelo WhatsApp quando o Asaas confirma o pagamento.
// Regras: só pedido PAID com entrega ACTIVE (a confirmação vem do Asaas); só pedido feito pela conversa;
// respeita o "parar" do cliente (o e-mail de acesso continua indo); um envio por pedido, até 3 tentativas;
// nunca lança exceção para quem chama (falha no WhatsApp não afeta o pagamento).
import { Pool } from 'pg';
import { WhatsAppProvider, getWhatsAppProvider } from './provider';
import { accessUrlBase, issueAccessToken } from '../purchaseAccessService';
import { recordOutgoing } from './whatsappService';

export const WHATSAPP_DELIVERY_MAX_ATTEMPTS = 3;

export type WhatsAppDeliveryOutcome = { status: 'SENT' } | { status: 'FAILED'; error: string } | { status: 'SKIPPED'; reason: string };

export function deliveryMessage(firstName: string | null, offerName: string, url: string, validityDays: number) {
  const hi = firstName ? `${firstName}, pagamento` : 'Pagamento';
  return [
    `${hi} confirmado! ✅`,
    '',
    `Aqui está o acesso a *${offerName}*:`,
    url,
    '',
    `É só abrir o link e tocar em baixar. Ele vale por ${validityDays} dias, e o mesmo acesso também foi para o seu e-mail.`,
    'Bom proveito! Qualquer dúvida, é só responder aqui.'
  ].join('\n');
}

export async function sendPaidOrderWhatsApp(pool: Pool, orderId: string, providerArg?: WhatsAppProvider | null): Promise<WhatsAppDeliveryOutcome> {
  const provider = providerArg === undefined ? getWhatsAppProvider() : providerArg;
  try {
    const r = await pool.query(
      `SELECT o.id, o.status, o.whatsapp_conversation_id AS conv_id, c.name AS customer_name,
              (SELECT string_agg(oi.offer_name_snapshot, ' + ' ORDER BY oi.is_bump ASC, oi.created_at ASC, oi.id ASC)
                 FROM order_items oi WHERE oi.order_id = o.id) AS offer_name,
              EXISTS (SELECT 1 FROM order_deliveries d WHERE d.order_id = o.id AND d.status = 'ACTIVE') AS has_active_delivery,
              EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED') AS confirmed,
              wc.mode AS conv_mode, wc.contact_jid, n.instance_name, n.status AS number_status, n.is_deleted AS number_deleted
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN whatsapp_conversations wc ON wc.id = o.whatsapp_conversation_id
       LEFT JOIN whatsapp_numbers n ON n.id = wc.number_id
       WHERE o.id = $1`,
      [orderId]
    );
    const o = r.rows[0];
    if (!o) return { status: 'SKIPPED', reason: 'ORDER_NOT_FOUND' };
    if (!o.conv_id || !o.contact_jid) return { status: 'SKIPPED', reason: 'NOT_WHATSAPP_ORDER' };
    if (o.status !== 'PAID' || !o.confirmed) return { status: 'SKIPPED', reason: 'NOT_PAID' };
    // motivos permanentes ficam registrados para a varredura não insistir
    const skipForGood = async (reason: string) => {
      await pool.query(
        `INSERT INTO whatsapp_order_deliveries (order_id, conversation_id, status, error_code) VALUES ($1, $2, 'SKIPPED', $3)
         ON CONFLICT (order_id) DO NOTHING`,
        [orderId, o.conv_id, reason]
      );
      return { status: 'SKIPPED' as const, reason };
    };
    if (!o.has_active_delivery) return await skipForGood('NO_ACTIVE_DELIVERY');
    if (o.conv_mode === 'OPTED_OUT') return await skipForGood('OPTED_OUT');
    if (!provider) return { status: 'SKIPPED', reason: 'SERVER_NOT_CONFIGURED' };
    if (o.number_deleted || o.number_status !== 'CONNECTED') return { status: 'SKIPPED', reason: 'NUMBER_NOT_CONNECTED' };

    const claim = await pool.query(
      `INSERT INTO whatsapp_order_deliveries (order_id, conversation_id, status, attempts)
       VALUES ($1, $2, 'SENDING', 1)
       ON CONFLICT (order_id) DO UPDATE
         SET status = 'SENDING', attempts = whatsapp_order_deliveries.attempts + 1, error_code = NULL, updated_at = NOW()
         WHERE whatsapp_order_deliveries.attempts < $3
           AND (whatsapp_order_deliveries.status = 'FAILED'
                OR (whatsapp_order_deliveries.status = 'SENDING' AND whatsapp_order_deliveries.updated_at < NOW() - INTERVAL '15 minutes'))
       RETURNING attempts`,
      [orderId, o.conv_id, WHATSAPP_DELIVERY_MAX_ATTEMPTS]
    );
    if (!claim.rows.length) return { status: 'SKIPPED', reason: 'ALREADY_HANDLED' };

    const fail = async (error: string) => {
      await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'FAILED', error_code = $2, updated_at = NOW() WHERE order_id = $1`, [orderId, error.slice(0, 120)]);
      return { status: 'FAILED' as const, error };
    };

    const base = accessUrlBase();
    if (!base) return await fail('FRONTEND_URL_INVALID');
    // links de tentativas anteriores pelo WhatsApp deixam de valer
    await pool.query(
      `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE order_id = $1 AND purpose = 'WHATSAPP' AND status = 'ACTIVE'`,
      [orderId]
    );
    const token = await issueAccessToken(pool, orderId, 'WHATSAPP');
    const url = `${base.replace(/\/+$/, '')}/acesso/${token.rawToken}`;
    const firstName = o.customer_name ? String(o.customer_name).trim().split(/\s+/)[0] : null;
    const text = deliveryMessage(firstName, o.offer_name || 'sua compra', url, Math.max(1, Math.round(token.ttlHours / 24)));

    let sentId: string | null = null;
    try {
      sentId = (await provider.sendText(o.instance_name, o.contact_jid, text)).id;
    } catch (err: any) {
      await pool.query(`UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1 AND status = 'ACTIVE'`, [token.tokenId]);
      return await fail(String(err?.message || 'SEND_FAILED'));
    }
    // o link fica no histórico da conversa só como texto sem o código (o código do link é uma credencial)
    await recordOutgoing(pool, o.conv_id, 'SYSTEM', text.replace(token.rawToken, '••••••'), sentId);
    await pool.query(`UPDATE whatsapp_order_deliveries SET status = 'SENT', sent_at = NOW(), error_code = NULL, updated_at = NOW() WHERE order_id = $1`, [orderId]);
    console.log(JSON.stringify({ event: 'WHATSAPP_DELIVERY_SENT', order_id: orderId, timestamp: new Date().toISOString() }));
    return { status: 'SENT' };
  } catch (err: any) {
    console.warn('[WhatsAppDelivery] non-fatal error:', err?.message);
    await pool.query(
      `UPDATE whatsapp_order_deliveries SET status = 'FAILED', error_code = 'INTERNAL_ERROR', updated_at = NOW() WHERE order_id = $1 AND status = 'SENDING'`,
      [orderId]
    ).catch(() => {});
    return { status: 'FAILED', error: 'INTERNAL_ERROR' };
  }
}

/** Varredura: pedidos pagos pela conversa nos últimos 7 dias que ainda não receberam o acesso no WhatsApp. */
export async function sweepWhatsAppDeliveries(pool: Pool): Promise<number> {
  if (!getWhatsAppProvider()) return 0;
  const r = await pool.query(
    `SELECT o.id FROM orders o
     JOIN payments p ON p.order_id = o.id AND p.status = 'CONFIRMED'
     LEFT JOIN whatsapp_order_deliveries w ON w.order_id = o.id
     WHERE o.status = 'PAID' AND o.is_demo = FALSE AND o.whatsapp_conversation_id IS NOT NULL
       AND p.confirmed_at > NOW() - INTERVAL '7 days'
       AND (w.order_id IS NULL
            OR (w.status = 'FAILED' AND w.attempts < $1)
            OR (w.status = 'SENDING' AND w.updated_at < NOW() - INTERVAL '15 minutes' AND w.attempts < $1))
     GROUP BY o.id
     ORDER BY MAX(p.confirmed_at) DESC
     LIMIT 25`,
    [WHATSAPP_DELIVERY_MAX_ATTEMPTS]
  );
  let n = 0;
  for (const row of r.rows) {
    await sendPaidOrderWhatsApp(pool, row.id);
    n++;
  }
  return n;
}
