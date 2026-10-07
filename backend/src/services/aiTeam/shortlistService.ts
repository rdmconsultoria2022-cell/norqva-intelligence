import { Pool } from 'pg';
import { CampaignIntelligenceService, IntelClass, IntelRow } from '../intelligence/campaignIntelligenceService';
import { OpportunityService, OpportunityError } from './opportunityService';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0021 (P1): automatic shortlist. Picks up to N (default 30) campaigns and ads from the
// "Base de campanhas" ranking using visible criteria, so the operator can send them to the Time de IAs.
// Read-only towards Meta: nothing here calls the Meta API or changes any campaign.

export type ShortlistLevel = 'campaign' | 'ad';
export const SHORTLIST_LEVELS: ShortlistLevel[] = ['campaign', 'ad'];
const ALL_CLASSES: IntelClass[] = ['VENCEDOR', 'PROMISSOR', 'TESTANDO', 'PERDEDOR', 'SEM_DADOS'];
export const SHORTLIST_MAX = 50;

export interface ShortlistCriteria {
  limit: number;
  levels: ShortlistLevel[];
  classes: IntelClass[];
  min_spend: number;
  min_impressions: number;
  min_days: number;
  /** CPA / breakeven ceiling for entities with sales (null = no ceiling). */
  max_cpa_ratio: number | null;
  require_product: boolean;
}

export const DEFAULT_CRITERIA: ShortlistCriteria = {
  limit: 30,
  levels: ['campaign', 'ad'],
  classes: ['VENCEDOR', 'PROMISSOR', 'TESTANDO'],
  min_spend: 10,
  min_impressions: 500,
  min_days: 2,
  max_cpa_ratio: 1.5,
  require_product: false
};

export const EXCLUSION_LABELS: Record<string, string> = {
  CLASS: 'Classe fora dos critérios',
  MIN_SPEND: 'Investimento abaixo do mínimo',
  MIN_IMPRESSIONS: 'Poucas impressões',
  MIN_DAYS: 'Poucos dias no ar',
  CPA_RATIO: 'CPA acima do teto em relação ao equilíbrio',
  NO_PRODUCT: 'Sem produto identificado',
  LIMIT: 'Fora do limite de candidatos'
};

const num = (v: unknown, def: number, lo: number, hi: number) => {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
};
const csv = (v: unknown): string[] | null => {
  if (v === undefined || v === null || v === '') return null;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map(x => String(x).trim()).filter(Boolean);
};

/** Builds criteria from query/body values, falling back to the defaults and clamping every number. */
export function parseCriteria(q: Record<string, unknown> = {}): ShortlistCriteria {
  const levels = (csv(q.levels) || DEFAULT_CRITERIA.levels).filter((l): l is ShortlistLevel => SHORTLIST_LEVELS.includes(l as ShortlistLevel));
  const classes = (csv(q.classes) || DEFAULT_CRITERIA.classes).map(c => c.toUpperCase()).filter((c): c is IntelClass => ALL_CLASSES.includes(c as IntelClass));
  const ratioRaw = q.max_cpa_ratio;
  const max_cpa_ratio =
    ratioRaw === 'none' || ratioRaw === 'null' ? null : ratioRaw === undefined || ratioRaw === '' ? DEFAULT_CRITERIA.max_cpa_ratio : num(ratioRaw, 1.5, 0.1, 10);
  return {
    limit: Math.round(num(q.limit, DEFAULT_CRITERIA.limit, 1, SHORTLIST_MAX)),
    levels: levels.length ? [...new Set(levels)] : DEFAULT_CRITERIA.levels,
    classes: classes.length ? [...new Set(classes)] : DEFAULT_CRITERIA.classes,
    min_spend: num(q.min_spend, DEFAULT_CRITERIA.min_spend, 0, 100000),
    min_impressions: Math.round(num(q.min_impressions, DEFAULT_CRITERIA.min_impressions, 0, 10_000_000)),
    min_days: Math.round(num(q.min_days, DEFAULT_CRITERIA.min_days, 0, 365)),
    max_cpa_ratio,
    require_product: q.require_product === true || q.require_product === 'true' || q.require_product === '1'
  };
}

export interface ShortlistCandidate {
  rank: number;
  level: ShortlistLevel;
  key: string;
  name: string;
  meta_id: string | null;
  status: string | null;
  campaign_name: string | null;
  product_name: string | null;
  classification: IntelClass;
  score: number;
  confidence: number;
  days_active: number;
  first_date: string | null;
  spend: number;
  impressions: number;
  landing_page_views: number;
  sales: number;
  revenue: number;
  cpa: number | null;
  breakeven_cpa: number | null;
  roas: number | null;
  ctr_link: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  reason: string;
  why: string[];
  flags: string[];
  opportunity: { id: string; human_id: string; status: string } | null;
}

export interface ShortlistResponse {
  criteria: ShortlistCriteria;
  candidates: ShortlistCandidate[];
  pool: { campaign: number; ad: number };
  excluded: { total: number; by_reason: Record<string, number> };
  note: string | null;
}

/** Returns the first rule a row fails, or null when it qualifies. */
export function exclusionReason(r: IntelRow, c: ShortlistCriteria): string | null {
  if (!c.classes.includes(r.classification)) return 'CLASS';
  if (r.totals.spend < c.min_spend) return 'MIN_SPEND';
  if (r.totals.impressions < c.min_impressions) return 'MIN_IMPRESSIONS';
  if ((r.days_active ?? 0) < c.min_days) return 'MIN_DAYS';
  const B = r.metrics.breakeven_cpa;
  if (c.max_cpa_ratio !== null && r.metrics.cpa !== null && B && B > 0 && r.metrics.cpa > B * c.max_cpa_ratio) return 'CPA_RATIO';
  if (c.require_product && !r.product_id) return 'NO_PRODUCT';
  return null;
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function explain(r: IntelRow): { why: string[]; flags: string[] } {
  const why: string[] = [];
  const flags: string[] = [];
  const m = r.metrics;
  const t = r.totals;
  const B = m.breakeven_cpa;
  if (t.sales > 0) why.push(`${t.sales} venda(s), receita ${brl(t.revenue)}`);
  if (m.cpa !== null && B) why.push(`CPA ${brl(m.cpa)} vs equilíbrio ${brl(B)}`);
  if (m.roas !== null && t.spend > 0) why.push(`ROAS ${m.roas}`);
  if (m.ctr_link !== null) why.push(`CTR de link ${m.ctr_link.toFixed(2).replace('.', ',')}%`);
  if (m.hook_rate) why.push(`hook ${m.hook_rate.toFixed(1).replace('.', ',')}%`);
  why.push(`${r.days_active ?? 0} dia(s) no ar, ${brl(t.spend)} investidos`);

  if (r.confidence < 0.5) flags.push('Pouca confiança: gasto baixo para concluir');
  if (t.sales === 0) flags.push('Sem venda no período');
  if (m.cpa !== null && B && m.cpa > B) flags.push('CPA acima do equilíbrio');
  if (!r.product_id) flags.push('Produto não identificado');
  if (r.status && r.status !== 'ACTIVE') flags.push(`Status na Meta: ${r.status}`);
  return { why, flags };
}

export class ShortlistService {
  constructor(private intel = new CampaignIntelligenceService(), private opportunities = new OpportunityService()) {}

  private async openOpportunities(pool: Pool, isDemo: boolean) {
    const r = await pool.query(
      `SELECT id, human_id, status, source_level, source_ref FROM campaign_opportunities
       WHERE is_demo = $1 AND source = 'ACCOUNT' AND status <> 'DESCARTADA'`,
      [isDemo]
    );
    const map = new Map<string, { id: string; human_id: string; status: string }>();
    for (const o of r.rows) map.set(`${o.source_level}:${o.source_ref}`, { id: String(o.id), human_id: o.human_id, status: o.status });
    return map;
  }

  async build(pool: Pool, criteria: ShortlistCriteria, opts: { date_from?: string; date_to?: string; is_demo: boolean }): Promise<ShortlistResponse> {
    const bases = await Promise.all(
      criteria.levels.map(level => this.intel.getCampaignBase(pool, { level, date_from: opts.date_from, date_to: opts.date_to, is_demo: opts.is_demo }))
    );
    const open = await this.openOpportunities(pool, opts.is_demo);
    const poolCount = { campaign: 0, ad: 0 };
    const byReason: Record<string, number> = {};
    const qualified: IntelRow[] = [];
    bases.forEach(b => {
      poolCount[b.level as ShortlistLevel] = b.rows.length;
      for (const r of b.rows) {
        const why = exclusionReason(r, criteria);
        if (why) byReason[why] = (byReason[why] || 0) + 1;
        else qualified.push(r);
      }
    });
    qualified.sort((a, b) => b.score - a.score || b.totals.sales - a.totals.sales || b.totals.revenue - a.totals.revenue || b.totals.spend - a.totals.spend);
    const picked = qualified.slice(0, criteria.limit);
    if (qualified.length > picked.length) byReason.LIMIT = qualified.length - picked.length;

    const candidates: ShortlistCandidate[] = picked.map((r, i) => {
      const { why, flags } = explain(r);
      return {
        rank: i + 1,
        level: r.level as ShortlistLevel,
        key: r.key,
        name: r.name,
        meta_id: r.meta_id,
        status: r.status,
        campaign_name: r.campaign_name,
        product_name: r.product_name,
        classification: r.classification,
        score: r.score,
        confidence: r.confidence,
        days_active: r.days_active ?? 0,
        first_date: r.first_date ?? null,
        spend: r.totals.spend,
        impressions: r.totals.impressions,
        landing_page_views: r.totals.landing_page_views,
        sales: r.totals.sales,
        revenue: r.totals.revenue,
        cpa: r.metrics.cpa,
        breakeven_cpa: r.metrics.breakeven_cpa,
        roas: r.metrics.roas,
        ctr_link: r.metrics.ctr_link,
        hook_rate: r.metrics.hook_rate,
        hold_rate: r.metrics.hold_rate,
        reason: r.reason,
        why,
        flags,
        opportunity: open.get(`${r.level}:${r.key}`) || null
      };
    });

    const total = Object.values(byReason).reduce((s, n) => s + n, 0);
    const note =
      candidates.length < criteria.limit
        ? `Só ${candidates.length} de ${criteria.limit} candidatos passaram nos critérios. A base tem ${poolCount.campaign} campanha(s) e ${poolCount.ad} anúncio(s) no período; afrouxe os critérios ou amplie o período para ver mais.`
        : null;
    return { criteria, candidates, pool: poolCount, excluded: { total, by_reason: byReason }, note };
  }

  /**
   * Operator action: creates one Time de IAs opportunity per selected item (skips items that already
   * have an open opportunity). Does not fire Claude and does not touch Meta.
   */
  async send(pool: Pool, items: unknown, criteria: ShortlistCriteria | null, userId: string | null, isDemo: boolean) {
    if (!Array.isArray(items) || items.length === 0) throw new OpportunityError(400, 'Selecione ao menos um candidato.');
    if (items.length > SHORTLIST_MAX) throw new OpportunityError(400, `Envie no máximo ${SHORTLIST_MAX} candidatos por vez.`);
    const open = await this.openOpportunities(pool, isDemo);
    const created: { key: string; level: ShortlistLevel; human_id: string; id: string }[] = [];
    const skipped: { key: string; level: string; reason: string }[] = [];
    const seen = new Set<string>();
    for (const raw of items) {
      const level = String((raw as any)?.level || '') as ShortlistLevel;
      const key = String((raw as any)?.key || '').trim();
      if (!SHORTLIST_LEVELS.includes(level) || !key) {
        skipped.push({ key, level, reason: 'Item inválido.' });
        continue;
      }
      const id = `${level}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const existing = open.get(id);
      if (existing) {
        skipped.push({ key, level, reason: `Já existe a oportunidade ${existing.human_id}.` });
        continue;
      }
      try {
        const o = await this.opportunities.create(pool, { source: 'ACCOUNT', source_level: level, source_ref: key }, userId, isDemo);
        created.push({ key, level, human_id: o.human_id, id: String(o.id) });
      } catch (err: any) {
        if (err instanceof OpportunityError) skipped.push({ key, level, reason: err.message });
        else throw err;
      }
    }
    if (created.length) {
      const detail = `${created.length} candidato(s) enviados ao Time de IAs: ${created.map(c => c.human_id).join(', ')}` + (criteria ? ` · critérios ${JSON.stringify(criteria)}` : '');
      await writeAuditLog(pool, userId, 'SHORTLIST_SENT_TO_AI_TEAM', detail.slice(0, 2000), null, null, isDemo).catch(() => {});
    }
    return { created, skipped };
  }
}
