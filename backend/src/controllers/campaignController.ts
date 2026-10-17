import { Response } from 'express';
import { CampaignInsightService, CampaignInsightError } from '../services/campaigns/campaignInsightService';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CampaignEditorService } from '../services/launchPlans/campaignEditorService';
import { LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { replaceAdCreative } from '../services/launchPlans/adCreativeSwap';
import { MetaMutatingClient } from '../services/meta/metaMutatingClient';
import { decisionContextFromRequest } from '../db/decisionEvents';

// NORQVA-0027: tela Campanhas. Rotas ADMIN; só editam o rascunho do plano (nada vai para a Meta aqui).
// Criar na Meta continua em POST /api/launch-plans/:id/create (tudo pausado) e ativar só com o Sim.

const service = new CampaignEditorService();

function fail(res: Response, err: any, msg: string) {
  if (err instanceof LaunchPlanError) return res.status(err.status).json({ error: err.message });
  console.error('[CAMPAIGNS]', msg, err);
  return res.status(500).json({ error: msg });
}

const demoBlocked = (req: AuthenticatedRequest, res: Response) => {
  if (req.query.mode === 'demo') {
    res.status(400).json({ error: 'Campanhas só existem na conta REAL.' });
    return true;
  }
  return false;
};

const uid = (req: AuthenticatedRequest) => req.user?.id || null;
const db = (req: AuthenticatedRequest): Pool => req.app.get('db');

export async function listCampaigns(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json({ campaigns: await service.list(db(req)) });
  } catch (err) {
    return fail(res, err, 'Falha ao carregar as campanhas.');
  }
}

export async function getCampaign(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.get(db(req), String(req.params.id)));
  } catch (err) {
    return fail(res, err, 'Falha ao carregar a campanha.');
  }
}

export async function getOfferCreativeOptions(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.offerCreativeOptions(db(req), String(req.query.offer || '').trim()));
  } catch (err) {
    return fail(res, err, 'Falha ao listar os criativos da oferta.');
  }
}

export async function getCampaignCreativeOptions(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.creativeOptions(db(req), String(req.params.id)));
  } catch (err) {
    return fail(res, err, 'Falha ao listar os criativos.');
  }
}

export async function fillCampaign(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.fillFromCreatives(db(req), String(req.params.id), uid(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao preencher com os criativos.');
  }
}

export async function saveCampaignFields(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.saveFields(db(req), String(req.params.id), req.body?.fields || {}, uid(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao salvar a campanha.');
  }
}

export async function chooseCampaignCreative(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'Anúncio inválido.' });
    const creativeId = req.body?.creative_id ? String(req.body.creative_id) : null;
    return res.status(200).json(await service.chooseCreative(db(req), String(req.params.id), idx, creativeId, uid(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao escolher o criativo.');
  }
}

export async function resetCampaign(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await service.resetToAuto(db(req), String(req.params.id), uid(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao voltar ao automático.');
  }
}

export async function createCampaignFromOffer(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(201).json(await service.createFromOffer(db(req), req.body || {}, uid(req)));
  } catch (err) {
    return fail(res, err, 'Falha ao criar a campanha.');
  }
}

// NORQVA-0056: trocar destino/texto de um anúncio já criado na Meta (peça nova no mesmo anúncio).
let swapClientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
export function setAdSwapClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  swapClientFactory = factory || (() => new MetaMutatingClient());
}

export async function replaceCampaignAdOnMeta(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    const r = await replaceAdCreative(
      db(req),
      String(req.params.id),
      Number(req.params.index),
      req.body || {},
      { id: uid(req), email: req.user?.email || null },
      decisionContextFromRequest(req as any),
      swapClientFactory()
    );
    return res.status(200).json({ ...r, campaign: await service.get(db(req), String(req.params.id)) });
  } catch (err) {
    return fail(res, err, 'Falha ao trocar o anúncio na Meta.');
  }
}

// NORQVA-0096: leituras do "Gerenciar campanha" (equilíbrio da oferta e histórico). Só leitura.

function insightFail(res: Response, err: any, msg: string) {
  if (err instanceof CampaignInsightError) return res.status(err.status).json({ error: err.message });
  console.error('[CAMPAIGN INSIGHT]', err);
  return res.status(500).json({ error: msg });
}

export async function getCampaignEconomics(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await new CampaignInsightService(db(req)).economics(String(req.params.id)));
  } catch (err) {
    return insightFail(res, err, 'Falha ao calcular o equilíbrio da campanha.');
  }
}

export async function getCampaignHistory(req: AuthenticatedRequest, res: Response) {
  if (demoBlocked(req, res)) return;
  try {
    return res.status(200).json(await new CampaignInsightService(db(req)).history(String(req.params.id), { role: String(req.user?.role || '') }));
  } catch (err) {
    return insightFail(res, err, 'Falha ao carregar o histórico da campanha.');
  }
}
