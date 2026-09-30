import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { BrandService, BrandError } from '../services/brands/brandService';
import { writeAuditLog } from '../db/audit';
import { BrandProvisioningService } from '../services/brands/brandProvisioningService';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { translateMetaControlError } from './metaControlController';

// NORQVA-0018: marcas por nicho (D-0009). Fase A: cadastro. Fase C: pixel e conferência pela API da Meta.

const service = new BrandService();

const fail = (res: Response, err: any, tag: string) => {
  if (err instanceof BrandError) return res.status(err.status).json({ error: err.message });
  console.error(`[BRANDS] ${tag}`, err);
  return res.status(500).json({ error: 'Falha ao processar a marca.' });
};

const audit = (pool: Pool, req: AuthenticatedRequest, event: string, desc: string, value: unknown) =>
  writeAuditLog(pool, req.user?.id || null, event, desc, null, JSON.stringify(value), false).catch(() => {});

export async function listBrands(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json({ brands: await service.list(pool) });
  } catch (err) {
    return fail(res, err, 'list');
  }
}

export async function createBrand(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const b = await service.create(pool, req.body || {}, req.user?.id || null);
    await audit(pool, req, 'BRAND_CREATED', `Marca criada: ${b.name}`, { id: b.id, code: b.code });
    return res.status(201).json(b);
  } catch (err) {
    return fail(res, err, 'create');
  }
}

export async function updateBrand(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const b = await service.update(pool, String(req.params.id), req.body || {});
    await audit(pool, req, 'BRAND_UPDATED', `Marca atualizada: ${b.name}`, req.body || {});
    return res.status(200).json(b);
  } catch (err) {
    return fail(res, err, 'update');
  }
}

export async function recordBrandAsset(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const type = String(req.params.type || '').toUpperCase();
    const a = await service.recordAsset(pool, String(req.params.id), type, req.body || {});
    await audit(pool, req, 'BRAND_ASSET_RECORDED', `Ativo ${type} registrado pelo operador`, { brand_id: a.brand_id, external_id: a.external_id, handle: a.handle, status: a.status });
    return res.status(200).json(a);
  } catch (err) {
    return fail(res, err, 'asset');
  }
}

export async function assignBrandProduct(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const p = await service.assignProduct(pool, String(req.params.id), String(req.params.productId));
    await audit(pool, req, 'BRAND_PRODUCT_ASSIGNED', `Produto ${p.name} ligado à marca`, p);
    return res.status(200).json(p);
  } catch (err) {
    return fail(res, err, 'product');
  }
}

// ---------------------------------------------------------------------------
// Fase C: provisionamento (ADMIN). Criação passa pelas travas da D-0007.
// ---------------------------------------------------------------------------

let clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
export function setBrandMetaClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  clientFactory = factory || (() => new MetaMutatingClient());
}

const failMeta = (res: Response, err: any, tag: string) => {
  if (err instanceof BrandError) return res.status(err.status).json({ error: err.message });
  const t = translateMetaControlError(err);
  if (t.status !== 500) return res.status(t.status).json({ error: t.error });
  const msg = String(err?.message || '');
  if (msg.includes('[META GRAPH API ERROR]')) return res.status(502).json({ error: `A Meta recusou: ${msg.replace('[META GRAPH API ERROR]: ', '')}` });
  console.error(`[BRANDS] ${tag}`, err);
  return res.status(500).json({ error: 'Falha na comunicação com a Meta.' });
};

export async function provisionBrandPixel(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const out = await new BrandProvisioningService(clientFactory()).provisionPixel(pool, String(req.params.id), {
      userId: req.user?.id || '',
      userRole: req.user?.role || '',
      isDemo: req.query.mode === 'demo'
    });
    return res.status(201).json(out);
  } catch (err) {
    return failMeta(res, err, 'provision-pixel');
  }
}

export async function verifyBrandAssets(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const results = await new BrandProvisioningService(clientFactory()).verifyAssets(pool, String(req.params.id));
    await audit(pool, req, 'BRAND_ASSETS_VERIFIED', 'Conferência de ativos da marca pela API', results);
    return res.status(200).json({ results });
  } catch (err) {
    return failMeta(res, err, 'verify');
  }
}

export async function setBrandPixelRouting(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Informe enabled (true ou false).' });
  try {
    const out = await new BrandProvisioningService(clientFactory()).setPixelRouting(pool, String(req.params.id), req.body.enabled, req.user?.id || null);
    return res.status(200).json(out);
  } catch (err) {
    return failMeta(res, err, 'routing');
  }
}
