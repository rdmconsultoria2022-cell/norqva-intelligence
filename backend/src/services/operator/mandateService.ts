import crypto from 'crypto';
import { Pool } from 'pg';
import { MetaMutatingClient } from '../meta/metaMutatingClient';
import { MetaChangeService } from '../meta/metaChangeService';
import { resolveOrderAttribution, MetaHierarchyContext } from '../attribution/deterministicAttributionResolver';
import { normalizeMetaIds } from '../launchPlans/launchPlanService';
import { spClock } from '../campaigns/nightPauseService';
import { withPlanLock } from '../campaigns/planLock';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0137 (D-0137): mandato de operação das campanhas Trattoria. Contrato "NORQVA-0136 — Operação
// autônoma das campanhas Trattoria", aprovado pelo Ricardo em 26/10/2026 14h21.
// O Claude (agente em sessões agendadas) opera as campanhas da lista do mandato. Os limites valem AQUI, no
// servidor: mesmo um agente que erre não passa deles.
// - Capital R$ 1.500 em até 21 dias desde a ativação; soma dos orçamentos diários das campanhas do mandato
//   no máximo R$ 100.
// - CPA máximo por oferta = preço − 6% de imposto − R$ 1,99 de tarifa (preço promocional, se houver).
// - Freio (pausa tudo, mandato BRAKED, aviso na central): gasto ≥ R$ 750 sem nenhuma oferta com 5 vendas pagas
//   e CPA ≤ CPA máximo; ou resultado (receita líquida das vendas pagas atribuídas − gasto) ≤ −R$ 750; ou capital
//   esgotado. No fim do prazo, pausa tudo e encerra (ENDED).
// - Subir orçamento: 48 h desde a última subida no mesmo objeto, no máximo +20%, e a campanha com 5 vendas
//   pagas nos últimos 3 dias com CPA ≤ 80% do CPA máximo. Baixar: sempre. Das 22h às 8h (Brasília) só pausar.
// - Ativar: só objetos das campanhas do mandato, mandato ATIVO e sem freio.
// - Toda alteração vai pela ficha de alteração (meta_change_requests, origem OPERATOR ou MANDATE_BRAKE), que usa
//   as rotas de controle de sempre (mesmas travas) e só confirma relendo a Meta.
// Números: gasto, impressões e cliques vêm da Meta; vendas e receita só de pedidos PAID confirmados pelo Asaas.

export class MandateError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

type EntityType = 'CAMPAIGN' | 'ADSET' | 'AD';

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const META_ID_RE = /^\d{5,25}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------
// Regras (números do contrato; imposto e tarifa ajustáveis por variável de ambiente)
// ---------------------------------------------------------------------------------------------

export const MANDATE_DEFAULTS = {
  capital_brl: 1500,
  daily_cap_brl: 100,
  days: 21,
  brake_spend_brl: 750,
  brake_loss_brl: 750,
  min_sales: 5
};
export const INCREASE_MAX_PCT = 0.2;
export const INCREASE_MIN_HOURS = 48;
export const PROFIT_DAYS = 3;
export const PROFIT_CPA_FACTOR = 0.8;
/** Das 22:00 às 07:59 (Brasília) só pausar. */
export const QUIET_START_MIN = 22 * 60;
export const QUIET_END_MIN = 8 * 60;
const READ_FAILURES_ALERT = 3;
const MAX_CAMPAIGNS = 20;

const envNum = (key: string, def: number, min: number, max: number) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};
/** Imposto sobre a venda (padrão 6%). */
export const taxPct = () => envNum('OPERATOR_TAX_PCT', 0.06, 0, 0.5);
/** Tarifa fixa por venda (padrão R$ 1,99, Pix Asaas). */
export const fixedFee = () => envNum('OPERATOR_FIXED_FEE_BRL', 1.99, 0, 50);

/** CPA máximo de uma oferta: preço − imposto − tarifa. 29,90 → 26,12; 47 → 42,19; 19,90 → 16,72. */
export function maxCpa(price: number): number {
  return r2(price - price * taxPct() - fixedFee());
}

export function offerPrice(o: { price: unknown; promotional_price?: unknown }): number {
  const promo = o.promotional_price;
  return promo !== null && promo !== undefined && promo !== '' && num(promo) > 0 ? num(promo) : num(o.price);
}

/** Horário de Brasília em que só pausar é permitido. */
export function isQuietHours(now = new Date()): boolean {
  const m = spClock(now).minutes;
  return m >= QUIET_START_MIN || m < QUIET_END_MIN;
}

export interface Verdict {
  stop: boolean;
  status?: 'BRAKED' | 'ENDED';
  code?: 'PRAZO' | 'CAPITAL' | 'PREJUIZO' | 'SEM_TRACAO';
  reason?: string;
}

/** Regra pura do freio. */
export function judgeMandate(
  m: { capital_brl: unknown; brake_spend_brl: unknown; brake_loss_brl: unknown; ends_at: unknown; min_sales?: unknown },
  s: { spent: number; result: number; any_offer_qualifies: boolean } | null,
  now = new Date()
): Verdict {
  if (new Date(String(m.ends_at)).getTime() <= now.getTime()) {
    return { stop: true, status: 'ENDED', code: 'PRAZO', reason: 'O prazo do mandato terminou.' };
  }
  if (!s) return { stop: false };
  const capital = num(m.capital_brl);
  const brakeSpend = num(m.brake_spend_brl);
  const brakeLoss = num(m.brake_loss_brl);
  const minSales = num(m.min_sales) || MANDATE_DEFAULTS.min_sales;
  if (s.spent >= capital) return { stop: true, status: 'BRAKED', code: 'CAPITAL', reason: `Capital esgotado: gasto ${brl(s.spent)} de ${brl(capital)}.` };
  if (s.result <= -brakeLoss) return { stop: true, status: 'BRAKED', code: 'PREJUIZO', reason: `Resultado acumulado ${brl(s.result)} (limite −${brl(brakeLoss)}).` };
  if (s.spent >= brakeSpend && !s.any_offer_qualifies) {
    return {
      stop: true,
      status: 'BRAKED',
      code: 'SEM_TRACAO',
      reason: `Gasto ${brl(s.spent)} (limite ${brl(brakeSpend)}) sem nenhuma oferta com ${minSales} vendas pagas e CPA dentro do máximo.`
    };
  }
  return { stop: false };
}

/** Regra pura da subida de orçamento (o que não depende do banco). */
export function judgeIncrease(input: {
  previous: number;
  next: number;
  hoursSinceLastIncrease: number | null;
  recent: { sales: number; spend: number | null };
  maxCpa: number | null;
  minSales?: number;
}): string | null {
  const minSales = input.minSales || MANDATE_DEFAULTS.min_sales;
  if (input.hoursSinceLastIncrease !== null && input.hoursSinceLastIncrease < INCREASE_MIN_HOURS) {
    return `A última subida de orçamento deste objeto foi há ${Math.max(0, Math.floor(input.hoursSinceLastIncrease))} h. Espere ${INCREASE_MIN_HOURS} h entre subidas.`;
  }
  if (!(input.previous > 0)) return 'Não dá para saber o orçamento atual deste objeto. Sincronize a Meta e tente de novo.';
  if (input.next > r2(input.previous * (1 + INCREASE_MAX_PCT)) + 0.005) {
    return `Subida acima de ${Math.round(INCREASE_MAX_PCT * 100)}%: de ${brl(input.previous)} pode ir no máximo a ${brl(r2(input.previous * (1 + INCREASE_MAX_PCT)))}.`;
  }
  if (input.maxCpa === null || !(input.maxCpa > 0)) return 'A campanha não tem oferta definida no mandato (nem vendas que mostrem qual é). Sem CPA máximo, não sobe orçamento.';
  if (input.recent.spend === null) return 'Não foi possível ler na Meta o gasto dos últimos dias. Nada foi alterado.';
  const limit = r2(input.maxCpa * PROFIT_CPA_FACTOR);
  if (input.recent.sales < minSales) {
    return `Nos últimos ${PROFIT_DAYS} dias a campanha teve ${input.recent.sales} venda(s) paga(s); para subir são precisas ${minSales} com CPA até ${brl(limit)}.`;
  }
  const cpa = r2(input.recent.spend / input.recent.sales);
  if (cpa > limit + 0.005) {
    return `CPA dos últimos ${PROFIT_DAYS} dias ${brl(cpa)} acima de ${brl(limit)} (80% do CPA máximo ${brl(input.maxCpa)}).`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Leitura na Meta (simulada nos testes)
// ---------------------------------------------------------------------------------------------

export interface MandateReader {
  spendBetween(campaignId: string, since: string, until: string): Promise<number>;
  adInsightsDaily(campaignId: string, since: string, until: string): Promise<{ rows: any[]; truncated: boolean }>;
  hourly(campaignId: string, since: string, until: string): Promise<any[]>;
}

const defaultReader = (): MandateReader => {
  const c = new MetaMutatingClient();
  return {
    spendBetween: (id, s, u) => c.getCampaignSpendBetween(id, s, u),
    adInsightsDaily: (id, s, u) => c.getCampaignAdInsightsDaily(id, s, u),
    hourly: (id, s, u) => c.getCampaignHourlyInsights(id, s, u)
  };
};
let readerFactory: () => MandateReader = defaultReader;
export function setMandateReaderForTesting(f: (() => MandateReader) | null) {
  readerFactory = f || defaultReader;
}

/** Data AAAA-MM-DD em São Paulo `daysAgo` dias antes. */
function spDateAgo(daysAgo: number, now = new Date()): string {
  return spClock(new Date(now.getTime() - daysAgo * 86400000)).date;
}
/** Meia-noite de São Paulo de uma data (Brasil sem horário de verão desde 2019). */
const spMidnightIso = (date: string) => `${date}T00:00:00-03:00`;

// ---------------------------------------------------------------------------------------------
// Vendas pagas (Asaas) atribuídas às campanhas do mandato
// ---------------------------------------------------------------------------------------------

export interface AttributedSale {
  order_id: string;
  meta_campaign_id: string;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  total: number;
  net: number;
  confirmed_at: string;
  sp_date: string;
  offer_human_id: string | null;
}

/**
 * Pedidos PAID com pagamento CONFIRMED (Asaas) desde `sinceIso`, atribuídos a uma das campanhas.
 * Receita líquida = valor − imposto (OPERATOR_TAX_PCT) − tarifa real do Asaas (ou a tarifa fixa, se ainda não veio).
 * Atribuição: utm_campaign = código do plano da campanha, ou o resolvedor determinístico (ID do anúncio, ID ou nome
 * da campanha). Pedido ambíguo ou sem origem não conta.
 */
export async function attributedSales(pool: Pool, campaignIds: string[], sinceIso: string): Promise<AttributedSale[]> {
  if (campaignIds.length === 0) return [];
  const wanted = new Set(campaignIds.map(String));
  const orders = await pool.query(
    `SELECT o.id, o.total_amount, o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content, o.fbclid, o.attribution_metadata,
            o.visitor_id, o.session_id, pc.confirmed_at, pc.fee,
            (SELECT ofr.human_id FROM order_items oi JOIN offers ofr ON ofr.id = oi.offer_id WHERE oi.order_id = o.id ORDER BY oi.created_at LIMIT 1) AS offer_human_id
     FROM orders o
     JOIN LATERAL (
       SELECT MIN(COALESCE(p.confirmed_at, o.created_at)) AS confirmed_at, SUM(p.provider_fee) AS fee
       FROM payments p WHERE p.order_id = o.id AND p.status = 'CONFIRMED'
     ) pc ON TRUE
     WHERE o.is_demo = FALSE AND o.data_provenance = 'COMMERCIAL_PRODUCTION' AND o.status = 'PAID'
       AND pc.confirmed_at IS NOT NULL AND pc.confirmed_at >= $1::timestamptz
     ORDER BY pc.confirmed_at`,
    [sinceIso]
  );
  if (orders.rows.length === 0) return [];

  // plano → campanha (pedidos de plano chegam com utm_campaign = código do plano)
  const plans = await pool.query(`SELECT code, meta_ids FROM launch_plans WHERE meta_ids IS NOT NULL`);
  const planCampaign = new Map<string, string>();
  for (const p of plans.rows) {
    const cid = Object.values(normalizeMetaIds(p.meta_ids).campaign || {})[0];
    if (cid && p.code) planCampaign.set(String(p.code).toUpperCase(), String(cid));
  }

  const [camps, sets, ads] = await Promise.all([
    pool.query(`SELECT id, meta_campaign_id, name FROM meta_campaigns WHERE is_demo = FALSE`),
    pool.query(`SELECT s.id, s.meta_adset_id, s.campaign_id, c.meta_campaign_id FROM meta_ad_sets s JOIN meta_campaigns c ON c.id = s.campaign_id WHERE s.is_demo = FALSE`),
    pool.query(
      `SELECT a.id, a.meta_ad_id, a.adset_id, s.meta_adset_id, s.campaign_id, c.meta_campaign_id
       FROM meta_ads a JOIN meta_ad_sets s ON s.id = a.adset_id JOIN meta_campaigns c ON c.id = s.campaign_id WHERE a.is_demo = FALSE`
    )
  ]);
  const hierarchy: MetaHierarchyContext = {
    campaigns: camps.rows.map((c: any) => ({ id: String(c.id), meta_campaign_id: String(c.meta_campaign_id), name: String(c.name || '') })),
    adSets: sets.rows.map((s: any) => ({ id: String(s.id), meta_adset_id: String(s.meta_adset_id), campaign_id: String(s.campaign_id), meta_campaign_id: String(s.meta_campaign_id) })),
    ads: ads.rows.map((a: any) => ({
      id: String(a.id),
      meta_ad_id: String(a.meta_ad_id),
      adset_id: String(a.adset_id),
      meta_adset_id: String(a.meta_adset_id),
      campaign_id: String(a.campaign_id),
      meta_campaign_id: String(a.meta_campaign_id)
    }))
  };

  const out: AttributedSale[] = [];
  for (const o of orders.rows) {
    const res = resolveOrderAttribution(o, hierarchy);
    let cid: string | null = null;
    let adset: string | null = null;
    let ad: string | null = null;
    const byPlan = o.utm_campaign ? planCampaign.get(String(o.utm_campaign).trim().toUpperCase()) : undefined;
    if (byPlan) {
      cid = byPlan;
      if (res.attribution_status === 'ATTRIBUTED' && res.meta_campaign_id === byPlan) {
        adset = res.meta_adset_id;
        ad = res.meta_ad_id;
      }
    } else if (res.attribution_status === 'ATTRIBUTED' && res.meta_campaign_id) {
      cid = String(res.meta_campaign_id);
      adset = res.meta_adset_id;
      ad = res.meta_ad_id;
    }
    if (!cid || !wanted.has(cid)) continue;
    const total = num(o.total_amount);
    const fee = o.fee === null || o.fee === undefined ? fixedFee() : num(o.fee);
    out.push({
      order_id: String(o.id),
      meta_campaign_id: cid,
      meta_adset_id: adset ? String(adset) : null,
      meta_ad_id: ad ? String(ad) : null,
      total: r2(total),
      net: r2(total - total * taxPct() - fee),
      confirmed_at: new Date(o.confirmed_at).toISOString(),
      sp_date: spClock(new Date(o.confirmed_at)).date,
      offer_human_id: o.offer_human_id ? String(o.offer_human_id) : null
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

/** Pedido "de sistema" para reaproveitar as fichas e as rotas de controle (mesmas travas). */
function systemReq(pool: Pool, name: string): any {
  return {
    app: { get: (k: string) => (k === 'db' ? pool : undefined) },
    query: { mode: 'real' },
    params: {},
    body: {},
    headers: {},
    ip: undefined,
    user: { id: '', auth_user_id: null, name, email: 'operador@norqva.local', role: 'ADMIN', status: 'ACTIVE' },
    // vai para o registro de decisões como automação (não pessoa)
    header: (h: string) => (String(h).toLowerCase() === 'x-norqva-automation-token' ? 'operator' : undefined)
  };
}

// relógio (simulado nos testes, para a janela da noite e o prazo)
let clock: () => Date = () => new Date();
export function setMandateClockForTesting(f: (() => Date) | null) {
  clock = f || (() => new Date());
}

const OPERATOR_NAME = 'Claude (operador do mandato)';
const BRAKE_NAME = 'NORQVA (freio do mandato)';

export class MandateService {
  constructor(private pool: Pool, private reader: MandateReader = readerFactory()) {}

  static reader() {
    return readerFactory();
  }

  // ------------------------------ leitura básica ------------------------------

  /** Mandato em vigor (ACTIVE ou BRAKED); sem ele, o último encerrado. */
  async current(): Promise<any | null> {
    const r = await this.pool.query(
      `SELECT * FROM operator_mandates ORDER BY CASE WHEN status IN ('ACTIVE', 'BRAKED') THEN 0 ELSE 1 END, created_at DESC LIMIT 1`
    );
    return r.rows[0] || null;
  }

  async campaigns(mandateId: string): Promise<any[]> {
    const r = await this.pool.query(
      `SELECT mc.meta_campaign_id, COALESCE(c.name, mc.name) AS name, mc.offer_human_id, c.status, c.daily_budget
       FROM operator_mandate_campaigns mc
       LEFT JOIN meta_campaigns c ON c.meta_campaign_id = mc.meta_campaign_id AND c.is_demo = FALSE
       WHERE mc.mandate_id = $1 AND mc.removed_at IS NULL ORDER BY mc.created_at`,
      [mandateId]
    );
    return r.rows;
  }

  async offers(humanIds: string[]): Promise<Map<string, { human_id: string; name: string; price: number; max_cpa: number }>> {
    const out = new Map<string, { human_id: string; name: string; price: number; max_cpa: number }>();
    if (humanIds.length === 0) return out;
    const r = await this.pool.query(`SELECT human_id, name, price, promotional_price FROM offers WHERE human_id = ANY($1::text[])`, [humanIds]);
    for (const o of r.rows) {
      const price = offerPrice(o);
      out.set(String(o.human_id), { human_id: String(o.human_id), name: String(o.name || ''), price: r2(price), max_cpa: maxCpa(price) });
    }
    return out;
  }

  async log(m: { id: string } | null, a: { actor: string; action: string; entity_type?: string | null; meta_id?: string | null; meta_campaign_id?: string | null; previous_value?: string | null; requested_value?: string | null; outcome: string; message?: string | null; change_id?: string | null }) {
    await this.pool
      .query(
        `INSERT INTO operator_mandate_actions (mandate_id, actor, action, entity_type, meta_id, meta_campaign_id, previous_value, requested_value, outcome, message, change_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          m?.id || null,
          a.actor,
          a.action,
          a.entity_type || null,
          a.meta_id || null,
          a.meta_campaign_id || null,
          a.previous_value ?? null,
          a.requested_value ?? null,
          a.outcome,
          a.message ? String(a.message).slice(0, 2000) : null,
          a.change_id && UUID_RE.test(a.change_id) ? a.change_id : null
        ]
      )
      .catch((err) => console.error('[MANDATE] não registrou a ação', err?.message));
  }

  private async alert(rule: string, cid: string | null, name: string, message: string) {
    try {
      const open = await this.pool.query(
        `SELECT 1 FROM ad_alerts WHERE rule_code = $1 AND meta_ad_id = $2 AND is_demo = FALSE AND status IN ('OPEN', 'ACKNOWLEDGED') AND dismissed_at IS NULL LIMIT 1`,
        [rule, cid || 'mandato']
      );
      if (open.rows.length) return;
      await this.pool.query(
        `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, spend, threshold, message, is_demo)
         VALUES ($1, $2, NULL, $3, $4, 0, 0, $5, FALSE)`,
        [rule, cid || 'mandato', cid, name.slice(0, 255), message]
      );
    } catch (err: any) {
      console.error('[MANDATE] não abriu o aviso', rule, err?.message);
    }
  }

  // ------------------------------ números do mandato ------------------------------

  /** Gasto (Meta), vendas e receita (Asaas) desde a ativação, por campanha e por oferta. Lança se a Meta não responder. */
  async snapshot(m: any, now = clock()) {
    const camps = await this.campaigns(m.id);
    const ids = camps.map((c) => String(c.meta_campaign_id));
    const since = spClock(new Date(m.activated_at)).date;
    const until = spClock(now).date;
    const spend = new Map<string, number>();
    for (const id of ids) spend.set(id, r2(await this.reader.spendBetween(id, since, until)));
    const sales = await attributedSales(this.pool, ids, new Date(m.activated_at).toISOString());

    // oferta de cada campanha: a definida no mandato ou, sem ela, a mais vendida pela campanha
    const offerOf = new Map<string, { id: string | null; source: 'CONFIGURED' | 'INFERRED' | null }>();
    for (const c of camps) {
      if (c.offer_human_id) {
        offerOf.set(String(c.meta_campaign_id), { id: String(c.offer_human_id), source: 'CONFIGURED' });
        continue;
      }
      const count = new Map<string, number>();
      for (const s of sales) if (s.meta_campaign_id === String(c.meta_campaign_id) && s.offer_human_id) count.set(s.offer_human_id, (count.get(s.offer_human_id) || 0) + 1);
      const best = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0];
      offerOf.set(String(c.meta_campaign_id), best ? { id: best[0], source: 'INFERRED' } : { id: null, source: null });
    }
    const offerIds = Array.from(new Set(Array.from(offerOf.values()).map((o) => o.id).filter(Boolean))) as string[];
    const offerInfo = await this.offers(offerIds);
    const minSales = num(m.min_sales) || MANDATE_DEFAULTS.min_sales;

    const campaigns = camps.map((c) => {
      const id = String(c.meta_campaign_id);
      const mine = sales.filter((s) => s.meta_campaign_id === id);
      const sp = spend.get(id) || 0;
      const off = offerOf.get(id)!;
      const info = off.id ? offerInfo.get(off.id) || null : null;
      return {
        meta_campaign_id: id,
        name: c.name || null,
        status: c.status || null,
        offer_human_id: off.id,
        offer_source: off.source,
        max_cpa: info?.max_cpa ?? null,
        spend: sp,
        paid_sales: mine.length,
        net_revenue: r2(mine.reduce((t, s) => t + s.net, 0)),
        cpa: mine.length ? r2(sp / mine.length) : null
      };
    });

    const offers = offerIds.map((oid) => {
      const info = offerInfo.get(oid);
      const cs = campaigns.filter((c) => c.offer_human_id === oid);
      const sp = r2(cs.reduce((t, c) => t + c.spend, 0));
      const n = cs.reduce((t, c) => t + c.paid_sales, 0);
      const cpa = n ? r2(sp / n) : null;
      const max = info?.max_cpa ?? null;
      return {
        human_id: oid,
        name: info?.name || null,
        price: info?.price ?? null,
        max_cpa: max,
        spend: sp,
        paid_sales: n,
        cpa,
        qualifies: max !== null && n >= minSales && cpa !== null && cpa <= max + 0.005
      };
    });

    const spent = r2(campaigns.reduce((t, c) => t + c.spend, 0));
    const net = r2(sales.reduce((t, s) => t + s.net, 0));
    return {
      computed_at: now.toISOString(),
      spend_window: { since, until, source: 'Meta (ao vivo)' },
      spent,
      paid_sales: sales.length,
      net_revenue: net,
      result: r2(net - spent),
      any_offer_qualifies: offers.some((o) => o.qualifies),
      offers,
      campaigns,
      unassigned_offer_campaigns: campaigns.filter((c) => !c.offer_human_id).map((c) => c.meta_campaign_id)
    };
  }

  // ------------------------------ freio ------------------------------

  /**
   * Confere o mandato e aplica o freio. Roda no agendador (a cada 15 min) e antes de cada escrita do operador.
   * Devolve o mandato depois da conferência, os números (null se a Meta não respondeu) e o erro de leitura.
   */
  async check(now = clock()): Promise<{ mandate: any | null; snapshot: any | null; error: string | null; verdict: Verdict | null }> {
    const first = await this.current();
    if (!first) return { mandate: null, snapshot: null, error: null, verdict: null };
    return withPlanLock(this.pool, `mandate:${first.id}`, async () => {
      const m = (await this.pool.query(`SELECT * FROM operator_mandates WHERE id = $1`, [first.id])).rows[0];
      if (m.status !== 'ACTIVE') {
        if (m.pause_pending) await this.pauseAll(m, 'BRAKE');
        const fresh = (await this.pool.query(`SELECT * FROM operator_mandates WHERE id = $1`, [m.id])).rows[0];
        return { mandate: fresh, snapshot: fresh.last_snapshot || null, error: null, verdict: null };
      }
      // prazo: não depende da Meta
      const byDate = judgeMandate(m, null, now);
      if (byDate.stop) {
        await this.stop(m, byDate);
        return { mandate: (await this.pool.query(`SELECT * FROM operator_mandates WHERE id = $1`, [m.id])).rows[0], snapshot: m.last_snapshot || null, error: null, verdict: byDate };
      }
      let snap: any;
      try {
        snap = await this.snapshot(m, now);
      } catch (err: any) {
        const msg = String(err?.message || err).slice(0, 500);
        const r = await this.pool.query(
          `UPDATE operator_mandates SET read_failures = read_failures + 1, last_check_error = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
          [m.id, msg]
        );
        if (Number(r.rows[0]?.read_failures) === READ_FAILURES_ALERT) {
          await this.alert('MANDATE_READ_FAILED', null, m.name, `O freio do mandato não consegue ler o gasto na Meta (${READ_FAILURES_ALERT} tentativas seguidas): ${msg}. Enquanto isso o operador só pode pausar.`);
        }
        return { mandate: r.rows[0], snapshot: null, error: msg, verdict: null };
      }
      const r = await this.pool.query(
        `UPDATE operator_mandates SET last_check_at = NOW(), last_snapshot = $2, last_check_error = NULL, read_failures = 0, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [m.id, JSON.stringify(snap)]
      );
      const verdict = judgeMandate(m, snap, now);
      if (verdict.stop) {
        await this.stop(r.rows[0], verdict);
        return { mandate: (await this.pool.query(`SELECT * FROM operator_mandates WHERE id = $1`, [m.id])).rows[0], snapshot: snap, error: null, verdict };
      }
      return { mandate: r.rows[0], snapshot: snap, error: null, verdict };
    });
  }

  /** Para o mandato (freio ou prazo): grava, avisa e pausa todas as campanhas. Chamar com a trava do mandato. */
  private async stop(m: any, v: Verdict) {
    const r = await this.pool.query(
      `UPDATE operator_mandates SET status = $2, stopped_at = NOW(), stop_code = $3, stop_reason = $4, pause_pending = TRUE, updated_at = NOW()
       WHERE id = $1 AND status = 'ACTIVE' RETURNING *`,
      [m.id, v.status, v.code, v.reason]
    );
    if (!r.rows.length) return;
    const title = v.status === 'ENDED' ? 'Mandato encerrado pelo prazo' : 'Freio do mandato acionado';
    await writeAuditLog(this.pool, null, v.status === 'ENDED' ? 'OPERATOR_MANDATE_ENDED' : 'OPERATOR_MANDATE_BRAKED', `${title}: ${v.reason} Todas as campanhas do mandato serão pausadas.`, 'ACTIVE', String(v.status));
    await this.log(m, { actor: 'BRAKE', action: v.status === 'ENDED' ? 'END' : 'BRAKE', outcome: 'DONE', message: v.reason || null });
    await this.alert(v.status === 'ENDED' ? 'MANDATE_ENDED' : 'MANDATE_BRAKED', null, m.name, `${title}: ${v.reason} O NORQVA pausou as campanhas do mandato.`);
    await this.pauseAll(r.rows[0], 'BRAKE');
  }

  /** Pausa todas as campanhas do mandato pela ficha de alteração. pause_pending só cai quando a Meta aceitou todas. */
  private async pauseAll(m: any, actor: 'BRAKE' | 'ADMIN') {
    const camps = await this.campaigns(m.id);
    let ok = true;
    for (const c of camps) {
      const change = await this.execute(m, actor, 'CAMPAIGN', String(c.meta_campaign_id), String(c.meta_campaign_id), 'STATUS', 'PAUSED', null);
      if (!['CONFIRMED', 'UNCONFIRMED'].includes(change.state)) {
        ok = false;
        await this.alert('MANDATE_PAUSE_FAILED', String(c.meta_campaign_id), c.name || String(c.meta_campaign_id), `O NORQVA não conseguiu pausar a campanha "${c.name || c.meta_campaign_id}" do mandato: ${change.error || 'erro'}. Pause pela tela agora. O freio tenta de novo a cada 15 min.`);
      }
    }
    await this.pool.query(`UPDATE operator_mandates SET pause_pending = $2, updated_at = NOW() WHERE id = $1`, [m.id, !ok]);
  }

  /** Uma alteração pela ficha (mesmas travas das telas). Devolve a ficha (state, error) e registra no mandato. */
  private async execute(
    m: any,
    actor: 'OPERATOR' | 'BRAKE' | 'ADMIN',
    type: EntityType,
    metaId: string,
    campaignId: string,
    kind: 'STATUS' | 'DAILY_BUDGET',
    value: string,
    previous: string | null
  ): Promise<{ state: string; error: string | null; id: string | null; http_status?: number }> {
    const id = crypto.randomUUID();
    const req = systemReq(this.pool, actor === 'OPERATOR' ? OPERATOR_NAME : actor === 'BRAKE' ? BRAKE_NAME : 'Administrador (mandato)');
    let change: any;
    try {
      const r = await new MetaChangeService(this.pool).create(req, { id, entity_type: type.toLowerCase(), meta_id: metaId, kind, value, scope_campaign: campaignId });
      change = r.change;
    } catch (err: any) {
      change = { id: null, state: 'FAILED', error: String(err?.message || err), http_status: err?.status };
    }
    if (change?.id) await this.pool.query(`UPDATE meta_change_requests SET origin = $2 WHERE id = $1`, [change.id, actor === 'OPERATOR' ? 'OPERATOR' : 'MANDATE_BRAKE']).catch(() => {});
    const state = String(change?.state || 'FAILED');
    const outcome = state === 'CONFIRMED' ? 'DONE' : state === 'UNCONFIRMED' ? 'UNCONFIRMED' : 'FAILED';
    await this.log(m, {
      actor,
      action: kind === 'STATUS' ? (value === 'PAUSED' ? 'PAUSE' : 'ACTIVATE') : 'BUDGET',
      entity_type: type,
      meta_id: metaId,
      meta_campaign_id: campaignId,
      previous_value: previous ?? change?.previous_value ?? null,
      requested_value: value,
      outcome,
      message: change?.error || null,
      change_id: change?.id || null
    });
    return { state, error: change?.error || null, id: change?.id || null, http_status: change?.http_status };
  }

  // ------------------------------ operador ------------------------------

  /** Campanha (ID da Meta) a que o objeto pertence, com o orçamento e a situação locais. */
  private async entity(type: EntityType, metaId: string) {
    const sql =
      type === 'CAMPAIGN'
        ? `SELECT c.meta_campaign_id AS meta_id, c.name, c.status, c.daily_budget, c.meta_campaign_id FROM meta_campaigns c WHERE c.meta_campaign_id = $1 AND c.is_demo = FALSE LIMIT 1`
        : type === 'ADSET'
          ? `SELECT s.meta_adset_id AS meta_id, s.name, s.status, s.daily_budget, c.meta_campaign_id FROM meta_ad_sets s JOIN meta_campaigns c ON c.id = s.campaign_id WHERE s.meta_adset_id = $1 AND s.is_demo = FALSE LIMIT 1`
          : `SELECT a.meta_ad_id AS meta_id, a.name, a.status, NULL AS daily_budget, c.meta_campaign_id FROM meta_ads a JOIN meta_ad_sets s ON s.id = a.adset_id JOIN meta_campaigns c ON c.id = s.campaign_id WHERE a.meta_ad_id = $1 AND a.is_demo = FALSE LIMIT 1`;
    const r = await this.pool.query(sql, [metaId]);
    return r.rows[0] || null;
  }

  /**
   * Soma dos orçamentos diários que podem gastar (campanha ativa; orçamento da campanha ou dos conjuntos ativos).
   * `override` simula a mudança pedida. Campanha do mandato sem cópia no banco → null (não dá para conferir).
   */
  async dailyBudgetSum(mandateId: string, override?: { type: EntityType; metaId: string; status?: string; budget?: number }): Promise<number | null> {
    const camps = await this.campaigns(mandateId);
    let total = 0;
    for (const c of camps) {
      const row = (await this.pool.query(`SELECT id, meta_campaign_id, status, daily_budget FROM meta_campaigns WHERE meta_campaign_id = $1 AND is_demo = FALSE LIMIT 1`, [c.meta_campaign_id])).rows[0];
      if (!row) return null;
      const isOv = (t: EntityType, id: string) => override && override.type === t && override.metaId === String(id);
      const cStatus = isOv('CAMPAIGN', row.meta_campaign_id) && override!.status ? override!.status : String(row.status || '').toUpperCase();
      if (cStatus !== 'ACTIVE') continue;
      if (row.daily_budget !== null && row.daily_budget !== undefined) {
        total += isOv('CAMPAIGN', row.meta_campaign_id) && override!.budget !== undefined ? override!.budget! : num(row.daily_budget);
        continue;
      }
      const sets = await this.pool.query(`SELECT meta_adset_id, status, daily_budget FROM meta_ad_sets WHERE campaign_id = $1 AND is_demo = FALSE`, [row.id]);
      for (const s of sets.rows) {
        const sStatus = isOv('ADSET', s.meta_adset_id) && override!.status ? override!.status : String(s.status || '').toUpperCase();
        if (sStatus !== 'ACTIVE') continue;
        total += isOv('ADSET', s.meta_adset_id) && override!.budget !== undefined ? override!.budget! : num(s.daily_budget);
      }
    }
    return r2(total);
  }

  /** Horas desde a última subida de orçamento deste objeto (fichas de qualquer origem). null = nenhuma. */
  private async hoursSinceLastIncrease(metaId: string, now: Date): Promise<number | null> {
    const r = await this.pool.query(
      `SELECT MAX(COALESCE(sent_at, created_at)) AS at FROM meta_change_requests
       WHERE meta_id = $1 AND kind = 'DAILY_BUDGET' AND is_demo = FALSE AND state IN ('SENDING', 'CONFIRMED', 'UNCONFIRMED')
         AND CASE WHEN requested_value ~ '^[0-9]+(\\.[0-9]+)?$' AND previous_value ~ '^[0-9]+(\\.[0-9]+)?$'
                  THEN CAST(requested_value AS NUMERIC) > CAST(previous_value AS NUMERIC) ELSE FALSE END`,
      [metaId]
    );
    const at = r.rows[0]?.at;
    return at ? (now.getTime() - new Date(at).getTime()) / 3600000 : null;
  }

  /** Vendas pagas e gasto dos últimos 3 dias (hoje e os 2 anteriores, Brasília) da campanha. */
  private async recent(campaignId: string, now: Date): Promise<{ sales: number; spend: number | null }> {
    const since = spDateAgo(PROFIT_DAYS - 1, now);
    const until = spClock(now).date;
    const sales = await attributedSales(this.pool, [campaignId], spMidnightIso(since));
    let spend: number | null = null;
    try {
      spend = r2(await this.reader.spendBetween(campaignId, since, until));
    } catch {
      spend = null;
    }
    return { sales: sales.length, spend };
  }

  /** Oferta (CPA máximo) da campanha: a do mandato ou a inferida pela última conferência. */
  private async campaignMaxCpa(m: any, campaignId: string, snap: any): Promise<number | null> {
    const fromSnap = Array.isArray(snap?.campaigns) ? snap.campaigns.find((c: any) => c.meta_campaign_id === campaignId) : null;
    if (fromSnap && fromSnap.max_cpa !== null && fromSnap.max_cpa !== undefined) return num(fromSnap.max_cpa);
    const c = (await this.campaigns(m.id)).find((x) => String(x.meta_campaign_id) === campaignId);
    if (!c?.offer_human_id) return null;
    return (await this.offers([String(c.offer_human_id)])).get(String(c.offer_human_id))?.max_cpa ?? null;
  }

  /** Mudança pedida pelo operador. Lança MandateError com o motivo da recusa (já registrado no mandato). */
  async operatorWrite(
    input: { entityType: string; id: string; status?: unknown; dailyBudget?: unknown },
    now = clock()
  ): Promise<{ change: { state: string; id: string | null; error: string | null }; mandate_status: string }> {
    const type = ({ campaign: 'CAMPAIGN', adset: 'ADSET', ad: 'AD' } as Record<string, EntityType>)[String(input.entityType || '').toLowerCase()];
    const metaId = String(input.id || '');
    const isBudget = input.dailyBudget !== undefined;
    const status = isBudget ? null : String(input.status || '').toUpperCase();
    if (!type) throw new MandateError(400, 'Tipo inválido. Use campaign, adset ou ad.');
    if (!META_ID_RE.test(metaId)) throw new MandateError(400, 'ID da Meta inválido (só números).');
    if (!isBudget && status !== 'ACTIVE' && status !== 'PAUSED') throw new MandateError(400, 'Situação inválida. Use ACTIVE ou PAUSED.');
    if (isBudget && type === 'AD') throw new MandateError(400, 'Orçamento só em campanha ou conjunto.');
    const amount = isBudget ? r2(Number(input.dailyBudget)) : null;
    if (isBudget && (!Number.isFinite(amount) || (amount as number) <= 0)) throw new MandateError(400, 'Informe daily_budget_brl em reais (número maior que zero).');

    const isPause = status === 'PAUSED';
    // freio antes de qualquer escrita; pausa não espera por ele (nem por falha de leitura)
    let checked: Awaited<ReturnType<MandateService['check']>>;
    try {
      checked = await this.check(now);
    } catch (err) {
      if (!isPause) throw err;
      checked = { mandate: await this.current(), snapshot: null, error: String((err as any)?.message || err), verdict: null };
    }
    const m = checked.mandate;
    if (!m) throw new MandateError(409, 'Não há mandato. Nada foi alterado.');
    const refuse = async (code: number, msg: string, extra: Record<string, unknown> = {}): Promise<never> => {
      await this.log(m, { actor: 'OPERATOR', action: isBudget ? 'BUDGET' : isPause ? 'PAUSE' : 'ACTIVATE', entity_type: type, meta_id: metaId, requested_value: isBudget ? String(amount) : status, outcome: 'REFUSED', message: msg });
      throw new MandateError(code, msg, extra);
    };

    const ent = await this.entity(type, metaId);
    if (!ent) return refuse(404, 'Objeto não encontrado no NORQVA. Sincronize a Meta e tente de novo. Nada foi alterado.');
    const campaignId = String(ent.meta_campaign_id);
    const inMandate = (await this.campaigns(m.id)).some((c) => String(c.meta_campaign_id) === campaignId);
    if (!inMandate) return refuse(403, 'Esta campanha não está no mandato. O operador só mexe nas campanhas da lista. Nada foi alterado.');

    if (isPause) {
      const ch = await withPlanLock(this.pool, `mandate:${m.id}`, () => this.execute(m, 'OPERATOR', type, metaId, campaignId, 'STATUS', 'PAUSED', ent.status ? String(ent.status).toUpperCase() : null));
      return { change: ch, mandate_status: m.status };
    }

    if (m.status !== 'ACTIVE') {
      return refuse(409, m.status === 'BRAKED' ? `Mandato com freio acionado (${m.stop_reason || 'sem motivo'}). Só pausar é permitido.` : 'Mandato encerrado. Só pausar é permitido.');
    }
    if (checked.error || !checked.snapshot) {
      return refuse(503, 'Não foi possível conferir o gasto do mandato na Meta agora. Só pausar é permitido até a leitura voltar.');
    }
    if (isQuietHours(now)) return refuse(409, 'Das 22h às 8h (Brasília) só pausar é permitido.');

    return withPlanLock(this.pool, `mandate:${m.id}`, async () => {
      const cap = num(m.daily_cap_brl);
      if (!isBudget) {
        // ativar: a soma dos orçamentos com este objeto ativo precisa caber no teto diário
        const sum = await this.dailyBudgetSum(m.id, { type, metaId, status: 'ACTIVE' });
        if (sum === null) return refuse(409, 'Há campanha do mandato que o NORQVA ainda não sincronizou. Sincronize a Meta antes de ativar.');
        if (sum > cap + 0.005) return refuse(409, `Ativar deixaria a soma dos orçamentos diários em ${brl(sum)}, acima do teto do mandato (${brl(cap)}/dia).`);
        const ch = await this.execute(m, 'OPERATOR', type, metaId, campaignId, 'STATUS', 'ACTIVE', ent.status ? String(ent.status).toUpperCase() : null);
        return { change: ch, mandate_status: m.status };
      }

      const previous = ent.daily_budget === null || ent.daily_budget === undefined ? null : num(ent.daily_budget);
      if (previous === null) return refuse(400, 'Este objeto não tem orçamento diário próprio (o orçamento fica no outro nível). Nada foi alterado.');
      const value = amount as number;
      if (value > previous + 0.005) {
        const sum = await this.dailyBudgetSum(m.id, { type, metaId, budget: value });
        if (sum === null) return refuse(409, 'Há campanha do mandato que o NORQVA ainda não sincronizou. Sincronize a Meta antes de subir orçamento.');
        if (sum > cap + 0.005) return refuse(409, `Com essa subida a soma dos orçamentos diários iria a ${brl(sum)}, acima do teto do mandato (${brl(cap)}/dia).`);
        const why = judgeIncrease({
          previous,
          next: value,
          hoursSinceLastIncrease: await this.hoursSinceLastIncrease(metaId, now),
          recent: await this.recent(campaignId, now),
          maxCpa: await this.campaignMaxCpa(m, campaignId, checked.snapshot),
          minSales: num(m.min_sales) || MANDATE_DEFAULTS.min_sales
        });
        if (why) return refuse(409, why);
      }
      const ch = await this.execute(m, 'OPERATOR', type, metaId, campaignId, 'DAILY_BUDGET', value.toFixed(2), previous.toFixed(2));
      return { change: ch, mandate_status: m.status };
    });
  }

  // ------------------------------ administrador ------------------------------

  private async validateCampaigns(list: unknown): Promise<Array<{ meta_campaign_id: string; offer_human_id: string | null; name: string | null }>> {
    if (!Array.isArray(list) || list.length === 0) throw new MandateError(400, 'Informe ao menos uma campanha do mandato.');
    if (list.length > MAX_CAMPAIGNS) throw new MandateError(400, `No máximo ${MAX_CAMPAIGNS} campanhas.`);
    const out: Array<{ meta_campaign_id: string; offer_human_id: string | null; name: string | null }> = [];
    const seen = new Set<string>();
    for (const item of list) {
      const id = String(typeof item === 'object' && item ? (item as any).meta_campaign_id : item || '').trim();
      const offer = typeof item === 'object' && item && (item as any).offer_human_id ? String((item as any).offer_human_id).trim() : null;
      if (!META_ID_RE.test(id)) throw new MandateError(400, `ID de campanha inválido: "${id.slice(0, 30)}" (só números).`);
      if (seen.has(id)) continue;
      seen.add(id);
      const c = await this.pool.query(`SELECT name FROM meta_campaigns WHERE meta_campaign_id = $1 AND is_demo = FALSE LIMIT 1`, [id]);
      if (!c.rows.length) throw new MandateError(400, `A campanha ${id} ainda não está no NORQVA. Sincronize a Meta e tente de novo.`);
      if (offer) {
        const o = await this.pool.query(`SELECT 1 FROM offers WHERE human_id = $1 LIMIT 1`, [offer]);
        if (!o.rows.length) throw new MandateError(400, `Oferta ${offer.slice(0, 40)} não encontrada.`);
      }
      out.push({ meta_campaign_id: id, offer_human_id: offer, name: c.rows[0].name || null });
    }
    return out;
  }

  private async saveCampaigns(mandateId: string, list: Array<{ meta_campaign_id: string; offer_human_id: string | null; name: string | null }>, userId: string | null) {
    await this.pool.query(`UPDATE operator_mandate_campaigns SET removed_at = NOW(), updated_at = NOW() WHERE mandate_id = $1 AND removed_at IS NULL AND NOT (meta_campaign_id = ANY($2::text[]))`, [
      mandateId,
      list.map((c) => c.meta_campaign_id)
    ]);
    for (const c of list) {
      await this.pool.query(
        `INSERT INTO operator_mandate_campaigns (mandate_id, meta_campaign_id, name, offer_human_id, added_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (mandate_id, meta_campaign_id) DO UPDATE SET removed_at = NULL, name = EXCLUDED.name, offer_human_id = EXCLUDED.offer_human_id, updated_at = NOW()`,
        [mandateId, c.meta_campaign_id, c.name, c.offer_human_id, userId]
      );
    }
  }

  private numberIn(v: unknown, def: number, min: number, max: number, label: string): number {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new MandateError(400, `${label} fora do limite (${min} a ${max}).`);
    return n;
  }

  /** Cria e ativa um mandato (com os números do contrato como padrão). Só um em vigor por vez. */
  async create(user: { id?: string | null; name?: string | null }, body: any) {
    const live = await this.pool.query(`SELECT id, status FROM operator_mandates WHERE status IN ('ACTIVE', 'BRAKED') LIMIT 1`);
    if (live.rows.length) throw new MandateError(409, 'Já existe um mandato em vigor. Encerre-o antes de criar outro.');
    const camps = await this.validateCampaigns(body?.campaigns);
    const capital = this.numberIn(body?.capital_brl, MANDATE_DEFAULTS.capital_brl, 10, 100000, 'Capital');
    const dailyCap = this.numberIn(body?.daily_cap_brl, MANDATE_DEFAULTS.daily_cap_brl, 5, 10000, 'Teto diário');
    const days = Math.round(this.numberIn(body?.days, MANDATE_DEFAULTS.days, 1, 90, 'Prazo em dias'));
    const brakeSpend = this.numberIn(body?.brake_spend_brl, MANDATE_DEFAULTS.brake_spend_brl, 1, capital, 'Gasto do freio');
    const brakeLoss = this.numberIn(body?.brake_loss_brl, MANDATE_DEFAULTS.brake_loss_brl, 1, capital, 'Prejuízo do freio');
    const minSales = Math.round(this.numberIn(body?.min_sales, MANDATE_DEFAULTS.min_sales, 1, 100, 'Vendas mínimas'));
    const userId = user.id && UUID_RE.test(String(user.id)) ? String(user.id) : null;
    const ins = await this.pool.query(
      `INSERT INTO operator_mandates (name, status, capital_brl, daily_cap_brl, days, brake_spend_brl, brake_loss_brl, min_sales, activated_at, ends_at, created_by)
       VALUES ($1, 'ACTIVE', $2, $3, $4, $5, $6, $7, NOW(), NOW() + ($4::int * INTERVAL '1 day'), $8) RETURNING *`,
      [String(body?.name || 'Mandato Trattoria').slice(0, 120), capital, dailyCap, days, brakeSpend, brakeLoss, minSales, userId]
    );
    const m = ins.rows[0];
    await this.saveCampaigns(m.id, camps, userId);
    await writeAuditLog(this.pool, userId, 'OPERATOR_MANDATE_CREATED', `Mandato "${m.name}" ativado por ${user.name || 'administrador'}: capital ${brl(capital)}, teto ${brl(dailyCap)}/dia, ${days} dias, campanhas ${camps.map((c) => c.meta_campaign_id).join(', ')}.`, null, 'ACTIVE');
    await this.log(m, { actor: 'ADMIN', action: 'CREATE', outcome: 'DONE', message: `Ativado por ${user.name || 'administrador'}` });
    return this.view();
  }

  async updateCampaigns(user: { id?: string | null; name?: string | null }, body: any) {
    const m = await this.current();
    if (!m || m.status === 'ENDED') throw new MandateError(409, 'Não há mandato em vigor.');
    const camps = await this.validateCampaigns(body?.campaigns);
    const userId = user.id && UUID_RE.test(String(user.id)) ? String(user.id) : null;
    await this.saveCampaigns(m.id, camps, userId);
    await writeAuditLog(this.pool, userId, 'OPERATOR_MANDATE_CAMPAIGNS', `Campanhas do mandato "${m.name}" alteradas por ${user.name || 'administrador'}: ${camps.map((c) => c.meta_campaign_id).join(', ')}.`);
    await this.log(m, { actor: 'ADMIN', action: 'CAMPAIGNS', outcome: 'DONE', message: camps.map((c) => `${c.meta_campaign_id}${c.offer_human_id ? ` (${c.offer_human_id})` : ''}`).join(', ') });
    return this.view();
  }

  /** "Encerrar mandato": pausa as campanhas do mandato e encerra. */
  async end(user: { id?: string | null; name?: string | null }) {
    const m0 = await this.current();
    if (!m0 || m0.status === 'ENDED') throw new MandateError(409, 'Não há mandato em vigor.');
    const userId = user.id && UUID_RE.test(String(user.id)) ? String(user.id) : null;
    await withPlanLock(this.pool, `mandate:${m0.id}`, async () => {
      const r = await this.pool.query(
        `UPDATE operator_mandates SET status = 'ENDED', stopped_at = COALESCE(stopped_at, NOW()), stop_code = COALESCE(stop_code, 'ADMIN'),
                stop_reason = COALESCE(stop_reason, $2), ended_by = $3, pause_pending = TRUE, updated_at = NOW()
         WHERE id = $1 AND status <> 'ENDED' RETURNING *`,
        [m0.id, `Encerrado por ${user.name || 'administrador'}.`, userId]
      );
      if (!r.rows.length) return;
      await writeAuditLog(this.pool, userId, 'OPERATOR_MANDATE_ENDED', `Mandato "${m0.name}" encerrado por ${user.name || 'administrador'}. Campanhas do mandato pausadas.`, m0.status, 'ENDED');
      await this.log(m0, { actor: 'ADMIN', action: 'END', outcome: 'DONE', message: `Encerrado por ${user.name || 'administrador'}` });
      await this.pauseAll(r.rows[0], 'ADMIN');
    });
    return this.view();
  }

  async actions(limit = 100) {
    const m = await this.current();
    if (!m) return { actions: [] };
    const r = await this.pool.query(`SELECT * FROM operator_mandate_actions WHERE mandate_id = $1 ORDER BY created_at DESC LIMIT $2`, [m.id, Math.min(Math.max(limit, 1), 500)]);
    return { actions: r.rows };
  }

  /** Visão do mandato (operador e tela). Usa a última conferência gravada; não chama a Meta. */
  async view(now = clock(), fresh?: { snapshot: any | null; error: string | null }) {
    const m = await this.current();
    if (!m) return { mandate: null };
    const snap = fresh?.snapshot ?? m.last_snapshot ?? null;
    const capital = num(m.capital_brl);
    const spent = snap ? num(snap.spent) : null;
    const msLeft = new Date(m.ends_at).getTime() - now.getTime();
    const campaigns = await this.campaigns(m.id);
    const sum = await this.dailyBudgetSum(m.id).catch(() => null);
    return {
      mandate: {
        id: m.id,
        name: m.name,
        status: m.status,
        activated_at: m.activated_at,
        ends_at: m.ends_at,
        days_left: m.status === 'ACTIVE' ? Math.max(0, Math.ceil(msLeft / 86400000)) : 0,
        capital_brl: capital,
        daily_cap_brl: num(m.daily_cap_brl),
        daily_budget_sum_brl: sum,
        spent_brl: spent,
        remaining_brl: spent === null ? null : r2(Math.max(0, capital - spent)),
        net_revenue_brl: snap ? num(snap.net_revenue) : null,
        paid_sales: snap ? Number(snap.paid_sales) || 0 : null,
        result_brl: snap ? num(snap.result) : null,
        rules: {
          brake_spend_brl: num(m.brake_spend_brl),
          brake_loss_brl: num(m.brake_loss_brl),
          min_sales: Number(m.min_sales),
          increase_max_pct: INCREASE_MAX_PCT,
          increase_min_hours: INCREASE_MIN_HOURS,
          profit_days: PROFIT_DAYS,
          profit_cpa_factor: PROFIT_CPA_FACTOR,
          quiet_hours: '22:00–08:00 (Brasília): só pausar',
          tax_pct: taxPct(),
          fixed_fee_brl: fixedFee()
        },
        brake: {
          state: m.status === 'BRAKED' ? 'ACIONADO' : m.status === 'ENDED' ? 'ENCERRADO' : 'LIVRE',
          code: m.stop_code || null,
          reason: m.stop_reason || null,
          at: m.stopped_at || null,
          pause_pending: Boolean(m.pause_pending),
          any_offer_qualifies: snap ? Boolean(snap.any_offer_qualifies) : null
        },
        last_check_at: m.last_check_at || null,
        last_check_error: fresh?.error ?? m.last_check_error ?? null,
        offers: snap?.offers || [],
        campaigns: campaigns.map((c) => {
          const s = Array.isArray(snap?.campaigns) ? snap.campaigns.find((x: any) => x.meta_campaign_id === String(c.meta_campaign_id)) : null;
          return {
            meta_campaign_id: String(c.meta_campaign_id),
            name: c.name || null,
            status: c.status || null,
            offer_human_id: c.offer_human_id || s?.offer_human_id || null,
            offer_source: c.offer_human_id ? 'CONFIGURED' : s?.offer_source || null,
            max_cpa: s?.max_cpa ?? null,
            spend: s?.spend ?? null,
            paid_sales: s?.paid_sales ?? null,
            net_revenue: s?.net_revenue ?? null,
            cpa: s?.cpa ?? null
          };
        }),
        sources: { spend: 'Meta (ao vivo, na última conferência)', sales: 'Pedidos PAID confirmados pelo Asaas, atribuídos às campanhas do mandato' }
      }
    };
  }

  // ------------------------------ relatório do operador ------------------------------

  async report(daysIn: unknown, now = clock()) {
    const m = await this.current();
    if (!m) throw new MandateError(404, 'Não há mandato.');
    const days = Math.min(Math.max(Math.round(Number(daysIn) || 7), 1), 31);
    const since = spDateAgo(days - 1, now);
    const until = spClock(now).date;
    const camps = await this.campaigns(m.id);
    const ids = camps.map((c) => String(c.meta_campaign_id));
    const sales = await attributedSales(this.pool, ids, spMidnightIso(since));
    const offerIds = Array.from(new Set(camps.map((c) => c.offer_human_id).filter(Boolean).map(String)));
    const snapCamps: any[] = Array.isArray(m.last_snapshot?.campaigns) ? m.last_snapshot.campaigns : [];
    for (const s of snapCamps) if (s.offer_human_id && !offerIds.includes(s.offer_human_id)) offerIds.push(String(s.offer_human_id));
    const offers = await this.offers(offerIds);

    const conv = (actions: any): number => {
      if (!Array.isArray(actions)) return 0;
      const a = actions.find((x: any) => x?.action_type === 'onsite_conversion.messaging_conversation_started_7d');
      return a ? num(a.value) : 0;
    };
    const blank = () => ({ spend: 0, impressions: 0, clicks: 0, link_clicks: 0, conversations: 0 });
    const addMeta = (t: any, row: any) => {
      t.spend = r2(t.spend + num(row.spend));
      t.impressions += num(row.impressions);
      t.clicks += num(row.clicks);
      t.link_clicks += num(row.inline_link_clicks);
      t.conversations += conv(row.actions);
    };
    const confirmed = (list: AttributedSale[]) => ({ paid_sales: list.length, net_revenue: r2(list.reduce((t, s) => t + s.net, 0)) });
    const withCpa = (meta: any, conf: any, max: number | null) => {
      const cpa = conf.paid_sales ? r2(meta.spend / conf.paid_sales) : null;
      return { cpa, max_cpa: max, cpa_within_max: cpa === null || max === null ? null : cpa <= max + 0.005 };
    };

    const out: any[] = [];
    for (const c of camps) {
      const cid = String(c.meta_campaign_id);
      const offerId = c.offer_human_id || snapCamps.find((s) => s.meta_campaign_id === cid)?.offer_human_id || null;
      const max = offerId ? offers.get(String(offerId))?.max_cpa ?? null : null;
      const mine = sales.filter((s) => s.meta_campaign_id === cid);
      let rows: any[] = [];
      let metaError: string | null = null;
      let truncated = false;
      try {
        const r = await this.reader.adInsightsDaily(cid, since, until);
        rows = r.rows;
        truncated = r.truncated;
      } catch (err: any) {
        metaError = String(err?.message || err).slice(0, 300);
      }
      let hourly: any[] | null = null;
      try {
        hourly = (await this.reader.hourly(cid, since, until)).map((h: any) => ({
          hour: String(h.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 5),
          spend: r2(num(h.spend)),
          impressions: num(h.impressions),
          clicks: num(h.clicks),
          conversations: conv(h.actions)
        }));
      } catch {
        hourly = null;
      }
      const meta = blank();
      const byDay = new Map<string, any>();
      const adsets = new Map<string, any>();
      for (const row of rows) {
        addMeta(meta, row);
        const d = String(row.date_start || '').slice(0, 10);
        if (!byDay.has(d)) byDay.set(d, blank());
        addMeta(byDay.get(d), row);
        const sid = String(row.adset_id || '');
        if (!adsets.has(sid)) adsets.set(sid, { meta_adset_id: sid, name: row.adset_name || null, meta: blank(), ads: new Map<string, any>() });
        const s = adsets.get(sid);
        addMeta(s.meta, row);
        const aid = String(row.ad_id || '');
        if (!s.ads.has(aid)) s.ads.set(aid, { meta_ad_id: aid, name: row.ad_name || null, meta: blank() });
        addMeta(s.ads.get(aid).meta, row);
      }
      const days_ = Array.from(new Set([...Array.from(byDay.keys()), ...mine.map((s) => s.sp_date)])).sort();
      const conf = confirmed(mine);
      out.push({
        meta_campaign_id: cid,
        name: c.name || null,
        status: c.status || null,
        offer: offerId ? { human_id: offerId, price: offers.get(String(offerId))?.price ?? null, max_cpa: max } : null,
        meta,
        confirmed: conf,
        ...withCpa(meta, conf, max),
        meta_error: metaError,
        meta_truncated: truncated,
        by_day: days_.map((d) => {
          const dm = byDay.get(d) || blank();
          const dc = confirmed(mine.filter((s) => s.sp_date === d));
          return { date: d, meta: dm, confirmed: dc, ...withCpa(dm, dc, max) };
        }),
        adsets: Array.from(adsets.values()).map((s) => {
          const sc = confirmed(mine.filter((x) => x.meta_adset_id === s.meta_adset_id));
          return {
            meta_adset_id: s.meta_adset_id,
            name: s.name,
            meta: s.meta,
            confirmed: sc,
            ...withCpa(s.meta, sc, max),
            ads: Array.from(s.ads.values()).map((a: any) => {
              const ac = confirmed(mine.filter((x) => x.meta_ad_id === a.meta_ad_id));
              return { ...a, confirmed: ac, ...withCpa(a.meta, ac, max) };
            })
          };
        }),
        sales_without_ad: mine.filter((s) => !s.meta_ad_id).length,
        by_hour: hourly
      });
    }
    return {
      window: { since, until, days, timezone: 'America/Sao_Paulo' },
      sources: {
        meta: 'Gasto, impressões, cliques e conversas: Meta (ao vivo; pode mudar nas próximas horas).',
        confirmed: 'Vendas e receita líquida: pedidos PAID confirmados pelo Asaas, atribuídos à campanha (código do plano, ID do anúncio ou da campanha). Receita líquida = valor − imposto − tarifa do Asaas.',
        by_hour: 'Por hora do dia no fuso da conta de anúncios (só Meta), somado no período.'
      },
      campaigns: out
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Agendador do freio (a cada 15 min)
// ---------------------------------------------------------------------------------------------

export const MANDATE_TICK_MIN = 15;

export function startMandateBrakeScheduler(pool: Pool): () => void {
  if (process.env.NODE_ENV === 'test') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await new MandateService(pool).check();
      if (r.verdict?.stop) console.log('[MANDATE] freio:', r.verdict.code, r.verdict.reason);
      if (r.error) console.warn('[MANDATE] leitura falhou:', r.error);
    } catch (err: any) {
      console.error('[MANDATE] conferência falhou', err?.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 60 * 1000);
  const every = setInterval(tick, MANDATE_TICK_MIN * 60 * 1000);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
