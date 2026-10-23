import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { GenerationService, GenerationError } from '../services/creative/generationService';
import { resolveBrandPixelId } from '../services/brands/brandService';

// NORQVA-0116 (D-0116): Geração a partir de uma referência. Mesma trava da etapa 1 (CREATIVE_REFERENCES_ENABLED)
// nas rotas internas. Gerar/editar: ADMIN e CREATIVE. Aprovar, publicar, tirar do ar e lixeira: ADMIN.
// A rota pública só devolve páginas PUBLICADAS e só campos seguros.

const svc = (req: AuthenticatedRequest) => new GenerationService(req.app.get('db') as Pool);

function fail(res: Response, e: any, fallback: string) {
  if (e instanceof GenerationError) return res.status(e.status).json({ error: e.message, ...(e.issues ? { issues: e.issues } : {}) });
  console.error(fallback, e?.message || e);
  return res.status(500).json({ error: fallback });
}

export async function postGenerate(req: AuthenticatedRequest, res: Response) {
  try {
    const service = svc(req);
    const out = await service.generate(
      {
        referenceId: req.params.id,
        productId: req.body?.product_id,
        offerId: req.body?.offer_id,
        adCount: req.body?.ad_count,
        newImages: req.body?.new_images
      },
      req.user?.id || null
    );
    // imagens novas da KIE ficam prontas em segundo plano (a tela atualiza sozinha)
    if (out.imagesPending) {
      service.runImageJob(out.id).catch(err => console.error('[geração] imagens falharam:', err?.message || err));
    }
    return res.status(201).json(await service.get(out.id));
  } catch (e) {
    return fail(res, e, 'Não foi possível gerar a página e os anúncios.');
  }
}

export async function listGeneratedPages(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).list(req.query.reference_id));
  } catch (e) {
    return fail(res, e, 'Não foi possível carregar as páginas geradas.');
  }
}

export async function getGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).get(String(req.params.id)));
  } catch (e) {
    return fail(res, e, 'Não foi possível abrir a página gerada.');
  }
}

export async function patchGeneratedSection(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).editSection(String(req.params.id), Number(req.params.order), req.body || {}, req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível salvar a seção.');
  }
}

export async function regenerateGeneratedSection(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).regenerateSection(String(req.params.id), Number(req.params.order), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível gerar a seção de novo.');
  }
}

export async function patchGeneratedAd(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).editAd(String(req.params.id), String(req.params.creativeId), req.body || {}, req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível salvar o anúncio.');
  }
}

export async function regenerateGeneratedAd(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).regenerateAd(String(req.params.id), String(req.params.creativeId), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível gerar o anúncio de novo.');
  }
}

export async function approveGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).approve(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível aprovar a página.');
  }
}

export async function publishGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).publish(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível publicar a página.');
  }
}

export async function unpublishGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).unpublish(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível tirar a página do ar.');
  }
}

export async function deleteGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).softDelete(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível excluir a página.');
  }
}

export async function restoreGeneratedPage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).restore(String(req.params.id), req.user?.id || null));
  } catch (e) {
    return fail(res, e, 'Não foi possível restaurar a página.');
  }
}

/** Pública: só PUBLICADA, só campos seguros. O pixel é o da marca da oferta (como as outras páginas do comprador). */
export async function getPublicGeneratedPage(req: AuthenticatedRequest, res: Response) {
  const pool = req.app.get('db') as Pool;
  try {
    const page = await new GenerationService(pool).publicPage(String(req.params.slug || ''));
    const { offer_id, ...safe } = page;
    return res.status(200).json({ ...safe, meta_pixel_id: await resolveBrandPixelId(pool, { offerId: offer_id }).catch(() => null) });
  } catch (e) {
    if (e instanceof GenerationError) return res.status(e.status).json({ error: e.message });
    console.error('Página gerada pública:', (e as any)?.message || e);
    return res.status(500).json({ error: 'Falha ao abrir a página.' });
  }
}
