import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CatalogVisibilityService, CatalogVisibilityError } from '../services/catalog/catalogVisibilityService';
import { CatalogTrashService, CatalogTrashError } from '../services/catalog/catalogTrashService';

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

// NORQVA-0057: lixeira de produtos e ofertas (só ADMIN, com o código do item digitado)

const trashSvc = (req: AuthenticatedRequest) => new CatalogTrashService(req.app.get('db') as Pool);

function trashFail(res: Response, e: any, msg: string) {
  if (e instanceof CatalogTrashError) return res.status(e.status).json({ error: e.message });
  console.error('catalog trash', msg, e?.message);
  return res.status(500).json({ error: msg });
}

export async function getCatalogTrash(req: AuthenticatedRequest, res: Response) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Só ADMIN.' });
  try {
    return res.status(200).json(await trashSvc(req).trash());
  } catch (e) {
    return trashFail(res, e, 'Não foi possível ler a lixeira.');
  }
}

const trashAction = (fn: 'deleteOffer' | 'restoreOffer' | 'deleteProduct' | 'restoreProduct', msg: string) =>
  async (req: AuthenticatedRequest, res: Response) => {
    if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Só ADMIN.' });
    if (req.query.mode === 'demo') return res.status(400).json({ error: 'Só na conta real.' });
    try {
      const item = await trashSvc(req)[fn](String(req.params.id), req.body?.confirm_code, req.user?.id || null);
      return res.status(200).json({ item });
    } catch (e) {
      return trashFail(res, e, msg);
    }
  };

export const deleteOfferToTrash = trashAction('deleteOffer', 'Não foi possível excluir a oferta.');
export const restoreOfferFromTrash = trashAction('restoreOffer', 'Não foi possível restaurar a oferta.');
export const deleteProductToTrash = trashAction('deleteProduct', 'Não foi possível excluir o produto.');
export const restoreProductFromTrash = trashAction('restoreProduct', 'Não foi possível restaurar o produto.');
