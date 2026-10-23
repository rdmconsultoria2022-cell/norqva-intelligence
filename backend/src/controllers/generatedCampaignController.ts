import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { writeAuditLog } from '../db/audit';
import { LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { GeneratedCampaignService, MUTATION_DISABLED_MESSAGE } from '../services/launchPlans/generatedCampaignService';
import { createPlanOnMetaAudited } from './launchPlanController';

// NORQVA-0117 (D-0117): "Criar campanha pausada" a partir de uma página gerada e publicada. Só ADMIN.
// Monta o plano de lançamento de sempre (rascunho, um por página) e cria na Meta pela mesma rotina do plano,
// tudo PAUSADO. Nada aqui ativa: ativar continua só pelo "Sim" do plano, com o código.

const svc = (req: AuthenticatedRequest) => new GeneratedCampaignService(req.app.get('db') as Pool);

function fail(res: Response, e: any, fallback: string) {
  if (e instanceof LaunchPlanError) return res.status(e.status).json({ error: e.message });
  console.error(fallback, e?.message || e);
  return res.status(500).json({ error: fallback });
}

export async function getGeneratedCampaign(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await svc(req).overview(String(req.params.id)));
  } catch (e) {
    return fail(res, e, 'Não foi possível carregar a campanha da página.');
  }
}

export async function postGeneratedCampaign(req: AuthenticatedRequest, res: Response) {
  const pool = req.app.get('db') as Pool;
  const userId = req.user?.id || null;
  try {
    const { plan, existing, rebuilt, message } = await svc(req).draft(String(req.params.id), req.body || {}, userId);
    if (GeneratedCampaignService.nothingToCreate(plan)) {
      return res.status(200).json({ plan, existing: true, message: message || `Esta página já tem a campanha ${plan.code}.` });
    }
    if (!GeneratedCampaignService.mutationEnabled()) {
      return res.status(200).json({ plan, existing, rebuilt: !!rebuilt, meta: 'DISABLED', message: MUTATION_DISABLED_MESSAGE });
    }
    const out = await createPlanOnMetaAudited(req, plan.id);
    if (out.status !== 200) {
      const after = await svc(req).planForPage(String(req.params.id));
      return res.status(out.status).json({ ...out.body, plan: after });
    }
    await writeAuditLog(
      pool, userId, 'GENERATED_CAMPAIGN_CREATED',
      `Campanha ${plan.code} criada na Meta, toda PAUSADA, a partir de uma página gerada. Ativar só pelo Sim do plano.`,
      null, JSON.stringify({ plan_id: plan.id, meta_ids: out.body?.plan?.meta_ids || null }), false, false
    );
    return res.status(200).json({ plan: out.body.plan, existing, rebuilt: !!rebuilt, created: true });
  } catch (e) {
    return fail(res, e, 'Não foi possível criar a campanha.');
  }
}
