// NORQVA-0046: área WhatsApp do NORQVA (números, conexão por QR Code, conversas) e webhook do servidor do WhatsApp.
import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { getWhatsAppProvider, checkEvolutionServer } from '../services/whatsapp/provider';
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
  getConditions,
  saveConditions,
  conditionHistory,
  numberResults,
  InboundMessage
} from '../services/whatsapp/whatsappService';
import { aiConfigured } from '../services/whatsapp/attendant';
import { createWhatsAppRef, WhatsAppRefError } from '../services/whatsapp/whatsappRefs';
import { createOfficialNumber } from '../services/whatsapp/whatsappService';
import {
  listCloudAccounts,
  createCloudAccount,
  updateCloudAccount,
  deleteCloudAccount,
  checkCloudAccount,
  loadAccountForWebhook,
  registerCloudNumber
} from '../services/whatsapp/cloudAccounts';
import { verifyCloudWebhook, signatureValid, processCloudWebhook } from '../services/whatsapp/cloudWebhook';
import { cloudSendEnabled, allowedCloudEnvironments } from '../services/whatsapp/metaCloudProvider';
import { evolutionEnabled } from '../services/whatsapp/provider';
import { secretsKeyConfigured } from '../utils/secretBox';
import { recoveryOverview, queueRecovery } from '../services/whatsapp/paymentRecovery';

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
    return res.status(200).json({ ...r, server_configured: !!getWhatsAppProvider(), ai_configured: aiConfigured(), cloud: cloudLocks() });
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

export async function getWhatsAppConditions(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await getConditions(db(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar as condições de atendimento.');
  }
}

export async function putWhatsAppConditions(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await saveConditions(db(req), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao salvar as condições de atendimento.');
  }
}

export async function getWhatsAppConditionHistory(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await conditionHistory(db(req), req.query.number_id));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar o histórico.');
  }
}

export async function getWhatsAppResults(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await numberResults(db(req), req.query.days));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar os resultados.');
  }
}

/** NORQVA-0047: botão "Testar servidor". Em testes, nunca sai para a internet. */
export async function getWhatsAppServerCheck(req: AuthenticatedRequest, res: Response) {
  try {
    if (process.env.NODE_ENV === 'test' && !(req.app as any).get('waServerCheck')) {
      return res.status(200).json({ ok: false, step: 'CONFIG', problem: 'Teste', version: null, host: null });
    }
    const fn = (req.app as any).get('waServerCheck') || checkEvolutionServer;
    return res.status(200).json(await fn());
  } catch (err) {
    return handle(res, err, 'Falha ao testar o servidor do WhatsApp.');
  }
}

/** Webhook público: o segredo vai no endereço (só o servidor do WhatsApp conhece). Responde rápido e processa depois. */
export async function postWhatsAppWebhook(req: Request, res: Response) {
  const pool = db(req);
  // NORQVA-0079: com a Evolution desligada, nada que chegue por ela é gravado nem respondido
  if (!getWhatsAppProvider()) return res.status(200).json({ ok: true, ignored: true });
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

// ---------- NORQVA-0079: WhatsApp oficial (Cloud API da Meta) ----------

/** Estado das travas, para a tela mostrar o que está liberado. */
function cloudLocks() {
  return {
    send_enabled: cloudSendEnabled(),
    environments: [...allowedCloudEnvironments()],
    evolution_enabled: evolutionEnabled(),
    secrets_key_configured: secretsKeyConfigured()
  };
}

export async function getCloudAccounts(req: AuthenticatedRequest, res: Response) {
  try {
    const r = await listCloudAccounts(db(req));
    // endereço completo para colar no painel da Meta (Webhooks → URL de callback)
    const base = baseUrl(req).replace(/\/+$/, '');
    return res.status(200).json({ ...r, accounts: r.accounts.map(a => ({ ...a, webhook_url: `${base}${a.webhook_path}` })), locks: cloudLocks() });
  } catch (err) {
    return handle(res, err, 'Falha ao carregar as contas Meta.');
  }
}

export async function postCloudAccount(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await createCloudAccount(db(req), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao cadastrar a conta Meta.');
  }
}

export async function patchCloudAccount(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await updateCloudAccount(db(req), String(req.params.id), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao salvar a conta Meta.');
  }
}

export async function deleteCloudAccountRoute(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await deleteCloudAccount(db(req), String(req.params.id), uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao excluir a conta Meta.');
  }
}

export async function postCloudAccountCheck(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await checkCloudAccount(db(req), String(req.params.id), { subscribe: req.body?.subscribe === true }, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao conferir a conta Meta.');
  }
}

export async function postCloudNumber(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(201).json(await createOfficialNumber(db(req), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao cadastrar o número oficial.');
  }
}

/** NORQVA-0102: ativa o número oficial na API da Meta com o PIN de 6 números (o PIN não é guardado). */
export async function postCloudNumberRegister(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await registerCloudNumber(db(req), String(req.params.id), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao ativar o número na Meta.');
  }
}

/** GET público: a Meta confere o verify token e espera o hub.challenge em texto. */
export async function getCloudWebhook(req: Request, res: Response) {
  try {
    const r = await verifyCloudWebhook(db(req), String(req.params.accountId), req.query);
    return res.status(r.status).type('text/plain').send(r.body);
  } catch (err: any) {
    console.error('[WhatsApp oficial] verificação falhou:', err?.message || err);
    return res.status(500).type('text/plain').send('error');
  }
}

/** POST público: assinatura conferida com o corpo bruto antes de qualquer gravação. */
export async function postCloudWebhook(req: Request, res: Response) {
  const pool = db(req);
  try {
    const loaded = await loadAccountForWebhook(pool, String(req.params.accountId));
    if (!loaded) return res.status(404).json({ error: 'not found' });
    const raw: Buffer | undefined = (req as any).rawBody;
    if (!signatureValid(raw, req.get('x-hub-signature-256') || undefined, loaded.appSecret)) {
      console.warn('[WhatsApp oficial] assinatura inválida recusada (conta', loaded.account.id, ')');
      return res.status(401).json({ error: 'invalid signature' });
    }
    if (loaded.account.status === 'DISABLED') return res.status(200).json({ ok: true, ignored: true });
    const r = await processCloudWebhook(pool, loaded.account, req.body, loaded.appSecret);
    res.status(200).json({ ok: true });
    // NORQVA-0101: resumo de cada entrega da Meta (sem conteúdo de mensagem)
    console.log(JSON.stringify({
      event: 'WHATSAPP_CLOUD_WEBHOOK',
      account_id: loaded.account.id,
      inbound: r.inbound.reduce((n, i) => n + i.messages.length, 0),
      statuses: r.statuses,
      ignored: r.ignored
    }));
    if (inboundHandler) {
      for (const item of r.inbound) {
        const handler = inboundHandler;
        setImmediate(() => {
          handler(pool, item.numberId, item.messages).catch(e => console.error('[WhatsApp oficial] atendente falhou:', e?.message || e));
        });
      }
    }
    return;
  } catch (err) {
    console.error('[WhatsApp oficial] webhook falhou:', (err as any)?.message || err);
    return res.status(500).json({ error: 'webhook error' });
  }
}

/**
 * NORQVA-0054 (contrato NORQVA-0053 item 3): POST /api/public/whatsapp/ref — público.
 * A página pede o código de origem e recebe o link do WhatsApp com a mensagem pronta.
 * Guarda a origem (campanha, anúncio, clique) para o pedido feito na conversa.
 */
export async function postPublicWhatsAppRef(req: Request, res: Response) {
  try {
    const fwd = req.headers['x-forwarded-for'];
    const ip = fwd ? String(fwd).split(',')[0].trim() : req.socket?.remoteAddress || req.ip || null;
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    const r = await createWhatsAppRef(db(req), req.body || {}, { ip, userAgent: ua });
    return res.status(201).json(r);
  } catch (err: any) {
    if (err instanceof WhatsAppRefError) return res.status(err.status).json({ error: err.message });
    console.error('[WhatsApp] código de origem falhou:', err?.message || err);
    return res.status(500).json({ error: 'Falha ao abrir o WhatsApp. Compre direto na página.' });
  }
}

// ---------- NORQVA-0125: pagamentos não concluídos (só ADMIN) ----------

export async function getWhatsAppRecovery(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await recoveryOverview(db(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao carregar os pagamentos não concluídos.');
  }
}

export async function postWhatsAppRecoverySend(req: AuthenticatedRequest, res: Response) {
  try {
    return res.status(200).json(await queueRecovery(db(req), req.body, uid(req)));
  } catch (err) {
    return handle(res, err, 'Falha ao colocar as mensagens na fila.');
  }
}
