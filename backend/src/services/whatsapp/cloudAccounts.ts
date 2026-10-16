// NORQVA-0079 (D-0079): contas Meta do WhatsApp oficial, uma por operação (marca) e ambiente.
// - token e App Secret criptografados (utils/secretBox), nunca devolvidos para a tela (só os 4 últimos do token)
// - TEST e PRODUCTION separados: ir para produção = cadastrar conta e número novos, sem editar IDs
// - o motor de cada número é escolhido aqui (providerForNumber)
import crypto from 'crypto';
import { Pool } from 'pg';
import { writeAuditLog } from '../../db/audit';
import { WhatsAppError } from './errors';
import { WhatsAppProvider, ProviderError, getWhatsAppProvider } from './provider';
import { sealSecret, openSecret, secretsKeyConfigured, SecretBoxError } from '../../utils/secretBox';
import {
  MetaCloudProvider,
  CloudEnvironment,
  CloudErrorInfo,
  SendBlockedError,
  CloudApiError,
  graphFetch,
  graphBase,
  describeCloudError,
  digitsOf
} from './metaCloudProvider';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const META_ID_RE = /^\d{5,25}$/;
export const MAX_TEST_RECIPIENTS = 5;
export const REQUIRED_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];
const MAX_NUMBERS = 100;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface CloudNumberRow {
  id: string;
  provider?: string | null;
  cloud_account_id?: string | null;
  phone_number_id?: string | null;
}

function checkId(id: string, what = 'Conta') {
  if (!UUID_RE.test(String(id))) throw new WhatsAppError(404, `${what} não encontrada.`);
}

function maskPhone(digits: string): string {
  const d = digitsOf(digits);
  return d.length > 4 ? `+${d.slice(0, 2)} •••• ${d.slice(-4)}` : '••••';
}

export function webhookPath(accountId: string) {
  return `/api/whatsapp/cloud/webhook/${accountId}`;
}

function publicAccount(a: any) {
  return {
    id: a.id,
    label: a.label,
    brand_id: a.brand_id,
    brand_name: a.brand_name ?? null,
    environment: a.environment,
    waba_id: a.waba_id,
    app_id: a.app_id,
    graph_api_version: a.graph_api_version,
    token_last4: a.token_last4,
    test_recipients: (a.test_recipients || []).map(maskPhone),
    status: a.status,
    webhook_path: webhookPath(a.id),
    webhook_verified_at: a.webhook_verified_at,
    last_check_at: a.last_check_at,
    last_error: a.last_error,
    created_at: a.created_at,
    numbers: a.numbers !== undefined ? Number(a.numbers) : undefined
  };
}

// ---------- validação ----------

function cleanLabel(v: any): string {
  const l = String(v ?? '').trim();
  if (!l) throw new WhatsAppError(400, 'Dê um nome à conta (ex.: "Trattoria — teste").');
  if (l.length > 80) throw new WhatsAppError(400, 'Nome muito longo (até 80 letras).');
  return l;
}

function cleanEnvironment(v: any): CloudEnvironment {
  const e = String(v ?? 'TEST').trim().toUpperCase();
  if (e !== 'TEST' && e !== 'PRODUCTION') throw new WhatsAppError(400, 'Ambiente deve ser TEST ou PRODUCTION.');
  return e;
}

function cleanMetaId(v: any, what: string): string {
  const s = String(v ?? '').trim();
  if (!META_ID_RE.test(s)) throw new WhatsAppError(400, `${what} inválido: use só os números do ID que aparece no painel da Meta.`);
  return s;
}

function cleanToken(v: any): string {
  const s = String(v ?? '').trim();
  if (s.length < 30 || s.length > 1024 || /\s/.test(s)) throw new WhatsAppError(400, 'Token de acesso inválido: cole o token do usuário do sistema inteiro, sem espaços.');
  return s;
}

function cleanAppSecret(v: any): string {
  const s = String(v ?? '').trim();
  if (!/^[A-Za-z0-9]{16,128}$/.test(s)) throw new WhatsAppError(400, 'Chave secreta do app inválida (fica em Configurações do app → Básico → Chave secreta do app).');
  return s;
}

function cleanRecipients(v: any): string[] {
  if (v === undefined || v === null || v === '') return [];
  const list = Array.isArray(v) ? v : String(v).split(/[,;\n]+/);
  const out: string[] = [];
  for (const item of list) {
    const d = digitsOf(String(item));
    if (!d) continue;
    if (d.length < 10 || d.length > 15) throw new WhatsAppError(400, `Destinatário de teste inválido: ${String(item).slice(0, 30)}. Use o número com código do país (ex.: +55 31 99999-8888).`);
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > MAX_TEST_RECIPIENTS) throw new WhatsAppError(400, `A Meta aceita até ${MAX_TEST_RECIPIENTS} destinatários de teste.`);
  return out;
}

async function checkBrand(pool: Pool, brandId: any): Promise<string | null> {
  if (brandId === undefined || brandId === null || brandId === '') return null;
  if (!UUID_RE.test(String(brandId))) throw new WhatsAppError(400, 'Marca inválida.');
  const r = await pool.query('SELECT id FROM brands WHERE id = $1', [brandId]);
  if (!r.rows.length) throw new WhatsAppError(400, 'Marca não encontrada.');
  return String(brandId);
}

function requireSecretsKey() {
  if (!secretsKeyConfigured()) {
    throw new WhatsAppError(503, 'Falta configurar WHATSAPP_SECRETS_KEY no servidor (chave que protege o token da Meta). Nada foi salvo.');
  }
}

function seal(v: string): string {
  try {
    return sealSecret(v);
  } catch (err: any) {
    if (err instanceof SecretBoxError) throw new WhatsAppError(503, err.message);
    throw err;
  }
}

// ---------- contas ----------

async function loadAccountRow(pool: Pool, id: string) {
  checkId(id);
  const r = await pool.query('SELECT * FROM whatsapp_cloud_accounts WHERE id = $1 AND is_deleted = FALSE', [id]);
  if (!r.rows.length) throw new WhatsAppError(404, 'Conta não encontrada.');
  return r.rows[0];
}

export async function listCloudAccounts(pool: Pool) {
  const r = await pool.query(
    `SELECT a.*, b.name AS brand_name,
            (SELECT COUNT(*) FROM whatsapp_numbers n WHERE n.cloud_account_id = a.id AND n.is_deleted = FALSE) AS numbers
     FROM whatsapp_cloud_accounts a
     LEFT JOIN brands b ON b.id = a.brand_id
     WHERE a.is_deleted = FALSE
     ORDER BY a.created_at ASC`
  );
  return { accounts: r.rows.map(publicAccount), secrets_key_configured: secretsKeyConfigured() };
}

/** Cadastra a conta. O verify token do webhook é mostrado UMA vez (só o hash fica guardado). */
export async function createCloudAccount(pool: Pool, body: any, userId: string | null) {
  requireSecretsKey();
  const label = cleanLabel(body?.label);
  const environment = cleanEnvironment(body?.environment);
  const wabaId = cleanMetaId(body?.waba_id, 'ID da conta do WhatsApp Business (WABA)');
  const appId = cleanMetaId(body?.app_id, 'ID do app');
  const token = cleanToken(body?.access_token);
  const appSecret = cleanAppSecret(body?.app_secret);
  const recipients = cleanRecipients(body?.test_recipients);
  if (environment === 'PRODUCTION' && recipients.length) {
    throw new WhatsAppError(400, 'Destinatários de teste só existem em conta TEST.');
  }
  const brandId = await checkBrand(pool, body?.brand_id);
  const dupe = await pool.query(
    'SELECT id FROM whatsapp_cloud_accounts WHERE environment = $1 AND waba_id = $2 AND is_deleted = FALSE',
    [environment, wabaId]
  );
  if (dupe.rows.length) throw new WhatsAppError(409, 'Esta conta do WhatsApp Business já está cadastrada neste ambiente.');
  const verifyToken = crypto.randomBytes(24).toString('hex');
  const r = await pool.query(
    `INSERT INTO whatsapp_cloud_accounts
       (label, brand_id, environment, waba_id, app_id, graph_api_version, access_token_enc, app_secret_enc, token_last4, verify_token_hash, test_recipients, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      label, brandId, environment, wabaId, appId, process.env.META_API_VERSION || 'v26.0',
      seal(token), seal(appSecret), token.slice(-4), sha256(verifyToken), recipients, userId
    ]
  );
  await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_ACCOUNT_CREATED', `Conta Meta do WhatsApp "${label}" (${environment}, WABA ${wabaId}) cadastrada.`, null, r.rows[0].id);
  return { account: publicAccount(r.rows[0]), verify_token: verifyToken };
}

/**
 * Altera nome, marca, destinatários de teste, token, App Secret ou liga/desliga a conta.
 * Ambiente, WABA e App ID não mudam: para outro ambiente, cadastre outra conta.
 */
export async function updateCloudAccount(pool: Pool, id: string, body: any, userId: string | null) {
  const a = await loadAccountRow(pool, id);
  if (body?.environment !== undefined && cleanEnvironment(body.environment) !== a.environment) {
    throw new WhatsAppError(400, 'O ambiente não muda. Para produção, cadastre uma conta nova.');
  }
  if ((body?.waba_id !== undefined && String(body.waba_id).trim() !== a.waba_id) || (body?.app_id !== undefined && String(body.app_id).trim() !== a.app_id)) {
    throw new WhatsAppError(400, 'Os IDs da Meta não mudam. Para outra conta, cadastre uma conta nova.');
  }
  const label = body?.label !== undefined ? cleanLabel(body.label) : a.label;
  const brandId = body?.brand_id !== undefined ? await checkBrand(pool, body.brand_id) : a.brand_id;
  let recipients: string[] = a.test_recipients || [];
  if (body?.test_recipients !== undefined) {
    recipients = cleanRecipients(body.test_recipients);
    if (a.environment === 'PRODUCTION' && recipients.length) throw new WhatsAppError(400, 'Destinatários de teste só existem em conta TEST.');
  }
  let tokenEnc = a.access_token_enc;
  let last4 = a.token_last4;
  let secretEnc = a.app_secret_enc;
  let status = a.status;
  const changes: string[] = [];
  if (body?.access_token !== undefined && body.access_token !== '') {
    requireSecretsKey();
    const t = cleanToken(body.access_token);
    tokenEnc = seal(t);
    last4 = t.slice(-4);
    status = 'NEW';
    changes.push('token trocado');
  }
  if (body?.app_secret !== undefined && body.app_secret !== '') {
    requireSecretsKey();
    secretEnc = seal(cleanAppSecret(body.app_secret));
    changes.push('chave secreta trocada');
  }
  if (body?.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new WhatsAppError(400, 'active deve ser verdadeiro ou falso.');
    if (!body.active) status = 'DISABLED';
    else if (a.status === 'DISABLED') status = 'NEW';
    changes.push(body.active ? 'conta reativada' : 'conta desativada');
  }
  let verifyToken: string | null = null;
  let verifyHash = a.verify_token_hash;
  let webhookVerifiedAt = a.webhook_verified_at;
  if (body?.rotate_verify_token === true) {
    verifyToken = crypto.randomBytes(24).toString('hex');
    verifyHash = sha256(verifyToken);
    webhookVerifiedAt = null;
    changes.push('verify token do webhook trocado');
  }
  if (JSON.stringify(recipients) !== JSON.stringify(a.test_recipients || [])) changes.push('destinatários de teste alterados');
  const r = await pool.query(
    `UPDATE whatsapp_cloud_accounts SET label = $1, brand_id = $2, test_recipients = $3, access_token_enc = $4, token_last4 = $5,
            app_secret_enc = $6, status = $7, verify_token_hash = $8, webhook_verified_at = $9, updated_at = NOW()
     WHERE id = $10 RETURNING *`,
    [label, brandId, recipients, tokenEnc, last4, secretEnc, status, verifyHash, webhookVerifiedAt, id]
  );
  if (status === 'DISABLED' && a.status !== 'DISABLED') {
    // conta desligada: o atendente para nos números dela
    await pool.query(`UPDATE whatsapp_numbers SET bot_enabled = FALSE, status = 'DISCONNECTED', status_reason = 'Conta Meta desativada.', updated_at = NOW() WHERE cloud_account_id = $1`, [id]);
  }
  if (changes.length) {
    await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_ACCOUNT_UPDATED', `Conta Meta "${label}": ${changes.join(', ')}.`, a.status, status);
  }
  return { account: publicAccount(r.rows[0]), verify_token: verifyToken };
}

export async function deleteCloudAccount(pool: Pool, id: string, userId: string | null) {
  const a = await loadAccountRow(pool, id);
  const n = await pool.query('SELECT COUNT(*)::int AS n FROM whatsapp_numbers WHERE cloud_account_id = $1 AND is_deleted = FALSE', [id]);
  if (n.rows[0].n > 0) throw new WhatsAppError(409, 'Exclua antes os números desta conta.');
  await pool.query(`UPDATE whatsapp_cloud_accounts SET is_deleted = TRUE, status = 'DISABLED', updated_at = NOW() WHERE id = $1`, [id]);
  await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_ACCOUNT_DELETED', `Conta Meta "${a.label}" (${a.environment}) excluída.`, a.id, null);
  return { ok: true };
}

// ---------- Graph API (conferências) ----------

function decryptOrFail(sealed: string, what: string): string {
  try {
    return openSecret(sealed);
  } catch (err: any) {
    throw new WhatsAppError(503, err instanceof SecretBoxError ? err.message : `Não foi possível ler ${what}.`);
  }
}

async function graphGet(account: any, token: string, path: string): Promise<any> {
  const res = await graphFetch()(`${graphBase(account.graph_api_version)}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  if (res.status >= 200 && res.status < 300 && !res.json?.error) return res.json;
  const code = Number.isFinite(Number(res.json?.error?.code)) ? Number(res.json.error.code) : null;
  throw new CloudApiError(describeCloudError(code, res.json?.error?.message).message, 502, code);
}

async function graphPost(account: any, token: string, path: string): Promise<any> {
  const res = await graphFetch()(`${graphBase(account.graph_api_version)}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (res.status >= 200 && res.status < 300 && !res.json?.error) return res.json;
  const code = Number.isFinite(Number(res.json?.error?.code)) ? Number(res.json.error.code) : null;
  throw new CloudApiError(describeCloudError(code, res.json?.error?.message).message, 502, code);
}

/**
 * "Conferir conta": token válido, permissões, WABA acessível e números dela.
 * Com subscribe = true, também assina o app na WABA (a Meta passa a mandar as mensagens para o webhook).
 * Nada é enviado a nenhum cliente.
 */
export async function checkCloudAccount(pool: Pool, id: string, opts: { subscribe?: boolean }, userId: string | null) {
  const a = await loadAccountRow(pool, id);
  if (a.status === 'DISABLED') throw new WhatsAppError(409, 'Conta desativada. Reative antes de conferir.');
  const token = decryptOrFail(a.access_token_enc, 'o token');
  const fail = async (msg: string) => {
    await pool.query(`UPDATE whatsapp_cloud_accounts SET status = 'INVALID', last_error = $1, last_check_at = NOW(), updated_at = NOW() WHERE id = $2`, [msg.slice(0, 500), id]);
    await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_ACCOUNT_CHECK_FAILED', `Conta Meta "${a.label}": ${msg.slice(0, 300)}`);
    return { ok: false, problem: msg, missing_scopes: [] as string[], phone_numbers: [] as any[], subscribed: false, account: publicAccount({ ...a, status: 'INVALID', last_error: msg }) };
  };
  let missing: string[] = [];
  try {
    // permissões do token (um token pode consultar a si mesmo)
    const dbg = await graphGet(a, token, `/debug_token?input_token=${encodeURIComponent(token)}`).catch(() => null);
    const scopes: string[] = Array.isArray(dbg?.data?.scopes) ? dbg.data.scopes.map(String) : [];
    if (dbg?.data && dbg.data.is_valid === false) return await fail('O token da Meta está inválido ou expirou. Gere um token novo do usuário do sistema.');
    if (scopes.length) missing = REQUIRED_SCOPES.filter(s => !scopes.includes(s));
    if (missing.length) return { ...(await fail(`Faltam permissões no token: ${missing.join(', ')}.`)), missing_scopes: missing };
    await graphGet(a, token, `/${encodeURIComponent(a.waba_id)}?fields=id,name`);
    const list = await graphGet(a, token, `/${encodeURIComponent(a.waba_id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
    const phones = (Array.isArray(list?.data) ? list.data : []).map((p: any) => ({
      phone_number_id: String(p.id),
      display_phone_number: p.display_phone_number ? String(p.display_phone_number) : null,
      verified_name: p.verified_name ? String(p.verified_name) : null,
      quality_rating: p.quality_rating ? String(p.quality_rating) : null
    }));
    let subscribed = false;
    if (opts.subscribe) {
      const s = await graphPost(a, token, `/${encodeURIComponent(a.waba_id)}/subscribed_apps`);
      subscribed = s?.success === true;
    }
    const r = await pool.query(
      `UPDATE whatsapp_cloud_accounts SET status = 'VERIFIED', last_error = NULL, last_check_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    await writeAuditLog(pool, userId, 'WHATSAPP_CLOUD_ACCOUNT_CHECKED', `Conta Meta "${a.label}" conferida: ${phones.length} número(s) na WABA${subscribed ? ', webhook assinado' : ''}.`);
    return { ok: true, problem: null, missing_scopes: [], phone_numbers: phones, subscribed, account: publicAccount(r.rows[0]) };
  } catch (err: any) {
    if (err instanceof ProviderError) return await fail(err.message);
    throw err;
  }
}

// ---------- números oficiais ----------

/** Cadastra um número oficial (phone_number_id de uma conta conferida). Nasce com o atendente desligado. */
export async function createCloudNumber(pool: Pool, body: any, userId: string | null) {
  const label = cleanLabel(body?.label);
  const accountId = String(body?.cloud_account_id || '');
  const a = await loadAccountRow(pool, accountId);
  if (a.status !== 'VERIFIED') throw new WhatsAppError(409, 'Confira a conta Meta antes de cadastrar o número.');
  const phoneNumberId = cleanMetaId(body?.phone_number_id, 'ID do número (phone_number_id)');
  const token = decryptOrFail(a.access_token_enc, 'o token');
  let info: any;
  try {
    const list = await graphGet(a, token, `/${encodeURIComponent(a.waba_id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
    info = (Array.isArray(list?.data) ? list.data : []).find((p: any) => String(p.id) === phoneNumberId);
  } catch (err: any) {
    if (err instanceof ProviderError) throw new WhatsAppError(502, err.message);
    throw err;
  }
  if (!info) throw new WhatsAppError(400, 'Este número não pertence à conta do WhatsApp Business cadastrada.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE whatsapp_numbers IN SHARE ROW EXCLUSIVE MODE');
    const c = await client.query('SELECT COUNT(*)::int AS n FROM whatsapp_numbers WHERE is_deleted = FALSE');
    if (c.rows[0].n >= MAX_NUMBERS) throw new WhatsAppError(409, `Limite de ${MAX_NUMBERS} números atingido.`);
    const dupe = await client.query('SELECT id FROM whatsapp_numbers WHERE phone_number_id = $1 AND is_deleted = FALSE', [phoneNumberId]);
    if (dupe.rows.length) throw new WhatsAppError(409, 'Este número já está cadastrado.');
    const r = await client.query(
      `INSERT INTO whatsapp_numbers
         (label, brand_id, instance_name, webhook_secret_hash, created_by, provider, cloud_account_id, phone_number_id,
          display_phone_number, verified_name, quality_rating, phone, profile_name, status, connected_at)
       VALUES ($1, $2, $3, $4, $5, 'META_CLOUD', $6, $7, $8, $9, $10, $11, $12, 'CONNECTED', NOW()) RETURNING *`,
      [
        label, a.brand_id, `cloud-${crypto.randomBytes(6).toString('hex')}`, sha256(crypto.randomBytes(32).toString('hex')), userId,
        a.id, phoneNumberId, info.display_phone_number || null, info.verified_name || null, info.quality_rating || null,
        digitsOf(info.display_phone_number) || null, info.verified_name || null
      ]
    );
    await writeAuditLog(client, userId, 'WHATSAPP_NUMBER_CREATED', `Número oficial "${label}" (${a.environment}, ${info.display_phone_number || phoneNumberId}) cadastrado (atendente desligado).`, null, r.rows[0].id, false, true);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** "Conferir número" de um número oficial: atualiza nome, qualidade e limite de envio. */
export async function checkCloudNumber(pool: Pool, n: any) {
  const a = await pool.query('SELECT * FROM whatsapp_cloud_accounts WHERE id = $1 AND is_deleted = FALSE', [n.cloud_account_id]);
  const acc = a.rows[0];
  if (!acc || acc.status === 'DISABLED') {
    await pool.query(`UPDATE whatsapp_numbers SET status = 'DISCONNECTED', status_reason = 'Conta Meta desativada ou excluída.', updated_at = NOW() WHERE id = $1`, [n.id]);
    return;
  }
  try {
    const token = decryptOrFail(acc.access_token_enc, 'o token');
    const info = await graphGet(acc, token, `/${encodeURIComponent(n.phone_number_id)}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier`);
    await pool.query(
      `UPDATE whatsapp_numbers SET status = CASE WHEN status = 'BANNED' THEN status ELSE 'CONNECTED' END, status_reason = CASE WHEN status = 'BANNED' THEN status_reason ELSE NULL END,
              display_phone_number = COALESCE($1, display_phone_number), verified_name = COALESCE($2, verified_name),
              quality_rating = COALESCE($3, quality_rating), messaging_limit = COALESCE($4, messaging_limit),
              phone = COALESCE($5, phone), profile_name = COALESCE($2, profile_name), updated_at = NOW()
       WHERE id = $6`,
      [info?.display_phone_number || null, info?.verified_name || null, info?.quality_rating || null, info?.messaging_limit_tier || null, digitsOf(info?.display_phone_number) || null, n.id]
    );
  } catch (err: any) {
    if (err instanceof ProviderError || err instanceof WhatsAppError) {
      await pool.query(`UPDATE whatsapp_numbers SET status = 'DISCONNECTED', status_reason = $1, updated_at = NOW() WHERE id = $2 AND status <> 'BANNED'`, [String(err.message).slice(0, 300), n.id]);
      return;
    }
    throw err;
  }
}

// ---------- motor por número ----------

async function applyCloudErrorEffect(pool: Pool, accountId: string, numberId: string, info: CloudErrorInfo) {
  if (info.effect === 'TOKEN_INVALID') {
    await pool.query(`UPDATE whatsapp_cloud_accounts SET status = 'INVALID', last_error = $1, updated_at = NOW() WHERE id = $2 AND status <> 'DISABLED'`, [info.message, accountId]);
    await pool.query(`UPDATE whatsapp_numbers SET status = 'DISCONNECTED', status_reason = $1, updated_at = NOW() WHERE cloud_account_id = $2 AND status <> 'BANNED'`, [info.message, accountId]);
    await writeAuditLog(pool, null, 'WHATSAPP_CLOUD_TOKEN_INVALID', info.message);
  } else if (info.effect === 'NUMBER_BANNED') {
    await pool.query(`UPDATE whatsapp_numbers SET status = 'BANNED', status_reason = $1, bot_enabled = FALSE, updated_at = NOW() WHERE id = $2`, [info.message, numberId]);
    await writeAuditLog(pool, null, 'WHATSAPP_BANNED', info.message, null, 'BANNED');
  }
}

/** Motor de um número: oficial (pela conta dele) ou Evolution (só se WHATSAPP_EVOLUTION_ENABLED). Null = sem motor. */
export async function providerForNumber(pool: Pool, n: CloudNumberRow): Promise<WhatsAppProvider | null> {
  if (n.provider !== 'META_CLOUD') return getWhatsAppProvider();
  if (!n.cloud_account_id || !n.phone_number_id) return null;
  const r = await pool.query('SELECT * FROM whatsapp_cloud_accounts WHERE id = $1 AND is_deleted = FALSE', [n.cloud_account_id]);
  const a = r.rows[0];
  if (!a || a.status === 'DISABLED') return null;
  let token: string;
  try {
    token = openSecret(a.access_token_enc);
  } catch (err: any) {
    console.warn('[WhatsApp oficial] token ilegível:', err?.message || err);
    return null;
  }
  return new MetaCloudProvider({
    accountId: a.id,
    environment: a.environment,
    phoneNumberId: n.phone_number_id,
    accessToken: token,
    graphVersion: a.graph_api_version,
    testRecipients: a.test_recipients || [],
    onError: info => applyCloudErrorEffect(pool, a.id, n.id, info)
  });
}

/** Erro do motor oficial → erro com mensagem clara para a tela. */
export function cloudErrorToWhatsApp(err: any): WhatsAppError | null {
  if (err instanceof SendBlockedError) return new WhatsAppError(409, err.message);
  if (err instanceof CloudApiError) return new WhatsAppError(err.status === 422 ? 422 : 502, err.message);
  return null;
}

/** Para o webhook: conta + App Secret aberto + hash do verify token. */
export async function loadAccountForWebhook(pool: Pool, accountId: string): Promise<{ account: any; appSecret: string } | null> {
  if (!UUID_RE.test(String(accountId))) return null;
  const r = await pool.query('SELECT * FROM whatsapp_cloud_accounts WHERE id = $1 AND is_deleted = FALSE', [accountId]);
  const a = r.rows[0];
  if (!a) return null;
  try {
    return { account: a, appSecret: openSecret(a.app_secret_enc) };
  } catch {
    return null;
  }
}
