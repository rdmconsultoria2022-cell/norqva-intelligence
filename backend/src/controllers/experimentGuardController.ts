import { Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from '../middleware/auth';
import { ExperimentGuardService, autopauseEnabled, guardEnabled, GUARD_INTERVAL_MIN, ceilingOf, initialCapOf, planNetRevenue, profitExtendEnabled, PROFIT_MIN_SALES } from '../services/experiments/experimentGuardService';
import { LaunchPlanService, LaunchPlanError, refreshQuestionText } from '../services/launchPlans/launchPlanService';
import { CampaignEditorService } from '../services/launchPlans/campaignEditorService';
import { writeAuditLog } from '../db/audit';
import { automationTokenValid } from '../services/creative/adjustmentService';
import { beginDecision, decisionContextFromRequest, DecisionAuditError, metaIdsOfPlan } from '../db/decisionEvents';
import { MetaMutatingSecurityContext } from '../services/meta/metaMutatingClient';

// H6/H7/H8 — vigia do teto do experimento e limite de gastos da campanha (R-0019-01).

let guard = new ExperimentGuardService();
export function setExperimentGuardForTesting(g: ExperimentGuardService | null) {
  guard = g || new ExperimentGuardService();
}
const plans = new LaunchPlanService();
const editor = new CampaignEditorService();
const MAX_CAP_BRL = 100000;
const money = (v: unknown) => Math.round(Number(v) * 100) / 100;

/** GET /api/launch-plans/:id/guard (ADMIN): estado do teto do plano. */
export async function getPlanGuard(req: AuthenticatedRequest, res: Response) {
  const pool: Pool = req.app.get('db');
  try {
    const p: any = await plans.get(pool, String(req.params.id));
    const cap = parseFloat(p.max_spend_brl);
    const spent = p.spent_brl_last !== null && p.spent_brl_last !== undefined ? parseFloat(p.spent_brl_last) : null;
    // NORQVA-0052: lucro da campanha (vendas pagas confirmadas pelo Asaas, já sem taxas) contra o último gasto lido
    const sales = await planNetRevenue(pool, p.code, null).catch(() => null);
    return res.status(200).json({
      ceiling_brl: ceilingOf(p),
      ceiling_is_default: !(p.max_spend_ceiling_brl !== null && p.max_spend_ceiling_brl !== undefined && parseFloat(p.max_spend_ceiling_brl) > 0),
      initial_cap_brl: initialCapOf(p),
      profit_extend_enabled: p.profit_extend_enabled !== false && profitExtendEnabled(),
      profit_extend_plan: p.profit_extend_enabled !== false,
      cap_extensions: Number(p.cap_extensions) || 0,
      profit: sales ? { sales: sales.sales, net_brl: sales.net, spent_brl: spent, min_sales: PROFIT_MIN_SALES, profitable_lifetime: spent !== null && sales.sales >= PROFIT_MIN_SALES && sales.net > spent } : null,
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
 * POST /api/launch-plans/:id/spend-cap (ADMIN)
 * { max_spend_brl, max_spend_ceiling_brl?, profit_extend_enabled?, confirm_code?, justification? }.
 * NORQVA-0052 (D-0052): edita o teto em qualquer situação da campanha.
 * - Baixar o teto (ou desligar a extensão por lucro) salva na hora.
 * - Subir o teto ou o teto máximo, ou religar a extensão por lucro, depois do Sim do operador, exige o código
 *   do plano e um motivo curto (substitui a antiga trava H3 do capital aprovado na ativação).
 * - Rascunho: grava como edição manual do rascunho (nada gasta antes do Sim).
 * - A pergunta de ativação passa a mostrar o teto novo.
 * - Plano parado no teto (CAPPED) com teto novo acima do gasto volta a ser vigiado; reativar continua com o operador.
 * Aplica o spend_cap na campanha (H8), roda o vigia (H6/H7) e registra em decision_events (fail-closed) e na auditoria.
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
  const body = req.body || {};
  const newCap = money(body.max_spend_brl);
  const current = parseFloat(plan.max_spend_brl);
  const hasCeiling = body.max_spend_ceiling_brl !== undefined && body.max_spend_ceiling_brl !== null && body.max_spend_ceiling_brl !== '';
  const ceilingIn = hasCeiling ? money(body.max_spend_ceiling_brl) : null;
  const profitIn = typeof body.profit_extend_enabled === 'boolean' ? body.profit_extend_enabled : null;
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
  if (!Number.isFinite(newCap) || newCap <= 0 || newCap > MAX_CAP_BRL) return reject(400, 'Informe o novo teto em reais (max_spend_brl).');
  if (hasCeiling && (!Number.isFinite(ceilingIn as number) || (ceilingIn as number) <= 0 || (ceilingIn as number) > MAX_CAP_BRL)) {
    return reject(400, 'Informe o teto máximo em reais (max_spend_ceiling_brl).');
  }
  if (hasCeiling && (ceilingIn as number) + 0.001 < newCap) return reject(400, 'O teto máximo não pode ser menor que o teto.');

  const oldCeiling = ceilingOf(plan);
  const oldProfit = plan.profit_extend_enabled !== false;
  // Teto acima do teto máximo: o teto máximo sobe junto (o operador confirmou o valor)
  const storedCeiling = hasCeiling ? (ceilingIn as number) : plan.max_spend_ceiling_brl !== null && plan.max_spend_ceiling_brl !== undefined ? parseFloat(plan.max_spend_ceiling_brl) : null;
  let nextCeilingStored = storedCeiling;
  const projected = ceilingOf({ ...plan, max_spend_brl: newCap, max_spend_ceiling_brl: storedCeiling });
  if (newCap > projected + 0.001) nextCeilingStored = newCap;
  const newCeiling = ceilingOf({ ...plan, max_spend_brl: newCap, max_spend_ceiling_brl: nextCeilingStored });
  const newProfit = profitIn === null ? oldProfit : profitIn;

  const answered = !!plan.experiment_id || ['APPROVED', 'ACTIVE'].includes(plan.status);
  const raising = newCap > current + 0.001 || newCeiling > oldCeiling + 0.001 || (newProfit && !oldProfit);
  let raise: { justification: string } | null = null;
  if (raising && answered) {
    if (String(body.confirm_code || '').trim().toUpperCase() !== String(plan.code).toUpperCase()) {
      return reject(400, `Para aumentar o teto, digite o código da campanha (${plan.code}).`);
    }
    const justification = String(body.justification || '').trim();
    if (justification.length < 10) return reject(400, 'Para aumentar o teto, escreva o motivo (mínimo 10 caracteres).');
    raise = { justification: justification.slice(0, 1000) };
  }

  try {
    let draft = false;
    if (['DRAFT', 'FAILED'].includes(plan.status) && !ExperimentGuardService.campaignOf(plan) && Math.abs(newCap - current) > 0.001) {
      // Rascunho: mesma validação e marcação manual da tela de configuração
      await editor.saveFields(pool, plan.id, { max_spend_brl: newCap }, req.user?.id || null);
      draft = true;
    }
    const spent = plan.spent_brl_last !== null && plan.spent_brl_last !== undefined ? parseFloat(plan.spent_brl_last) : null;
    const uncap = plan.guard_state === 'CAPPED' && newCap > current + 0.001 && (spent === null || newCap > spent + 0.001);
    const capChanged = Math.abs(newCap - current) > 0.001;
    await pool.query(
      `UPDATE launch_plans SET max_spend_brl = $2, max_spend_ceiling_brl = $3, profit_extend_enabled = $4,
              question_text = $5,
              cap_alerts_sent = CASE WHEN $6::boolean THEN '{}'::jsonb ELSE cap_alerts_sent END,
              guard_state = CASE WHEN $7::boolean THEN 'WATCHING' ELSE guard_state END,
              capped_at = CASE WHEN $7::boolean THEN NULL ELSE capped_at END,
              guard_note = CASE WHEN $7::boolean THEN $8 ELSE guard_note END,
              updated_at = NOW()
       WHERE id = $1`,
      [
        plan.id,
        newCap,
        nextCeilingStored,
        newProfit,
        capChanged && !draft ? refreshQuestionText(plan.question_text, newCap) : draft ? (await plans.get(pool, plan.id) as any).question_text : plan.question_text,
        capChanged,
        uncap,
        `Teto aumentado para R$ ${newCap.toFixed(2)}: o vigia voltou a acompanhar. A campanha continua pausada até você reativar.`
      ]
    );
    if (plan.experiment_id && capChanged) {
      // capital_used <= capital_approved (CHECK): nunca abaixo do capital já reservado
      await pool.query(`UPDATE experiments SET capital_approved = GREATEST($2::numeric, capital_used) WHERE id = $1`, [plan.experiment_id, newCap]);
    }
    const updated: any = await plans.get(pool, id);
    const ctx: MetaMutatingSecurityContext = { userId: req.user?.id || '', userRole: 'ADMIN', isDemo: false };
    const spendCap = ExperimentGuardService.campaignOf(updated) ? await guard.applySpendCap(pool, updated, ctx) : { status: 'SKIPPED', error: 'Plano ainda sem campanha na Meta.' };
    const guardRun = ['ACTIVE', 'APPROVED'].includes(updated.status) ? await guard.run(pool, { planId: updated.id }) : null;
    const result = {
      code: updated.code,
      previous_cap_brl: current,
      cap_brl: newCap,
      previous_ceiling_brl: oldCeiling,
      ceiling_brl: newCeiling,
      profit_extend_enabled: newProfit,
      raise,
      uncapped: uncap,
      question_text: updated.question_text,
      spend_cap: spendCap,
      guard: guardRun?.plans?.[0] ?? null
    };
    await writeAuditLog(
      pool,
      req.user?.id || null,
      'LAUNCH_PLAN_CAP_CHANGED',
      `Plano ${plan.code}: teto R$ ${current.toFixed(2)} → R$ ${newCap.toFixed(2)}; teto máximo R$ ${oldCeiling.toFixed(2)} → R$ ${newCeiling.toFixed(2)}; extensão por lucro ${newProfit ? 'ligada' : 'desligada'}.${raise ? ` Motivo: ${raise.justification}` : ''}`,
      JSON.stringify({ cap: current, ceiling: oldCeiling, profit_extend_enabled: oldProfit }),
      JSON.stringify({ cap: newCap, ceiling: newCeiling, profit_extend_enabled: newProfit, justification: raise?.justification ?? null, by: req.user?.email ?? null }),
      false,
      false
    ).catch(() => {});
    const recorded = await handle.finish('EXECUTED', { result });
    return res.status(200).json(recorded ? result : { ...result, audit_incomplete: true });
  } catch (err: any) {
    await handle.finish('FAILED', { error: err });
    if (err instanceof LaunchPlanError) return res.status(err.status).json({ error: err.message });
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
