import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { ExperimentGuardService, autopauseEnabled, guardEnabled, GUARD_INTERVAL_MIN } from '../services/experiments/experimentGuardService';
import { LaunchPlanService, LaunchPlanError } from '../services/launchPlans/launchPlanService';
import { automationTokenValid } from '../services/creative/adjustmentService';
import { beginDecision, decisionContextFromRequest, DecisionAuditError, metaIdsOfPlan } from '../db/decisionEvents';
import { MetaMutatingSecurityContext } from '../services/meta/metaMutatingClient';

// H6/H7/H8 — vigia do teto do experimento e limite de gastos da campanha (R-0019-01).

let guard = new ExperimentGuardService();
export function setExperimentGuardForTesting(g: ExperimentGuardService | null) {
  guard = g || new ExperimentGuardService();
}
const plans = new LaunchPlanService();
const money = (v: unknown) => Math.round(Number(v) * 100) / 100;

/** GET /api/launch-plans/:id/guard (ADMIN): estado do teto do plano. */
export async function getPlanGuard(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const p: any = await plans.get(pool, String(req.params.id));
    const cap = parseFloat(p.max_spend_brl);
    const spent = p.spent_brl_last !== null && p.spent_brl_last !== undefined ? parseFloat(p.spent_brl_last) : null;
    return res.status(200).json({
      code: p.code,
      status: p.status,
      cap_brl: cap,
      spent_brl: spent,
      pct: spent !== null && cap > 0 ? Math.round((spent / cap) * 1000) / 10 : null,
      spent_checked_at: p.spent_checked_at,
      guard_state: p.guard_state,
      guard_note: p.guard_note,
      capped_at: p.capped_at,
      cap_alerts_sent: p.cap_alerts_sent,
      spend_cap: { applied_brl: p.spend_cap_applied_brl !== null && p.spend_cap_applied_brl !== undefined ? parseFloat(p.spend_cap_applied_brl) : null, status: p.spend_cap_status, error: p.spend_cap_error, applied_at: p.spend_cap_applied_at },
      guard: { enabled: guardEnabled(), autopause: autopauseEnabled(), interval_min: GUARD_INTERVAL_MIN() }
    });
  } catch (err: any) {
    if (err instanceof LaunchPlanError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Falha ao ler o estado do teto.' });
  }
}

/**
 * POST /api/launch-plans/:id/spend-cap (ADMIN) { max_spend_brl }.
 * Só REDUZ (ou reaplica) o teto: aumentar exige confirmação forte (H3). Atualiza o teto do plano e o
 * capital aprovado do experimento, aplica o spend_cap na campanha (H8) e roda o vigia na hora (H6/H7).
 * Registro em decision_events (fail-closed).
 */
export async function setPlanSpendCap(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  const id = String(req.params.id);
  let plan: any;
  try {
    plan = await plans.get(pool, id);
  } catch (err: any) {
    if (err instanceof LaunchPlanError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Falha ao ler o plano.' });
  }
  const newCap = money(req.body?.max_spend_brl);
  const current = parseFloat(plan.max_spend_brl);
  let handle;
  try {
    handle = await beginDecision(pool, decisionContextFromRequest(req as any), {
      action: 'LAUNCH_PLAN_SPEND_CAP',
      decision: `CAP:${Number.isFinite(newCap) ? newCap : 'invalid'}`,
      planId: plan.id,
      planCode: plan.code,
      metaIds: metaIdsOfPlan(plan.meta_ids)
    });
  } catch (err) {
    if (err instanceof DecisionAuditError) return res.status(503).json({ error: err.message });
    throw err;
  }
  const reject = async (status: number, error: string) => {
    await handle.finish('REJECTED', { result: { http_status: status }, error });
    return res.status(status).json({ error });
  };
  if (!Number.isFinite(newCap) || newCap <= 0) return reject(400, 'Informe o novo teto em reais (max_spend_brl).');
  if (newCap > current + 0.001) return reject(409, `Aumentar o teto (de R$ ${current.toFixed(2)} para R$ ${newCap.toFixed(2)}) exige confirmação forte (H3). Só é possível reduzir agora.`);
  try {
    await pool.query(`UPDATE launch_plans SET max_spend_brl = $2, cap_alerts_sent = '{}'::jsonb, updated_at = NOW() WHERE id = $1`, [plan.id, newCap]);
    if (plan.experiment_id) {
      // capital_used <= capital_approved (CHECK): nunca abaixo do capital já reservado
      await pool.query(`UPDATE experiments SET capital_approved = GREATEST($2::numeric, capital_used) WHERE id = $1`, [plan.experiment_id, newCap]);
    }
    const updated: any = await plans.get(pool, id);
    const ctx: MetaMutatingSecurityContext = { userId: req.user?.id || '', userRole: 'ADMIN', isDemo: false };
    const spendCap = ExperimentGuardService.campaignOf(updated) ? await guard.applySpendCap(pool, updated, ctx) : { status: 'SKIPPED', error: 'Plano ainda sem campanha na Meta.' };
    const guardRun = ['ACTIVE', 'APPROVED'].includes(updated.status) ? await guard.run(pool, { planId: updated.id }) : null;
    const result = { code: updated.code, previous_cap_brl: current, cap_brl: newCap, spend_cap: spendCap, guard: guardRun?.plans?.[0] ?? null };
    const recorded = await handle.finish('EXECUTED', { result });
    return res.status(200).json(recorded ? result : { ...result, audit_incomplete: true });
  } catch (err: any) {
    await handle.finish('FAILED', { error: err });
    console.error('[EXPERIMENT GUARD] spend cap change failed', err?.message);
    return res.status(500).json({ error: 'Falha ao alterar o teto.' });
  }
}

/** POST /api/launch-plans/guard/run (ADMIN): roda o vigia agora. */
export async function runGuardNow(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    return res.status(200).json(await guard.run(pool));
  } catch (err: any) {
    console.error('[EXPERIMENT GUARD] manual run failed', err?.message);
    return res.status(500).json({ error: 'Falha ao rodar o vigia do teto.' });
  }
}

/** POST /api/automation/experiment-guard/run (token de automação): só lê, alerta e pausa objetos do plano. */
export async function automationRunGuard(req: Request, res: Response) {
  if (!automationTokenValid(req.header('x-norqva-automation-token'))) return res.status(401).json({ error: 'Token de automação inválido.' });
  try {
    return res.status(200).json(await guard.run(req.app.get('db')));
  } catch (err: any) {
    console.error('[EXPERIMENT GUARD] automation run failed', err?.message);
    return res.status(500).json({ error: 'Falha ao rodar o vigia do teto.' });
  }
}
