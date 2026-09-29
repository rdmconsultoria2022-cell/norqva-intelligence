import { Pool } from 'pg';
import { RoutineFirer, defaultRoutineFirer, routineConfigured } from '../creative/adjustmentService';
import { CreativeFactoryService } from '../creative/creativeFactoryService';
import { CampaignIntelligenceService, IntelLevel, INTEL_LEVELS } from '../intelligence/campaignIntelligenceService';
import { MarketEuService } from '../marketIntelligence/marketEuService';
import { breakevenByProduct } from '../alerts/adAlertService';
import { writeAuditLog } from '../../db/audit';
import { CreativeBatch, BatchCreative } from '../../data/creativeBatches';
import { SecondOpinionProvider, gptSecondOpinion } from './gptSecondOpinion';

// NORQVA-0017 (fase 3): AI team. An opportunity (from our account ranking, the EU market or a manual brief)
// is evaluated by Claude (routine) with a GPT second opinion, then Claude builds a campaign plan whose
// creatives become a DRAFT batch in the Creative Factory. The owner approves. AIs never touch Meta.

export class OpportunityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const OPP_STATUSES = ['CAPTADA', 'EM_AVALIACAO', 'AVALIADA', 'EM_PLANEJAMENTO', 'PLANO_PRONTO', 'APROVADA', 'DESCARTADA'] as const;
const VERDICTS = ['SEGUIR', 'TESTAR', 'DESCARTAR'] as const;
const FORMATS = ['VIDEO', 'IMAGE', 'CAROUSEL'] as const;
const PUBLIC_API = () => (process.env.NORQVA_PUBLIC_API_URL || 'https://norqva-staging-api.onrender.com').replace(/\/+$/, '');

const clip = (v: unknown, n: number) => (v === undefined || v === null ? null : String(v).trim().slice(0, n) || null);
const list = (v: unknown, n: number, each = 400) => (Array.isArray(v) ? v.map(x => String(x).trim().slice(0, each)).filter(Boolean).slice(0, n) : []);

export interface CreateOpportunityInput {
  title?: string;
  source: 'ACCOUNT' | 'EU_MARKET' | 'MANUAL';
  source_level?: IntelLevel;
  source_ref?: string;
  product_id?: string | null;
  market_niche_id?: string | null;
  brief?: string | null;
}

export class OpportunityService {
  constructor(
    private firer: RoutineFirer = defaultRoutineFirer,
    private secondOpinion: SecondOpinionProvider = gptSecondOpinion,
    private factory = new CreativeFactoryService(),
    private intel = new CampaignIntelligenceService(),
    private market = new MarketEuService()
  ) {}

  async list(pool: Pool, isDemo: boolean) {
    const r = await pool.query(
      `SELECT o.*, p.name AS product_name, n.name AS niche_name
       FROM campaign_opportunities o
       LEFT JOIN products p ON p.id = o.product_id
       LEFT JOIN market_niches n ON n.id = o.market_niche_id
       WHERE o.is_demo = $1 ORDER BY o.updated_at DESC LIMIT 200`,
      [isDemo]
    );
    return r.rows;
  }

  async get(pool: Pool, id: string) {
    const r = await pool.query(`SELECT * FROM campaign_opportunities WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new OpportunityError(404, 'Oportunidade não encontrada.');
    return r.rows[0];
  }

  /** Creates an opportunity with a snapshot of the evidence it came from. */
  async create(pool: Pool, input: CreateOpportunityInput, userId: string | null, isDemo: boolean) {
    if (!['ACCOUNT', 'EU_MARKET', 'MANUAL'].includes(input.source)) throw new OpportunityError(400, 'Origem inválida.');
    let evidence: any = null;
    let title = clip(input.title, 200);
    let productId = input.product_id || null;
    let nicheId = input.market_niche_id || null;

    if (input.source === 'ACCOUNT') {
      const level = (input.source_level || 'campaign') as IntelLevel;
      if (!INTEL_LEVELS.includes(level) || !input.source_ref) throw new OpportunityError(400, 'Informe o nível e o item da Base de campanhas.');
      const base = await this.intel.getCampaignBase(pool, { level, is_demo: isDemo });
      const row = base.rows.find(r => r.key === input.source_ref);
      if (!row) throw new OpportunityError(404, 'Item não encontrado na Base de campanhas.');
      evidence = { kind: 'ACCOUNT', level, row, account_summary: base.summary, top: base.rows.slice(0, 5).map(r => ({ name: r.name, score: r.score, classification: r.classification })) };
      title = title || `${row.name} (${level})`;
      productId = productId || row.product_id || null;
    } else if (input.source === 'EU_MARKET') {
      if (!nicheId) throw new OpportunityError(400, 'Informe o nicho do mercado europeu.');
      const niches = await this.market.listNiches(pool);
      const niche = niches.find((n: any) => n.id === nicheId);
      if (!niche) throw new OpportunityError(404, 'Nicho não encontrado.');
      const ads = await this.market.topAds(pool, nicheId, 15);
      evidence = {
        kind: 'EU_MARKET',
        niche: { name: niche.name, score: niche.score, classification: niche.classification, stats: niche.stats, reason: niche.reason },
        top_ads: ads.map(a => ({ page: a.page_name, days_running: a.days_running, reach: a.eu_total_reach, title: a.title, body: clip(a.body, 600), link: a.link_caption }))
      };
      title = title || `Nicho UE: ${niche.name}`;
    } else {
      if (!clip(input.brief, 4000)) throw new OpportunityError(400, 'Descreva a oportunidade no campo de briefing.');
      title = title || clip(input.brief, 80);
    }

    const seq = await pool.query(`SELECT nextval('seq_campaign_opportunities_human_id') AS n`);
    const humanId = `OPP-${String(seq.rows[0].n).padStart(4, '0')}${isDemo ? '-DEMO' : ''}`;
    const r = await pool.query(
      `INSERT INTO campaign_opportunities (human_id, title, source, source_level, source_ref, product_id, market_niche_id, brief, evidence, created_by, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [humanId, title, input.source, input.source_level || null, input.source_ref || null, productId, nicheId, clip(input.brief, 4000), evidence ? JSON.stringify(evidence) : null, userId, isDemo]
    );
    await writeAuditLog(pool, userId, 'OPPORTUNITY_CREATED', `${humanId}: ${title}`, null, null, isDemo).catch(() => {});
    return r.rows[0];
  }

  /** Fires the Claude routine for EVALUATE or PLAN; EVALUATE also asks GPT for a second opinion. */
  async dispatch(pool: Pool, id: string, kind: 'EVALUATE' | 'PLAN', isDemo: boolean) {
    const o = await this.get(pool, id);
    if (kind === 'PLAN' && !['AVALIADA', 'PLANO_PRONTO'].includes(o.status)) throw new OpportunityError(409, 'Peça a avaliação antes de montar o plano.');
    if (['APROVADA', 'DESCARTADA'].includes(o.status)) throw new OpportunityError(409, 'Oportunidade já decidida.');
    const nextStatus = kind === 'EVALUATE' ? 'EM_AVALIACAO' : 'EM_PLANEJAMENTO';

    if (kind === 'EVALUATE') {
      // Second opinion runs in the background; failures are recorded, never block the flow
      this.runSecondOpinion(pool, o, isDemo).catch(() => {});
    }

    if (isDemo || !routineConfigured()) {
      return this.patch(pool, id, {
        status: nextStatus,
        task_kind: kind,
        task_status: 'NOT_CONFIGURED',
        task_response: isDemo ? 'Modo demonstração: não enviado ao Claude.' : 'Automação não configurada (CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN).'
      });
    }
    const text = ['NORQVA_OPPORTUNITY_TASK', `opportunity_id: ${o.id}`, `kind: ${kind}`, `human_id: ${o.human_id}`, `api_base: ${PUBLIC_API()}`].join('\n');
    const fired = await this.firer(text);
    if (!fired.ok) {
      return this.patch(pool, id, { task_kind: kind, task_status: 'FAILED', task_response: `Não consegui acionar o Claude: ${fired.error || 'erro'}` });
    }
    const out = await this.patch(pool, id, { status: nextStatus, task_kind: kind, task_status: 'DISPATCHED', task_response: null, session_url: fired.sessionUrl || null });
    await writeAuditLog(pool, null, 'OPPORTUNITY_DISPATCHED', `${o.human_id} → Claude (${kind})`, null, fired.sessionUrl || null, isDemo).catch(() => {});
    return out;
  }

  private async runSecondOpinion(pool: Pool, o: any, isDemo: boolean) {
    const context = await this.context(pool, o, isDemo);
    const res = await this.secondOpinion({ opportunity: pick(o), evidence: o.evidence, context });
    await pool.query(`UPDATE campaign_opportunities SET second_opinion = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(res), o.id]);
  }

  /** Everything the AIs need: products, offers, VERIFIED claims, breakeven, account ranking, EU niche references. */
  async context(pool: Pool, o: any, isDemo: boolean) {
    const [products, offers, claims, breakeven, niches] = await Promise.all([
      pool.query(`SELECT id, human_id, name, category, description FROM products WHERE is_demo = $1 AND COALESCE(is_deleted, FALSE) = FALSE`, [isDemo]),
      pool.query(`SELECT id, human_id, product_id, name, price, promotional_price, status FROM offers WHERE is_demo = $1 AND COALESCE(is_deleted, FALSE) = FALSE`, [isDemo]),
      pool.query(`SELECT human_id, product_id, claim_text, claim_type FROM claims_registry WHERE is_demo = $1 AND status = 'VERIFIED'`, [isDemo]),
      breakevenByProduct(pool, isDemo),
      this.market.listNiches(pool).catch(() => [])
    ]);
    const adRank = await this.intel.getCampaignBase(pool, { level: 'ad', is_demo: isDemo }).catch(() => null);
    return {
      products: products.rows.map(p => ({ ...p, description: clip(p.description, 600), breakeven_cpa: breakeven.get(String(p.id)) ?? null })),
      offers: offers.rows,
      verified_claims: claims.rows,
      account_top_ads: adRank ? adRank.rows.slice(0, 10).map(r => ({ name: r.name, product: r.product_name, score: r.score, classification: r.classification, spend: r.totals.spend, sales: r.totals.sales, ctr_link: r.metrics.ctr_link, hook_rate: r.metrics.hook_rate, reason: r.reason, creative: r.creative })) : [],
      eu_niches: (niches as any[]).map(n => ({ id: n.id, name: n.name, score: n.score, classification: n.classification, stats: n.stats })),
      rules: [
        'Nunca publicar, pausar ou mudar orçamento na Meta; o dono aprova.',
        'Só usar afirmações das claims VERIFIED do produto escolhido (claim_codes).',
        'Nunca prometer acesso vitalício nem resultado financeiro garantido.',
        'Nome do anúncio = chave do criativo = utm_content.'
      ]
    };
  }

  async taskForAutomation(pool: Pool, id: string) {
    const o = await this.get(pool, id);
    return { opportunity: pick(o), evidence: o.evidence, second_opinion: o.second_opinion, evaluation: o.evaluation, context: await this.context(pool, o, o.is_demo) };
  }

  async reportStatus(pool: Pool, id: string, status: string, response: string | null) {
    if (!['IN_PROGRESS', 'NEEDS_INPUT', 'FAILED'].includes(status)) throw new OpportunityError(400, 'Status inválido.');
    await this.get(pool, id);
    return this.patch(pool, id, { task_status: status, task_response: clip(response, 4000) });
  }

  async reportEvaluation(pool: Pool, id: string, body: any) {
    const o = await this.get(pool, id);
    const score = Math.round(Number(body?.score));
    const verdict = String(body?.verdict || '').toUpperCase();
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new OpportunityError(400, 'score deve ser um número de 0 a 100.');
    if (!(VERDICTS as readonly string[]).includes(verdict)) throw new OpportunityError(400, `verdict deve ser ${VERDICTS.join(', ')}.`);
    const summary = clip(body?.summary, 4000);
    if (!summary) throw new OpportunityError(400, 'Envie o resumo (summary).');
    const evaluation = {
      by: 'Claude',
      score,
      verdict,
      summary,
      strengths: list(body?.strengths, 10),
      risks: list(body?.risks, 10),
      hypotheses: list(body?.hypotheses, 10),
      recommended_product_id: clip(body?.recommended_product_id, 64),
      at: new Date().toISOString()
    };
    const out = await this.patch(pool, id, {
      status: 'AVALIADA',
      ai_score: score,
      verdict,
      evaluation: JSON.stringify(evaluation),
      task_status: 'DONE',
      task_response: clip(body?.summary, 500),
      product_id: evaluation.recommended_product_id && !o.product_id ? evaluation.recommended_product_id : o.product_id
    });
    await writeAuditLog(pool, null, 'OPPORTUNITY_EVALUATED', `${o.human_id}: ${verdict} (${score})`, null, null, o.is_demo).catch(() => {});
    return out;
  }

  /** Validates the plan and turns its creatives into a DRAFT batch in the Creative Factory. */
  async reportPlan(pool: Pool, id: string, body: any) {
    const o = await this.get(pool, id);
    if (!['EM_PLANEJAMENTO', 'AVALIADA', 'PLANO_PRONTO'].includes(o.status)) throw new OpportunityError(409, 'A oportunidade não está em planejamento.');
    const productId = clip(body?.product_id, 64) || o.product_id;
    if (!productId) throw new OpportunityError(400, 'Informe product_id.');
    const product = (await pool.query(`SELECT id, human_id FROM products WHERE id = $1`, [productId])).rows[0];
    if (!product) throw new OpportunityError(400, 'Produto não encontrado.');
    const offerId = clip(body?.offer_id, 64);
    const offer = offerId ? (await pool.query(`SELECT id, human_id, product_id FROM offers WHERE id = $1`, [offerId])).rows[0] : null;
    if (!offer || String(offer.product_id) !== String(productId)) throw new OpportunityError(400, 'offer_id deve ser uma oferta do produto.');

    const creatives: any[] = Array.isArray(body?.creatives) ? body.creatives : [];
    if (creatives.length < 1 || creatives.length > 20) throw new OpportunityError(400, 'Envie de 1 a 20 criativos.');
    const verified = new Set(
      (await pool.query(`SELECT human_id FROM claims_registry WHERE product_id = $1 AND status = 'VERIFIED' AND is_demo = $2`, [productId, o.is_demo])).rows.map(r =>
        String(r.human_id).replace(/-DEMO$/, '')
      )
    );

    const code = `${o.human_id.replace(/-DEMO$/, '')}-B01`;
    const batchCreatives: BatchCreative[] = creatives.map((c, i) => {
      const hook = clip(c?.hook, 500);
      const primaryText = clip(c?.primary_text, 2000);
      const headline = clip(c?.headline, 200);
      const cta = clip(c?.cta, 200);
      const format = String(c?.format || 'VIDEO').toUpperCase();
      if (!hook || !primaryText || !headline || !cta) throw new OpportunityError(400, `Criativo ${i + 1}: hook, primary_text, headline e cta são obrigatórios.`);
      if (!(FORMATS as readonly string[]).includes(format)) throw new OpportunityError(400, `Criativo ${i + 1}: format deve ser VIDEO, IMAGE ou CAROUSEL.`);
      const claimCodes = list(c?.claim_codes, 10, 60).map(x => x.replace(/-DEMO$/, ''));
      const bad = claimCodes.filter(x => !verified.has(x));
      if (bad.length) throw new OpportunityError(400, `Criativo ${i + 1}: claims não verificadas para o produto: ${bad.join(', ')}.`);
      const n = String(i + 1).padStart(2, '0');
      return {
        key: `${code}-C${n}`,
        hookCode: `H${n}`,
        hookFamily: clip(c?.hook_family, 60) || 'AI',
        hook,
        mechanismCode: 'M1',
        mechanism: clip(c?.mechanism, 300) || '',
        ctaCode: 'C1',
        cta,
        format: format as BatchCreative['format'],
        durationSeconds: c?.duration_seconds ? Math.max(3, Math.min(90, Math.round(Number(c.duration_seconds)))) : null,
        script: clip(c?.script, 4000) || '',
        primaryText,
        headline,
        claimCodes
      };
    });

    const plan = {
      by: 'Claude',
      product_id: productId,
      offer_id: offer.id,
      campaign: body?.campaign && typeof body.campaign === 'object' ? body.campaign : null,
      test_plan: clip(body?.test_plan, 4000),
      summary: clip(body?.summary, 4000),
      creatives_count: batchCreatives.length,
      batch_code: code,
      at: new Date().toISOString()
    };
    const batch: CreativeBatch = {
      code,
      productId: String(productId),
      offerId: String(offer.id),
      offerHumanId: String(offer.human_id),
      description: `Lote do time de IAs para ${o.human_id}: ${o.title}`,
      claims: [],
      creatives: batchCreatives
    };
    await pool.query(
      `INSERT INTO creative_batches (code, product_id, offer_id, name, source, opportunity_id, payload, is_demo)
       VALUES ($1,$2,$3,$4,'AI',$5,$6,$7)
       ON CONFLICT (code, is_demo) DO UPDATE SET payload = EXCLUDED.payload, name = EXCLUDED.name`,
      [code, productId, offer.id, o.title, o.id, JSON.stringify(batch), o.is_demo]
    );
    const imported = await this.factory.importBatchData(pool, batch, null, o.is_demo);
    await pool.query(`UPDATE creative_batches SET imported_at = NOW() WHERE code = $1 AND is_demo = $2`, [code, o.is_demo]);
    const out = await this.patch(pool, id, {
      status: 'PLANO_PRONTO',
      plan: JSON.stringify(plan),
      batch_code: code,
      product_id: productId,
      task_status: 'DONE',
      task_response: clip(body?.summary, 500)
    });
    await writeAuditLog(pool, null, 'OPPORTUNITY_PLANNED', `${o.human_id}: lote ${code} com ${imported.creativesCreated} criativos em rascunho`, null, null, o.is_demo).catch(() => {});
    return { opportunity: out, batch: imported };
  }

  async decide(pool: Pool, id: string, decision: string, userId: string | null) {
    const o = await this.get(pool, id);
    const d = String(decision || '').toUpperCase();
    if (d === 'APROVADA' && o.status !== 'PLANO_PRONTO') throw new OpportunityError(409, 'Só é possível aprovar um plano pronto.');
    if (!['APROVADA', 'DESCARTADA'].includes(d)) throw new OpportunityError(400, 'Decisão deve ser APROVADA ou DESCARTADA.');
    const out = await this.patch(pool, id, { status: d, decided_by: userId, decided_at: new Date().toISOString() });
    await writeAuditLog(pool, userId, 'OPPORTUNITY_DECIDED', `${o.human_id}: ${d}`, null, null, o.is_demo).catch(() => {});
    return out;
  }

  private async patch(pool: Pool, id: string, fields: Record<string, any>) {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const r = await pool.query(`UPDATE campaign_opportunities SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...keys.map(k => fields[k])]);
    return r.rows[0];
  }
}

function pick(o: any) {
  return { id: o.id, human_id: o.human_id, title: o.title, source: o.source, source_level: o.source_level, product_id: o.product_id, market_niche_id: o.market_niche_id, brief: o.brief, status: o.status };
}
