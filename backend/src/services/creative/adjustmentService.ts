import crypto from 'crypto';
import { Pool } from 'pg';
import { CreativeFactoryService, CreativeFactoryError } from './creativeFactoryService';
import { writeAuditLog } from '../../db/audit';

// NORQVA-0013: "Pedir ajuste" → tracked task → fires a Claude Code routine (API trigger).
// The routine reads the task through the automation API (token-protected), produces a new DRAFT
// version and reports back. It never approves, publishes to Meta or changes prices/claims.

export const ADJUSTMENT_STATUSES = ['QUEUED', 'NOT_CONFIGURED', 'DISPATCHED', 'IN_PROGRESS', 'DONE', 'NEEDS_INPUT', 'FAILED'] as const;
export const AUTOMATION_REPORTABLE = ['IN_PROGRESS', 'DONE', 'NEEDS_INPUT', 'FAILED'] as const;

export type RoutineFirer = (text: string) => Promise<{ ok: boolean; sessionUrl?: string | null; error?: string }>;

export function routineConfigured(): boolean {
  return !!(process.env.CLAUDE_ROUTINE_FIRE_URL && process.env.CLAUDE_ROUTINE_TOKEN);
}

/** Default firer: POST to the routine's /fire endpoint (Claude Code routines API trigger). */
export const defaultRoutineFirer: RoutineFirer = async (text) => {
  const url = process.env.CLAUDE_ROUTINE_FIRE_URL;
  const token = process.env.CLAUDE_ROUTINE_TOKEN;
  if (!url || !token) return { ok: false, error: 'NOT_CONFIGURED' };
  if (!/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_-]+\/fire$/.test(url)) {
    return { ok: false, error: 'CLAUDE_ROUTINE_FIRE_URL inválida' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': process.env.CLAUDE_ROUTINE_BETA || 'experimental-cc-routine-2026-04-01',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text.slice(0, 60000) }),
      signal: controller.signal
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}${data?.error?.message ? `: ${data.error.message}` : ''}` };
    return { ok: true, sessionUrl: data?.claude_code_session_url || null };
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || 'erro') };
  } finally {
    clearTimeout(timer);
  }
};

/** Constant-time check of the automation token sent by the routine. */
export function automationTokenValid(provided: unknown): boolean {
  const expected = process.env.NORQVA_AUTOMATION_TOKEN || '';
  if (!expected || expected.length < 24 || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export class AdjustmentService {
  constructor(private firer: RoutineFirer = defaultRoutineFirer, private factory = new CreativeFactoryService()) {}

  async create(
    pool: Pool,
    input: { creativeId: string; reviewId: string | null; requestText: string; userId: string | null; isDemo: boolean }
  ) {
    const r = await pool.query(
      `INSERT INTO creative_adjustments (creative_id, review_id, request_text, requested_by, is_demo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.creativeId, input.reviewId, input.requestText, input.userId, input.isDemo]
    );
    const adj = r.rows[0];
    return this.dispatch(pool, adj.id, input.isDemo);
  }

  /** Fire the routine for a task. Demo tasks are never dispatched. */
  async dispatch(pool: Pool, adjustmentId: string, isDemo: boolean) {
    const cur = await this.get(pool, adjustmentId, isDemo);
    if (!cur) throw new CreativeFactoryError(404, 'Ajuste não encontrado.');
    if (isDemo || !routineConfigured()) {
      return this.setStatus(pool, adjustmentId, 'NOT_CONFIGURED', isDemo ? 'Modo demonstração: não enviado ao Claude.' : 'Automação não configurada (CLAUDE_ROUTINE_FIRE_URL / CLAUDE_ROUTINE_TOKEN).');
    }
    const apiBase = (process.env.NORQVA_PUBLIC_API_URL || 'https://norqva-staging-api.onrender.com').replace(/\/+$/, '');
    const text = [
      'NORQVA_ADJUSTMENT_TASK',
      `adjustment_id: ${cur.id}`,
      `creative_key: ${cur.creative_human_id}`,
      `request: ${cur.request_text}`,
      `api_base: ${apiBase}`
    ].join('\n');
    const fired = await this.firer(text);
    if (!fired.ok) {
      return this.setStatus(pool, adjustmentId, 'FAILED', `Não consegui acionar o Claude: ${fired.error || 'erro'}`);
    }
    await pool.query(
      `UPDATE creative_adjustments SET status = 'DISPATCHED', session_url = $1, dispatched_at = NOW(), updated_at = NOW(), response = NULL WHERE id = $2`,
      [fired.sessionUrl || null, adjustmentId]
    );
    await writeAuditLog(pool, null, 'CREATIVE_ADJUSTMENT_DISPATCHED', `Ajuste ${cur.creative_human_id} enviado ao Claude`, null, fired.sessionUrl || null, isDemo).catch(() => {});
    return this.get(pool, adjustmentId, isDemo);
  }

  async get(pool: Pool, adjustmentId: string, isDemo: boolean) {
    const r = await pool.query(
      `SELECT a.*, c.human_id AS creative_human_id, rc.human_id AS result_human_id
       FROM creative_adjustments a
       JOIN creatives c ON c.id = a.creative_id
       LEFT JOIN creatives rc ON rc.id = a.result_creative_id
       WHERE a.id = $1 AND a.is_demo = $2`,
      [adjustmentId, isDemo]
    );
    return r.rows[0] || null;
  }

  async list(pool: Pool, isDemo: boolean) {
    const r = await pool.query(
      `SELECT a.*, c.human_id AS creative_human_id, rc.human_id AS result_human_id
       FROM creative_adjustments a
       JOIN creatives c ON c.id = a.creative_id
       LEFT JOIN creatives rc ON rc.id = a.result_creative_id
       WHERE a.is_demo = $1
       ORDER BY a.created_at DESC LIMIT 100`,
      [isDemo]
    );
    return r.rows;
  }

  async setStatus(pool: Pool, adjustmentId: string, status: string, response: string | null) {
    if (!(ADJUSTMENT_STATUSES as readonly string[]).includes(status)) throw new CreativeFactoryError(400, 'Status inválido.');
    const done = status === 'DONE' || status === 'FAILED' || status === 'NEEDS_INPUT';
    const r = await pool.query(
      `UPDATE creative_adjustments SET status = $1, response = COALESCE($2, response), updated_at = NOW(),
              completed_at = CASE WHEN $3 THEN NOW() ELSE completed_at END
       WHERE id = $4 RETURNING *`,
      [status, response ? String(response).slice(0, 4000) : null, done, adjustmentId]
    );
    if (r.rows.length === 0) throw new CreativeFactoryError(404, 'Ajuste não encontrado.');
    return r.rows[0];
  }

  /** Details the routine needs to do the work. */
  async taskForAutomation(pool: Pool, adjustmentId: string) {
    const r = await pool.query(
      `SELECT a.id, a.status, a.request_text, a.is_demo, c.id AS creative_id, c.human_id, c.batch_code, c.hook, c.mechanism,
              c.headline, c.primary_text, c.cta, c.script, c.format, c.duration_seconds, c.file_url, c.version, c.approval_status
       FROM creative_adjustments a JOIN creatives c ON c.id = a.creative_id WHERE a.id = $1`,
      [adjustmentId]
    );
    if (r.rows.length === 0) throw new CreativeFactoryError(404, 'Ajuste não encontrado.');
    const t = r.rows[0];
    const claims = await pool.query(
      `SELECT cr.human_id, cr.claim_text, cr.status FROM creative_claims cc JOIN claims_registry cr ON cr.id = cc.claim_id WHERE cc.creative_id = $1`,
      [t.creative_id]
    );
    return { ...t, claims: claims.rows };
  }

  async reportFromAutomation(pool: Pool, adjustmentId: string, status: string, response: string | null) {
    if (!(AUTOMATION_REPORTABLE as readonly string[]).includes(status)) throw new CreativeFactoryError(400, 'Status inválido.');
    return this.setStatus(pool, adjustmentId, status, response);
  }

  /** The routine delivers the result as a NEW DRAFT version (never approves or publishes). */
  async deliverVersion(
    pool: Pool,
    adjustmentId: string,
    changes: { hook?: string; primary_text?: string; headline?: string; cta?: string; script?: string; file_url?: string | null },
    summary: string | null
  ) {
    const t = await this.taskForAutomation(pool, adjustmentId);
    const clean: any = {};
    for (const k of ['hook', 'primary_text', 'headline', 'cta', 'script', 'file_url']) {
      if ((changes as any)[k] !== undefined && (changes as any)[k] !== null && String((changes as any)[k]).trim() !== '') clean[k] = String((changes as any)[k]);
    }
    if (Object.keys(clean).length === 0) throw new CreativeFactoryError(400, 'Nenhuma alteração enviada.');
    const result: any = await this.factory.reviseCreative(pool, t.creative_id, clean, null, t.is_demo, { forceNewVersion: true });
    const newId = result?.creative?.id || null;
    await pool.query(
      `UPDATE creative_adjustments SET status = 'DONE', result_creative_id = $1, response = COALESCE($2, response),
              completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [newId, summary ? String(summary).slice(0, 4000) : null, adjustmentId]
    );
    await writeAuditLog(pool, null, 'CREATIVE_ADJUSTMENT_DELIVERED', `Ajuste de ${t.human_id} entregue como ${result?.creative?.human_id}`, t.human_id, result?.creative?.human_id || null, t.is_demo).catch(() => {});
    return { adjustment_id: adjustmentId, new_version: result?.creative || null };
  }
}
