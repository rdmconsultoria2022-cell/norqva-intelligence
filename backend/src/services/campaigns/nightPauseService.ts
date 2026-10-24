import crypto from 'crypto';
import { Pool } from 'pg';
import { MetaMutatingClient, MetaMutatingSecurityContext, MetaPayloadGuard } from '../meta/metaMutatingClient';
import { normalizeMetaIds } from '../launchPlans/launchPlanService';
import { beginDecision, DecisionContext, metaIdsOfPlan } from '../../db/decisionEvents';
import { writeAuditLog } from '../../db/audit';
import { protectedMetaIds } from '../experiments/protectedIds';
import { withPlanLock } from './planLock';

// NORQVA-0120 (D-0120): pausa noturna. Contrato aprovado pelo Ricardo em 23/10/2026 21h22.
// Todo dia, no horário de Brasília (America/Sao_Paulo, calculado aqui, sem depender do fuso do servidor):
// - no início da janela (padrão 00:00, com tolerância de 60 min se o servidor estava fora) pausa na Meta cada
//   campanha ATIVA de plano com a pausa noturna ligada e grava que foi o NORQVA quem pausou (night_pause_runs,
//   uma linha por campanha e por noite);
// - no fim da janela (padrão 06:00) reativa SÓ o que ele mesmo pausou e que continuou pausado. Se o servidor
//   estava fora às 06:00, reativa assim que voltar, até 23:59 do mesmo dia. Depois disso, não reativa mais.
// Travas:
// - nada que outra pessoa ou rotina tocou durante a noite volta sozinho: dono (tela ou Gerenciador, lido no
//   registro de atividades da conta), vigia do teto, Performance, ficha de alteração, orçamento, teto;
// - antes de reativar relê a Meta: precisa estar PAUSED e longe do teto; a decisão e o envio acontecem com a
//   trava do plano no banco (a mesma do vigia e da pausa pela tela) e o plano é relido logo antes do envio;
//   depois do envio confere de novo e, se alguém mexeu no meio, pausa de novo e avisa (crítico);
// - só mexe na situação da campanha (trava no envio: um campo só, status, na direção certa, no ID da campanha);
//   nunca cria nada, nunca muda orçamento nem teto;
// - NIGHT_PAUSE_ENABLED=true liga as pausas novas; desligado, o que já foi pausado ainda volta de manhã;
// - META_MUTATION_ENABLED vale como sempre;
// - falhas abrem aviso na central de pendências.

export class NightPauseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const NIGHT_PAUSE_TZ = 'America/Sao_Paulo';
export const NIGHT_PAUSE_TICK_MIN = 2;
export const DEFAULT_START = '00:00';
export const DEFAULT_END = '06:00';
/** Fim da janela no máximo às 23:00: sobra 1 hora para reativar até 23:59. */
export const MAX_END = '23:00';
/** Pausa só até 60 minutos depois do início da janela (servidor fora à meia-noite). */
export const PAUSE_GRACE_MIN = 60;
/** Tentativas de reativar (cada uma refaz todas as conferências), com intervalo mínimo entre elas. */
export const MAX_RESUME_ATTEMPTS = 5;
export const RESUME_RETRY_MIN = 4;
/** Na 3.ª falha, aviso. */
const FAILURES_ALERT = 3;
/** Minutos sem resposta para considerar um envio interrompido (queda no meio). */
const STALE_MIN = 5;

export const nightPauseEnabled = (env: Record<string, string | undefined> = process.env) => env.NIGHT_PAUSE_ENABLED === 'true';
const mutationEnabled = () => process.env.META_MUTATION_ENABLED === 'true';

const SYSTEM_CTX: DecisionContext = { userId: null, userEmail: null, actorType: 'SYSTEM', sessionId: null, ip: null, userAgent: null, isDemo: false };
const META_CTX = { userId: null as any, userRole: 'SYSTEM', isDemo: false } as MetaMutatingSecurityContext;
const WHO = 'NORQVA (pausa noturna)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Registros de auditoria que mostram que alguém (ou outra rotina) mexeu no plano ou na campanha.
// Os registros genéricos do cliente da Meta (META_*_STATUS_CHANGED, META_MUTATION_FAILED) ficam de fora: a
// própria pausa noturna também os escreve, e toda mudança de situação feita por outra pessoa ou rotina do
// NORQVA já deixa uma decisão (decision_events) ou uma ficha (meta_change_requests), conferidas à parte.
const TOUCH_EVENTS = [
  'META_BUDGET_UPDATED',
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

/** Janela no mesmo dia: início antes do fim, fim até 23:00. Lança NightPauseError(400) em português. */
export function validateWindow(start: unknown, end: unknown): { start: string; end: string } {
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s === null || e === null) throw new NightPauseError(400, 'Use horários no formato HH:MM (por exemplo 00:00 e 06:00).');
  if (s >= e) throw new NightPauseError(400, 'O início precisa ser antes do fim, no mesmo dia (por exemplo 00:00 às 06:00).');
  if (e > (parseHHMM(MAX_END) as number)) throw new NightPauseError(400, `O fim da pausa pode ser no máximo às ${MAX_END}, para dar tempo de reativar no mesmo dia.`);
  return { start: String(start).trim(), end: String(end).trim() };
}

function windowOf(plan: any): { start: number; end: number; startText: string; endText: string } | null {
  const start = parseHHMM(plan.night_pause_start ?? DEFAULT_START);
  const end = parseHHMM(plan.night_pause_end ?? DEFAULT_END);
  if (start === null || end === null || start >= end) return null;
  return { start, end, startText: String(plan.night_pause_start ?? DEFAULT_START), endText: String(plan.night_pause_end ?? DEFAULT_END) };
}

// ---------------------------------------------------------------------------------------------
// Trava no envio e tipos de erro
// ---------------------------------------------------------------------------------------------

/** Cada POST da pausa noturna: um campo só (status), só na direção pedida e só no ID da campanha. */
export function statusOnlyGuard(campaignId: string, direction?: 'PAUSED' | 'ACTIVE'): MetaPayloadGuard {
  const allowed = direction ? [direction] : ['PAUSED', 'ACTIVE'];
  return (endpoint, payload) => {
    const keys = Object.keys(payload || {});
    if (endpoint !== `/${campaignId}`) throw new Error('[NIGHT PAUSE GUARD]: só a campanha do plano pode ser alterada.');
    if (keys.length !== 1 || keys[0] !== 'status' || !allowed.includes(String(payload.status))) {
      throw new Error(`[NIGHT PAUSE GUARD]: a pausa noturna só muda a situação para ${allowed.join(' ou ')}.`);
    }
  };
}

/**
 * Antes de enviar (trava, credencial, objeto não sincronizado): nada saiu, tenta de novo.
 * Resultado desconhecido (tempo esgotado, erro da Meta 5xx, rede, limite de chamadas): relê a Meta.
 * Recusa clara da Meta (permissão, parâmetro): definitivo.
 */
export function classifySendError(message: string): 'PRE_SEND' | 'UNKNOWN' | 'REJECTED' {
  const m = String(message || '');
  if (/\[(SECURITY|VALIDATION|META CONFIG) EXCEPTION\]|\[NIGHT PAUSE GUARD\]/.test(m)) return 'PRE_SEND';
  if (/\[META TIMEOUT EXCEPTION\]/.test(m)) return 'UNKNOWN';
  if (/\[META GRAPH API ERROR\]/.test(m)) {
    if (/HTTP 5\d\d/.test(m)) return 'UNKNOWN';
    if (/\bcode (1|2|4|17|32|613|80004)\b/.test(m)) return 'UNKNOWN';
    if (/temporar|try again|rate limit|too many/i.test(m)) return 'UNKNOWN';
    return 'REJECTED';
  }
  // rede, banco depois do envio ou qualquer erro sem formato conhecido: não dá para saber se a Meta recebeu
  return 'UNKNOWN';
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
const instant = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  // a Meta manda "2026-10-24T03:01:00+0000"; Date aceita com ":" no fuso
  const t = Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(t) ? t : null;
};

export function campaignOfPlan(plan: any): string | null {
  const values = Object.values(normalizeMetaIds(plan.meta_ids).campaign || {});
  return values.length ? String(values[0]) : null;
}

type MetaState = Awaited<ReturnType<MetaMutatingClient['readCampaignState']>>;
type Outcome = { code: string; [k: string]: unknown };

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

export class NightPauseService {
  constructor(private clientFactory: () => MetaMutatingClient = () => new MetaMutatingClient()) {}

  private client(campaignId: string, direction?: 'PAUSED' | 'ACTIVE'): MetaMutatingClient {
    return this.clientFactory().withPayloadGuard(statusOnlyGuard(campaignId, direction));
  }

  /** Um ciclo (o agendador chama a cada 2 minutos). `now` só muda nos testes. Cada etapa e cada linha isoladas. */
  async run(pool: Pool, now: Date = new Date()) {
    const clock = spClock(now);
    const out: any = { sp_date: clock.date, sp_time: clock.hhmm, enabled: nightPauseEnabled(), mutation: mutationEnabled(), paused: [], resumed: [], skipped: [], other: [], errors: [] };
    const step = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (err) {
        out.errors.push({ step: name, error: errText(err) });
        console.error('[NIGHT PAUSE] etapa falhou', name, errText(err));
      }
    };
    await step('settle', () => this.settleStale(pool, out));
    await step('recheck', () => this.recheckUnconfirmed(pool, out));
    await step('expire', () => this.expireOld(pool, clock, out));
    await step('resume', () => this.resumeDue(pool, clock, out));
    if (out.enabled && out.mutation) await step('pause', () => this.pauseDue(pool, clock, out));
    return out;
  }

  private async perRow(out: any, label: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      out.errors.push({ row: label, error: errText(err) });
      console.error('[NIGHT PAUSE] linha falhou', label, errText(err));
    }
  }

  private async planOf(pool: Pool, planId: string) {
    return (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [planId])).rows[0];
  }

  // ------------------------------ pausar ------------------------------

  private async pauseDue(pool: Pool, clock: { date: string; minutes: number }, out: any) {
    const plans = (await pool.query(`SELECT * FROM launch_plans WHERE status IN ('ACTIVE', 'APPROVED') AND night_pause_enabled = TRUE`)).rows;
    const protectedIds = protectedMetaIds();
    for (const plan of plans) {
      await this.perRow(out, `pause:${plan.code}`, async () => {
        const w = windowOf(plan);
        if (!w || clock.minutes < w.start || clock.minutes >= Math.min(w.end, w.start + PAUSE_GRACE_MIN)) return;
        const cid = campaignOfPlan(plan);
        if (!cid || protectedIds.has(cid)) return;
        const done = await pool.query(`SELECT 1 FROM night_pause_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`, [cid, clock.date]);
        if (done.rows.length) return;
        const base = [plan.id, plan.code, cid, clock.date, w.startText, w.endText];
        const skip = async (status: string | null, reason: string) => {
          // a linha da noite fica gravada: se o dono reativar depois, esta noite não pausa
          await pool.query(
            `INSERT INTO night_pause_runs (plan_id, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status, reason)
             VALUES ($1, $2, $3, $4::date, $5, $6, 'SKIPPED', $7, $8)
             ON CONFLICT (meta_campaign_id, night_date) DO NOTHING`,
            [...base, status, reason]
          );
          out.skipped.push({ code: plan.code, reason });
        };
        if (plan.operator_paused_at) return skip('PAUSED', 'Pausada pela tela no início da pausa noturna.');
        if (String(plan.guard_state || '') === 'CAPPED') return skip('PAUSED', 'Parada pelo vigia do teto no início da pausa noturna.');

        let state: MetaState;
        try {
          state = await this.client(cid).readCampaignState(cid);
        } catch (err) {
          // sem leitura não pausa; tenta de novo no próximo ciclo dentro da tolerância
          out.other.push({ code: plan.code, read_failed: errText(err) });
          return;
        }
        if (String(state.status || '').toUpperCase() !== 'ACTIVE') {
          return skip(state.status, `Não estava ativa na Meta no início da pausa noturna (${state.status || 'sem situação'}).`);
        }
        const claim = await pool.query(
          `INSERT INTO night_pause_runs
             (plan_id, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status,
              meta_daily_budget_at_pause, plan_daily_budget_at_pause, plan_cap_at_pause, pause_started_at)
           VALUES ($1, $2, $3, $4::date, $5, $6, 'PAUSING', 'ACTIVE', $7, $8, $9, NOW())
           ON CONFLICT (meta_campaign_id, night_date) DO NOTHING RETURNING *`,
          [...base, state.daily_budget, plan.daily_budget_brl, plan.max_spend_brl]
        );
        if (!claim.rows.length) return; // outra instância pegou esta campanha nesta noite
        out.paused.push(await this.pause(pool, plan, claim.rows[0]));
      });
    }
  }

  private async pause(pool: Pool, plan: any, run: any): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE', decision: 'CAMPAIGN:PAUSED', planId: plan.id, planCode: plan.code, metaIds: [cid] }, { riskReducing: true });
    const changeId = await this.openChange(pool, plan, cid, 'ACTIVE', 'PAUSED');
    await pool.query(`UPDATE night_pause_runs SET pause_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
    const r = { ...run, pause_change_id: changeId };
    try {
      await this.client(cid, 'PAUSED').setEntityStatus(pool, 'CAMPAIGN', cid, 'PAUSED', META_CTX);
    } catch (err: any) {
      const msg = errText(err);
      await handle.finish('FAILED', { error: msg });
      const kind = classifySendError(msg);
      if (kind === 'UNKNOWN') return { code: plan.code, ...(await this.resolvePauseOutcome(pool, r, plan, msg)) };
      // nada saiu (ou a Meta recusou): a campanha segue ativa
      await this.pauseFailed(pool, r, plan, msg);
      return { code: plan.code, paused: false, error: msg };
    }
    await handle.finish('EXECUTED', { result: { campaign: cid, status: 'PAUSED' } });
    // a partir daqui, qualquer coisa nesta campanha é de outra pessoa ou rotina
    await pool.query(`UPDATE night_pause_runs SET quiet_since = COALESCE(quiet_since, NOW()), updated_at = NOW() WHERE id = $1`, [run.id]);
    const state = await this.confirmPause(pool, r, plan, true);
    return { code: plan.code, paused: true, state };
  }

  /** Envio com resultado desconhecido (ou interrompido): a releitura da Meta decide. */
  private async resolvePauseOutcome(pool: Pool, run: any, plan: any, msg: string): Promise<Record<string, unknown>> {
    const cid = String(run.meta_campaign_id);
    let status: string | null = null;
    try {
      status = String((await this.client(cid).readCampaignState(cid)).status || '').toUpperCase();
    } catch (err) {
      status = null;
    }
    if (status === 'PAUSED') {
      // a Meta aplicou: é uma pausa nossa como as outras
      await pool.query(`UPDATE night_pause_runs SET quiet_since = COALESCE(quiet_since, NOW()), error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
      return { paused: true, state: await this.confirmPause(pool, run, plan, true), note: 'resposta perdida; a Meta mostra PAUSED' };
    }
    if (status === null) {
      // sem leitura: pode ter pausado. Fica aguardando conferência; o próximo ciclo relê
      await pool.query(
        `UPDATE night_pause_runs SET state = 'PAUSE_UNCONFIRMED', quiet_since = COALESCE(quiet_since, NOW()), error = $2, updated_at = NOW() WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED')`,
        [run.id, msg]
      );
      await this.closeChange(pool, run.pause_change_id, 'UNCONFIRMED', null, msg);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_UNCONFIRMED', `Pausa noturna: resposta da Meta perdida ao pausar a campanha ${cid} do plano ${plan?.code || run.plan_code}; aguardando conferência.`, 'ACTIVE', null);
      return { paused: null, state: 'PAUSE_UNCONFIRMED' };
    }
    await this.pauseFailed(pool, run, plan, msg);
    return { paused: false, error: msg };
  }

  private async pauseFailed(pool: Pool, run: any, plan: any, msg: string) {
    const cid = String(run.meta_campaign_id);
    const code = plan?.code || run.plan_code;
    await pool.query(`UPDATE night_pause_runs SET state = 'PAUSE_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
    await this.closeChange(pool, run.pause_change_id, 'FAILED', null, msg);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_FAILED', `Pausa noturna não feita: plano ${code}, campanha ${cid}. ${msg}`, 'ACTIVE', null);
    if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_PAUSE_FAILED', `A pausa noturna não conseguiu pausar a campanha do plano ${code}: ${msg.slice(0, 200)}. A campanha segue ativa durante a noite.`);
  }

  /** Relê a Meta: PAUSED → "Confirmado pela Meta". Senão (ou sem leitura) fica aguardando conferência. */
  private async confirmPause(pool: Pool, run: any, plan: any, first: boolean): Promise<string> {
    const cid = String(run.meta_campaign_id);
    let read: MetaState | null = null;
    try {
      read = await this.client(cid).readCampaignState(cid);
    } catch (err) {
      console.warn('[NIGHT PAUSE] releitura falhou; fica aguardando conferência', errText(err));
    }
    const status = read ? String(read.status || '').toUpperCase() : null;
    if (status === 'PAUSED') {
      const upd = await pool.query(
        `UPDATE night_pause_runs SET state = 'PAUSED', paused_at = NOW(), quiet_since = COALESCE(quiet_since, NOW()), meta_updated_time_at_pause = $2, error = NULL, updated_at = NOW()
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
      `UPDATE night_pause_runs SET state = 'PAUSE_UNCONFIRMED', quiet_since = COALESCE(quiet_since, NOW()), updated_at = NOW() WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED') RETURNING id`,
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
      await pool.query(
        `SELECT * FROM night_pause_runs
         WHERE state IN ('PAUSED', 'PAUSE_UNCONFIRMED') AND night_date = $1::date
           AND (resume_attempts = 0 OR resume_started_at IS NULL OR resume_started_at < NOW() - INTERVAL '${RESUME_RETRY_MIN} minutes')
         ORDER BY created_at`,
        [clock.date]
      )
    ).rows;
    for (const r of rows) {
      await this.perRow(out, `resume:${r.plan_code}`, async () => {
        const end = parseHHMM(r.window_end);
        if (end === null || clock.minutes < end) return;
        if (!mutationEnabled()) {
          out.other.push({ code: r.plan_code, waiting: 'META_MUTATION_ENABLED desligado' });
          return;
        }
        const claim = await pool.query(
          `UPDATE night_pause_runs SET state = 'REACTIVATING', resume_started_at = NOW(), resume_change_id = NULL, resume_attempts = resume_attempts + 1, updated_at = NOW()
           WHERE id = $1 AND state = $2 RETURNING *`,
          [r.id, r.state]
        );
        if (!claim.rows.length) return; // outra instância pegou
        out.resumed.push(await this.resume(pool, claim.rows[0], r.state));
      });
    }
  }

  private async cancelResume(pool: Pool, run: any, plan: any, reason: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = plan?.code || run.plan_code;
    await pool.query(`UPDATE night_pause_runs SET state = 'CANCELLED', reason = $2, resume_change_id = NULL, updated_at = NOW() WHERE id = $1`, [run.id, reason]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_CANCELLED', `Fim da pausa noturna cancelado: a campanha ${cid} do plano ${code} continua pausada. Motivo: ${reason}`, 'PAUSED', 'PAUSED');
    if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_CANCELLED', `A campanha do plano ${code} não foi reativada de manhã: ${reason} Ela continua pausada; reative pela tela se quiser.`);
    return { code, resumed: false, cancelled: reason };
  }

  /** Volta para tentar no próximo ciclo (todas as conferências de novo). Na 3.ª falha avisa; na 5.ª desiste. */
  private async retryResume(pool: Pool, run: any, plan: any, previousState: string, why: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = plan?.code || run.plan_code;
    const attempts = Number(run.resume_attempts) || 1;
    if (attempts >= MAX_RESUME_ATTEMPTS) return this.resumeFailed(pool, run, plan, `${why} (${attempts} tentativas)`);
    await pool.query(`UPDATE night_pause_runs SET state = $2, resume_change_id = NULL, error = $3, updated_at = NOW() WHERE id = $1`, [run.id, previousState, why.slice(0, 500)]);
    if (plan && attempts === FAILURES_ALERT) {
      await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna ainda não conseguiu reativar a campanha do plano ${code} (${attempts} tentativas): ${why.slice(0, 200)}. O NORQVA tenta de novo até ${MAX_RESUME_ATTEMPTS} vezes, até 23:59.`);
    }
    return { code, resumed: false, retry: why, attempts };
  }

  private async resumeFailed(pool: Pool, run: any, plan: any, msg: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = plan?.code || run.plan_code;
    await pool.query(`UPDATE night_pause_runs SET state = 'RESUME_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg.slice(0, 500)]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_FAILED', `Fim da pausa noturna falhou: a campanha ${cid} do plano ${code} continua pausada. ${msg}`, 'PAUSED', null);
    if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna não conseguiu reativar a campanha do plano ${code}: ${msg.slice(0, 200)}. Ela continua pausada; reative pela tela se quiser.`);
    return { code, resumed: false, error: msg };
  }

  /** Conferências do plano (sem a Meta). Devolve o motivo para não reativar, ou null. */
  private planBlock(plan: any, run: any, cid: string): string | null {
    if (!plan) return 'o plano não existe mais.';
    if (!['ACTIVE', 'APPROVED'].includes(String(plan.status))) return `o plano está como ${plan.status}.`;
    if (plan.operator_paused_at) return 'a campanha foi pausada pela tela durante a noite.';
    if (String(plan.guard_state || '') === 'CAPPED') return 'o vigia do teto parou a campanha.';
    if (protectedMetaIds().has(cid)) return 'campanha protegida (CONTROL).';
    if (campaignOfPlan(plan) !== cid) return 'a campanha do plano mudou.';
    if (!sameMoney(plan.max_spend_brl, run.plan_cap_at_pause)) return 'o teto do plano mudou durante a noite.';
    if (!sameMoney(plan.daily_budget_brl, run.plan_daily_budget_at_pause)) return 'o orçamento do plano mudou durante a noite.';
    return null;
  }

  private async resume(pool: Pool, run: any, previousState: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    let sent = false;
    const result = await withPlanLock(pool, String(run.plan_id), async (): Promise<Outcome | null> => {
      const plan = await this.planOf(pool, run.plan_id);
      const blocked = this.planBlock(plan, run, cid);
      if (blocked) return this.cancelResume(pool, run, plan, blocked);

      let touched: string | null;
      try {
        touched = await this.touchedSince(pool, run, plan, 'pause');
      } catch (err) {
        return this.retryResume(pool, run, plan, previousState, `não foi possível conferir o que aconteceu durante a noite (${errText(err)})`);
      }
      if (touched) return this.cancelResume(pool, run, plan, touched);

      const client = this.client(cid, 'ACTIVE');
      let state: MetaState;
      try {
        state = await client.readCampaignState(cid);
      } catch (err) {
        return this.retryResume(pool, run, plan, previousState, `leitura da campanha na Meta falhou (${errText(err)})`);
      }
      await pool.query(`UPDATE night_pause_runs SET meta_updated_time_at_resume = $2 WHERE id = $1`, [run.id, state.updated_time]);
      const status = String(state.status || '').toUpperCase();
      if (status !== 'PAUSED') return this.cancelResume(pool, run, plan, `na Meta a campanha está ${status || 'sem situação'}, não pausada: alguém mexeu nela ou a pausa não pegou.`);

      // mexeram fora do NORQVA (Gerenciador)? Registro de atividades da conta; sem ele, a hora da última alteração
      const outside = await this.touchedOnMeta(pool, run, plan, client, state);
      if (outside) return this.cancelResume(pool, run, plan, outside);
      if (money(run.meta_daily_budget_at_pause) !== null && !sameMoney(state.daily_budget, run.meta_daily_budget_at_pause)) {
        return this.cancelResume(pool, run, plan, 'o orçamento da campanha mudou na Meta durante a noite.');
      }
      let spend: { spend: number; spend_cap: number | null };
      try {
        spend = await client.getCampaignLifetimeSpend(cid);
      } catch (err) {
        return this.retryResume(pool, run, plan, previousState, `leitura do gasto na Meta falhou (${errText(err)})`);
      }
      const cap = money(plan.max_spend_brl);
      if (cap !== null && spend.spend >= cap - 0.005) return this.cancelResume(pool, run, plan, `o teto foi atingido (${brl(spend.spend)} de ${brl(cap)}).`);
      if (spend.spend_cap !== null && spend.spend >= spend.spend_cap - 0.005) {
        return this.cancelResume(pool, run, plan, `o limite de gastos da campanha na Meta foi atingido (${brl(spend.spend)} de ${brl(spend.spend_cap)}).`);
      }

      // reativar aumenta exposição: sem registro de decisão, não reativa agora (fail-closed) e tenta de novo
      let handle;
      try {
        handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE_RESUME', decision: 'CAMPAIGN:ACTIVE', planId: plan.id, planCode: plan.code, metaIds: [cid] });
      } catch (err) {
        return this.retryResume(pool, run, plan, previousState, `auditoria de decisões indisponível (${errText(err)})`);
      }
      // o plano de novo, logo antes do envio (dentro da trava)
      const fresh = await this.planOf(pool, run.plan_id);
      const late = this.planBlock(fresh, run, cid);
      if (late) {
        await handle.finish('REJECTED', { error: late });
        return this.cancelResume(pool, run, fresh, late);
      }
      const changeId = await this.openChange(pool, plan, cid, 'PAUSED', 'ACTIVE');
      await pool.query(`UPDATE night_pause_runs SET resume_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
      run.resume_change_id = changeId;
      try {
        await client.setEntityStatus(pool, 'CAMPAIGN', cid, 'ACTIVE', META_CTX);
      } catch (err: any) {
        const msg = errText(err);
        await handle.finish('FAILED', { error: msg });
        const kind = classifySendError(msg);
        if (kind === 'PRE_SEND') {
          await this.closeChange(pool, changeId, 'FAILED', null, `não enviado: ${msg}`);
          return this.retryResume(pool, run, plan, previousState, `não enviado (${msg})`);
        }
        if (kind === 'REJECTED') {
          await this.closeChange(pool, changeId, 'FAILED', null, msg);
          return this.resumeFailed(pool, run, plan, msg);
        }
        // resultado desconhecido: a releitura decide
        let after: string | null = null;
        try {
          after = String((await client.readCampaignState(cid)).status || '').toUpperCase();
        } catch {
          after = null;
        }
        if (after === 'PAUSED') {
          await this.closeChange(pool, changeId, 'FAILED', 'PAUSED', msg);
          return this.retryResume(pool, run, plan, previousState, `a Meta não confirmou (${msg})`);
        }
        if (after === null) {
          await pool.query(`UPDATE night_pause_runs SET state = 'RESUME_UNCONFIRMED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
          await this.closeChange(pool, changeId, 'UNCONFIRMED', null, msg);
          return { code: plan.code, resumed: null, state: 'RESUME_UNCONFIRMED' };
        }
        // ACTIVE: a Meta aplicou; segue como envio feito
      }
      if (handle) await handle.finish('EXECUTED', { result: { campaign: cid, status: 'ACTIVE' } }).catch(() => false);
      sent = true;
      return null;
    });
    if (result) return result;
    if (!sent) return { code: run.plan_code, resumed: false };

    // depois do envio (fora da trava): alguém mexeu enquanto reativávamos? Então pausa de novo na hora
    const plan = await this.planOf(pool, run.plan_id);
    let race: string | null = this.planBlock(plan, run, cid);
    if (!race) {
      try {
        race = await this.touchedSince(pool, run, plan, 'resume');
      } catch (err) {
        race = `não foi possível conferir depois de reativar (${errText(err)})`;
      }
    }
    if (race) return this.repause(pool, run, plan, race);
    const final = await this.confirmResume(pool, run, true);
    return { code: plan?.code || run.plan_code, resumed: true, state: final };
  }

  /** Alguém mexeu durante a reativação: pausa de novo (reduz exposição) e avisa como crítico. */
  private async repause(pool: Pool, run: any, plan: any, reason: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = plan?.code || run.plan_code;
    const handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE_REPAUSE', decision: 'CAMPAIGN:PAUSED', planId: plan?.id || run.plan_id, planCode: code, metaIds: [cid] }, { riskReducing: true });
    let note = 'pausada de novo';
    try {
      await this.client(cid, 'PAUSED').setEntityStatus(pool, 'CAMPAIGN', cid, 'PAUSED', META_CTX);
      await handle.finish('EXECUTED', { result: { campaign: cid, status: 'PAUSED' } });
    } catch (err: any) {
      note = `FALHOU ao pausar de novo (${errText(err)})`;
      await handle.finish('FAILED', { error: errText(err) });
    }
    await this.closeChange(pool, run.resume_change_id, 'FAILED', null, `alteração durante a reativação: ${reason}`);
    await pool.query(`UPDATE night_pause_runs SET state = 'CANCELLED', reason = $2, updated_at = NOW() WHERE id = $1`, [run.id, `Alteração durante a reativação (${reason}); ${note}.`]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_CANCELLED', `Fim da pausa noturna desfeito: alguém mexeu na campanha ${cid} do plano ${code} durante a reativação (${reason}); ${note}.`, 'ACTIVE', 'PAUSED');
    if (plan) {
      await this.alert(pool, plan, cid, 'NIGHT_PAUSE_RACE', `A campanha do plano ${code} foi reativada pela pausa noturna no mesmo instante em que alguém mexeu nela (${reason}). O NORQVA ${note}. Confira agora.`);
    }
    return { code, resumed: false, repaused: note, reason };
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
    if (!first && status === 'PAUSED') {
      // a reativação não pegou: volta para tentar de novo (com todas as conferências)
      const back = run.paused_at ? 'PAUSED' : 'PAUSE_UNCONFIRMED';
      const upd = await pool.query(
        `UPDATE night_pause_runs SET state = $2, resume_change_id = NULL, error = 'reativação não apareceu na Meta', updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
        [run.id, back]
      );
      if (upd.rows.length) await this.closeChange(pool, run.resume_change_id, 'FAILED', 'PAUSED', 'reativação não apareceu na Meta');
      return back;
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
   * Alguém (ou outra rotina do NORQVA) mexeu no plano ou na campanha? Fichas de alteração, decisões e registros
   * de auditoria do plano ou dos objetos dele, menos os da própria pausa noturna. `from`: 'pause' = desde a
   * pausa (quiet_since); 'resume' = desde o início desta tentativa de reativar. O instante vem do banco
   * (subconsulta): passar pelo JavaScript perderia os microssegundos.
   */
  async touchedSince(pool: Pool, run: any, plan: any, from: 'pause' | 'resume'): Promise<string | null> {
    const SINCE =
      from === 'pause'
        ? `(SELECT COALESCE(quiet_since, pause_started_at) FROM night_pause_runs WHERE id = $1)`
        : `(SELECT resume_started_at FROM night_pause_runs WHERE id = $1)`;
    const cid = String(run.meta_campaign_id);
    const ids = new Set<string>([cid, ...metaIdsOfPlan(normalizeMetaIds(plan.meta_ids))]);
    const idList = Array.from(ids);

    const changes = await pool.query(
      `SELECT kind, requested_value, requested_by_name FROM meta_change_requests
       WHERE (created_at > ${SINCE} OR sent_at > ${SINCE} OR approved_at > ${SINCE})
         AND is_demo = FALSE AND COALESCE(origin, '') <> 'NIGHT_PAUSE'
         AND (plan_id = $2 OR meta_campaign_id = $3 OR meta_id = ANY($4::text[]))
       LIMIT 1`,
      [run.id, plan.id, cid, idList]
    );
    if (changes.rows.length) {
      const c = changes.rows[0];
      return `houve uma alteração pedida na campanha (${c.kind === 'STATUS' ? (c.requested_value === 'PAUSED' ? 'pausar' : 'reativar') : 'orçamento'}${c.requested_by_name ? `, por ${c.requested_by_name}` : ''}).`;
    }

    const decisions = await pool.query(
      `SELECT action FROM decision_events
       WHERE created_at > ${SINCE} AND is_demo = FALSE AND action NOT LIKE 'NIGHT_PAUSE%'
         AND (plan_id = $2 OR meta_ids ?| $3::text[])
       ORDER BY created_at LIMIT 1`,
      [run.id, plan.id, idList]
    );
    if (decisions.rows.length) return `houve outra decisão sobre a campanha (${decisions.rows[0].action}).`;

    const audits = await pool.query(
      `SELECT event_type, description FROM audit_logs
       WHERE created_at > ${SINCE} AND is_demo = FALSE AND event_type = ANY($2::text[])
       ORDER BY created_at LIMIT 500`,
      [run.id, TOUCH_EVENTS]
    );
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [String(plan.code), ...idList].map((t) => new RegExp(`(^|[^A-Za-z0-9_-])${esc(t)}([^A-Za-z0-9_-]|$)`, 'i'));
    for (const a of audits.rows) {
      const text = String(a.description || '');
      if (patterns.some((p) => p.test(text))) return `a campanha foi alterada (${a.event_type}).`;
    }
    return null;
  }

  /** App do token (cache por processo). META_APP_ID tem prioridade. null = não deu para saber. */
  private static tokenAppId: { value: string | null; at: number } | null = null;
  private async ownAppId(client: MetaMutatingClient): Promise<string | null> {
    const env = String(process.env.META_APP_ID || '').trim();
    if (env) return env;
    const cached = NightPauseService.tokenAppId;
    // sucesso fica 12 h; falha é tentada de novo no próximo uso
    if (cached && cached.value && Date.now() - cached.at < 12 * 3600 * 1000) return cached.value;
    try {
      const value = await client.readTokenAppId();
      NightPauseService.tokenAppId = { value, at: Date.now() };
      return value;
    } catch {
      return null;
    }
  }

  /** Só para testes. */
  static resetAppCacheForTesting() {
    NightPauseService.tokenAppId = null;
  }

  /**
   * Mexeram na campanha fora do NORQVA durante a noite? Lê o registro de atividades da conta de anúncios e
   * procura evento na campanha, nos conjuntos (inclusive orçamento ABO) ou nos anúncios do plano que não seja
   * do NORQVA. O token pode ser do próprio dono, então o usuário (actor_id) não diz nada: "nosso" é só
   *  - evento do app a que o token pertence (GET /app, ou META_APP_ID); ou
   *  - sem app no evento (ou app desconhecido): a própria mudança de situação da campanha, até 2 minutos antes
   *    ou depois do nosso envio de pausa (ou desta tentativa de reativar).
   * Todo o resto conta como mexido (na dúvida, não reativa). Sem o registro, compara updated_time.
   */
  private async touchedOnMeta(pool: Pool, run: any, plan: any, client: MetaMutatingClient, state: MetaState): Promise<string | null> {
    const cid = String(run.meta_campaign_id);
    const ids = new Set<string>([cid, ...metaIdsOfPlan(normalizeMetaIds(plan.meta_ids))]);
    const ms = (v: unknown) => (v ? new Date(v as any).getTime() : null);
    const startMs = ms(run.pause_started_at);
    try {
      if (startMs === null) throw new Error('sem hora da pausa');
      const events = await client.readAccountActivities(startMs / 1000 - 180, Date.now() / 1000 + 60);
      const appId = await this.ownAppId(client);
      const TOL = 2 * 60 * 1000;
      const sends: Array<[number, number]> = [];
      const pauseEnd = ms(run.quiet_since) ?? ms(run.paused_at) ?? startMs;
      sends.push([startMs - TOL, pauseEnd + TOL]);
      const resumeAt = ms(run.resume_started_at);
      if (resumeAt !== null) sends.push([resumeAt - TOL, Date.now() + TOL]);
      const ownStatusChange = (e: (typeof events)[number]) => {
        if (String(e.object_id) !== cid || !/status/i.test(String(e.event_type || ''))) return false;
        const t = instant(e.event_time);
        return t !== null && sends.some(([a, b]) => t >= a && t <= b);
      };
      const ours = (e: (typeof events)[number]) => {
        if (appId) return e.application_id === appId || (!e.application_id && ownStatusChange(e));
        return ownStatusChange(e);
      };
      const foreign = events.find((e) => {
        if (!e.object_id || !ids.has(String(e.object_id))) return false;
        const t = instant(e.event_time);
        if (t !== null && t < startMs - TOL) return false;
        return !ours(e);
      });
      await pool.query(`UPDATE night_pause_runs SET activity_check = $2 WHERE id = $1`, [run.id, foreign ? 'TOUCHED' : appId ? 'CLEAN' : 'CLEAN_NO_APP']);
      if (foreign) return `a campanha foi alterada na Meta durante a noite fora do NORQVA (${foreign.event_type || 'alteração'}).`;
      return null;
    } catch (err) {
      await pool.query(`UPDATE night_pause_runs SET activity_check = 'UNAVAILABLE' WHERE id = $1`, [run.id]);
      const before = instant(run.meta_updated_time_at_pause);
      const now = instant(state.updated_time);
      if (before !== null && now !== null && now !== before) return 'a campanha foi alterada na Meta durante a noite.';
      return null;
    }
  }

  // ------------------------------ conferências e prazos ------------------------------

  /** Envio interrompido (queda no meio): sem envio → volta; com envio → a releitura decide. */
  private async settleStale(pool: Pool, out: any) {
    const stale = (
      await pool.query(
        `SELECT * FROM night_pause_runs
         WHERE (state = 'PAUSING' AND pause_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')
            OR (state = 'REACTIVATING' AND resume_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')`
      )
    ).rows;
    for (const r of stale) {
      await this.perRow(out, `settle:${r.plan_code}`, async () => {
        const plan = await this.planOf(pool, r.plan_id);
        if (r.state === 'PAUSING') {
          if (!r.pause_change_id) {
            // interrompida antes do envio: nada foi pausado
            await this.pauseFailed(pool, r, plan, 'pausa interrompida antes do envio');
            out.other.push({ code: r.plan_code, stale: 'PAUSING', sent: false });
            return;
          }
          const res = await this.resolvePauseOutcome(pool, r, plan, 'envio interrompido');
          out.other.push({ code: r.plan_code, stale: 'PAUSING', ...res });
          return;
        }
        const back = r.paused_at ? 'PAUSED' : 'PAUSE_UNCONFIRMED';
        if (!r.resume_change_id) {
          // a reativação nunca chegou a enviar: tenta de novo
          await pool.query(`UPDATE night_pause_runs SET state = $2, error = 'reativação interrompida antes do envio', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id, back]);
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', sent: false });
          return;
        }
        let status: string | null = null;
        try {
          status = String((await this.client(String(r.meta_campaign_id)).readCampaignState(String(r.meta_campaign_id))).status || '').toUpperCase();
        } catch {
          status = null;
        }
        if (status === 'ACTIVE') {
          const s = await this.confirmResume(pool, r, true);
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', state: s });
        } else if (status === 'PAUSED') {
          await pool.query(`UPDATE night_pause_runs SET state = $2, resume_change_id = NULL, error = 'reativação interrompida', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id, back]);
          await this.closeChange(pool, r.resume_change_id, 'FAILED', 'PAUSED', 'reativação interrompida');
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', retry: true });
        } else {
          await pool.query(`UPDATE night_pause_runs SET state = 'RESUME_UNCONFIRMED', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id]);
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', state: 'RESUME_UNCONFIRMED' });
        }
      });
    }
  }

  /** Conferências pendentes (a Meta aceitou mas a releitura ainda não mostrava), de qualquer dia. */
  private async recheckUnconfirmed(pool: Pool, out: any) {
    const rows = (await pool.query(`SELECT * FROM night_pause_runs WHERE state IN ('PAUSE_UNCONFIRMED', 'RESUME_UNCONFIRMED') ORDER BY created_at LIMIT 200`)).rows;
    for (const r of rows) {
      await this.perRow(out, `recheck:${r.plan_code}`, async () => {
        const s = r.state === 'PAUSE_UNCONFIRMED' ? await this.confirmPause(pool, r, await this.planOf(pool, r.plan_id), false) : await this.confirmResume(pool, r, false);
        if (s !== r.state) out.other.push({ code: r.plan_code, confirmed: s });
      });
    }
  }

  /** Passou de 23:59 do dia da pausa: não reativa mais; registra e avisa. */
  private async expireOld(pool: Pool, clock: { date: string }, out: any) {
    const expired = (
      await pool.query(
        `UPDATE night_pause_runs SET state = 'EXPIRED', reason = 'Não foi reativada até 23:59 do dia da pausa.', updated_at = NOW()
         WHERE state IN ('PAUSED', 'PAUSE_UNCONFIRMED', 'RESUME_UNCONFIRMED') AND night_date < $1::date RETURNING *`,
        [clock.date]
      )
    ).rows;
    for (const r of expired) {
      await this.perRow(out, `expire:${r.plan_code}`, async () => {
        const cid = String(r.meta_campaign_id);
        await writeAuditLog(pool, null, 'NIGHT_PAUSE_EXPIRED', `Fim da pausa noturna não aconteceu até 23:59: a campanha ${cid} do plano ${r.plan_code} continua pausada.`, 'PAUSED', 'PAUSED');
        const plan = await this.planOf(pool, r.plan_id);
        if (plan) await this.alert(pool, plan, cid, 'NIGHT_PAUSE_EXPIRED', `A campanha do plano ${plan.code} ficou pausada: o NORQVA não conseguiu reativá-la até 23:59 do dia da pausa. Reative pela tela se quiser.`);
        out.other.push({ code: r.plan_code, expired: true });
      });
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
      [id, plan.id, plan.code, cid, name || plan.spec?.campaign?.name || null, previous, requested, WHO]
    );
    return id;
  }

  private async closeChange(pool: Pool, id: string | null, state: 'CONFIRMED' | 'UNCONFIRMED' | 'FAILED', metaValue: string | null, error: string | null = null) {
    if (!id) return;
    await pool.query(
      `UPDATE meta_change_requests SET state = $2, meta_value = $3, verified_at = NOW(),
              confirmed_at = CASE WHEN $5 THEN NOW() ELSE confirmed_at END, error = COALESCE($4, error), updated_at = NOW()
       WHERE id = $1 AND state IN ('SENDING', 'UNCONFIRMED')`,
      [id, state, metaValue, error, state === 'CONFIRMED']
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
      max_end: MAX_END,
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
      if (r.paused.length || r.resumed.length || r.other.length || r.errors.length) console.log('[NIGHT PAUSE]', JSON.stringify(r));
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
