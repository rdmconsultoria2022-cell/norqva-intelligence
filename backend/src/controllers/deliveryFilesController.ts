import express, { Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { DeliveryFileService, DeliveryFileError, MAX_PDF_BYTES } from '../services/delivery/deliveryFileService';
import { generateStorageSignedUrl } from './api';

// NORQVA-0033: PDF entregue ao comprador, pela tela (todas as rotas só ADMIN; conferido de novo aqui).

const svc = (req: AuthenticatedRequest) => new DeliveryFileService(req.app.get('db') as Pool);

function fail(res: Response, e: any, fallback: string) {
  if (e instanceof DeliveryFileError) return res.status(e.status).json({ error: e.message });
  console.error(fallback, e?.message || e);
  return res.status(500).json({ error: fallback });
}

const adminOnly = (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Só ADMIN mexe no arquivo entregue ao comprador.' });
    return false;
  }
  return true;
};

const rawPdf = express.raw({ type: 'application/pdf', limit: MAX_PDF_BYTES });
/** Lê o corpo como PDF; arquivo grande demais ou corpo ilegível vira resposta clara, não erro genérico. */
export function pdfBody(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  rawPdf(req, res, (err?: any) => {
    if (err) {
      const tooBig = err.status === 413 || err.type === 'entity.too.large';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'Arquivo maior que 50 MB.' : 'Não foi possível ler o arquivo enviado.' });
    }
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Envie o arquivo como PDF (Content-Type: application/pdf).' });
    }
    next();
  });
}

export async function getOfferDeliveryFiles(req: AuthenticatedRequest, res: Response) {
  if (!adminOnly(req, res)) return;
  try {
    return res.status(200).json(await svc(req).forOffer(req.params.id));
  } catch (e: any) {
    return fail(res, e, 'Não foi possível ler os arquivos da oferta.');
  }
}

export async function createOfferDeliveryFile(req: AuthenticatedRequest, res: Response) {
  if (!adminOnly(req, res)) return;
  try {
    const r = await svc(req).createForOffer(req.params.id, req.body, req.headers['x-file-name'], req.user?.id || null);
    return res.status(201).json(r);
  } catch (e: any) {
    return fail(res, e, 'Não foi possível enviar o arquivo.');
  }
}

export async function replaceDeliveryFile(req: AuthenticatedRequest, res: Response) {
  if (!adminOnly(req, res)) return;
  try {
    const r = await svc(req).replace(req.params.id, req.body, req.headers['x-file-name'], req.user?.id || null);
    return res.status(200).json(r);
  } catch (e: any) {
    return fail(res, e, 'Não foi possível trocar o arquivo. Nada foi trocado.');
  }
}

export async function restoreDeliveryFileVersion(req: AuthenticatedRequest, res: Response) {
  if (!adminOnly(req, res)) return;
  try {
    const r = await svc(req).restore(req.params.id, req.params.versionId, req.user?.id || null);
    return res.status(200).json(r);
  } catch (e: any) {
    return fail(res, e, 'Não foi possível voltar a versão.');
  }
}

/** Link de 5 minutos para o ADMIN conferir o arquivo que está sendo entregue. */
export async function getDeliveryFileCheckLink(req: AuthenticatedRequest, res: Response) {
  if (!adminOnly(req, res)) return;
  try {
    const a = await svc(req).asset(req.params.id);
    const url = await generateStorageSignedUrl(a.storage_bucket, a.storage_path, 300);
    return res.status(200).json({ url, expires_in_seconds: 300 });
  } catch (e: any) {
    if (e?.message === 'SUPABASE_STORAGE_OBJECT_NOT_FOUND') {
      return res.status(404).json({ error: 'O arquivo cadastrado não está no armazenamento: o comprador não conseguiria baixar. Envie o PDF com "Trocar arquivo".' });
    }
    return fail(res, e, 'Não foi possível gerar o link de conferência.');
  }
}
