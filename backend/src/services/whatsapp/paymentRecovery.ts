// NORQVA-0125 (contrato aprovado pelo Ricardo em 24/10/2026 23h53): uma única mensagem pelo WhatsApp para quem
// gerou um pagamento e não pagou.
//
// Quem entra (calculado aqui no servidor e conferido de novo logo antes de cada envio):
// - pedido não pago (PENDING ou CANCELLED) com cobrança gerada, da conta real (não é teste), dos últimos 30 dias, com telefone;
// - a mesma pessoa (e-mail ou telefone normalizados) nunca pagou nenhum pedido;
// - a oferta do pedido está ATIVA ou em TESTE (oferta descontinuada fica de fora);
// - a pessoa não pediu para parar e nunca recebeu esta mensagem (uma por pessoa para sempre, pelo telefone normalizado);
// - vários pedidos da mesma pessoa viram uma mensagem só, sobre o pedido mais recente.
//
// Envio: fila em segundo plano, uma pessoa a cada 2 a 4 minutos, só das 09h às 20h de Brasília, só com o número
// conectado e o atendente ligado (senão nada sai e abre um aviso na central). Texto fixo, sem IA.
// Nada muda em pagamento, entrega ou liberação de acesso. WHATSAPP_RECOVERY_ENABLED=true liga o envio.
import { Pool } from 'pg';
import { WhatsAppProvider, getWhatsAppProvider } from './provider';
import { providerForNumber } from './cloudAccounts';
import { SendBlockedError } from './metaCloudProvider';
import { recordOutgoing } from './whatsappService';
import { newRefCode } from './whatsappRefs';
import { BOT_MESSAGES_PER_NUMBER_HOUR } from './attendant';
import { accessUrlBase } from '../purchaseAccessService';
import { writeAuditLog } from '../../db/audit';
import { WhatsAppError } from './errors';

export const RECOVERY_MAX_AGE_DAYS = 30;
export const RECOVERY_START_MINUTE = 9 * 60; // 09:00
export const RECOVERY_END_MINUTE = 20 * 60; // 20:00 (último envio antes disso)
export const RECOVERY_MIN_GAP_SECONDS = 120;
export const RECOVERY_MAX_GAP_SECONDS = 240;
export const RECOVERY_ALERT_RULE = 'WHATSAPP_RECOVERY_BLOCKED';
const ALERT_OBJECT = 'whatsapp-recovery';
const RECONCILE_TIMEOUT_MS = 30000;

export function recoveryEnabled(): boolean {
  return String(process.env.WHATSAPP_RECOVERY_ENABLED || '').trim().toLowerCase() === 'true';
}

// ---------- regras puras ----------

/**
 * Telefone normalizado da pessoa: 55 + DDD + os 8 últimos números (sem o 9 da frente, que o WhatsApp às vezes
 * tira). Aceita com ou sem 55. null quando não é um celular/fixo brasileiro válido.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  let d = String(raw || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  return `55${ddd}${d.slice(-8)}`;
}

/** Telefone para enviar (55 + DDD + número, com o 9 quando veio com ele). */
export function sendPhone(raw: string | null | undefined): string | null {
  let d = String(raw || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = String(raw || '').trim().toLowerCase();
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

/** Primeiro nome limpo (só letras, apóstrofo e hífen), com a primeira letra maiúscula. null se não der. */
export function cleanFirstName(fullName: string | null | undefined): string | null {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  const only = first.replace(/[^\p{L}'-]/gu, '').replace(/^['-]+|['-]+$/g, '');
  if (only.length < 2 || only.length > 20) return null;
  return only.charAt(0).toLocaleUpperCase('pt-BR') + only.slice(1).toLocaleLowerCase('pt-BR');
}

export function cleanProductName(name: string | null | undefined): string {
  const s = String(name || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return s || 'seu pedido';
}

/** Minutos desde 00:00 no horário de Brasília (calculado pelo fuso, não pelo relógio do servidor). */
export function brasiliaMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0) % 24;
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  return h * 60 + m;
}

export function withinRecoveryHours(now: Date): boolean {
  const m = brasiliaMinutes(now);
  return m >= RECOVERY_START_MINUTE && m < RECOVERY_END_MINUTE;
}

/** Espera até a próxima pessoa: entre 2 e 4 minutos, sorteado. */
export function nextGapSeconds(random: () => number = Math.random): number {
  const r = Math.min(Math.max(random(), 0), 0.999999);
  return Math.floor(RECOVERY_MIN_GAP_SECONDS + r * (RECOVERY_MAX_GAP_SECONDS - RECOVERY_MIN_GAP_SECONDS + 1));
}

export const REF_PLACEHOLDER = '••••••';

/** Link do pagamento com nome e e-mail preenchidos e a origem da recuperação (nunca CPF). */
export function recoveryLink(base: string, offerHumanId: string, fullName: string | null, email: string | null, refCode: string): string {
  const params = new URLSearchParams();
  params.set('checkout', '1');
  const name = String(fullName || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (name) params.set('name', name);
  const e = normalizeEmail(email);
  if (e) params.set('email', e);
  params.set('utm_source', 'whatsapp');
  params.set('utm_medium', 'recuperacao');
  params.set('utm_campaign', 'pagamento_nao_concluido');
  params.set('utm_content', refCode);
  params.set('src', `wa-rec-${refCode}`);
  return `${base.replace(/\/+$/, '')}/p/${encodeURIComponent(offerHumanId)}?${params.toString()}`;
}

/** Texto fixo do contrato (não passa pela IA). */
export function recoveryText(firstName: string | null, productName: string, link: string): string {
  const hi = firstName ? `Oi, ${firstName}!` : 'Oi, tudo bem?';
  return `${hi} Aqui é da NORQVA. Vi que você começou a compra do ${cleanProductName(productName)} e o pagamento não chegou a ser concluído. Se ainda quiser, é só usar este link: ${link}. O acesso chega no seu e-mail logo depois do pagamento. Se tiver alguma dúvida, me responde aqui. Se não quiser mais receber mensagens, é só responder SAIR.`;
}

export const OPT_OUT_ACK_TEXT = 'Combinado! Você não vai mais receber mensagens nossas por aqui. Obrigado e desculpe o incômodo.';

function normalizeReply(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const OPT_OUT_ANY = new Set(['parar', 'pare', 'sair', 'stop', 'cancelar', 'nao quero mais']);
const OPT_OUT_AFTER_RECOVERY = new Set([
  'nao quero', 'nao quero receber', 'nao quero receber mais', 'nao quero mais receber', 'nao tenho interesse', 'sem interesse', 'nao obrigado', 'nao obrigada'
]);

/** "parar", "SAIR!", "Não quero mais 🙏": pedido para parar em qualquer conversa. */
export function isOptOutText(text: string): boolean {
  const n = normalizeReply(text);
  return n.length > 0 && n.length <= 40 && OPT_OUT_ANY.has(n);
}

/** Depois da mensagem de recuperação, "não quero" (e parecidos) também é pedido para parar. */
export function isRecoveryRefusal(text: string): boolean {
  const n = normalizeReply(text);
  return n.length > 0 && n.length <= 40 && (OPT_OUT_ANY.has(n) || OPT_OUT_AFTER_RECOVERY.has(n));
}

const REASONS: Record<string, string> = {
  PAID: 'Já pagou',
  OPTED_OUT: 'Pediu para não receber',
  OFFER_INACTIVE: 'Oferta fora do ar',
  NOT_ELIGIBLE: 'Não está mais na lista (pagou, pedido antigo ou oferta fora do ar)',
  HUMAN_CONVERSATION: 'Conversa com uma pessoa da equipe',
  SEND_BLOCKED: 'Envio bloqueado pelo NORQVA',
  SEND_FAILED: 'O WhatsApp não aceitou a mensagem',
  NO_LINK_BASE: 'Endereço do site não configurado'
};
export function reasonText(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = String(code).split(':')[0];
  return REASONS[key] || String(code);
}

const maskPhone = (key: string) => `(${key.slice(2, 4)}) •••••-${key.slice(-4)}`;

// ---------- quem está na lista ----------

export interface RecoveryPerson {
  phone_key: string;
  phone_masked: string;
  send_phone: string;
  first_name: string | null;
  full_name: string | null;
  email: string | null;
  product_name: string;
  offer_id: string;
  offer_human_id: string;
  brand_id: string | null;
  order_id: string;
  customer_id: string;
  order_created_at: string;
  pending_orders: number;
  /** null = pode receber; senão o motivo de ficar de fora */
  exclusion: 'PAID' | 'OPTED_OUT' | 'OFFER_INACTIVE' | null;
  recovery: { status: string; reason: string | null; sent_at: string | null } | null;
  phone_keys: string[];
}

interface Opts {
  now?: Date;
  /** Só estas pessoas (telefone normalizado). */
  phoneKeys?: string[];
  /** Só para testes: limita às ofertas criadas pelo teste. */
  offerIds?: string[];
}

/** Calcula as pessoas (uma por pessoa, pelo pedido mais recente) com o motivo de quem fica de fora. */
export async function computeRecoveryPeople(pool: Pool, opts: Opts = {}): Promise<RecoveryPerson[]> {
  const now = opts.now || new Date();
  const orders = await pool.query(
    `SELECT o.id AS order_id, o.created_at, o.customer_id, c.name AS customer_name, c.email, c.phone, wc.contact_phone AS conv_phone,
            off.id AS offer_id, off.human_id AS offer_human_id, off.name AS offer_name, off.status AS offer_status,
            (off.is_deleted OR pr.is_deleted OR off.is_demo) AS offer_gone, pr.brand_id
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN LATERAL (
       SELECT i.offer_id FROM order_items i WHERE i.order_id = o.id
       ORDER BY COALESCE(i.is_bump, FALSE) ASC, i.created_at ASC LIMIT 1
     ) oi ON TRUE
     JOIN offers off ON off.id = oi.offer_id
     JOIN products pr ON pr.id = off.product_id
     LEFT JOIN whatsapp_conversations wc ON wc.id = o.whatsapp_conversation_id
     WHERE o.status IN ('PENDING', 'CANCELLED')
       AND o.is_demo = FALSE AND c.is_demo = FALSE
       AND o.data_provenance = 'COMMERCIAL_PRODUCTION'
       AND o.created_at <= $1::timestamptz
       AND o.created_at > $1::timestamptz - ($2::int * INTERVAL '1 day')
       AND EXISTS (SELECT 1 FROM payments pay WHERE pay.order_id = o.id AND pay.provider_payment_id IS NOT NULL)
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_conversations tc
         JOIN whatsapp_numbers tn ON tn.id = tc.number_id
         JOIN whatsapp_cloud_accounts ta ON ta.id = tn.cloud_account_id
         WHERE tc.id = o.whatsapp_conversation_id AND tn.provider = 'META_CLOUD' AND ta.environment = 'TEST'
       )
       AND ($3::uuid[] IS NULL OR off.id = ANY($3::uuid[]))
     ORDER BY o.created_at DESC
     LIMIT 2000`,
    [now.toISOString(), RECOVERY_MAX_AGE_DAYS, opts.offerIds && opts.offerIds.length ? opts.offerIds : null]
  );
  if (!orders.rows.length) return [];

  // agrupa por pessoa: mesmo telefone normalizado ou mesmo e-mail
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const rows = orders.rows.map((o: any) => {
    const key = phoneKey(o.phone) || phoneKey(o.conv_phone);
    const email = normalizeEmail(o.email);
    const phoneRaw = phoneKey(o.phone) ? o.phone : o.conv_phone;
    return { ...o, key, email, phoneRaw };
  });
  for (const r of rows) {
    const node = `o:${r.order_id}`;
    parent.set(node, node);
    if (r.key) union(node, `p:${r.key}`);
    if (r.email) union(node, `e:${r.email}`);
  }
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const g = find(`o:${r.order_id}`);
    const list = groups.get(g) || [];
    list.push(r);
    groups.set(g, list);
  }

  // quem já pagou (qualquer data), quem pediu para parar e quem já entrou na recuperação
  const paid = await pool.query(
    `SELECT DISTINCT c.email, c.phone, wc.contact_phone AS conv_phone
     FROM orders o JOIN customers c ON c.id = o.customer_id
     LEFT JOIN whatsapp_conversations wc ON wc.id = o.whatsapp_conversation_id
     WHERE o.status IN ('PAID', 'REFUNDED') AND o.is_demo = FALSE`
  );
  const paidEmails = new Set<string>();
  const paidPhones = new Set<string>();
  for (const p of paid.rows) {
    const e = normalizeEmail(p.email);
    if (e) paidEmails.add(e);
    for (const ph of [p.phone, p.conv_phone]) {
      const k = phoneKey(ph);
      if (k) paidPhones.add(k);
    }
  }
  const optedOut = new Set<string>();
  for (const r of (await pool.query(`SELECT phone_key FROM whatsapp_recovery_optouts`)).rows) optedOut.add(r.phone_key);
  for (const r of (await pool.query(`SELECT contact_phone, contact_jid FROM whatsapp_conversations WHERE mode = 'OPTED_OUT'`)).rows) {
    const k = phoneKey(r.contact_phone) || phoneKey(r.contact_jid);
    if (k) optedOut.add(k);
  }
  const recRows = new Map<string, any>();
  for (const r of (await pool.query(`SELECT phone_key, status, reason, sent_at FROM whatsapp_recovery_messages`)).rows) recRows.set(r.phone_key, r);

  const wanted = opts.phoneKeys ? new Set(opts.phoneKeys) : null;
  const people: RecoveryPerson[] = [];
  for (const list of groups.values()) {
    const keys = [...new Set(list.map(r => r.key).filter(Boolean))] as string[];
    if (!keys.length) continue; // sem telefone: não dá para mandar
    const emails = new Set(list.map(r => r.email).filter(Boolean));
    // pedido mais recente com oferta no ar (lista já vem do mais novo para o mais antigo)
    const live = list.filter(r => !r.offer_gone && (r.offer_status === 'ATIVA' || r.offer_status === 'TESTE') && r.key);
    const chosen = live[0] || list.find(r => r.key);
    const key: string = chosen.key;
    if (wanted && !keys.some(k => wanted.has(k))) continue;
    let exclusion: RecoveryPerson['exclusion'] = null;
    if (keys.some(k => paidPhones.has(k)) || [...emails].some(e => paidEmails.has(e as string))) exclusion = 'PAID';
    else if (keys.some(k => optedOut.has(k))) exclusion = 'OPTED_OUT';
    else if (!live.length) exclusion = 'OFFER_INACTIVE';
    const rec = keys.map(k => recRows.get(k)).find(r => r && ['SENT', 'QUEUED', 'SENDING'].includes(r.status)) || recRows.get(key) || keys.map(k => recRows.get(k)).find(Boolean) || null;
    people.push({
      phone_key: key,
      phone_masked: maskPhone(key),
      send_phone: sendPhone(chosen.phoneRaw) || key,
      first_name: cleanFirstName(chosen.customer_name),
      full_name: chosen.customer_name ? String(chosen.customer_name).trim() : null,
      email: chosen.email,
      product_name: cleanProductName(chosen.offer_name),
      offer_id: chosen.offer_id,
      offer_human_id: chosen.offer_human_id,
      brand_id: chosen.brand_id || null,
      order_id: chosen.order_id,
      customer_id: chosen.customer_id,
      order_created_at: new Date(chosen.created_at).toISOString(),
      pending_orders: list.length,
      exclusion,
      recovery: rec ? { status: rec.status, reason: rec.reason || null, sent_at: rec.sent_at ? new Date(rec.sent_at).toISOString() : null } : null,
      phone_keys: keys
    });
  }
  people.sort((a, b) => b.order_created_at.localeCompare(a.order_created_at));
  return people;
}

/** Pode entrar na fila agora: sem motivo de exclusão e sem mensagem enviada ou na fila. */
export function isSelectable(p: RecoveryPerson): boolean {
  return !p.exclusion && !(p.recovery && ['SENT', 'QUEUED', 'SENDING'].includes(p.recovery.status));
}

// ---------- número que envia ----------

/**
 * Número de atendimento que envia: Evolution conectado, com o atendente ligado e da marca da oferta (ou sem marca).
 * O número oficial fica de fora: fora da janela de 24h ele só aceita modelo aprovado pela Meta, e este texto não é modelo.
 */
export async function recoveryNumber(pool: Pool, brandId: string | null, providerOverride?: WhatsAppProvider | null) {
  const evolutionOn = providerOverride !== undefined ? !!providerOverride : !!getWhatsAppProvider();
  const r = await pool.query(
    `SELECT id, label, phone, instance_name, status, bot_enabled, provider, cloud_account_id, phone_number_id, brand_id
     FROM whatsapp_numbers
     WHERE is_deleted = FALSE AND COALESCE(provider, 'EVOLUTION') = 'EVOLUTION'
       AND ($1::uuid IS NULL OR brand_id IS NULL OR brand_id = $1::uuid)
     ORDER BY (status = 'CONNECTED' AND bot_enabled) DESC, (brand_id IS NULL) ASC, created_at ASC
     LIMIT 1`,
    [brandId]
  );
  const n = r.rows[0] || null;
  let problem: string | null = null;
  if (!n) problem = 'Nenhum número do WhatsApp cadastrado.';
  else if (!evolutionOn) problem = 'O servidor do WhatsApp (Evolution) está desligado.';
  else if (n.status !== 'CONNECTED') problem = `O número "${n.label}" não está conectado.`;
  else if (!n.bot_enabled) problem = `O atendente do número "${n.label}" está desligado.`;
  return { number: n, ready: !problem, problem };
}

// ---------- aviso na central ----------

async function raiseAlert(pool: Pool, problem: string) {
  try {
    await pool.query(
      `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, spend, threshold, message, is_demo)
       SELECT $1::varchar, $2::varchar, NULL, NULL, 'WhatsApp — pagamentos não concluídos', 0, 0, $3::text, FALSE
       WHERE NOT EXISTS (
         SELECT 1 FROM ad_alerts WHERE rule_code = $1::varchar AND meta_ad_id = $2::varchar AND is_demo = FALSE
           AND status IN ('OPEN', 'ACKNOWLEDGED') AND dismissed_at IS NULL
       )`,
      [RECOVERY_ALERT_RULE, ALERT_OBJECT, `Mensagens para quem não concluiu o pagamento estão paradas: ${problem}`.slice(0, 500)]
    );
  } catch (err: any) {
    console.error('[WhatsApp recuperação] não abriu o aviso:', err?.message || err);
  }
}

async function resolveAlert(pool: Pool) {
  await pool.query(
    `UPDATE ad_alerts SET status = 'RESOLVED', resolution = 'NUMBER_READY', resolved_at = NOW(), updated_at = NOW()
     WHERE rule_code = $1 AND meta_ad_id = $2 AND is_demo = FALSE AND status IN ('OPEN', 'ACKNOWLEDGED')`,
    [RECOVERY_ALERT_RULE, ALERT_OBJECT]
  ).catch(() => {});
}

// ---------- tela ----------

function sampleText(p: RecoveryPerson, base: string | null) {
  const link = recoveryLink(base || 'https://acesso.norqva.com.br', p.offer_human_id, p.full_name, p.email, REF_PLACEHOLDER);
  return recoveryText(p.first_name, p.product_name, link);
}

export async function recoveryOverview(pool: Pool, opts: Opts = {}) {
  const now = opts.now || new Date();
  const people = await computeRecoveryPeople(pool, opts);
  const base = accessUrlBase();
  const selectable = people.filter(isSelectable);
  const excluded: Record<string, number> = { PAID: 0, OPTED_OUT: 0, OFFER_INACTIVE: 0 };
  for (const p of people) if (p.exclusion) excluded[p.exclusion]++;
  const hist = await pool.query(
    `SELECT r.id, r.phone_key, r.first_name, r.product_name, r.status, r.reason, r.queued_at, r.sent_at, r.order_id, o.created_at AS order_created_at
     FROM whatsapp_recovery_messages r LEFT JOIN orders o ON o.id = r.order_id
     WHERE ($1::uuid[] IS NULL OR r.offer_id = ANY($1::uuid[]))
     ORDER BY r.queued_at DESC LIMIT 300`,
    [opts.offerIds && opts.offerIds.length ? opts.offerIds : null]
  );
  const sendable = await recoveryNumber(pool, null);
  return {
    enabled: recoveryEnabled(),
    number: sendable.number ? { label: sendable.number.label, phone: sendable.number.phone, ready: sendable.ready } : null,
    number_problem: sendable.problem,
    window: { start: '09:00', end: '20:00', open: withinRecoveryHours(now) },
    people: selectable.map(p => ({
      phone_key: p.phone_key,
      phone_masked: p.phone_masked,
      first_name: p.first_name,
      product_name: p.product_name,
      order_created_at: p.order_created_at,
      pending_orders: p.pending_orders,
      last_attempt: p.recovery ? { status: p.recovery.status, reason: reasonText(p.recovery.reason) } : null,
      preview: sampleText(p, base)
    })),
    excluded,
    history: hist.rows.map((r: any) => ({
      id: r.id,
      phone_masked: maskPhone(r.phone_key),
      first_name: r.first_name,
      product_name: r.product_name,
      status: r.status,
      reason: reasonText(r.reason),
      queued_at: r.queued_at,
      sent_at: r.sent_at,
      order_created_at: r.order_created_at
    }))
  };
}

/** "Enviar": põe na fila só quem foi marcado e continua na lista (o servidor confere de novo). */
export async function queueRecovery(pool: Pool, body: any, userId: string | null, opts: Opts = {}) {
  if (!recoveryEnabled()) throw new WhatsAppError(409, 'O envio está desligado (WHATSAPP_RECOVERY_ENABLED). A lista aparece, mas nada é enviado.');
  const keys: string[] = Array.isArray(body?.phone_keys) ? [...new Set<string>(body.phone_keys.map((k: any) => String(k)).filter((k: string) => /^55\d{10}$/.test(k)))] : [];
  if (!keys.length) throw new WhatsAppError(400, 'Marque pelo menos uma pessoa.');
  if (keys.length > 500) throw new WhatsAppError(400, 'No máximo 500 pessoas por envio.');
  const sendable = await recoveryNumber(pool, null);
  if (!sendable.ready) {
    await raiseAlert(pool, sendable.problem || 'número indisponível');
    throw new WhatsAppError(409, `Nada foi enviado: ${sendable.problem} Conecte o número e ligue o atendente.`);
  }
  const people = await computeRecoveryPeople(pool, { ...opts, phoneKeys: keys });
  const wanted = new Set(keys);
  let queued = 0;
  for (const p of people) {
    if (!wanted.has(p.phone_key) || !isSelectable(p)) continue;
    const r = await pool.query(
      `INSERT INTO whatsapp_recovery_messages (phone_key, order_id, customer_id, offer_id, first_name, product_name, status, queued_by, queued_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', $7, NOW())
       ON CONFLICT (phone_key) DO UPDATE SET status = 'QUEUED', reason = NULL, order_id = EXCLUDED.order_id, customer_id = EXCLUDED.customer_id,
         offer_id = EXCLUDED.offer_id, first_name = EXCLUDED.first_name, product_name = EXCLUDED.product_name,
         queued_by = EXCLUDED.queued_by, queued_at = NOW(), updated_at = NOW()
       WHERE whatsapp_recovery_messages.status IN ('FAILED', 'SKIPPED')
       RETURNING id`,
      [p.phone_key, p.order_id, p.customer_id, p.offer_id, p.first_name, p.product_name.slice(0, 120), userId && /^[0-9a-f-]{36}$/i.test(userId) ? userId : null]
    );
    if (r.rows.length) queued++;
  }
  await writeAuditLog(pool, userId, 'WHATSAPP_RECOVERY_QUEUED', `Recuperação pelo WhatsApp: ${queued} pessoa(s) na fila (de ${keys.length} marcada(s)).`, null, String(queued)).catch(() => {});
  return { queued, selected: keys.length };
}

// ---------- fila ----------

export interface RecoveryDeps {
  now?: Date;
  /** Confere o pagamento no Asaas (no servidor: reconcileAndFinalizePayment). */
  reconcile?: (paymentId: string, pool: Pool) => Promise<any>;
  /** Só para testes: motor do WhatsApp simulado. */
  provider?: WhatsAppProvider | null;
  random?: () => number;
  offerIds?: string[];
}

export interface RecoveryTickResult {
  outcome: 'OFF' | 'EMPTY' | 'OUTSIDE_HOURS' | 'WAIT' | 'NUMBER_OFF' | 'LIMIT' | 'RECHECK_FAILED' | 'NO_LINK_BASE' | 'SENT' | 'FAILED' | 'SKIPPED_ALL';
  sent: number;
  skipped: number;
}

async function reconcileWithTimeout(fn: (paymentId: string, pool: Pool) => Promise<any>, paymentId: string, pool: Pool): Promise<boolean> {
  let timer: any;
  const timeout = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), RECONCILE_TIMEOUT_MS); });
  try {
    const r = await Promise.race([fn(paymentId, pool).then(() => 'ok' as const, () => 'error' as const), timeout]);
    return r === 'ok';
  } finally {
    clearTimeout(timer);
  }
}

async function skipRow(pool: Pool, id: string, reason: string) {
  await pool.query(
    `UPDATE whatsapp_recovery_messages SET status = 'SKIPPED', reason = $2, updated_at = NOW() WHERE id = $1 AND status IN ('QUEUED', 'SENDING')`,
    [id, reason.slice(0, 120)]
  );
}

/** Uma rodada da fila: no máximo uma mensagem enviada. Chamada a cada minuto pelo agendador. */
export async function runRecoveryQueue(pool: Pool, deps: RecoveryDeps = {}): Promise<RecoveryTickResult> {
  const res = (outcome: RecoveryTickResult['outcome'], sent = 0, skipped = 0): RecoveryTickResult => ({ outcome, sent, skipped });
  if (!recoveryEnabled()) return res('OFF');
  const now = deps.now || new Date();
  const queue = await pool.query(
    `SELECT * FROM whatsapp_recovery_messages WHERE status = 'QUEUED' AND ($1::uuid[] IS NULL OR offer_id = ANY($1::uuid[]))
     ORDER BY queued_at ASC, id ASC LIMIT 10`,
    [deps.offerIds && deps.offerIds.length ? deps.offerIds : null]
  );
  if (!queue.rows.length) return res('EMPTY');
  if (!withinRecoveryHours(now)) return res('OUTSIDE_HOURS');

  // número pronto antes de reservar a vez (sem número: nada sai, aviso na central, a fila espera)
  const sendable = await recoveryNumber(pool, null, deps.provider);
  if (!sendable.ready) {
    await raiseAlert(pool, sendable.problem || 'número indisponível');
    return res('NUMBER_OFF');
  }
  const base = accessUrlBase();
  if (!base) return res('NO_LINK_BASE');

  // vez da próxima pessoa: só um servidor passa, e a próxima vez fica 2 a 4 minutos depois
  const gap = nextGapSeconds(deps.random);
  const slot = await pool.query(
    `UPDATE whatsapp_recovery_state SET next_send_at = $1::timestamptz + ($2::int * INTERVAL '1 second'), updated_at = NOW()
     WHERE id = 1 AND (next_send_at IS NULL OR next_send_at <= $1::timestamptz) RETURNING id`,
    [now.toISOString(), gap]
  );
  if (!slot.rows.length) return res('WAIT');
  const releaseSlot = (at: Date) =>
    pool.query(`UPDATE whatsapp_recovery_state SET next_send_at = $1::timestamptz, updated_at = NOW() WHERE id = 1`, [at.toISOString()]);

  let skipped = 0;
  for (const row of queue.rows) {
    // confere de novo quem é a pessoa, a oferta e os pagamentos (pode ter pago no meio)
    let person = (await computeRecoveryPeople(pool, { now, phoneKeys: [row.phone_key] })).find(p => p.phone_keys.includes(row.phone_key));
    if (person && !person.exclusion && deps.reconcile) {
      const pend = await pool.query(
        `SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id
         WHERE o.id = $1 AND p.status = 'PENDING' AND p.provider_payment_id IS NOT NULL
         ORDER BY p.created_at DESC LIMIT 3`,
        [person.order_id]
      );
      for (const p of pend.rows) {
        if (!(await reconcileWithTimeout(deps.reconcile, p.id, pool))) {
          await releaseSlot(new Date(now.getTime() + 5 * 60 * 1000));
          return res('RECHECK_FAILED', 0, skipped);
        }
      }
      person = (await computeRecoveryPeople(pool, { now, phoneKeys: [row.phone_key] })).find(p => p.phone_keys.includes(row.phone_key));
    }
    if (!person) {
      // saiu da lista: se foi porque pagou, o motivo fica claro na tela
      const paidNow = await pool.query(
        `SELECT 1 FROM orders o WHERE o.status IN ('PAID', 'REFUNDED') AND o.is_demo = FALSE
           AND (o.id = $1 OR ($2::uuid IS NOT NULL AND o.customer_id = $2::uuid)) LIMIT 1`,
        [row.order_id, row.customer_id]
      );
      await skipRow(pool, row.id, paidNow.rows.length ? 'PAID' : 'NOT_ELIGIBLE');
      skipped++;
      continue;
    }
    if (person.exclusion) { await skipRow(pool, row.id, person.exclusion); skipped++; continue; }

    const number = sendable.number;
    // limite por hora do número (o mesmo do atendente, contra bloqueio)
    const lim = await pool.query(
      `SELECT COUNT(*)::int AS n FROM whatsapp_messages m JOIN whatsapp_conversations c ON c.id = m.conversation_id
       WHERE c.number_id = $1 AND m.author = 'BOT' AND m.created_at > $2::timestamptz - INTERVAL '1 hour'`,
      [number.id, now.toISOString()]
    );
    if (lim.rows[0].n >= BOT_MESSAGES_PER_NUMBER_HOUR) {
      await releaseSlot(new Date(now.getTime() + 10 * 60 * 1000));
      return res('LIMIT', 0, skipped);
    }

    // conversa já existente com a pessoa neste número (o WhatsApp às vezes tira o 9: compara pelo telefone normalizado)
    const convs = await pool.query(
      `SELECT id, contact_jid, contact_phone, mode, needs_human FROM whatsapp_conversations WHERE number_id = $1 AND contact_jid LIKE $2`,
      [number.id, `%${row.phone_key.slice(-8)}@%`]
    );
    const existing = convs.rows.find((c: any) => phoneKey(c.contact_phone) === row.phone_key || phoneKey(c.contact_jid) === row.phone_key) || null;
    if (existing?.mode === 'OPTED_OUT') { await skipRow(pool, row.id, 'OPTED_OUT'); skipped++; continue; }
    if (existing && (existing.mode === 'HUMAN' || existing.needs_human)) { await skipRow(pool, row.id, 'HUMAN_CONVERSATION'); skipped++; continue; }

    // reserva da linha: só uma rodada envia
    const claim = await pool.query(
      `UPDATE whatsapp_recovery_messages SET status = 'SENDING', attempt_at = $2::timestamptz, number_id = $3, order_id = $4, offer_id = $5, updated_at = NOW()
       WHERE id = $1 AND status = 'QUEUED' RETURNING id`,
      [row.id, now.toISOString(), number.id, person.order_id, person.offer_id]
    );
    if (!claim.rows.length) continue;

    const provider = deps.provider !== undefined
      ? deps.provider
      : await providerForNumber(pool, { id: number.id, provider: number.provider, cloud_account_id: number.cloud_account_id, phone_number_id: number.phone_number_id });
    if (!provider) {
      await pool.query(`UPDATE whatsapp_recovery_messages SET status = 'QUEUED', updated_at = NOW() WHERE id = $1 AND status = 'SENDING'`, [row.id]);
      await raiseAlert(pool, 'O servidor do WhatsApp não respondeu.');
      await releaseSlot(now);
      return res('NUMBER_OFF', 0, skipped);
    }

    const jid = existing?.contact_jid || `${person.send_phone}@s.whatsapp.net`;
    const conv = existing
      ? { id: existing.id }
      : (await pool.query(
          `INSERT INTO whatsapp_conversations (number_id, contact_jid, contact_phone, contact_name, mode)
           VALUES ($1, $2, $3, $4, 'BOT')
           ON CONFLICT (number_id, contact_jid) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [number.id, jid, person.send_phone, person.full_name ? person.full_name.slice(0, 120) : null]
        )).rows[0];

    // origem da recuperação (mesma tabela do código da página): venda pela conversa ou pelo link fica como recuperação
    let refId: string | null = null;
    let code = '';
    for (let attempt = 0; attempt < 5 && !refId; attempt++) {
      code = newRefCode();
      const ins = await pool.query(
        `INSERT INTO whatsapp_refs (code, offer_id, offer_human_id, number_id, utm_source, utm_medium, utm_campaign, utm_content,
                                    attribution_metadata, client_user_agent, conversation_id, used_at)
         VALUES ($1, $2, $3, $4, 'whatsapp', 'recuperacao', 'pagamento_nao_concluido', $1, $5::jsonb, 'NORQVA WhatsApp', $6, NOW())
         ON CONFLICT (code) DO NOTHING RETURNING id`,
        [code, person.offer_id, person.offer_human_id, number.id, JSON.stringify({ source: 'whatsapp_recovery', order_id: person.order_id }), conv.id]
      );
      if (ins.rows.length) refId = ins.rows[0].id;
    }
    if (!refId) {
      await pool.query(`UPDATE whatsapp_recovery_messages SET status = 'QUEUED', updated_at = NOW() WHERE id = $1 AND status = 'SENDING'`, [row.id]);
      await releaseSlot(now);
      return res('FAILED', 0, skipped);
    }
    await pool.query('UPDATE whatsapp_conversations SET ref_id = $2, updated_at = NOW() WHERE id = $1', [conv.id, refId]);

    const link = recoveryLink(base, person.offer_human_id, person.full_name, person.email, code);
    const text = recoveryText(person.first_name, person.product_name, link);
    try {
      const sent = await provider.sendText(number.instance_name, jid, text);
      await recordOutgoing(pool, conv.id, 'BOT', text, sent.id);
      await pool.query(
        `UPDATE whatsapp_recovery_messages SET status = 'SENT', reason = NULL, sent_at = $2::timestamptz, conversation_id = $3, ref_id = $4,
                provider_message_id = $5, updated_at = NOW()
         WHERE id = $1 AND status = 'SENDING'`,
        [row.id, now.toISOString(), conv.id, refId, sent.id ? String(sent.id).slice(0, 120) : null]
      );
      await resolveAlert(pool);
      await writeAuditLog(pool, null, 'WHATSAPP_RECOVERY_SENT', `Mensagem de recuperação enviada (pedido ${person.order_id}) na conversa ${conv.id}.`, null, person.order_id).catch(() => {});
      return res('SENT', 1, skipped);
    } catch (err: any) {
      const blocked = err instanceof SendBlockedError;
      await recordOutgoing(pool, conv.id, 'BOT', text, null, { failed: true }).catch(() => {});
      await pool.query(
        `UPDATE whatsapp_recovery_messages SET status = $2, reason = $3, conversation_id = $4, ref_id = $5, updated_at = NOW() WHERE id = $1 AND status = 'SENDING'`,
        [row.id, blocked ? 'SKIPPED' : 'FAILED', blocked ? `SEND_BLOCKED:${err.code}`.slice(0, 120) : `SEND_FAILED:${String(err?.message || '').slice(0, 100)}`, conv.id, refId]
      );
      console.warn('[WhatsApp recuperação] envio falhou:', err?.message || err);
      return res('FAILED', 0, skipped);
    }
  }
  // ninguém enviado nesta rodada (todos pulados): a vez fica livre para a próxima rodada
  await releaseSlot(now);
  return res('SKIPPED_ALL', 0, skipped);
}

// ---------- "SAIR" ----------

/** Esta conversa recebeu a mensagem de recuperação? */
export async function conversationHadRecovery(pool: Pool, conversationId: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM whatsapp_recovery_messages WHERE conversation_id = $1 AND status = 'SENT' LIMIT 1`, [conversationId]);
  return r.rows.length > 0;
}

/** Guarda o pedido para parar pelo telefone (fica fora da recuperação para sempre). */
export async function recordRecoveryOptOut(pool: Pool, conversationId: string, phone: string | null, jid: string | null): Promise<void> {
  const key = phoneKey(phone) || phoneKey(jid);
  if (!key) return;
  await pool.query(
    `INSERT INTO whatsapp_recovery_optouts (phone_key, conversation_id) VALUES ($1, $2) ON CONFLICT (phone_key) DO NOTHING`,
    [key, conversationId]
  );
}

/** Resposta curta do atendente a quem pediu para parar depois da recuperação (uma vez só, texto fixo). */
export async function acknowledgeRecoveryOptOut(pool: Pool, conversationId: string, providerOverride?: WhatsAppProvider | null): Promise<boolean> {
  const r = await pool.query(
    `SELECT c.id, c.contact_jid, c.contact_phone, n.id AS n_id, n.instance_name, n.status, n.is_deleted, n.provider, n.cloud_account_id, n.phone_number_id
     FROM whatsapp_conversations c JOIN whatsapp_numbers n ON n.id = c.number_id WHERE c.id = $1`,
    [conversationId]
  );
  const c = r.rows[0];
  if (!c || c.is_deleted || c.status !== 'CONNECTED') return false;
  const key = phoneKey(c.contact_phone) || phoneKey(c.contact_jid);
  if (!key) return false;
  const claim = await pool.query(
    `UPDATE whatsapp_recovery_optouts SET ack_sent_at = NOW() WHERE phone_key = $1 AND ack_sent_at IS NULL RETURNING phone_key`,
    [key]
  );
  if (!claim.rows.length) return false;
  const provider = providerOverride !== undefined
    ? providerOverride
    : await providerForNumber(pool, { id: c.n_id, provider: c.provider, cloud_account_id: c.cloud_account_id, phone_number_id: c.phone_number_id });
  if (!provider) return false;
  try {
    const sent = await provider.sendText(c.instance_name, c.contact_jid, OPT_OUT_ACK_TEXT);
    await recordOutgoing(pool, c.id, 'BOT', OPT_OUT_ACK_TEXT, sent.id);
    return true;
  } catch (err: any) {
    console.warn('[WhatsApp recuperação] resposta ao SAIR falhou:', err?.message || err);
    return false;
  }
}

// ---------- agendador ----------

export function startRecoveryScheduler(pool: Pool, deps: Pick<RecoveryDeps, 'reconcile'>): () => void {
  if (process.env.NODE_ENV === 'test') return () => {};
  let running = false;
  const tick = async () => {
    if (running || !recoveryEnabled()) return;
    running = true;
    try {
      const r = await runRecoveryQueue(pool, deps);
      if (r.sent || r.skipped || r.outcome === 'NUMBER_OFF' || r.outcome === 'FAILED') console.log('[WhatsApp recuperação]', JSON.stringify(r));
    } catch (err: any) {
      console.error('[WhatsApp recuperação] rodada falhou:', err?.message || err);
    } finally {
      running = false;
    }
  };
  const every = setInterval(() => void tick(), 60 * 1000);
  every.unref?.();
  return () => clearInterval(every);
}
