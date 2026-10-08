/**
 * NORQVA-0026: tela Vendas — lista de pedidos com pagamento, entrega e e-mail de acesso,
 * e as ações do operador para quem pagou e não recebeu.
 *
 * Regras: nenhum link de acesso para pedido que não está PAID (a confirmação vem só do Asaas);
 * o link fica salvo só como hash; toda ação vai para a auditoria.
 */

import crypto from 'crypto';
import { Pool } from 'pg';
import { emailService } from './emailService';
import { accessUrlBase, issueAccessToken } from './purchaseAccessService';
import { writeAuditLog } from '../db/audit';
import { getCommercialOrderClause } from '../utils/commercialTruthPolicy';

export class SalesError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type SalesFilter = 'ALL' | 'PAID' | 'PENDING' | 'PROBLEM';

export interface ListSalesOptions {
  isDemo: boolean;
  includeTests: boolean;
  filter: SalesFilter;
  startIso: string | null;
  endIso: string | null;
  canSeeFullPII: boolean;
  canSeeName: boolean;
}

// "Com problema": pago há mais de 30 min sem download, entrega vencida ou e-mail de acesso que falhou
const PROBLEM_CONDITION = `(
  o.status = 'PAID' AND (
    (COALESCE(dl.downloads, 0) = 0 AND pay.confirmed_at < NOW() - INTERVAL '30 minutes')
    OR dl.expired > 0
    OR oae.status = 'FAILED'
  )
)`;

export async function listSales(pool: Pool, opts: ListSalesOptions) {
  const where: string[] = [];
  if (opts.includeTests) where.push(`o.is_demo = ${opts.isDemo ? 'TRUE' : 'FALSE'}`);
  else where.push(getCommercialOrderClause('o', opts.isDemo));
  where.push('($1::timestamptz IS NULL OR o.created_at >= $1::timestamptz)');
  where.push('($2::timestamptz IS NULL OR o.created_at <= $2::timestamptz)');
  if (opts.filter === 'PAID') where.push(`o.status = 'PAID'`);
  if (opts.filter === 'PENDING') where.push(`o.status = 'PENDING'`);
  if (opts.filter === 'PROBLEM') where.push(PROBLEM_CONDITION);

  const r = await pool.query(
    `SELECT o.id, o.status, o.total_amount, o.created_at, o.data_provenance, o.is_demo,
            c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
            item.offer_name, item.offer_human_id,
            pay.id AS payment_id, pay.status AS payment_status, pay.human_id AS payment_human_id, pay.confirmed_at,
            COALESCE(dl.downloads, 0) AS download_count, dl.delivery_status, COALESCE(dl.expired, 0) AS expired_deliveries,
            oae.status AS access_email_status, oae.sent_at AS access_email_sent_at
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL (
       SELECT oi.offer_name_snapshot AS offer_name, of.human_id AS offer_human_id
       FROM order_items oi LEFT JOIN offers of ON of.id = oi.offer_id
       WHERE oi.order_id = o.id ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1
     ) item ON TRUE
     LEFT JOIN LATERAL (
       SELECT p.id, p.status, p.human_id, p.confirmed_at FROM payments p
       WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1
     ) pay ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(d.download_count)::int AS downloads,
              COUNT(*) FILTER (WHERE d.status = 'EXPIRED')::int AS expired,
              CASE
                WHEN BOOL_OR(d.status = 'ACTIVE' AND d.download_count < d.max_downloads) THEN 'ACTIVE'
                WHEN BOOL_OR(d.status = 'ACTIVE') THEN 'EXHAUSTED'
                WHEN BOOL_OR(d.status = 'EXPIRED') THEN 'EXPIRED'
                WHEN BOOL_OR(d.status = 'REVOKED') THEN 'REVOKED'
                ELSE NULL
              END AS delivery_status
       FROM order_deliveries d WHERE d.order_id = o.id
     ) dl ON TRUE
     LEFT JOIN order_access_emails oae ON oae.order_id = o.id
     WHERE ${where.join(' AND ')}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    [opts.startIso, opts.endIso]
  );

  const orders = r.rows.map(row => ({
    id: row.id,
    status: row.status,
    total_amount: row.total_amount !== null ? Number(row.total_amount) : null,
    created_at: row.created_at,
    is_test: row.data_provenance !== 'COMMERCIAL_PRODUCTION' || row.is_demo,
    customer: {
      name: opts.canSeeFullPII || opts.canSeeName ? row.customer_name : '[REDACTED]',
      email: opts.canSeeFullPII ? row.customer_email : '[REDACTED]',
      phone: opts.canSeeFullPII ? row.customer_phone : '[REDACTED]'
    },
    offer_name: row.offer_name,
    offer_human_id: row.offer_human_id,
    payment_id: row.payment_id,
    payment_status: row.payment_status,
    payment_human_id: row.payment_human_id,
    paid_at: row.confirmed_at,
    download_count: Number(row.download_count) || 0,
    delivery_status: row.delivery_status,
    access_email_status: row.access_email_status,
    access_email_sent_at: row.access_email_sent_at,
    problem:
      row.status === 'PAID' &&
      (((Number(row.download_count) || 0) === 0 && !!row.confirmed_at && new Date(row.confirmed_at).getTime() < Date.now() - 30 * 60 * 1000) ||
        Number(row.expired_deliveries) > 0 ||
        row.access_email_status === 'FAILED')
  }));

  const summary = {
    total: orders.length,
    paid: orders.filter(o => o.status === 'PAID').length,
    pending: orders.filter(o => o.status === 'PENDING').length,
    problem: orders.filter(o => o.problem).length,
    revenue: Math.round(orders.filter(o => o.status === 'PAID').reduce((s, o) => s + (o.total_amount || 0), 0) * 100) / 100
  };
  return { orders, summary };
}

async function loadOrder(pool: Pool, orderId: string, isDemo: boolean) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new SalesError(400, 'Pedido inválido.');
  }
  const r = await pool.query(
    `SELECT o.id, o.status, o.is_demo, c.email AS customer_email,
            (SELECT oi.offer_name_snapshot FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at ASC, oi.id ASC LIMIT 1) AS offer_name
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.is_demo = $2`,
    [orderId, isDemo]
  );
  if (r.rows.length === 0) throw new SalesError(404, 'Pedido não encontrado.');
  return r.rows[0];
}

/**
 * Deixa a entrega do pedido pago pronta para um link novo: cria a partir dos ativos da oferta se não
 * existir; reativa entrega vencida ou esgotada (zera a contagem). Entrega revogada não é reativada.
 */
async function prepareDelivery(pool: Pool, orderId: string): Promise<void> {
  const existing = await pool.query('SELECT id, status FROM order_deliveries WHERE order_id = $1', [orderId]);
  if (existing.rows.length === 0) {
    const created = await pool.query(
      `INSERT INTO order_deliveries (order_id, order_item_id, asset_id, status)
       SELECT oi.order_id, oi.id, oda.asset_id, 'ACTIVE'
       FROM order_items oi JOIN offer_digital_assets oda ON oda.offer_id = oi.offer_id
       WHERE oi.order_id = $1
       ON CONFLICT (order_id, asset_id) DO NOTHING
       RETURNING id`,
      [orderId]
    );
    if (created.rows.length === 0) throw new SalesError(409, 'A oferta deste pedido não tem arquivo cadastrado para entregar.');
    return;
  }
  if (existing.rows.some(d => d.status === 'REVOKED')) throw new SalesError(409, 'A entrega deste pedido foi revogada.');
  await pool.query(
    `UPDATE order_deliveries
     SET status = 'ACTIVE',
         download_count = CASE WHEN status = 'EXPIRED' OR download_count >= max_downloads THEN 0 ELSE download_count END,
         delivery_token_hash = NULL, delivery_token_expires_at = NULL, updated_at = NOW()
     WHERE order_id = $1 AND status <> 'REVOKED'
       AND (status = 'EXPIRED' OR download_count >= max_downloads)`,
    [orderId]
  );
}

/** Um link ativo por finalidade: o novo substitui o anterior. */
async function revokePrevious(pool: Pool, orderId: string, purpose: 'MANUAL' | 'RESEND') {
  await pool.query(
    `UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW()
     WHERE order_id = $1 AND purpose = $2 AND status = 'ACTIVE'`,
    [orderId, purpose]
  );
}

async function requirePaid(pool: Pool, orderId: string, isDemo: boolean) {
  const order = await loadOrder(pool, orderId, isDemo);
  if (order.status !== 'PAID') throw new SalesError(409, 'O pedido não está pago: nenhum link de acesso é gerado.');
  return order;
}

/** Copia um link de acesso para o operador mandar pelo WhatsApp. */
export async function createManualAccessLink(pool: Pool, orderId: string, isDemo: boolean, userId: string | null) {
  await requirePaid(pool, orderId, isDemo);
  await prepareDelivery(pool, orderId);
  const base = accessUrlBase();
  if (!base) throw new SalesError(503, 'FRONTEND_URL não configurado: não é possível montar o link.');
  await revokePrevious(pool, orderId, 'MANUAL');
  const t = await issueAccessToken(pool, orderId, 'MANUAL');
  await writeAuditLog(pool, userId, 'SALES_ACCESS_LINK_CREATED', `Link de acesso gerado para o pedido ${orderId} (token ${t.tokenId})`, null, null, isDemo);
  return { url: `${base}/acesso/${t.rawToken}`, expires_at: t.expiresAt.toISOString() };
}

/** Reenvia o acesso por e-mail (link novo), mesmo que o e-mail automático já tenha saído. */
export async function resendAccessEmail(pool: Pool, orderId: string, isDemo: boolean, userId: string | null) {
  const order = await requirePaid(pool, orderId, isDemo);
  if (!order.customer_email) throw new SalesError(409, 'O pedido não tem e-mail do comprador.');
  await prepareDelivery(pool, orderId);
  const base = accessUrlBase();
  if (!base) throw new SalesError(503, 'FRONTEND_URL não configurado: não é possível montar o link.');
  await revokePrevious(pool, orderId, 'RESEND');
  const t = await issueAccessToken(pool, orderId, 'RESEND');
  const result = await emailService.sendPurchaseAccessEmail({
    email: order.customer_email,
    offerName: order.offer_name || 'sua compra',
    recoveryUrl: `${base}/acesso/${t.rawToken}`,
    orderId,
    correlationId: crypto.randomUUID(),
    isDemo: order.is_demo,
    kind: 'PURCHASE',
    validityHours: t.ttlHours
  });
  if (!result.success) {
    await pool.query(`UPDATE order_recovery_tokens SET status = 'REVOKED', revoked_at = NOW() WHERE id = $1`, [t.tokenId]);
    // Falha do reenvio manual fica só na auditoria: não mexe no e-mail automático (nem na varredura).
    await writeAuditLog(pool, userId, 'SALES_ACCESS_EMAIL_FAILED', `Reenvio de acesso falhou para o pedido ${orderId}`, null, result.error || null, isDemo);
    throw new SalesError(502, 'O e-mail não pôde ser enviado. Use "Copiar link" e mande pelo WhatsApp.');
  }
  const status = result.simulated ? 'SIMULATED' : 'SENT';
  await pool.query(
    `INSERT INTO order_access_emails (order_id, status, attempts, provider_message_id, sent_at)
     VALUES ($1, $2, 1, $3, NOW())
     ON CONFLICT (order_id) DO UPDATE SET status = $2,
       provider_message_id = $3, error_code = NULL, sent_at = NOW(), updated_at = NOW()`,
    [orderId, status, result.messageId || null]
  );
  await writeAuditLog(pool, userId, 'SALES_ACCESS_EMAIL_RESENT', `Acesso reenviado por e-mail para o pedido ${orderId}`, null, status, isDemo);
  return { status };
}

/** Confere o pagamento no Asaas (mesma reconciliação do webhook). */
export async function checkPayment(
  pool: Pool,
  orderId: string,
  isDemo: boolean,
  userId: string | null,
  reconcile: (paymentId: string, pool: Pool) => Promise<any>
) {
  const order = await loadOrder(pool, orderId, isDemo);
  if (order.status === 'PAID') return { status: 'PAID', changed: false };
  const pay = await pool.query(
    `SELECT id FROM payments WHERE order_id = $1 AND provider_payment_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [orderId]
  );
  if (pay.rows.length === 0) throw new SalesError(409, 'Este pedido ainda não tem cobrança Pix criada no Asaas.');
  try {
    await reconcile(pay.rows[0].id, pool);
  } catch (err: any) {
    await writeAuditLog(pool, userId, 'SALES_PAYMENT_CHECK_FAILED', `Conferência no Asaas falhou para o pedido ${orderId}`, null, String(err?.message || '').slice(0, 200), isDemo);
    throw new SalesError(502, 'Não foi possível conferir no Asaas agora. Tente de novo em instantes.');
  }
  const after = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
  const status = after.rows[0]?.status || order.status;
  await writeAuditLog(pool, userId, 'SALES_PAYMENT_CHECKED', `Pagamento conferido no Asaas para o pedido ${orderId}`, order.status, status, isDemo);
  return { status, changed: status !== order.status };
}
