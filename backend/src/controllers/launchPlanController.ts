import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { LaunchPlanService, LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { translateMetaControlError } from './metaControlController';
import { beginDecision, decisionContextFromRequest, DecisionAuditError, DecisionHandle, metaIdsOfPlan } from '../db/decisionEvents';

// NORQVA-0019 (D-0010): planos de lançamento. O Claude cria tudo PAUSADO; o operador responde
// SIM/NÃO no NORQVA. Rotas ADMIN; a resposta exige sessão humana (nunca token de automação).

const service = new LaunchPlanService();

let clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
export function setLaunchPlanClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  clientFactory = factory || (() => new MetaMutatingClient());
}

function errorResponse(err: any, tag: string): { status: number; error: string } {
  if (err instanceof LaunchPlanError) return { status: err.status, error: err.message };
  const msg = String(err?.message || '');
  const t = translateMetaControlError(err);
  if (t.status !== 500) return t;
  if (msg.startsWith('[SECURITY EXCEPTION]')) {
    return { status: 403, error: `Bloqueado pela trava de segurança: ${msg.replace('[SECURITY EXCEPTION]:', '').trim()}` };
  }
  if (msg.startsWith('[META CONFIG EXCEPTION]')) {
    return { status: 409, error: `Configuração da Meta incompleta: ${msg.replace('[META CONFIG EXCEPTION]:', '').trim()}` };
  }
  console.error(`[LAUNCH PLANS] ${tag}`, err);
  return { status: 500, error: 'Falha ao processar o plano de lançamento.' };
}

function fail(res: Response, err: any, tag: string) {
  const r = errorResponse(err, tag);
  return res.status(r.status).json({ error: r.error });
}

/** H1: dados do plano para o registro de decisão (sem lançar se o plano não existir). */
async function planRef(pool: Pool, id: string): Promise<{ planId: string | null; planCode: string | null; metaIds: string[] }> {
  try {
    const plan: any = await service.get(pool, id);
    return { planId: plan.id, planCode: plan.code, metaIds: metaIdsOfPlan(plan.meta_ids) };
  } catch {
    return { planId: null, planCode: null, metaIds: [] };
  }
}

/** H1: resumo do resultado para decision_events (sem a spec inteira). */
const planOutcome = (plan: any) => ({
  status: plan?.status ?? null,
  answer: plan?.answer ?? null,
  decision_id: plan?.decision_id ?? null,
  experiment_id: plan?.experiment_id ?? null,
  last_error: plan?.last_error ?? null
});

const AUDIT_UNAVAILABLE = (res: Response, err: DecisionAuditError) => res.status(503).json({ error: err.message });

const userOf = (req: AuthenticatedRequest) => ({ id: req.user?.id || '', role: req.user?.role || '' });

export async function listLaunchPlans(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    return res.status(200).json({ plans: await service.list(pool, { status }) });
  } catch (err) {
    return fail(res, err, 'list');
  }
}

export async function getLaunchPlan(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await service.get(pool, String(req.params.id)));
  } catch (err) {
    return fail(res, err, 'get');
  }
}

export async function createLaunchPlan(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const { plan, created } = await service.createDraft(pool, req.body || {}, req.user?.id || null);
    return res.status(created ? 201 : 200).json(plan);
  } catch (err) {
    return fail(res, err, 'create draft');
  }
}

export async function createLaunchPlanOnMeta(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  if (req.query.mode === 'demo') return res.status(400).json({ error: 'Planos de lançamento só existem na conta REAL.' });
  const id = String(req.params.id);
  let decision: DecisionHandle;
  try {
    decision = await beginDecision(pool, decisionContextFromRequest(req), { action: 'LAUNCH_PLAN_CREATE_ON_META', decision: 'CREATE_PAUSED', ...(await planRef(pool, id)) });
  } catch (err) {
    if (err instanceof DecisionAuditError) return AUDIT_UNAVAILABLE(res, err);
    console.error('[DECISION AUDIT] unexpected error before execution — nothing executed', err);
    return res.status(500).json({ error: 'Falha ao registrar a decisão. Nada foi executado.' });
  }
  try {
    const result: any = await service.createOnMeta(pool, id, userOf(req), clientFactory());
    const recorded = await decision.finish('EXECUTED', { metaIds: metaIdsOfPlan(result?.plan?.meta_ids), result: planOutcome(result?.plan) });
    return res.status(200).json(recorded ? result : { ...result, audit_incomplete: true });
  } catch (err) {
    const r = errorResponse(err, 'create on Meta');
    const after = await planRef(pool, id);
    await decision.finish(r.status >= 500 ? 'FAILED' : 'REJECTED', { metaIds: after.metaIds, result: { http_status: r.status }, error: (err as any)?.message || r.error });
    return res.status(r.status).json({ error: r.error });
  }
}

export async function answerLaunchPlan(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const id = String(req.params.id);
  const requested = String(req.body?.answer ?? '').toUpperCase().slice(0, 20) || null;
  // H1: toda tentativa fica registrada ANTES de qualquer execução (inclusive as recusadas).
  let decision: DecisionHandle;
  try {
    decision = await beginDecision(pool, decisionContextFromRequest(req), { action: 'LAUNCH_PLAN_ANSWER', decision: requested, ...(await planRef(pool, id)) });
  } catch (err) {
    if (err instanceof DecisionAuditError) return AUDIT_UNAVAILABLE(res, err);
    console.error('[DECISION AUDIT] unexpected error before execution — nothing executed', err);
    return res.status(500).json({ error: 'Falha ao registrar a decisão. Nada foi executado.' });
  }
  // Somente sessão humana: chamadas com token de automação (rotina do Claude) nunca respondem.
  if (req.header('x-norqva-automation-token')) {
    const error = 'A resposta ao plano só pode ser dada pelo operador, na sessão dele. Tokens de automação não respondem.';
    await decision.finish('REJECTED', { result: { http_status: 403 }, error });
    return res.status(403).json({ error });
  }
  if (req.user?.role !== 'ADMIN') {
    const error = 'Somente um ADMIN pode responder.';
    await decision.finish('REJECTED', { result: { http_status: 403 }, error });
    return res.status(403).json({ error });
  }
  try {
    const result: any = await service.answer(pool, id, req.body?.answer, userOf(req), clientFactory());
    const recorded = await decision.finish('EXECUTED', { metaIds: metaIdsOfPlan(result?.plan?.meta_ids), result: planOutcome(result?.plan) });
    return res.status(200).json(recorded ? result : { ...result, audit_incomplete: true });
  } catch (err) {
    const r = errorResponse(err, 'answer');
    const after = await planRef(pool, id);
    await decision.finish(r.status >= 500 ? 'FAILED' : 'REJECTED', { metaIds: after.metaIds, result: { http_status: r.status }, error: (err as any)?.message || r.error });
    return res.status(r.status).json({ error: r.error });
  }
}
