import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { listDecisionEvents } from '../db/decisionEvents';

/** H1: GET /api/decision-events?plan_id=&limit= — histórico forense das decisões (ADMIN, somente leitura). */
export async function getDecisionEvents(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const planId = typeof req.query.plan_id === 'string' && req.query.plan_id ? req.query.plan_id : null;
    const events = await listDecisionEvents(pool, { planId, limit: Number(req.query.limit) || 100 });
    return res.status(200).json({ events });
  } catch (err) {
    console.error('[DECISION AUDIT] list error', err);
    return res.status(500).json({ error: 'Falha ao ler o histórico de decisões.' });
  }
}
