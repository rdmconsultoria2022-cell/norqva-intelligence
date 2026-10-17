import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { AdAlertService } from '../services/alerts/adAlertService';
import { AlertCenterService, AlertCenterError } from '../services/alerts/alertCenterService';

// NORQVA-0009: ad alerts (e.g. "gastou 2× o CPA de equilíbrio sem venda → pausar recomendado").

let service = new AdAlertService();
export function setAdAlertServiceForTesting(s: AdAlertService | null) {
  service = s || new AdAlertService();
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

export async function listAdAlerts(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const alerts = await service.list(pool, isDemoReq(req), req.query.status !== 'all');
    return res.status(200).json({ alerts });
  } catch (err) {
    console.error('[ALERTS] list', err);
    return res.status(500).json({ error: 'Falha ao carregar os alertas.' });
  }
}

export async function acknowledgeAdAlert(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const a = await service.acknowledge(pool, String(req.params.id), req.user?.id || null, isDemoReq(req));
    if (!a) return res.status(404).json({ error: 'Alerta não encontrado ou já tratado.' });
    return res.status(200).json(a);
  } catch (err) {
    console.error('[ALERTS] ack', err);
    return res.status(500).json({ error: 'Falha ao marcar o alerta como visto.' });
  }
}

export async function evaluateAdAlerts(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const r = await service.evaluate(pool, isDemoReq(req));
    return res.status(200).json({ created: r.created, resolved: r.resolved, emailed: r.emailed });
  } catch (err) {
    console.error('[ALERTS] evaluate', err);
    return res.status(500).json({ error: 'Falha ao avaliar os alertas.' });
  }
}

// NORQVA-0095: central de pendências (sino = não lidos de cada pessoa; pendências = problemas abertos).

function centerFail(res: Response, err: any, fallback: string) {
  if (err instanceof AlertCenterError) return res.status(err.status).json({ error: err.message });
  console.error('[ALERT CENTER]', err);
  return res.status(500).json({ error: fallback });
}

export async function getAlertCenter(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await new AlertCenterService(req.app.get('db')).center(String(req.user?.id || ''), isDemoReq(req)));
  } catch (err) {
    return centerFail(res, err, 'Falha ao carregar os alertas.');
  }
}

export async function markAlertsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const ids = req.params.id ? [String(req.params.id)] : Array.isArray(req.body?.ids) ? req.body.ids.map(String) : 'all';
    return res.status(200).json(await new AlertCenterService(req.app.get('db')).markRead(String(req.user?.id || ''), ids, isDemoReq(req)));
  } catch (err) {
    return centerFail(res, err, 'Falha ao marcar como lido.');
  }
}

export async function setAlertInProgress(req: AuthenticatedRequest, res: Response) {
  try {
    const item = await new AlertCenterService(req.app.get('db')).setInProgress(String(req.user?.id || ''), String(req.params.id), isDemoReq(req));
    return res.status(200).json({ notification: item });
  } catch (err) {
    return centerFail(res, err, 'Falha ao atualizar o alerta.');
  }
}

export async function dismissAlert(req: AuthenticatedRequest, res: Response) {
  try {
    const item = await new AlertCenterService(req.app.get('db')).dismiss(String(req.user?.id || ''), String(req.params.id), req.body?.reason, isDemoReq(req));
    return res.status(200).json({ notification: item });
  } catch (err) {
    return centerFail(res, err, 'Falha ao descartar o alerta.');
  }
}
