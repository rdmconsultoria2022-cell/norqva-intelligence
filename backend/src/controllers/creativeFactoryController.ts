import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CreativeFactoryService, CreativeFactoryError } from '../services/creative/creativeFactoryService';
import { resolvePeriodFilter } from '../utils/commercialTimezone';

// NORQVA-0005 / G1: Creative Factory endpoints. Mode isolation follows the rest of the API
// (?mode=demo). Writes are ADMIN-only except creating a new version (ADMIN, CREATIVE).

const service = new CreativeFactoryService();

function handle(res: Response, err: any, fallback: string) {
  if (err instanceof CreativeFactoryError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

export async function listFactoryCreatives(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const range = resolvePeriodFilter(req.query.period as string, req.query.startDate as string, req.query.endDate as string);
    const result = await service.listCreatives(pool, {
      isDemo: isDemoReq(req),
      batchCode: (req.query.batch as string) || undefined,
      dateFrom: range?.metaStart,
      dateTo: range?.metaStop
    });
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao carregar a Fábrica de Criativos.');
  }
}

export async function importFactoryBatch(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.importBatch(pool, String(req.params.code), req.user?.id || null, isDemoReq(req));
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao importar o lote.');
  }
}

export async function updateFactoryClaim(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.updateClaimStatus(
      pool,
      String(req.params.id),
      String(req.body?.status || ''),
      req.body?.note ? String(req.body.note) : null,
      req.user?.id || null,
      isDemoReq(req)
    );
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao atualizar a claim.');
  }
}

export async function reviewFactoryCreative(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.reviewCreative(
      pool,
      String(req.params.id),
      {
        decision: String(req.body?.decision || ''),
        reason_code: req.body?.reason_code || null,
        notes: req.body?.notes || null
      },
      req.user?.id || null,
      isDemoReq(req)
    );
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao registrar a revisão.');
  }
}

export async function reviseFactoryCreative(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const b = req.body || {};
    const result = await service.reviseCreative(
      pool,
      String(req.params.id),
      {
        hook: b.hook,
        primary_text: b.primary_text,
        headline: b.headline,
        cta: b.cta,
        script: b.script,
        file_url: b.file_url
      },
      req.user?.id || null,
      isDemoReq(req)
    );
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao editar o criativo.');
  }
}

export async function linkFactoryCreativeAd(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.linkMetaAd(pool, String(req.params.id), String(req.body?.meta_ad_id || ''), req.user?.id || null, isDemoReq(req));
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao ligar o anúncio.');
  }
}
