import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { ShortlistService, parseCriteria, shortlistDefaults } from '../services/aiTeam/shortlistService';
import { CriteriaService } from '../services/research/criteriaService';
import { OpportunityError } from '../services/aiTeam/opportunityService';
import { resolvePeriodFilter } from '../utils/commercialTimezone';

// NORQVA-0021 (P1): automatic shortlist for the Time de IAs. Read-only towards Meta.

let service = new ShortlistService();
export function setShortlistServiceForTesting(s: ShortlistService | null) {
  service = s || new ShortlistService();
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

function period(req: AuthenticatedRequest) {
  let date_from = (req.query.date_from as string) || undefined;
  let date_to = (req.query.date_to as string) || undefined;
  if (req.query.period && !date_from && !date_to) {
    const range = resolvePeriodFilter(req.query.period as string, req.query.startDate as string, req.query.endDate as string);
    date_from = range?.metaStart;
    date_to = range?.metaStop;
  }
  return { date_from, date_to };
}

export async function getShortlist(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    // NORQVA-0029: os padrões vêm dos critérios validados (sem validação = valores de sempre)
    const defaults = shortlistDefaults((await new CriteriaService().effective(pool)).numbers);
    const out = await service.build(pool, parseCriteria(req.query as Record<string, unknown>, defaults), { ...period(req), is_demo: isDemoReq(req) });
    return res.status(200).json(out);
  } catch (err) {
    console.error('[SHORTLIST]', err);
    return res.status(500).json({ error: 'Falha ao montar a lista de candidatos.' });
  }
}

export async function sendShortlist(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const defaults = shortlistDefaults((await new CriteriaService().effective(pool)).numbers);
    const criteria = req.body?.criteria ? parseCriteria(req.body.criteria, defaults) : null;
    const out = await service.send(pool, req.body?.items, criteria, req.user?.id || null, isDemoReq(req));
    return res.status(out.created.length ? 201 : 200).json(out);
  } catch (err) {
    if (err instanceof OpportunityError) return res.status(err.status).json({ error: err.message });
    console.error('[SHORTLIST] send', err);
    return res.status(500).json({ error: 'Falha ao enviar candidatos ao Time de IAs.' });
  }
}
