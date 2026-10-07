import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MethodService, MethodError } from '../services/method/methodService';
import { decisionContextFromRequest, DecisionAuditError } from '../db/decisionEvents';

// NORQVA-0022 — Método NORQVA. Só leitura e registros internos; nenhuma chamada à Meta.

let service = new MethodService();
export function setMethodServiceForTesting(s: MethodService | null) {
  service = s || new MethodService();
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';
const uid = (req: AuthenticatedRequest) => req.user?.id || null;

function wrap(tag: string, fn: (req: AuthenticatedRequest, pool: Pool) => Promise<{ status?: number; body: any }>) {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const out = await fn(req, req.app.get('db'));
      return res.status(out.status || 200).json(out.body);
    } catch (err: any) {
      if (err instanceof MethodError) return res.status(err.status).json({ error: err.message });
      if (err instanceof DecisionAuditError) return res.status(503).json({ error: err.message });
      console.error(`[METHOD] ${tag}`, err);
      return res.status(500).json({ error: 'Falha no Método NORQVA.' });
    }
  };
}

export const listMethodCases = wrap('list', async (req, pool) => ({ body: { cases: await service.listCases(pool, isDemoReq(req)) } }));
export const getMethodCase = wrap('get', async (req, pool) => ({ body: await service.getCase(pool, String(req.params.id), isDemoReq(req)) }));
export const createMethodCase = wrap('create', async (req, pool) => {
  const r = await service.createCase(pool, req.body || {}, uid(req), isDemoReq(req));
  return { status: r.created ? 201 : 200, body: r };
});
export const updateMethodCase = wrap('update', async (req, pool) => ({ body: await service.updateCase(pool, String(req.params.id), req.body || {}, isDemoReq(req)) }));
export const updateMethodStage = wrap('stage', async (req, pool) => {
  const c = await service.getCase(pool, String(req.params.id), isDemoReq(req));
  return { body: await service.upsertStageNote(pool, c.case.id, Number(req.params.stage), req.body || {}, uid(req)) };
});
export const createMethodHypothesis = wrap('hypothesis', async (req, pool) => ({
  status: 201,
  body: await service.createHypothesis(pool, String(req.params.id), req.body || {}, uid(req), isDemoReq(req))
}));
export const updateMethodHypothesis = wrap('hypothesis update', async (req, pool) => ({ body: await service.updateHypothesis(pool, String(req.params.id), req.body || {}, isDemoReq(req)) }));
export const linkCreativeHypothesis = wrap('link', async (req, pool) => ({ body: await service.linkCreative(pool, String(req.params.id), req.body?.hypothesis_id, isDemoReq(req)) }));
export const importMethodExternalAd = wrap('import external ad', async (req, pool) => ({
  status: 201,
  body: await service.importExternalAd(pool, String(req.params.id), String(req.params.adId), req.body || {}, uid(req), isDemoReq(req))
}));
export const decideMethodCreative = wrap('decision', async (req, pool) => ({
  status: 201,
  body: await service.decide(pool, String(req.params.id), req.body || {}, decisionContextFromRequest(req as any))
}));
export const createMethodLearning = wrap('learning', async (req, pool) => ({ status: 201, body: await service.createLearning(pool, req.body || {}, uid(req), isDemoReq(req)) }));
export const hypothesisFromLearning = wrap('learning → hypothesis', async (req, pool) => ({
  status: 201,
  body: await service.hypothesisFromLearning(pool, String(req.params.id), req.body || {}, uid(req), isDemoReq(req))
}));
