import React, { useEffect, useState } from 'react';
import { Wallet, AlertTriangle, ChevronRight } from 'lucide-react';

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

  // NORQVA-0082: mesma informação, no estilo de linha da Visão Geral
  return (
    <div
      className={`rounded-2xl bg-nq-surface px-4 py-3.5 flex items-center gap-3 ${onOpenDetails ? 'cursor-pointer active:bg-nq-raised' : ''}`}
      data-testid="credit-summary"
      role={onOpenDetails ? 'button' : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
      aria-label={onOpenDetails ? 'Crédito Meta: ver detalhes' : undefined}
      onClick={onOpenDetails}
      onKeyDown={e => {
        if (onOpenDetails && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenDetails();
        }
      }}
    >
      <Wallet aria-hidden="true" className="h-5 w-5 text-nq-muted shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-[22px] text-nq-text">Crédito Meta</div>
        {failed ? (
          <div className="text-[13px] leading-[18px] text-nq-muted">não foi possível ler agora</div>
        ) : (
          <>
            <div className="text-[13px] leading-[18px] text-nq-muted">
              {days !== null ? `dura cerca de ${days} dia${days === 1 ? '' : 's'}` : 'previsão indisponível'}
            </div>
            {alerts.length > 0 && (
              <div className="mt-1 inline-flex items-center gap-1 text-[13px] leading-[18px] text-nq-attention">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> {alerts[0].message}
              </div>
            )}
          </>
        )}
      </div>
      {!failed && (
        <div className="text-right shrink-0">
          <div className="text-[15px] leading-[22px] font-semibold text-nq-text tabular-nums">{data.limit === null ? 'sem limite' : brl(data.available)}</div>
          <div className="text-[12px] leading-4 text-nq-muted">disponível</div>
        </div>
      )}
      {onOpenDetails && <ChevronRight aria-hidden="true" className="h-4 w-4 text-nq-subtle shrink-0" />}
    </div>
  );
};
