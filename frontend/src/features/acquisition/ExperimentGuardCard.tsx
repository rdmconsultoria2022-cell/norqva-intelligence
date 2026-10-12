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
  WATCHING: { label: 'Vigiando', cls: 'border-emerald-600/50 text-emerald-300' },
  CAPPED: { label: 'Teto atingido · pausado', cls: 'border-rose-600/60 text-rose-300' },
  PAUSE_FAILED: { label: 'FALHA ao pausar — pause no Gerenciador', cls: 'border-rose-600/60 text-rose-200 bg-rose-950/40' }
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
    setProfitOn(p.profit_extend_enabled !== false);
    setConfirmCode('');
    setJustification('');
  };

  const isRaise = (p: GuardPlan) => {
    const cap = num(p.max_spend_brl) ?? 0;
    const v = parse(value);
    const c = parse(ceiling);
    return (Number.isFinite(v) && v > cap + 0.001) || (Number.isFinite(c) && c > ceilingOfPlan(p) + 0.001) || (profitOn && p.profit_extend_enabled === false);
  };

  const saveCap = async (plan: GuardPlan) => {
    const v = parse(value);
    if (!Number.isFinite(v) || v <= 0) return showError('Informe o novo teto em reais.');
    const c = parse(ceiling);
    const body: Record<string, any> = { max_spend_brl: v };
    if (Number.isFinite(c) && c > 0 && Math.abs(c - ceilingOfPlan(plan)) > 0.001) {
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

  return (
    <div data-testid="experiment-guard-card" className="space-y-3 rounded-lg border border-sky-600/40 bg-sky-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-sm font-bold uppercase tracking-widest text-sky-300">
          <ShieldCheck className="h-4 w-4" /> Teto dos experimentos
        </h3>
        <button onClick={runNow} disabled={busy} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Conferir gasto agora
        </button>
      </div>
      {plans.map(p => {
        const cap = num(p.max_spend_brl) ?? 0;
        const spent = num(p.spent_brl_last);
        const pct = spent !== null && cap > 0 ? Math.min(100, (spent / cap) * 100) : null;
        const st = STATE[p.guard_state || ''] || { label: 'Aguardando a primeira leitura', cls: 'border-slate-700 text-slate-400' };
        const applied = num(p.spend_cap_applied_brl);
        const ceil = ceilingOfPlan(p);
        const d = detail[p.id];
        const raising = editing === p.id && isRaise(p) && answered(p);
        return (
          <div key={p.id} data-testid={`guard-plan-${p.code}`} className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono font-semibold text-slate-100">
                {p.code} <span className="font-normal text-slate-500">· {p.spec?.campaign?.name}</span>
              </span>
              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${st.cls}`} data-testid="guard-state">{st.label}</span>
            </div>
            <div className="text-slate-300">
              Gasto na Meta: <strong>{brl(spent)}</strong> de <strong>{brl(cap)}</strong> {pct !== null ? `(${pct.toFixed(1).replace('.', ',')}%)` : ''}
              {p.spent_checked_at ? <span className="text-slate-500"> · lido em {new Date(p.spent_checked_at).toLocaleString('pt-BR')}</span> : null}
            </div>
            {pct !== null && (
              <div className="h-2 rounded bg-slate-800">
                <div className={`h-2 rounded ${pct >= 90 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            <div className="text-slate-400" data-testid="guard-profit-rule">
              {p.profit_extend_enabled === false ? (
                <>Se estiver dando lucro: <span className="text-amber-300">desligado</span> (pausa no teto mesmo com lucro).</>
              ) : (
                <>
                  Se estiver dando lucro, o NORQVA <strong>não pausa</strong>: sobe o teto em 50% até o teto máximo de <strong>{brl(ceil)}</strong>
                  {num(p.max_spend_ceiling_brl) ? '' : ' (3x o teto inicial)'}.
                  {Number(p.cap_extensions) > 0 ? ` Já subiu ${p.cap_extensions} vez(es) por lucro.` : ''}
                </>
              )}
            </div>
            {d?.profit && (
              <div className="text-slate-400" data-testid="guard-profit-now">
                Vendas pagas desta campanha: <strong>{d.profit.sales}</strong> · líquido (sem taxas) <strong>{brl(num(d.profit.net_brl))}</strong>
                {d.profit.spent_brl !== null && d.profit.spent_brl !== undefined ? <> · gasto {brl(num(d.profit.spent_brl))}</> : null}
                {' → '}
                {d.profit.profitable_lifetime ? <span className="text-emerald-300">dando lucro</span> : <span className="text-slate-300">ainda sem lucro comprovado (mínimo {d.profit.min_sales} vendas)</span>}
              </div>
            )}
            <div className="text-slate-400" data-testid="guard-spend-cap">
              Limite de gastos da campanha na Meta:{' '}
              {p.spend_cap_status === 'APPLIED' ? <span className="text-emerald-300">{brl(applied)} aplicado</span> : p.spend_cap_status === 'BACKSTOP' ? <span className="text-emerald-300">{brl(applied)} aplicado como trava de segurança (mínimo da Meta); o NORQVA pausa em {brl(cap)}</span> : p.spend_cap_status === 'FAILED' ? <span className="text-amber-300">não aplicado ({p.spend_cap_error})</span> : <span>ainda não aplicado</span>}
            </div>
            {p.guard_note && <div className="text-slate-500">{p.guard_note}</div>}
            {editing === p.id ? (
              <div className="space-y-2 rounded border border-sky-800/50 bg-slate-950/40 p-2" data-testid="guard-edit">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400">Teto de gasto (R$)</span>
                    <input aria-label={`Novo teto de ${p.code}`} value={value} onChange={e => setValue(e.target.value)} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-slate-400">Teto máximo com lucro (R$)</span>
                    <input aria-label={`Teto máximo de ${p.code}`} value={ceiling} onChange={e => setCeiling(e.target.value)} className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
                  </label>
                  <label className="flex items-center gap-1.5 pb-1 text-slate-300">
                    <input type="checkbox" aria-label="Não pausar se estiver dando lucro" checked={profitOn} onChange={e => setProfitOn(e.target.checked)} />
                    Não pausar se estiver dando lucro
                  </label>
                </div>
                {raising ? (
                  <div className="flex w-full flex-wrap items-center gap-2" data-testid="guard-raise-confirm">
                    <span className="text-amber-300">Aumentar autoriza gastar mais. Digite o código da campanha e o motivo.</span>
                    <input aria-label="Código da campanha" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} placeholder={p.code} autoComplete="off" onPaste={e => e.preventDefault()} className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
                    <input aria-label="Motivo" value={justification} onChange={e => setJustification(e.target.value)} placeholder="Por que aumentar? (mín. 10 letras)" className="min-w-[220px] flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" />
                  </div>
                ) : (
                  <div className="text-slate-500">Baixar o teto salva na hora.{p.guard_state === 'CAPPED' ? ' Para voltar a rodar, suba o teto acima do gasto e depois reative a campanha.' : ''}</div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => saveCap(p)} disabled={busy} className="rounded bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                    Salvar
                  </button>
                  <button onClick={() => setEditing(null)} className="rounded border border-slate-700 px-2.5 py-1 text-slate-300">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => startEdit(p)} className="rounded border border-sky-700/60 px-2.5 py-1 text-sky-200 hover:bg-sky-900/30">
                Editar teto
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
