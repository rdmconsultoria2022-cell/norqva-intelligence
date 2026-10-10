// NORQVA-0046: área WhatsApp do NORQVA (números, conexão por QR Code, conversas) e webhook do servidor do WhatsApp.
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { getWhatsAppProvider } from '../services/whatsapp/provider';
import {
  WhatsAppError,
  listNumbers,
  createNumber,
  updateNumber,
  connectNumber,
  refreshNumber,
  swapNumber,
  deleteNumber,
  handleWebhook,
  listConversations,
  getConversationMessages,
  sendOperatorMessage,
  setConversationMode,
  InboundMessage
} from '../services/whatsapp/whatsappService';

function handle(res: Response, err: any, fallback: string) {
  if (err instanceof WhatsAppError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err?.message || err);
  return res.status(500).json({ error: fallback });
}

/** Endereço público desta API (para o servidor do WhatsApp mandar as mensagens). */
function baseUrl(req: Request): string {
  const env = (process.env.WHATSAPP_WEBHOOK_BASE_URL || '').trim();
  if (env) return env;
  return `${req.protocol}://${req.get('host')}`;
}

type InboundHandler = (pool: Pool, numberId: string, msgs: InboundMessage[]) => Promise<void>;
let inboundHandler: InboundHandler | null = null;
/** O atendente automático (etapa 3) se registra aqui. */
export function setWhatsAppInboundHandler(h: InboundHandler | null) {
  inboundHandler = h;
}

const db = (req: Request): Pool => req.app.get('db');
const uid = (req: AuthenticatedRequest) => req.user?.id || null;

export async function getWhatsAppNumbers(req: AuthenticatedRequest, res: Response) {
  try {
    const r = await listNumbers(db(req));
    return res.status(200).json({ ...r, server_configured: !!getWhatsAppProvider() });
  } catch (err) {
    return handle(res, err, 'Falha ao carregar os números.');
  }
}

export async function postWhatsAppNumber(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await createNumber(db(req), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao cadastrar o número.');
  }
}

export async function patchWhatsAppNumber(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await updateNumber(db(req), String(req.params.id), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao salvar o número.');
  }
}

export async function postWhatsAppConnect(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await connectNumber(db(req), getWhatsAppProvider(), String(req.params.id), baseUrl(req), uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao gerar o QR Code.');
  }
}

export async function getWhatsAppNumberStatus(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await refreshNumber(db(req), getWhatsAppProvider(), String(req.params.id)));
  } catch (err) {
    return handle(res, err, 'Falha ao consultar o número.');
  }
}

export async function postWhatsAppSwap(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await swapNumber(db(req), getWhatsAppProvider(), String(req.params.id), baseUrl(req), uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao trocar o número.');
  }
}

export async function deleteWhatsAppNumber(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await deleteNumber(db(req), getWhatsAppProvider(), String(req.params.id), uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao excluir o número.');
  }
}

export async function getWhatsAppConversations(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await listConversations(db(req), { number_id: req.query.number_id, filter: req.query.filter, search: req.query.search }));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar as conversas.');
  }
}

export async function getWhatsAppMessages(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await getConversationMessages(db(req), String(req.params.id)));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar a conversa.');
  }
}

export async function postWhatsAppMessage(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await sendOperatorMessage(db(req), getWhatsAppProvider(), String(req.params.id), req.body?.text, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao enviar a mensagem.');
  }
}

export async function postWhatsAppConversationMode(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await setConversationMode(db(req), String(req.params.id), req.body?.mode, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao mudar o modo da conversa.');
  }
}

/** Webhook público: o segredo vai no endereço (só o servidor do WhatsApp conhece). Responde rápido e processa depois. */
export async function postWhatsAppWebhook(req: Request, res: Response) {
  const pool = db(req);
  try {
    const r = await handleWebhook(pool, String(req.params.numberId), String(req.params.secret), req.body);
    res.status(200).json({ ok: true });
    if (r.inbound.length && inboundHandler && r.numberId) {
      const numberId = r.numberId;
      setImmediate(() => {
        inboundHandler!(pool, numberId, r.inbound).catch(e => console.error('[WhatsApp] atendente falhou:', e?.message || e));
      });
    }
    return;
  } catch (err) {
    if (err instanceof WhatsAppError && err.status === 404) return res.status(404).json({ error: 'not found' });
    console.error('[WhatsApp] webhook falhou:', (err as any)?.message || err);
    return res.status(500).json({ error: 'webhook error' });
  }
}
