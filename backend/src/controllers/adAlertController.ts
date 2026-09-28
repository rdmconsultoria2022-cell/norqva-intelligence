import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { AdAlertService } from '../services/alerts/adAlertService';

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
