import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { writeAuditLog } from './audit';

/**
 * H1 — registro forense e imutável das decisões (tabela decision_events, migration 039).
 *
 * Fluxo de cada decisão:
 *   1. beginDecision() grava REQUESTED ANTES de qualquer execução. Se a gravação falhar, lança
 *      DecisionAuditError e o chamador NÃO executa nada (fail-closed: nenhuma ação sem rastro).
 *   2. finish() grava o resultado (EXECUTED | REJECTED | FAILED). A ação pode já ter acontecido na
 *      Meta, então uma falha aqui não desfaz nada: o evento higienizado vai para o log do servidor
 *      (console.error), para audit_logs (DECISION_AUDIT_RESULT_WRITE_FAILED, melhor esforço) e o
 *      retorno false permite ao chamador avisar na resposta (audit_incomplete). Nunca é silencioso.
 *
 * Nunca grava token, cookie, cabeçalho Authorization, senha ou segredo: o token só é lido em memória
 * para extrair o claim session_id, e tudo que vai para result/error passa por sanitizeForAudit.
 */

export type ActorType = 'HUMAN' | 'AUTOMATION' | 'SYSTEM';
export type DecisionPhase = 'REQUESTED' | 'EXECUTED' | 'REJECTED' | 'FAILED';

export interface DecisionContext {
  userId: string | null;
  userEmail: string | null;
  actorType: ActorType;
  sessionId: string | null;
  ip: string | null;
  userAgent: string | null;
  isDemo: boolean;
}

export interface DecisionRequest {
  action: string;
  decision?: string | null;
  planId?: string | null;
  planCode?: string | null;
  metaIds?: string[];
}

export class DecisionAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionAuditError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_KEY_RE = /(token|secret|password|passwd|authorization|cookie|api[_-]?key|access[_-]?key|private[_-]?key|signature|credential)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /\bEAA[A-Za-z0-9]{20,}/g, // token de acesso da Meta
  /(access_token|refresh_token|client_secret|api_key|apikey|password)=([^&\s"']+)/gi,
  /\$aact_[A-Za-z0-9_\-=.]+/g, // chave Asaas
  /\b(sk|rk)_(live|test)_[A-Za-z0-9]{10,}/g
];
const MAX_TEXT = 2000;
const MAX_JSON = 20000;

const clean = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return null;
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** Remove segredos de texto livre (mensagens de erro, descrições). */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(re, (m, k) => (typeof k === 'string' && m.includes('=') ? `${k}=[REDACTED]` : '[REDACTED]'));
  }
  return out;
}

/** Cópia profunda higienizada: chaves sensíveis viram [REDACTED], textos passam por redactSecrets. */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 8) return '[TRUNCATED]';
  if (typeof value === 'string') return redactSecrets(value).slice(0, MAX_TEXT);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => sanitizeForAudit(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : sanitizeForAudit(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, MAX_TEXT);
}

function boundedJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const json = JSON.stringify(sanitizeForAudit(value));
  if (json.length <= MAX_JSON) return json;
  return JSON.stringify({ truncated: true, preview: json.slice(0, MAX_JSON - 200) });
}

/** Lê o claim session_id do JWT já verificado pelo middleware. O token em si nunca é guardado. */
function sessionIdFromAuthorization(header: string | undefined): string | null {
  if (!header || !header.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const sid = payload?.session_id;
    return typeof sid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sid) ? sid : null;
  } catch {
    return null;
  }
}

function normalizeIp(raw: unknown): string | null {
  const s = clean(raw, 64);
  if (!s) return null;
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

interface RequestLike {
  user?: { id?: string | null; email?: string | null } | null;
  ip?: string;
  query?: any;
  header(name: string): string | undefined;
}

/** Contexto de quem pede a decisão, a partir da requisição já autenticada. */
export function decisionContextFromRequest(req: RequestLike): DecisionContext {
  const automation = Boolean(req.header('x-norqva-automation-token'));
  const user = req.user || null;
  return {
    userId: user?.id && UUID_RE.test(String(user.id)) ? String(user.id) : null,
    userEmail: clean(user?.email, 255),
    actorType: automation ? 'AUTOMATION' : user ? 'HUMAN' : 'SYSTEM',
    sessionId: sessionIdFromAuthorization(req.header('authorization')),
    ip: normalizeIp(req.ip),
    userAgent: clean(req.header('user-agent'), 512),
    isDemo: req.query?.mode === 'demo'
  };
}

const uniqIds = (ids: unknown): string[] =>
  Array.from(new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)))).slice(0, 100);

/** IDs Meta de um plano (campanha, conjuntos, anúncios, criativos, vídeos), sem duplicatas. */
export function metaIdsOfPlan(metaIds: unknown): string[] {
  if (!metaIds || typeof metaIds !== 'object') return [];
  const out: string[] = [];
  for (const group of Object.values(metaIds as Record<string, unknown>)) {
    if (group && typeof group === 'object') out.push(...Object.values(group as Record<string, unknown>).map(String));
  }
  return uniqIds(out);
}

type Db = Pool | PoolClient;

async function insertEvent(
  db: Db,
  correlationId: string,
  phase: DecisionPhase,
  ctx: DecisionContext,
  req: DecisionRequest,
  extra: { metaIds?: string[]; result?: unknown; error?: unknown; decision?: string | null } = {}
): Promise<void> {
  await db.query(
    `INSERT INTO decision_events
       (correlation_id, phase, action, decision, plan_id, plan_code, user_id, user_email, actor_type,
        session_id, ip, user_agent, meta_ids, result, error, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16)`,
    [
      correlationId,
      phase,
      clean(req.action, 60),
      clean(extra.decision ?? req.decision ?? null, 60),
      req.planId && UUID_RE.test(req.planId) ? req.planId : null,
      clean(req.planCode, 60),
      ctx.userId,
      ctx.userEmail,
      ctx.actorType,
      ctx.sessionId,
      ctx.ip,
      ctx.userAgent,
      JSON.stringify(uniqIds(extra.metaIds ?? req.metaIds ?? [])),
      boundedJson(extra.result),
      extra.error === undefined || extra.error === null ? null : redactSecrets(String((extra.error as any)?.message ?? extra.error)).slice(0, MAX_TEXT),
      ctx.isDemo
    ]
  );
}

export interface DecisionHandle {
  correlationId: string;
  /** Grava o resultado. Retorna false (sem lançar) se a gravação falhar; ver cabeçalho do módulo. */
  finish(
    phase: Exclude<DecisionPhase, 'REQUESTED'>,
    extra?: { metaIds?: string[]; result?: unknown; error?: unknown; decision?: string | null }
  ): Promise<boolean>;
}

/**
 * Grava REQUESTED. Lança DecisionAuditError se não conseguir: o chamador deve responder 503 e
 * não executar a decisão.
 */
export async function beginDecision(db: Db, ctx: DecisionContext, req: DecisionRequest): Promise<DecisionHandle> {
  const correlationId = crypto.randomUUID();
  try {
    await insertEvent(db, correlationId, 'REQUESTED', ctx, req);
  } catch (err: any) {
    console.error('[DECISION AUDIT] REQUESTED write failed — decision blocked (fail-closed):', redactSecrets(String(err?.message || err)));
    throw new DecisionAuditError('Auditoria de decisões indisponível. Nada foi executado.');
  }
  return {
    correlationId,
    async finish(phase, extra = {}) {
      try {
        await insertEvent(db, correlationId, phase, ctx, req, extra);
        return true;
      } catch (err: any) {
        const summary = {
          correlationId,
          phase,
          action: req.action,
          planId: req.planId || null,
          userId: ctx.userId,
          actorType: ctx.actorType,
          metaIds: uniqIds(extra.metaIds ?? req.metaIds ?? [])
        };
        console.error('[DECISION AUDIT] result write failed — action may have run; event kept in server log:', JSON.stringify(summary), redactSecrets(String(err?.message || err)));
        try {
          await writeAuditLog(db, ctx.userId, 'DECISION_AUDIT_RESULT_WRITE_FAILED', `Falha ao gravar o resultado ${phase} da decisão ${req.action} (${correlationId}).`, null, JSON.stringify(summary), ctx.isDemo, true);
        } catch {
          /* o log do servidor acima continua sendo o rastro */
        }
        return false;
      }
    }
  };
}

/** Expurgo LGPD de IP/user-agent (função SQL da migration 039). Sem efeito no pg-mem. */
export async function purgeDecisionEventPii(db: Db, retentionDays = 180): Promise<number | null> {
  try {
    const r = await db.query('SELECT purge_decision_event_pii($1) AS n', [retentionDays]);
    return Number(r.rows[0]?.n ?? 0);
  } catch (err: any) {
    console.warn('[DECISION AUDIT] PII retention purge unavailable:', redactSecrets(String(err?.message || err)));
    return null;
  }
}

export async function listDecisionEvents(db: Db, filter: { planId?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 500);
  if (filter.planId) {
    if (!UUID_RE.test(filter.planId)) return [];
    return (await db.query('SELECT * FROM decision_events WHERE plan_id = $1 ORDER BY created_at DESC LIMIT $2', [filter.planId, limit])).rows;
  }
  return (await db.query('SELECT * FROM decision_events ORDER BY created_at DESC LIMIT $1', [limit])).rows;
}
