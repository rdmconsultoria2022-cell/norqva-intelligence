import { Pool } from 'pg';
import { RoutineFirer, defaultRoutineFirer, routineConfigured } from '../creative/adjustmentService';
import { CreativeFactoryService } from '../creative/creativeFactoryService';
import { CampaignIntelligenceService, IntelLevel, INTEL_LEVELS } from '../intelligence/campaignIntelligenceService';
import { MarketEuService } from '../marketIntelligence/marketEuService';
import { breakevenByProduct } from '../alerts/adAlertService';
import { writeAuditLog } from '../../db/audit';
import { CreativeBatch, BatchCreative } from '../../data/creativeBatches';
import { SecondOpinionProvider, gptSecondOpinion } from './gptSecondOpinion';
import { beginDecision, DecisionContext } from '../../db/decisionEvents';
import { buildLaunchFromSheet, LaunchSheetError } from './launchSheet';
import { LaunchPlanService, LaunchPlanError } from '../launchPlans/launchPlanService';
import { VALIDATION_CHECKS, AI_RULES } from '../research/criteriaTexts';
import { CriteriaService } from '../research/criteriaService';

export { VALIDATION_CHECKS };

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
export type TaskKind = 'EVALUATE' | 'VALIDATE' | 'PLAN';
export const TASK_KINDS: TaskKind[] = ['EVALUATE', 'VALIDATE', 'PLAN'];

// NORQVA-0021 (P2): validator gate — Claude in critic mode challenges the analysis with a fixed checklist.
export const VALIDATION_VERDICTS = ['APROVA', 'REPROVA', 'PEDE_EVIDENCIA'] as const;
// NORQVA-0029: o checklist fica em services/research/criteriaTexts.ts (validado na tela Pesquisa)
const CHECK_STATUSES = ['OK', 'ALERTA', 'FALHA'] as const;
export const OVERRIDE_MIN_CHARS = 20;

/** The plan may only be built after the validator approved, or the owner overrode the veto. */
export const validationPassed = (o: any) => o?.validation_verdict === 'APROVA' || !!o?.validation_override;
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
    private market = new MarketEuService(),
    private launchPlans = new LaunchPlanService(),
    private criteria = new CriteriaService()
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
  async dispatch(pool: Pool, id: string, kind: TaskKind, isDemo: boolean) {
    const o = await this.get(pool, id);
    if (!TASK_KINDS.includes(kind)) throw new OpportunityError(400, 'kind deve ser EVALUATE, VALIDATE ou PLAN.');
    if (['APROVADA', 'DESCARTADA'].includes(o.status)) throw new OpportunityError(409, 'Oportunidade já decidida.');
    if (kind === 'VALIDATE' && o.status !== 'AVALIADA') throw new OpportunityError(409, 'Peça a avaliação antes da validação.');
    if (kind === 'PLAN' && !['AVALIADA', 'EM_PLANEJAMENTO', 'PLANO_PRONTO'].includes(o.status)) throw new OpportunityError(409, 'Peça a avaliação antes de montar o plano.');
    if (kind === 'PLAN' && !validationPassed(o)) {
      throw new OpportunityError(409, 'O validador ainda não aprovou esta oportunidade. Peça a validação ou derrube o veto com justificativa.');
    }
    const nextStatus = kind === 'EVALUATE' ? 'EM_AVALIACAO' : kind === 'VALIDATE' ? 'AVALIADA' : 'EM_PLANEJAMENTO';
    // A new analysis or a new validation supersedes the previous verdict and any override of it
    if (kind === 'EVALUATE' || kind === 'VALIDATE') {
      await this.patch(pool, id, { validation_verdict: null, validation_override: null });
    }

    if (kind === 'EVALUATE') {
      // Second opinion runs in the background; failures are recorded, never block the flow
      this.runSecondOpinion(pool, o, isDemo).catch(() => {});
    }

    if (isDemo || !routineConfigured()) {
      return this.patch(pool, id, {
        status: nextStatus,
        task_kind: kind === 'VALIDATE' ? null : kind,
        task_stage: kind,
        task_status: 'NOT_CONFIGURED',
        task_response: isDemo ? 'Modo demonstração: não enviado ao Claude.' : 'Automação não configurada (CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN).'
      });
    }
    const text = ['NORQVA_OPPORTUNITY_TASK', `opportunity_id: ${o.id}`, `kind: ${kind}`, `human_id: ${o.human_id}`, `api_base: ${PUBLIC_API()}`].join('\n');
    const fired = await this.firer(text);
    if (!fired.ok) {
      return this.patch(pool, id, { task_kind: kind === 'VALIDATE' ? null : kind, task_stage: kind, task_status: 'FAILED', task_response: `Não consegui acionar o Claude: ${fired.error || 'erro'}` });
    }
    const out = await this.patch(pool, id, { status: nextStatus, task_kind: kind === 'VALIDATE' ? null : kind, task_stage: kind, task_status: 'DISPATCHED', task_response: null, session_url: fired.sessionUrl || null });
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
      // NORQVA-0032: só promessas verificadas e dentro da validade; com produto definido, só as dele
      pool.query(
        `SELECT human_id, product_id, claim_text, claim_type FROM claims_registry
         WHERE is_demo = $1 AND status = 'VERIFIED' AND (valid_until IS NULL OR valid_until > NOW())
           AND ($2::uuid IS NULL OR product_id = $2::uuid)`,
        [isDemo, o?.product_id || null]
      ),
      breakevenByProduct(pool, isDemo),
      this.market.listNiches(pool).catch(() => [])
    ]);
    const adRank = await this.intel.getCampaignBase(pool, { level: 'ad', is_demo: isDemo }).catch(() => null);
    const crit = await this.criteria.effective(pool);
    return {
      products: products.rows.map(p => ({ ...p, description: clip(p.description, 600), breakeven_cpa: breakeven.get(String(p.id)) ?? null })),
      offers: offers.rows,
      verified_claims: claims.rows,
      account_top_ads: adRank ? adRank.rows.slice(0, 10).map(r => ({ name: r.name, product: r.product_name, score: r.score, classification: r.classification, spend: r.totals.spend, sales: r.totals.sales, ctr_link: r.metrics.ctr_link, hook_rate: r.metrics.hook_rate, reason: r.reason, creative: r.creative })) : [],
      eu_niches: (niches as any[]).map(n => ({ id: n.id, name: n.name, score: n.score, classification: n.classification, stats: n.stats })),
      rules: AI_RULES,
      // NORQVA-0029: limites numéricos em vigor e se o dono já os validou
      criteria: { version: crit.version, validated: crit.validated, numbers: crit.numbers }
    };
  }

  async taskForAutomation(pool: Pool, id: string) {
    const o = await this.get(pool, id);
    return {
      opportunity: pick(o),
      evidence: o.evidence,
      second_opinion: o.second_opinion,
      evaluation: o.evaluation,
      validation: o.validation || null,
      validation_override: o.validation_override || null,
      validation_checklist: VALIDATION_CHECKS,
      context: await this.context(pool, o, o.is_demo)
    };
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
    // NORQVA-0029: guarda a versão dos critérios validada no momento da avaliação. null = nada validado ou
    // textos mudados depois da última validação (a avaliação não seguiu critérios validados por inteiro).
    const crit = await this.criteria.effective(pool);
    const criteriaVersion = crit.validated ? crit.version : null;
    const evaluation = {
      by: 'Claude',
      criteria_version: criteriaVersion,
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
      criteria_version: criteriaVersion,
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
    if (!validationPassed(o)) throw new OpportunityError(409, 'O validador ainda não aprovou esta oportunidade.');
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

    // NORQVA-0021 (P3): campaign sheet → DRAFT launch plan (validated before anything is written)
    let launch: ReturnType<typeof buildLaunchFromSheet> | null = null;
    if (body?.launch !== undefined && body?.launch !== null) {
      try {
        launch = buildLaunchFromSheet(body.launch, {
          opportunityHumanId: o.human_id,
          offerHumanId: String(offer.human_id),
          creatives: batchCreatives,
          offerBaseUrl: process.env.NORQVA_PUBLIC_OFFER_BASE_URL
        });
      } catch (err) {
        if (err instanceof LaunchSheetError) throw new OpportunityError(400, err.message);
        throw err;
      }
    }

    const plan: Record<string, any> = {
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

    if (launch) {
      let draft: { id: string; code: string; status: string } | null = null;
      let note: string | null = null;
      if (o.is_demo) {
        note = 'Modo demonstração: ficha validada, plano de lançamento não gravado.';
      } else {
        try {
          const r = await this.launchPlans.createDraft(pool, launch.input, null);
          draft = { id: String(r.plan.id), code: r.plan.code, status: r.plan.status };
        } catch (err) {
          if (err instanceof LaunchPlanError) note = `Plano de lançamento não gravado: ${err.message}`;
          else throw err;
        }
      }
      plan.launch = { ...launch.sheet, draft, note };
    }
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

  /** Validator (Claude, critic mode) verdict. APROVA is refused when any checklist item failed. */
  async reportValidation(pool: Pool, id: string, body: any) {
    const o = await this.get(pool, id);
    if (o.status !== 'AVALIADA') throw new OpportunityError(409, 'A oportunidade precisa estar avaliada para ser validada.');
    if (!o.evaluation) throw new OpportunityError(409, 'Não há avaliação do analista para validar.');
    const verdict = String(body?.verdict || '').toUpperCase();
    if (!(VALIDATION_VERDICTS as readonly string[]).includes(verdict)) throw new OpportunityError(400, `verdict deve ser ${VALIDATION_VERDICTS.join(', ')}.`);
    const summary = clip(body?.summary, 4000);
    if (!summary) throw new OpportunityError(400, 'Envie o resumo (summary).');
    const raw: any[] = Array.isArray(body?.checklist) ? body.checklist : [];
    const checklist = VALIDATION_CHECKS.map(c => {
      const item = raw.find(x => String(x?.key || '').toUpperCase() === c.key);
      const status = String(item?.status || '').toUpperCase();
      if (!item || !(CHECK_STATUSES as readonly string[]).includes(status)) {
        throw new OpportunityError(400, `checklist: informe ${c.key} com status OK, ALERTA ou FALHA.`);
      }
      return { key: c.key, label: c.label, status, note: clip(item.note, 600) };
    });
    const failed = checklist.filter(c => c.status === 'FALHA').map(c => c.key);
    if (verdict === 'APROVA' && failed.length) throw new OpportunityError(400, `Não é possível aprovar com itens em FALHA: ${failed.join(', ')}.`);
    const requiredEvidence = list(body?.required_evidence, 10);
    if (verdict === 'PEDE_EVIDENCIA' && requiredEvidence.length === 0) throw new OpportunityError(400, 'Liste em required_evidence o que precisa ser trazido.');
    const validation = {
      by: 'Claude (validador crítico)',
      verdict,
      summary,
      checklist,
      questions: list(body?.questions, 10),
      required_evidence: requiredEvidence,
      at: new Date().toISOString()
    };
    const out = await this.patch(pool, id, {
      validation: JSON.stringify(validation),
      validation_verdict: verdict,
      validation_override: null,
      task_status: 'DONE',
      task_response: clip(summary, 500)
    });
    await writeAuditLog(pool, null, 'OPPORTUNITY_VALIDATED', `${o.human_id}: ${verdict}${failed.length ? ` (falhas: ${failed.join(', ')})` : ''}`, null, null, o.is_demo).catch(() => {});
    return out;
  }

  /**
   * Owner overrides the validator's veto (REPROVA / PEDE_EVIDENCIA) with a written justification.
   * Recorded in decision_events (fail-closed: if the audit cannot be written, nothing changes).
   */
  async overrideValidation(pool: Pool, id: string, justification: unknown, ctx: DecisionContext) {
    const o = await this.get(pool, id);
    const text = clip(justification, 2000);
    if (!text || text.length < OVERRIDE_MIN_CHARS) throw new OpportunityError(400, `Escreva a justificativa (mínimo ${OVERRIDE_MIN_CHARS} caracteres).`);
    if (o.status !== 'AVALIADA') throw new OpportunityError(409, 'Só é possível derrubar o veto de uma oportunidade avaliada.');
    if (!['REPROVA', 'PEDE_EVIDENCIA'].includes(o.validation_verdict)) throw new OpportunityError(409, 'Não há veto do validador para derrubar.');
    if (o.validation_override) throw new OpportunityError(409, 'O veto já foi derrubado.');
    const handle = await beginDecision(pool, ctx, { action: 'OPPORTUNITY_VALIDATION_OVERRIDE', decision: `OVERRIDE:${o.validation_verdict}`, planCode: o.human_id });
    try {
      const override = { by: ctx.userEmail || ctx.userId, user_id: ctx.userId, justification: text, overridden_verdict: o.validation_verdict, correlation_id: handle.correlationId, at: new Date().toISOString() };
      const out = await this.patch(pool, id, { validation_override: JSON.stringify(override) });
      const recorded = await handle.finish('EXECUTED', { result: { opportunity_id: o.id, human_id: o.human_id, overridden_verdict: o.validation_verdict, justification: text } });
      await writeAuditLog(pool, ctx.userId, 'OPPORTUNITY_VALIDATION_OVERRIDE', `${o.human_id}: veto ${o.validation_verdict} derrubado pelo dono`, null, null, o.is_demo).catch(() => {});
      return { ...out, audit_incomplete: !recorded || undefined };
    } catch (err) {
      await handle.finish('FAILED', { error: err });
      throw err;
    }
  }

  async decide(pool: Pool, id: string, decision: string, userId: string | null) {
    const o = await this.get(pool, id);
    const d = String(decision || '').toUpperCase();
    if (d === 'APROVADA' && o.status !== 'PLANO_PRONTO') throw new OpportunityError(409, 'Só é possível aprovar um plano pronto.');
    if (!['APROVADA', 'DESCARTADA'].includes(d)) throw new OpportunityError(400, 'Decisão deve ser APROVADA ou DESCARTADA.');
    // NORQVA-0029: na conta real, aprovar plano exige critérios validados pelo dono (aba Critérios da Pesquisa)
    if (d === 'APROVADA' && !o.is_demo) {
      const crit = await this.criteria.effective(pool);
      if (!crit.validated) {
        throw new OpportunityError(
          409,
          crit.texts_changed
            ? 'Os critérios mudaram depois da última validação. Valide-os de novo na aba Critérios antes de aprovar o plano.'
            : 'Os critérios de avaliação ainda não foram validados. Valide-os na aba Critérios antes de aprovar o plano.'
        );
      }
    }
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
