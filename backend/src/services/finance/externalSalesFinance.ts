// NORQVA-0110 (D-0110): vendas da Kiwify (external_sales) no Financeiro.
// Venda PAID conta como pedido pago e receita bruta; REFUNDED e CHARGEBACK seguem a regra de estorno
// dos pedidos (fora da receita, somados em "estornos"). Tarifa = fee_amount (tarifa da Kiwify).
// Campanha: utm_campaign igual ao nome da campanha da Meta sincronizada (igual, sem aproximação).
// Criativo: utm_content igual ao nome do anúncio dentro dessa campanha.
import { Pool } from 'pg';

export interface ExternalFinanceRow {
  id: string;
  status: 'PAID' | 'REFUNDED' | 'CHARGEBACK';
  gross: number;
  fee: number | null;
  productName: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  at: string | Date;
}

const money = (v: any) => Math.round((parseFloat(v ?? '0') || 0) * 100) / 100;

/** Período pela data de aprovação (ou de registro, se faltar), com a mesma regra de início da operação. */
export async function loadExternalSalesForFinance(pool: Pool, isDemo: boolean, startIso: string | null, endIso: string | null): Promise<ExternalFinanceRow[]> {
  const prov = isDemo
    ? `(e.data_provenance != 'COMMERCIAL_PRODUCTION' OR e.is_demo = TRUE)`
    : `(e.data_provenance = 'COMMERCIAL_PRODUCTION' AND e.is_demo = FALSE)`;
  const r = await pool.query(
    `SELECT e.id, e.status, e.gross_amount, e.fee_amount, e.product_name, e.utm_campaign, e.utm_content,
            COALESCE(e.approved_at, e.created_at) AS sale_at
     FROM external_sales e
     WHERE ${prov}
       AND ($1::timestamptz IS NULL OR COALESCE(e.approved_at, e.created_at) >= $1::timestamptz)
       AND ($2::timestamptz IS NULL OR COALESCE(e.approved_at, e.created_at) <= $2::timestamptz)`,
    [startIso, endIso]
  );
  return r.rows.map(row => ({
    id: String(row.id),
    status: row.status,
    gross: money(row.gross_amount),
    fee: row.fee_amount === null || row.fee_amount === undefined ? null : money(row.fee_amount),
    productName: row.product_name ? String(row.product_name) : null,
    utmCampaign: row.utm_campaign ? String(row.utm_campaign).trim() : null,
    utmContent: row.utm_content ? String(row.utm_content).trim() : null,
    at: row.sale_at
  }));
}

export function summarizeExternalSales(rows: ExternalFinanceRow[]) {
  const paid = rows.filter(r => r.status === 'PAID');
  const refunded = rows.filter(r => r.status !== 'PAID');
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
  return {
    total: rows.length,
    paidCount: paid.length,
    refundedCount: refunded.length,
    grossPaid: sum(paid.map(r => r.gross)),
    refundPrincipal: sum(refunded.map(r => r.gross)),
    knownFeeCount: paid.filter(r => r.fee !== null).length,
    nullFeeCount: paid.filter(r => r.fee === null).length,
    zeroFeeCount: paid.filter(r => r.fee === 0).length,
    fees: sum(paid.map(r => r.fee || 0))
  };
}

export const externalProductKey = (r: ExternalFinanceRow) => (r.productName || 'Venda da Kiwify').trim().toLowerCase();

/**
 * Soma as vendas pagas aos produtos da quebra por produto (mesmo nome, um só) ou cria a linha do produto
 * da Kiwify. Devolve, por nome de produto, o código da linha usada (e o nome para mostrar).
 */
export function mergeExternalIntoProductRows(productRows: any[], rows: ExternalFinanceRow[]): Map<string, { productId: string; name: string }> {
  const used = new Map<string, { productId: string; name: string }>();
  const groups = new Map<string, { name: string; units: number; revenue: number; fees: number; nullFees: number }>();
  for (const r of rows) {
    if (r.status !== 'PAID') continue;
    const name = r.productName || 'Venda da Kiwify';
    const key = externalProductKey(r);
    const g = groups.get(key) || { name, units: 0, revenue: 0, fees: 0, nullFees: 0 };
    g.units += 1;
    g.revenue = Math.round((g.revenue + r.gross) * 100) / 100;
    g.fees = Math.round((g.fees + (r.fee || 0)) * 100) / 100;
    if (r.fee === null) g.nullFees += 1;
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const match = productRows.filter(p => String(p.product_name || '').trim().toLowerCase() === key);
    if (match.length === 1) {
      const p = match[0];
      p.units_sold = String((parseInt(p.units_sold || '0', 10) || 0) + g.units);
      p.gross_revenue = String(Math.round((parseFloat(p.gross_revenue || '0') + g.revenue) * 100) / 100);
      p.gateway_fees = String(Math.round((parseFloat(p.gateway_fees || '0') + g.fees) * 100) / 100);
      p.null_fees_count = String((parseInt(p.null_fees_count || '0', 10) || 0) + g.nullFees);
      used.set(key, { productId: String(p.product_id), name: String(p.product_name) });
    } else {
      used.set(key, { productId: `kiwify:${key}`, name: g.name });
      productRows.push({
        product_id: `kiwify:${key}`,
        product_human_id: 'KIWIFY',
        product_name: g.name,
        units_sold: String(g.units),
        gross_revenue: String(g.revenue),
        gateway_fees: String(g.fees),
        null_fees_count: String(g.nullFees)
      });
    }
  }
  return used;
}

export type ExternalAttribution =
  | { kind: 'ATTRIBUTED'; campaignId: string; adId: string | null }
  | { kind: 'AMBIGUOUS' }
  | { kind: 'UNATTRIBUTED' };

/** Mesmo texto, sem diferença de espaços; aceita o valor ainda codificado de URL ("+" e "%20"). */
function utmVariants(v: string): string[] {
  const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
  const out = [norm(v)];
  try {
    const decoded = norm(decodeURIComponent(v.replace(/\+/g, ' ')));
    if (!out.includes(decoded)) out.push(decoded);
  } catch {
    /* texto com % solto: fica só o original */
  }
  return out;
}
const sameName = (name: string | null, utm: string[]) => utm.includes((name || '').replace(/\s+/g, ' ').trim());

/** utm_campaign = nome da campanha (um só resultado); utm_content = nome do anúncio dentro dela. */
export function attributeExternalSale(
  row: ExternalFinanceRow,
  campaigns: { campaign_id: string; campaign_name: string | null }[],
  ads: { ad_id: string; ad_name: string | null; campaign_id: string }[]
): ExternalAttribution {
  if (!row.utmCampaign) return { kind: 'UNATTRIBUTED' };
  const campUtm = utmVariants(row.utmCampaign);
  const camps = campaigns.filter(c => sameName(c.campaign_name, campUtm));
  if (camps.length === 0) return { kind: 'UNATTRIBUTED' };
  if (camps.length > 1) return { kind: 'AMBIGUOUS' };
  const campaignId = String(camps[0].campaign_id);
  let adId: string | null = null;
  if (row.utmContent) {
    const adUtm = utmVariants(row.utmContent);
    const matches = ads.filter(a => String(a.campaign_id) === campaignId && sameName(a.ad_name, adUtm));
    if (matches.length === 1) adId = String(matches[0].ad_id);
  }
  return { kind: 'ATTRIBUTED', campaignId, adId };
}
