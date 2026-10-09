import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CatalogVisibilityService, CatalogVisibilityError } from '../services/catalog/catalogVisibilityService';

// NORQVA-0034: produtos criados pela tela que ficaram fora da lista (só ADMIN).

const svc = (req: AuthenticatedRequest) => new CatalogVisibilityService(req.app.get('db') as Pool);

export async function getHiddenProducts(req: AuthenticatedRequest, res: Response) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Só ADMIN.' });
  try {
    return res.status(200).json(await svc(req).hidden());
  } catch (e: any) {
    console.error('hidden products', e?.message);
    return res.status(500).json({ error: 'Não foi possível ler os produtos fora da lista.' });
  }
}

export async function promoteHiddenProduct(req: AuthenticatedRequest, res: Response) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Só ADMIN.' });
  try {
    return res.status(200).json(await svc(req).promote(req.params.id, req.user?.id || null));
  } catch (e: any) {
    if (e instanceof CatalogVisibilityError) return res.status(e.status).json({ error: e.message });
    console.error('promote product', e?.message);
    return res.status(500).json({ error: 'Não foi possível trazer o produto para a lista.' });
  }
}
