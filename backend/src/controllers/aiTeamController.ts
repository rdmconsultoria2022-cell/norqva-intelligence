import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { OpportunityService, OpportunityError, TASK_KINDS, TaskKind } from '../services/aiTeam/opportunityService';
import { decisionContextFromRequest, DecisionAuditError } from '../db/decisionEvents';
import { automationTokenValid } from '../services/creative/adjustmentService';
import { CreativeFactoryError } from '../services/creative/creativeFactoryService';

// NORQVA-0017 (fase 3): Time de IAs.

let service = new OpportunityService();
export function setOpportunityServiceForTesting(s: OpportunityService | null) {
  service = s || new OpportunityService();
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';
const fail = (res: Response, err: any, tag: string) => {
  if (err instanceof OpportunityError || err instanceof CreativeFactoryError) return res.status((err as any).status).json({ error: err.message });
  console.error(`[AI_TEAM] ${tag}`, err);
  return res.status(500).json({ error: 'Falha no time de IAs.' });
};

export async function listAiOpportunities(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json({ opportunities: await service.list(pool, isDemoReq(req)) });
  } catch (err) {
    return fail(res, err, 'list');
  }
}

export async function createAiOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(201).json(await service.create(pool, req.body || {}, req.user?.id || null, isDemoReq(req)));
  } catch (err) {
    return fail(res, err, 'create');
  }
}

export async function dispatchAiOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const kind = String(req.body?.kind || '').toUpperCase();
  if (!TASK_KINDS.includes(kind as TaskKind)) return res.status(400).json({ error: 'kind deve ser EVALUATE, VALIDATE ou PLAN.' });
  try {
    return res.status(200).json(await service.dispatch(pool, String(req.params.id), kind as TaskKind, isDemoReq(req)));
  } catch (err) {
    return fail(res, err, 'dispatch');
  }
}

export async function decideAiOpportunity(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await service.decide(pool, String(req.params.id), String(req.body?.decision || ''), req.user?.id || null));
  } catch (err) {
    return fail(res, err, 'decide');
  }
}

/** NORQVA-0021 (P2): the owner overrides the validator's veto with a written justification (ADMIN). */
export async function overrideAiValidation(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await service.overrideValidation(pool, String(req.params.id), req.body?.justification, decisionContextFromRequest(req as any)));
  } catch (err) {
    if (err instanceof DecisionAuditError) return res.status(503).json({ error: err.message });
    return fail(res, err, 'override');
  }
}

// ---- Automation API (Claude routine), token-protected -------------------------------------------

const authorized = (req: Request, res: Response) => {
  if (!automationTokenValid(req.header('x-norqva-automation-token'))) {
    res.status(401).json({ error: 'Token de automação inválido.' });
    return false;
  }
  return true;
};

export async function automationGetOpportunity(req: Request, res: Response) {
  if (!authorized(req, res)) return;
  try {
    return res.status(200).json(await service.taskForAutomation(req.app.get('db'), String(req.params.id)));
  } catch (err) {
    return fail(res, err, 'automation get');
  }
}

export async function automationOpportunityStatus(req: Request, res: Response) {
  if (!authorized(req, res)) return;
  try {
    return res.status(200).json(await service.reportStatus(req.app.get('db'), String(req.params.id), String(req.body?.status || ''), req.body?.response ?? null));
  } catch (err) {
    return fail(res, err, 'automation status');
  }
}

export async function automationOpportunityEvaluation(req: Request, res: Response) {
  if (!authorized(req, res)) return;
  try {
    return res.status(200).json(await service.reportEvaluation(req.app.get('db'), String(req.params.id), req.body || {}));
  } catch (err) {
    return fail(res, err, 'automation evaluation');
  }
}

export async function automationOpportunityPlan(req: Request, res: Response) {
  if (!authorized(req, res)) return;
  try {
    return res.status(200).json(await service.reportPlan(req.app.get('db'), String(req.params.id), req.body || {}));
  } catch (err) {
    return fail(res, err, 'automation plan');
  }
}

export async function automationOpportunityValidation(req: Request, res: Response) {
  if (!authorized(req, res)) return;
  try {
    return res.status(200).json(await service.reportValidation(req.app.get('db'), String(req.params.id), req.body || {}));
  } catch (err) {
    return fail(res, err, 'automation validation');
  }
}
