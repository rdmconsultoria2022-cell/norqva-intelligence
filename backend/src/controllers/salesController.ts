import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { resolvePeriodFilter } from '../utils/commercialTimezone';
import { listSales, createManualAccessLink, resendAccessEmail, checkPayment, SalesError, SalesFilter } from '../services/salesService';
import { reconcileAndFinalizePayment } from './api';

// NORQVA-0026: tela Vendas. Leitura para os perfis de análise; ações só ADMIN (rotas em index.ts).

const isDemoReq = (req: AuthenticatedRequest) => req.query.mode === 'demo';

function handle(res: Response, err: any, fallback: string) {
  if (err instanceof SalesError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}

export async function getSales(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const role = req.user?.role;
    const raw = String(req.query.filter || 'ALL').toUpperCase();
    const filter: SalesFilter = (['ALL', 'PAID', 'PENDING', 'PROBLEM'].includes(raw) ? raw : 'ALL') as SalesFilter;
    const range = resolvePeriodFilter(req.query.period as string, req.query.startDate as string, req.query.endDate as string);
    const result = await listSales(pool, {
      isDemo: isDemoReq(req),
      includeTests: req.query.include_tests === 'true',
      filter,
      startIso: range?.startIso ?? null,
      endIso: range?.endIso ?? null,
      canSeeFullPII: role === 'ADMIN' || role === 'OPERATIONS',
      canSeeName: role === 'PERFORMANCE' || role === 'INTELLIGENCE'
    });
    return res.status(200).json(result);
  } catch (err) {
    return handle(res, err, 'Falha ao carregar as vendas.');
  }
}

export async function postSalesAccessLink(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const r = await createManualAccessLink(pool, String(req.params.id), isDemoReq(req), req.user?.id || null);
    return res.status(200).json(r);
  } catch (err) {
    return handle(res, err, 'Falha ao gerar o link de acesso.');
  }
}

export async function postSalesResendAccess(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const r = await resendAccessEmail(pool, String(req.params.id), isDemoReq(req), req.user?.id || null);
    return res.status(200).json(r);
  } catch (err) {
    return handle(res, err, 'Falha ao reenviar o acesso.');
  }
}

export async function postSalesCheckPayment(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const r = await checkPayment(pool, String(req.params.id), isDemoReq(req), req.user?.id || null, reconcileAndFinalizePayment);
    return res.status(200).json(r);
  } catch (err) {
    return handle(res, err, 'Falha ao conferir o pagamento.');
  }
}
