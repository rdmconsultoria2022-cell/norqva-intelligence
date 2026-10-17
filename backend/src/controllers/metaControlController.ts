import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { writeAuditLog } from '../db/audit';
import { beginDecision, decisionContextFromRequest, DecisionAuditError, metaIdsOfPlan } from '../db/decisionEvents';
import {
  MetaMutatingClient,
  MetaMutatingSecurityContext,
  META_MIN_DAILY_BUDGET_BRL,
  getMaxDailyBudgetBRL
} from '../services/meta/metaMutatingClient';

// NORQVA-0006: campaign control from NORQVA (replaces the on/off toggle and daily budget edit in
// Ads Manager). ADMIN only (route level). Fail-closed: META_MUTATION_ENABLED must be 'true' and the
// Meta token must pass the live preflight (token valid, ads_management, ad account access).

const ENTITY_TYPES: Record<string, 'CAMPAIGN' | 'ADSET' | 'AD'> = {
  campaign: 'CAMPAIGN',
  adset: 'ADSET',
  ad: 'AD'
};

const CHECK_LABELS: Record<string, string> = {
  TOKEN_VALID: 'token válido',
  ADS_READ: 'permissão ads_read',
  ADS_MANAGEMENT: 'permissão ads_management',
  AD_ACCOUNT_ACCESS: 'acesso à conta de anúncios',
  PIXEL_ACCESS: 'acesso ao pixel',
  META_MUTATION_CREDENTIAL_READY: 'credencial pronta para alterações'
};

let clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
export function setMetaControlClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  clientFactory = factory || (() => new MetaMutatingClient());
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

function contextFor(req: AuthenticatedRequest): MetaMutatingSecurityContext {
  return {
    userId: req.user?.id || '',
    userRole: req.user?.role || '',
    isDemo: isDemoReq(req)
  };
}

export function translateMetaControlError(err: any): { status: number; error: string } {
  const msg = String(err?.message || '');
  if (msg.includes('strictly disabled by feature flag')) {
    return {
      status: 409,
      error: 'O controle de campanhas está desligado. Para ligar, defina META_MUTATION_ENABLED=true no Render.'
    };
  }
  if (msg.includes('Credential pre-flight checks failed')) {
    const inside = msg.match(/\(([^)]*)\)/)?.[1] || '';
    const labels = inside
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((c) => CHECK_LABELS[c] || c);
    return {
      status: 409,
      error: `A credencial da Meta não passou na verificação (${labels.join(', ')}). O token do Render precisa da permissão ads_management na conta de anúncios.`
    };
  }
  if (msg.startsWith('[VALIDATION EXCEPTION]')) {
    const detail = msg.replace('[VALIDATION EXCEPTION]:', '').trim();
    if (detail.includes('exceeds the NORQVA ceiling')) {
      return { status: 400, error: `Orçamento acima do teto do NORQVA (R$ ${getMaxDailyBudgetBRL().toFixed(2)}/dia).` };
    }
    if (detail.includes('must be at least')) {
      return { status: 400, error: `O orçamento diário mínimo é R$ ${META_MIN_DAILY_BUDGET_BRL.toFixed(2)}.` };
    }
    if (detail.includes('not found')) {
      return { status: 404, error: 'Item não encontrado. Sincronize com a Meta e tente de novo.' };
    }
    if (detail.includes('Budget is set at campaign level')) {
      return { status: 400, error: 'O orçamento desta campanha fica no nível da campanha (Advantage+). Altere o orçamento da campanha.' };
    }
    if (detail.includes('no daily budget at campaign level')) {
      return {
        status: 400,
        error: 'Esta campanha não tem orçamento diário no nível da campanha (ou os dados não foram sincronizados). Sincronize, ou altere o orçamento do conjunto.'
      };
    }
    if (detail.includes('lifetime budget')) {
      return { status: 400, error: 'Este item usa orçamento total, não diário. Altere no Gerenciador de Anúncios.' };
    }
    return { status: 400, error: detail };
  }
  if (msg.startsWith('[META GRAPH API ERROR]')) {
    return { status: 502, error: `A Meta recusou a alteração: ${msg.replace('[META GRAPH API ERROR]:', '').trim()}` };
  }
  if (msg.startsWith('[META TIMEOUT EXCEPTION]')) {
    return { status: 504, error: 'A Meta não respondeu a tempo. Confira no Gerenciador antes de tentar de novo.' };
  }
  return { status: 500, error: 'Falha ao alterar a campanha na Meta.' };
}

export async function getMetaControlStatus(req: AuthenticatedRequest, res: Response) {
  try {
    const enabled = process.env.META_MUTATION_ENABLED === 'true';
    const limits = { minDailyBudget: META_MIN_DAILY_BUDGET_BRL, maxDailyBudget: getMaxDailyBudgetBRL() };

    if (isDemoReq(req)) {
      return res.status(200).json({ enabled, ready: enabled, mode: 'demo', failedChecks: [], limits });
    }
    if (!enabled) {
      return res.status(200).json({ enabled, ready: false, mode: 'real', failedChecks: [], limits });
    }

    const client = clientFactory();
    const preflight = await client.getLivePreflightStatus(req.query.refresh === '1');
    const failedChecks = MetaMutatingClient.failedPreflightChecks(preflight, { requirePixel: false }).map((c) => ({
      code: c,
      label: CHECK_LABELS[c] || c
    }));
    return res.status(200).json({ enabled, ready: failedChecks.length === 0, mode: 'real', failedChecks, limits });
  } catch (err) {
    console.error('[META CONTROL] status error', err);
    return res.status(500).json({ error: 'Falha ao verificar o controle de campanhas.' });
  }
}

/** H1: registra a decisão antes de executar; 503 sem execução se a auditoria estiver indisponível. */
async function beginEntityDecision(req: AuthenticatedRequest, res: Response, action: string, decision: string, riskReducing = false) {
  try {
    return await beginDecision(
      req.app.get('db'),
      decisionContextFromRequest(req),
      { action, decision: decision.slice(0, 60) || null, metaIds: [String(req.params.id || '')] },
      { riskReducing }
    );
  } catch (err) {
    if (err instanceof DecisionAuditError) {
      res.status(503).json({ error: err.message });
      return null;
    }
    console.error('[DECISION AUDIT] unexpected error before execution — nothing executed', err);
    res.status(500).json({ error: 'Falha ao registrar a decisão. Nada foi executado.' });
    return null;
  }
}

/**
 * NORQVA-0028: a aba Controle de uma campanha manda scope_campaign (ID da campanha na Meta).
 * Com ele, só objetos daquela campanha são aceitos.
 */
async function outsideCampaignScope(pool: Pool, entityType: 'CAMPAIGN' | 'ADSET' | 'AD', id: string, scope: unknown, isDemo: boolean): Promise<boolean> {
  if (scope === undefined || scope === null || scope === '') return false;
  const sc = String(scope);
  if (entityType === 'CAMPAIGN') return String(id) !== sc;
  const sql =
    entityType === 'ADSET'
      ? `SELECT 1 FROM meta_ad_sets s JOIN meta_campaigns c ON c.id = s.campaign_id
         WHERE s.meta_adset_id = $1 AND c.meta_campaign_id = $2 AND c.is_demo = $3 LIMIT 1`
      : `SELECT 1 FROM meta_ads a JOIN meta_ad_sets s ON s.id = a.adset_id JOIN meta_campaigns c ON c.id = s.campaign_id
         WHERE a.meta_ad_id = $1 AND c.meta_campaign_id = $2 AND c.is_demo = $3 LIMIT 1`;
  const r = await pool.query(sql, [String(id), sc, isDemo]);
  if (r.rows.length > 0) return false;
  // Objeto criado por um plano e ainda não sincronizado: vale o que o plano registrou em meta_ids.
  const plans = await pool.query(`SELECT meta_ids FROM launch_plans WHERE meta_ids::text LIKE $1`, [`%"${sc.replace(/[^0-9A-Za-z_]/g, '')}"%`]);
  const key = entityType === 'ADSET' ? 'adsets' : 'ads';
  return !plans.rows.some((p: any) => {
    const ids = typeof p.meta_ids === 'string' ? JSON.parse(p.meta_ids) : p.meta_ids || {};
    return Object.values(ids.campaign || {}).map(String).includes(sc) && Object.values(ids[key] || {}).map(String).includes(String(id));
  });
}

const SCOPE_ERROR = 'Este objeto não pertence a esta campanha. Nada foi alterado.';
const SCOPE_CHECK_ERROR = 'Não foi possível conferir se este objeto é desta campanha. Nada foi alterado; tente de novo.';

/**
 * NORQVA-0028: responde 409 (fora da campanha) ou 503 (consulta falhou) e devolve false; true = segue.
 * Pausa de emergência não é barrada por falha da consulta (só por objeto comprovadamente de outra campanha).
 */
async function passesCampaignScope(
  req: AuthenticatedRequest,
  res: Response,
  decision: any,
  entityType: 'CAMPAIGN' | 'ADSET' | 'AD',
  isEmergencyPause = false
): Promise<boolean> {
  const pool: Pool = req.app.get('db');
  let outside: boolean;
  try {
    outside = await outsideCampaignScope(pool, entityType, String(req.params.id), req.body?.scope_campaign, isDemoReq(req));
  } catch (err) {
    if (isEmergencyPause) {
      console.warn('[META CONTROL] conferência de escopo falhou; pausa segue por segurança', err);
      return true;
    }
    await decision.finish('REJECTED', { result: { http_status: 503 }, error: SCOPE_CHECK_ERROR });
    res.status(503).json({ error: SCOPE_CHECK_ERROR });
    return false;
  }
  if (outside) {
    await decision.finish('REJECTED', { result: { http_status: 409 }, error: SCOPE_ERROR });
    res.status(409).json({ error: SCOPE_ERROR });
    return false;
  }
  return true;
}


// NORQVA-0094: plano do NORQVA a que pertence um objeto da Meta (por ID da Meta ou ID interno).
const ENTITY_TABLE: Record<'CAMPAIGN' | 'ADSET' | 'AD', { table: string; idCol: string }> = {
  CAMPAIGN: { table: 'meta_campaigns', idCol: 'meta_campaign_id' },
  ADSET: { table: 'meta_ad_sets', idCol: 'meta_adset_id' },
  AD: { table: 'meta_ads', idCol: 'meta_ad_id' }
};

function parseIds(v: any): Record<string, Record<string, string>> {
  const o = typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
  return o && typeof o === 'object' ? o : {};
}

export async function planOfEntity(pool: Pool, entityType: 'CAMPAIGN' | 'ADSET' | 'AD', id: string, isDemo: boolean): Promise<{ plan: any; metaId: string } | null> {
  const { table, idCol } = ENTITY_TABLE[entityType];
  const r = await pool.query(`SELECT ${idCol} AS meta_id FROM ${table} WHERE (${idCol} = $1 OR id::text = $1) AND is_demo = $2 LIMIT 1`, [id, isDemo]);
  const metaId = String(r.rows[0]?.meta_id || id);
  const plans = await pool.query(
    `SELECT id, code, status, guard_state, spec, meta_ids, daily_budget_brl, max_spend_brl, spent_brl_last, operator_paused_at
     FROM launch_plans WHERE meta_ids IS NOT NULL AND meta_ids::text <> '{}'`
  );
  const plan = plans.rows.find((p: any) => metaIdsOfPlan(parseIds(p.meta_ids)).includes(metaId));
  return plan ? { plan, metaId } : null;
}

function isPlanCampaign(plan: any, metaId: string): boolean {
  return Object.values(parseIds(plan.meta_ids).campaign || {}).map(String).includes(metaId);
}

export async function setMetaEntityStatus(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const entityType = ENTITY_TYPES[String(req.params.entityType || '').toLowerCase()];
  const status = String(req.body?.status || '').toUpperCase();
  // Fail-safe só para PAUSED de um tipo válido: falha de auditoria bloqueia ações que aumentam
  // exposição, mas não impede uma pausa de emergência. ACTIVE (ou qualquer outro valor) é fail-closed.
  const isEmergencyPause = Boolean(entityType) && status === 'PAUSED';
  const decision = await beginEntityDecision(req, res, 'META_ENTITY_STATUS', `${entityType || String(req.params.entityType || '').slice(0, 20)}:${status}`, isEmergencyPause);
  if (!decision) return;
  if (!entityType || (status !== 'ACTIVE' && status !== 'PAUSED')) {
    const error = !entityType ? 'Tipo inválido. Use campaign, adset ou ad.' : 'Status inválido. Use ACTIVE ou PAUSED.';
    await decision.finish('REJECTED', { result: { http_status: 400 }, error });
    return res.status(400).json({ error });
  }
  if (!(await passesCampaignScope(req, res, decision, entityType, isEmergencyPause))) return;
  // H7: objetos de um plano que atingiu o teto (CAPPED) não podem ser reativados por aqui.
  if (status === 'ACTIVE') {
    const capped = await pool.query(`SELECT code, meta_ids FROM launch_plans WHERE guard_state = 'CAPPED'`).catch(() => ({ rows: [] as any[] }));
    const hit = capped.rows.find((p: any) => metaIdsOfPlan(typeof p.meta_ids === 'string' ? JSON.parse(p.meta_ids) : p.meta_ids).includes(String(req.params.id)));
    // NORQVA-0027: objetos de uma campanha que ainda não recebeu o Sim (ou recebeu Não) só ativam pela resposta Sim.
    let unapproved: { rows: any[] };
    try {
      unapproved = await pool.query(`SELECT code, status, meta_ids FROM launch_plans WHERE status IN ('CREATING', 'CREATED_PAUSED', 'AWAITING_OPERATOR', 'REJECTED', 'FAILED')`);
    } catch {
      const error = 'Não foi possível conferir se este objeto pertence a uma campanha que espera o seu Sim. Nada foi ativado; tente de novo.';
      await decision.finish('REJECTED', { result: { http_status: 503 }, error });
      return res.status(503).json({ error });
    }
    const waiting = unapproved.rows.find((p: any) => metaIdsOfPlan(typeof p.meta_ids === 'string' ? JSON.parse(p.meta_ids) : p.meta_ids).includes(String(req.params.id)));
    if (!hit && waiting) {
      const error =
        waiting.status === 'REJECTED'
          ? `Este objeto é da campanha ${waiting.code}, que você recusou. Para veicular, crie uma campanha nova.`
          : `Este objeto é da campanha ${waiting.code}, que ainda espera o seu Sim. Ative respondendo Sim na campanha.`;
      await decision.finish('REJECTED', { result: { http_status: 409 }, error });
      return res.status(409).json({ error });
    }
    if (hit) {
      const error = `Este objeto pertence ao plano ${hit.code}, que atingiu o teto e foi pausado pelo vigia. Reabrir exige um novo plano com teto novo.`;
      await decision.finish('REJECTED', { result: { http_status: 409 }, error });
      return res.status(409).json({ error });
    }
    // NORQVA-0094: campanha de plano pausada pela tela só volta com o código do plano digitado (vale como novo Sim).
    let owner: { plan: any; metaId: string } | null;
    try {
      owner = await planOfEntity(pool, entityType, String(req.params.id), isDemoReq(req));
    } catch {
      const error = 'Não foi possível conferir a qual plano este objeto pertence. Nada foi ativado; tente de novo.';
      await decision.finish('REJECTED', { result: { http_status: 503 }, error });
      return res.status(503).json({ error });
    }
    if (owner && entityType === 'CAMPAIGN' && owner.plan.operator_paused_at && isPlanCampaign(owner.plan, owner.metaId)) {
      const code = String(req.body?.confirm_code || '').trim().toUpperCase();
      if (code !== String(owner.plan.code).toUpperCase()) {
        const error = `A campanha do plano ${owner.plan.code} foi pausada pela tela. Para reativar, digite o código ${owner.plan.code}: vale como um novo Sim.`;
        await decision.finish('REJECTED', { result: { http_status: 409 }, error });
        return res.status(409).json({ error, needs_confirm_code: owner.plan.code });
      }
      const spent = owner.plan.spent_brl_last === null || owner.plan.spent_brl_last === undefined ? null : parseFloat(owner.plan.spent_brl_last);
      const cap = parseFloat(owner.plan.max_spend_brl);
      if (spent !== null && Number.isFinite(cap) && spent >= cap) {
        const error = `O plano ${owner.plan.code} já gastou o teto (R$ ${cap.toFixed(2)}). Para continuar, suba o teto em Teto e vigia.`;
        await decision.finish('REJECTED', { result: { http_status: 409 }, error });
        return res.status(409).json({ error });
      }
    }
  }

  try {
    const result = await clientFactory().setEntityStatus(pool, entityType, String(req.params.id), status, contextFor(req));
    const recorded = await decision.finish('EXECUTED', { result });
    const extra = entityType === 'CAMPAIGN' ? await syncPlanPauseState(pool, req, String(result.entityId), status) : {};
    return res.status(200).json(recorded ? { ...(result as any), ...extra } : { ...(result as any), ...extra, audit_incomplete: true });
  } catch (err: any) {
    const t = translateMetaControlError(err);
    if (t.status === 500) console.error('[META CONTROL] status change error', err);
    await decision.finish(t.status >= 500 ? 'FAILED' : 'REJECTED', { result: { http_status: t.status }, error: err?.message || t.error });
    return res.status(t.status).json({ error: t.error });
  }
}


// NORQVA-0094: depois de pausar ou reativar a campanha de um plano pela tela, registra no plano.
// Nunca derruba a resposta: a pausa na Meta já aconteceu.
async function syncPlanPauseState(pool: Pool, req: AuthenticatedRequest, metaId: string, status: string): Promise<Record<string, unknown>> {
  try {
    const owner = await planOfEntity(pool, 'CAMPAIGN', metaId, isDemoReq(req));
    if (!owner || !isPlanCampaign(owner.plan, owner.metaId)) return {};
    const p = owner.plan;
    if (status === 'PAUSED' && ['ACTIVE', 'APPROVED'].includes(p.status) && !p.operator_paused_at) {
      await pool.query(`UPDATE launch_plans SET operator_paused_at = NOW(), operator_paused_by = $2, updated_at = NOW() WHERE id = $1`, [p.id, req.user?.id || null]);
      await writeAuditLog(pool, req.user?.id || null, 'LAUNCH_PLAN_PAUSED_BY_OPERATOR', `Plano ${p.code}: campanha pausada pela tela. Reativar pede o código do plano.`, p.status, 'PAUSED');
      return { plan_paused: p.code };
    }
    if (status === 'ACTIVE' && p.operator_paused_at) {
      await pool.query(`UPDATE launch_plans SET operator_paused_at = NULL, operator_paused_by = NULL, updated_at = NOW() WHERE id = $1`, [p.id]);
      await writeAuditLog(pool, req.user?.id || null, 'LAUNCH_PLAN_RESUMED_BY_OPERATOR', `Plano ${p.code}: campanha reativada pela tela com o código do plano.`, 'PAUSED', 'ACTIVE');
      return { plan_resumed: p.code };
    }
    return {};
  } catch (err) {
    console.error('[META CONTROL] não registrou a pausa no plano', err);
    return { plan_sync_failed: true };
  }
}

// NORQVA-0094: orçamento mudado pela tela também muda o plano, para o vigia projetar o gasto certo.
async function syncPlanBudget(pool: Pool, req: AuthenticatedRequest, owner: { plan: any; metaId: string } | null, entityType: 'CAMPAIGN' | 'ADSET', amount: number): Promise<Record<string, unknown>> {
  if (!owner) return {};
  try {
    const p = owner.plan;
    const spec = typeof p.spec === 'string' ? JSON.parse(p.spec || '{}') : p.spec || {};
    const ids = parseIds(p.meta_ids);
    let total: number;
    if (entityType === 'ADSET') {
      const name = Object.entries(ids.adsets || {}).find(([, v]) => String(v) === owner.metaId)?.[0];
      if (!name || !Array.isArray(spec.adsets)) return {};
      spec.adsets = spec.adsets.map((a: any) => (a?.name === name ? { ...a, daily_budget_brl: amount } : a));
      total = Math.round(spec.adsets.reduce((s: number, a: any) => s + (Number(a?.daily_budget_brl) || 0), 0) * 100) / 100;
    } else {
      if (!isPlanCampaign(p, owner.metaId)) return {};
      total = amount;
    }
    const before = parseFloat(p.daily_budget_brl);
    await pool.query(`UPDATE launch_plans SET spec = $2, daily_budget_brl = $3, updated_at = NOW() WHERE id = $1`, [p.id, JSON.stringify(spec), total]);
    await writeAuditLog(pool, req.user?.id || null, 'LAUNCH_PLAN_BUDGET_SYNCED', `Plano ${p.code}: orçamento diário atualizado pela tela.`, String(before), String(total));
    return { plan_daily_budget: total };
  } catch (err) {
    console.error('[META CONTROL] não atualizou o orçamento do plano', err);
    return { plan_sync_failed: true };
  }
}

export async function setMetaEntityDailyBudget(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const entityType = ENTITY_TYPES[String(req.params.entityType || '').toLowerCase()];
  const amount = Number(req.body?.daily_budget);
  const decision = await beginEntityDecision(req, res, 'META_ENTITY_DAILY_BUDGET', `${entityType || String(req.params.entityType || '').slice(0, 20)}:${String(req.body?.daily_budget ?? '').slice(0, 20)}`);
  if (!decision) return;
  if (entityType !== 'CAMPAIGN' && entityType !== 'ADSET') {
    const error = 'Orçamento só pode ser alterado em campanha ou conjunto.';
    await decision.finish('REJECTED', { result: { http_status: 400 }, error });
    return res.status(400).json({ error });
  }
  if (!Number.isFinite(amount)) {
    const error = 'Informe o orçamento diário em reais.';
    await decision.finish('REJECTED', { result: { http_status: 400 }, error });
    return res.status(400).json({ error });
  }
  if (!(await passesCampaignScope(req, res, decision, entityType))) return;

  // NORQVA-0094: plano que bateu o teto não muda orçamento por aqui; a conferência é fail-closed.
  let owner: { plan: any; metaId: string } | null;
  try {
    owner = await planOfEntity(pool, entityType, String(req.params.id), isDemoReq(req));
  } catch {
    const error = 'Não foi possível conferir a qual plano este objeto pertence. Nada foi alterado; tente de novo.';
    await decision.finish('REJECTED', { result: { http_status: 503 }, error });
    return res.status(503).json({ error });
  }
  if (owner && owner.plan.guard_state === 'CAPPED') {
    const error = `Este objeto pertence ao plano ${owner.plan.code}, que atingiu o teto. Orçamento não muda por aqui; suba o teto em Teto e vigia.`;
    await decision.finish('REJECTED', { result: { http_status: 409 }, error });
    return res.status(409).json({ error });
  }

  try {
    const result = await clientFactory().setDailyBudget(pool, entityType, String(req.params.id), amount, contextFor(req));
    const recorded = await decision.finish('EXECUTED', { result });
    const extra = await syncPlanBudget(pool, req, owner, entityType, amount);
    return res.status(200).json(recorded ? { ...(result as any), ...extra } : { ...(result as any), ...extra, audit_incomplete: true });
  } catch (err: any) {
    const t = translateMetaControlError(err);
    if (t.status === 500) console.error('[META CONTROL] budget change error', err);
    await decision.finish(t.status >= 500 ? 'FAILED' : 'REJECTED', { result: { http_status: t.status }, error: err?.message || t.error });
    return res.status(t.status).json({ error: t.error });
  }
}

const AUDIT_ID = /^\d{6,25}$/;
const auditIds = (v: unknown): string[] =>
  String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** GET /api/meta-control/audit?campaigns=..&adsets=..&ads=.. — leitura ao vivo na Graph API (ADMIN, somente GET). */
export async function getMetaLiveAudit(req: AuthenticatedRequest, res: Response) {
  try {
    if (isDemoReq(req)) return res.status(400).json({ error: 'Auditoria ao vivo só existe no modo real.' });
    const input = { campaigns: auditIds(req.query.campaigns), adsets: auditIds(req.query.adsets), ads: auditIds(req.query.ads) };
    const all = [...input.campaigns, ...input.adsets, ...input.ads];
    if (all.length === 0 || all.length > 20 || all.some((id) => !AUDIT_ID.test(id))) {
      return res.status(400).json({ error: 'Informe de 1 a 20 IDs numéricos da Meta em campaigns, adsets e ads.' });
    }
    const result = await clientFactory().auditLive(input);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[META CONTROL] live audit error', err);
    return res.status(500).json({ error: 'Falha na auditoria ao vivo.' });
  }
}
