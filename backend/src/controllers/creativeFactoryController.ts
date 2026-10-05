import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CreativeFactoryService, CreativeFactoryError } from '../services/creative/creativeFactoryService';
import { resolvePeriodFilter } from '../utils/commercialTimezone';
import { AdjustmentService, automationTokenValid } from '../services/creative/adjustmentService';
import { FactoryIngestService } from '../services/creative/factoryIngestService';

// NORQVA-0005 / G1: Creative Factory endpoints. Mode isolation follows the rest of the API
// (?mode=demo). Writes are ADMIN-only except creating a new version (ADMIN, CREATIVE).

const service = new CreativeFactoryService();
let adjustments = new AdjustmentService();
export function setAdjustmentServiceForTesting(a: AdjustmentService | null) {
  adjustments = a || new AdjustmentService();
}

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
    // NORQVA-0013: an adjustment request becomes a task and is sent to Claude
    let adjustment: any = null;
    if (String(req.body?.decision) === 'REVISION_REQUESTED') {
      try {
        const reason = req.body?.reason_code ? `[${req.body.reason_code}] ` : '';
        adjustment = await adjustments.create(pool, {
          creativeId: String(req.params.id),
          reviewId: (result as any).review_id || null,
          requestText: `${reason}${req.body?.notes || ''}`.trim() || 'Ajuste pedido (sem detalhes).',
          userId: req.user?.id || null,
          isDemo: isDemoReq(req)
        });
      } catch (adjErr) {
        console.error('[ADJUSTMENT] create/dispatch failed', adjErr);
      }
    }
    return res.status(200).json({ ...result, adjustment });
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

// NORQVA-0007: attach a produced file without creating a new version
export async function attachFactoryCreativeFile(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.attachFile(pool, String(req.params.id), String(req.body?.file_url || ''), req.user?.id || null, isDemoReq(req));
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao anexar o arquivo.');
  }
}

export async function attachFactoryBatchAssets(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const result = await service.attachProducedAssets(pool, String(req.params.code), req.user?.id || null, isDemoReq(req));
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao anexar os arquivos do lote.');
  }
}


// NORQVA-0013: adjustment tasks (UI)
export async function listFactoryAdjustments(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json({ adjustments: await adjustments.list(pool, isDemoReq(req)) });
  } catch (err) {
    return handle(res, err, 'Falha ao carregar os ajustes.');
  }
}

export async function retryFactoryAdjustment(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await adjustments.dispatch(pool, String(req.params.id), isDemoReq(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao reenviar o ajuste.');
  }
}

// NORQVA-0013: automation API used by the Claude routine (header X-Norqva-Automation-Token)
function automationGuard(req: AuthenticatedRequest, res: Response): boolean {
  if (!automationTokenValid(req.header('x-norqva-automation-token'))) {
    res.status(401).json({ error: 'Token de automação inválido.' });
    return false;
  }
  return true;
}

export async function automationGetAdjustment(req: AuthenticatedRequest, res: Response) {
  if (!automationGuard(req, res)) return;
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await adjustments.taskForAutomation(pool, String(req.params.id)));
  } catch (err) {
    return handle(res, err, 'Falha ao ler o ajuste.');
  }
}

export async function automationReportAdjustment(req: AuthenticatedRequest, res: Response) {
  if (!automationGuard(req, res)) return;
  const pool: Pool = req.app.get('db');
  try {
    return res
      .status(200)
      .json(await adjustments.reportFromAutomation(pool, String(req.params.id), String(req.body?.status || ''), req.body?.response ? String(req.body.response) : null));
  } catch (err) {
    return handle(res, err, 'Falha ao atualizar o ajuste.');
  }
}

export async function automationDeliverAdjustment(req: AuthenticatedRequest, res: Response) {
  if (!automationGuard(req, res)) return;
  const pool: Pool = req.app.get('db');
  try {
    const b = req.body || {};
    return res.status(200).json(
      await adjustments.deliverVersion(
        pool,
        String(req.params.id),
        { hook: b.hook, primary_text: b.primary_text, headline: b.headline, cta: b.cta, script: b.script, file_url: b.file_url },
        b.summary ? String(b.summary) : null
      )
    );
  } catch (err) {
    return handle(res, err, 'Falha ao entregar a nova versão.');
  }
}

// NORQVA-0013: send an existing adjustment request (made before the automation existed) to Claude
export async function enqueueFactoryAdjustment(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const isDemo = isDemoReq(req);
    const last = await pool.query(
      `SELECT r.id, r.reason_code, r.notes FROM creative_reviews r
       JOIN creatives c ON c.id = r.creative_id
       WHERE r.creative_id = $1 AND c.is_demo = $2 AND r.decision = 'REVISION_REQUESTED'
       ORDER BY r.created_at DESC LIMIT 1`,
      [String(req.params.id), isDemo]
    );
    if (last.rows.length === 0) return res.status(404).json({ error: 'Nenhum pedido de ajuste neste criativo.' });
    const r = last.rows[0];
    const text = `${r.reason_code ? `[${r.reason_code}] ` : ''}${r.notes || ''}`.trim() || 'Ajuste pedido (sem detalhes).';
    const adj = await adjustments.create(pool, { creativeId: String(req.params.id), reviewId: r.id, requestText: text, userId: req.user?.id || null, isDemo });
    return res.status(200).json(adj);
  } catch (err) {
    return handle(res, err, 'Falha ao enviar o ajuste.');
  }
}

// NORQVA-0020: ponte Creative Factory → NORQVA (token X-Norqva-Automation-Token)
const factoryIngest = new FactoryIngestService();

export async function automationFactoryUploadUrl(req: AuthenticatedRequest, res: Response) {
  if (!automationGuard(req, res)) return;
  const pool: Pool = req.app.get('db');
  try {
    const b = req.body || {};
    return res.status(200).json(
      await factoryIngest.createUploadUrl(pool, {
        campaign_id: String(b.campaign_id || ''),
        creative_version: String(b.creative_version || ''),
        sha256: String(b.sha256 || ''),
        size_bytes: Number(b.size_bytes),
        mime: String(b.mime || '')
      })
    );
  } catch (err) {
    return handle(res, err, 'Falha ao preparar o upload do release.');
  }
}

export async function automationFactoryIngest(req: AuthenticatedRequest, res: Response) {
  if (!automationGuard(req, res)) return;
  const pool: Pool = req.app.get('db');
  try {
    const result = await factoryIngest.ingest(pool, req.body, isDemoReq(req));
    return res.status(result.status === 'INGESTED' ? 201 : 200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao registrar o release da Factory.');
  }
}
