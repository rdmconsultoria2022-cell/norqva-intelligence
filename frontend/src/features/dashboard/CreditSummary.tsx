import React, { useEffect, useState } from 'react';
import { Wallet, AlertTriangle } from 'lucide-react';

// NORQVA-0030: resumo do crédito Meta na Visão Geral (só ADMIN; o detalhe fica em Resultados → Crédito Meta).

const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  onOpenDetails?: () => void;
}

export const CreditSummary: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, onOpenDetails }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [data, setData] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    apiFetch(`/meta/account-credit?mode=${isDemoView ? 'demo' : 'real'}`)
      .then((r: any) => !cancelled && setData(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isDemoView, apiFetch]);

  if (!isAdmin || (!data && !failed)) return null;
  const alerts: any[] = Array.isArray(data?.alerts) ? data.alerts.filter((a: any) => a.level !== 'INFO') : [];
  const days = data?.forecast?.days_at_budgets ?? data?.forecast?.days_at_avg ?? null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs" data-testid="credit-summary">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
          <Wallet className="h-4 w-4 text-emerald-400" /> Crédito Meta
        </span>
        {failed ? (
          <span className="text-slate-500">não foi possível ler agora</span>
        ) : (
          <>
            <span>disponível {data.limit === null ? 'sem limite' : brl(data.available)}</span>
            {days !== null && <span>dura cerca de {days} dia{days === 1 ? '' : 's'}</span>}
            {alerts.length > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {alerts[0].message}
              </span>
            )}
          </>
        )}
      </div>
      {onOpenDetails && (
        <button onClick={onOpenDetails} className="text-emerald-300 hover:underline">
          ver detalhes
        </button>
      )}
    </div>
  );
};
