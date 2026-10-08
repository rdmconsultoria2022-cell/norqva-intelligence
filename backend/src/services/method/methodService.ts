import { Pool } from 'pg';
import { CampaignIntelligenceService, IntelRow, addTotals, deriveMetrics, BaseTotals } from '../intelligence/campaignIntelligenceService';
import { beginDecision, DecisionContext } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0022 — Método NORQVA de Campanhas V1.
// Organiza o que já existe (produto/oferta, pesquisa, Fábrica, planos de lançamento, medição) em 10 etapas,
// com hipóteses ligadas aos criativos, checklist pré-publicação, decisão por criativo e biblioteca de
// aprendizado. SOMENTE registros internos e leitura: nada aqui chama a Meta, ativa, publica ou muda orçamento.

export class MethodError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const PRINCIPLES = [
  'Nenhum criativo existe apenas para produzir conteúdo. Cada criativo deve testar uma hipótese.',
  'Cada campanha deve produzir dois resultados: 1. vendas; 2. aprendizado.'
];

export const STAGES = [
  { n: 1, key: 'PRODUTO', title: 'Produto', question: 'O que estamos vendendo?', folder: '01_PRODUTO' },
  { n: 2, key: 'PUBLICO', title: 'Público', question: 'Para quem estamos vendendo e qual problema/desejo existe?', folder: '03_ESTRATEGIA' },
  { n: 3, key: 'PESQUISA', title: 'Pesquisa', question: 'O que já funciona ou chama atenção nesse mercado?', folder: '02_PESQUISA' },
  { n: 4, key: 'OFERTA', title: 'Oferta', question: 'Por que alguém deveria comprar?', folder: '03_ESTRATEGIA' },
  { n: 5, key: 'HIPOTESES', title: 'Hipóteses', question: 'O que exatamente queremos testar?', folder: '03_ESTRATEGIA' },
  { n: 6, key: 'CRIATIVOS', title: 'Criativos', question: 'Como transformamos a hipótese em anúncio?', folder: '04_CRIATIVOS / 05_COPY' },
  { n: 7, key: 'ESTRUTURA', title: 'Estrutura', question: 'Página, checkout e tracking estão preparados?', folder: '07_TRACKING' },
  { n: 8, key: 'META_ADS', title: 'Meta Ads', question: 'Como campanha, conjunto e anúncios serão estruturados?', folder: '06_META_ADS' },
  { n: 9, key: 'MEDICAO', title: 'Medição', question: 'O que os dados estão dizendo?', folder: '08_RESULTADOS' },
  { n: 10, key: 'APRENDIZADO', title: 'Decisão / Aprendizado', question: 'Devemos MATAR, MANTER, ITERAR ou ESCALAR?', folder: '09_APRENDIZADO' }
] as const;

export type StageStatus = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'BLOQUEADO' | 'PRONTO' | 'CONCLUIDO';
export type DataLevel = 'SEM_DADOS' | 'DADOS_INSUFICIENTES' | 'DADOS_CONFIAVEIS';
export type PipelineStage = 'IDEIA' | 'ROTEIRO' | 'ASSETS' | 'PRODUCAO' | 'REVISAO' | 'APROVADO' | 'PUBLICADO' | 'MEDIDO' | 'CLASSIFICADO';
export const PIPELINE: PipelineStage[] = ['IDEIA', 'ROTEIRO', 'ASSETS', 'PRODUCAO', 'REVISAO', 'APROVADO', 'PUBLICADO', 'MEDIDO', 'CLASSIFICADO'];

export const DECISIONS = ['MATAR', 'MANTER', 'ITERAR', 'ESCALAR'] as const;
export const CONFIDENCES = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export const HYPOTHESIS_STATUSES = ['PROPOSTA', 'TESTANDO', 'PROMISSORA', 'VALIDADA', 'REJEITADA', 'NAO_VALIDADA'] as const;
export const VARIABLES = ['GANCHO', 'ANGULO', 'FORMATO', 'OFERTA', 'PUBLICO', 'COPY', 'VISUAL'] as const;
export const LEARNING_TYPES = ['GANCHO', 'ANGULO', 'OFERTA', 'FORMATO', 'OBJECAO', 'PADRAO_VISUAL', 'PUBLICO', 'FALHA', 'HIPOTESE'] as const;
export const LEARNING_STATUSES = ['VENCEDOR', 'PROMISSORA', 'VALIDADA', 'REJEITADA'] as const;

const clip = (v: unknown, n: number) => (v === undefined || v === null ? null : String(v).trim().slice(0, n) || null);
const MIN_IMPRESSIONS = 500;

// ---------------------------------------------------------------- pure rules

/** SEM DADOS / DADOS INSUFICIENTES / DADOS CONFIÁVEIS. Heurística, não significância estatística. */
export function dataLevelOf(t: { spend: number; impressions: number } | null, breakevenCpa: number | null): DataLevel {
  if (!t || (t.spend <= 0 && t.impressions <= 0)) return 'SEM_DADOS';
  const conf = breakevenCpa && breakevenCpa > 0 ? Math.min(1, t.spend / (3 * breakevenCpa)) : Math.min(1, t.spend / 80);
  return t.impressions < MIN_IMPRESSIONS || conf < 0.5 ? 'DADOS_INSUFICIENTES' : 'DADOS_CONFIAVEIS';
}

/** Maior confiança permitida numa decisão para o nível dos dados. */
export function maxConfidenceFor(level: DataLevel): (typeof CONFIDENCES)[number] {
  return level === 'DADOS_CONFIAVEIS' ? 'ALTA' : level === 'DADOS_INSUFICIENTES' ? 'MEDIA' : 'BAIXA';
}

export function pipelineStageOf(c: {
  script?: string | null;
  file_url?: string | null;
  approval_status?: string | null;
  published: boolean;
  measured: boolean;
  decided: boolean;
}): PipelineStage {
  if (c.decided) return 'CLASSIFICADO';
  if (c.measured) return 'MEDIDO';
  if (c.published) return 'PUBLICADO';
  if (c.approval_status === 'APPROVED') return 'APROVADO';
  if (c.approval_status === 'IN_REVIEW') return 'REVISAO';
  if (c.file_url) return 'PRODUCAO';
  if (c.script) return 'ROTEIRO';
  return 'IDEIA';
}

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  critical: boolean;
  detail: string;
}

export interface ChecklistInput {
  product: boolean;
  audience: boolean;
  offer: boolean;
  hypothesis: boolean;
  creativeApproved: boolean;
  pageWorking: boolean;
  checkoutReady: boolean;
  pixelVerified: boolean;
  utm: boolean;
  campaignStructured: boolean;
  governance: boolean;
}

/** Checklist pré-publicação. Qualquer item crítico pendente → NÃO PRONTO. Nunca ativa nada. */
export function prePublicationChecklist(i: ChecklistInput): { items: ChecklistItem[]; ready: boolean; status: 'PRONTO' | 'NAO_PRONTO' } {
  const item = (key: string, label: string, ok: boolean, detailOk: string, detailPending: string): ChecklistItem => ({
    key,
    label,
    ok,
    critical: true,
    detail: ok ? detailOk : detailPending
  });
  const items: ChecklistItem[] = [
    item('PRODUTO', 'Produto definido', i.product, 'Produto cadastrado', 'PENDENTE: produto não definido'),
    item('PUBLICO', 'Público definido', i.audience, 'Público registrado', 'PENDENTE: público não registrado'),
    item('OFERTA', 'Oferta registrada', i.offer, 'Oferta com preço', 'PENDENTE: oferta não registrada'),
    item('HIPOTESE', 'Hipótese registrada', i.hypothesis, 'Criativo ligado a uma hipótese', 'PENDENTE: criativo sem hipótese'),
    item('CRIATIVO', 'Criativo aprovado', i.creativeApproved, 'Aprovado na Fábrica', 'PENDENTE: criativo não aprovado'),
    item('COPY', 'Copy aprovada', i.creativeApproved, 'Copy aprovada com o criativo (mesma revisão)', 'PENDENTE: copy não aprovada'),
    item('PAGINA', 'Página funcionando', i.pageWorking, 'Oferta ativa com visitas recentes', 'PENDENTE: página sem confirmação'),
    item('CHECKOUT', 'Checkout funcionando', i.checkoutReady, 'Pagamentos de produção configurados', 'PENDENTE: checkout não confirmado'),
    item('PIXEL', 'Pixel/eventos verificados', i.pixelVerified, 'Compras enviadas à Meta nos últimos 30 dias', 'PENDENTE: eventos não verificados'),
    item('UTM', 'UTMs definidas', i.utm, 'utm_content = chave do criativo', 'PENDENTE: UTM não definida'),
    item('CAMPANHA', 'Campanha estruturada', i.campaignStructured, 'Plano de lançamento registrado', 'PENDENTE: sem plano de lançamento'),
    item('GOVERNANCA', 'Governança aprovada', i.governance, 'Revisão do criativo + resposta do operador', 'PENDENTE: aprovação do operador')
  ];
  const ready = items.every(x => x.ok || !x.critical);
  return { items, ready, status: ready ? 'PRONTO' : 'NAO_PRONTO' };
}

// ---------------------------------------------------------------- service

export class MethodService {
  constructor(private intel = new CampaignIntelligenceService()) {}

  private async nextId(pool: Pool, seq: string, prefix: string, isDemo: boolean) {
    const r = await pool.query(`SELECT nextval('${seq}') AS n`);
    return `${prefix}-${String(r.rows[0].n).padStart(4, '0')}${isDemo ? '-DEMO' : ''}`;
  }

  async listCases(pool: Pool, isDemo: boolean) {
    const r = await pool.query(
      `SELECT c.*, p.name AS product_name, o.human_id AS offer_human_id, o.name AS offer_name
       FROM method_cases c JOIN products p ON p.id = c.product_id LEFT JOIN offers o ON o.id = c.offer_id
       WHERE c.is_demo = $1 ORDER BY c.created_at DESC`,
      [isDemo]
    );
    return r.rows;
  }

  /** Cria o caso a partir de uma oferta existente (idempotente por oferta). A proposta entra como HIPÓTESE. */
  async createCase(pool: Pool, body: any, userId: string | null, isDemo: boolean) {
    const offerHumanId = clip(body?.offer_human_id, 50);
    if (!offerHumanId) throw new MethodError(400, 'Informe a oferta (offer_human_id).');
    const offer = (await pool.query(`SELECT id, human_id, product_id, name FROM offers WHERE human_id = $1 AND is_demo = $2 AND COALESCE(is_deleted, FALSE) = FALSE`, [offerHumanId, isDemo])).rows[0];
    if (!offer || !offer.product_id) throw new MethodError(404, `Oferta ${offerHumanId} não encontrada.`);
    const existing = (await pool.query(`SELECT * FROM method_cases WHERE offer_id = $1 AND is_demo = $2`, [offer.id, isDemo])).rows[0];
    if (existing) return { case: existing, created: false };
    const product = (await pool.query(`SELECT name FROM products WHERE id = $1`, [offer.product_id])).rows[0];
    const humanId = await this.nextId(pool, 'seq_method_cases_human_id', 'MC', isDemo);
    const r = await pool.query(
      `INSERT INTO method_cases (human_id, title, product_id, offer_id, central_proposition, proposition_status, owner_id, is_demo)
       VALUES ($1, $2, $3, $4, $5, 'HIPOTESE', $6, $7) RETURNING *`,
      [humanId, clip(body?.title, 200) || `${product?.name || offer.name} · ${offer.human_id}`, offer.product_id, offer.id, clip(body?.central_proposition, 2000), userId, isDemo]
    );
    await writeAuditLog(pool, userId, 'METHOD_CASE_CREATED', `${humanId}: ${offer.human_id}`, null, null, isDemo).catch(() => {});
    return { case: r.rows[0], created: true };
  }

  async updateCase(pool: Pool, id: string, body: any, isDemo: boolean) {
    const c = await this.getCaseRow(pool, id, isDemo);
    const fields: Record<string, any> = {};
    if (body?.central_proposition !== undefined) fields.central_proposition = clip(body.central_proposition, 2000);
    if (body?.audience_summary !== undefined) fields.audience_summary = clip(body.audience_summary, 2000);
    if (body?.problem_desire !== undefined) fields.problem_desire = clip(body.problem_desire, 2000);
    if (body?.proposition_status !== undefined) {
      const st = String(body.proposition_status).toUpperCase();
      if (!['HIPOTESE', 'NAO_VALIDADO', 'VALIDADO', 'REJEITADO'].includes(st)) throw new MethodError(400, 'proposition_status inválido.');
      if (st === 'VALIDADO' && !clip(body?.validation_evidence, 2000)) throw new MethodError(400, 'Para marcar a oferta como VALIDADA, descreva a evidência (validation_evidence).');
      fields.proposition_status = st;
    }
    const keys = Object.keys(fields);
    if (!keys.length) return c;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const r = await pool.query(`UPDATE method_cases SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, [c.id, ...keys.map(k => fields[k])]);
    if (fields.proposition_status === 'VALIDADO') {
      await this.upsertStageNote(pool, c.id, 4, { notes: `Oferta validada: ${clip(body.validation_evidence, 2000)}` }, null);
    }
    return r.rows[0];
  }

  private async getCaseRow(pool: Pool, id: string, isDemo: boolean) {
    const r = await pool.query(`SELECT * FROM method_cases WHERE id::text = $1 AND is_demo = $2`, [id, isDemo]);
    if (!r.rows[0]) throw new MethodError(404, 'Caso não encontrado.');
    return r.rows[0];
  }

  async upsertStageNote(pool: Pool, caseId: string, stage: number, body: any, userId: string | null) {
    if (!Number.isInteger(stage) || stage < 1 || stage > 10) throw new MethodError(400, 'Etapa inválida (1 a 10).');
    const existing = (await pool.query(`SELECT id FROM method_stage_notes WHERE case_id = $1 AND stage = $2`, [caseId, stage])).rows[0];
    const blocked = body?.blocked === true;
    const notes = clip(body?.notes, 4000);
    const evidence = Array.isArray(body?.evidence_refs) ? JSON.stringify(body.evidence_refs.slice(0, 20).map((x: unknown) => String(x).slice(0, 300))) : null;
    if (existing) {
      const r = await pool.query(
        `UPDATE method_stage_notes SET blocked = $2, notes = COALESCE($3, notes), evidence_refs = COALESCE($4, evidence_refs), owner_id = COALESCE($5, owner_id), updated_by = $6, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [existing.id, blocked, notes, evidence, clip(body?.owner_id, 64), userId]
      );
      return r.rows[0];
    }
    const r = await pool.query(
      `INSERT INTO method_stage_notes (case_id, stage, blocked, notes, evidence_refs, owner_id, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [caseId, stage, blocked, notes, evidence, clip(body?.owner_id, 64), userId]
    );
    return r.rows[0];
  }

  // ---------------- hypotheses
  async createHypothesis(pool: Pool, caseId: string, body: any, userId: string | null, isDemo: boolean, derivedFrom: string | null = null) {
    const c = await this.getCaseRow(pool, caseId, isDemo);
    const statement = clip(body?.statement, 2000);
    if (!statement) throw new MethodError(400, 'Escreva a hipótese (statement).');
    const variable = String(body?.variable_tested || '').toUpperCase();
    if (!(VARIABLES as readonly string[]).includes(variable)) throw new MethodError(400, `variable_tested deve ser ${VARIABLES.join(', ')}.`);
    const status = String(body?.status || 'PROPOSTA').toUpperCase();
    if (!(HYPOTHESIS_STATUSES as readonly string[]).includes(status)) throw new MethodError(400, 'Status de hipótese inválido.');
    const humanId = await this.nextId(pool, 'seq_creative_hypotheses_human_id', 'HIP', isDemo);
    const r = await pool.query(
      `INSERT INTO creative_hypotheses (human_id, case_id, product_id, offer_id, campaign_ref, angle, hook, statement, variable_tested, format, version, audience, test_date, status, notes, derived_from_learning_id, created_by, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        humanId, c.id, c.product_id, c.offer_id, clip(body?.campaign_ref, 200), clip(body?.angle, 200), clip(body?.hook, 1000), statement, variable,
        clip(body?.format, 20), Math.max(1, Math.round(Number(body?.version) || 1)), clip(body?.audience, 1000), clip(body?.test_date, 10), status, clip(body?.notes, 2000), derivedFrom, userId, isDemo
      ]
    );
    return r.rows[0];
  }

  async updateHypothesis(pool: Pool, id: string, body: any, isDemo: boolean) {
    const h = (await pool.query(`SELECT * FROM creative_hypotheses WHERE id::text = $1 AND is_demo = $2`, [id, isDemo])).rows[0];
    if (!h) throw new MethodError(404, 'Hipótese não encontrada.');
    const fields: Record<string, any> = {};
    if (body?.status !== undefined) {
      const st = String(body.status).toUpperCase();
      if (!(HYPOTHESIS_STATUSES as readonly string[]).includes(st)) throw new MethodError(400, 'Status de hipótese inválido.');
      if (st === 'VALIDADA') {
        const d = await pool.query(`SELECT 1 FROM creative_decisions WHERE hypothesis_id = $1 AND data_level = 'DADOS_CONFIAVEIS' LIMIT 1`, [h.id]);
        if (!d.rows.length) throw new MethodError(409, 'Só é possível VALIDAR uma hipótese com uma decisão baseada em DADOS CONFIÁVEIS.');
      }
      fields.status = st;
    }
    for (const k of ['angle', 'hook', 'notes', 'audience', 'campaign_ref'] as const) if (body?.[k] !== undefined) fields[k] = clip(body[k], 2000);
    const keys = Object.keys(fields);
    if (!keys.length) return h;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    return (await pool.query(`UPDATE creative_hypotheses SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`, [h.id, ...keys.map(k => fields[k])])).rows[0];
  }

  async linkCreative(pool: Pool, creativeId: string, hypothesisId: unknown, isDemo: boolean) {
    const c = (await pool.query(`SELECT id FROM creatives WHERE id::text = $1 AND is_demo = $2`, [creativeId, isDemo])).rows[0];
    if (!c) throw new MethodError(404, 'Criativo não encontrado.');
    const h = (await pool.query(`SELECT id FROM creative_hypotheses WHERE id::text = $1 AND is_demo = $2`, [String(hypothesisId || ''), isDemo])).rows[0];
    if (!h) throw new MethodError(404, 'Hipótese não encontrada.');
    await pool.query(`UPDATE creatives SET hypothesis_id = $2 WHERE id = $1`, [c.id, h.id]);
    return { creative_id: c.id, hypothesis_id: h.id };
  }

  /**
   * Traz um anúncio que já roda na Meta, mas não nasceu na Fábrica (ex.: EXP02, CONTROL), para dentro da
   * Fábrica SÓ COMO REGISTRO: cria o criativo a partir do que a sincronização já leu (título, texto, CTA) e
   * grava o vínculo criativo → anúncio. Nenhuma chamada à Meta; o anúncio não muda. A aprovação da Fábrica
   * não é presumida (fica DRAFT). Opcionalmente já liga a uma hipótese do caso.
   */
  async importExternalAd(pool: Pool, caseId: string, metaAdId: string, body: any, userId: string | null, isDemo: boolean) {
    const c = await this.getCaseRow(pool, caseId, isDemo);
    const adId = String(metaAdId || '').trim();
    if (!/^\d{5,30}$/.test(adId)) throw new MethodError(400, 'ID de anúncio da Meta inválido.');
    const already = (await pool.query(`SELECT creative_id FROM creative_meta_ads WHERE meta_ad_id = $1`, [adId])).rows[0];
    if (already) throw new MethodError(409, 'Este anúncio já está ligado a um criativo da Fábrica.');
    const rows = await this.adRows(pool, isDemo);
    const ad = rows.find(r => r.meta_id && String(r.meta_id) === adId);
    if (!ad) throw new MethodError(404, 'Anúncio não encontrado na última sincronização da Meta.');
    if (ad.product_id !== c.product_id) throw new MethodError(400, 'O anúncio não é do produto deste caso.');
    const byName = (await pool.query(`SELECT id FROM creatives WHERE utm_content_key = $1 OR human_id = $1 OR human_id = $2`, [clip(ad.name, 100), `EXT-${String(ad.name || adId)}`.slice(0, 50)])).rows[0];
    if (byName) throw new MethodError(409, 'Já existe um criativo da Fábrica com o nome deste anúncio.');

    let hypothesisId: string | null = null;
    if (body?.hypothesis_id) {
      const h = (await pool.query(`SELECT id FROM creative_hypotheses WHERE id::text = $1 AND case_id = $2 AND is_demo = $3`, [String(body.hypothesis_id), c.id, isDemo])).rows[0];
      if (!h) throw new MethodError(404, 'Hipótese não encontrada neste caso.');
      hypothesisId = h.id;
    }

    const cr = ad.creative || null;
    const humanId = `EXT-${String(ad.name || adId)}`.slice(0, 50);
    const st = String(ad.status || '').toUpperCase();
    const status = st === 'ACTIVE' ? 'ATIVO' : st === 'PAUSED' ? 'PAUSADO' : 'TESTANDO';
    const hook = clip(cr?.title, 2000) || `NÃO REGISTRADO: anúncio ${ad.name} importado da Meta`;
    const copy = clip(cr?.body, 4000) || 'NÃO REGISTRADO: texto não lido na sincronização';
    const ins = await pool.query(
      `INSERT INTO creatives (
         human_id, product_id, offer_id, hook, concept, copy, cta, format, file_url, responsible_id,
         status, is_demo, batch_code, primary_text, headline, generation_source, version, lineage_code,
         utm_content_key, approval_status, hypothesis_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,'META_EXTERNO',$12,$13,'HUMAN',1,$14,$15,'DRAFT',$16)
       RETURNING id, human_id`,
      [
        humanId, c.product_id, c.offer_id, hook, `Importado da Meta (anúncio ${adId}, campanha ${ad.campaign_name || '—'}) só como registro.`,
        copy, clip(cr?.cta, 100) || 'NÃO REGISTRADO', cr?.video_id ? 'VIDEO' : 'IMAGE', userId, status, isDemo,
        clip(cr?.body, 4000), clip(cr?.title, 500), humanId, clip(ad.name, 100), hypothesisId
      ]
    );
    const creative = ins.rows[0];
    await pool.query(`INSERT INTO creative_meta_ads (creative_id, meta_ad_id, link_method, linked_by) VALUES ($1,$2,'MANUAL',$3) ON CONFLICT DO NOTHING`, [creative.id, adId, userId]);
    this.perfCache = null;
    await writeAuditLog(pool, userId, 'METHOD_EXTERNAL_AD_IMPORTED', `${creative.human_id} ← anúncio ${adId}${hypothesisId ? ' (com hipótese)' : ''}; nenhuma ação na Meta`, null, null, isDemo).catch(() => {});
    return { creative_id: creative.id, human_id: creative.human_id, meta_ad_id: adId, hypothesis_id: hypothesisId, meta_changed: false };
  }

  // ---------------- decisions and learnings
  async decide(pool: Pool, creativeId: string, body: any, ctx: DecisionContext) {
    const isDemo = ctx.isDemo;
    const creative = (await pool.query(`SELECT id, human_id, hypothesis_id, utm_content_key FROM creatives WHERE id::text = $1 AND is_demo = $2`, [creativeId, isDemo])).rows[0];
    if (!creative) throw new MethodError(404, 'Criativo não encontrado.');
    const decision = String(body?.decision || '').toUpperCase();
    if (!(DECISIONS as readonly string[]).includes(decision)) throw new MethodError(400, `Decisão deve ser ${DECISIONS.join(', ')}.`);
    const reason = clip(body?.reason, 2000);
    if (!reason || reason.length < 10) throw new MethodError(400, 'Explique o motivo da decisão (mínimo 10 caracteres).');
    const confidence = String(body?.confidence || '').toUpperCase();
    if (!(CONFIDENCES as readonly string[]).includes(confidence)) throw new MethodError(400, `Nível de confiança deve ser ${CONFIDENCES.join(', ')}.`);

    const measurement = await this.measurementFor(pool, creative, isDemo);
    const max = maxConfidenceFor(measurement.data_level);
    if (CONFIDENCES.indexOf(confidence as any) > CONFIDENCES.indexOf(max)) {
      throw new MethodError(400, `Com ${measurement.data_level.replace('_', ' ')}, a confiança máxima é ${max}. Uma regra heurística não vira certeza estatística.`);
    }
    const evidence = { measurement, notes: clip(body?.evidence_notes, 2000), captured_at: new Date().toISOString() };

    const handle = await beginDecision(pool, ctx, { action: 'METHOD_CREATIVE_DECISION', decision, planCode: creative.human_id });
    try {
      const r = await pool.query(
        `INSERT INTO creative_decisions (creative_id, hypothesis_id, decision, reason, evidence, data_level, confidence, responsible_id, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [creative.id, creative.hypothesis_id || null, decision, reason, JSON.stringify(evidence), measurement.data_level, confidence, ctx.userId, isDemo]
      );
      await handle.finish('EXECUTED', { result: { creative: creative.human_id, decision, data_level: measurement.data_level, confidence, meta_action: 'NENHUMA' } });
      return r.rows[0];
    } catch (err) {
      await handle.finish('FAILED', { error: err });
      throw err;
    }
  }

  async createLearning(pool: Pool, body: any, userId: string | null, isDemo: boolean) {
    const sourceId = clip(body?.source_decision_id, 64);
    if (!sourceId) throw new MethodError(400, 'Todo aprendizado precisa da decisão de origem (source_decision_id) com a evidência.');
    const d = (await pool.query(
      `SELECT d.id, d.creative_id, c.product_id FROM creative_decisions d JOIN creatives c ON c.id = d.creative_id WHERE d.id::text = $1 AND d.is_demo = $2`,
      [sourceId, isDemo]
    )).rows[0];
    if (!d) throw new MethodError(404, 'Decisão de origem não encontrada.');
    const type = String(body?.type || '').toUpperCase();
    if (!(LEARNING_TYPES as readonly string[]).includes(type)) throw new MethodError(400, `Tipo deve ser ${LEARNING_TYPES.join(', ')}.`);
    const status = String(body?.status || '').toUpperCase();
    if (!(LEARNING_STATUSES as readonly string[]).includes(status)) throw new MethodError(400, `Status deve ser ${LEARNING_STATUSES.join(', ')}.`);
    const statement = clip(body?.statement, 2000);
    if (!statement) throw new MethodError(400, 'Escreva o aprendizado (statement).');
    const humanId = await this.nextId(pool, 'seq_learnings_human_id', 'APR', isDemo);
    const caseId = clip(body?.case_id, 64);
    const r = await pool.query(
      `INSERT INTO learnings (human_id, case_id, product_id, type, status, statement, source_decision_id, created_by, is_demo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [humanId, caseId, d.product_id || null, type, status, statement, d.id, userId, isDemo]
    );
    return r.rows[0];
  }

  /** CAMPANHA → DADOS → APRENDIZADO → NOVA HIPÓTESE. */
  async hypothesisFromLearning(pool: Pool, learningId: string, body: any, userId: string | null, isDemo: boolean) {
    const l = (await pool.query(`SELECT * FROM learnings WHERE id::text = $1 AND is_demo = $2`, [learningId, isDemo])).rows[0];
    if (!l) throw new MethodError(404, 'Aprendizado não encontrado.');
    if (!l.case_id) throw new MethodError(400, 'O aprendizado não está ligado a um caso.');
    return this.createHypothesis(pool, l.case_id, { ...body, status: 'PROPOSTA' }, userId, isDemo, l.id);
  }

  // ---------------- measurement
  private perfCache: { at: number; isDemo: boolean; rows: IntelRow[] } | null = null;
  private async adRows(pool: Pool, isDemo: boolean): Promise<IntelRow[]> {
    if (this.perfCache && this.perfCache.isDemo === isDemo && Date.now() - this.perfCache.at < 30_000) return this.perfCache.rows;
    const base = await this.intel.getCampaignBase(pool, { level: 'ad', is_demo: isDemo });
    this.perfCache = { at: Date.now(), isDemo, rows: base.rows };
    return base.rows;
  }

  private async linkedAdIds(pool: Pool, creative: { id: string; utm_content_key?: string | null }, isDemo: boolean, rows: IntelRow[]) {
    const ids = new Set<string>((await pool.query(`SELECT meta_ad_id FROM creative_meta_ads WHERE creative_id = $1`, [creative.id])).rows.map(r => String(r.meta_ad_id)));
    if (creative.utm_content_key) for (const r of rows) if (r.name === creative.utm_content_key && r.meta_id) ids.add(String(r.meta_id));
    return ids;
  }

  /** Métricas de um criativo. Métrica sem dado é null (nunca 0). */
  async measurementFor(pool: Pool, creative: { id: string; utm_content_key?: string | null }, isDemo: boolean) {
    const rows = await this.adRows(pool, isDemo);
    const ids = await this.linkedAdIds(pool, creative, isDemo, rows);
    const mine = rows.filter(r => r.meta_id && ids.has(String(r.meta_id)));
    return MethodService.summarize(mine, [...ids]);
  }

  static summarize(rows: IntelRow[], adIds: string[]) {
    if (!rows.length) {
      return { meta_ad_ids: adIds, data_level: 'SEM_DADOS' as DataLevel, metrics: null, note: adIds.length ? 'Anúncio sem dados no período' : 'Criativo não publicado' };
    }
    let t: BaseTotals = rows[0].totals;
    for (const r of rows.slice(1)) t = addTotals(t, r.totals);
    const m = deriveMetrics(t);
    const level = dataLevelOf({ spend: t.spend, impressions: t.impressions }, m.breakeven_cpa);
    const has = t.spend > 0 || t.impressions > 0;
    const nz = (v: number) => (has ? v : null);
    return {
      meta_ad_ids: adIds,
      data_level: level,
      metrics: {
        investimento: nz(Math.round(t.spend * 100) / 100),
        impressoes: nz(t.impressions),
        cpm: m.cpm,
        cliques: nz(t.link_clicks),
        ctr: m.ctr_link,
        cpc: m.cpc_link,
        visitas: nz(t.landing_page_views),
        checkout: nz(t.checkouts_norqva || t.initiate_checkouts),
        compras: nz(t.sales),
        conversao: m.cvr,
        receita: nz(Math.round(t.revenue * 100) / 100),
        cac: m.cpa,
        roas: m.roas
      },
      note: level === 'DADOS_CONFIAVEIS' ? 'Classificação heurística (não é significância estatística).' : level === 'DADOS_INSUFICIENTES' ? 'Amostra pequena: não conclua ainda.' : 'Sem dados.'
    };
  }

  // ---------------- case view
  private async structureSignals(pool: Pool, offer: any, isDemo: boolean) {
    const since = new Date(Date.now() - 30 * 86400000);
    const views = offer
      ? (await pool.query(`SELECT COUNT(*)::int AS n FROM commercial_funnel_events WHERE offer_id = $1 AND event_type = 'OFFER_VIEW' AND is_demo = $2 AND created_at >= $3`, [offer.id, isDemo, since]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n
      : 0;
    const purchases = (await pool.query(`SELECT COUNT(*)::int AS n FROM capi_events WHERE event_name = 'Purchase' AND status = 'SENT' AND is_demo = $1 AND created_at >= $2`, [isDemo, since]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    const pageWorking = !!offer && ['ATIVA', 'TESTE'].includes(String(offer.status)) && views > 0;
    const checkoutReady = isDemo ? true : !!process.env.ASAAS_API_KEY && process.env.ALLOW_PRODUCTION_PAYMENTS === 'true';
    return { views30d: views, purchasesSent30d: purchases, pageWorking, checkoutReady, pixelVerified: purchases > 0 };
  }

  async getCase(pool: Pool, id: string, isDemo: boolean) {
    const c = await this.getCaseRow(pool, id, isDemo);
    const product = (await pool.query(`SELECT id, human_id, name, category, description FROM products WHERE id = $1`, [c.product_id])).rows[0];
    const offer = c.offer_id ? (await pool.query(`SELECT id, human_id, name, price, promotional_price, status FROM offers WHERE id = $1`, [c.offer_id])).rows[0] : null;
    const [notesR, hypR, crR, decR, learnR, plansR, oppR] = await Promise.all([
      pool.query(`SELECT * FROM method_stage_notes WHERE case_id = $1`, [c.id]),
      pool.query(`SELECT * FROM creative_hypotheses WHERE case_id = $1 AND is_demo = $2 ORDER BY created_at`, [c.id, isDemo]),
      pool.query(
        `SELECT id, human_id, hook, angle, audience, format, version, script, file_url, primary_text, headline, approval_status, utm_content_key, hypothesis_id, batch_code
         FROM creatives WHERE is_demo = $1 AND COALESCE(is_deleted, FALSE) = FALSE AND (offer_id = $2 OR product_id = $3) ORDER BY human_id`,
        [isDemo, c.offer_id, c.product_id]
      ),
      pool.query(`SELECT d.* FROM creative_decisions d JOIN creatives cr ON cr.id = d.creative_id WHERE d.is_demo = $1 AND (cr.offer_id = $2 OR cr.product_id = $3) ORDER BY d.decided_at DESC`, [isDemo, c.offer_id, c.product_id]),
      pool.query(`SELECT * FROM learnings WHERE is_demo = $1 AND (case_id = $2 OR product_id = $3) ORDER BY created_at DESC`, [isDemo, c.id, c.product_id]),
      offer ? pool.query(`SELECT id, code, status, spec, guard_state FROM launch_plans WHERE offer_human_id = $1`, [offer.human_id]) : Promise.resolve({ rows: [] as any[] }),
      pool.query(`SELECT id, human_id, status, verdict, validation_verdict FROM campaign_opportunities WHERE product_id = $1 AND is_demo = $2`, [c.product_id, isDemo]).catch(() => ({ rows: [] as any[] }))
    ]);
    const signals = await this.structureSignals(pool, offer, isDemo);
    const rows = await this.adRows(pool, isDemo);
    const decidedIds = new Set(decR.rows.map(d => String(d.creative_id)));
    const plans = plansR.rows.map(p => ({ ...p, spec: typeof p.spec === 'string' ? JSON.parse(p.spec) : p.spec }));
    const planAdNames = new Set<string>(plans.flatMap(p => (p.spec?.ads || []).map((a: any) => String(a.name))));
    const operatorAnswered = plans.some(p => ['APPROVED', 'ACTIVE'].includes(p.status));
    const hypById = new Map(hypR.rows.map(h => [String(h.id), h]));
    const linkedAdIdsAll = new Set<string>();

    const creatives = [];
    for (const cr of crR.rows) {
      const ids = await this.linkedAdIds(pool, cr, isDemo, rows);
      ids.forEach(x => linkedAdIdsAll.add(x));
      const measurement = MethodService.summarize(rows.filter(r => r.meta_id && ids.has(String(r.meta_id))), [...ids]);
      const hypothesis = cr.hypothesis_id ? hypById.get(String(cr.hypothesis_id)) || null : null;
      const checklist = prePublicationChecklist({
        product: !!product,
        audience: !!(c.audience_summary || cr.audience || hypothesis?.audience),
        offer: !!offer && Number(offer.price) > 0,
        hypothesis: !!cr.hypothesis_id,
        creativeApproved: cr.approval_status === 'APPROVED',
        pageWorking: signals.pageWorking,
        checkoutReady: signals.checkoutReady,
        pixelVerified: signals.pixelVerified,
        utm: !!cr.utm_content_key,
        campaignStructured: !!cr.utm_content_key && planAdNames.has(String(cr.utm_content_key)),
        governance: cr.approval_status === 'APPROVED' && operatorAnswered
      });
      creatives.push({
        ...cr,
        hypothesis: hypothesis ? { id: hypothesis.id, human_id: hypothesis.human_id, statement: hypothesis.statement, status: hypothesis.status } : null,
        pipeline: pipelineStageOf({ ...cr, published: ids.size > 0, measured: measurement.data_level !== 'SEM_DADOS', decided: decidedIds.has(String(cr.id)) }),
        measurement,
        checklist
      });
    }
    // Anúncios do produto na Meta que não são criativos da Fábrica (ex.: CONTROL): aparecem sem hipótese.
    const externalAds = rows
      .filter(r => r.product_id === c.product_id && r.meta_id && !linkedAdIdsAll.has(String(r.meta_id)))
      .map(r => ({ meta_ad_id: r.meta_id, name: r.name, campaign_name: r.campaign_name, status: r.status, hypothesis: null, readiness: 'NAO_PRONTO', measurement: MethodService.summarize([r], [String(r.meta_id)]) }));

    const notes = new Map(notesR.rows.map(n => [Number(n.stage), n]));
    const stage = (n: number, status: StageStatus, progress: number, pending: string[], evidence: string[]) => {
      const note = notes.get(n);
      const def = STAGES[n - 1];
      return {
        ...def,
        status: note?.blocked ? 'BLOQUEADO' : status,
        progress: note?.blocked ? progress : progress,
        pending,
        evidence: [...evidence, ...(note?.evidence_refs ? (typeof note.evidence_refs === 'string' ? JSON.parse(note.evidence_refs) : note.evidence_refs) : [])],
        owner_id: note?.owner_id || c.owner_id || null,
        notes: note?.notes || null
      };
    };
    const hyps = hypR.rows;
    const anyMeasured = creatives.some(x => x.measurement.data_level !== 'SEM_DADOS') || externalAds.some(x => x.measurement.data_level !== 'SEM_DADOS');
    const anyReliable = creatives.some(x => x.measurement.data_level === 'DADOS_CONFIAVEIS') || externalAds.some(x => x.measurement.data_level === 'DADOS_CONFIAVEIS');
    const structureOk = [signals.pageWorking, signals.checkoutReady, signals.pixelVerified];
    const linked = creatives.filter(x => x.hypothesis_id).length;

    const stages = [
      stage(1, product && offer ? 'CONCLUIDO' : product ? 'EM_ANDAMENTO' : 'NAO_INICIADO', product && offer ? 100 : 50, offer ? [] : ['PENDENTE: oferta'], [product ? `Produto ${product.human_id} · ${product.name}` : '', offer ? `Oferta ${offer.human_id} · R$ ${Number(offer.promotional_price ?? offer.price).toFixed(2)}` : ''].filter(Boolean)),
      stage(2, c.audience_summary && c.problem_desire ? 'CONCLUIDO' : c.audience_summary || c.problem_desire ? 'EM_ANDAMENTO' : 'NAO_INICIADO', (c.audience_summary ? 50 : 0) + (c.problem_desire ? 50 : 0), [!c.audience_summary ? 'PENDENTE: público' : '', !c.problem_desire ? 'PENDENTE: problema/desejo' : ''].filter(Boolean), []),
      stage(3, oppR.rows.some(o => o.validation_verdict || o.verdict) ? 'CONCLUIDO' : oppR.rows.length ? 'EM_ANDAMENTO' : 'NAO_INICIADO', oppR.rows.length ? 60 : 0, oppR.rows.length ? [] : ['PENDENTE: nenhuma pesquisa ligada ao produto (Base de campanhas / Time de IAs)'], oppR.rows.map(o => `${o.human_id}: ${o.status}${o.validation_verdict ? ` · validador ${o.validation_verdict}` : ''}`)),
      stage(4, c.proposition_status === 'VALIDADO' ? 'CONCLUIDO' : c.proposition_status === 'REJEITADO' ? 'BLOQUEADO' : offer ? 'EM_ANDAMENTO' : 'NAO_INICIADO', c.proposition_status === 'VALIDADO' ? 100 : offer ? 50 : 0, c.proposition_status === 'VALIDADO' ? [] : ['NÃO VALIDADO: proposta central é hipótese de oferta'], c.central_proposition ? [`Proposta (${c.proposition_status}): ${c.central_proposition}`] : []),
      stage(5, !hyps.length ? 'NAO_INICIADO' : creatives.length && linked === creatives.length ? 'PRONTO' : 'EM_ANDAMENTO', creatives.length ? Math.round((linked / creatives.length) * 100) : hyps.length ? 50 : 0, [...(hyps.length ? [] : ['PENDENTE: nenhuma hipótese registrada']), ...creatives.filter(x => !x.hypothesis_id).map(x => `${x.human_id}: sem hipótese`), ...externalAds.map(x => `${x.name}: anúncio fora da Fábrica, sem hipótese`)], hyps.map(h => `${h.human_id} (${h.status}): ${h.statement}`)),
      stage(6, !creatives.length ? 'NAO_INICIADO' : creatives.some(x => x.checklist.ready) ? 'PRONTO' : 'EM_ANDAMENTO', creatives.length ? Math.round((creatives.filter(x => x.approval_status === 'APPROVED').length / creatives.length) * 100) : 0, creatives.filter(x => x.approval_status !== 'APPROVED').map(x => `${x.human_id}: ${x.pipeline}`), creatives.filter(x => x.approval_status === 'APPROVED').map(x => `${x.human_id}: aprovado`)),
      stage(7, structureOk.every(Boolean) ? 'PRONTO' : 'EM_ANDAMENTO', Math.round((structureOk.filter(Boolean).length / 3) * 100), [!signals.pageWorking ? 'PENDENTE: página sem visitas recentes ou oferta inativa' : '', !signals.checkoutReady ? 'PENDENTE: checkout de produção' : '', !signals.pixelVerified ? 'PENDENTE: compras não chegaram à Meta nos últimos 30 dias' : ''].filter(Boolean), [`Visitas à oferta (30 dias): ${signals.views30d}`, `Compras enviadas à Meta (30 dias): ${signals.purchasesSent30d}`]),
      stage(8, plans.some(p => p.status === 'ACTIVE') ? 'CONCLUIDO' : plans.length ? 'EM_ANDAMENTO' : 'NAO_INICIADO', plans.some(p => p.status === 'ACTIVE') ? 100 : plans.length ? 50 : 0, plans.length ? [] : ['PENDENTE: sem plano de lançamento'], plans.map(p => `${p.code}: ${p.status}${p.guard_state ? ` · teto ${p.guard_state}` : ''}`)),
      stage(9, anyReliable ? 'CONCLUIDO' : anyMeasured ? 'EM_ANDAMENTO' : 'NAO_INICIADO', anyReliable ? 100 : anyMeasured ? 50 : 0, anyReliable ? [] : [anyMeasured ? 'DADOS INSUFICIENTES' : 'SEM DADOS'], []),
      stage(10, decR.rows.length && learnR.rows.length ? 'CONCLUIDO' : decR.rows.length ? 'EM_ANDAMENTO' : 'NAO_INICIADO', decR.rows.length && learnR.rows.length ? 100 : decR.rows.length ? 50 : 0, decR.rows.length ? (learnR.rows.length ? [] : ['PENDENTE: registrar o aprendizado']) : ['PENDENTE: nenhuma decisão registrada'], decR.rows.slice(0, 5).map(d => `${d.decision} (${d.confidence}, ${d.data_level}): ${d.reason}`))
    ];

    return {
      principles: PRINCIPLES,
      case: c,
      product,
      offer,
      stages,
      hypotheses: hyps,
      creatives,
      external_ads: externalAds,
      decisions: decR.rows,
      learnings: learnR.rows,
      launch_plans: plans.map(p => ({ id: p.id, code: p.code, status: p.status, guard_state: p.guard_state })),
      signals
    };
  }
}
