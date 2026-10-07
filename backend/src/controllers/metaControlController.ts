import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
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
  // H7: objetos de um plano que atingiu o teto (CAPPED) não podem ser reativados por aqui.
  if (status === 'ACTIVE') {
    const capped = await pool.query(`SELECT code, meta_ids FROM launch_plans WHERE guard_state = 'CAPPED'`).catch(() => ({ rows: [] as any[] }));
    const hit = capped.rows.find((p: any) => metaIdsOfPlan(typeof p.meta_ids === 'string' ? JSON.parse(p.meta_ids) : p.meta_ids).includes(String(req.params.id)));
    if (hit) {
      const error = `Este objeto pertence ao plano ${hit.code}, que atingiu o teto e foi pausado pelo vigia. Reabrir exige um novo plano com teto novo.`;
      await decision.finish('REJECTED', { result: { http_status: 409 }, error });
      return res.status(409).json({ error });
    }
  }

  try {
    const result = await clientFactory().setEntityStatus(pool, entityType, String(req.params.id), status, contextFor(req));
    const recorded = await decision.finish('EXECUTED', { result });
    return res.status(200).json(recorded ? result : { ...(result as any), audit_incomplete: true });
  } catch (err: any) {
    const t = translateMetaControlError(err);
    if (t.status === 500) console.error('[META CONTROL] status change error', err);
    await decision.finish(t.status >= 500 ? 'FAILED' : 'REJECTED', { result: { http_status: t.status }, error: err?.message || t.error });
    return res.status(t.status).json({ error: t.error });
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

  try {
    const result = await clientFactory().setDailyBudget(pool, entityType, String(req.params.id), amount, contextFor(req));
    const recorded = await decision.finish('EXECUTED', { result });
    return res.status(200).json(recorded ? result : { ...(result as any), audit_incomplete: true });
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
