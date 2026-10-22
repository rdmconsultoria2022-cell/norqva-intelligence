import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Mail, Link2, Search, ChevronDown } from 'lucide-react';
import { StatusPill, Tone } from '../../components/ui/premium';
import { UserObj } from '../../types';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import { deliveryStatusLabel, accessEmailLabel } from '../../utils/deliveryStatusLabel';

// NORQVA-0085 (D-0082): mesma lógica, apresentação de extrato bancário: pedidos agrupados por dia,
// cliente, hora, valor e situação; ao tocar, o detalhe com entrega, e-mail de acesso e as ações
// (só ADMIN, as mesmas de antes). Os dados do comprador são os mesmos que a tela já mostrava.
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

const PAYMENT_LABEL: Record<string, { text: string; tone: Tone }> = {
  CONFIRMED: { text: 'Pago', tone: 'positive' },
  PENDING: { text: 'Pendente', tone: 'attention' },
  REQUIRES_RECONCILIATION: { text: 'A conferir', tone: 'attention' },
  EXPIRED: { text: 'Pix vencido', tone: 'neutral' },
  FAILED: { text: 'Falhou', tone: 'critical' },
  REFUNDED: { text: 'Estornado', tone: 'neutral' },
  CHARGEBACK: { text: 'Contestado', tone: 'critical' },
  CREATED: { text: 'Sem Pix', tone: 'neutral' }
};

const TONE: Record<string, Tone> = { ok: 'positive', info: 'info', warn: 'attention', muted: 'neutral' };

/** "VENCIDA (SEM DOWNLOAD)" → "Vencida (sem download)" */
const sentence = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);

const TZ = 'America/Sao_Paulo';
const dayKey = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'sem-data';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
function dayLabel(key: string, now = new Date()): string {
  const today = dayKey(now.toISOString());
  const y = new Date(now.getTime() - 86_400_000);
  if (key === 'sem-data') return 'Sem data';
  if (key === today) return 'Hoje';
  if (key === dayKey(y.toISOString())) return 'Ontem';
  const [yy, mm, dd] = key.split('-').map(Number);
  const sameYear = yy === Number(today.slice(0, 4));
  const label = new Date(Date.UTC(yy, mm - 1, dd, 12)).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC'
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
const timeOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
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
  const [copiedLink, setCopiedLink] = useState<{ id: string; url: string; expires: string; copied: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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

  // Copia logo depois de gerar (antes de recarregar a lista), enquanto o clique ainda vale para o navegador
  const copyLink = async (id: string) => {
    setBusy(`link-${id}`);
    try {
      const r = await apiRef.current(`/sales/orders/${id}/access-link?mode=${mode}`, { method: 'POST', body: JSON.stringify({}) });
      if (!r?.url) throw new Error('Não foi possível gerar o link.');
      let copied = false;
      try {
        await navigator.clipboard.writeText(r.url);
        copied = true;
      } catch {
        /* sem permissão: o link fica visível para copiar à mão */
      }
      const expires = r.expires_at ? new Date(r.expires_at).toLocaleDateString('pt-BR') : '';
      setCopiedLink({ id, url: r.url, expires, copied });
      okRef.current(copied ? 'Link copiado. Cole na conversa do WhatsApp.' : 'Link gerado. Copie o link que aparece no pedido.');
      await load();
    } catch (err: any) {
      errRef.current(err.message || 'Não foi possível gerar o link.');
    } finally {
      setBusy(null);
    }
  };

  const orders: any[] = data?.orders || [];
  const summary = data?.summary;

  // agrupa por dia (fuso de São Paulo), na ordem que o servidor manda (mais recentes primeiro)
  const groups: { key: string; items: any[]; total: number }[] = [];
  const byKey = new Map<string, { key: string; items: any[]; total: number }>();
  for (const o of orders) {
    const k = dayKey(o.created_at);
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, items: [], total: 0 };
      byKey.set(k, g);
      groups.push(g);
    }
    g.items.push(o);
    if (o.status === 'PAID') g.total += Number(o.total_amount) || 0;
  }
  const btn = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-full text-[13px] font-semibold disabled:opacity-50';

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto text-nq-text">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight">Vendas</h1>
          <button
            onClick={load}
            disabled={loading}
            aria-label="Atualizar"
            className="h-11 w-11 flex items-center justify-center rounded-full bg-nq-surface text-nq-muted active:bg-nq-raised disabled:opacity-50"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[13px] leading-[18px] text-nq-muted">Pagamento confirmado só pelo Asaas (vendas da Kiwify: confirmadas pela Kiwify). Toque num pedido para ver entrega e ações.</p>
      </header>

      {summary && (
        <div className="rounded-2xl bg-nq-surface p-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5" data-testid="sales-summary">
          <div><div className="text-[13px] text-nq-muted">Receita</div><div className="mt-1 text-[22px] leading-7 font-semibold tabular-nums">{brl(summary.revenue)}</div></div>
          <div><div className="text-[13px] text-nq-muted">Pagos</div><div className="mt-1 text-[22px] leading-7 font-semibold tabular-nums">{summary.paid}</div></div>
          <div><div className="text-[13px] text-nq-muted">Pedidos</div><div className="mt-1 text-[22px] leading-7 font-semibold tabular-nums">{summary.total}</div></div>
          <div><div className="text-[13px] text-nq-muted">Com problema</div><div className={`mt-1 text-[22px] leading-7 font-semibold tabular-nums ${summary.problem > 0 ? 'text-nq-attention' : ''}`}>{summary.problem}</div></div>
        </div>
      )}

      <div className="space-y-3">
        <div role="group" aria-label="Filtro" className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors ${
                filter === f.id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 min-h-[40px] text-[13px] text-nq-muted">
          <input type="checkbox" className="h-5 w-5 accent-nq-positive" checked={includeTests} onChange={e => setIncludeTests(e.target.checked)} />
          Mostrar pedidos de teste
        </label>
      </div>

      {!loading && orders.length === 0 && (
        <p className="rounded-2xl bg-nq-surface p-4 text-[13px] text-nq-muted" data-testid="sales-empty">
          <Search aria-hidden="true" className="inline h-4 w-4 mr-1" /> Nenhum pedido com esse filtro no período.
        </p>
      )}

      <div className="space-y-6">
        {groups.map(g => (
          <section key={g.key} aria-label={dayLabel(g.key)} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-[13px] font-medium text-nq-muted">{dayLabel(g.key)}</h2>
              {g.total > 0 && <span className="text-[13px] text-nq-subtle tabular-nums">{brl(g.total)} pagos</span>}
            </div>
            <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70">
              {g.items.map(o => {
                const pay = PAYMENT_LABEL[o.payment_status] || { text: o.payment_status ? sentence(String(o.payment_status)) : 'Sem Pix', tone: 'neutral' as Tone };
                const dl = deliveryStatusLabel(o);
                const em = accessEmailLabel(o.access_email_status);
                const paid = o.status === 'PAID';
                // NORQVA-0110: venda da Kiwify — pagamento e entrega são da Kiwify, sem ações aqui
                const kiwify = o.source === 'KIWIFY';
                const isOpen = open === o.id;
                const contact = [o.customer?.email, o.customer?.phone].filter((v: any) => v && v !== '[REDACTED]');
                const bumps = Array.isArray(o.items) ? o.items.filter((i: any) => i.is_bump) : [];
                return (
                  <article key={o.id} data-testid="sales-row" className={o.problem ? 'bg-nq-attention/[0.06]' : ''}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : o.id)}
                      aria-expanded={isOpen}
                      aria-controls={`sale-detail-${o.id}`}
                      className="w-full flex items-start gap-3 px-4 py-3.5 min-h-[60px] text-left active:bg-nq-raised"
                    >
                      <span className="block min-w-0 flex-1">
                        <span className="block text-[15px] leading-[22px] text-nq-text break-words">{o.customer?.name}</span>
                        <span className="block text-[13px] leading-[18px] text-nq-muted break-words">
                          {timeOf(o.created_at)} · {o.offer_name || '—'}
                          {bumps.length > 0 ? ` + ${bumps.length === 1 ? bumps[0].name : `${bumps.length} adicionais`}` : ''}
                          {o.is_test ? ' · teste' : ''}
                        </span>
                      </span>
                      <span className="block text-right shrink-0">
                        <span className={`block text-[15px] leading-[22px] font-semibold tabular-nums ${paid ? 'text-nq-text' : 'text-nq-muted'}`}>{brl(o.total_amount)}</span>
                        <span className="mt-0.5 flex flex-col items-end gap-0.5">
                          <span data-testid="sales-payment"><StatusPill tone={pay.tone}>{pay.text}</StatusPill></span>
                          {kiwify && <span data-testid="sales-source"><StatusPill tone="info">Kiwify</StatusPill></span>}
                          {o.problem && <StatusPill tone="attention">Com problema</StatusPill>}
                        </span>
                      </span>
                      <ChevronDown aria-hidden="true" className={`h-4 w-4 mt-1 shrink-0 text-nq-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOpen && (
                      <div id={`sale-detail-${o.id}`} className="px-4 pb-4 space-y-3 text-[13px] leading-[18px]">
                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
                          {contact.length > 0 && (<><dt className="text-nq-muted">Contato</dt><dd className="text-nq-text">{contact.map((c: string) => <div key={c} className="break-all">{c}</div>)}</dd></>)}
                          <dt className="text-nq-muted">Produto</dt>
                          <dd className="text-nq-text">
                            {o.offer_name || '—'}
                            {/* NORQVA-0032: adicional comprado junto; NORQVA-0063: ou outros livros avulsos do mesmo pedido */}
                            {bumps.map((i: any, idx: number) => (
                              <div key={idx} className="text-nq-positive-text" data-testid="sale-bump">+ {i.name}</div>
                            ))}
                          </dd>
                          {kiwify && (<><dt className="text-nq-muted">Origem</dt><dd className="text-nq-text">Kiwify (pagamento e entrega feitos pela Kiwify)</dd></>)}
                          {paid && !kiwify && (<><dt className="text-nq-muted">Entrega</dt><dd><span data-testid="sales-delivery"><StatusPill tone={TONE[dl.tone]}>{sentence(dl.text)}</StatusPill></span></dd></>)}
                          {em && !kiwify && (<><dt className="text-nq-muted">E-mail de acesso</dt><dd><StatusPill tone={TONE[em.tone]}>{sentence(em.text)}</StatusPill></dd></>)}
                          <dt className="text-nq-muted">Data</dt>
                          <dd className="text-nq-text">{Number.isNaN(new Date(o.created_at).getTime()) ? '—' : new Date(o.created_at).toLocaleString('pt-BR', { timeZone: TZ })}</dd>
                          <dt className="text-nq-muted">Pedido</dt>
                          <dd className="font-mono text-[12px] text-nq-subtle break-all">{o.id}</dd>
                        </dl>
                        {isAdmin && !kiwify && (
                          <div className="flex flex-wrap gap-2">
                            {!paid && o.payment_status && o.payment_status !== 'CREATED' && (
                              <button
                                onClick={() => act(`pay-${o.id}`, `/sales/orders/${o.id}/check-payment?mode=${mode}`, r => (r?.status === 'PAID' ? 'Pagamento confirmado pelo Asaas.' : 'O Asaas ainda não confirmou este pagamento.'))}
                                disabled={busy === `pay-${o.id}`}
                                className={`${btn} bg-nq-raised text-nq-text`}
                              >
                                <RefreshCw aria-hidden="true" className="h-4 w-4" /> Conferir pagamento
                              </button>
                            )}
                            {paid && (
                              <>
                                <button
                                  onClick={() => act(`mail-${o.id}`, `/sales/orders/${o.id}/resend-access?mode=${mode}`, () => 'Acesso reenviado por e-mail.')}
                                  disabled={busy === `mail-${o.id}`}
                                  className={`${btn} bg-nq-raised text-nq-text`}
                                >
                                  <Mail aria-hidden="true" className="h-4 w-4" /> Reenviar acesso
                                </button>
                                <button
                                  onClick={() => copyLink(o.id)}
                                  disabled={busy === `link-${o.id}`}
                                  className={`${btn} bg-nq-positive text-nq-on-positive`}
                                >
                                  <Link2 aria-hidden="true" className="h-4 w-4" /> Copiar link
                                </button>
                              </>
                            )}
                          </div>
                        )}
                        {copiedLink && copiedLink.id === o.id && (
                          <div className="rounded-xl bg-nq-raised p-3 text-nq-muted" data-testid="sales-link">
                            {copiedLink.copied ? 'Link copiado' : 'Link gerado'}{copiedLink.expires ? ` (vale até ${copiedLink.expires})` : ''}. Se não colar, copie daqui:{' '}
                            <span className="font-mono text-nq-text break-all select-all">{copiedLink.url}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
