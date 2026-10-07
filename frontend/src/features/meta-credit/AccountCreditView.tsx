import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, RefreshCw, ExternalLink, AlertTriangle, Info, CalendarClock, PlusCircle } from 'lucide-react';

// Créditos da conta Meta — somente leitura. Adicionar crédito abre a central de cobrança da Meta.

interface Panel {
  fetched_at: string;
  cached?: boolean;
  account: { id: string; name: string; currency: string; status: number | null; status_label: string; is_prepay: boolean | null };
  funding: { type: number | null; type_label: string; display: string | null; prepaid_balance: number | null } | null;
  limit: number | null;
  spent: number;
  available: number | null;
  used_pct: number | null;
  balance_due: number | null;
  spend_7d: number;
  avg_daily_7d: number | null;
  active_daily_budgets: number;
  forecast: { days_at_avg: number | null; date_at_avg: string | null; days_at_budgets: number | null; date_at_budgets: string | null };
  alerts: { level: 'CRITICAL' | 'WARNING' | 'INFO'; message: string }[];
  billing_url: string;
  notes: string[];
}

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
}

const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dateBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const days = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR')} dia${n === 1 ? '' : 's'}`);

const ALERT_CLS = {
  CRITICAL: 'border-rose-600/50 bg-rose-950/30 text-rose-200',
  WARNING: 'border-amber-600/50 bg-amber-950/30 text-amber-200',
  INFO: 'border-slate-700 bg-slate-900/50 text-slate-300'
};

const Card: React.FC<{ title: string; icon: React.ElementType; testId: string; children: React.ReactNode }> = ({ title, icon: Icon, testId, children }) => (
  <div className="rounded border border-slate-800 bg-slate-900/50 p-4" data-testid={testId}>
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      <Icon className="h-4 w-4 text-emerald-400" /> {title}
    </div>
    <div className="mt-3 space-y-1 text-sm text-slate-200">{children}</div>
  </div>
);

export const AccountCreditView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const [data, setData] = useState<Panel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (!isAdmin) return;
      setLoading(true);
      setError(null);
      try {
        const r = await apiFetch(`/meta/account-credit?mode=${isDemoView ? 'demo' : 'real'}${refresh ? '&refresh=1' : ''}`);
        setData(r);
      } catch (e: any) {
        const msg = e?.message || 'Falha ao ler a cobrança da conta.';
        setError(msg);
        showError(msg);
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, isDemoView, isAdmin]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="rounded border border-slate-800 p-6 text-sm text-slate-400" data-testid="credit-forbidden">
        Somente administradores veem os créditos da conta Meta.
      </div>
    );
  }

  const usedPct = data?.used_pct ?? null;
  return (
    <div className="space-y-5" data-testid="account-credit-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-100">
            <Wallet className="h-5 w-5 text-emerald-400" /> Créditos da conta Meta
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Limite de gastos da conta, quanto já foi usado e quando acaba no ritmo atual. Somente leitura: nada aqui altera a conta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {data && (
            <a
              href={data.billing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              data-testid="credit-add-link"
            >
              <PlusCircle className="h-3.5 w-3.5" /> Adicionar crédito na Meta <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {error && !data && <div className="rounded border border-rose-700/50 bg-rose-950/30 p-3 text-xs text-rose-200">{error}</div>}
      {loading && !data && <div className="text-sm text-slate-500">Lendo a cobrança na Meta…</div>}

      {data && (
        <>
          {data.alerts.length > 0 && (
            <div className="space-y-2" data-testid="credit-alerts">
              {data.alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${ALERT_CLS[a.level]}`}>
                  {a.level === 'INFO' ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  {a.message}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Créditos disponíveis" icon={Wallet} testId="credit-available">
              <div className="text-2xl font-bold text-slate-100">{data.limit === null ? 'Sem limite' : brl(data.available)}</div>
              <div className="text-xs text-slate-400">
                {data.limit === null ? 'A conta não tem limite de gastos definido.' : `de ${brl(data.limit)} de limite · usado ${brl(data.spent)}`}
              </div>
              {usedPct !== null && (
                <div className="mt-2 h-2 rounded bg-slate-800" aria-label={`Usado ${usedPct}%`}>
                  <div
                    className={`h-2 rounded ${usedPct >= 90 ? 'bg-rose-500' : usedPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, usedPct)}%` }}
                  />
                </div>
              )}
              {data.funding?.prepaid_balance !== null && data.funding?.prepaid_balance !== undefined && (
                <div className="pt-1 text-xs text-slate-400">Saldo pré-pago: {brl(data.funding.prepaid_balance)}</div>
              )}
            </Card>

            <Card title="Previsão até o limite" icon={CalendarClock} testId="credit-forecast">
              <div className="text-xs text-slate-400">No ritmo dos orçamentos ativos ({brl(data.active_daily_budgets)}/dia)</div>
              <div className="text-lg font-bold text-slate-100">
                {days(data.forecast.days_at_budgets)} <span className="text-xs font-normal text-slate-400">· até {dateBr(data.forecast.date_at_budgets)}</span>
              </div>
              <div className="pt-1 text-xs text-slate-400">Na média dos últimos 7 dias ({brl(data.avg_daily_7d)}/dia)</div>
              <div className="text-lg font-bold text-slate-100">
                {days(data.forecast.days_at_avg)} <span className="text-xs font-normal text-slate-400">· até {dateBr(data.forecast.date_at_avg)}</span>
              </div>
            </Card>

            <Card title="Adicionar crédito" icon={PlusCircle} testId="credit-funding">
              <div className="text-xs text-slate-400">Forma de pagamento</div>
              <div className="font-semibold">{data.funding ? data.funding.type_label : '—'}</div>
              {data.funding?.display && <div className="text-xs text-slate-400">{data.funding.display}</div>}
              <div className="pt-1 text-xs text-slate-400">
                Conta {data.account.name} · {data.account.status_label}
                {data.account.is_prepay === true ? ' · pré-paga' : data.account.is_prepay === false ? ' · pós-paga' : ''}
              </div>
              <a href={data.billing_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:underline">
                Abrir cobrança e pagamentos na Meta <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-[11px] text-slate-500" data-testid="credit-notes">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            <li>Lido da Meta em {new Date(data.fetched_at).toLocaleString('pt-BR')}{data.cached ? ' (cache de 1 minuto)' : ''}.</li>
          </ul>
        </>
      )}
    </div>
  );
};
