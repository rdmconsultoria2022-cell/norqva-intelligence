import { Request, Response } from 'express';
import { Pool } from 'pg';
import { kiwifySignatureValid, recordKiwifyEvent } from '../services/commerce/kiwifySales';
import { writeAuditLog } from '../db/audit';

/**
 * NORQVA-0110: POST /api/webhooks/kiwify?signature=<hex> — público, sem login.
 * Sem KIWIFY_WEBHOOK_TOKEN: 503 e nada é gravado. Assinatura ausente ou errada: 401.
 * A assinatura é conferida no corpo BRUTO (guardado em index.ts) antes de qualquer leitura.
 */
export async function postKiwifyWebhook(req: Request, res: Response) {
  const token = (process.env.KIWIFY_WEBHOOK_TOKEN || '').trim();
  if (!token) return res.status(503).json({ error: 'kiwify webhook not configured' });

  const parsedByJson = (req as any).rawBody as Buffer | undefined;
  const raw: Buffer | undefined = parsedByJson || (Buffer.isBuffer(req.body) ? req.body : undefined);
  // A documentação da Kiwify confere com JSON.stringify(corpo); aceita também essa forma (mesmo segredo, mesmo conteúdo)
  const reserialized = raw && !Buffer.isBuffer(req.body) && req.body && typeof req.body === 'object'
    ? Buffer.from(JSON.stringify(req.body), 'utf8')
    : undefined;
  const signed = kiwifySignatureValid(raw, req.query.signature, token)
    || (!!reserialized && !reserialized.equals(raw as Buffer) && kiwifySignatureValid(reserialized, req.query.signature, token));
  if (!signed) {
    console.warn('[Kiwify] assinatura ausente ou inválida recusada');
    return res.status(401).json({ error: 'invalid signature' });
  }

  let body: any = req.body;
  if (Buffer.isBuffer(body)) {
    try {
      body = JSON.parse(body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'invalid json' });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'invalid payload' });

  try {
    const pool: Pool = req.app.get('db');
    const r = await recordKiwifyEvent(pool, body);
    if (r.ignored) return res.status(200).json({ ok: true, ignored: true });
    console.log(JSON.stringify({ event: 'KIWIFY_WEBHOOK', sale_id: r.id, status: r.status, created: r.created, changed: r.changed }));
    return res.status(200).json({ ok: true, status: r.status, created: r.created });
  } catch (err: any) {
    console.error('[Kiwify] webhook falhou:', err?.message || err);
    return res.status(500).json({ error: 'webhook error' });
  }
}

/**
 * NORQVA-0111: POST /api/admin/external-sales/kiwify — só ADMIN (login do NORQVA).
 * Registra uma venda da Kiwify que aconteceu antes de o aviso (webhook) existir.
 * Recebe o mesmo formato do aviso da Kiwify e usa a mesma gravação (idempotente, sem CPF ou telefone).
 */
export async function importKiwifySale(req: Request, res: Response) {
  const body: any = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'invalid payload' });
  try {
    const pool: Pool = req.app.get('db');
    const r = await recordKiwifyEvent(pool, body);
    if (r.ignored) return res.status(422).json({ error: r.reason });
    const userId = (req as any).user?.id || null;
    await writeAuditLog(pool, userId, 'KIWIFY_SALE_IMPORTED_MANUAL',
      `Venda da Kiwify registrada à mão pelo administrador (venda ${r.id}).`, null, r.status);
    return res.status(200).json({ ok: true, id: r.id, status: r.status, created: r.created });
  } catch (err: any) {
    console.error('[Kiwify] importação manual falhou:', err?.message || err);
    return res.status(500).json({ error: 'import error' });
  }
}
