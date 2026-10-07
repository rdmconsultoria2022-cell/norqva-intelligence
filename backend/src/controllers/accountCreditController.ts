import { Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { AccountCreditService } from '../services/meta/accountCreditService';

// Painel de créditos da conta Meta (ADMIN, somente leitura).

let service = new AccountCreditService();
export function setAccountCreditServiceForTesting(s: AccountCreditService | null) {
  service = s || new AccountCreditService();
}

export async function getAccountCredit(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const out = await service.getPanel(pool, req.query.mode === 'demo', req.query.refresh === '1');
    return res.status(200).json(out);
  } catch (err: any) {
    const msg = String(err?.message || 'erro').replace(/access_token=[^&\s]+/g, 'access_token=[REDACTED]').slice(0, 300);
    console.error('[ACCOUNT_CREDIT]', msg);
    return res.status(502).json({ error: `Não consegui ler a cobrança da conta na Meta: ${msg}` });
  }
}
