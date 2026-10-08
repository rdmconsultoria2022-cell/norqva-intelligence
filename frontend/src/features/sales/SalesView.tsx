import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingCart, RefreshCw, Mail, Link2, Search } from 'lucide-react';
import { UserObj } from '../../types';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import { deliveryStatusLabel, accessEmailLabel } from '../../utils/deliveryStatusLabel';

// NORQVA-0026: tela Vendas — cada pedido com pagamento, entrega e e-mail de acesso,
// e as ações para quem pagou e não recebeu. Ações só para ADMIN; nada aqui marca pagamento.

export interface SalesViewProps {
  currentUser: UserObj | null;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'PAID', label: 'Pagos' },
  { id: 'PENDING', label: 'Pendentes' },
  { id: 'PROBLEM', label: 'Com problema' }
];

const PAYMENT_LABEL: Record<string, { text: string; cls: string }> = {
  CONFIRMED: { text: 'PAGO', cls: 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' },
  PENDING: { text: 'PENDENTE', cls: 'bg-amber-950/40 text-amber-400 border border-amber-500/20' },
  REQUIRES_RECONCILIATION: { text: 'A CONFERIR', cls: 'bg-amber-950/40 text-amber-400 border border-amber-500/20' },
  EXPIRED: { text: 'PIX VENCIDO', cls: 'bg-slate-800 text-slate-400' },
  FAILED: { text: 'FALHOU', cls: 'bg-red-950/40 text-red-300 border border-red-500/20' },
  REFUNDED: { text: 'ESTORNADO', cls: 'bg-slate-800 text-slate-400' },
  CREATED: { text: 'SEM PIX', cls: 'bg-slate-800 text-slate-400' }
};

const TONE: Record<string, string> = {
  ok: 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20',
  info: 'bg-blue-950/40 text-blue-400 border border-blue-500/20',
  warn: 'bg-amber-950/40 text-amber-400 border border-amber-500/20',
  muted: 'bg-slate-800 text-slate-400'
};

const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SalesView({ currentUser, isDemoView, apiFetch, showError, showSuccess }: SalesViewProps) {
  const isAdmin = currentUser?.role === 'ADMIN';
  const mode = isDemoView ? 'demo' : 'real';
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);
  const [filter, setFilter] = useState('ALL');
  const [includeTests, setIncludeTests] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<{ id: string; url: string } | null>(null);

  const apiRef = useRef(apiFetch);
  apiRef.current = apiFetch;
  const errRef = useRef(showError);
  errRef.current = showError;
  const okRef = useRef(showSuccess);
  okRef.current = showSuccess;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRef.current(`/sales/orders?mode=${mode}&${periodQs}&filter=${filter}${includeTests ? '&include_tests=true' : ''}`);
      setData(res);
    } catch (err: any) {
      errRef.current(err.message || 'Erro ao carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }, [mode, periodQs, filter, includeTests]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, url: string, ok: (r: any) => string) => {
    setBusy(key);
    try {
      const r = await apiRef.current(url, { method: 'POST', body: JSON.stringify({}) });
      okRef.current(ok(r));
      await load();
      return r;
    } catch (err: any) {
      errRef.current(err.message || 'Operação falhou.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (id: string) => {
    const r = await act(`link-${id}`, `/sales/orders/${id}/access-link?mode=${mode}`, () => 'Link de acesso gerado. Vale por 7 dias.');
    if (!r?.url) return;
    setCopiedLink({ id, url: r.url });
    try {
      await navigator.clipboard.writeText(r.url);
    } catch {
      /* sem permissão de área de transferência: o link fica visível para copiar à mão */
    }
  };

  const orders: any[] = data?.orders || [];
  const summary = data?.summary;

  return (
    <div className="space-y-5 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <ShoppingCart className="h-6 w-6 text-emerald-400" /> Vendas
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Cada pedido com pagamento, entrega e e-mail de acesso. O pagamento só é confirmado pelo Asaas.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Atualizar"
          className="self-start p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono" data-testid="sales-summary">
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50"><div className="text-slate-500">Pedidos</div><div className="text-lg text-white">{summary.total}</div></div>
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50"><div className="text-slate-500">Pagos</div><div className="text-lg text-emerald-300">{summary.paid}</div></div>
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50"><div className="text-slate-500">Receita</div><div className="text-lg text-white">{brl(summary.revenue)}</div></div>
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50"><div className="text-slate-500">Com problema</div><div className={`text-lg ${summary.problem > 0 ? 'text-amber-300' : 'text-white'}`}>{summary.problem}</div></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`px-3 py-1.5 rounded text-xs font-semibold border ${
              filter === f.id ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40' : 'border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
          <input type="checkbox" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} />
          Mostrar pedidos de teste
        </label>
      </div>

      {!loading && orders.length === 0 && (
        <p className="text-sm text-slate-500" data-testid="sales-empty">
          <Search className="inline h-4 w-4 mr-1" /> Nenhum pedido com esse filtro no período.
        </p>
      )}

      <div className="space-y-2">
        {orders.map(o => {
          const pay = PAYMENT_LABEL[o.payment_status] || { text: o.payment_status || 'SEM PIX', cls: TONE.muted };
          const dl = deliveryStatusLabel(o);
          const em = accessEmailLabel(o.access_email_status);
          const paid = o.status === 'PAID';
          return (
            <article
              key={o.id}
              data-testid="sales-row"
              className={`rounded-lg border p-3 text-xs flex flex-col lg:flex-row lg:flex-wrap lg:items-center gap-3 ${o.problem ? 'border-amber-700/50 bg-amber-950/10' : 'border-slate-800 bg-slate-900/40'}`}
            >
              <div className="lg:w-36 shrink-0 font-mono text-slate-500">{new Date(o.created_at).toLocaleString('pt-BR')}</div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-200 font-semibold truncate">{o.customer?.name}</div>
                <div className="text-slate-500 truncate">
                  {[o.customer?.email, o.customer?.phone].filter(v => v && v !== '[REDACTED]').join(' · ')}
                </div>
              </div>
              <div className="lg:w-56 min-w-0">
                <div className="text-slate-300 truncate">{o.offer_name || '—'}</div>
                <div className="text-slate-500">{brl(o.total_amount)}{o.is_test ? ' · teste' : ''}</div>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:w-72">
                <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${pay.cls}`} data-testid="sales-payment">{pay.text}</span>
                {paid && <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${TONE[dl.tone]}`} data-testid="sales-delivery">{dl.text}</span>}
                {em && <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${TONE[em.tone]}`}>{em.text}</span>}
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-1.5 lg:justify-end lg:w-80">
                  {!paid && o.payment_status && o.payment_status !== 'CREATED' && (
                    <button
                      onClick={() => act(`pay-${o.id}`, `/sales/orders/${o.id}/check-payment?mode=${mode}`, r => (r?.status === 'PAID' ? 'Pagamento confirmado pelo Asaas.' : 'O Asaas ainda não confirmou este pagamento.'))}
                      disabled={busy === `pay-${o.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Conferir pagamento
                    </button>
                  )}
                  {paid && (
                    <>
                      <button
                        onClick={() => act(`mail-${o.id}`, `/sales/orders/${o.id}/resend-access?mode=${mode}`, () => 'Acesso reenviado por e-mail.')}
                        disabled={busy === `mail-${o.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-700 text-slate-200 disabled:opacity-50"
                      >
                        <Mail className="h-3.5 w-3.5" /> Reenviar acesso
                      </button>
                      <button
                        onClick={() => copyLink(o.id)}
                        disabled={busy === `link-${o.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-bold disabled:opacity-50"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Copiar link
                      </button>
                    </>
                  )}
                </div>
              )}
              {copiedLink?.id === o.id && (
                <div className="lg:basis-full text-[11px] text-slate-400" data-testid="sales-link">
                  Link copiado (vale 7 dias). Se não colar, copie daqui:{' '}
                  <span className="font-mono text-slate-200 break-all select-all">{copiedLink.url}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
