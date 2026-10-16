import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

// H6/H7/H8 (R-0019-01): teto dos experimentos em andamento. Mostra o gasto lido na Meta, o limite de
// gastos da campanha e o estado do vigia.
// NORQVA-0052 (D-0052): edita o teto em qualquer situação (dentro da campanha). Baixar salva na hora;
// subir depois do Sim pede o código da campanha e um motivo. Campanha lucrativa não é pausada no teto:
// o teto sobe 50% sozinho até o teto máximo (padrão 3x o teto inicial).

interface GuardPlan {
  id: string;
  code: string;
  status: string;
  max_spend_brl: number | string;
  daily_budget_brl: number | string;
  spec?: { campaign?: { name?: string } };
  spent_brl_last?: number | string | null;
  spent_checked_at?: string | null;
  guard_state?: string | null;
  guard_note?: string | null;
  capped_at?: string | null;
  spend_cap_status?: string | null;
  spend_cap_applied_brl?: number | string | null;
  spend_cap_error?: string | null;
  experiment_id?: string | null;
  max_spend_initial_brl?: number | string | null;
  max_spend_ceiling_brl?: number | string | null;
  profit_extend_enabled?: boolean | null;
  cap_extensions?: number | null;
}

/** Mesmo cálculo do servidor: teto máximo do operador ou 3x o teto inicial. */
export function ceilingOfPlan(p: GuardPlan): number {
  const explicit = num(p.max_spend_ceiling_brl);
  if (explicit !== null && explicit > 0) return explicit;
  const initial = num(p.max_spend_initial_brl);
  return Math.round((initial !== null && initial > 0 ? initial : num(p.max_spend_brl) ?? 0) * 3 * 100) / 100;
}

/** Depois do Sim, aumentar autoriza gastar mais: pede confirmação. */
const answered = (p: GuardPlan) => !!p.experiment_id || ['APPROVED', 'ACTIVE'].includes(p.status) || p.guard_state === 'CAPPED';
const parse = (v: string) => Number(String(v).replace(',', '.'));

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const brl = (n: number | null) => (n === null ? '—' : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATE: Record<string, { label: string; cls: string }> = {
  WATCHING: { label: 'Vigiando', cls: 'border-nq-positive/40 text-nq-positive-text' },
  CAPPED: { label: 'Teto atingido · pausado', cls: 'border-nq-critical/40 text-nq-critical-text' },
  PAUSE_FAILED: { label: 'FALHA ao pausar — pause no Gerenciador', cls: 'border-nq-critical/40 text-nq-critical-text bg-nq-critical/10' }
};

export const ExperimentGuardCard: React.FC<{
  apiFetch: (url: string, options?: any, mode?: string, user?: any) => Promise<any>;
  currentUser: any;
  isDemoView: boolean;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** NORQVA-0028: dentro de uma campanha, só o teto daquela campanha (NORQVA-0052: em qualquer situação) */
  planId?: string | null;
  /** NORQVA-0052: avisa a tela da campanha depois de salvar */
  onChanged?: () => void;
}> = ({ apiFetch, currentUser, isDemoView, showError, showSuccess, planId = null, onChanged }) => {
  const enabled = currentUser?.role === 'ADMIN' && !isDemoView;
  const [plans, setPlans] = useState<GuardPlan[]>([]);
  const [detail, setDetail] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [ceilingTouched, setCeilingTouched] = useState(false);
  const [profitOn, setProfitOn] = useState(true);
  const [confirmCode, setConfirmCode] = useState('');
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const fetchRef = useRef(apiFetch);
  fetchRef.current = apiFetch;

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetchRef.current('/launch-plans', {}, 'real', currentUser);
      const list: GuardPlan[] = Array.isArray(res?.plans) ? res.plans : [];
      const shown = planId ? list.filter(p => p.id === planId) : list.filter(p => ['ACTIVE', 'APPROVED'].includes(p.status) || p.guard_state === 'CAPPED');
      setPlans(shown);
      if (planId && shown.length) {
        const d = await fetchRef.current(`/launch-plans/${encodeURIComponent(planId)}/guard`, {}, 'real', currentUser).catch(() => null);
        setDetail(d ? { [planId]: d } : {});
      }
    } catch {
      setPlans([]);
    }
  }, [enabled, planId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled || plans.length === 0) return null;

  const runNow = async () => {
    setBusy(true);
    try {
      await fetchRef.current('/launch-plans/guard/run', { method: 'POST' }, 'real', currentUser);
      showSuccess('Gasto conferido na Meta.');
      await load();
    } catch (e: any) {
      showError(e?.message || 'Falha ao conferir o gasto.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (p: GuardPlan) => {
    setEditing(p.id);
    setValue(String(num(p.max_spend_brl) ?? ''));
    setCeiling(String(ceilingOfPlan(p)));
    setCeilingTouched(false);
    setProfitOn(p.profit_extend_enabled !== false);
    setConfirmCode('');
    setJustification('');
  };

  const isRaise = (p: GuardPlan) => {
    const cap = num(p.max_spend_brl) ?? 0;
    const v = parse(value);
    const c = parse(ceiling);
    return (Number.isFinite(v) && v > cap + 0.001) || (ceilingTouched && Number.isFinite(c) && c > ceilingOfPlan(p) + 0.001) || (profitOn && p.profit_extend_enabled === false);
  };

  const saveCap = async (plan: GuardPlan) => {
    const v = parse(value);
    if (!Number.isFinite(v) || v <= 0) return showError('Informe o novo teto em reais.');
    const c = parse(ceiling);
    const body: Record<string, any> = { max_spend_brl: v };
    if (ceilingTouched && Number.isFinite(c) && c > 0 && Math.abs(c - ceilingOfPlan(plan)) > 0.001) {
      if (c + 0.001 < v) return showError('O teto máximo não pode ser menor que o teto.');
      body.max_spend_ceiling_brl = c;
    }
    if (profitOn !== (plan.profit_extend_enabled !== false)) body.profit_extend_enabled = profitOn;
    if (isRaise(plan) && answered(plan)) {
      body.confirm_code = confirmCode;
      body.justification = justification;
    }
    setBusy(true);
    try {
      const r = await fetchRef.current(`/launch-plans/${encodeURIComponent(plan.id)}/spend-cap`, { method: 'POST', body: JSON.stringify(body) }, 'real', currentUser);
      const st = r?.spend_cap?.status;
      const capMsg =
        st === 'APPLIED'
          ? 'limite aplicado na campanha da Meta'
          : st === 'BACKSTOP'
            ? `trava de segurança de ${brl(Number(r.spend_cap.spend_cap_brl))} aplicada na Meta (mínimo aceito); o NORQVA pausa no teto`
            : st === 'SKIPPED' || !st
              ? 'vale a partir da criação na Meta'
              : `limite na Meta não aplicado (${r?.spend_cap?.error || st}); o vigia do NORQVA segue valendo`;
      showSuccess(
        `Teto de ${plan.code} agora é ${brl(v)}: ${capMsg}.${r?.uncapped ? ' O vigia voltou a acompanhar; a campanha continua pausada até você reativar.' : ''}${r?.guard?.pause?.paused ? ' A campanha foi pausada porque o gasto já chegou ao teto.' : ''}`
      );
      setEditing(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      showError(e?.message || 'Falha ao alterar o teto.');
    } finally {
      setBusy(false);
    }
  };

  // NORQVA-0084 (D-0082): mesma lógica e mesmas regras; apresentação nova. Para cada experimento:
  // consumo em destaque, barra, saldo, última leitura, o teto do NORQVA separado do limite aplicado
  // na Meta, e as regras do vigia numa área que abre ao tocar.
  const field =
    'w-full min-h-[44px] rounded-xl bg-nq-raised px-3 text-[15px] text-nq-text placeholder:text-nq-subtle focus:outline-none focus:ring-2 focus:ring-nq-positive/50';
  const when = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <section data-testid="experiment-guard-card" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[20px] leading-[26px] font-semibold text-nq-text">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-nq-muted" /> Teto dos experimentos
        </h3>
        <button onClick={runNow} disabled={busy} className="inline-flex items-center gap-1.5 min-h-[40px] rounded-full bg-nq-surface px-3.5 text-[13px] text-nq-text hover:bg-nq-raised disabled:opacity-50">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Conferir gasto agora
        </button>
      </div>
      <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70">
      {plans.map(p => {
        const cap = num(p.max_spend_brl) ?? 0;
        const spent = num(p.spent_brl_last);
        const pct = spent !== null && cap > 0 ? Math.min(100, (spent / cap) * 100) : null;
        const st = STATE[p.guard_state || ''] || { label: 'Aguardando a primeira leitura', cls: 'border-nq-line text-nq-muted' };
        const applied = num(p.spend_cap_applied_brl);
        const ceil = ceilingOfPlan(p);
        const d = detail[p.id];
        const raising = editing === p.id && isRaise(p) && answered(p);
        const stopped = p.guard_state === 'CAPPED' || p.guard_state === 'PAUSE_FAILED';
        const barCls = stopped || (pct !== null && pct >= 90) ? 'bg-nq-critical' : pct !== null && pct >= 80 ? 'bg-nq-attention' : 'bg-nq-positive';
        const stateTone = p.guard_state === 'WATCHING' ? 'text-nq-positive-text' : stopped ? 'text-nq-critical-text' : 'text-nq-muted';
        const dot = p.guard_state === 'WATCHING' ? 'bg-nq-positive' : stopped ? 'bg-nq-critical' : 'bg-nq-subtle';
        const left = spent !== null ? Math.max(0, Math.round((cap - spent) * 100) / 100) : null;
        return (
          <div key={p.id} data-testid={`guard-plan-${p.code}`} className={`p-4 space-y-4 text-[13px] leading-[18px] ${p.guard_state === 'PAUSE_FAILED' ? 'bg-nq-critical/10' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[15px] leading-[22px] text-nq-text break-all">{p.spec?.campaign?.name || p.code}</div>
                <div className="text-[12px] text-nq-subtle">{p.code}</div>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 ${stateTone}`} data-testid="guard-state">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                {st.label}
              </span>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <div className="tabular-nums">
                  <span className="text-[22px] leading-7 font-semibold text-nq-text">{brl(spent)}</span>
                  <span className="text-nq-muted whitespace-nowrap"> de {brl(cap)}</span>
                </div>
                {pct !== null && <span className="text-[15px] font-semibold tabular-nums text-nq-text">{`${pct.toFixed(1).replace('.', ',')}%`}</span>}
              </div>
              <div
                className="mt-2 h-2 rounded-full bg-nq-raised overflow-hidden"
                role="progressbar"
                aria-label={`Teto usado de ${p.code}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct === null ? undefined : Math.round(pct)}
              >
                {pct !== null && <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-[12px] leading-4">
                <div><div className="text-nq-muted">Saldo até o teto</div><div className="mt-0.5 text-nq-text tabular-nums">{brl(left)}</div></div>
                <div className="text-right"><div className="text-nq-muted">Gasto lido na Meta</div><div className="mt-0.5 text-nq-text">{when(p.spent_checked_at) || 'ainda não lido'}</div></div>
              </div>
            </div>

            <dl className="rounded-xl bg-nq-raised/60 p-3 space-y-2" data-testid="guard-spend-cap">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-nq-muted">Teto do NORQVA <span className="block text-[12px] text-nq-subtle">o vigia pausa aqui</span></dt>
                <dd className="text-nq-text tabular-nums text-right">{brl(cap)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-nq-muted">Limite aplicado na Meta <span className="block text-[12px] text-nq-subtle">trava extra, na própria Meta</span></dt>
                <dd className="text-right max-w-[60%]">
                  {p.spend_cap_status === 'APPLIED' ? (
                    <span className="text-nq-text">{brl(applied)} aplicado</span>
                  ) : p.spend_cap_status === 'BACKSTOP' ? (
                    <span className="text-nq-text">{brl(applied)} aplicado como trava de segurança (mínimo da Meta); o NORQVA pausa em {brl(cap)}</span>
                  ) : p.spend_cap_status === 'FAILED' ? (
                    <span className="text-nq-attention">não aplicado ({p.spend_cap_error})</span>
                  ) : (
                    <span className="text-nq-muted">ainda não aplicado</span>
                  )}
                </dd>
              </div>
            </dl>

            {d?.profit && (
              <div className="text-nq-muted" data-testid="guard-profit-now">
                Vendas pagas desta campanha: <span className="text-nq-text">{d.profit.sales}</span> · líquido (sem taxas) <span className="text-nq-text">{brl(num(d.profit.net_brl))}</span>
                {d.profit.spent_brl !== null && d.profit.spent_brl !== undefined ? <> · gasto {brl(num(d.profit.spent_brl))}</> : null}
                {' → '}
                {d.profit.profitable_lifetime ? <span className="text-nq-positive-text">dando lucro</span> : <span className="text-nq-text">ainda sem lucro comprovado (mínimo {d.profit.min_sales} vendas)</span>}
              </div>
            )}

            <details className="group rounded-xl bg-nq-raised/60">
              <summary className="list-none cursor-pointer min-h-[44px] px-3 flex items-center justify-between gap-3 text-nq-muted">
                Regras do vigia
                <span aria-hidden="true" className="text-nq-subtle group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className="text-nq-muted" data-testid="guard-profit-rule">
                  {p.profit_extend_enabled === false ? (
                    <>Se estiver dando lucro: <span className="text-nq-attention">desligado</span> (pausa no teto mesmo com lucro).</>
                  ) : (
                    <>
                      Se estiver dando lucro, o NORQVA <strong className="text-nq-text">não pausa</strong>: sobe o teto em 50% até o teto máximo de <strong className="text-nq-text">{brl(ceil)}</strong>
                      {num(p.max_spend_ceiling_brl) ? '' : ' (3x o teto inicial)'}.
                      {Number(p.cap_extensions) > 0 ? ` Já subiu ${p.cap_extensions} vez(es) por lucro.` : ''}
                    </>
                  )}
                </div>
                <div className="text-nq-subtle">Baixar o teto salva na hora. Subir depois do Sim pede o código da campanha e um motivo.</div>
                {p.guard_note && <div className="text-nq-subtle">{p.guard_note}</div>}
              </div>
            </details>

            {editing === p.id ? (
              <div className="space-y-3 rounded-xl bg-nq-raised/60 p-3" data-testid="guard-edit">
                <div className="grid grid-cols-2 gap-3 items-end">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-nq-muted">Teto de gasto (R$)</span>
                    <input inputMode="decimal" aria-label={`Novo teto de ${p.code}`} value={value} onChange={e => {
                        setValue(e.target.value);
                        // teto máximo padrão (3x) acompanha o teto digitado, como o servidor calcula
                        if (!ceilingTouched) setCeiling(String(ceilingOfPlan({ ...p, max_spend_brl: parse(e.target.value) || p.max_spend_brl })));
                      }} className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-nq-muted">Teto máximo se der lucro (R$)</span>
                    <input inputMode="decimal" aria-label={`Teto máximo de ${p.code}`} value={ceiling} onChange={e => { setCeiling(e.target.value); setCeilingTouched(true); }} className={field} />
                  </label>
                </div>
                <label className="flex items-center gap-3 min-h-[44px] text-[15px] text-nq-text">
                  <input type="checkbox" className="h-5 w-5 accent-nq-positive" aria-label="Não pausar se estiver dando lucro" checked={profitOn} onChange={e => setProfitOn(e.target.checked)} />
                  Não pausar se estiver dando lucro
                </label>
                {raising ? (
                  <div className="space-y-2" data-testid="guard-raise-confirm">
                    <p className="text-nq-attention">Aumentar autoriza gastar mais. Digite o código da campanha e o motivo.</p>
                    <input aria-label="Código da campanha" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} placeholder={p.code} autoComplete="off" onPaste={e => e.preventDefault()} className={field} />
                    <input aria-label="Motivo" value={justification} onChange={e => setJustification(e.target.value)} placeholder="Por que aumentar? (mín. 10 letras)" className={field} />
                  </div>
                ) : (
                  <p className="text-nq-subtle">Baixar o teto salva na hora.{p.guard_state === 'CAPPED' ? ' Para voltar a rodar, suba o teto acima do gasto e depois reative a campanha.' : ''}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => saveCap(p)} disabled={busy} className="min-h-[44px] rounded-full bg-nq-text px-5 text-[15px] font-semibold text-nq-bg hover:brightness-110 disabled:opacity-50">
                    Salvar
                  </button>
                  <button onClick={() => setEditing(null)} className="min-h-[44px] rounded-full bg-nq-raised px-5 text-[15px] text-nq-text">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit(p)} className="min-h-[40px] rounded-full bg-nq-raised px-4 text-[13px] font-semibold text-nq-text hover:brightness-110">
                Editar teto
              </button>
            )}
          </div>
        );
      })}
      </div>
    </section>
  );
};
