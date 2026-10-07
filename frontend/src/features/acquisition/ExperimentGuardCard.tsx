import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

// H6/H7/H8 (R-0019-01): teto dos experimentos em andamento. Mostra o gasto lido na Meta, o limite de
// gastos da campanha e o estado do vigia; permite REDUZIR o teto (aumentar exige confirmação forte, H3).

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
}

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
}> = ({ apiFetch, currentUser, isDemoView, showError, showSuccess }) => {
  const enabled = currentUser?.role === 'ADMIN' && !isDemoView;
  const [plans, setPlans] = useState<GuardPlan[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const fetchRef = useRef(apiFetch);
  fetchRef.current = apiFetch;

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetchRef.current('/launch-plans', {}, 'real', currentUser);
      const list: GuardPlan[] = Array.isArray(res?.plans) ? res.plans : [];
      setPlans(list.filter(p => ['ACTIVE', 'APPROVED'].includes(p.status) || p.guard_state === 'CAPPED'));
    } catch {
      setPlans([]);
    }
  }, [enabled]);

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

  const saveCap = async (plan: GuardPlan) => {
    const v = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) return showError('Informe o novo teto em reais.');
    setBusy(true);
    try {
      const r = await fetchRef.current(
        `/launch-plans/${encodeURIComponent(plan.id)}/spend-cap`,
        { method: 'POST', body: JSON.stringify({ max_spend_brl: v }) },
        'real',
        currentUser
      );
      const capMsg = r?.spend_cap?.status === 'APPLIED' ? 'limite aplicado na campanha da Meta' : `limite na Meta não aplicado (${r?.spend_cap?.error || r?.spend_cap?.status}); o vigia do NORQVA segue valendo`;
      showSuccess(`Teto de ${plan.code} agora é ${brl(v)}: ${capMsg}.${r?.guard?.pause?.paused ? ' A campanha foi pausada porque o gasto já chegou ao teto.' : ''}`);
      setEditing(null);
      setValue('');
      await load();
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
            <div className="text-slate-400" data-testid="guard-spend-cap">
              Limite de gastos da campanha na Meta:{' '}
              {p.spend_cap_status === 'APPLIED' ? <span className="text-emerald-300">{brl(applied)} aplicado</span> : p.spend_cap_status === 'FAILED' ? <span className="text-amber-300">não aplicado ({p.spend_cap_error})</span> : <span>ainda não aplicado</span>}
            </div>
            {p.guard_note && <div className="text-slate-500">{p.guard_note}</div>}
            {p.guard_state !== 'CAPPED' &&
              (editing === p.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Novo teto de ${p.code}`}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={String(cap)}
                    className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
                  />
                  <button onClick={() => saveCap(p)} disabled={busy} className="rounded bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                    Salvar e aplicar na Meta
                  </button>
                  <button onClick={() => setEditing(null)} className="rounded border border-slate-700 px-2.5 py-1 text-slate-300">
                    Cancelar
                  </button>
                  <span className="text-slate-500">Só é possível reduzir. Ao atingir o teto, o NORQVA pausa só esta campanha.</span>
                </div>
              ) : (
                <button onClick={() => { setEditing(p.id); setValue(''); }} className="rounded border border-sky-700/60 px-2.5 py-1 text-sky-200 hover:bg-sky-900/30">
                  Reduzir teto
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
};
