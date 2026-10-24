import crypto from 'crypto';
import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext, MetaPayloadGuard } from '../meta/metaMutatingClient';
import { normalizeMetaIds } from '../launchPlans/launchPlanService';
import { beginDecision, DecisionContext, metaIdsOfPlan } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';
import { protectedMetaIds } from '../experiments/protectedIds';

// NORQVA-0118 (D-0118): pausa noturna. Contrato aprovado pelo Ricardo em 23/10/2026 21h22.
// Todo dia, no horário de Brasília (America/Sao_Paulo, calculado aqui, sem depender do fuso do servidor):
// - no início da janela (padrão 00:00) pausa na Meta cada campanha ATIVA de plano com a pausa noturna ligada
//   e grava que foi o NORQVA quem pausou (night_pause_runs, uma linha por campanha e por noite);
// - no fim da janela (padrão 06:00) reativa SÓ o que ele mesmo pausou e que continuou pausado. Se o servidor
//   estava fora às 06:00, reativa assim que voltar, até 23:59 do mesmo dia. Depois disso, não reativa mais.
// Travas:
// - nada que outra pessoa ou rotina tocou durante a noite volta sozinho: dono (tela ou Gerenciador), vigia do
//   teto, Performance, ficha de alteração, orçamento, teto. A reativação é cancelada e registrada;
// - antes de reativar relê a Meta: precisa estar PAUSED, sem alteração na Meta, e longe do teto;
// - só mexe na situação (PAUSED/ACTIVE) da campanha (trava no envio: um campo só, status, no ID da campanha);
//   nunca cria nada, nunca muda orçamento nem teto;
// - NIGHT_PAUSE_ENABLED=true liga as pausas novas; desligado, o que já foi pausado ainda volta de manhã;
// - META_MUTATION_ENABLED vale como sempre;
// - falha ao pausar ou reativar abre aviso na central de pendências.

export class NightPauseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const NIGHT_PAUSE_TZ = 'America/Sao_Paulo';
export const NIGHT_PAUSE_TICK_MIN = 2;
export const DEFAULT_START = '00:00';
export const DEFAULT_END = '06:00';
/** Minutos sem resposta para considerar um envio interrompido (queda no meio). */
const STALE_MIN = 5;
/** Leituras seguidas que falham antes de abrir aviso. */
const READ_FAILURES_ALERT = 3;

export const nightPauseEnabled = (env: Record<string, string | undefined> = process.env) => env.NIGHT_PAUSE_ENABLED === 'true';
const mutationEnabled = () => process.env.META_MUTATION_ENABLED === 'true';

const SYSTEM_CTX: DecisionContext = { userId: null, userEmail: null, actorType: 'SYSTEM', sessionId: null, ip: null, userAgent: null, isDemo: false };
const META_CTX = { userId: null as any, userRole: 'SYSTEM', isDemo: false } as MetaMutatingSecurityContext;
const WHO = 'NORQVA (pausa noturna)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Registros de auditoria que mostram que alguém (ou outra rotina) mexeu na campanha durante a noite.
const TOUCH_EVENTS = [
  'META_CAMPAIGN_STATUS_CHANGED',
  'META_ADSET_STATUS_CHANGED',
  'META_AD_STATUS_CHANGED',
  'META_BUDGET_UPDATED',
  'META_MUTATION_FAILED',
  'LAUNCH_PLAN_PAUSED_BY_OPERATOR',
  'LAUNCH_PLAN_RESUMED_BY_OPERATOR',
  'LAUNCH_PLAN_BUDGET_SYNCED',
  'LAUNCH_PLAN_CAP_CHANGED',
  'LAUNCH_PLAN_ACTIVATED',
  'EXPERIMENT_GUARD_PAUSED',
  'EXPERIMENT_CAP_EXTENDED_PROFIT',
  'CAMPAIGN_AD_CREATIVE_SWAPPED',
  'META_ADSET_END_TIME_SET'
];

// ---------------------------------------------------------------------------------------------
// Horário de Brasília
// ---------------------------------------------------------------------------------------------

const SP_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: NIGHT_PAUSE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

/** Data (AAAA-MM-DD) e minuto do dia em São Paulo, para qualquer fuso do servidor. */
export function spClock(now: Date = new Date()): { date: string; minutes: number; hhmm: string } {
  const p: Record<string, string> = {};
  for (const part of SP_FMT.formatToParts(now)) p[part.type] = part.value;
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + minute, hhmm: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

/** "HH:MM" (00:00 a 23:59) em minutos do dia; null se inválido. */
export function parseHHMM(v: unknown): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Janela no mesmo dia: início antes do fim. Lança NightPauseError(400) em português. */
export function validateWindow(start: unknown, end: unknown): { start: string; end: string } {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) throw new NightPauseError(400, 'Use horários no formato HH:MM (por exemplo 00:00 e 06:00).');
  if (s >= e) throw new NightPauseError(400, 'O início precisa ser antes do fim, no mesmo dia (por exemplo 00:00 às 06:00).');
  return { start: String(start).trim(), end: String(end).trim() };
}

function windowOf(plan: any): { start: number; end: number; startText: string; endText: string } | null {
  const start = parseHHMM(plan.night_pause_start ?? DEFAULT_START);
  const end = parseHHMM(plan.night_pause_end ?? DEFAULT_END);
  if (start === null || end === null || start >= end) return null;
  return { start, end, startText: String(plan.night_pause_start ?? DEFAULT_START), endText: String(plan.night_pause_end ?? DEFAULT_END) };
}

// ---------------------------------------------------------------------------------------------
// Trava no envio: só situação, só na campanha
// ---------------------------------------------------------------------------------------------

/** Cada POST da pausa noturna: um campo só (status = PAUSED ou ACTIVE) e só no ID da campanha. */
export function statusOnlyGuard(campaignId: string): MetaPayloadGuard {
  return (endpoint, payload) => {
    const keys = Object.keys(payload || {});
    if (endpoint !== `/${campaignId}`) throw new Error('[NIGHT PAUSE GUARD]: só a campanha do plano pode ser alterada.');
    if (keys.length !== 1 || keys[0] !== 'status' || !['PAUSED', 'ACTIVE'].includes(String(payload.status))) {
      throw new Error('[NIGHT PAUSE GUARD]: a pausa noturna só muda a situação (PAUSED ou ACTIVE).');
    }
  };
}

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const sameMoney = (a: unknown, b: unknown) => {
  const x = money(a);
  const y = money(b);
  return x === null || y === null ? x === y : Math.abs(x - y) < 0.005;
};
const brl = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const errText = (err: any) => String(err?.message || err || 'erro desconhecido').slice(0, 500);
const parseJson = (v: unknown) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

export function campaignOfPlan(plan: any): string | null {
  const values = Object.values(normalizeMetaIds(plan.meta_ids).campaign || {});
  return values.length ? String(values[0]) : null;
}

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

export class NightPauseService {
  constructor(private clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient()) {}

  private client(campaignId: string): MetaMutatingClient {
    return this.clientFactory().withPayloadGuard(statusOnlyGuard(campaignId));
  }

  /** Um ciclo (o agendador chama a cada 2 minutos). `now` só muda nos testes. */
  async run(pool: Pool, now: Date = new Date()) {
    const clock = spClock(now);
    const out: any = { sp_date: clock.date, sp_time: clock.hhmm, enabled: nightPauseEnabled(), mutation: mutationEnabled(), paused: [], resumed: [], skipped: [], other: [] };
    await this.settleStale(pool, out);
    await this.expireOld(pool, clock, out);
    await this.recheckUnconfirmed(pool, clock, out);
    await this.resumeDue(pool, clock, out);
    if (out.enabled && out.mutation) await this.pauseDue(pool, clock, out);
    return out;
  }

  // ------------------------------ pausar ------------------------------

  private async pauseDue(pool: Pool, clock: { date: string; minutes: number }, out: any) {
    const plans = (
      await pool.query(
        `SELECT * FROM launch_plans
         WHERE status IN ('ACTIVE', 'APPROVED') AND night_pause_enabled = TRUE
           AND COALESCE(guard_state, '') <> 'CAPPED' AND operator_paused_at IS NULL`
      )
    ).rows;
    const protectedIds = protectedMetaIds();
    for (const plan of plans) {
      const w = windowOf(plan);
      if (!w || clock.minutes < w.start || clock.minutes >= w.end) continue;
      const cid = campaignOfPlan(plan);
      if (!cid || protectedIds.has(cid)) continue;
      const done = await pool.query(`SELECT 1 FROM night_pause_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`, [cid, clock.date]);
      if (done.rows.length) continue;

      let state: Awaited<ReturnType<MetaMutatingClient['readCampaignState']>>;
      try {
        state = await this.client(cid).readCampaignState(cid);
      } catch (err) {
        // sem leitura não pausa; tenta de novo no próximo ciclo dentro da janela
        out.other.push({ code: plan.code, read_failed: errText(err) });
        continue;
      }
      const base = [plan.id, plan.code, cid, clock.date, w.startText, w.endText];
      if (String(state.status || '').toUpperCase() !== 'ACTIVE') {
        // não estava ativa no início da pausa: nada a fazer nesta noite (e de manhã nada volta)
        await pool.query(
          `INSERT INTO night_pause_runs (plan_id, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status, reason)
           VALUES ($1, $2, $3, $4::date, $5, $6, 'SKIPPED', $7, $8)
           ON CONFLICT (meta_campaign_id, night_date) DO NOTHING`,
          [...base, state.status, `Não estava ativa na Meta no início da pausa noturna (${state.status || 'sem situação'}).`]
        );
        out.skipped.push({ code: plan.code, status: state.status });
        continue;
      }
      const claim = await pool.query(
        `INSERT INTO night_pause_runs
           (plan_id, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status,
            meta_daily_budget_at_pause, plan_daily_budget_at_pause, plan_cap_at_pause, pause_started_at)
         VALUES ($1, $2, $3, $4::date, $5, $6, 'PAUSING', 'ACTIVE', $7, $8, $9, NOW())
         ON CONFLICT (meta_campaign_id, night_date) DO NOTHING RETURNING *`,
        [...base, state.daily_budget, plan.daily_budget_brl, plan.max_spend_brl]
      );
      if (!claim.rows.length) continue; // outra instância pegou esta campanha nesta noite
      out.paused.push(await this.pause(pool, plan, claim.rows[0]));
    }
  }

  private async pause(pool: Pool, plan: any, run: any) {
    const cid = String(run.meta_campaign_id);
    const handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE', decision: 'CAMPAIGN:PAUSED', planId: plan.id, planCode: plan.code, metaIds: [cid] }, { riskReducing: true });
    const changeId = await this.openChange(pool, plan, cid, 'ACTIVE', 'PAUSED');
    await pool.query(`UPDATE night_pause_runs SET pause_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
    try {
      await this.client(cid).setEntityStatus(pool, 'CAMPAIGN', cid, 'PAUSED', META_CTX);
    } catch (err: any) {
      const msg = errText(err);
      await handle.finish('FAILED', { error: msg });
      await pool.query(`UPDATE meta_change_requests SET state = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [changeId, msg]);
      await pool.query(`UPDATE night_pause_runs SET state = 'PAUSE_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_FAILED', `Pausa noturna não feita: plano ${plan.code}, campanha ${cid}. ${msg}`, 'ACTIVE', null);
      await this.alert(pool, plan, cid, 'NIGHT_PAUSE_PAUSE_FAILED', `A pausa noturna não conseguiu pausar a campanha do plano ${plan.code}: ${msg.slice(0, 200)}. A campanha segue ativa durante a noite.`);
      return { code: plan.code, paused: false, error: msg };
    }
    await handle.finish('EXECUTED', { result: { campaign: cid, status: 'PAUSED' } });
    // a partir daqui, qualquer coisa nesta campanha é de outra pessoa ou rotina
    await pool.query(`UPDATE night_pause_runs SET quiet_since = NOW(), updated_at = NOW() WHERE id = $1`, [run.id]);
    const state = await this.confirmPause(pool, { ...run, pause_change_id: changeId }, plan, true);
    return { code: plan.code, paused: true, state };
  }

  /** Relê a Meta: PAUSED → "Confirmado pela Meta". Senão fica aguardando conferência. */
  private async confirmPause(pool: Pool, run: any, plan: any, first: boolean): Promise<string> {
    const cid = String(run.meta_campaign_id);
    let read: { status: string | null; updated_time: string | null } | null = null;
    try {
      read = await this.client(cid).readCampaignState(cid);
    } catch (err) {
      console.warn('[NIGHT PAUSE] releitura falhou; fica aguardando conferência', errText(err));
    }
    const status = read ? String(read.status || '').toUpperCase() : null;
    if (status === 'PAUSED') {
      const upd = await pool.query(
        `UPDATE night_pause_runs SET state = 'PAUSED', paused_at = NOW(), meta_updated_time_at_pause = $2, error = NULL, updated_at = NOW()
         WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED') RETURNING id`,
        [run.id, read?.updated_time || null]
      );
      if (!upd.rows.length) return 'UNCHANGED';
      await this.closeChange(pool, run.pause_change_id, 'CONFIRMED', 'PAUSED');
      await writeAuditLog(
        pool,
        null,
        'NIGHT_PAUSE_DONE',
        `Pausa noturna: campanha ${cid} do plano ${plan?.code || run.plan_code} pausada. Confirmado pela Meta. Volta às ${run.window_end} (horário de Brasília) se ninguém mexer nela.`,
        'ACTIVE',
        'PAUSED'
      );
      return 'PAUSED';
    }
    const upd = await pool.query(
      `UPDATE night_pause_runs SET state = 'PAUSE_UNCONFIRMED', updated_at = NOW() WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED') RETURNING id`,
      [run.id]
    );
    if (upd.rows.length && first) {
      await this.closeChange(pool, run.pause_change_id, 'UNCONFIRMED', status);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_UNCONFIRMED', `Pausa noturna: a Meta aceitou pausar a campanha ${cid} do plano ${plan?.code || run.plan_code}, aguardando conferência.`, 'ACTIVE', status);
    }
    return 'PAUSE_UNCONFIRMED';
  }

  // ------------------------------ reativar ------------------------------

  private async resumeDue(pool: Pool, clock: { date: string; minutes: number }, out: any) {
    const rows = (
      await pool.query(`SELECT * FROM night_pause_runs WHERE state IN ('PAUSED', 'PAUSE_UNCONFIRMED') AND night_date = $1::date ORDER BY created_at`, [clock.date])
    ).rows;
    for (const r of rows) {
      const end = parseHHMM(r.window_end);
      if (end === null || clock.minutes < end) continue;
      if (!mutationEnabled()) {
        out.other.push({ code: r.plan_code, waiting: 'META_MUTATION_ENABLED desligado' });
        continue;
      }
      const claim = await pool.query(
        `UPDATE night_pause_runs SET state = 'REACTIVATING', resume_started_at = NOW(), updated_at = NOW() WHERE id = $1 AND state = $2 RETURNING *`,
        [r.id, r.state]
      );
      if (!claim.rows.length) continue; // outra instância pegou
      out.resumed.push(await this.resume(pool, claim.rows[0], r.state));
    }
  }

  private async resume(pool: Pool, run: any, previousState: string) {
    const cid = String(run.meta_campaign_id);
    const plan = (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [run.plan_id])).rows[0];
    const code = plan?.code || run.plan_code;

    const cancel = async (reason: string) => {
      await pool.query(`UPDATE night_pause_runs SET state = 'CANCELLED', reason = $2, updated_at = NOW() WHERE id = $1`, [run.id, reason]);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_CANCELLED', `Fim da pausa noturna cancelado: a campanha ${cid} do plano ${code} continua pausada. Motivo: ${reason}`, 'PAUSED', 'PAUSED');
      if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_CANCELLED', `A campanha do plano ${code} não foi reativada de manhã: ${reason} Ela continua pausada; reative pela tela se quiser.`);
      return { code, resumed: false, cancelled: reason };
    };
    const retryLater = async (why: string) => {
      const r = await pool.query(
        `UPDATE night_pause_runs SET state = $2, read_failures = read_failures + 1, error = $3, updated_at = NOW() WHERE id = $1 RETURNING read_failures`,
        [run.id, previousState, why.slice(0, 500)]
      );
      if (plan && Number(r.rows[0]?.read_failures) === READ_FAILURES_ALERT) {
        await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna ainda não conseguiu reativar a campanha do plano ${code}: ${why.slice(0, 200)}. O NORQVA tenta de novo até 23:59.`);
      }
      return { code, resumed: false, retry: why };
    };

    if (!plan) return cancel('o plano não existe mais.');
    if (!['ACTIVE', 'APPROVED'].includes(String(plan.status))) return cancel(`o plano está como ${plan.status}.`);
    if (plan.operator_paused_at) return cancel('a campanha foi pausada pela tela durante a noite.');
    if (String(plan.guard_state || '') === 'CAPPED') return cancel('o vigia do teto parou a campanha.');
    if (protectedMetaIds().has(cid)) return cancel('campanha protegida (CONTROL).');
    if (campaignOfPlan(plan) !== cid) return cancel('a campanha do plano mudou.');
    if (!sameMoney(plan.max_spend_brl, run.plan_cap_at_pause)) return cancel('o teto do plano mudou durante a noite.');
    if (!sameMoney(plan.daily_budget_brl, run.plan_daily_budget_at_pause)) return cancel('o orçamento do plano mudou durante a noite.');
    let touched: string | null;
    try {
      touched = await this.touchedDuringNight(pool, run, plan);
    } catch (err) {
      return retryLater(`não foi possível conferir o que aconteceu durante a noite (${errText(err)})`);
    }
    if (touched) return cancel(touched);

    const client = this.client(cid);
    let state: Awaited<ReturnType<MetaMutatingClient['readCampaignState']>>;
    try {
      state = await client.readCampaignState(cid);
    } catch (err) {
      return retryLater(`leitura da campanha na Meta falhou (${errText(err)})`);
    }
    const status = String(state.status || '').toUpperCase();
    if (status !== 'PAUSED') return cancel(`na Meta a campanha está ${status || 'sem situação'}, não pausada: alguém mexeu nela ou a pausa não pegou.`);
    if (run.meta_updated_time_at_pause && state.updated_time && state.updated_time !== run.meta_updated_time_at_pause) {
      return cancel('a campanha foi alterada na Meta durante a noite.');
    }
    if (money(run.meta_daily_budget_at_pause) !== null && !sameMoney(state.daily_budget, run.meta_daily_budget_at_pause)) {
      return cancel('o orçamento da campanha mudou na Meta durante a noite.');
    }
    let spend: { spend: number; spend_cap: number | null };
    try {
      spend = await client.getCampaignLifetimeSpend(cid);
    } catch (err) {
      return retryLater(`leitura do gasto na Meta falhou (${errText(err)})`);
    }
    const cap = money(plan.max_spend_brl);
    if (cap !== null && spend.spend >= cap - 0.005) return cancel(`o teto foi atingido (${brl(spend.spend)} de ${brl(cap)}).`);
    if (spend.spend_cap !== null && spend.spend >= spend.spend_cap - 0.005) return cancel(`o limite de gastos da campanha na Meta foi atingido (${brl(spend.spend)} de ${brl(spend.spend_cap)}).`);

    // reativar aumenta exposição: sem registro de decisão, não reativa agora (fail-closed) e tenta de novo
    let handle;
    try {
      handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE_RESUME', decision: 'CAMPAIGN:ACTIVE', planId: plan.id, planCode: plan.code, metaIds: [cid] });
    } catch (err) {
      return retryLater(`auditoria de decisões indisponível (${errText(err)})`);
    }
    const changeId = await this.openChange(pool, plan, cid, 'PAUSED', 'ACTIVE');
    await pool.query(`UPDATE night_pause_runs SET resume_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
    try {
      await client.setEntityStatus(pool, 'CAMPAIGN', cid, 'ACTIVE', META_CTX);
    } catch (err: any) {
      const msg = errText(err);
      await handle.finish('FAILED', { error: msg });
      await pool.query(`UPDATE meta_change_requests SET state = 'FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [changeId, msg]);
      await pool.query(`UPDATE night_pause_runs SET state = 'RESUME_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_FAILED', `Fim da pausa noturna falhou: a campanha ${cid} do plano ${code} continua pausada. ${msg}`, 'PAUSED', null);
      await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna não conseguiu reativar a campanha do plano ${code}: ${msg.slice(0, 200)}. Ela continua pausada; reative pela tela se quiser.`);
      return { code, resumed: false, error: msg };
    }
    await handle.finish('EXECUTED', { result: { campaign: cid, status: 'ACTIVE' } });
    const final = await this.confirmResume(pool, { ...run, resume_change_id: changeId }, true);
    return { code, resumed: true, state: final };
  }

  private async confirmResume(pool: Pool, run: any, first: boolean): Promise<string> {
    const cid = String(run.meta_campaign_id);
    let status: string | null = null;
    try {
      status = String((await this.client(cid).readCampaignState(cid)).status || '').toUpperCase();
    } catch (err) {
      console.warn('[NIGHT PAUSE] releitura falhou; fica aguardando conferência', errText(err));
    }
    if (status === 'ACTIVE') {
      const upd = await pool.query(
        `UPDATE night_pause_runs SET state = 'REACTIVATED', resumed_at = NOW(), error = NULL, updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
        [run.id]
      );
      if (!upd.rows.length) return 'UNCHANGED';
      await this.closeChange(pool, run.resume_change_id, 'CONFIRMED', 'ACTIVE');
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUMED', `Fim da pausa noturna: campanha ${cid} do plano ${run.plan_code} reativada. Confirmado pela Meta.`, 'PAUSED', 'ACTIVE');
      return 'REACTIVATED';
    }
    const upd = await pool.query(
      `UPDATE night_pause_runs SET state = 'RESUME_UNCONFIRMED', updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
      [run.id]
    );
    if (upd.rows.length && first) {
      await this.closeChange(pool, run.resume_change_id, 'UNCONFIRMED', status);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_UNCONFIRMED', `Fim da pausa noturna: a Meta aceitou reativar a campanha ${cid} do plano ${run.plan_code}, aguardando conferência.`, 'PAUSED', status);
    }
    return 'RESUME_UNCONFIRMED';
  }

  /**
   * Alguém (ou outra rotina) mexeu na campanha depois da pausa? Devolve o motivo, ou null.
   * Fichas de alteração, decisões e registros de auditoria do plano ou dos objetos dele, menos os da própria pausa.
   */
  async touchedDuringNight(pool: Pool, run: any, plan: any): Promise<string | null> {
    const since = run.quiet_since || run.pause_started_at;
    const cid = String(run.meta_campaign_id);
    const ids = new Set<string>([cid, ...metaIdsOfPlan(normalizeMetaIds(plan.meta_ids))]);
    const idList = Array.from(ids);

    const changes = await pool.query(
      `SELECT kind, requested_value, requested_by_name FROM meta_change_requests
       WHERE created_at > $1 AND is_demo = FALSE AND COALESCE(origin, '') <> 'NIGHT_PAUSE'
         AND (plan_id = $2 OR meta_campaign_id = $3 OR meta_id = ANY($4::text[]))
       LIMIT 1`,
      [since, plan.id, cid, idList]
    );
    if (changes.rows.length) {
      const c = changes.rows[0];
      return `houve uma alteração pedida na campanha durante a noite (${c.kind === 'STATUS' ? (c.requested_value === 'PAUSED' ? 'pausar' : 'reativar') : 'orçamento'}${c.requested_by_name ? `, por ${c.requested_by_name}` : ''}).`;
    }

    const decisions = await pool.query(
      `SELECT action, plan_id, meta_ids FROM decision_events
       WHERE created_at > $1 AND is_demo = FALSE AND action NOT LIKE 'NIGHT_PAUSE%'
       ORDER BY created_at LIMIT 500`,
      [since]
    );
    for (const d of decisions.rows) {
      const metaIds = parseJson(d.meta_ids);
      const hit = (d.plan_id && String(d.plan_id) === String(plan.id)) || (Array.isArray(metaIds) && metaIds.some((x: unknown) => ids.has(String(x))));
      if (hit) return `houve outra decisão sobre a campanha durante a noite (${d.action}).`;
    }

    const audits = await pool.query(
      `SELECT event_type, description FROM audit_logs
       WHERE created_at > $1 AND is_demo = FALSE AND event_type = ANY($2::text[])
       ORDER BY created_at LIMIT 500`,
      [since, TOUCH_EVENTS]
    );
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [String(plan.code), ...idList].map((t) => new RegExp(`(^|[^A-Za-z0-9_-])${esc(t)}([^A-Za-z0-9_-]|$)`, 'i'));
    for (const a of audits.rows) {
      const text = String(a.description || '');
      if (patterns.some((p) => p.test(text))) return `a campanha foi alterada durante a noite (${a.event_type}).`;
    }
    return null;
  }

  // ------------------------------ conferências e prazos ------------------------------

  /** Envio interrompido (queda no meio): a releitura decide. */
  private async settleStale(pool: Pool, out: any) {
    const stale = (
      await pool.query(
        `SELECT * FROM night_pause_runs
         WHERE (state = 'PAUSING' AND pause_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')
            OR (state = 'REACTIVATING' AND resume_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')`
      )
    ).rows;
    for (const r of stale) {
      const plan = (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [r.plan_id])).rows[0];
      if (r.state === 'PAUSING') {
        const s = await this.confirmPause(pool, r, plan, true);
        if (s === 'PAUSE_UNCONFIRMED') {
          // sem PAUSED na Meta: a pausa não aconteceu; nada a reativar de manhã
          await pool.query(`UPDATE night_pause_runs SET state = 'PAUSE_FAILED', error = 'envio interrompido', updated_at = NOW() WHERE id = $1 AND state = 'PAUSE_UNCONFIRMED'`, [r.id]);
          await this.closeChange(pool, r.pause_change_id, 'FAILED', null, 'envio interrompido');
          if (plan) await this.alert(pool, plan, String(r.meta_campaign_id), 'NIGHT_PAUSE_PAUSE_FAILED', `A pausa noturna foi interrompida e a campanha do plano ${plan.code} não ficou pausada.`);
        }
        out.other.push({ code: r.plan_code, stale: 'PAUSING', state: s });
      } else {
        const s = await this.confirmResume(pool, r, true);
        if (s === 'RESUME_UNCONFIRMED') {
          await pool.query(`UPDATE night_pause_runs SET state = 'RESUME_FAILED', error = 'envio interrompido', updated_at = NOW() WHERE id = $1 AND state = 'RESUME_UNCONFIRMED'`, [r.id]);
          await this.closeChange(pool, r.resume_change_id, 'FAILED', null, 'envio interrompido');
          if (plan) await this.alert(pool, plan, String(r.meta_campaign_id), 'NIGHT_PAUSE_RESUME_FAILED', `A reativação da manhã foi interrompida: a campanha do plano ${plan.code} continua pausada. Reative pela tela se quiser.`);
        }
        out.other.push({ code: r.plan_code, stale: 'REACTIVATING', state: s });
      }
    }
  }

  /** Passou de 23:59 do dia da pausa: não reativa mais; registra e avisa. */
  private async expireOld(pool: Pool, clock: { date: string }, out: any) {
    const expired = (
      await pool.query(
        `UPDATE night_pause_runs SET state = 'EXPIRED', reason = 'Não foi reativada até 23:59 do dia da pausa.', updated_at = NOW()
         WHERE state IN ('PAUSED', 'PAUSE_UNCONFIRMED') AND night_date < $1::date RETURNING *`,
        [clock.date]
      )
    ).rows;
    for (const r of expired) {
      const cid = String(r.meta_campaign_id);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_EXPIRED', `Fim da pausa noturna não aconteceu até 23:59: a campanha ${cid} do plano ${r.plan_code} continua pausada.`, 'PAUSED', 'PAUSED');
      const plan = (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [r.plan_id])).rows[0];
      if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_EXPIRED', `A campanha do plano ${plan.code} ficou pausada: o NORQVA não conseguiu reativá-la até 23:59 do dia da pausa. Reative pela tela se quiser.`);
      out.other.push({ code: r.plan_code, expired: true });
    }
  }

  /** Conferências pendentes do dia (a Meta aceitou mas a releitura ainda não mostrava). */
  private async recheckUnconfirmed(pool: Pool, clock: { date: string }, out: any) {
    const rows = (await pool.query(`SELECT * FROM night_pause_runs WHERE state IN ('PAUSE_UNCONFIRMED', 'RESUME_UNCONFIRMED') AND night_date = $1::date`, [clock.date])).rows;
    for (const r of rows) {
      const s =
        r.state === 'PAUSE_UNCONFIRMED'
          ? await this.confirmPause(pool, r, (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [r.plan_id])).rows[0], false)
          : await this.confirmResume(pool, r, false);
      if (s !== r.state) out.other.push({ code: r.plan_code, confirmed: s });
    }
  }

  // ------------------------------ fichas e avisos ------------------------------

  /** Ficha de alteração (NORQVA-0097) da pausa noturna, já em "Enviando". */
  private async openChange(pool: Pool, plan: any, cid: string, previous: string, requested: 'PAUSED' | 'ACTIVE'): Promise<string> {
    const id = crypto.randomUUID();
    const name = (await pool.query(`SELECT name FROM meta_campaigns WHERE meta_campaign_id = $1 AND is_demo = FALSE LIMIT 1`, [cid]).catch(() => ({ rows: [] as any[] }))).rows[0]?.name;
    await pool.query(
      `INSERT INTO meta_change_requests
         (id, plan_id, plan_code, entity_type, meta_id, entity_name, meta_campaign_id, kind, previous_value, requested_value, state,
          requested_by_name, requested_by_role, approved_by_name, approved_at, sent_at, origin, is_demo)
       VALUES ($1, $2, $3, 'CAMPAIGN', $4, $5, $4, 'STATUS', $6, $7, 'SENDING', $8, 'SYSTEM', $8, NOW(), NOW(), 'NIGHT_PAUSE', FALSE)`,
      [id, UUID_RE.test(String(plan.id)) ? plan.id : null, plan.code, cid, name || plan.spec?.campaign?.name || null, previous, requested, WHO]
    );
    return id;
  }

  private async closeChange(pool: Pool, id: string | null, state: 'CONFIRMED' | 'UNCONFIRMED' | 'FAILED', metaValue: string | null, error: string | null = null) {
    if (!id) return;
    await pool.query(
      `UPDATE meta_change_requests SET state = $2, meta_value = $3, verified_at = NOW(),
              confirmed_at = CASE WHEN $2 = 'CONFIRMED' THEN NOW() ELSE confirmed_at END, error = COALESCE($4, error), updated_at = NOW()
       WHERE id = $1 AND state IN ('SENDING', 'UNCONFIRMED')`,
      [id, state, metaValue, error]
    );
  }

  private async alert(pool: Pool, plan: any, cid: string, rule: string, message: string) {
    try {
      await pool.query(
        `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, spend, threshold, message, is_demo)
         VALUES ($1, $2, $3, $2, $4, 0, 0, $5, FALSE)`,
        [rule, cid, plan.code, plan.spec?.campaign?.name || plan.code, message]
      );
    } catch (err) {
      console.error('[NIGHT PAUSE] não abriu o aviso', rule, errText(err));
    }
  }

  // ------------------------------ configuração por plano ------------------------------

  async settings(pool: Pool, planId: string) {
    if (!UUID_RE.test(String(planId || ''))) throw new NightPauseError(404, 'Campanha não encontrada.');
    const p = (await pool.query(`SELECT id, code, night_pause_enabled, night_pause_start, night_pause_end FROM launch_plans WHERE id = $1`, [planId])).rows[0];
    if (!p) throw new NightPauseError(404, 'Campanha não encontrada.');
    const runs = (
      await pool.query(
        `SELECT id, night_date::text AS night_date, window_start, window_end, state, reason, error, paused_at, resumed_at, created_at
         FROM night_pause_runs WHERE plan_id = $1 ORDER BY night_date DESC, created_at DESC LIMIT 7`,
        [planId]
      )
    ).rows;
    return {
      enabled: p.night_pause_enabled !== false,
      start: p.night_pause_start || DEFAULT_START,
      end: p.night_pause_end || DEFAULT_END,
      timezone: NIGHT_PAUSE_TZ,
      master_enabled: nightPauseEnabled(),
      runs
    };
  }

  async saveSettings(pool: Pool, planId: string, body: any, userId: string | null) {
    const current = await this.settings(pool, planId);
    if (typeof body?.enabled !== 'boolean') throw new NightPauseError(400, 'Diga se a pausa noturna fica ligada ou desligada.');
    const w = validateWindow(body?.start ?? current.start, body?.end ?? current.end);
    const p = (
      await pool.query(
        `UPDATE launch_plans SET night_pause_enabled = $2, night_pause_start = $3, night_pause_end = $4, updated_at = NOW() WHERE id = $1 RETURNING code`,
        [planId, body.enabled, w.start, w.end]
      )
    ).rows[0];
    const before = `${current.enabled ? 'ligada' : 'desligada'} ${current.start}–${current.end}`;
    const after = `${body.enabled ? 'ligada' : 'desligada'} ${w.start}–${w.end}`;
    if (before !== after) {
      await writeAuditLog(
        pool,
        UUID_RE.test(String(userId || '')) ? userId : null,
        'NIGHT_PAUSE_SETTINGS_CHANGED',
        `Plano ${p.code}: pausa noturna ${body.enabled ? `ligada, das ${w.start} às ${w.end}` : 'desligada'} (horário de Brasília).`,
        before,
        after
      );
    }
    return this.settings(pool, planId);
  }
}

/**
 * Agendador no próprio servidor (o Render Starter não dorme), a cada 2 minutos. Roda sempre (mesmo com
 * NIGHT_PAUSE_ENABLED desligado) para nada ficar pausado sem volta; as pausas novas dependem da chave.
 */
export function startNightPauseScheduler(pool: Pool, service = new NightPauseService()): () => void {
  if (process.env.NODE_ENV === 'test') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await service.run(pool);
      if (r.paused.length || r.resumed.length || r.other.length) console.log('[NIGHT PAUSE]', JSON.stringify(r));
    } catch (err: any) {
      console.error('[NIGHT PAUSE] ciclo falhou', err?.message);
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 30 * 1000);
  const every = setInterval(tick, NIGHT_PAUSE_TICK_MIN * 60 * 1000);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
