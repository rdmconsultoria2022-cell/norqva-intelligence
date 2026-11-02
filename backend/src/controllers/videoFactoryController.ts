import { Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { GenerationError } from '../services/creative/generationService';
import { VideoFactoryService, videoFactoryEnabled, VIDEO_FACTORY_DISABLED_MESSAGE } from '../services/creative/videoFactoryClient';

// NORQVA-0160: vídeo com apresentadora (Criativos → Fábrica). Trava VIDEO_FACTORY_ENABLED (desligada = 404).
// Criar, editar roteiro, escolher tomada e montar: ADMIN e CREATIVE. Aprovar gasto e gerar cena de novo: só ADMIN.

const svc = (req: AuthenticatedRequest) => new VideoFactoryService(req.app.get('db') as Pool);

export function videoFactoryFlag(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!videoFactoryEnabled()) return res.status(404).json({ error: VIDEO_FACTORY_DISABLED_MESSAGE });
  next();
}

function fail(res: Response, e: any, fallback: string) {
  if (e instanceof GenerationError) return res.status(e.status).json({ error: e.message });
  console.error(fallback, e?.message || e);
  return res.status(500).json({ error: fallback });
}

const actor = (req: AuthenticatedRequest) => req.user?.id || null;

export async function getVideoFactoryCatalog(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).catalog());
  } catch (e) {
    return fail(res, e, 'Não foi possível carregar as apresentadoras.');
  }
}

export async function listVideoProductions(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).list({ productId: req.query.product_id, pageId: req.query.generated_page_id }));
  } catch (e) {
    return fail(res, e, 'Não foi possível carregar os vídeos.');
  }
}

export async function postVideoProduction(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await svc(req).create(req.body || {}, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível criar o roteiro do vídeo.');
  }
}

export async function getVideoProduction(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).get(String(req.params.id)));
  } catch (e) {
    return fail(res, e, 'Não foi possível abrir o vídeo.');
  }
}

export async function putVideoScript(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).editScript(String(req.params.id), req.body?.scenes, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível salvar o roteiro.');
  }
}

export async function approveVideoProduction(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).approve(String(req.params.id), req.body?.extra === true, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível aprovar o gasto.');
  }
}

export async function regenerateVideoScene(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).regenerateScene(String(req.params.id), req.params.sceneId, req.body?.new_line, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível gerar a cena de novo.');
  }
}

export async function chooseVideoTake(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).chooseTake(String(req.params.id), req.params.sceneId, req.body?.take_id, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível escolher a tomada.');
  }
}

export async function assembleVideoProduction(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).assemble(String(req.params.id), req.body?.format, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível montar o vídeo.');
  }
}

export async function useVideoInAd(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).useInAd(String(req.params.id), req.body?.creative_id, actor(req)));
  } catch (e) {
    return fail(res, e, 'Não foi possível colocar o vídeo no anúncio.');
  }
}
