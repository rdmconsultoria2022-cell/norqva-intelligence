// NORQVA-0110 (D-0110): vendas da Kiwify no NORQVA (contrato aprovado pelo Ricardo em 21/10/2026 20h52).
// A Kiwify chama POST /api/webhooks/kiwify?signature=<hex>, com assinatura = HMAC-SHA1 do corpo BRUTO
// usando o token do webhook (KIWIFY_WEBHOOK_TOKEN). A venda vira uma linha em external_sales:
// PAID, REFUNDED ou CHARGEBACK. A entrega é da Kiwify: aqui nada libera arquivo nem manda e-mail.
// Sem CPF, telefone, endereço ou dados de cartão em lugar nenhum.
import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';

export type ExternalSaleStatus = 'PAID' | 'REFUNDED' | 'CHARGEBACK';

/** Confere a assinatura (hex, maiúscula ou minúscula) em tempo constante. */
export function kiwifySignatureValid(rawBody: Buffer | undefined, signature: unknown, token: string): boolean {
  if (!rawBody || !token) return false;
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (typeof sig !== 'string') return false;
  const given = sig.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(given)) return false;
  const expected = crypto.createHmac('sha1', token).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Chaves retiradas do evento guardado (documento, telefone, endereço, IP, cartão)
const PII_KEY = /^(cpf|cnpj|document|document_number|doc|rg|mobile|phone|phone_number|telephone|cellphone|whatsapp|ip|street|number|complement|neighborhood|city|state|zipcode|zip_code|zip|cep|postal_code|address|instagram|boleto_barcode|boleto_url|pix_code)$/i;
const CARD_KEY = /card/i;

export function stripKiwifyPii(value: any, depth = 0): any {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map(v => stripKiwifyPii(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (PII_KEY.test(k) || CARD_KEY.test(k)) continue;
    out[k] = stripKiwifyPii(v, depth + 1);
  }
  return out;
}

/** Valor em centavos (número ou texto) → reais com 2 casas. Null quando não há valor. */
export function centsToReais(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

/** Data da Kiwify ("2026-10-21 20:52" no horário de Brasília, ou ISO) → Date. */
export function parseKiwifyDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/.exec(s);
  const d = local ? new Date(`${local[1]}T${local[2]}${local[3] || ':00'}-03:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const str = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const PAID_EVENTS = new Set(['order_approved', 'compra_aprovada', 'subscription_renewed']);
const REFUND_EVENTS = new Set(['order_refunded', 'compra_reembolsada', 'refunded']);
const CHARGEBACK_EVENTS = new Set(['chargeback', 'order_chargeback', 'chargedback']);
const IGNORED_EVENTS = new Set([
  'billet_created', 'pix_created', 'boleto_gerado', 'pix_gerado', 'order_rejected', 'compra_recusada',
  'subscription_canceled', 'subscription_late', 'carrinho_abandonado', 'abandoned_cart', 'waiting_payment'
]);

/** Situação que o evento pede, ou null para ignorar. */
export function kiwifyTargetStatus(order: any): ExternalSaleStatus | null {
  const type = String(order?.webhook_event_type ?? '').trim().toLowerCase();
  const status = String(order?.order_status ?? '').trim().toLowerCase();
  if (CHARGEBACK_EVENTS.has(type)) return 'CHARGEBACK';
  if (REFUND_EVENTS.has(type)) return 'REFUNDED';
  if (PAID_EVENTS.has(type)) return 'PAID';
  if (IGNORED_EVENTS.has(type)) return null;
  if (status === 'chargedback' || status === 'chargeback') return 'CHARGEBACK';
  if (status === 'refunded') return 'REFUNDED';
  if (status === 'paid' || status === 'approved') return 'PAID';
  return null;
}

/** Alguns envios vêm dentro de "order"; usa o objeto que tem o código do pedido. */
export function kiwifyOrderOf(body: any): any {
  if (body && typeof body === 'object' && !body.order_id && !body.order_ref && body.order && typeof body.order === 'object') return body.order;
  return body;
}

export interface KiwifySaleFields {
  externalOrderId: string;
  productId: string | null;
  productName: string | null;
  gross: number | null;
  net: number | null;
  fee: number | null;
  currency: string | null;
  paymentMethod: string | null;
  customerName: string | null;
  customerEmail: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; content: string | null; term: string | null };
  approvedAt: Date | null;
  refundedAt: Date | null;
}

export function kiwifySaleFields(order: any): KiwifySaleFields | null {
  const externalOrderId = str(order?.order_id, 120) || str(order?.order_ref, 120);
  if (!externalOrderId) return null;
  const product = order?.Product || order?.product || {};
  const customer = order?.Customer || order?.customer || {};
  const c = order?.Commissions || order?.commissions || {};
  const t = order?.TrackingParameters || order?.tracking_parameters || order?.tracking || {};
  const gross = centsToReais(c.charge_amount) ?? centsToReais(c.product_base_price);
  const net = centsToReais(c.my_commission);
  const kFee = centsToReais(c.kiwify_fee);
  const fee = kFee !== null ? kFee : gross !== null && net !== null ? Math.round((gross - net) * 100) / 100 : null;
  return {
    externalOrderId,
    productId: str(product.product_id, 120),
    productName: str(product.product_name, 255),
    gross,
    net,
    fee,
    currency: str(c.currency || c.product_base_price_currency, 10),
    paymentMethod: str(order?.payment_method, 40),
    customerName: str(customer.full_name || [customer.first_name, customer.last_name].filter(Boolean).join(' '), 255),
    customerEmail: str(customer.email, 255),
    utm: {
      source: str(t.utm_source, 255),
      medium: str(t.utm_medium, 255),
      campaign: str(t.utm_campaign, 500),
      content: str(t.utm_content, 500),
      term: str(t.utm_term, 500)
    },
    approvedAt: parseKiwifyDate(order?.approved_date),
    refundedAt: parseKiwifyDate(order?.refunded_at)
  };
}

/** KIWIFY_PRODUCT_IDS (opcional, separados por vírgula): só esses produtos entram. Vazio = todos. */
function productAllowed(productId: string | null): boolean {
  const raw = (process.env.KIWIFY_PRODUCT_IDS || '').trim();
  if (!raw) return true;
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return !!productId && allowed.includes(productId);
}

export type KiwifyResult =
  | { ignored: true; reason: string }
  | { ignored: false; id: string; status: ExternalSaleStatus; created: boolean; changed: boolean };

const brl = (v: number | null) => (v === null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`);

export async function recordKiwifyEvent(pool: Pool, body: any): Promise<KiwifyResult> {
  const order = kiwifyOrderOf(body);
  const target = kiwifyTargetStatus(order);
  if (!target) return { ignored: true, reason: 'evento sem efeito na venda' };
  const f = kiwifySaleFields(order);
  if (!f) return { ignored: true, reason: 'evento sem código do pedido' };
  if (!productAllowed(f.productId)) return { ignored: true, reason: 'produto fora de KIWIFY_PRODUCT_IDS' };

  const raw = JSON.stringify(stripKiwifyPii(body));
  const refundedAt = target === 'PAID' ? null : f.refundedAt || new Date();
  const approvedAt = f.approvedAt || (target === 'PAID' ? new Date() : null);

  const findExisting = () => pool.query(
    `SELECT id, status FROM external_sales WHERE source = 'KIWIFY' AND external_order_id = $1`,
    [f.externalOrderId]
  );
  let existing = await findExisting();
  const inserted = existing.rows.length > 0 ? { rows: [] as any[] } : await pool.query(
    `INSERT INTO external_sales (source, external_order_id, status, product_name, gross_amount, net_amount, fee_amount,
       currency, payment_method, customer_name, customer_email, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       approved_at, refunded_at, raw_event)
     VALUES ('KIWIFY', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
     ON CONFLICT (source, external_order_id) DO NOTHING
     RETURNING id`,
    [f.externalOrderId, target, f.productName, f.gross, f.net, f.fee, f.currency, f.paymentMethod, f.customerName, f.customerEmail,
     f.utm.source, f.utm.medium, f.utm.campaign, f.utm.content, f.utm.term, approvedAt, refundedAt, raw]
  );

  if (inserted.rows.length > 0) {
    const id = String(inserted.rows[0].id);
    await audit(pool, target, f, null);
    return { ignored: false, id, status: target, created: true, changed: true };
  }

  // já existia (ou outro envio igual gravou primeiro)
  if (existing.rows.length === 0) existing = await findExisting();
  const row = existing.rows[0];
  if (!row) return { ignored: true, reason: 'pedido não encontrado depois do conflito' };
  const before = String(row.status) as ExternalSaleStatus;
  // Nunca volta de estorno/contestação para pago; estorno não desfaz contestação.
  let next: ExternalSaleStatus = before;
  if (target === 'CHARGEBACK') next = 'CHARGEBACK';
  else if (target === 'REFUNDED' && before !== 'CHARGEBACK') next = 'REFUNDED';

  await pool.query(
    `UPDATE external_sales SET
       status = $2::varchar,
       product_name = COALESCE(product_name, $3),
       gross_amount = COALESCE(gross_amount, $4),
       net_amount = COALESCE(net_amount, $5),
       fee_amount = COALESCE(fee_amount, $6),
       currency = COALESCE(currency, $7),
       payment_method = COALESCE(payment_method, $8),
       customer_name = COALESCE(customer_name, $9),
       customer_email = COALESCE(customer_email, $10),
       utm_source = COALESCE(utm_source, $11),
       utm_medium = COALESCE(utm_medium, $12),
       utm_campaign = COALESCE(utm_campaign, $13),
       utm_content = COALESCE(utm_content, $14),
       utm_term = COALESCE(utm_term, $15),
       approved_at = COALESCE(approved_at, $16::timestamptz),
       refunded_at = CASE WHEN $2::varchar = 'PAID' THEN refunded_at ELSE COALESCE(refunded_at, $17::timestamptz) END,
       raw_event = CASE WHEN $2::varchar <> status THEN $18::jsonb ELSE raw_event END,
       updated_at = NOW()
     WHERE id = $1`,
    [row.id, next, f.productName, f.gross, f.net, f.fee, f.currency, f.paymentMethod, f.customerName, f.customerEmail,
     f.utm.source, f.utm.medium, f.utm.campaign, f.utm.content, f.utm.term, f.approvedAt, refundedAt, raw]
  );
  const changed = next !== before;
  if (changed) await audit(pool, next, f, before);
  return { ignored: false, id: String(row.id), status: next, created: false, changed };
}

async function audit(pool: Pool, status: ExternalSaleStatus, f: KiwifySaleFields, before: ExternalSaleStatus | null) {
  const product = f.productName || 'produto sem nome';
  if (status === 'PAID') {
    await writeAuditLog(pool, null, 'KIWIFY_SALE_RECORDED',
      `Venda da Kiwify registrada: pedido ${f.externalOrderId}, ${product}, ${brl(f.gross)}.`, before, 'PAID');
  } else {
    const what = status === 'CHARGEBACK' ? 'contestada (chargeback)' : 'reembolsada';
    await writeAuditLog(pool, null, 'KIWIFY_SALE_REFUNDED',
      `Venda da Kiwify ${what}: pedido ${f.externalOrderId}, ${product}, ${brl(f.gross)}.`, before, status);
  }
}
