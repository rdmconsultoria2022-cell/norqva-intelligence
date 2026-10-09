import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { CriteriaService, CriteriaError } from '../services/research/criteriaService';

// NORQVA-0029: aba Critérios da tela Pesquisa. Ler: perfis de análise. Ajustar e validar: só ADMIN.

const service = new CriteriaService();

function fail(res: Response, err: unknown, msg: string) {
  if (err instanceof CriteriaError) return res.status(err.status).json({ error: err.message });
  console.error('[RESEARCH CRITERIA]', err);
  return res.status(500).json({ error: msg });
}

export async function getResearchCriteria(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await service.overview(pool));
  } catch (err) {
    return fail(res, err, 'Falha ao carregar os critérios.');
  }
}

export async function createResearchCriteriaDraft(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const out = await service.createDraft(pool, { numbers: req.body?.numbers, note: req.body?.note }, req.user?.id || null);
    return res.status(201).json(out);
  } catch (err) {
    return fail(res, err, 'Falha ao criar o rascunho dos critérios.');
  }
}

export async function validateResearchCriteria(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const out = await service.validate(pool, Number(req.params.version), req.user?.id || null);
    return res.status(200).json(out);
  } catch (err) {
    return fail(res, err, 'Falha ao validar os critérios.');
  }
}
