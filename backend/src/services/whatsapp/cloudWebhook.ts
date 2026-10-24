// NORQVA-0079 (D-0079): webhook da Cloud API oficial da Meta, um endereço por conta Meta:
//   GET  /api/whatsapp/cloud/webhook/:accountId  → verificação (hub.challenge)
//   POST /api/whatsapp/cloud/webhook/:accountId  → mensagens e status de envio
// A assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo BRUTO com o App Secret da conta) é conferida
// antes de qualquer leitura. Mensagem de número de outra conta é ignorada.
// Mensagens repetidas pela Meta são descartadas pelo índice único (conversa + ID da mensagem).
import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { loadAccountForWebhook } from './cloudAccounts';
import { openSecret } from '../../utils/secretBox';
import { ingestInbound, InboundMessage, NormalizedInbound } from './whatsappService';
import { adReferralFromCloud } from './whatsappRefs';
import { jidFromWaId, digitsOf } from './metaCloudProvider';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Verificação do webhook (GET). Devolve o challenge em texto quando o verify token confere. */
export async function verifyCloudWebhook(pool: Pool, accountId: string, query: any): Promise<{ status: number; body: string }> {
  const mode = String(query?.['hub.mode'] ?? '');
  const token = String(query?.['hub.verify_token'] ?? '');
  const challenge = String(query?.['hub.challenge'] ?? '');
  const loaded = await loadAccountForWebhook(pool, accountId);
  if (!loaded || mode !== 'subscribe' || !token || !challenge) return { status: 403, body: 'forbidden' };
  if (!safeEqual(sha256(token), String(loaded.account.verify_token_hash))) return { status: 403, body: 'forbidden' };
  await pool.query('UPDATE whatsapp_cloud_accounts SET webhook_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [loaded.account.id]);
  await writeAuditLog(pool, null, 'WHATSAPP_CLOUD_WEBHOOK_VERIFIED', `Webhook da conta Meta "${loaded.account.label}" verificado pela Meta.`);
  return { status: 200, body: challenge.slice(0, 200) };
}

export function signatureValid(rawBody: Buffer | undefined, header: string | undefined, appSecret: string): boolean {
  if (!rawBody || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header).trim());
  if (!m) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeEqual(expected, m[1].toLowerCase());
}

/** Tipo de mensagem da Meta → texto e tipo interno (o mesmo do motor da Evolution). Null = ignorar. */
export function cloudMessageContent(msg: any): { body: string; kind: string } | null {
  if (!msg || typeof msg !== 'object') return null;
  switch (String(msg.type || '')) {
    case 'text': return { body: String(msg.text?.body ?? ''), kind: 'TEXT' };
    case 'button': return { body: String(msg.button?.text ?? msg.button?.payload ?? ''), kind: 'TEXT' };
    case 'interactive': {
      const t = msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title;
      return t ? { body: String(t), kind: 'TEXT' } : { body: '[mensagem não suportada]', kind: 'OTHER' };
    }
    case 'image': return { body: msg.image?.caption ? String(msg.image.caption) : '[imagem]', kind: 'IMAGE' };
    case 'video': return { body: msg.video?.caption ? String(msg.video.caption) : '[vídeo]', kind: 'VIDEO' };
    case 'audio': return { body: '[áudio]', kind: 'AUDIO' };
    case 'document': return { body: `[arquivo] ${msg.document?.filename || ''}`.trim(), kind: 'DOCUMENT' };
    case 'sticker': return { body: '[figurinha]', kind: 'STICKER' };
    case 'location': return { body: '[localização]', kind: 'OTHER' };
    case 'contacts': return { body: '[contato]', kind: 'OTHER' };
    case 'reaction': return null;
    // avisos do próprio WhatsApp (troca de número, boas-vindas): não são mensagem do cliente
    case 'system': return null;
    case 'request_welcome': return null;
    default: return { body: '[mensagem não suportada]', kind: 'OTHER' };
  }
}

const STATUS_MAP: Record<string, { status: string; rank: number }> = {
  sent: { status: 'SENT', rank: 1 },
  delivered: { status: 'DELIVERED', rank: 2 },
  read: { status: 'READ', rank: 3 },
  failed: { status: 'FAILED', rank: 9 }
};

/**
 * Um app da Meta tem UM endereço de webhook; se ele atende mais de uma conta (WABA), os eventos de todas chegam
 * no endereço de uma delas. A conta certa é a do mesmo app, com a WABA do evento e a MESMA chave secreta
 * que validou a assinatura. Sem correspondência exata, o evento é ignorado (nunca vai para a conta errada).
 */
async function accountForEntry(pool: Pool, base: any, wabaId: string, appSecret: string | null): Promise<any | null> {
  if (String(base.waba_id) === wabaId) return base;
  if (!appSecret) return null;
  const r = await pool.query(
    `SELECT * FROM whatsapp_cloud_accounts WHERE app_id = $1 AND waba_id = $2 AND is_deleted = FALSE AND status <> 'DISABLED'`,
    [base.app_id, wabaId]
  );
  for (const a of r.rows) {
    try {
      if (safeEqual(openSecret(a.app_secret_enc), appSecret)) return a;
    } catch {
      // segredo ilegível: não serve
    }
  }
  return null;
}

export interface CloudWebhookResult {
  /** mensagens novas por número (para o atendente) */
  inbound: { numberId: string; messages: InboundMessage[] }[];
  ignored: number;
  statuses: number;
}

/**
 * Processa um POST já com a assinatura conferida.
 * Erros de um item não derrubam os outros: o webhook sempre devolve 200 para a Meta não reenviar tudo.
 */
export async function processCloudWebhook(pool: Pool, baseAccount: any, payload: any, appSecret: string | null = null): Promise<CloudWebhookResult> {
  const out: CloudWebhookResult = { inbound: [], ignored: 0, statuses: 0 };
  if (payload?.object !== 'whatsapp_business_account') return out;
  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry.slice(0, 20) : [];
  for (const entry of entries) {
    const account = await accountForEntry(pool, baseAccount, String(entry?.id ?? baseAccount.waba_id), appSecret);
    if (!account) {
      out.ignored++;
      continue;
    }
    const changes: any[] = Array.isArray(entry?.changes) ? entry.changes.slice(0, 20) : [];
    for (const ch of changes) {
      if (ch?.field !== 'messages') continue;
      const value = ch.value || {};
      const phoneNumberId = String(value?.metadata?.phone_number_id || '');
      const nr = await pool.query(
        `SELECT id, status FROM whatsapp_numbers WHERE cloud_account_id = $1 AND phone_number_id = $2 AND provider = 'META_CLOUD' AND is_deleted = FALSE`,
        [account.id, phoneNumberId]
      );
      const number = nr.rows[0];
      if (!number) {
        // número de outra conta ou ainda não cadastrado no NORQVA
        console.warn(JSON.stringify({ event: 'WHATSAPP_CLOUD_WEBHOOK_UNKNOWN_NUMBER', account_id: account.id, phone_number_id: phoneNumberId || null }));
        out.ignored++;
        continue;
      }
      // mensagens recebidas
      const names = new Map<string, string>();
      for (const c of Array.isArray(value.contacts) ? value.contacts : []) {
        if (c?.wa_id && c?.profile?.name) names.set(digitsOf(c.wa_id), String(c.profile.name).slice(0, 120));
      }
      const items: NormalizedInbound[] = [];
      for (const m of (Array.isArray(value.messages) ? value.messages : []).slice(0, 50)) {
        const content = cloudMessageContent(m);
        if (!content) continue;
        const from = digitsOf(m?.from);
        if (from.length < 8) continue;
        const ts = Number(m?.timestamp);
        items.push({
          jid: jidFromWaId(from),
          fromMe: false,
          providerId: m?.id ? String(m.id).slice(0, 120) : null,
          phone: from,
          name: names.get(from) || null,
          body: content.body,
          kind: content.kind,
          at: Number.isFinite(ts) && ts > 1e9 ? new Date(ts * 1000) : new Date(),
          adReferral: adReferralFromCloud(m)
        });
      }
      if (items.length) {
        const fresh = await ingestInbound(pool, number.id, items);
        if (fresh.length) out.inbound.push({ numberId: number.id, messages: fresh });
      }
      // status das mensagens enviadas
      for (const s of (Array.isArray(value.statuses) ? value.statuses : []).slice(0, 100)) {
        const map = STATUS_MAP[String(s?.status || '')];
        if (!map || !s?.id) continue;
        const errCode = Array.isArray(s.errors) && s.errors[0]?.code !== undefined ? String(s.errors[0].code).slice(0, 40) : null;
        // NORQVA-0101: falha de entrega fica no log com o motivo da Meta (também para mensagens enviadas pelo painel da Meta,
        // que não estão no NORQVA). Destino mascarado: só os 4 últimos dígitos.
        if (map.status === 'FAILED') {
          const e0 = Array.isArray(s.errors) ? s.errors[0] || {} : {};
          console.warn(JSON.stringify({
            event: 'WHATSAPP_CLOUD_DELIVERY_FAILED',
            account_id: account.id,
            phone_number_id: phoneNumberId,
            recipient_last4: digitsOf(s.recipient_id).slice(-4),
            code: e0.code ?? null,
            title: e0.title ? String(e0.title).slice(0, 200) : null,
            message: e0.message ? String(e0.message).slice(0, 300) : null,
            details: e0.error_data?.details ? String(e0.error_data.details).slice(0, 300) : null
          }));
        }
        const upd = await pool.query(
          `UPDATE whatsapp_messages m
              SET delivery_status = $1::text,
                  error_code = COALESCE($2::text, m.error_code),
                  send_status = CASE WHEN $1::text = 'FAILED' THEN 'FAILED' ELSE m.send_status END
             FROM whatsapp_conversations c
            WHERE m.conversation_id = c.id AND c.number_id = $3 AND m.provider_message_id = $4 AND m.direction = 'OUT'
              AND ($1::text = 'FAILED' OR (CASE m.delivery_status WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 WHEN 'READ' THEN 3 WHEN 'FAILED' THEN 9 ELSE 0 END) < $5::int)
          RETURNING m.conversation_id`,
          [map.status, errCode, number.id, String(s.id).slice(0, 120), map.rank]
        );
        out.statuses += upd.rowCount || 0;
        // mensagem que não chegou ao cliente: uma pessoa olha a conversa
        if (map.status === 'FAILED' && upd.rows[0]?.conversation_id) {
          await pool.query(`UPDATE whatsapp_conversations SET needs_human = TRUE, updated_at = NOW() WHERE id = $1`, [upd.rows[0].conversation_id]);
        }
      }
    }
  }
  return out;
}
