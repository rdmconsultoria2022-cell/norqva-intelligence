import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MandateService, MandateError } from '../services/operator/mandateService';

// NORQVA-0137 (D-0137): rotas do operador do mandato (/api/operator/*) e do administrador (/api/mandate*).
// O operador entra só com NORQVA_OPERATOR_TOKEN (Authorization: Bearer <token> ou x-norqva-operator: <token>),
// e esse token só vale nas rotas /api/operator/*. As regras do mandato ficam em services/operator/mandateService.ts.

const svc = (req: Request) => new MandateService(req.app.get('db') as Pool);

const digest = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();

/** Confere o token do operador (comparação em tempo constante). Nunca registra o token. */
export function requireOperatorToken(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.NORQVA_OPERATOR_TOKEN || '');
  if (expected.length < 32) {
    return res.status(503).json({ error: 'Operador desligado: NORQVA_OPERATOR_TOKEN não está configurado no servidor (mínimo 32 caracteres).' });
  }
  const auth = String(req.headers['authorization'] || '');
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-norqva-operator'] || '').trim();
  if (!given || !crypto.timingSafeEqual(digest(given), digest(expected))) {
    return res.status(401).json({ error: 'Token do operador ausente ou inválido.' });
  }
  return next();
}

function fail(res: Response, err: any, msg: string) {
  if (err instanceof MandateError) return res.status(err.status).json({ error: err.message, ...err.extra });
  console.error('[MANDATE]', err?.message || err);
  return res.status(500).json({ error: msg });
}

// ------------------------------ operador ------------------------------

export async function getOperatorMandate(req: Request, res: Response) {
  try {
    const s = svc(req);
    const c = await s.check();
    if (!c.mandate) return res.status(404).json({ error: 'Não há mandato.' });
    return res.status(200).json(await s.view(undefined, { snapshot: c.snapshot, error: c.error }));
  } catch (err) {
    return fail(res, err, 'Falha ao ler o mandato.');
  }
}

export async function getOperatorReport(req: Request, res: Response) {
  try {
    return res.status(200).json(await svc(req).report(req.query.days));
  } catch (err) {
    return fail(res, err, 'Falha ao montar o relatório.');
  }
}

function changeResponse(res: Response, r: { change: { state: string; id: string | null; error: string | null; http_status?: number }; mandate_status: string }) {
  const { state, error } = r.change;
  if (state === 'CONFIRMED') return res.status(200).json({ ok: true, confirmed: true, ...r });
  if (state === 'UNCONFIRMED') return res.status(202).json({ ok: true, confirmed: false, message: 'A Meta aceitou; a releitura ainda não confirmou. Confira de novo mais tarde.', ...r });
  const status = r.change.http_status && r.change.http_status >= 400 ? r.change.http_status : 502;
  return res.status(status).json({ ok: false, error: error || 'A alteração não foi feita.', ...r });
}

export async function postOperatorStatus(req: Request, res: Response) {
  try {
    const r = await svc(req).operatorWrite({ entityType: String(req.params.entityType), id: String(req.params.id), status: req.body?.status });
    return changeResponse(res, r);
  } catch (err) {
    return fail(res, err, 'Falha ao alterar a situação.');
  }
}

export async function postOperatorBudget(req: Request, res: Response) {
  try {
    const value = req.body?.daily_budget_brl;
    if (value === undefined || value === null || value === '') return res.status(400).json({ error: 'Informe daily_budget_brl em reais.' });
    const r = await svc(req).operatorWrite({ entityType: String(req.params.entityType), id: String(req.params.id), dailyBudget: value });
    return changeResponse(res, r);
  } catch (err) {
    return fail(res, err, 'Falha ao alterar o orçamento.');
  }
}

// ------------------------------ administrador (ADMIN) ------------------------------

const who = (req: AuthenticatedRequest) => ({ id: req.user?.id || null, name: req.user?.name || null });

export async function getMandate(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).view());
  } catch (err) {
    return fail(res, err, 'Falha ao ler o mandato.');
  }
}

export async function postMandate(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await svc(req).create(who(req), req.body));
  } catch (err) {
    return fail(res, err, 'Falha ao criar o mandato.');
  }
}

export async function putMandateCampaigns(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).updateCampaigns(who(req), req.body));
  } catch (err) {
    return fail(res, err, 'Falha ao salvar as campanhas do mandato.');
  }
}

export async function postMandateEnd(req: AuthenticatedRequest, res: Response) {
  try {
    if (String(req.body?.confirm || '').trim().toUpperCase() !== 'ENCERRAR') {
      return res.status(400).json({ error: 'Para encerrar, confirme digitando ENCERRAR.' });
    }
    return res.status(200).json(await svc(req).end(who(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao encerrar o mandato.');
  }
}

export async function postMandateCheck(req: AuthenticatedRequest, res: Response) {
  try {
    const s = svc(req);
    const c = await s.check();
    return res.status(200).json(await s.view(undefined, { snapshot: c.snapshot, error: c.error }));
  } catch (err) {
    return fail(res, err, 'Falha ao conferir o mandato.');
  }
}

export async function getMandateActions(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).actions(Number(req.query.limit) || 100));
  } catch (err) {
    return fail(res, err, 'Falha ao ler o registro do mandato.');
  }
}
