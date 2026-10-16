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

const ALERT_TONE: Record<'CRITICAL' | 'WARNING' | 'INFO', string> = {
  CRITICAL: 'text-nq-critical-text',
  WARNING: 'text-nq-attention',
  INFO: 'text-nq-info'
};

// NORQVA-0086: bloco no padrão NORQVA Premium (fundo separa, sem borda; título em caixa normal)
const Card: React.FC<{ title: string; icon: React.ElementType; testId: string; children: React.ReactNode }> = ({ title, icon: Icon, testId, children }) => (
  <div className="rounded-nq bg-nq-surface p-4" data-testid={testId}>
    <div className="flex items-center gap-2 text-nq-aux text-nq-muted">
      <Icon aria-hidden="true" className="h-4 w-4" /> {title}
    </div>
    <div className="mt-3 space-y-1 text-nq-body text-nq-text">{children}</div>
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
      <div className="rounded-nq bg-nq-surface p-6 text-nq-aux text-nq-muted" data-testid="credit-forbidden">
        Somente administradores veem os créditos da conta Meta.
      </div>
    );
  }

  const usedPct = data?.used_pct ?? null;
  const barTone = usedPct === null ? 'bg-nq-positive' : usedPct >= 90 ? 'bg-nq-critical' : usedPct >= 70 ? 'bg-nq-attention' : 'bg-nq-positive';
  return (
    <div className="space-y-5" data-testid="account-credit-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-nq-section font-semibold text-nq-text">Créditos da conta Meta</h2>
          <p className="mt-1 max-w-3xl text-nq-aux text-nq-muted">
            Limite de gastos da conta, quanto já foi usado e quando acaba no ritmo atual. Somente leitura: nada aqui altera a conta.
          </p>
        </div>
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-nq-surface px-4 text-nq-aux font-medium text-nq-text active:bg-nq-raised disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {data && (
            <a
              href={data.billing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-full bg-nq-positive px-4 text-nq-aux font-semibold text-nq-on-positive hover:brightness-110"
              data-testid="credit-add-link"
            >
              <PlusCircle aria-hidden="true" className="h-4 w-4" /> Adicionar crédito na Meta <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {error && !data && <div className="rounded-nq bg-nq-critical/10 p-4 text-nq-aux text-nq-critical-text">{error}</div>}
      {loading && !data && <div className="text-nq-aux text-nq-muted">Lendo a cobrança na Meta…</div>}

      {data && (
        <>
          {data.alerts.length > 0 && (
            <div className="rounded-nq bg-nq-surface divide-y divide-nq-line/70" data-testid="credit-alerts">
              {data.alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3 text-nq-aux text-nq-text">
                  {a.level === 'INFO' ? (
                    <Info aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${ALERT_TONE[a.level]}`} />
                  ) : (
                    <AlertTriangle aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${ALERT_TONE[a.level]}`} />
                  )}
                  {a.message}
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Créditos disponíveis" icon={Wallet} testId="credit-available">
              <div className="text-[28px] leading-[34px] font-semibold tracking-tight tabular-nums">{data.limit === null ? 'Sem limite' : brl(data.available)}</div>
              <div className="text-nq-aux text-nq-muted">
                {data.limit === null ? 'A conta não tem limite de gastos definido.' : `de ${brl(data.limit)} de limite · usado ${brl(data.spent)}`}
              </div>
              {usedPct !== null && (
                <div
                  role="progressbar"
                  aria-label={`Usado ${usedPct}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, usedPct))}
                  className="mt-2 h-1.5 rounded-full bg-nq-raised overflow-hidden"
                >
                  <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, usedPct)}%` }} />
                </div>
              )}
              {data.funding?.prepaid_balance !== null && data.funding?.prepaid_balance !== undefined && (
                <div className="pt-1 text-nq-aux text-nq-muted">Saldo pré-pago: {brl(data.funding.prepaid_balance)}</div>
              )}
            </Card>

            <Card title="Previsão até o limite" icon={CalendarClock} testId="credit-forecast">
              <div className="text-nq-aux text-nq-muted">No ritmo dos orçamentos ativos ({brl(data.active_daily_budgets)}/dia)</div>
              <div className="text-nq-section font-semibold tabular-nums">
                {days(data.forecast.days_at_budgets)} <span className="text-nq-aux font-normal text-nq-muted">· até {dateBr(data.forecast.date_at_budgets)}</span>
              </div>
              <div className="pt-2 text-nq-aux text-nq-muted">Na média dos últimos 7 dias ({brl(data.avg_daily_7d)}/dia)</div>
              <div className="text-nq-section font-semibold tabular-nums">
                {days(data.forecast.days_at_avg)} <span className="text-nq-aux font-normal text-nq-muted">· até {dateBr(data.forecast.date_at_avg)}</span>
              </div>
            </Card>

            <Card title="Adicionar crédito" icon={PlusCircle} testId="credit-funding">
              <div className="text-nq-aux text-nq-muted">Forma de pagamento</div>
              <div className="font-semibold">{data.funding ? data.funding.type_label : '—'}</div>
              {data.funding?.display && <div className="text-nq-aux text-nq-muted">{data.funding.display}</div>}
              <div className="pt-1 text-nq-aux text-nq-muted">
                Conta {data.account.name} · {data.account.status_label}
                {data.account.is_prepay === true ? ' · pré-paga' : data.account.is_prepay === false ? ' · pós-paga' : ''}
              </div>
              <a
                href={data.billing_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-nq-aux font-semibold text-nq-positive-text hover:underline"
              >
                Abrir cobrança e pagamentos na Meta <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            </Card>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-nq-caption text-nq-subtle" data-testid="credit-notes">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
            <li>Lido da Meta em {new Date(data.fetched_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{data.cached ? ' (cache de 1 minuto)' : ''}.</li>
          </ul>
        </>
      )}
    </div>
  );
};
