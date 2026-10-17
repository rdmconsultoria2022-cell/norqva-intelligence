import { Pool } from 'pg';

// NORQVA-0096 (D-0096): leituras para "Gerenciar campanha". Só leitura: nada aqui muda a Meta ou o banco.
// - economics: preço, valor líquido por venda, CPA máximo (equilíbrio) e ROAS de equilíbrio da oferta do plano.
// - history: o que aconteceu com a campanha (registros de auditoria e, para ADMIN, as decisões).

export class CampaignInsightError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Mesma estimativa de tarifa que o vigia usa quando o pedido não traz a tarifa real (Pix Asaas).
const EST_PCT_FEE = 0.06;
const EST_FIXED_FEE = 1.99;
const r2 = (n: number) => Math.round(n * 100) / 100;

function parseIds(v: any): Record<string, Record<string, string>> {
  const o = typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
  return o && typeof o === 'object' ? o : {};
}

export function planMetaIdList(metaIds: any): string[] {
  const out: string[] = [];
  for (const group of Object.values(parseIds(metaIds))) {
    if (group && typeof group === 'object') out.push(...Object.values(group).map(String));
  }
  return Array.from(new Set(out.filter(Boolean)));
}

/** Contas da venda. Sem os custos cadastrados na oferta, usa a estimativa de tarifa do vigia. */
export function unitEconomics(input: {
  price: number;
  taxRate?: number | null;
  pctFee?: number | null;
  fixedFee?: number | null;
  otherCost?: number | null;
  configured: boolean;
}) {
  const price = Number(input.price) || 0;
  const pct = input.configured ? Number(input.pctFee) || 0 : EST_PCT_FEE;
  const fixed = input.configured ? Number(input.fixedFee) || 0 : EST_FIXED_FEE;
  const tax = input.configured ? Number(input.taxRate) || 0 : 0;
  const other = input.configured ? Number(input.otherCost) || 0 : 0;
  const net = r2(price - (price * tax + price * pct + fixed + other));
  return {
    price: r2(price),
    net_per_sale: net,
    breakeven_cpa: net > 0 ? net : null,
    breakeven_roas: net > 0 ? Math.round((price / net) * 100) / 100 : null,
    estimated: !input.configured
  };
}

export class CampaignInsightService {
  constructor(private pool: Pool) {}

  private async plan(id: string) {
    if (!UUID_RE.test(String(id || ''))) throw new CampaignInsightError(404, 'Campanha não encontrada.');
    const r = await this.pool.query(`SELECT id, code, offer_human_id, meta_ids FROM launch_plans WHERE id = $1`, [id]);
    if (r.rows.length === 0) throw new CampaignInsightError(404, 'Campanha não encontrada.');
    return r.rows[0];
  }

  async economics(id: string) {
    const p = await this.plan(id);
    if (!p.offer_human_id) return { offer: null, economics: null };
    const r = await this.pool.query(
      `SELECT o.human_id, o.name, o.price, o.promotional_price,
              ue.tax_rate, ue.gateway_pct_fee, ue.gateway_fixed_fee, ue.other_variable_cost, (ue.id IS NOT NULL) AS configured
       FROM offers o
       LEFT JOIN offer_unit_economics ue ON ue.offer_id = o.id AND ue.is_demo = FALSE
       WHERE o.human_id = $1 LIMIT 1`,
      [p.offer_human_id]
    );
    const o = r.rows[0];
    if (!o) return { offer: null, economics: null };
    const price = o.promotional_price !== null && o.promotional_price !== undefined ? parseFloat(o.promotional_price) : parseFloat(o.price);
    return {
      offer: { human_id: o.human_id, name: o.name },
      economics: unitEconomics({
        price,
        taxRate: o.tax_rate,
        pctFee: o.gateway_pct_fee,
        fixedFee: o.gateway_fixed_fee,
        otherCost: o.other_variable_cost,
        configured: !!o.configured
      })
    };
  }

  async history(id: string, viewer: { role: string }) {
    const p = await this.plan(id);
    const metaIds = planMetaIdList(p.meta_ids);
    const patterns = [`%${p.code}%`, ...metaIds.map((m) => `%${m}%`)];
    const audits = await this.pool.query(
      `SELECT a.id, a.event_type, a.description, a.previous_value, a.new_value, a.created_at, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.is_demo = FALSE AND (a.description ILIKE ANY($1::text[]) OR a.new_value = $2)
       ORDER BY a.created_at DESC LIMIT 150`,
      [patterns, p.id]
    );
    const items: any[] = audits.rows.map((a) => ({
      id: `audit:${a.id}`,
      kind: 'AUDIT',
      at: a.created_at,
      type: a.event_type,
      who: a.user_name || 'NORQVA (automático)',
      description: a.description,
      before: a.previous_value,
      after: a.new_value,
      outcome: /FAILED/.test(String(a.event_type)) ? 'FAILED' : 'DONE'
    }));

    // Decisões (registro forense): só ADMIN, e sem dados de acesso (IP, navegador).
    if (viewer.role === 'ADMIN') {
      const dec = await this.pool.query(
        `SELECT id, phase, action, decision, user_email, actor_type, result, error, created_at
         FROM decision_events
         WHERE phase <> 'REQUESTED' AND (plan_id = $1 OR meta_ids ?| $2::text[])
         ORDER BY created_at DESC LIMIT 150`,
        [p.id, metaIds.length ? metaIds : ['__none__']]
      );
      for (const d of dec.rows) {
        items.push({
          id: `decision:${d.id}`,
          kind: 'DECISION',
          at: d.created_at,
          type: d.action,
          who: d.actor_type === 'HUMAN' ? d.user_email || 'pessoa' : d.actor_type === 'AUTOMATION' ? 'automação' : 'NORQVA (automático)',
          description: d.decision,
          before: null,
          after: null,
          outcome: d.phase === 'EXECUTED' ? 'DONE' : d.phase,
          error: d.error || null
        });
      }
    }
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { code: p.code, items: items.slice(0, 200) };
  }
}
