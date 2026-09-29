import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { MarketEuService, MarketEuError } from '../services/marketIntelligence/marketEuService';
import { writeAuditLog } from '../db/audit';

// NORQVA-0017 (fase 2): Mercado europeu (Biblioteca de Anúncios, UE).

let service = new MarketEuService();
export function setMarketEuServiceForTesting(s: MarketEuService | null) {
  service = s || new MarketEuService();
}

let collecting = false;

const fail = (res: Response, err: any, tag: string) => {
  if (err instanceof MarketEuError) return res.status(err.status).json({ error: err.message });
  console.error(`[MARKET_EU] ${tag}`, err);
  return res.status(500).json({ error: 'Falha no mercado europeu.' });
};

export async function probeMarketEu(_req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await service.probe());
  } catch (err) {
    return fail(res, err, 'probe');
  }
}

export async function listMarketNiches(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const [niches, lastRun] = await Promise.all([service.listNiches(pool), service.latestRun(pool)]);
    return res.status(200).json({ niches, last_run: lastRun, collecting });
  } catch (err) {
    return fail(res, err, 'list');
  }
}

export async function createMarketNiche(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const n = await service.createNiche(pool, req.body || {}, req.user?.id || null);
    return res.status(201).json(n);
  } catch (err) {
    return fail(res, err, 'create');
  }
}

export async function updateMarketNiche(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await service.updateNiche(pool, String(req.params.id), req.body || {}));
  } catch (err) {
    return fail(res, err, 'update');
  }
}

export async function listNicheAds(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const ads = await service.topAds(pool, String(req.params.id), parseInt(String(req.query.limit || '30'), 10) || 30);
    return res.status(200).json({ ads });
  } catch (err) {
    return fail(res, err, 'ads');
  }
}

/** Starts a collection in the background (202). One at a time. */
export async function collectMarketEu(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  if (collecting) return res.status(409).json({ error: 'Já existe uma coleta em andamento.' });
  collecting = true;
  const ids = Array.isArray(req.body?.niche_ids) ? req.body.niche_ids.map(String) : undefined;
  const job = service
    .collect(pool, { trigger: 'MANUAL', nicheIds: ids })
    .then(r => writeAuditLog(pool, req.user?.id || null, 'MARKET_EU_COLLECTED', `Coleta UE: ${r.status}, ${r.ads_upserted} anúncios`, null, null, false).catch(() => {}))
    .catch(err => console.error('[MARKET_EU] collect', err))
    .finally(() => {
      collecting = false;
    });
  if (req.query.wait === '1') await job; // tests / synchronous use
  return res.status(202).json({ message: 'Coleta iniciada.' });
}

/** Daily automatic collection when MARKET_EU_AUTO_ENABLED=true. */
export function startMarketEuScheduler(pool: Pool): () => void {
  if (process.env.MARKET_EU_AUTO_ENABLED !== 'true' || process.env.NODE_ENV === 'test') return () => {};
  const tick = async () => {
    if (collecting) return;
    collecting = true;
    try {
      await service.collect(pool, { trigger: 'AUTOMATIC' });
    } catch (err) {
      console.error('[MARKET_EU] scheduled collect', err);
    } finally {
      collecting = false;
    }
  };
  const first = setTimeout(tick, 5 * 60 * 1000);
  const every = setInterval(tick, 24 * 60 * 60 * 1000);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
