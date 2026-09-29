import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CampaignIntelligenceService, INTEL_LEVELS, IntelLevel } from '../services/intelligence/campaignIntelligenceService';
import { MetaBackfillService, MAX_BACKFILL_DAYS } from '../services/meta/metaBackfillService';
import { writeAuditLog } from '../db/audit';
import { resolvePeriodFilter } from '../utils/commercialTimezone';

// NORQVA-0017 (fase 1): "Base de campanhas" and history import.

const service = new CampaignIntelligenceService();
const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

export async function getCampaignBase(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const level = String(req.query.level || 'campaign') as IntelLevel;
  if (!INTEL_LEVELS.includes(level)) {
    return res.status(400).json({ error: `Nível inválido. Use: ${INTEL_LEVELS.join(', ')}.` });
  }
  let date_from = (req.query.date_from as string) || undefined;
  let date_to = (req.query.date_to as string) || undefined;
  // Global period selector (?period=...); explicit date_from/date_to win
  if (req.query.period && !date_from && !date_to) {
    const range = resolvePeriodFilter(req.query.period as string, req.query.startDate as string, req.query.endDate as string);
    date_from = range?.metaStart;
    date_to = range?.metaStop;
  }
  try {
    const out = await service.getCampaignBase(pool, {
      level,
      date_from,
      date_to,
      is_demo: isDemoReq(req)
    });
    return res.status(200).json(out);
  } catch (err) {
    console.error('[CAMPAIGN_BASE]', err);
    return res.status(500).json({ error: 'Falha ao montar a base de campanhas.' });
  }
}

export async function startMetaBackfill(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const days = parseInt(String(req.body?.days ?? req.query.days ?? '365'), 10);
  if (!Number.isFinite(days) || days < 1 || days > MAX_BACKFILL_DAYS) {
    return res.status(400).json({ error: `Informe days entre 1 e ${MAX_BACKFILL_DAYS}.` });
  }
  if (isDemoReq(req)) {
    return res.status(400).json({ error: 'A importação de histórico só existe no modo real.' });
  }
  const { started } = MetaBackfillService.start(days, req.user?.id || null);
  if (!started) {
    return res.status(409).json({ error: 'Já existe uma importação de histórico em andamento.', status: MetaBackfillService.status() });
  }
  await writeAuditLog(pool, req.user?.id || null, 'META_BACKFILL_STARTED', `Importação de ${days} dias de histórico Meta`, null, null, false).catch(() => {});
  return res.status(202).json({ message: 'Importação iniciada.', status: MetaBackfillService.status() });
}

export async function getMetaBackfillStatus(_req: AuthenticatedRequest, res: Response) {
  return res.status(200).json(MetaBackfillService.status());
}
