import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MetaChangeService, MetaChangeError } from '../services/meta/metaChangeService';

// NORQVA-0097: fichas de alteração na Meta. Regras em services/meta/metaChangeService.ts.

const svc = (req: AuthenticatedRequest) => new MetaChangeService(req.app.get('db') as Pool);

function fail(res: Response, err: any, msg: string) {
  if (err instanceof MetaChangeError) return res.status(err.status).json({ error: err.message, ...err.extra });
  console.error('[META CHANGE]', err);
  return res.status(500).json({ error: msg });
}

export async function createMetaChange(req: AuthenticatedRequest, res: Response) {
  try {
    const r = await svc(req).create(req, req.body);
    return res.status(r.change?.state === 'AWAITING_APPROVAL' ? 202 : 200).json(r);
  } catch (err) {
    return fail(res, err, 'Falha ao registrar a alteração.');
  }
}

export async function listMetaChanges(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(
      await svc(req).list(req, {
        planId: typeof req.query.plan_id === 'string' ? req.query.plan_id : undefined,
        campaign: typeof req.query.campaign === 'string' ? req.query.campaign : undefined,
        state: typeof req.query.state === 'string' ? req.query.state : undefined
      })
    );
  } catch (err) {
    return fail(res, err, 'Falha ao listar as alterações.');
  }
}

export async function approveMetaChange(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).approve(req, String(req.params.id), req.body));
  } catch (err) {
    return fail(res, err, 'Falha ao autorizar a alteração.');
  }
}

export async function rejectMetaChange(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).reject(req, String(req.params.id), false));
  } catch (err) {
    return fail(res, err, 'Falha ao recusar a alteração.');
  }
}

export async function cancelMetaChange(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).reject(req, String(req.params.id), true));
  } catch (err) {
    return fail(res, err, 'Falha ao cancelar a alteração.');
  }
}

export async function verifyMetaChange(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).verify(req, String(req.params.id)));
  } catch (err) {
    return fail(res, err, 'Falha ao conferir a alteração.');
  }
}
