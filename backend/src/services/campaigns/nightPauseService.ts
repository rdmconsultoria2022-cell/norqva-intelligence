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
// NORQVA-0122 (D-0122): o mesmo vale para campanhas criadas fora do NORQVA cadastradas na lista
// night_pause_external_campaigns (noites em night_pause_external_runs). Para elas não há plano: valem as
// conferências da Meta (situação, registro de atividades, orçamento, limite de gastos) e as fichas/decisões
// sobre a campanha. Se a campanha também for de um plano, o plano manda.

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
    if (endpoint !== `/${campaignId}`) throw new Error('[NIGHT PAUSE GUARD]: só a própria campanha pode ser alterada.');
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
// De onde vem a campanha: plano de lançamento ou campanha criada fora do NORQVA (NORQVA-0122)
// ---------------------------------------------------------------------------------------------

type Kind = 'PLAN' | 'EXTERNAL';
interface Src {
  kind: Kind;
  /** tabela das noites */
  table: 'night_pause_runs' | 'night_pause_external_runs';
  /** coluna que liga a noite à configuração */
  ownerCol: 'plan_id' | 'external_id';
}
const PLAN_SRC: Src = { kind: 'PLAN', table: 'night_pause_runs', ownerCol: 'plan_id' };
const EXT_SRC: Src = { kind: 'EXTERNAL', table: 'night_pause_external_runs', ownerCol: 'external_id' };
const SOURCES = [PLAN_SRC, EXT_SRC];
const srcOf = (run: any): Src => (run && run.external_id ? EXT_SRC : PLAN_SRC);

/** Dono de uma noite: plano ou campanha externa, com o que os textos e as conferências precisam. */
interface Owner {
  kind: Kind;
  /** id da configuração (plano ou linha externa) */
  ownerId: string;
  /** id do plano (decisões, fichas); null nas externas */
  planId: string | null;
  /** rótulo nos textos: código do plano ou nome da campanha */
  code: string;
  name: string;
  cid: string | null;
  /** "do plano X" ou "criada fora do NORQVA" */
  of: string;
  raw: any;
}

function planOwner(plan: any): Owner {
  return {
    kind: 'PLAN',
    ownerId: String(plan.id),
    planId: String(plan.id),
    code: String(plan.code),
    name: plan.spec?.campaign?.name || String(plan.code),
    cid: campaignOfPlan(plan),
    of: `do plano ${plan.code}`,
    raw: plan
  };
}

function externalOwner(ext: any): Owner {
  const name = ext.name || `Campanha ${ext.meta_campaign_id}`;
  return {
    kind: 'EXTERNAL',
    ownerId: String(ext.id),
    planId: null,
    code: name,
    name,
    cid: String(ext.meta_campaign_id),
    of: `"${name}" (criada fora do NORQVA)`,
    raw: ext
  };
}

/** Campanhas que já são de um plano (o plano tem precedência sobre a lista de externas). */
async function planCampaignIds(pool: Pool): Promise<Set<string>> {
  const r = await pool.query(`SELECT meta_ids FROM launch_plans WHERE meta_ids IS NOT NULL AND meta_ids::text <> '{}'`);
  const out = new Set<string>();
  for (const p of r.rows) {
    const c = campaignOfPlan(p);
    if (c) out.add(c);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------------------------

let defaultClientFactory: () => MetaMutatingClient = () => new MetaMutatingClient();
/** Só para testes: cliente da Meta simulado para as rotas (que criam o serviço sem parâmetro). */
export function setNightPauseClientFactoryForTesting(factory: (() => MetaMutatingClient) | null) {
  defaultClientFactory = factory || (() => new MetaMutatingClient());
}

export class NightPauseService {
  private clientFactory: () => MetaMutatingClient;
  constructor(clientFactory?: () => MetaMutatingClient) {
    this.clientFactory = clientFactory || (() => defaultClientFactory());
  }

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
    for (const src of SOURCES) {
      await step(`settle:${src.kind}`, () => this.settleStale(pool, src, out));
      await step(`recheck:${src.kind}`, () => this.recheckUnconfirmed(pool, src, out));
      await step(`expire:${src.kind}`, () => this.expireOld(pool, src, clock, out));
      await step(`resume:${src.kind}`, () => this.resumeDue(pool, src, clock, out));
    }
    // campanhas externas ainda sem linha em meta_campaigns: cópia mínima lida na Meta (sem esperar a sincronização)
    await step('mirror:EXTERNAL', () => this.ensureExternalMirrors(pool, out));
    if (out.enabled && out.mutation) {
      await step('pause:PLAN', () => this.pauseDuePlans(pool, clock, out));
      await step('pause:EXTERNAL', () => this.pauseDueExternal(pool, clock, out));
    }
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

  /** Dono da noite (mesmo excluído ou desligado: a noite em curso termina normalmente). */
  private async ownerOf(pool: Pool, run: any): Promise<Owner | null> {
    if (srcOf(run).kind === 'EXTERNAL') {
      const r = (await pool.query(`SELECT * FROM night_pause_external_campaigns WHERE id = $1`, [run.external_id])).rows[0];
      return r ? externalOwner(r) : null;
    }
    const p = (await pool.query(`SELECT * FROM launch_plans WHERE id = $1`, [run.plan_id])).rows[0];
    return p ? planOwner(p) : null;
  }

  private lockKey(run: any): string {
    return srcOf(run).kind === 'EXTERNAL' ? `ext:${run.meta_campaign_id}` : String(run.plan_id);
  }

  // ------------------------------ pausar ------------------------------

  private async pauseDuePlans(pool: Pool, clock: { date: string; minutes: number }, out: any) {
    const plans = (await pool.query(`SELECT * FROM launch_plans WHERE status IN ('ACTIVE', 'APPROVED') AND night_pause_enabled = TRUE`)).rows;
    for (const plan of plans) {
      await this.perRow(out, `pause:${plan.code}`, async () => {
        const owner = planOwner(plan);
        const preSkip = plan.operator_paused_at
          ? 'Pausada pela tela no início da pausa noturna.'
          : String(plan.guard_state || '') === 'CAPPED'
            ? 'Parada pelo vigia do teto no início da pausa noturna.'
            : null;
        await this.pauseOne(pool, PLAN_SRC, owner, windowOf(plan), clock, out, preSkip, { daily: plan.daily_budget_brl, cap: plan.max_spend_brl });
      });
    }
  }

  private async pauseDueExternal(pool: Pool, clock: { date: string; minutes: number }, out: any) {
    const rows = (await pool.query(`SELECT * FROM night_pause_external_campaigns WHERE enabled = TRUE AND deleted_at IS NULL ORDER BY created_at`)).rows;
    if (!rows.length) return;
    const ofPlans = await planCampaignIds(pool);
    for (const ext of rows) {
      await this.perRow(out, `pause:ext:${ext.meta_campaign_id}`, async () => {
        // campanha que também é de um plano: o plano manda (nunca duas linhas para a mesma campanha)
        if (ofPlans.has(String(ext.meta_campaign_id))) return;
        await this.pauseOne(pool, EXT_SRC, externalOwner(ext), windowOf(ext), clock, out, null, { daily: null, cap: null });
      });
    }
  }

  private async pauseOne(
    pool: Pool,
    src: Src,
    owner: Owner,
    w: ReturnType<typeof windowOf>,
    clock: { date: string; minutes: number },
    out: any,
    preSkip: string | null,
    snap: { daily: unknown; cap: unknown }
  ) {
    if (!w || clock.minutes < w.start || clock.minutes >= Math.min(w.end, w.start + PAUSE_GRACE_MIN)) return;
    const cid = owner.cid;
    if (!cid || protectedMetaIds().has(cid)) return;
    // nunca duas noites para a mesma campanha (plano ou externa)
    const done = await pool.query(
      `SELECT 1 FROM night_pause_runs WHERE meta_campaign_id = $1 AND night_date = $2::date
       UNION ALL SELECT 1 FROM night_pause_external_runs WHERE meta_campaign_id = $1 AND night_date = $2::date`,
      [cid, clock.date]
    );
    if (done.rows.length) return;
    const base = [owner.ownerId, owner.code.slice(0, 255), cid, clock.date, w.startText, w.endText];
    const skip = async (status: string | null, reason: string) => {
      // a linha da noite fica gravada: se o dono reativar depois, esta noite não pausa
      await pool.query(
        `INSERT INTO ${src.table} (${src.ownerCol}, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status, reason)
         VALUES ($1, $2, $3, $4::date, $5, $6, 'SKIPPED', $7, $8)
         ON CONFLICT (meta_campaign_id, night_date) DO NOTHING`,
        [...base, status, reason]
      );
      out.skipped.push({ code: owner.code, reason });
    };
    if (preSkip) return skip('PAUSED', preSkip);

    let state: MetaState;
    try {
      state = await this.client(cid).readCampaignState(cid);
    } catch (err) {
      // sem leitura não pausa; tenta de novo no próximo ciclo dentro da tolerância
      out.other.push({ code: owner.code, read_failed: errText(err) });
      return;
    }
    if (String(state.status || '').toUpperCase() !== 'ACTIVE') {
      return skip(state.status, `Não estava ativa na Meta no início da pausa noturna (${state.status || 'sem situação'}).`);
    }
    const claim = await pool.query(
      `INSERT INTO ${src.table}
         (${src.ownerCol}, plan_code, meta_campaign_id, night_date, window_start, window_end, state, previous_status,
          meta_daily_budget_at_pause, plan_daily_budget_at_pause, plan_cap_at_pause, pause_started_at)
       VALUES ($1, $2, $3, $4::date, $5, $6, 'PAUSING', 'ACTIVE', $7, $8, $9, NOW())
       ON CONFLICT (meta_campaign_id, night_date) DO NOTHING RETURNING *`,
      [...base, state.daily_budget, snap.daily, snap.cap]
    );
    if (!claim.rows.length) return; // outra instância pegou esta campanha nesta noite
    out.paused.push(await this.pause(pool, owner, claim.rows[0]));
  }

  private async pause(pool: Pool, owner: Owner, run: any): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE', decision: 'CAMPAIGN:PAUSED', planId: owner.planId, planCode: owner.planId ? owner.code : null, metaIds: [cid] }, { riskReducing: true });
    const changeId = await this.openChange(pool, owner, cid, 'ACTIVE', 'PAUSED');
    await pool.query(`UPDATE ${srcOf(run).table} SET pause_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
    const r = { ...run, pause_change_id: changeId };
    try {
      await this.client(cid, 'PAUSED').setEntityStatus(pool, 'CAMPAIGN', cid, 'PAUSED', META_CTX);
    } catch (err: any) {
      const msg = errText(err);
      await handle.finish('FAILED', { error: msg });
      const kind = classifySendError(msg);
      if (kind === 'UNKNOWN') return { code: owner.code, ...(await this.resolvePauseOutcome(pool, r, owner, msg)) };
      // nada saiu (ou a Meta recusou): a campanha segue ativa
      await this.pauseFailed(pool, r, owner, msg);
      return { code: owner.code, paused: false, error: msg };
    }
    await handle.finish('EXECUTED', { result: { campaign: cid, status: 'PAUSED' } });
    // a partir daqui, qualquer coisa nesta campanha é de outra pessoa ou rotina
    await pool.query(`UPDATE ${srcOf(run).table} SET quiet_since = COALESCE(quiet_since, NOW()), updated_at = NOW() WHERE id = $1`, [run.id]);
    const state = await this.confirmPause(pool, r, owner, true);
    return { code: owner.code, paused: true, state };
  }

  /** Envio com resultado desconhecido (ou interrompido): a releitura da Meta decide. */
  private async resolvePauseOutcome(pool: Pool, run: any, owner: Owner | null, msg: string): Promise<Record<string, unknown>> {
    const cid = String(run.meta_campaign_id);
    const T = srcOf(run).table;
    let status: string | null = null;
    try {
      status = String((await this.client(cid).readCampaignState(cid)).status || '').toUpperCase();
    } catch (err) {
      status = null;
    }
    if (status === 'PAUSED') {
      // a Meta aplicou: é uma pausa nossa como as outras
      await pool.query(`UPDATE ${T} SET quiet_since = COALESCE(quiet_since, NOW()), error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
      return { paused: true, state: await this.confirmPause(pool, run, owner, true), note: 'resposta perdida; a Meta mostra PAUSED' };
    }
    if (status === null) {
      // sem leitura: pode ter pausado. Fica aguardando conferência; o próximo ciclo relê
      await pool.query(
        `UPDATE ${T} SET state = 'PAUSE_UNCONFIRMED', quiet_since = COALESCE(quiet_since, NOW()), error = $2, updated_at = NOW() WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED')`,
        [run.id, msg]
      );
      await this.closeChange(pool, run.pause_change_id, 'UNCONFIRMED', null, msg);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_UNCONFIRMED', `Pausa noturna: resposta da Meta perdida ao pausar a campanha ${cid} ${owner?.of || ''}; aguardando conferência.`, 'ACTIVE', null);
      return { paused: null, state: 'PAUSE_UNCONFIRMED' };
    }
    await this.pauseFailed(pool, run, owner, msg);
    return { paused: false, error: msg };
  }

  private async pauseFailed(pool: Pool, run: any, owner: Owner | null, msg: string) {
    const cid = String(run.meta_campaign_id);
    await pool.query(`UPDATE ${srcOf(run).table} SET state = 'PAUSE_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
    await this.closeChange(pool, run.pause_change_id, 'FAILED', null, msg);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_FAILED', `Pausa noturna não feita: campanha ${cid} ${owner?.of || ''}. ${msg}`, 'ACTIVE', null);
    if (owner) await this.alert(pool, owner, cid, 'NIGHT_PAUSE_PAUSE_FAILED', `A pausa noturna não conseguiu pausar a campanha ${owner.of}: ${msg.slice(0, 200)}. A campanha segue ativa durante a noite.`);
  }

  /** Relê a Meta: PAUSED → "Confirmado pela Meta". Senão (ou sem leitura) fica aguardando conferência. */
  private async confirmPause(pool: Pool, run: any, owner: Owner | null, first: boolean): Promise<string> {
    const cid = String(run.meta_campaign_id);
    const T = srcOf(run).table;
    let read: MetaState | null = null;
    try {
      read = await this.client(cid).readCampaignState(cid);
    } catch (err) {
      console.warn('[NIGHT PAUSE] releitura falhou; fica aguardando conferência', errText(err));
    }
    const status = read ? String(read.status || '').toUpperCase() : null;
    if (status === 'PAUSED') {
      const upd = await pool.query(
        `UPDATE ${T} SET state = 'PAUSED', paused_at = NOW(), quiet_since = COALESCE(quiet_since, NOW()), meta_updated_time_at_pause = $2, error = NULL, updated_at = NOW()
         WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED') RETURNING id`,
        [run.id, read?.updated_time || null]
      );
      if (!upd.rows.length) return 'UNCHANGED';
      await this.closeChange(pool, run.pause_change_id, 'CONFIRMED', 'PAUSED');
      await writeAuditLog(
        pool,
        null,
        'NIGHT_PAUSE_DONE',
        `Pausa noturna: campanha ${cid} ${owner?.of || ''} pausada. Confirmado pela Meta. Volta às ${run.window_end} (horário de Brasília) se ninguém mexer nela.`,
        'ACTIVE',
        'PAUSED'
      );
      return 'PAUSED';
    }
    const upd = await pool.query(
      `UPDATE ${T} SET state = 'PAUSE_UNCONFIRMED', quiet_since = COALESCE(quiet_since, NOW()), updated_at = NOW() WHERE id = $1 AND state IN ('PAUSING', 'PAUSE_UNCONFIRMED') RETURNING id`,
      [run.id]
    );
    if (upd.rows.length && first) {
      await this.closeChange(pool, run.pause_change_id, 'UNCONFIRMED', status);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_UNCONFIRMED', `Pausa noturna: a Meta aceitou pausar a campanha ${cid} ${owner?.of || ''}, aguardando conferência.`, 'ACTIVE', status);
    }
    return 'PAUSE_UNCONFIRMED';
  }

  // ------------------------------ reativar ------------------------------

  private async resumeDue(pool: Pool, src: Src, clock: { date: string; minutes: number }, out: any) {
    const rows = (
      await pool.query(
        `SELECT * FROM ${src.table}
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
          `UPDATE ${src.table} SET state = 'REACTIVATING', resume_started_at = NOW(), resume_change_id = NULL, resume_attempts = resume_attempts + 1, updated_at = NOW()
           WHERE id = $1 AND state = $2 RETURNING *`,
          [r.id, r.state]
        );
        if (!claim.rows.length) return; // outra instância pegou
        out.resumed.push(await this.resume(pool, claim.rows[0], r.state));
      });
    }
  }

  private async cancelResume(pool: Pool, run: any, owner: Owner | null, reason: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = owner?.code || run.plan_code;
    await pool.query(`UPDATE ${srcOf(run).table} SET state = 'CANCELLED', reason = $2, resume_change_id = NULL, updated_at = NOW() WHERE id = $1`, [run.id, reason]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_CANCELLED', `Fim da pausa noturna cancelado: a campanha ${cid} ${owner?.of || ''} continua pausada. Motivo: ${reason}`, 'PAUSED', 'PAUSED');
    if (owner) await this.alert(pool, owner, cid, 'NIGHT_PAUSE_RESUME_CANCELLED', `A campanha ${owner.of} não foi reativada de manhã: ${reason} Ela continua pausada; reative pela tela se quiser.`);
    return { code, resumed: false, cancelled: reason };
  }

  /** Volta para tentar no próximo ciclo (todas as conferências de novo). Na 3.ª falha avisa; na 5.ª desiste. */
  private async retryResume(pool: Pool, run: any, owner: Owner | null, previousState: string, why: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = owner?.code || run.plan_code;
    const attempts = Number(run.resume_attempts) || 1;
    if (attempts >= MAX_RESUME_ATTEMPTS) return this.resumeFailed(pool, run, owner, `${why} (${attempts} tentativas)`);
    await pool.query(`UPDATE ${srcOf(run).table} SET state = $2, resume_change_id = NULL, error = $3, updated_at = NOW() WHERE id = $1`, [run.id, previousState, why.slice(0, 500)]);
    if (owner && attempts === FAILURES_ALERT) {
      await this.alert(pool, owner, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna ainda não conseguiu reativar a campanha ${owner.of} (${attempts} tentativas): ${why.slice(0, 200)}. O NORQVA tenta de novo até ${MAX_RESUME_ATTEMPTS} vezes, até 23:59.`);
    }
    return { code, resumed: false, retry: why, attempts };
  }

  private async resumeFailed(pool: Pool, run: any, owner: Owner | null, msg: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = owner?.code || run.plan_code;
    await pool.query(`UPDATE ${srcOf(run).table} SET state = 'RESUME_FAILED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg.slice(0, 500)]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_FAILED', `Fim da pausa noturna falhou: a campanha ${cid} ${owner?.of || ''} continua pausada. ${msg}`, 'PAUSED', null);
    if (owner) await this.alert(pool, owner, cid, 'NIGHT_PAUSE_RESUME_FAILED', `A pausa noturna não conseguiu reativar a campanha ${owner.of}: ${msg.slice(0, 200)}. Ela continua pausada; reative pela tela se quiser.`);
    return { code, resumed: false, error: msg };
  }

  /** Conferências do dono (sem a Meta). Devolve o motivo para não reativar, ou null. */
  private async ownerBlock(pool: Pool, owner: Owner | null, run: any, cid: string): Promise<string | null> {
    if (!owner) return 'a configuração da campanha não existe mais.';
    if (protectedMetaIds().has(cid)) return 'campanha protegida (CONTROL).';
    if (owner.kind === 'EXTERNAL') {
      // desligada ou excluída durante a noite: a pausa desta noite termina normalmente
      // virou campanha de um plano: as regras do plano (Sim, código) passam a valer
      if ((await planCampaignIds(pool)).has(cid)) return 'a campanha passou a ser de um plano do NORQVA.';
      return null;
    }
    const plan = owner.raw;
    if (!['ACTIVE', 'APPROVED'].includes(String(plan.status))) return `o plano está como ${plan.status}.`;
    if (plan.operator_paused_at) return 'a campanha foi pausada pela tela durante a noite.';
    if (String(plan.guard_state || '') === 'CAPPED') return 'o vigia do teto parou a campanha.';
    if (owner.cid !== cid) return 'a campanha do plano mudou.';
    if (!sameMoney(plan.max_spend_brl, run.plan_cap_at_pause)) return 'o teto do plano mudou durante a noite.';
    if (!sameMoney(plan.daily_budget_brl, run.plan_daily_budget_at_pause)) return 'o orçamento do plano mudou durante a noite.';
    return null;
  }

  /** IDs da campanha e dos objetos dela: do plano, ou lidos na Meta para a campanha externa (melhor esforço). */
  private async objectIds(owner: Owner, cid: string, client: MetaMutatingClient | null): Promise<Set<string>> {
    if (owner.kind === 'PLAN') return new Set<string>([cid, ...metaIdsOfPlan(normalizeMetaIds(owner.raw.meta_ids))]);
    const ids = new Set<string>([cid]);
    if (client) {
      try {
        for (const id of await client.readCampaignChildIds(cid)) ids.add(id);
      } catch (err) {
        console.warn('[NIGHT PAUSE] não leu conjuntos e anúncios da campanha externa; confere só a campanha', errText(err));
      }
    }
    return ids;
  }

  private async resume(pool: Pool, run: any, previousState: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const T = srcOf(run).table;
    let sent = false;
    let ids: Set<string> = new Set([cid]);
    const result = await withPlanLock(pool, this.lockKey(run), async (): Promise<Outcome | null> => {
      const owner = await this.ownerOf(pool, run);
      const blocked = await this.ownerBlock(pool, owner, run, cid);
      if (blocked || !owner) return this.cancelResume(pool, run, owner, blocked || 'sem configuração.');

      const client = this.client(cid, 'ACTIVE');
      ids = await this.objectIds(owner, cid, client);
      let touched: string | null;
      try {
        touched = await this.touchedSince(pool, run, owner, ids, 'pause');
      } catch (err) {
        return this.retryResume(pool, run, owner, previousState, `não foi possível conferir o que aconteceu durante a noite (${errText(err)})`);
      }
      if (touched) return this.cancelResume(pool, run, owner, touched);

      let state: MetaState;
      try {
        state = await client.readCampaignState(cid);
      } catch (err) {
        return this.retryResume(pool, run, owner, previousState, `leitura da campanha na Meta falhou (${errText(err)})`);
      }
      await pool.query(`UPDATE ${T} SET meta_updated_time_at_resume = $2 WHERE id = $1`, [run.id, state.updated_time]);
      const status = String(state.status || '').toUpperCase();
      if (status !== 'PAUSED') return this.cancelResume(pool, run, owner, `na Meta a campanha está ${status || 'sem situação'}, não pausada: alguém mexeu nela ou a pausa não pegou.`);

      // mexeram fora do NORQVA (Gerenciador)? Registro de atividades da conta; sem ele, a hora da última alteração
      const outside = await this.touchedOnMeta(pool, run, ids, client, state);
      if (outside) return this.cancelResume(pool, run, owner, outside);
      if (money(run.meta_daily_budget_at_pause) !== null && !sameMoney(state.daily_budget, run.meta_daily_budget_at_pause)) {
        return this.cancelResume(pool, run, owner, 'o orçamento da campanha mudou na Meta durante a noite.');
      }
      // limite de gastos da campanha na Meta (spend_cap contra amount_spent, como a Meta compara)
      if (state.spend_cap !== null && state.amount_spent !== null && state.amount_spent >= state.spend_cap - 0.005) {
        return this.cancelResume(pool, run, owner, `o limite de gastos da campanha na Meta foi atingido (${brl(state.amount_spent)} de ${brl(state.spend_cap)}).`);
      }
      if (owner.kind === 'PLAN') {
        let spend: { spend: number; spend_cap: number | null };
        try {
          spend = await client.getCampaignLifetimeSpend(cid);
        } catch (err) {
          return this.retryResume(pool, run, owner, previousState, `leitura do gasto na Meta falhou (${errText(err)})`);
        }
        const cap = money(owner.raw.max_spend_brl);
        if (cap !== null && spend.spend >= cap - 0.005) return this.cancelResume(pool, run, owner, `o teto foi atingido (${brl(spend.spend)} de ${brl(cap)}).`);
        if (spend.spend_cap !== null && spend.spend >= spend.spend_cap - 0.005) {
          return this.cancelResume(pool, run, owner, `o limite de gastos da campanha na Meta foi atingido (${brl(spend.spend)} de ${brl(spend.spend_cap)}).`);
        }
      }

      // reativar aumenta exposição: sem registro de decisão, não reativa agora (fail-closed) e tenta de novo
      let handle;
      try {
        handle = await beginDecision(pool, SYSTEM_CTX, { action: 'NIGHT_PAUSE_RESUME', decision: 'CAMPAIGN:ACTIVE', planId: owner.planId, planCode: owner.planId ? owner.code : null, metaIds: [cid] });
      } catch (err) {
        return this.retryResume(pool, run, owner, previousState, `auditoria de decisões indisponível (${errText(err)})`);
      }
      // o dono de novo, logo antes do envio (dentro da trava)
      const fresh = await this.ownerOf(pool, run);
      const late = await this.ownerBlock(pool, fresh, run, cid);
      if (late) {
        await handle.finish('REJECTED', { error: late });
        return this.cancelResume(pool, run, fresh, late);
      }
      const changeId = await this.openChange(pool, owner, cid, 'PAUSED', 'ACTIVE');
      await pool.query(`UPDATE ${T} SET resume_change_id = $2, updated_at = NOW() WHERE id = $1`, [run.id, changeId]);
      run.resume_change_id = changeId;
      try {
        await client.setEntityStatus(pool, 'CAMPAIGN', cid, 'ACTIVE', META_CTX);
      } catch (err: any) {
        const msg = errText(err);
        await handle.finish('FAILED', { error: msg });
        const kind = classifySendError(msg);
        if (kind === 'PRE_SEND') {
          await this.closeChange(pool, changeId, 'FAILED', null, `não enviado: ${msg}`);
          return this.retryResume(pool, run, owner, previousState, `não enviado (${msg})`);
        }
        if (kind === 'REJECTED') {
          await this.closeChange(pool, changeId, 'FAILED', null, msg);
          return this.resumeFailed(pool, run, owner, msg);
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
          return this.retryResume(pool, run, owner, previousState, `a Meta não confirmou (${msg})`);
        }
        if (after === null) {
          await pool.query(`UPDATE ${T} SET state = 'RESUME_UNCONFIRMED', error = $2, updated_at = NOW() WHERE id = $1`, [run.id, msg]);
          await this.closeChange(pool, changeId, 'UNCONFIRMED', null, msg);
          return { code: owner.code, resumed: null, state: 'RESUME_UNCONFIRMED' };
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
    const owner = await this.ownerOf(pool, run);
    let race: string | null = await this.ownerBlock(pool, owner, run, cid);
    if (!race && owner) {
      try {
        race = await this.touchedSince(pool, run, owner, ids, 'resume');
      } catch (err) {
        race = `não foi possível conferir depois de reativar (${errText(err)})`;
      }
    }
    if (race) return this.repause(pool, run, owner, race);
    const final = await this.confirmResume(pool, run, true);
    return { code: owner?.code || run.plan_code, resumed: true, state: final };
  }

  /** Alguém mexeu durante a reativação: pausa de novo (reduz exposição) e avisa como crítico. */
  private async repause(pool: Pool, run: any, owner: Owner | null, reason: string): Promise<Outcome> {
    const cid = String(run.meta_campaign_id);
    const code = owner?.code || run.plan_code;
    const handle = await beginDecision(
      pool,
      SYSTEM_CTX,
      { action: 'NIGHT_PAUSE_REPAUSE', decision: 'CAMPAIGN:PAUSED', planId: owner?.planId || (srcOf(run).kind === 'PLAN' ? run.plan_id : null), planCode: owner?.planId ? code : null, metaIds: [cid] },
      { riskReducing: true }
    );
    let note = 'pausada de novo';
    try {
      await this.client(cid, 'PAUSED').setEntityStatus(pool, 'CAMPAIGN', cid, 'PAUSED', META_CTX);
      await handle.finish('EXECUTED', { result: { campaign: cid, status: 'PAUSED' } });
    } catch (err: any) {
      note = `FALHOU ao pausar de novo (${errText(err)})`;
      await handle.finish('FAILED', { error: errText(err) });
    }
    await this.closeChange(pool, run.resume_change_id, 'FAILED', null, `alteração durante a reativação: ${reason}`);
    await pool.query(`UPDATE ${srcOf(run).table} SET state = 'CANCELLED', reason = $2, updated_at = NOW() WHERE id = $1`, [run.id, `Alteração durante a reativação (${reason}); ${note}.`]);
    await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_CANCELLED', `Fim da pausa noturna desfeito: alguém mexeu na campanha ${cid} ${owner?.of || ''} durante a reativação (${reason}); ${note}.`, 'ACTIVE', 'PAUSED');
    if (owner) {
      await this.alert(pool, owner, cid, 'NIGHT_PAUSE_RACE', `A campanha ${owner.of} foi reativada pela pausa noturna no mesmo instante em que alguém mexeu nela (${reason}). O NORQVA ${note}. Confira agora.`);
    }
    return { code, resumed: false, repaused: note, reason };
  }

  private async confirmResume(pool: Pool, run: any, first: boolean): Promise<string> {
    const cid = String(run.meta_campaign_id);
    const T = srcOf(run).table;
    let status: string | null = null;
    try {
      status = String((await this.client(cid).readCampaignState(cid)).status || '').toUpperCase();
    } catch (err) {
      console.warn('[NIGHT PAUSE] releitura falhou; fica aguardando conferência', errText(err));
    }
    const label = srcOf(run).kind === 'PLAN' ? `do plano ${run.plan_code}` : `"${run.plan_code}" (criada fora do NORQVA)`;
    if (status === 'ACTIVE') {
      const upd = await pool.query(
        `UPDATE ${T} SET state = 'REACTIVATED', resumed_at = NOW(), error = NULL, updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
        [run.id]
      );
      if (!upd.rows.length) return 'UNCHANGED';
      await this.closeChange(pool, run.resume_change_id, 'CONFIRMED', 'ACTIVE');
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUMED', `Fim da pausa noturna: campanha ${cid} ${label} reativada. Confirmado pela Meta.`, 'PAUSED', 'ACTIVE');
      return 'REACTIVATED';
    }
    if (!first && status === 'PAUSED') {
      // a reativação não pegou: volta para tentar de novo (com todas as conferências)
      const back = run.paused_at ? 'PAUSED' : 'PAUSE_UNCONFIRMED';
      const upd = await pool.query(
        `UPDATE ${T} SET state = $2, resume_change_id = NULL, error = 'reativação não apareceu na Meta', updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
        [run.id, back]
      );
      if (upd.rows.length) await this.closeChange(pool, run.resume_change_id, 'FAILED', 'PAUSED', 'reativação não apareceu na Meta');
      return back;
    }
    const upd = await pool.query(
      `UPDATE ${T} SET state = 'RESUME_UNCONFIRMED', updated_at = NOW() WHERE id = $1 AND state IN ('REACTIVATING', 'RESUME_UNCONFIRMED') RETURNING id`,
      [run.id]
    );
    if (upd.rows.length && first) {
      await this.closeChange(pool, run.resume_change_id, 'UNCONFIRMED', status);
      await writeAuditLog(pool, null, 'NIGHT_PAUSE_RESUME_UNCONFIRMED', `Fim da pausa noturna: a Meta aceitou reativar a campanha ${cid} ${label}, aguardando conferência.`, 'PAUSED', status);
    }
    return 'RESUME_UNCONFIRMED';
  }

  /**
   * Alguém (ou outra rotina do NORQVA) mexeu no plano ou na campanha? Fichas de alteração, decisões e registros
   * de auditoria do plano ou dos objetos dele, menos os da própria pausa noturna. `from`: 'pause' = desde a
   * pausa (quiet_since); 'resume' = desde o início desta tentativa de reativar. O instante vem do banco
   * (subconsulta): passar pelo JavaScript perderia os microssegundos.
   */
  async touchedSince(pool: Pool, run: any, owner: Owner, ids: Set<string>, from: 'pause' | 'resume'): Promise<string | null> {
    const T = srcOf(run).table;
    const SINCE = from === 'pause' ? `(SELECT COALESCE(quiet_since, pause_started_at) FROM ${T} WHERE id = $1)` : `(SELECT resume_started_at FROM ${T} WHERE id = $1)`;
    const cid = String(run.meta_campaign_id);
    const idList = Array.from(ids);

    const changes = await pool.query(
      `SELECT kind, requested_value, requested_by_name FROM meta_change_requests
       WHERE (created_at > ${SINCE} OR sent_at > ${SINCE} OR approved_at > ${SINCE})
         AND is_demo = FALSE AND COALESCE(origin, '') <> 'NIGHT_PAUSE'
         AND (plan_id = $2 OR meta_campaign_id = $3 OR meta_id = ANY($4::text[]))
       LIMIT 1`,
      [run.id, owner.planId, cid, idList]
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
      [run.id, owner.planId, idList]
    );
    if (decisions.rows.length) return `houve outra decisão sobre a campanha (${decisions.rows[0].action}).`;

    const audits = await pool.query(
      `SELECT event_type, description FROM audit_logs
       WHERE created_at > ${SINCE} AND is_demo = FALSE AND event_type = ANY($2::text[])
       ORDER BY created_at LIMIT 500`,
      [run.id, TOUCH_EVENTS]
    );
    const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokens = owner.kind === 'PLAN' ? [owner.code, ...idList] : idList;
    const patterns = tokens.map((t) => new RegExp(`(^|[^A-Za-z0-9_-])${esc(String(t))}([^A-Za-z0-9_-]|$)`, 'i'));
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
   * procura evento na campanha, nos conjuntos (inclusive orçamento ABO) ou nos anúncios que não seja do
   * NORQVA. O token pode ser do próprio dono, então o usuário (actor_id) não diz nada: "nosso" é só
   *  - evento do app a que o token pertence (GET /app, ou META_APP_ID); ou
   *  - sem app no evento (ou app desconhecido): a própria mudança de situação da campanha, até 2 minutos antes
   *    ou depois do nosso envio de pausa (ou desta tentativa de reativar).
   * Todo o resto conta como mexido (na dúvida, não reativa). Sem o registro, compara updated_time.
   */
  private async touchedOnMeta(pool: Pool, run: any, ids: Set<string>, client: MetaMutatingClient, state: MetaState): Promise<string | null> {
    const cid = String(run.meta_campaign_id);
    const T = srcOf(run).table;
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
      await pool.query(`UPDATE ${T} SET activity_check = $2 WHERE id = $1`, [run.id, foreign ? 'TOUCHED' : appId ? 'CLEAN' : 'CLEAN_NO_APP']);
      if (foreign) return `a campanha foi alterada na Meta durante a noite fora do NORQVA (${foreign.event_type || 'alteração'}).`;
      return null;
    } catch (err) {
      await pool.query(`UPDATE ${T} SET activity_check = 'UNAVAILABLE' WHERE id = $1`, [run.id]);
      const before = instant(run.meta_updated_time_at_pause);
      const now = instant(state.updated_time);
      if (before !== null && now !== null && now !== before) return 'a campanha foi alterada na Meta durante a noite.';
      return null;
    }
  }

  // ------------------------------ conferências e prazos ------------------------------

  /** Envio interrompido (queda no meio): sem envio → volta; com envio → a releitura decide. */
  private async settleStale(pool: Pool, src: Src, out: any) {
    const T = src.table;
    const stale = (
      await pool.query(
        `SELECT * FROM ${T}
         WHERE (state = 'PAUSING' AND pause_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')
            OR (state = 'REACTIVATING' AND resume_started_at < NOW() - INTERVAL '${STALE_MIN} minutes')`
      )
    ).rows;
    for (const r of stale) {
      await this.perRow(out, `settle:${r.plan_code}`, async () => {
        const owner = await this.ownerOf(pool, r);
        if (r.state === 'PAUSING') {
          if (!r.pause_change_id) {
            // interrompida antes do envio: nada foi pausado
            await this.pauseFailed(pool, r, owner, 'pausa interrompida antes do envio');
            out.other.push({ code: r.plan_code, stale: 'PAUSING', sent: false });
            return;
          }
          const res = await this.resolvePauseOutcome(pool, r, owner, 'envio interrompido');
          out.other.push({ code: r.plan_code, stale: 'PAUSING', ...res });
          return;
        }
        const back = r.paused_at ? 'PAUSED' : 'PAUSE_UNCONFIRMED';
        if (!r.resume_change_id) {
          // a reativação nunca chegou a enviar: tenta de novo
          await pool.query(`UPDATE ${T} SET state = $2, error = 'reativação interrompida antes do envio', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id, back]);
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
          await pool.query(`UPDATE ${T} SET state = $2, resume_change_id = NULL, error = 'reativação interrompida', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id, back]);
          await this.closeChange(pool, r.resume_change_id, 'FAILED', 'PAUSED', 'reativação interrompida');
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', retry: true });
        } else {
          await pool.query(`UPDATE ${T} SET state = 'RESUME_UNCONFIRMED', updated_at = NOW() WHERE id = $1 AND state = 'REACTIVATING'`, [r.id]);
          out.other.push({ code: r.plan_code, stale: 'REACTIVATING', state: 'RESUME_UNCONFIRMED' });
        }
      });
    }
  }

  /** Conferências pendentes (a Meta aceitou mas a releitura ainda não mostrava), de qualquer dia. */
  private async recheckUnconfirmed(pool: Pool, src: Src, out: any) {
    const rows = (await pool.query(`SELECT * FROM ${src.table} WHERE state IN ('PAUSE_UNCONFIRMED', 'RESUME_UNCONFIRMED') ORDER BY created_at LIMIT 200`)).rows;
    for (const r of rows) {
      await this.perRow(out, `recheck:${r.plan_code}`, async () => {
        const s = r.state === 'PAUSE_UNCONFIRMED' ? await this.confirmPause(pool, r, await this.ownerOf(pool, r), false) : await this.confirmResume(pool, r, false);
        if (s !== r.state) out.other.push({ code: r.plan_code, confirmed: s });
      });
    }
  }

  /** Passou de 23:59 do dia da pausa: não reativa mais; registra e avisa. */
  private async expireOld(pool: Pool, src: Src, clock: { date: string }, out: any) {
    const expired = (
      await pool.query(
        `UPDATE ${src.table} SET state = 'EXPIRED', reason = 'Não foi reativada até 23:59 do dia da pausa.', updated_at = NOW()
         WHERE state IN ('PAUSED', 'PAUSE_UNCONFIRMED', 'RESUME_UNCONFIRMED') AND night_date < $1::date RETURNING *`,
        [clock.date]
      )
    ).rows;
    for (const r of expired) {
      await this.perRow(out, `expire:${r.plan_code}`, async () => {
        const cid = String(r.meta_campaign_id);
        const owner = await this.ownerOf(pool, r);
        await writeAuditLog(pool, null, 'NIGHT_PAUSE_EXPIRED', `Fim da pausa noturna não aconteceu até 23:59: a campanha ${cid} ${owner?.of || ''} continua pausada.`, 'PAUSED', 'PAUSED');
        if (owner) await this.alert(pool, owner, cid, 'NIGHT_PAUSE_EXPIRED', `A campanha ${owner.of} ficou pausada: o NORQVA não conseguiu reativá-la até 23:59 do dia da pausa. Reative pela tela se quiser.`);
        out.other.push({ code: r.plan_code, expired: true });
      });
    }
  }

  // ------------------------------ fichas e avisos ------------------------------

  /** Ficha de alteração (NORQVA-0097) da pausa noturna, já em "Enviando". */
  private async openChange(pool: Pool, owner: Owner, cid: string, previous: string, requested: 'PAUSED' | 'ACTIVE'): Promise<string> {
    const id = crypto.randomUUID();
    const name = (await pool.query(`SELECT name FROM meta_campaigns WHERE meta_campaign_id = $1 AND is_demo = FALSE LIMIT 1`, [cid]).catch(() => ({ rows: [] as any[] }))).rows[0]?.name;
    await pool.query(
      `INSERT INTO meta_change_requests
         (id, plan_id, plan_code, entity_type, meta_id, entity_name, meta_campaign_id, kind, previous_value, requested_value, state,
          requested_by_name, requested_by_role, approved_by_name, approved_at, sent_at, origin, is_demo)
       VALUES ($1, $2, $3, 'CAMPAIGN', $4, $5, $4, 'STATUS', $6, $7, 'SENDING', $8, 'SYSTEM', $8, NOW(), NOW(), 'NIGHT_PAUSE', FALSE)`,
      [id, owner.planId, owner.planId ? owner.code : null, cid, String(name || owner.name || '').slice(0, 255) || null, previous, requested, WHO]
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

  private async alert(pool: Pool, owner: Owner, cid: string, rule: string, message: string) {
    try {
      await pool.query(
        `INSERT INTO ad_alerts (rule_code, meta_ad_id, ad_name, meta_campaign_id, campaign_name, spend, threshold, message, is_demo)
         VALUES ($1, $2, $3, $2, $4, 0, 0, $5, FALSE)`,
        [rule, cid, owner.code.slice(0, 255), owner.name.slice(0, 255), message]
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

  // ------------------------------ campanhas criadas fora do NORQVA (NORQVA-0122) ------------------------------

  /**
   * Garante a linha da campanha em meta_campaigns (setEntityStatus precisa dela). Nunca altera linha existente.
   * Falha → grava o erro e abre aviso uma vez (na hora de adicionar ou no primeiro ciclo, não à meia-noite).
   */
  private async mirrorOne(pool: Pool, ext: any): Promise<{ ok: boolean; created?: boolean; error?: string }> {
    const cid = String(ext.meta_campaign_id);
    try {
      const r = await this.clientFactory().ensureCampaignMirror(pool, cid);
      await pool.query(`UPDATE night_pause_external_campaigns SET mirror_checked_at = NOW(), mirror_error = NULL WHERE id = $1`, [ext.id]);
      return { ok: true, created: r.created };
    } catch (err) {
      const msg = errText(err);
      const prev = (await pool.query(`SELECT mirror_error FROM night_pause_external_campaigns WHERE id = $1`, [ext.id])).rows[0]?.mirror_error;
      await pool.query(`UPDATE night_pause_external_campaigns SET mirror_checked_at = NOW(), mirror_error = $2 WHERE id = $1`, [ext.id, msg]);
      if (!prev) {
        await writeAuditLog(pool, null, 'NIGHT_PAUSE_EXTERNAL_MIRROR_FAILED', `Pausa noturna: não foi possível preparar a campanha ${cid} ("${ext.name || cid}", criada fora do NORQVA). ${msg}`, null, null);
        await this.alert(pool, externalOwner(ext), cid, 'NIGHT_PAUSE_MIRROR_FAILED', `A campanha "${ext.name || cid}" (${cid}) não pode ser pausada à noite: o NORQVA não conseguiu lê-la na Meta (${msg.slice(0, 160)}). Confira o ID e a conta.`);
      }
      return { ok: false, error: msg };
    }
  }

  /** Para as externas ligadas ainda sem linha em meta_campaigns: tenta a cópia (no máximo 1 vez por hora se falhar). */
  private async ensureExternalMirrors(pool: Pool, out: any) {
    const rows = (
      await pool.query(
        `SELECT e.* FROM night_pause_external_campaigns e
         WHERE e.enabled = TRUE AND e.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM meta_campaigns m WHERE m.meta_campaign_id = e.meta_campaign_id AND m.is_demo = FALSE)
           AND (e.mirror_checked_at IS NULL OR e.mirror_error IS NULL OR e.mirror_checked_at < NOW() - INTERVAL '1 hour')`
      )
    ).rows;
    for (const ext of rows) {
      await this.perRow(out, `mirror:${ext.meta_campaign_id}`, async () => {
        const r = await this.mirrorOne(pool, ext);
        out.other.push({ code: ext.name || ext.meta_campaign_id, mirror: r.ok ? (r.created ? 'criada' : 'já existia') : r.error });
      });
    }
  }

  private shapeExternal(row: any, runs: any[], meta: { status: string | null; effective_status: string | null; error?: string } | null) {
    return {
      id: row.id,
      meta_campaign_id: row.meta_campaign_id,
      name: row.name,
      enabled: row.enabled !== false,
      start: row.night_pause_start || DEFAULT_START,
      end: row.night_pause_end || DEFAULT_END,
      meta,
      runs,
      mirror_error: row.mirror_error || null
    };
  }

  /** Lista (com a situação lida na Meta agora e as últimas 3 noites). */
  async listExternal(pool: Pool, opts: { live?: boolean } = {}) {
    const rows = (await pool.query(`SELECT * FROM night_pause_external_campaigns WHERE deleted_at IS NULL ORDER BY created_at`)).rows;
    const ofPlans = rows.length ? await planCampaignIds(pool) : new Set<string>();
    const out: any[] = [];
    for (const row of rows) {
      const runs = (
        await pool.query(
          `SELECT id, night_date::text AS night_date, state, reason, error, paused_at, resumed_at
           FROM night_pause_external_runs WHERE external_id = $1 ORDER BY night_date DESC, created_at DESC LIMIT 3`,
          [row.id]
        )
      ).rows;
      let meta: any = null;
      if (opts.live !== false) {
        try {
          const s = await this.clientFactory().readCampaignState(String(row.meta_campaign_id));
          meta = { status: s.status, effective_status: s.effective_status };
        } catch (err) {
          meta = { status: null, effective_status: null, error: 'não foi possível ler na Meta agora' };
        }
      }
      out.push({ ...this.shapeExternal(row, runs, meta), belongs_to_plan: ofPlans.has(String(row.meta_campaign_id)) });
    }
    return { campaigns: out, master_enabled: nightPauseEnabled(), timezone: NIGHT_PAUSE_TZ, max_end: MAX_END };
  }

  /** Adicionar pelo ID: confere na Meta que a campanha existe e é da conta de anúncios configurada. */
  async addExternal(pool: Pool, body: any, userId: string | null) {
    const cid = String(body?.meta_campaign_id ?? '').trim();
    if (!/^\d{5,25}$/.test(cid)) throw new NightPauseError(400, 'Informe o ID da campanha na Meta (só números).');
    if (protectedMetaIds().has(cid)) throw new NightPauseError(409, 'Esta campanha é protegida (CONTROL) e não entra na pausa noturna.');
    if ((await planCampaignIds(pool)).has(cid)) throw new NightPauseError(409, 'Esta campanha é de um plano do NORQVA: a pausa noturna dela fica em Gerenciar campanha → Configurações.');
    let info: { id: string | null; name: string | null; account_id: string | null };
    try {
      info = await this.clientFactory().readCampaignIdentity(cid);
    } catch (err) {
      throw new NightPauseError(422, `Não foi possível achar esta campanha na Meta (${errText(err).slice(0, 160)}).`);
    }
    const act = String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
    if (!info.id || String(info.id) !== cid) throw new NightPauseError(422, 'A Meta não devolveu esta campanha.');
    if (!act || String(info.account_id || '').replace(/^act_/, '') !== act) throw new NightPauseError(422, 'Esta campanha não é da conta de anúncios configurada no NORQVA.');
    const uid = UUID_RE.test(String(userId || '')) ? userId : null;
    const r = await pool.query(
      `INSERT INTO night_pause_external_campaigns (meta_campaign_id, name, enabled, created_by)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (meta_campaign_id) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
       RETURNING *`,
      [cid, info.name ? String(info.name).slice(0, 255) : null, uid]
    );
    // cópia mínima em meta_campaigns já agora: se falhar, o aviso sai na hora de adicionar, não à meia-noite
    const mirror = await this.mirrorOne(pool, r.rows[0]);
    await writeAuditLog(pool, uid, 'NIGHT_PAUSE_EXTERNAL_ADDED', `Pausa noturna: campanha ${cid} ("${info.name || cid}", criada fora do NORQVA) adicionada, ligada das ${r.rows[0].night_pause_start} às ${r.rows[0].night_pause_end}.`, null, cid);
    return { ...this.shapeExternal(r.rows[0], [], null), mirror: mirror.ok ? 'OK' : 'FAILED', mirror_error: mirror.error || null };
  }

  private async externalRow(pool: Pool, id: string) {
    if (!UUID_RE.test(String(id || ''))) throw new NightPauseError(404, 'Campanha não encontrada.');
    const r = (await pool.query(`SELECT * FROM night_pause_external_campaigns WHERE id = $1 AND deleted_at IS NULL`, [id])).rows[0];
    if (!r) throw new NightPauseError(404, 'Campanha não encontrada.');
    return r;
  }

  async updateExternal(pool: Pool, id: string, body: any, userId: string | null) {
    const cur = await this.externalRow(pool, id);
    const enabled = body?.enabled === undefined ? cur.enabled !== false : body.enabled;
    if (typeof enabled !== 'boolean') throw new NightPauseError(400, 'Diga se a pausa noturna fica ligada ou desligada.');
    const w = validateWindow(body?.start ?? cur.night_pause_start, body?.end ?? cur.night_pause_end);
    const r = await pool.query(
      `UPDATE night_pause_external_campaigns SET enabled = $2, night_pause_start = $3, night_pause_end = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, enabled, w.start, w.end]
    );
    const before = `${cur.enabled !== false ? 'ligada' : 'desligada'} ${cur.night_pause_start}–${cur.night_pause_end}`;
    const after = `${enabled ? 'ligada' : 'desligada'} ${w.start}–${w.end}`;
    if (before !== after) {
      await writeAuditLog(
        pool,
        UUID_RE.test(String(userId || '')) ? userId : null,
        'NIGHT_PAUSE_SETTINGS_CHANGED',
        `Pausa noturna da campanha ${cur.meta_campaign_id} ("${cur.name || cur.meta_campaign_id}", criada fora do NORQVA): ${enabled ? `ligada, das ${w.start} às ${w.end}` : 'desligada'} (horário de Brasília).`,
        before,
        after
      );
    }
    return this.shapeExternal(r.rows[0], [], null);
  }

  /** Tira da lista (só a configuração; as noites ficam). A noite em curso termina normalmente. */
  async removeExternal(pool: Pool, id: string, userId: string | null) {
    const cur = await this.externalRow(pool, id);
    const uid = UUID_RE.test(String(userId || '')) ? userId : null;
    await pool.query(`UPDATE night_pause_external_campaigns SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`, [id, uid]);
    await writeAuditLog(pool, uid, 'NIGHT_PAUSE_EXTERNAL_REMOVED', `Pausa noturna: campanha ${cur.meta_campaign_id} ("${cur.name || cur.meta_campaign_id}", criada fora do NORQVA) tirada da lista.`, cur.meta_campaign_id, null);
    return { removed: true };
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
