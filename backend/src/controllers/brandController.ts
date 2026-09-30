import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { BrandService, BrandError } from '../services/brands/brandService';
import { writeAuditLog } from '../db/audit';

// NORQVA-0018 (fase A): marcas por nicho (D-0009). Nenhuma chamada à Meta nesta fase.

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
