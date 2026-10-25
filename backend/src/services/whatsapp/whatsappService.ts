// NORQVA-0046: números, conversas e mensagens do WhatsApp, tudo operado dentro do NORQVA.
import { Pool } from 'pg';
import { linkRefFromText, linkAdReferral, adReferralFromEvolution, AdReferral } from './whatsappRefs';
import crypto from 'crypto';
import { writeAuditLog } from '../../db/audit';
import { WhatsAppProvider, ProviderError, phoneFromJid } from './provider';
import { validateCpf } from '../../utils/validation';
import { WhatsAppError } from './errors';
import { providerForNumber, cloudErrorToWhatsApp, checkCloudNumber, createCloudNumber } from './cloudAccounts';
import { isCloudProvider, SendBlockedError, CloudApiError } from './metaCloudProvider';
import { isServiceWindowOpen } from './serviceWindow';
import { isExplicitStop, isRecoveryRefusal, isFirstReplyToRecovery, recoveryForReply, carryRecoveryRef, recordRecoveryOptOut } from './paymentRecovery';

export const MAX_WHATSAPP_NUMBERS = 100;
export const MESSAGE_RETENTION_DAYS = 180;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPT_OUT_RE = /^\s*(parar|pare|sair|stop|cancelar|não quero mais|nao quero mais)\s*[.!]*\s*$/i;

const CPF_CANDIDATE_RE = /(?<!\d)(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})(?!\d)/g;

/** CPFs válidos encontrados no texto (só dígitos). */
export function findCpfs(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || '').matchAll(CPF_CANDIDATE_RE)) {
    const digits = m[1].replace(/\D/g, '');
    if (validateCpf(digits)) out.push(digits);
  }
  return out;
}

/** Troca CPF válido por "[CPF final 12]" (telefones e outros números ficam como estão). */
export function maskCpfInText(text: string): string {
  return String(text || '').replace(CPF_CANDIDATE_RE, (all, cpf: string) => {
    const digits = cpf.replace(/\D/g, '');
    return validateCpf(digits) ? `[CPF final ${digits.slice(-2)}]` : all;
  });
}

export { WhatsAppError };

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function requireProvider(p: WhatsAppProvider | null): WhatsAppProvider {
  if (!p) throw new WhatsAppError(503, 'A conexão não oficial (QR Code) está desligada (WHATSAPP_EVOLUTION_ENABLED) ou sem servidor (EVOLUTION_API_URL e EVOLUTION_API_KEY). Use o WhatsApp oficial da Meta.');
  return p;
}

function providerFail(err: any): never {
  if (err instanceof ProviderError) throw new WhatsAppError(err.status === 504 ? 504 : 502, err.message);
  throw err;
}

function checkId(id: string, what = 'Número') {
  if (!UUID_RE.test(String(id))) throw new WhatsAppError(404, `${what} não encontrado.`);
}

export function webhookUrl(baseUrl: string, numberId: string, secret: string) {
  return `${baseUrl.replace(/\/+$/, '')}/api/whatsapp/webhook/${numberId}/${secret}`;
}

async function loadNumber(pool: Pool, id: string) {
  checkId(id);
  const r = await pool.query('SELECT * FROM whatsapp_numbers WHERE id = $1 AND is_deleted = FALSE', [id]);
  if (!r.rows.length) throw new WhatsAppError(404, 'Número não encontrado.');
  return r.rows[0];
}

function publicNumber(n: any) {
  return {
    id: n.id,
    label: n.label,
    brand_id: n.brand_id,
    brand_name: n.brand_name ?? null,
    phone: n.phone,
    profile_name: n.profile_name,
    status: n.status,
    status_reason: n.status_reason,
    bot_enabled: n.bot_enabled,
    connected_at: n.connected_at,
    created_at: n.created_at,
    conversations: n.conversations !== undefined ? Number(n.conversations) : undefined,
    needs_human: n.needs_human !== undefined ? Number(n.needs_human) : undefined,
    // NORQVA-0079: motor do número e dados do número oficial
    provider: n.provider || 'EVOLUTION',
    cloud_account_id: n.cloud_account_id ?? null,
    cloud_environment: n.cloud_environment ?? null,
    phone_number_id: n.phone_number_id ?? null,
    display_phone_number: n.display_phone_number ?? null,
    quality_rating: n.quality_rating ?? null,
    messaging_limit: n.messaging_limit ?? null
  };
}

export async function listNumbers(pool: Pool) {
  const r = await pool.query(
    `SELECT n.*, b.name AS brand_name, a.environment AS cloud_environment,
            (SELECT COUNT(*) FROM whatsapp_conversations c WHERE c.number_id = n.id) AS conversations,
            (SELECT COUNT(*) FROM whatsapp_conversations c WHERE c.number_id = n.id AND c.needs_human = TRUE) AS needs_human
     FROM whatsapp_numbers n
     LEFT JOIN brands b ON b.id = n.brand_id
     LEFT JOIN whatsapp_cloud_accounts a ON a.id = n.cloud_account_id
     WHERE n.is_deleted = FALSE
     ORDER BY n.created_at ASC`
  );
  return { numbers: r.rows.map(publicNumber), max: MAX_WHATSAPP_NUMBERS };
}

async function checkBrand(pool: Pool, brandId: any): Promise<string | null> {
  if (brandId === undefined || brandId === null || brandId === '') return null;
  if (!UUID_RE.test(String(brandId))) throw new WhatsAppError(400, 'Marca inválida.');
  const r = await pool.query('SELECT id FROM brands WHERE id = $1', [brandId]);
  if (!r.rows.length) throw new WhatsAppError(400, 'Marca não encontrada.');
  return String(brandId);
}

function cleanLabel(label: any): string {
  const l = String(label ?? '').trim();
  if (!l) throw new WhatsAppError(400, 'Dê um nome ao número (ex.: "Trattoria 1").');
  if (l.length > 80) throw new WhatsAppError(400, 'Nome muito longo (até 80 letras).');
  return l;
}

export async function createNumber(pool: Pool, body: any, userId: string | null) {
  const label = cleanLabel(body?.label);
  const brandId = await checkBrand(pool, body?.brand_id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // trava simples para dois cadastros ao mesmo tempo não passarem do limite
    await client.query('LOCK TABLE whatsapp_numbers IN SHARE ROW EXCLUSIVE MODE');
    const c = await client.query('SELECT COUNT(*)::int AS n FROM whatsapp_numbers WHERE is_deleted = FALSE');
    if (c.rows[0].n >= MAX_WHATSAPP_NUMBERS) {
      throw new WhatsAppError(409, `Limite de ${MAX_WHATSAPP_NUMBERS} números atingido. Exclua um número antes de cadastrar outro.`);
    }
    const instance = `nq-${crypto.randomBytes(6).toString('hex')}`;
    const r = await client.query(
      `INSERT INTO whatsapp_numbers (label, brand_id, instance_name, webhook_secret_hash, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [label, brandId, instance, sha256(crypto.randomBytes(32).toString('hex')), userId]
    );
    await writeAuditLog(client, userId, 'WHATSAPP_NUMBER_CREATED', `Número de WhatsApp "${label}" cadastrado (atendente desligado).`, null, r.rows[0].id, false, true);
    await client.query('COMMIT');
    return publicNumber(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** NORQVA-0079: cadastro de número oficial (Cloud API), a partir de uma conta Meta conferida. */
export async function createOfficialNumber(pool: Pool, body: any, userId: string | null) {
  return publicNumber(await createCloudNumber(pool, body, userId));
}

export async function updateNumber(pool: Pool, id: string, body: any, userId: string | null) {
  const n = await loadNumber(pool, id);
  const label = body?.label !== undefined ? cleanLabel(body.label) : n.label;
  const brandId = body?.brand_id !== undefined ? await checkBrand(pool, body.brand_id) : n.brand_id;
  // NORQVA-0079: número oficial pertence à marca da conta Meta dele (isolamento por operação)
  if (n.provider === 'META_CLOUD' && (brandId || null) !== (n.brand_id || null)) {
    throw new WhatsAppError(409, 'A marca do número oficial é a da conta Meta. Para outra marca, use a conta Meta dela.');
  }
  let bot = n.bot_enabled;
  if (body?.bot_enabled !== undefined) {
    if (typeof body.bot_enabled !== 'boolean') throw new WhatsAppError(400, 'bot_enabled deve ser verdadeiro ou falso.');
    bot = body.bot_enabled;
  }
  const r = await pool.query(
    `UPDATE whatsapp_numbers SET label = $1, brand_id = $2, bot_enabled = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
    [label, brandId, bot, id]
  );
  if (bot !== n.bot_enabled) {
    await writeAuditLog(pool, userId, bot ? 'WHATSAPP_BOT_ENABLED' : 'WHATSAPP_BOT_PAUSED', `Atendente automático ${bot ? 'ligado' : 'pausado'} no número "${label}".`, String(n.bot_enabled), String(bot));
  }
  return publicNumber(r.rows[0]);
}

/** Gera um segredo novo para o endereço do webhook e devolve a URL (o segredo antigo deixa de valer). */
async function rotateWebhook(pool: Pool, id: string, baseUrl: string) {
  const secret = crypto.randomBytes(24).toString('hex');
  await pool.query('UPDATE whatsapp_numbers SET webhook_secret_hash = $1, updated_at = NOW() WHERE id = $2', [sha256(secret), id]);
  return webhookUrl(baseUrl, id, secret);
}

async function applyInfo(pool: Pool, id: string, info: { state: string; phone: string | null; profileName: string | null }) {
  if (info.state === 'open') {
    await pool.query(
      `UPDATE whatsapp_numbers SET status = 'CONNECTED', status_reason = NULL, phone = COALESCE($1, phone), profile_name = COALESCE($2, profile_name),
              connected_at = COALESCE(connected_at, NOW()), last_qr_base64 = NULL, updated_at = NOW()
       WHERE id = $3`,
      [info.phone, info.profileName, id]
    );
  } else if (info.state === 'connecting') {
    await pool.query(`UPDATE whatsapp_numbers SET status = 'CONNECTING', updated_at = NOW() WHERE id = $1 AND status <> 'BANNED'`, [id]);
  } else if (info.state === 'close') {
    await pool.query(`UPDATE whatsapp_numbers SET status = 'DISCONNECTED', updated_at = NOW() WHERE id = $1 AND status NOT IN ('BANNED', 'NEW')`, [id]);
  }
}

/** NORQVA-0079: número oficial não usa QR Code; "conectar" = conferir o número na Meta. */
async function checkCloud(pool: Pool, n: any, userId: string | null) {
  await checkCloudNumber(pool, n);
  const fresh = await loadNumber(pool, n.id);
  await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_NUMBER_CHECKED', `Número oficial "${n.label}" conferido na Meta: ${fresh.status}${fresh.status_reason ? ` (${fresh.status_reason})` : ''}.`);
  return { number: publicNumber(fresh), qr_base64: null };
}

export async function connectNumber(pool: Pool, provider: WhatsAppProvider | null, id: string, baseUrl: string, userId: string | null) {
  const n = await loadNumber(pool, id);
  if (n.provider === 'META_CLOUD') return checkCloud(pool, n, userId);
  const p = requireProvider(provider);
  const url = await rotateWebhook(pool, id, baseUrl);
  // se o servidor do WhatsApp falhar, volta o segredo antigo (o servidor continua usando o endereço antigo)
  const restoreSecret = () => pool.query('UPDATE whatsapp_numbers SET webhook_secret_hash = $1 WHERE id = $2', [n.webhook_secret_hash, id]).catch(() => {});
  let qr: { base64: string | null; state: string };
  try {
    let exists = true;
    try {
      await p.info(n.instance_name);
    } catch (err: any) {
      if (err instanceof ProviderError && err.status === 404) exists = false;
      else throw err;
    }
    if (!exists) {
      try {
        qr = await p.createInstance(n.instance_name, url);
      } catch (e: any) {
        // 404 ao criar = o endereço não é o servidor do WhatsApp (não é "número inexistente")
        if (e instanceof ProviderError && e.status === 404) {
          throw new ProviderError('O endereço configurado não é o servidor do WhatsApp (erro 404). Clique em "Testar servidor" para ver o que corrigir.', 502);
        }
        throw e;
      }
    } else {
      await p.setWebhook(n.instance_name, url);
      qr = await p.connect(n.instance_name);
    }
  } catch (err) {
    await restoreSecret();
    providerFail(err);
  }
  if (qr.state === 'open') {
    const info = await p.info(n.instance_name).catch(() => ({ state: 'open', phone: null, profileName: null }));
    await applyInfo(pool, id, { ...info, state: 'open' });
  } else {
    await pool.query(
      `UPDATE whatsapp_numbers SET status = 'CONNECTING', status_reason = NULL, last_qr_base64 = COALESCE($1, last_qr_base64), last_qr_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [qr.base64, id]
    );
  }
  await writeAuditLog(pool, userId, 'WHATSAPP_CONNECT_STARTED', `Conexão do número "${n.label}" iniciada (QR Code).`, null, id);
  const fresh = await loadNumber(pool, id);
  return { number: publicNumber(fresh), qr_base64: qr.state === 'open' ? null : qr.base64 };
}

export async function refreshNumber(pool: Pool, provider: WhatsAppProvider | null, id: string) {
  const n = await loadNumber(pool, id);
  if (n.provider === 'META_CLOUD') return { number: publicNumber(n), qr_base64: null };
  const p = requireProvider(provider);
  try {
    const info = await p.info(n.instance_name);
    await applyInfo(pool, id, info);
  } catch (err: any) {
    if (!(err instanceof ProviderError && err.status === 404)) providerFail(err);
    // instância ainda não existe no servidor: continua NEW
  }
  const fresh = await loadNumber(pool, id);
  return {
    number: publicNumber(fresh),
    qr_base64: fresh.status === 'CONNECTING' ? fresh.last_qr_base64 : null
  };
}

/** Trocar número: desconecta o aparelho atual e mostra QR Code novo. Marca, condições e conversas continuam. */
export async function swapNumber(pool: Pool, provider: WhatsAppProvider | null, id: string, baseUrl: string, userId: string | null) {
  const n = await loadNumber(pool, id);
  if (n.provider === 'META_CLOUD') {
    throw new WhatsAppError(409, 'Número oficial não é trocado: cadastre o número novo na conta Meta e exclua este (D-0079).');
  }
  const p = requireProvider(provider);
  try {
    await p.logout(n.instance_name);
  } catch (err) {
    providerFail(err);
  }
  await pool.query(
    `UPDATE whatsapp_numbers SET phone = NULL, profile_name = NULL, connected_at = NULL, status = 'DISCONNECTED', status_reason = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await writeAuditLog(pool, userId, 'WHATSAPP_NUMBER_SWAPPED', `Troca de número em "${n.label}" (antes: ${n.phone || 'sem número'}).`, n.phone || null, null);
  return connectNumber(pool, provider, id, baseUrl, userId);
}

export async function deleteNumber(pool: Pool, provider: WhatsAppProvider | null, id: string, userId: string | null) {
  const n = await loadNumber(pool, id);
  // número oficial: nada a desconectar no servidor (a Meta continua com o número, o NORQVA só deixa de usá-lo)
  if (provider && n.provider !== 'META_CLOUD') {
    try {
      await provider.logout(n.instance_name);
      await provider.deleteInstance(n.instance_name);
    } catch (err) {
      providerFail(err);
    }
  }
  await pool.query(
    `UPDATE whatsapp_numbers SET is_deleted = TRUE, bot_enabled = FALSE, status = 'DISCONNECTED', last_qr_base64 = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  await writeAuditLog(pool, userId, 'WHATSAPP_NUMBER_DELETED', `Número de WhatsApp "${n.label}" (${n.phone || 'sem número'}) excluído. As conversas ficam guardadas até completar ${MESSAGE_RETENTION_DAYS} dias.`, n.id, null);
  return { ok: true };
}

// ---------- Webhook (mensagens e estado vindos do servidor do WhatsApp) ----------

function extractText(message: any): { body: string; kind: string } | null {
  if (!message || typeof message !== 'object') return null;
  if (message.protocolMessage || message.reactionMessage || message.senderKeyDistributionMessage && Object.keys(message).length === 1) return null;
  if (typeof message.conversation === 'string') return { body: message.conversation, kind: 'TEXT' };
  if (message.extendedTextMessage?.text) return { body: String(message.extendedTextMessage.text), kind: 'TEXT' };
  if (message.imageMessage) return { body: message.imageMessage.caption ? String(message.imageMessage.caption) : '[imagem]', kind: 'IMAGE' };
  if (message.videoMessage) return { body: message.videoMessage.caption ? String(message.videoMessage.caption) : '[vídeo]', kind: 'VIDEO' };
  if (message.audioMessage) return { body: '[áudio]', kind: 'AUDIO' };
  if (message.documentMessage) return { body: `[arquivo] ${message.documentMessage.fileName || ''}`.trim(), kind: 'DOCUMENT' };
  if (message.stickerMessage) return { body: '[figurinha]', kind: 'STICKER' };
  if (message.locationMessage) return { body: '[localização]', kind: 'OTHER' };
  if (message.contactMessage) return { body: '[contato]', kind: 'OTHER' };
  if (message.buttonsResponseMessage?.selectedDisplayText) return { body: String(message.buttonsResponseMessage.selectedDisplayText), kind: 'TEXT' };
  if (message.listResponseMessage?.title) return { body: String(message.listResponseMessage.title), kind: 'TEXT' };
  return { body: '[mensagem não suportada]', kind: 'OTHER' };
}

function isPrivateChat(jid: string) {
  return /@s\.whatsapp\.net$/.test(jid) || /@lid$/.test(jid);
}

export interface InboundMessage {
  conversationId: string;
  messageId: string;
  body: string;
  kind: string;
  /** NORQVA-0125: pediu para parar depois da mensagem de recuperação (o atendente só confirma, com texto fixo) */
  optOut?: boolean;
}

export async function handleWebhook(pool: Pool, numberId: string, secret: string, payload: any): Promise<{ inbound: InboundMessage[]; numberId: string | null }> {
  if (!UUID_RE.test(String(numberId)) || !secret) throw new WhatsAppError(404, 'not found');
  const r = await pool.query('SELECT * FROM whatsapp_numbers WHERE id = $1 AND is_deleted = FALSE', [numberId]);
  const n = r.rows[0];
  if (!n) throw new WhatsAppError(404, 'not found');
  const a = Buffer.from(sha256(String(secret)));
  const b = Buffer.from(String(n.webhook_secret_hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new WhatsAppError(404, 'not found');

  const event = String(payload?.event || '').toLowerCase().replace(/_/g, '.');
  const data = payload?.data;

  if (event === 'qrcode.updated') {
    const qr = data?.qrcode?.base64 || data?.base64 || null;
    if (qr) {
      await pool.query(
        `UPDATE whatsapp_numbers SET last_qr_base64 = $1, last_qr_at = NOW(), status = CASE WHEN status = 'CONNECTED' THEN status ELSE 'CONNECTING' END, updated_at = NOW() WHERE id = $2`,
        [String(qr).replace(/^data:image\/[a-z]+;base64,/i, ''), n.id]
      );
    }
    return { inbound: [], numberId: n.id };
  }

  if (event === 'connection.update') {
    const state = String(data?.state || '').toLowerCase();
    if (state === 'open') {
      const phone = phoneFromJid(data?.wuid || data?.ownerJid || null);
      await pool.query(
        `UPDATE whatsapp_numbers SET status = 'CONNECTED', status_reason = NULL, phone = COALESCE($1, phone), profile_name = COALESCE($2, profile_name),
                connected_at = NOW(), last_qr_base64 = NULL, updated_at = NOW() WHERE id = $3`,
        [phone, data?.profileName || null, n.id]
      );
      await writeAuditLog(pool, null, 'WHATSAPP_CONNECTED', `Número "${n.label}" conectado${phone ? ` (${phone})` : ''}.`, null, phone);
    } else if (state === 'close') {
      const reason = Number(data?.statusReason);
      const banned = reason === 403 || reason === 402;
      const text = banned ? 'O WhatsApp bloqueou este número.' : reason === 401 ? 'Desconectado pelo celular.' : 'Conexão caiu.';
      await pool.query(
        `UPDATE whatsapp_numbers SET status = $1, status_reason = $2, updated_at = NOW() WHERE id = $3`,
        [banned ? 'BANNED' : 'DISCONNECTED', text, n.id]
      );
      if (banned || n.status === 'CONNECTED') {
        await writeAuditLog(pool, null, banned ? 'WHATSAPP_BANNED' : 'WHATSAPP_DISCONNECTED', `Número "${n.label}" (${n.phone || 'sem número'}): ${text}`, n.status, banned ? 'BANNED' : 'DISCONNECTED');
      }
    } else if (state === 'connecting') {
      await pool.query(`UPDATE whatsapp_numbers SET status = 'CONNECTING', updated_at = NOW() WHERE id = $1 AND status NOT IN ('CONNECTED', 'BANNED')`, [n.id]);
    }
    return { inbound: [], numberId: n.id };
  }

  if (event !== 'messages.upsert') return { inbound: [], numberId: n.id };

  const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : data ? [data] : [];
  const normalized: NormalizedInbound[] = [];
  for (const m of items.slice(0, 50)) {
    const jid = String(m?.key?.remoteJid || '');
    if (!jid || !isPrivateChat(jid)) continue;
    const content = extractText(m?.message);
    if (!content) continue;
    const fromMe = m?.key?.fromMe === true;
    const ts = Number(m?.messageTimestamp);
    normalized.push({
      jid,
      fromMe,
      providerId: m?.key?.id ? String(m.key.id).slice(0, 120) : null,
      phone: phoneFromJid(jid) || phoneFromJid(m?.key?.remoteJidAlt || m?.key?.senderPn || null),
      name: !fromMe && m?.pushName ? String(m.pushName).slice(0, 120) : null,
      body: content.body,
      kind: content.kind,
      at: Number.isFinite(ts) && ts > 1e9 ? new Date(ts * 1000) : new Date(),
      adReferral: fromMe ? null : adReferralFromEvolution(m)
    });
  }
  return { inbound: await ingestInbound(pool, n.id, normalized), numberId: n.id };
}

/** Mensagem recebida já no formato interno (o mesmo para os dois motores). */
export interface NormalizedInbound {
  jid: string;
  fromMe: boolean;
  providerId: string | null;
  phone: string | null;
  name: string | null;
  body: string;
  kind: string;
  at: Date;
  /** NORQVA-0123: anúncio clique-para-WhatsApp de onde a mensagem veio (se veio de um) */
  adReferral?: AdReferral | null;
}

/**
 * NORQVA-0079: gravação das mensagens recebidas, comum à Evolution e à Cloud API oficial.
 * Extraída de handleWebhook sem mudar o comportamento: CPF mascarado, repetidas descartadas,
 * código de origem, "parar" respeitado. Devolve só as novas, para o atendente responder.
 */
export async function ingestInbound(pool: Pool, numberId: string, items: NormalizedInbound[]): Promise<InboundMessage[]> {
  const inbound: InboundMessage[] = [];
  for (const m of items.slice(0, 50)) {
    const { jid, fromMe, providerId, phone, name, at } = m;
    const content = { body: m.body, kind: m.kind };
    const body = content.body.slice(0, 4000);
    // CPF nunca fica guardado em texto aberto (regra de segurança): no banco vai mascarado
    const stored = maskCpfInText(body);
    const preview = stored.slice(0, 160);
    const n = { id: numberId };

    const conv = await pool.query(
      `INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_phone, contact_name, last_message_at, last_message_preview, unread_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (number_id, contact_jid) DO UPDATE SET
         contact_phone = COALESCE(EXCLUDED.contact_phone, whatsapp_conversations.contact_phone),
         contact_name = COALESCE(EXCLUDED.contact_name, whatsapp_conversations.contact_name),
         last_message_at = GREATEST(COALESCE(whatsapp_conversations.last_message_at, EXCLUDED.last_message_at), EXCLUDED.last_message_at),
         last_message_preview = EXCLUDED.last_message_preview,
         unread_count = whatsapp_conversations.unread_count + EXCLUDED.unread_count,
         updated_at = NOW()
       RETURNING id, mode`,
      [n.id, jid, phone, name, at, preview, fromMe ? 0 : 1]
    );
    const convId = conv.rows[0].id;
    const ins = await pool.query(
      `INSERT INTO whatsapp_messages (conversation_id, direction, author, body, kind, provider_message_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [convId, fromMe ? 'OUT' : 'IN', fromMe ? 'PHONE' : 'CUSTOMER', stored, content.kind, providerId, at]
    );
    if (!ins.rows.length) {
      // mensagem repetida pelo servidor: não conta como nova
      if (!fromMe) await pool.query('UPDATE whatsapp_conversations SET unread_count = GREATEST(unread_count - 1, 0) WHERE id = $1', [convId]);
      continue;
    }
    if (fromMe) continue;
    // NORQVA-0054: código de origem da página (campanha/anúncio/clique) liga a conversa à origem
    const textRef = await linkRefFromText(pool, convId, n.id, body).catch(err => { console.warn('[WhatsApp] código de origem:', err?.message || err); return null; });
    // NORQVA-0123: sem código da página, a origem é o anúncio clique-para-WhatsApp (se a mensagem veio de um)
    if (!textRef && m.adReferral) {
      await linkAdReferral(pool, convId, n.id, m.adReferral).catch(err => console.warn('[WhatsApp] origem do anúncio:', err?.message || err));
    }
    // NORQVA-0125: resposta de quem recebeu a mensagem de recuperação (procurada pelo telefone normalizado, então
    // vale também se a pessoa responder de um jid sem o 9 ou @lid). A conversa herda a origem da recuperação.
    const rec = phone || jid ? await recoveryForReply(pool, convId, phone, jid).catch(() => null) : null;
    if (rec) await carryRecoveryRef(pool, convId, rec).catch(err => console.warn('[WhatsApp] origem da recuperação:', err?.message || err));
    // "parar" de sempre (sem mudança para as outras conversas). Depois da recuperação também valem "sair", "pare",
    // "stop" escritos de qualquer jeito e, só na primeira resposta (antes de o atendente falar), "não quero" e parecidos.
    const plainOptOut = OPT_OUT_RE.test(body);
    const recoveryOptOut = !plainOptOut && !!rec && (
      isExplicitStop(body) || (isRecoveryRefusal(body) && (await isFirstReplyToRecovery(pool, convId, rec.sent_at).catch(() => false)))
    );
    if (plainOptOut || recoveryOptOut) {
      await pool.query(`UPDATE whatsapp_conversations SET mode = 'OPTED_OUT', needs_human = FALSE, updated_at = NOW() WHERE id = $1`, [convId]);
      // quem pediu para parar fica fora da recuperação para sempre
      await recordRecoveryOptOut(pool, convId, phone, jid, rec?.email_key || null).catch(err => console.warn('[WhatsApp] registro do SAIR:', err?.message || err));
      // quem recebeu a recuperação ganha uma resposta curta do atendente (uma vez)
      if (rec) inbound.push({ conversationId: convId, messageId: ins.rows[0].id, body, kind: content.kind, optOut: true });
      continue;
    }
    if (conv.rows[0].mode === 'OPTED_OUT') {
      // pediu para parar e voltou a escrever: uma pessoa decide como seguir
      await pool.query(`UPDATE whatsapp_conversations SET mode = 'HUMAN', needs_human = TRUE, updated_at = NOW() WHERE id = $1`, [convId]);
      continue;
    }
    inbound.push({ conversationId: convId, messageId: ins.rows[0].id, body, kind: content.kind });
  }
  return inbound;
}

// ---------- Conversas ----------

export async function listConversations(pool: Pool, q: { number_id?: any; filter?: any; search?: any }) {
  const where: string[] = ['n.is_deleted = FALSE'];
  const params: any[] = [];
  if (q.number_id) {
    checkId(String(q.number_id));
    params.push(String(q.number_id));
    where.push(`c.number_id = $${params.length}`);
  }
  const f = String(q.filter || 'ALL').toUpperCase();
  if (f === 'NEEDS_HUMAN') where.push('c.needs_human = TRUE');
  else if (f === 'HUMAN') where.push(`c.mode = 'HUMAN'`);
  else if (f === 'UNREAD') where.push('c.unread_count > 0');
  else if (f === 'OPTED_OUT') where.push(`c.mode = 'OPTED_OUT'`);
  const s = String(q.search || '').trim();
  if (s) {
    params.push(`%${s.replace(/[%_\\]/g, m => `\\${m}`)}%`);
    where.push(`(c.contact_name ILIKE $${params.length} OR c.contact_phone ILIKE $${params.length})`);
  }
  const r = await pool.query(
    `SELECT c.id, c.number_id, n.label AS number_label, n.phone AS number_phone, b.name AS brand_name,
            c.contact_phone, c.contact_name, c.mode, c.needs_human, c.unread_count, c.last_message_at, c.last_message_preview
     FROM whatsapp_conversations c
     JOIN whatsapp_numbers n ON n.id = c.number_id
     LEFT JOIN brands b ON b.id = n.brand_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.needs_human DESC, c.last_message_at DESC NULLS LAST
     LIMIT 200`,
    params
  );
  return { conversations: r.rows };
}

async function loadConversation(pool: Pool, id: string) {
  checkId(id, 'Conversa');
  const r = await pool.query(
    `SELECT c.*, n.instance_name, n.status AS number_status, n.label AS number_label, n.is_deleted AS number_deleted,
            n.provider AS number_provider, n.cloud_account_id, n.phone_number_id
     FROM whatsapp_conversations c JOIN whatsapp_numbers n ON n.id = c.number_id WHERE c.id = $1`,
    [id]
  );
  if (!r.rows.length || r.rows[0].number_deleted) throw new WhatsAppError(404, 'Conversa não encontrada.');
  return r.rows[0];
}

export async function getConversationMessages(pool: Pool, id: string) {
  const c = await loadConversation(pool, id);
  const r = await pool.query(
    `SELECT id, direction, author, body, kind, send_status, delivery_status, error_code, created_at FROM (
       SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 300
     ) m ORDER BY created_at ASC`,
    [id]
  );
  await pool.query('UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = $1', [id]);
  return {
    conversation: {
      id: c.id,
      number_id: c.number_id,
      number_label: c.number_label,
      number_status: c.number_status,
      number_provider: c.number_provider || 'EVOLUTION',
      // NORQVA-0079: com a janela de 24h fechada, número oficial só responde com template
      window_open: c.number_provider === 'META_CLOUD' ? await isServiceWindowOpen(pool, c.id) : null,
      contact_phone: c.contact_phone,
      contact_name: c.contact_name,
      mode: c.mode,
      needs_human: c.needs_human
    },
    messages: r.rows
  };
}

/** Grava uma mensagem enviada por nós (atendente, operador ou sistema). Se o eco do servidor chegou antes, fica a nossa autoria. */
export async function recordOutgoing(
  pool: Pool,
  convId: string,
  author: 'BOT' | 'OPERATOR' | 'SYSTEM',
  body: string,
  providerId: string | null,
  opts: { kind?: string; failed?: boolean; userId?: string | null; deliveryStatus?: string | null; errorCode?: string | null } = {}
) {
  await pool.query(
    `INSERT INTO whatsapp_messages (conversation_id, direction, author, body, kind, provider_message_id, send_status, sent_by, delivery_status, error_code)
     VALUES ($1, 'OUT', $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (conversation_id, provider_message_id) WHERE provider_message_id IS NOT NULL
     DO UPDATE SET author = EXCLUDED.author, body = EXCLUDED.body, kind = EXCLUDED.kind, sent_by = EXCLUDED.sent_by`,
    [
      convId, author, maskCpfInText(body).slice(0, 4000), opts.kind || 'TEXT', providerId, opts.failed ? 'FAILED' : 'OK', opts.userId || null,
      opts.deliveryStatus || null, opts.errorCode ? String(opts.errorCode).slice(0, 40) : null
    ]
  );
  await pool.query(
    `UPDATE whatsapp_conversations SET last_message_at = NOW(), last_message_preview = $1, updated_at = NOW() WHERE id = $2`,
    [maskCpfInText(body).slice(0, 160), convId]
  );
}

export async function sendOperatorMessage(pool: Pool, provider: WhatsAppProvider | null, convId: string, text: any, userId: string | null) {
  const body = String(text ?? '').trim();
  if (!body) throw new WhatsAppError(400, 'Escreva a mensagem.');
  if (body.length > 4000) throw new WhatsAppError(400, 'Mensagem muito longa (até 4.000 letras).');
  const c = await loadConversation(pool, convId);
  const official = c.number_provider === 'META_CLOUD';
  const p = official ? null : requireProvider(provider);
  if (c.mode === 'OPTED_OUT') throw new WhatsAppError(409, 'O cliente pediu para não receber mais mensagens. Só responda se ele voltar a escrever.');
  if (c.number_status !== 'CONNECTED') throw new WhatsAppError(409, 'Este número não está conectado. Conecte o número antes de responder.');
  let sender: WhatsAppProvider;
  if (official) {
    // NORQVA-0079: número oficial — motor da conta dele e janela de 24h da Meta
    const cp = await providerForNumber(pool, { id: c.number_id, provider: 'META_CLOUD', cloud_account_id: c.cloud_account_id, phone_number_id: c.phone_number_id });
    if (!cp) throw new WhatsAppError(503, 'A conta Meta deste número está desativada ou o token não pôde ser lido. Confira a conta Meta.');
    if (!(await isServiceWindowOpen(pool, convId))) {
      throw new WhatsAppError(409, 'Passaram mais de 24 horas desde a última mensagem do cliente. A Meta só permite responder com um modelo aprovado (template), que chega na próxima etapa.');
    }
    sender = cp;
  } else {
    sender = p!;
  }
  let id: string | null = null;
  try {
    id = (await sender.sendText(c.instance_name, c.contact_jid, body)).id;
  } catch (err) {
    if (err instanceof SendBlockedError) {
      // trava do NORQVA: a mensagem fica registrada como bloqueada, nada saiu
      await recordOutgoing(pool, convId, 'OPERATOR', body, null, { userId, failed: true, deliveryStatus: 'BLOCKED', errorCode: err.code });
      throw new WhatsAppError(409, err.message);
    }
    const w = cloudErrorToWhatsApp(err);
    if (w) {
      const metaCode = err instanceof CloudApiError ? err.metaCode : null;
      await recordOutgoing(pool, convId, 'OPERATOR', body, null, {
        userId, failed: true, deliveryStatus: metaCode === 131047 ? 'OUTSIDE_WINDOW' : 'FAILED', errorCode: metaCode !== null ? String(metaCode) : null
      });
      throw w;
    }
    providerFail(err);
  }
  await recordOutgoing(pool, convId, 'OPERATOR', body, id, { userId, deliveryStatus: isCloudProvider(sender) ? 'SENT' : null });
  // quem respondeu à mão assume a conversa (o atendente automático para nela)
  await pool.query(`UPDATE whatsapp_conversations SET mode = 'HUMAN', needs_human = FALSE, updated_at = NOW() WHERE id = $1`, [convId]);
  return { ok: true };
}

export async function setConversationMode(pool: Pool, convId: string, mode: any, userId: string | null) {
  const m = String(mode || '').toUpperCase();
  if (m !== 'BOT' && m !== 'HUMAN') throw new WhatsAppError(400, 'Modo inválido.');
  const c = await loadConversation(pool, convId);
  if (c.mode === 'OPTED_OUT' && m === 'BOT') throw new WhatsAppError(409, 'O cliente pediu para parar. O atendente automático não volta nesta conversa.');
  await pool.query(`UPDATE whatsapp_conversations SET mode = $1, needs_human = FALSE, updated_at = NOW() WHERE id = $2`, [m, convId]);
  await writeAuditLog(pool, userId, 'WHATSAPP_CONVERSATION_MODE', `Conversa ${convId}: ${m === 'BOT' ? 'devolvida ao atendente automático' : 'assumida por uma pessoa'}.`, c.mode, m);
  return { ok: true, mode: m };
}

/** Retenção (contrato NORQVA-0046): mensagens com mais de 180 dias são apagadas; conversa vazia e antiga também. */
export async function purgeOldWhatsAppMessages(pool: Pool, days = MESSAGE_RETENTION_DAYS): Promise<number> {
  const d = Math.min(Math.max(Math.floor(days) || MESSAGE_RETENTION_DAYS, 1), 3650);
  const r = await pool.query(`DELETE FROM whatsapp_messages WHERE created_at < NOW() - make_interval(days => $1)`, [d]);
  // NORQVA-0054: códigos de origem só servem por 28 dias; apaga depois de 30 (IP e navegador junto)
  await pool.query(`DELETE FROM whatsapp_refs WHERE created_at < NOW() - INTERVAL '30 days'`).catch(() => {});
  await pool.query(
    `DELETE FROM whatsapp_conversations c
     WHERE (c.last_message_at IS NULL OR c.last_message_at < NOW() - make_interval(days => $1))
       AND NOT EXISTS (SELECT 1 FROM whatsapp_messages m WHERE m.conversation_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.whatsapp_conversation_id = c.id)`,
    [d]
  );
  return r.rowCount || 0;
}

// ---------- Condições de atendimento (memória do atendente) ----------

export const MAX_CONDITIONS_LENGTH = 8000;

export async function getConditions(pool: Pool) {
  const s = await pool.query('SELECT global_conditions, updated_at FROM whatsapp_settings WHERE id = 1');
  const n = await pool.query(`SELECT id, label, conditions FROM whatsapp_numbers WHERE is_deleted = FALSE ORDER BY created_at ASC`);
  return { global: s.rows[0]?.global_conditions || '', global_updated_at: s.rows[0]?.updated_at || null, numbers: n.rows };
}

export async function saveConditions(pool: Pool, body: any, userId: string | null) {
  const text = String(body?.conditions ?? '');
  if (text.length > MAX_CONDITIONS_LENGTH) throw new WhatsAppError(400, `Texto muito longo (até ${MAX_CONDITIONS_LENGTH} letras).`);
  const numberId = body?.number_id ? String(body.number_id) : null;
  if (numberId) {
    const n = await loadNumber(pool, numberId);
    await pool.query('UPDATE whatsapp_numbers SET conditions = $1, updated_at = NOW() WHERE id = $2', [text, numberId]);
    await pool.query('INSERT INTO whatsapp_condition_versions (number_id, conditions, changed_by) VALUES ($1, $2, $3)', [numberId, text, userId]);
    await writeAuditLog(pool, userId, 'WHATSAPP_CONDITIONS_SAVED', `Condições de atendimento do número "${n.label}" alteradas.`);
  } else {
    await pool.query('UPDATE whatsapp_settings SET global_conditions = $1, updated_at = NOW() WHERE id = 1', [text]);
    await pool.query('INSERT INTO whatsapp_condition_versions (number_id, conditions, changed_by) VALUES (NULL, $1, $2)', [text, userId]);
    await writeAuditLog(pool, userId, 'WHATSAPP_CONDITIONS_SAVED', 'Condições gerais de atendimento do WhatsApp alteradas.');
  }
  return { ok: true };
}

export async function conditionHistory(pool: Pool, numberId: any) {
  const id = numberId ? String(numberId) : null;
  if (id) checkId(id);
  const r = await pool.query(
    `SELECT v.id, v.conditions, v.created_at, u.name AS changed_by_name
     FROM whatsapp_condition_versions v LEFT JOIN users u ON u.id = v.changed_by
     WHERE ($1::uuid IS NULL AND v.number_id IS NULL) OR v.number_id = $1::uuid
     ORDER BY v.created_at DESC LIMIT 20`,
    [id]
  );
  return { versions: r.rows };
}

// ---------- Resultados por número ----------

export async function numberResults(pool: Pool, daysArg: any) {
  const days = Math.min(Math.max(Math.floor(Number(daysArg)) || 30, 1), 365);
  const r = await pool.query(
    `SELECT n.id, n.label, n.phone, n.status, n.bot_enabled, b.name AS brand_name,
       (SELECT COUNT(*)::int FROM whatsapp_conversations c
          WHERE c.number_id = n.id AND c.created_at > NOW() - make_interval(days => $1)) AS new_conversations,
       (SELECT COUNT(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id = m.conversation_id
          WHERE c.number_id = n.id AND m.direction = 'IN' AND m.created_at > NOW() - make_interval(days => $1)) AS messages_in,
       (SELECT COUNT(*)::int FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id = m.conversation_id
          WHERE c.number_id = n.id AND m.author = 'BOT' AND m.created_at > NOW() - make_interval(days => $1)) AS bot_messages,
       (SELECT COUNT(*)::int FROM whatsapp_conversations c WHERE c.number_id = n.id AND c.needs_human = TRUE) AS needs_human_now,
       (SELECT COUNT(*)::int FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id
          WHERE c.number_id = n.id AND o.created_at > NOW() - make_interval(days => $1)) AS orders_created,
       (SELECT COUNT(*)::int FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id
          WHERE c.number_id = n.id AND o.status = 'PAID' AND o.is_demo = FALSE AND o.data_provenance = 'COMMERCIAL_PRODUCTION' AND o.created_at > NOW() - make_interval(days => $1)) AS orders_paid,
       (SELECT COALESCE(SUM(o.total_amount), 0)::numeric FROM orders o JOIN whatsapp_conversations c ON c.id = o.whatsapp_conversation_id
          WHERE c.number_id = n.id AND o.status = 'PAID' AND o.is_demo = FALSE AND o.data_provenance = 'COMMERCIAL_PRODUCTION' AND o.created_at > NOW() - make_interval(days => $1)) AS revenue
     FROM whatsapp_numbers n
     LEFT JOIN brands b ON b.id = n.brand_id
     WHERE n.is_deleted = FALSE
     ORDER BY n.created_at ASC`,
    [days]
  );
  const rows = r.rows.map((x: any) => {
    const revenue = Math.round(Number(x.revenue) * 100) / 100;
    return {
      ...x,
      revenue,
      conversion: x.new_conversations > 0 ? Math.round((x.orders_paid / x.new_conversations) * 1000) / 10 : null
    };
  });
  const total = rows.reduce(
    (a: any, x: any) => ({
      new_conversations: a.new_conversations + x.new_conversations,
      orders_created: a.orders_created + x.orders_created,
      orders_paid: a.orders_paid + x.orders_paid,
      revenue: Math.round((a.revenue + x.revenue) * 100) / 100,
      needs_human_now: a.needs_human_now + x.needs_human_now
    }),
    { new_conversations: 0, orders_created: 0, orders_paid: 0, revenue: 0, needs_human_now: 0 }
  );
  return { days, numbers: rows, total };
}
