import { Pool } from 'pg';
import { CreativePerformanceService } from '../intelligence/creativePerformanceService';
import { resolveCampaignProducts } from '../finance/productMediaAllocation';
import { validateTransactionalEmailConfig, validateFrontendUrl } from '../emailConfig';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0009: alerts about Meta ads, evaluated after every Meta sync.
// Rule SPEND_WITHOUT_SALE: an ACTIVE ad whose lifetime spend reached 2x the breakeven CPA of its
// product with zero paid orders → "pausar recomendado". Recommendation only; nothing is paused.
// An open alert resolves by itself when the ad gets a sale or stops being active.

export const RULE_SPEND_WITHOUT_SALE = 'SPEND_WITHOUT_SALE';
export const SPEND_WITHOUT_SALE_MULTIPLIER = 2;

export interface AlertEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}
export type AlertEmailSender = (email: AlertEmail) => Promise<{ sent: boolean; error?: string }>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Pure rule. */
export function shouldAlertSpendWithoutSale(input: {
  spend: number;
  paidOrders: number;
  breakevenCpa: number | null;
  isActive: boolean;
}): { alert: boolean; threshold: number | null } {
  if (!input.breakevenCpa || input.breakevenCpa <= 0) return { alert: false, threshold: null };
  const threshold = round2(input.breakevenCpa * SPEND_WITHOUT_SALE_MULTIPLIER);
  return { alert: input.isActive && input.paidOrders === 0 && input.spend >= threshold, threshold };
}

/** NORQVA-0032: o adicional só entra no equilíbrio depois de tantas vendas pagas com ele oferecido. */
export const BUMP_BREAKEVEN_MIN_ORDERS = 20;

/**
 * Valor líquido médio do adicional por pedido pago da oferta principal, desde que o adicional foi configurado.
 * Só para ofertas com pelo menos BUMP_BREAKEVEN_MIN_ORDERS pedidos pagos nesse período (antes disso, 0).
 */
export async function bumpNetPerOrderByOffer(pool: Pool, isDemo = false): Promise<Map<string, { orders: number; avgBump: number }>> {
  const out = new Map<string, { orders: number; avgBump: number }>();
  try {
    const r = await pool.query(
      `SELECT m.offer_id, COUNT(DISTINCT o.id)::int AS orders, COALESCE(SUM(b.total_price), 0)::numeric AS bump_revenue
       FROM orders o
       JOIN order_items m ON m.order_id = o.id AND m.is_bump = FALSE
       JOIN offer_bumps ob ON ob.offer_id = m.offer_id AND ob.is_demo = $1
       LEFT JOIN order_items b ON b.order_id = o.id AND b.is_bump = TRUE
       WHERE o.status = 'PAID' AND o.is_demo = $1 AND o.created_at >= ob.created_at
         AND (o.is_demo = TRUE OR o.data_provenance = 'COMMERCIAL_PRODUCTION')
       GROUP BY m.offer_id`,
      [isDemo]
    );
    for (const row of r.rows) {
      const orders = Number(row.orders) || 0;
      out.set(String(row.offer_id), { orders, avgBump: orders > 0 ? parseFloat(row.bump_revenue) / orders : 0 });
    }
  } catch {
    // sem adicional (ou tabela ausente): equilíbrio só pelo preço principal
  }
  return out;
}

/** Breakeven CPA per product (lowest among its offers with unit economics configured). */
export async function breakevenByProduct(pool: Pool, isDemo = false): Promise<Map<string, number>> {
  const r = await pool.query(
    `SELECT o.id AS offer_id, o.product_id, o.price, o.promotional_price, ue.tax_rate, ue.gateway_fixed_fee, ue.gateway_pct_fee, ue.other_variable_cost
     FROM offers o
     JOIN offer_unit_economics ue ON ue.offer_id = o.id AND ue.is_demo = $1
     WHERE o.product_id IS NOT NULL`,
    [isDemo]
  );
  const bumps = await bumpNetPerOrderByOffer(pool, isDemo);
  const out = new Map<string, number>();
  for (const row of r.rows) {
    const price = row.promotional_price !== null && row.promotional_price !== undefined ? parseFloat(row.promotional_price) : parseFloat(row.price);
    const taxRate = parseFloat(row.tax_rate || '0');
    const pctFee = parseFloat(row.gateway_pct_fee || '0');
    let be =
      price -
      (price * taxRate +
        parseFloat(row.gateway_fixed_fee || '0') +
        price * pctFee +
        parseFloat(row.other_variable_cost || '0'));
    // NORQVA-0032: com amostra suficiente, soma o adicional líquido médio (mesmo Pix: sem tarifa fixa a mais)
    const b = bumps.get(String(row.offer_id));
    if (b && b.orders >= BUMP_BREAKEVEN_MIN_ORDERS) be += b.avgBump * (1 - taxRate - pctFee);
    if (!(be > 0)) continue;
    const pid = String(row.product_id);
    const cur = out.get(pid);
    out.set(pid, cur === undefined ? round2(be) : Math.min(cur, round2(be)));
  }
  return out;
}

export class AdAlertService {
  constructor(private sender: AlertEmailSender | null = defaultAlertEmailSender) {}

  /** Evaluate rules, open/resolve alerts and email ADMINs about new ones. */
  async evaluate(pool: Pool, isDemo: boolean, options: { notify?: boolean } = {}) {
    const shouldNotify = options.notify ?? !isDemo;
    const [perf, adsRes, campaignProduct, breakeven] = await Promise.all([
      new CreativePerformanceService().getCreativePerformance(pool, { is_demo: isDemo }),
      pool.query(
        `SELECT ma.meta_ad_id, ma.name, ma.status, ma.effective_status,
                mc.id AS campaign_db_id, mc.meta_campaign_id, mc.name AS campaign_name,
                mc.status AS campaign_status, mas.status AS adset_status
         FROM meta_ads ma
         JOIN meta_ad_sets mas ON mas.id = ma.adset_id
         JOIN meta_campaigns mc ON mc.id = mas.campaign_id
         WHERE ma.is_demo = $1`,
        [isDemo]
      ),
      resolveCampaignProducts(pool, isDemo),
      breakevenByProduct(pool, isDemo)
    ]);

    const perfByAd = new Map(perf.creatives.map((c) => [String(c.ad_id), c]));
    const openRes = await pool.query(
      `SELECT id, meta_ad_id FROM ad_alerts WHERE rule_code = $1 AND is_demo = $2 AND status IN ('OPEN', 'ACKNOWLEDGED')`,
      [RULE_SPEND_WITHOUT_SALE, isDemo]
    );
    const openByAd = new Map(openRes.rows.map((r) => [String(r.meta_ad_id), String(r.id)]));

    const created: any[] = [];
    const resolved: string[] = [];

    for (const ad of adsRes.rows) {
      const metaAdId = String(ad.meta_ad_id);
      const p = perfByAd.get(metaAdId);
      const spend = round2(p?.spend || 0);
      const paidOrders = p?.paid_orders || 0;
      const isActive =
        String(ad.status || '').toUpperCase() === 'ACTIVE' &&
        String(ad.campaign_status || 'ACTIVE').toUpperCase() === 'ACTIVE' &&
        String(ad.adset_status || 'ACTIVE').toUpperCase() === 'ACTIVE';
      const productId = campaignProduct.get(String(ad.campaign_db_id)) || null;
      const be = productId ? breakeven.get(productId) ?? null : null;
      const decision = shouldAlertSpendWithoutSale({ spend, paidOrders, breakevenCpa: be, isActive });
      const openId = openByAd.get(metaAdId);

      if (decision.alert && !openId) {
        const message = `${ad.name} gastou ${brl(spend)} sem nenhuma venda (limite ${brl(decision.threshold!)} = 2× o CPA de equilíbrio de ${brl(be!)}). Recomendação: pausar.`;
        const ins = await pool.query(
          `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, product_id, spend, threshold, breakeven_cpa, message, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [RULE_SPEND_WITHOUT_SALE, metaAdId, ad.name, ad.meta_campaign_id, ad.campaign_name, productId, spend, decision.threshold, be, message, isDemo]
        );
        created.push(ins.rows[0]);
      } else if (openId && (paidOrders > 0 || !isActive)) {
        await pool.query(
          `UPDATE ad_alerts SET status = 'RESOLVED', resolution = $1, resolved_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [paidOrders > 0 ? 'SALE_ARRIVED' : 'AD_NOT_ACTIVE', openId]
        );
        resolved.push(openId);
      } else if (openId) {
        await pool.query(`UPDATE ad_alerts SET spend = $1, updated_at = NOW() WHERE id = $2`, [spend, openId]);
      }
    }

    let emailed = false;
    if (created.length > 0) {
      await writeAuditLog(pool, null, 'AD_ALERTS_OPENED', `${created.length} alerta(s) de anúncio abertos`, null, created.map((c) => c.ad_name).join(', '), isDemo).catch(() => {});
      if (shouldNotify && this.sender) {
        emailed = await this.notify(pool, created);
      }
    }
    return { created: created.length, resolved: resolved.length, emailed, alerts: created };
  }

  private async notify(pool: Pool, alerts: any[]): Promise<boolean> {
    const admins = await pool.query(`SELECT email FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND email IS NOT NULL`);
    const to = admins.rows.map((r) => String(r.email)).filter((e) => /@/.test(e) && !/\.test$/i.test(e));
    if (to.length === 0 || !this.sender) return false;

    const front = validateFrontendUrl(process.env.FRONTEND_URL).url || 'https://norqva-intelligence-frontend.vercel.app';
    const subject =
      alerts.length === 1 ? `NORQVA: pausar ${alerts[0].ad_name}? Gasto sem venda` : `NORQVA: ${alerts.length} anúncios gastaram sem vender`;
    const lines = alerts.map((a) => `• ${a.message}`);
    const text = ['Alerta de anúncios da Meta', '', ...lines, '', `Abra o NORQVA → Meta Ads para ver e pausar: ${front}`, '', 'Nada foi pausado automaticamente.'].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#111">
  <h2 style="margin:0 0 12px">Alerta de anúncios da Meta</h2>
  <ul style="padding-left:18px">${alerts.map((a) => `<li style="margin-bottom:8px">${esc(a.message)}</li>`).join('')}</ul>
  <p><a href="${esc(front)}" style="background:#10b981;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Abrir o NORQVA → Meta Ads</a></p>
  <p style="color:#666;font-size:12px">Nada foi pausado automaticamente. Você decide.</p>
</div>`;

    try {
      const r = await this.sender({ to, subject, text, html });
      if (r.sent) {
        await pool.query(`UPDATE ad_alerts SET notified_at = NOW() WHERE id = ANY($1::uuid[])`, [alerts.map((a) => a.id)]);
      } else {
        console.warn('[AdAlertService] alert email not sent:', r.error);
      }
      return r.sent;
    } catch (err: any) {
      console.warn('[AdAlertService] alert email failed:', err?.message);
      return false;
    }
  }

  async list(pool: Pool, isDemo: boolean, onlyOpen: boolean) {
    const r = await pool.query(
      `SELECT * FROM ad_alerts WHERE is_demo = $1 ${onlyOpen ? `AND status IN ('OPEN', 'ACKNOWLEDGED')` : ''}
       ORDER BY created_at DESC LIMIT 100`,
      [isDemo]
    );
    return r.rows;
  }

  async acknowledge(pool: Pool, id: string, userId: string | null, isDemo: boolean) {
    const r = await pool.query(
      `UPDATE ad_alerts SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(), acknowledged_by = $1, updated_at = NOW()
       WHERE id = $2 AND is_demo = $3 AND status = 'OPEN' RETURNING *`,
      [userId, id, isDemo]
    );
    return r.rows[0] || null;
  }
}

/** Default sender: Resend, only when the transactional email config is valid. */
export const defaultAlertEmailSender: AlertEmailSender = async (email) => {
  const config = validateTransactionalEmailConfig(process.env);
  if (!config.valid || config.provider !== 'resend' || !config.apiKey) {
    return { sent: false, error: config.error || 'EMAIL_NOT_CONFIGURED' };
  }
  const { Resend } = await import('resend');
  const resend = new Resend(config.apiKey);
  const from = config.from || process.env.EMAIL_FROM || 'NORQVA <acesso@mail.norqva.com.br>';
  const res: any = await resend.emails.send({ from, to: email.to, subject: email.subject, text: email.text, html: email.html });
  if (res?.error) return { sent: false, error: String(res.error?.message || 'RESEND_ERROR') };
  return { sent: true };
};
