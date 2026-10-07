import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext } from '../meta/metaMutatingClient';
import { normalizeMetaIds } from '../launchPlans/launchPlanService';
import { beginDecision, DecisionContext } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';
import { AlertEmailSender, defaultAlertEmailSender } from '../alerts/adAlertService';
import { validateFrontendUrl } from '../emailConfig';
import { DEFAULT_PROTECTED_META_IDS, protectedMetaIds, metaSpendCapFor, minimumFromMetaError } from './protectedIds';

// H6/H7/H8 — teto real do experimento (R-0019-01).
// - H6: lê o gasto da campanha do plano na Meta (GET), abre alertas de 80/90/100% do teto (uma vez cada).
// - H7: pausa preventiva SÓ da campanha do plano quando gasto + projeção até a próxima leitura ≥ teto.
//   Autorizada pelo operador em 2026-10-07 ("Sim, pode pausar"). Desliga com EXPERIMENT_GUARD_AUTOPAUSE=false.
// - H8: limite de gastos da campanha (spend_cap) na Meta = teto do plano.
// Nunca toca IDs protegidos (CONTROL) nem IDs fora de launch_plans.meta_ids.

export { DEFAULT_PROTECTED_META_IDS, protectedMetaIds };

export const GUARD_INTERVAL_MIN = () => Math.min(Math.max(Number(process.env.EXPERIMENT_GUARD_INTERVAL_MIN) || 15, 5), 120);
export const PROJECTION_FACTOR = 1.75; // a Meta pode gastar até ~75% acima do orçamento diário num dia
export const autopauseEnabled = () => process.env.EXPERIMENT_GUARD_AUTOPAUSE !== 'false';
export const guardEnabled = () => process.env.EXPERIMENT_GUARD_ENABLED !== 'false';
const THRESHOLDS = [80, 90, 100] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SYSTEM_CTX: DecisionContext = { userId: null, userEmail: null, actorType: 'SYSTEM', sessionId: null, ip: null, userAgent: null, isDemo: false };

/** Pure decision for one reading. */
export function evaluateGuard(input: { spent: number; cap: number; dailyBudget: number; intervalMin: number; alertsSent: Record<string, any> }) {
  const projection = r2(input.dailyBudget * (input.intervalMin / 1440) * PROJECTION_FACTOR);
  const pct = input.cap > 0 ? (input.spent / input.cap) * 100 : 0;
  const newAlerts = THRESHOLDS.filter(t => pct >= t && !input.alertsSent[String(t)]);
  const shouldPause = input.spent + projection >= input.cap;
  return { projection, pct: Math.round(pct * 10) / 10, newAlerts, shouldPause };
}

export interface GuardClient {
  getCampaignLifetimeSpend(id: string): Promise<{ spend: number; effective_status: string | null; spend_cap: number | null }>;
  setEntityStatus: MetaMutatingClient['setEntityStatus'];
  setCampaignSpendCap: MetaMutatingClient['setCampaignSpendCap'];
}

export class ExperimentGuardService {
  constructor(private clientFactory: () => GuardClient = () => new MetaMutatingClient(), private sender: AlertEmailSender | null = defaultAlertEmailSender) {}

  static campaignOf(plan: any): string | null {
    const ids = normalizeMetaIds(plan.meta_ids);
    const values = Object.values(ids.campaign || {});
    return values.length ? String(values[0]) : null;
  }

  private async alert(pool: Pool, plan: any, campaignId: string, rule: string, spend: number, threshold: number, message: string) {
    const ins = await pool.query(
      `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, spend, threshold, message, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE) RETURNING id`,
      [rule, campaignId, plan.code, campaignId, plan.spec?.campaign?.name || plan.code, spend, threshold, message]
    );
    await this.email(pool, `NORQVA: ${plan.code} — ${message.split(':')[0]}`, message).then(ok => {
      if (ok) return pool.query(`UPDATE ad_alerts SET notified_at = NOW() WHERE id = $1`, [ins.rows[0].id]);
    }).catch(() => {});
  }

  private async email(pool: Pool, subject: string, message: string): Promise<boolean> {
    if (!this.sender) return false;
    const admins = await pool.query(`SELECT email FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' AND email IS NOT NULL`);
    const to = admins.rows.map(r => String(r.email)).filter(e => /@/.test(e) && !/\.test$/i.test(e));
    if (!to.length) return false;
    const front = validateFrontendUrl(process.env.FRONTEND_URL).url || 'https://norqva-intelligence-frontend.vercel.app';
    const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
    try {
      const r = await this.sender({
        to,
        subject,
        text: `${message}\n\nAbra o NORQVA: ${front}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#111"><p>${esc(message)}</p><p><a href="${esc(front)}">Abrir o NORQVA</a></p></div>`
      });
      return r.sent;
    } catch {
      return false;
    }
  }

  private async pause(pool: Pool, plan: any, campaignId: string, reason: string, numbers: Record<string, unknown>) {
    const handle = await beginDecision(pool, SYSTEM_CTX, { action: 'EXPERIMENT_GUARD_PAUSE', decision: 'CAMPAIGN:PAUSED', planId: plan.id, planCode: plan.code, metaIds: [campaignId] }, { riskReducing: true });
    try {
      const ctx = { userId: null as any, userRole: 'SYSTEM', isDemo: false } as MetaMutatingSecurityContext;
      const res = await this.clientFactory().setEntityStatus(pool, 'CAMPAIGN', campaignId, 'PAUSED', ctx);
      await handle.finish('EXECUTED', { result: { ...numbers, reason, meta: res } });
      await pool.query(
        `UPDATE launch_plans SET guard_state = 'CAPPED', capped_at = NOW(), guard_note = $2, updated_at = NOW() WHERE id = $1`,
        [plan.id, reason]
      );
      await writeAuditLog(pool, null, 'EXPERIMENT_GUARD_PAUSED', `Plano ${plan.code}: campanha ${campaignId} pausada pelo vigia do teto. ${reason}`, null, null, false, false).catch(() => {});
      await this.alert(pool, plan, campaignId, 'EXPERIMENT_CAP_PAUSED', Number(numbers.spent || 0), Number(numbers.cap || 0), `Campanha do plano ${plan.code} PAUSADA pelo vigia do teto: ${reason}`);
      return { paused: true };
    } catch (err: any) {
      await handle.finish('FAILED', { error: err });
      await pool.query(`UPDATE launch_plans SET guard_state = 'PAUSE_FAILED', guard_note = $2, updated_at = NOW() WHERE id = $1`, [plan.id, String(err?.message || err).slice(0, 500)]);
      if (plan.guard_state !== 'PAUSE_FAILED') {
        await this.alert(pool, plan, campaignId, 'EXPERIMENT_GUARD_PAUSE_FAILED', Number(numbers.spent || 0), Number(numbers.cap || 0), `FALHA ao pausar a campanha do plano ${plan.code} no teto: ${String(err?.message || err).slice(0, 200)}. Pause manualmente no Gerenciador.`);
      }
      console.error('[EXPERIMENT GUARD] CRITICAL pause failed', plan.code, err?.message);
      return { paused: false, error: String(err?.message || err) };
    }
  }

  /** One guard cycle over every running plan (or one plan). */
  async run(pool: Pool, opts: { planId?: string; intervalMin?: number } = {}) {
    const intervalMin = opts.intervalMin ?? GUARD_INTERVAL_MIN();
    const protectedIds = protectedMetaIds();
    const plans = (
      await pool.query(
        `SELECT * FROM launch_plans WHERE status IN ('ACTIVE', 'APPROVED') AND COALESCE(guard_state, '') <> 'CAPPED' ${opts.planId ? 'AND id = $1' : ''}`,
        opts.planId ? [opts.planId] : []
      )
    ).rows;
    const results: any[] = [];
    for (const plan of plans) {
      const campaignId = ExperimentGuardService.campaignOf(plan);
      if (!campaignId) {
        results.push({ code: plan.code, skipped: 'sem campanha na Meta' });
        continue;
      }
      if (protectedIds.has(campaignId)) {
        results.push({ code: plan.code, skipped: 'campanha protegida (CONTROL)' });
        continue;
      }
      const cap = parseFloat(plan.max_spend_brl);
      const daily = parseFloat(plan.daily_budget_brl) || 0;
      const sent: Record<string, any> = typeof plan.cap_alerts_sent === 'string' ? JSON.parse(plan.cap_alerts_sent || '{}') : plan.cap_alerts_sent || {};
      let reading: { spend: number; effective_status: string | null; spend_cap: number | null };
      try {
        reading = await this.clientFactory().getCampaignLifetimeSpend(campaignId);
      } catch (err: any) {
        const failures = (Number(plan.guard_read_failures) || 0) + 1;
        await pool.query(`UPDATE launch_plans SET guard_read_failures = $2, guard_note = $3, updated_at = NOW() WHERE id = $1`, [plan.id, failures, `Leitura falhou: ${String(err?.message || err).slice(0, 300)}`]);
        const out: any = { code: plan.code, read_failed: true, failures };
        if (failures === 2) {
          await this.alert(pool, plan, campaignId, 'EXPERIMENT_GUARD_READ_FAILED', 0, cap, `O vigia do teto não conseguiu ler o gasto do plano ${plan.code} em 2 ciclos seguidos.`);
        }
        // Gasto máximo possível desde a última leitura boa: se puder ter passado do teto, pausa preventiva.
        const last = plan.spent_brl_last !== null && plan.spent_brl_last !== undefined ? parseFloat(plan.spent_brl_last) : null;
        const since = plan.spent_checked_at ? (Date.now() - new Date(plan.spent_checked_at).getTime()) / 86400000 : null;
        if (failures >= 2 && last !== null && since !== null) {
          const worst = r2(last + daily * (since + intervalMin / 1440) * PROJECTION_FACTOR);
          out.worst_case = worst;
          if (worst >= cap && autopauseEnabled()) {
            out.pause = await this.pause(pool, plan, campaignId, `Sem leitura do gasto; o máximo possível (${brl(worst)}) pode atingir o teto de ${brl(cap)}.`, { spent: last, worst, cap });
          }
        }
        results.push(out);
        continue;
      }

      const ev = evaluateGuard({ spent: reading.spend, cap, dailyBudget: daily, intervalMin, alertsSent: sent });
      for (const t of ev.newAlerts) {
        sent[String(t)] = new Date().toISOString();
        await this.alert(pool, plan, campaignId, `EXPERIMENT_CAP_${t}`, reading.spend, cap, `Plano ${plan.code} atingiu ${t}% do teto: ${brl(reading.spend)} de ${brl(cap)}.`);
      }
      await pool.query(
        `UPDATE launch_plans SET spent_brl_last = $2, spent_checked_at = NOW(), guard_read_failures = 0, cap_alerts_sent = $3,
                guard_state = COALESCE(NULLIF(guard_state, 'PAUSE_FAILED'), 'WATCHING'), guard_note = $4, updated_at = NOW() WHERE id = $1`,
        [plan.id, reading.spend, JSON.stringify(sent), `Gasto ${brl(reading.spend)} de ${brl(cap)} (${ev.pct}%); projeção até a próxima leitura ${brl(ev.projection)}.`]
      );
      const out: any = { code: plan.code, spent: reading.spend, cap, pct: ev.pct, projection: ev.projection, alerts: ev.newAlerts, meta_status: reading.effective_status };
      if (ev.shouldPause) {
        if (reading.effective_status && !['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES'].includes(reading.effective_status)) {
          await pool.query(`UPDATE launch_plans SET guard_state = 'CAPPED', capped_at = NOW(), updated_at = NOW() WHERE id = $1`, [plan.id]);
          out.capped = 'campanha já não está ativa na Meta';
        } else if (autopauseEnabled()) {
          out.pause = await this.pause(pool, plan, campaignId, `Gasto ${brl(reading.spend)} + projeção ${brl(ev.projection)} ≥ teto ${brl(cap)}.`, { spent: reading.spend, projection: ev.projection, cap });
        } else {
          out.pause = { paused: false, reason: 'EXPERIMENT_GUARD_AUTOPAUSE=false' };
        }
      }
      results.push(out);
    }
    return { ran_at: new Date().toISOString(), interval_min: intervalMin, plans: results };
  }

  /** H8: apply spend_cap = cap on the plan's campaign (best effort, recorded on the plan). */
  async applySpendCap(pool: Pool, plan: any, ctx: MetaMutatingSecurityContext) {
    const campaignId = ExperimentGuardService.campaignOf(plan);
    if (!campaignId) return { status: 'SKIPPED', error: 'Plano sem campanha na Meta.' };
    const cap = parseFloat(plan.max_spend_brl);
    const save = async (applied: number) => {
      const status = applied > cap + 0.001 ? 'BACKSTOP' : 'APPLIED';
      await pool.query(
        `UPDATE launch_plans SET spend_cap_applied_brl = $2, spend_cap_status = $3, spend_cap_error = NULL, spend_cap_applied_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [plan.id, applied, status]
      );
      return { status, spend_cap_brl: applied, cap_brl: cap };
    };
    let target = metaSpendCapFor(cap);
    try {
      await this.clientFactory().setCampaignSpendCap(campaignId, target, ctx, protectedMetaIds());
      return await save(target);
    } catch (err: any) {
      let msg = String(err?.message || err).slice(0, 500);
      // A Meta informa o mínimo aceito: tenta uma vez com ele (só se for maior que o que já tentamos)
      const min = minimumFromMetaError(msg);
      if (min && min > target) {
        target = min;
        try {
          await this.clientFactory().setCampaignSpendCap(campaignId, target, ctx, protectedMetaIds());
          return await save(target);
        } catch (err2: any) {
          msg = String(err2?.message || err2).slice(0, 500);
        }
      }
      await pool.query(`UPDATE launch_plans SET spend_cap_status = 'FAILED', spend_cap_error = $2, updated_at = NOW() WHERE id = $1`, [plan.id, msg]);
      return { status: 'FAILED', error: msg };
    }
  }
}

/** In-process scheduler (Render Starter does not sleep). EXPERIMENT_GUARD_ENABLED=false turns it off. */
export function startExperimentGuardScheduler(pool: Pool, service = new ExperimentGuardService()): () => void {
  if (!guardEnabled() || process.env.NODE_ENV === 'test') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await service.run(pool);
      if (r.plans.length) console.log('[EXPERIMENT GUARD]', JSON.stringify(r.plans));
    } catch (err: any) {
      console.error('[EXPERIMENT GUARD] cycle failed', err?.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 60 * 1000);
  const every = setInterval(tick, GUARD_INTERVAL_MIN() * 60 * 1000);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
