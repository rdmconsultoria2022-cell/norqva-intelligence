import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { TeamService, TeamError } from '../services/team/teamService';

// NORQVA-0092: rotas da gestão da Equipe. As regras e travas ficam em TeamService.

const svc = (req: AuthenticatedRequest) => new TeamService(req.app.get('db') as Pool);
const actor = (req: AuthenticatedRequest) => ({ id: String(req.user?.id || ''), role: String(req.user?.role || '') });

function fail(res: Response, e: any) {
  if (e instanceof TeamError) return res.status(e.status).json({ error: e.message });
  console.error('[team] erro:', e);
  return res.status(500).json({ error: 'Erro ao atualizar a equipe.' });
}

function realOnly(req: AuthenticatedRequest, res: Response): boolean {
  if (req.user?.is_demo) {
    res.status(403).json({ error: 'Gestão da equipe só na conta real.' });
    return false;
  }
  return true;
}

export async function getTeam(req: AuthenticatedRequest, res: Response) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Só administrador gerencia a equipe.' });
  if (!realOnly(req, res)) return;
  try {
    return res.status(200).json({ users: await svc(req).list() });
  } catch (e) {
    return fail(res, e);
  }
}

export async function inviteTeamMember(req: AuthenticatedRequest, res: Response) {
  if (!realOnly(req, res)) return;
  try {
    return res.status(201).json(await svc(req).invite(actor(req), req.body));
  } catch (e) {
    return fail(res, e);
  }
}

export async function resendTeamInvite(req: AuthenticatedRequest, res: Response) {
  if (!realOnly(req, res)) return;
  try {
    return res.status(200).json(await svc(req).resendInvite(actor(req), req.params.id));
  } catch (e) {
    return fail(res, e);
  }
}

export async function updateTeamMember(req: AuthenticatedRequest, res: Response) {
  if (!realOnly(req, res)) return;
  try {
    return res.status(200).json(await svc(req).update(actor(req), req.params.id, req.body));
  } catch (e) {
    return fail(res, e);
  }
}

export async function deactivateTeamMember(req: AuthenticatedRequest, res: Response) {
  if (!realOnly(req, res)) return;
  try {
    return res.status(200).json(await svc(req).setActive(actor(req), req.params.id, false));
  } catch (e) {
    return fail(res, e);
  }
}

export async function reactivateTeamMember(req: AuthenticatedRequest, res: Response) {
  if (!realOnly(req, res)) return;
  try {
    return res.status(200).json(await svc(req).setActive(actor(req), req.params.id, true));
  } catch (e) {
    return fail(res, e);
  }
}
