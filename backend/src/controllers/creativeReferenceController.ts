import express, { Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  CreativeReferenceService,
  CreativeReferenceError,
  referencesEnabled,
  referenceAiConfigured,
  REFERENCES_DISABLED_MESSAGE,
  MAX_SCREENSHOTS
} from '../services/creative/referenceService';

// NORQVA-0115 (D-0115): Referências. Só a estrutura é guardada; texto e imagens da referência nunca.
// Trava CREATIVE_REFERENCES_ENABLED: desligada, todas as rotas (menos /status) respondem 404.

const svc = (req: AuthenticatedRequest) => new CreativeReferenceService(req.app.get('db') as Pool);

function fail(res: Response, e: any, fallback: string) {
  if (e instanceof CreativeReferenceError) return res.status(e.status).json({ error: e.message });
  console.error(fallback, e?.message || e);
  return res.status(500).json({ error: fallback });
}

/** Desligada: 404 com mensagem clara (a tela esconde a aba). */
export function referencesFlag(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!referencesEnabled()) return res.status(404).json({ error: REFERENCES_DISABLED_MESSAGE });
  next();
}

/** Prints chegam como JSON próprio (o JSON comum do site tem limite de 1 MB). */
export const SCREENSHOTS_CONTENT_TYPE = 'application/vnd.norqva.screenshots+json';
const rawShots = express.json({ type: SCREENSHOTS_CONTENT_TYPE, limit: '30mb' });
export function screenshotsBody(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  rawShots(req, res, (err?: any) => {
    if (err) {
      const tooBig = err.status === 413 || err.type === 'entity.too.large';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'Prints grandes demais (até 5, com 4 MB cada).' : 'Não foi possível ler os prints enviados.' });
    }
    if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.images)) {
      return res.status(400).json({ error: `Envie de 1 a ${MAX_SCREENSHOTS} prints.` });
    }
    next();
  });
}

export async function getReferencesStatus(_req: AuthenticatedRequest, res: Response) {
  return res.status(200).json({ enabled: referencesEnabled(), ai: referencesEnabled() ? referenceAiConfigured() : false });
}

export async function postReferenceFromUrl(req: AuthenticatedRequest, res: Response) {
  try {
    const out = await svc(req).createReference(
      { url: req.body?.url, productId: req.body?.product_id, referenceType: req.body?.reference_type, notes: req.body?.notes },
      req.user?.id || null
    );
    return res.status(201).json({ reference: out });
  } catch (e) {
    return fail(res, e, 'Não foi possível criar a referência.');
  }
}

export async function postReferenceFromScreenshots(req: AuthenticatedRequest, res: Response) {
  try {
    const out = await svc(req).createReference(
      {
        images: req.body?.images,
        adText: req.body?.ad_text,
        productId: req.body?.product_id,
        referenceType: req.body?.reference_type,
        notes: req.body?.notes
      },
      req.user?.id || null
    );
    return res.status(201).json({ reference: out });
  } catch (e) {
    return fail(res, e, 'Não foi possível criar a referência.');
  }
}

export async function listReferences(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).list());
  } catch (e) {
    return fail(res, e, 'Não foi possível carregar as referências.');
  }
}

export async function getReference(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json({ reference: await svc(req).get(String(req.params.id)) });
  } catch (e) {
    return fail(res, e, 'Não foi possível abrir a referência.');
  }
}

export async function deleteReference(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).softDelete(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível excluir a referência.');
  }
}

export async function restoreReference(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).restore(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível restaurar a referência.');
  }
}
