import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { LaunchPlanService, LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { translateMetaControlError } from './metaControlController';

// NORQVA-0019 (D-0010): planos de lançamento. O Claude cria tudo PAUSADO; o operador responde
// SIM/NÃO no NORQVA. Rotas ADMIN; a resposta exige sessão humana (nunca token de automação).

const service = new LaunchPlanService();

let clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
export function setLaunchPlanClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  clientFactory = factory || (() => new MetaMutatingClient());
}

function fail(res: Response, err: any, tag: string) {
  if (err instanceof LaunchPlanError) return res.status(err.status).json({ error: err.message });
  const msg = String(err?.message || '');
  const t = translateMetaControlError(err);
  if (t.status !== 500) return res.status(t.status).json({ error: t.error });
  if (msg.startsWith('[SECURITY EXCEPTION]')) {
    return res.status(403).json({ error: `Bloqueado pela trava de segurança: ${msg.replace('[SECURITY EXCEPTION]:', '').trim()}` });
  }
  if (msg.startsWith('[META CONFIG EXCEPTION]')) {
    return res.status(409).json({ error: `Configuração da Meta incompleta: ${msg.replace('[META CONFIG EXCEPTION]:', '').trim()}` });
  }
  console.error(`[LAUNCH PLANS] ${tag}`, err);
  return res.status(500).json({ error: 'Falha ao processar o plano de lançamento.' });
}

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
  try {
    const result = await service.createOnMeta(pool, String(req.params.id), userOf(req), clientFactory());
    return res.status(200).json(result);
  } catch (err) {
    return fail(res, err, 'create on Meta');
  }
}

export async function answerLaunchPlan(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  // Somente sessão humana: chamadas com token de automação (rotina do Claude) nunca respondem.
  if (req.header('x-norqva-automation-token')) {
    return res.status(403).json({ error: 'A resposta ao plano só pode ser dada pelo operador, na sessão dele. Tokens de automação não respondem.' });
  }
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Somente um ADMIN pode responder.' });
  }
  try {
    const result = await service.answer(pool, String(req.params.id), req.body?.answer, userOf(req), clientFactory());
    return res.status(200).json(result);
  } catch (err) {
    return fail(res, err, 'answer');
  }
}
