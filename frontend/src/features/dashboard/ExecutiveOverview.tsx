import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, RefreshCw } from 'lucide-react';
import { useGlobalPeriod, periodQuery, periodLabel, GlobalPeriodOption } from '../../lib/globalPeriod';
import { getMetaDeliveryStatus } from '../acquisition/MetaAdsView';
import { LaunchPlansCard, needsOperator, isPlan } from '../acquisition/LaunchPlansCard';
import { ExperimentGuardCard } from '../acquisition/ExperimentGuardCard';
import { deliveryStatusLabel, accessEmailLabel } from '../../utils/deliveryStatusLabel';
import {
  Section,
  Surface,
  Row,
  RowGroup,
  StatusPill,
  ProgressBar,
  Disclosure,
  Stat,
  Tone,
  toneText,
  brl,
  int,
  pct,
  multiple
} from '../../components/ui/premium';
import { previousPeriodOf, changePct, todayInSaoPaulo, addDays } from './previousPeriod';
import { DailyChart, DailyPoint } from './DailyChart';
import { DashboardProps } from './dashboardTypes';

// NORQVA-0082 (protótipo): Visão Geral como painel executivo de leitura rápida.
// Só apresentação. Lê os MESMOS endpoints de antes (/executive/dashboard e /financial/dashboard, com o
// mesmo período) e /launch-plans (só ADMIN, como os cartões de aprovação e teto). Nenhuma fórmula nova:
// receita, investimento, ROAS e resultado vêm prontos do resumo financeiro do servidor.
// As ações protegidas (Sim/Não da campanha, teto) continuam nos componentes originais, sem mudança.

// NORQVA-0157: regra de três da projeção (média diária dos 7 dias × 30)
const proj30 = (v: any) => ((Number(v) || 0) / 7) * 30;
const fmtDay = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('/');

type Props = DashboardProps & { onOpenTab?: (tab: string) => void };

const QUICK: Array<{ id: GlobalPeriodOption; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'all', label: 'Tudo' }
];

const isAbort = (err: any) => err?.name === 'AbortError' || String(err?.message || '').includes('aborted');

/** "PAUSADO P/ CAMPANHA" → "Pausado p/ campanha" */
function sentence(s: string): string {
  const low = s.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

function campaignTone(raw: string): Tone {
  const r = raw.toUpperCase();
  if (r === 'ACTIVE') return 'positive';
  if (['DISAPPROVED', 'WITH_ISSUES'].includes(r)) return 'critical';
  if (['PENDING_START_TIME', 'IN_PROCESS', 'PENDING_REVIEW'].includes(r)) return 'attention';
  return 'neutral';
}

function orderStatus(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'PAID':
      return { label: 'Pago', tone: 'positive' };
    case 'PENDING':
      return { label: 'Aguardando', tone: 'attention' };
    case 'CANCELLED':
      return { label: 'Cancelado', tone: 'neutral' };
    case 'EXPIRED':
      return { label: 'Expirado', tone: 'neutral' };
    case 'REFUNDED':
      return { label: 'Estornado', tone: 'critical' };
    case 'FAILED':
      return { label: 'Falhou', tone: 'critical' };
    default:
      return { label: sentence(String(status || '—')), tone: 'neutral' };
  }
}

function methodLabel(m?: string | null): string {
  if (!m) return 'sem pagamento';
  if (m === 'CREDIT_CARD') return 'Cartão';
  if (m === 'PIX') return 'Pix';
  return sentence(m);
}

function paymentLabel(st?: string | null): string {
  switch (st) {
    case 'CONFIRMED':
      return 'Confirmado';
    case 'PENDING':
      return 'Aguardando';
    case 'FAILED':
      return 'Falhou';
    case 'CANCELLED':
      return 'Cancelado';
    case 'REFUNDED':
      return 'Estornado';
    case null:
    case undefined:
    case '':
      return 'Não iniciado';
    default:
      return String(st);
  }
}

const DL_TONE: Record<string, Tone> = { ok: 'positive', info: 'info', warn: 'attention', muted: 'neutral' };

function when(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function timeOnly(isoStr?: string | null): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Comparação atual × anterior em barras horizontais (responde: "estou melhor que antes?"). */
function CompareBars({ label, current, previous, format, testId }: { label: string; current: number; previous: number; format: (n: number) => string; testId?: string }) {
  const max = Math.max(current, previous, 0.0001);
  const delta = changePct(current, previous);
  return (
    <div data-testid={testId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-nq-aux text-nq-muted">{label}</span>
        {delta !== null && (
          <span className={`text-nq-aux font-medium tabular-nums ${delta >= 0 ? 'text-nq-text' : 'text-nq-muted'}`}>
            {delta >= 0 ? '+' : ''}
            {pct(delta)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-nq-caption">
        <span className="text-nq-text">Agora</span>
        <div className="h-2 rounded-full bg-nq-raised overflow-hidden">
          <div className="h-full rounded-full bg-nq-text" style={{ width: `${(current / max) * 100}%` }} />
        </div>
        <span className="tabular-nums text-nq-text text-right">{format(current)}</span>
        <span className="text-nq-muted">Antes</span>
        <div className="h-2 rounded-full bg-nq-raised overflow-hidden">
          <div className="h-full rounded-full bg-nq-subtle/60" style={{ width: `${(previous / max) * 100}%` }} />
        </div>
        <span className="tabular-nums text-nq-muted text-right">{format(previous)}</span>
      </div>
    </div>
  );
}

export function ExecutiveOverview({
  currentUser,
  isDemoView,
  apiFetch,
  refreshTrigger,
  showError,
  showSuccess,
  onViewSales,
  onOpenTab,
  metaCreditSlot
}: Props) {
  const { globalPeriod, setGlobalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);
  const mode = isDemoView ? 'demo' : 'real';
  const isAdmin = currentUser?.role === 'ADMIN' && !isDemoView;
  // recalcula na virada do dia (a tela pode ficar aberta)
  const today = todayInSaoPaulo();
  const prev = useMemo(() => previousPeriodOf(globalPeriod), [periodQs, today]);
  const prevQs = prev.query ? periodQuery(prev.query) : null;

  const [exec, setExec] = useState<any>(null);
  const [fin, setFin] = useState<any>(null);
  const [prevFin, setPrevFin] = useState<any>(null);
  const [daily, setDaily] = useState<DailyPoint[] | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [showDates, setShowDates] = useState(globalPeriod.period === 'custom');
  const [from, setFrom] = useState(globalPeriod.startDate || '');
  const [to, setTo] = useState(globalPeriod.endDate || '');
  const [dateError, setDateError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    setFailed(false);
    const opts = { signal: c.signal };
    Promise.all([
      apiFetch(`/executive/dashboard?mode=${mode}&${periodQs}`, opts),
      apiFetch(`/financial/dashboard?mode=${mode}&${periodQs}`, opts),
      prevQs ? apiFetch(`/financial/dashboard?mode=${mode}&${prevQs}`, opts).catch(() => null) : Promise.resolve(null),
      // série por dia (D-0082): se falhar, a tela segue sem o gráfico
      apiFetch(`/executive/daily?mode=${mode}&${periodQs}`, opts).catch(() => null)
    ])
      .then(([e, f, pf, dd]) => {
        if (c.signal.aborted) return;
        setExec(e);
        setFin(f);
        setPrevFin(pf);
        setDaily(Array.isArray(dd?.days) ? dd.days : null);
      })
      .catch(err => {
        if (isAbort(err) || c.signal.aborted) return;
        setFailed(true);
        showError(err?.message || 'Erro ao carregar a Visão Geral.');
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [mode, periodQs, prevQs, refreshTrigger, reload, apiFetch]);

  // período ou modo novo: some com os números antigos até chegarem os novos
  useEffect(() => {
    setExec(null);
    setFin(null);
    setPrevFin(null);
    setDaily(null);
  }, [mode, periodQs]);

  // NORQVA-0157: projeção de 30 dias pelo ritmo dos últimos 7 dias INTEIROS (ontem e os 6 antes), seja qual for
  // o período escolhido. Mesmo endpoint e mesmas fórmulas do servidor; aqui só a regra de três (÷ 7 × 30).
  const [last7, setLast7] = useState<any>(null);
  useEffect(() => {
    const c = new AbortController();
    const qs = periodQuery({ period: 'custom', startDate: addDays(today, -7), endDate: addDays(today, -1) } as any);
    apiFetch(`/financial/dashboard?mode=${mode}&${qs}`, { signal: c.signal })
      .then((r: any) => !c.signal.aborted && setLast7(r?.summary || null))
      .catch(() => !c.signal.aborted && setLast7(null));
    return () => c.abort();
  }, [mode, today, refreshTrigger, reload, apiFetch]);

  // Planos de campanha (aprovação e teto): mesma rota e mesma regra dos cartões originais, só ADMIN.
  useEffect(() => {
    if (!isAdmin) {
      setPlans([]);
      return;
    }
    let cancelled = false;
    (apiFetch as any)('/launch-plans', {}, 'real', currentUser)
      .then((r: any) => !cancelled && setPlans(Array.isArray(r?.plans) ? r.plans : []))
      .catch(() => !cancelled && setPlans([]));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, refreshTrigger, reload, apiFetch]);

  const s = fin?.summary || null;
  const ps = prevFin?.summary || null;
  const commerce = exec?.commerce || null;
  const finance = exec?.finance || null;
  const delivery = exec?.delivery || null;
  const meta = exec?.meta || null;
  const coverage = String(fin?.costCoverage || s?.costCoverage || '');
  const costComplete = coverage === 'COMPLETE';
  const costHint = costComplete ? 'custos completos' : coverage === 'PARTIAL' ? 'custos parciais' : 'custos desconhecidos';
  const revenueDelta = s && ps ? changePct(s.grossRevenue, ps.grossRevenue) : null;

  // mesma regra do cartão de aprovação (isPlan + needsOperator), para o resumo nunca prometer o que o cartão não mostra
  const awaiting = plans.filter(isPlan).filter(needsOperator);
  const guarded = plans.filter(p => ['ACTIVE', 'APPROVED'].includes(p.status) || p.guard_state === 'CAPPED');
  const guardTrouble = guarded.filter(p => ['CAPPED', 'PAUSE_FAILED'].includes(String(p.guard_state)));

  const campaigns = useMemo(() => {
    const list: any[] = Array.isArray(meta?.campaigns) ? meta.campaigns : [];
    const byMeta = new Map<string, any>();
    (Array.isArray(fin?.byCampaign) ? fin.byCampaign : []).forEach((c: any) => {
      const k = String(c.metaCampaignId || c.metaId || c.id || '');
      if (k) byMeta.set(k, c);
    });
    return list
      .map(c => {
        const f = byMeta.get(String(c.meta_campaign_id)) || null;
        const raw = String(c.effective_status || c.status || '');
        return {
          id: c.id,
          name: c.name,
          productName: f?.productName ? String(f.productName) : null,
          metaId: c.meta_campaign_id,
          raw,
          statusLabel: sentence(getMetaDeliveryStatus(c.effective_status, c.status).label),
          tone: campaignTone(raw),
          syncedAt: c.last_synced_at,
          spend: f ? Number(f.spend ?? 0) : null,
          revenue: f ? Number(f.attributedRevenue ?? f.attributedGrossRevenue ?? 0) : null,
          orders: f ? Number(f.attributedOrders ?? f.attributedPaidOrders ?? 0) : null,
          roas: f && f.roas !== null && f.roas !== undefined ? Number(f.roas) : null
        };
      })
      .sort((a, b) => (a.raw === 'ACTIVE' ? 0 : 1) - (b.raw === 'ACTIVE' ? 0 : 1) || (b.spend ?? 0) - (a.spend ?? 0));
  }, [meta, fin]);
  // mais de uma campanha do mesmo produto: mostra também o nome da Meta, para distinguir
  const repeatedProducts = new Set(
    campaigns.map(c => c.productName).filter((n, i, all): n is string => !!n && all.indexOf(n) !== i)
  );

  const recent: any[] = Array.isArray(exec?.recentOrders) ? exec.recentOrders : [];
  const metaSync = timeOnly(meta?.lastSync);

  const pickPeriod = (id: GlobalPeriodOption) => {
    setShowDates(false);
    setDateError(null);
    setGlobalPeriod({ period: id });
  };
  const applyDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setDateError('Escolha a data inicial e a final.');
    if (from > to) return setDateError('A data inicial não pode ser depois da final.');
    setDateError(null);
    setGlobalPeriod({ period: 'custom', startDate: from, endDate: to });
  };

  const first = loading && !exec;
  // sem dados (carregando ou erro): mostra '—', nunca zero como se fosse real
  const show = (v: string) => (first ? '…' : s ? v : '—');

  // ---------- blocos ----------

  const hero = (
    <section aria-label="Resultado do período" data-testid="overview-hero" className="space-y-5">
      <div className="px-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-nq-aux text-nq-muted">Receita confirmada · {periodLabel(globalPeriod)}</span>
          <button
            type="button"
            onClick={() => setReload(n => n + 1)}
            aria-label="Atualizar números"
            className="h-10 w-10 -mr-2 flex items-center justify-center rounded-full text-nq-subtle active:bg-nq-surface"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div data-testid="overview-revenue" className="text-nq-hero font-semibold text-nq-text tabular-nums -mt-1">
          {first ? <span className="inline-block h-10 w-48 rounded-lg bg-nq-surface animate-pulse" /> : s ? brl(s.grossRevenue) : '—'}
          {failed && !first && <span className="block text-nq-aux font-normal text-nq-critical-text mt-1" role="alert">Não foi possível carregar. Toque em atualizar.</span>}
        </div>
        <div className="mt-1.5 min-h-[20px] text-nq-aux" data-testid="overview-revenue-delta">
          {revenueDelta !== null ? (
            <span className={`inline-flex items-center gap-1 font-medium ${revenueDelta >= 0 ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>
              {revenueDelta >= 0 ? <ArrowUpRight aria-hidden="true" className="h-4 w-4" /> : <ArrowDownRight aria-hidden="true" className="h-4 w-4" />}
              {revenueDelta >= 0 ? '+' : ''}
              {pct(revenueDelta)}
              <span className="text-nq-muted font-normal">{prev.label}</span>
            </span>
          ) : (
            <span className="text-nq-muted">{prev.query ? (ps ? 'Sem receita no período anterior para comparar.' : '') : prev.unavailableReason}</span>
          )}
        </div>
      </div>

      <div role="group" aria-label="Período" className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar" data-testid="overview-period-chips">
        {QUICK.map(o => {
          const active = !showDates && globalPeriod.period === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => pickPeriod(o.id)}
              className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${
                active ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted active:bg-nq-raised'
              }`}
            >
              {o.label}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={showDates || globalPeriod.period === 'custom'}
          onClick={() => setShowDates(v => !v)}
          className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${
            showDates || globalPeriod.period === 'custom' ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted'
          }`}
        >
          Datas
        </button>
      </div>

      {showDates && (
        <form onSubmit={applyDates} className="rounded-nq bg-nq-surface p-4 grid grid-cols-2 gap-3" data-testid="overview-custom-dates">
          <label className="text-nq-caption text-nq-muted space-y-1.5">
            <span className="block">De</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Data inicial"
              className="w-full h-11 rounded-xl bg-nq-raised px-3 text-nq-body text-nq-text [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-nq-positive/60" />
          </label>
          <label className="text-nq-caption text-nq-muted space-y-1.5">
            <span className="block">Até</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Data final"
              className="w-full h-11 rounded-xl bg-nq-raised px-3 text-nq-body text-nq-text [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-nq-positive/60" />
          </label>
          <button type="submit" className="col-span-2 h-11 rounded-xl bg-nq-text text-nq-bg text-nq-body font-semibold">
            Aplicar
          </button>
          {dateError && <p role="alert" className="col-span-2 text-nq-aux text-nq-critical-text">{dateError}</p>}
        </form>
      )}

      <Surface className="p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Stat testId="overview-spend" label="Investimento" value={show(brl(s?.totalSpend))} hint="anúncios na Meta" />
          <Stat
            testId="overview-roas"
            label="ROAS"
            value={show(multiple(s?.roas))}
            hint="receita ÷ anúncios"
            tone={s?.roas !== null && s?.roas !== undefined ? (s.roas >= 1 ? 'positive' : 'critical') : 'neutral'}
          />
          <Stat testId="overview-costs" label="Custos" value={show(brl(s?.totalCosts))} hint="impostos, taxas e custos fixos" />
          <Stat
            testId="overview-sales"
            label="Vendas pagas"
            value={show(int(s?.paidOrdersCount))}
            hint={commerce ? `${int(commerce.pendingOrders)} aguardando` : undefined}
          />
          <div className="col-span-2 pt-4 border-t border-nq-line/60">
            <Stat
              testId="overview-net"
              label="Lucro estimado"
              value={show(brl(s?.netProfit))}
              tone={s ? (s.netProfit >= 0 ? 'positive' : 'critical') : 'neutral'}
              hint={`receita − investimento − custos · ${costHint}`}
            />
          </div>
        </div>
        <p className="mt-4 pt-3 border-t border-nq-line/60 flex gap-2 text-nq-caption text-nq-muted" data-testid="overview-net-note">
          <Info aria-hidden="true" className="h-3.5 w-3.5 mt-px shrink-0" />
          <span>
            Lucro estimado = receita − anúncios − custos registrados no NORQVA
            {costComplete ? '' : ' (alguns custos ainda não estão cadastrados)'}. Não é lucro contábil.
          </span>
        </p>
      </Surface>

      <div data-testid="overview-projection">
      <Surface className="p-4">
        <div className="text-nq-aux text-nq-muted">Projeção para os próximos 30 dias</div>
        {last7 ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5">
              <Stat testId="projection-revenue" label="Receita" value={brl(proj30(last7.grossRevenue))} />
              <Stat testId="projection-sales" label="Vendas" value={int(Math.round(proj30(last7.paidOrdersCount)))} />
              <Stat testId="projection-spend" label="Investimento" value={brl(proj30(last7.totalSpend))} />
              <Stat testId="projection-costs" label="Custos" value={brl(proj30(last7.totalCosts))} />
              <div className="col-span-2 pt-4 border-t border-nq-line/60">
                <Stat
                  testId="projection-net"
                  label="Lucro estimado"
                  value={brl(proj30(last7.netProfit))}
                  tone={proj30(last7.netProfit) >= 0 ? 'positive' : 'critical'}
                />
              </div>
            </div>
            <p className="mt-4 pt-3 border-t border-nq-line/60 flex gap-2 text-nq-caption text-nq-muted" data-testid="projection-note">
              <Info aria-hidden="true" className="h-3.5 w-3.5 mt-px shrink-0" />
              <span>
                Se o ritmo de {fmtDay(addDays(today, -7))} a {fmtDay(addDays(today, -1))} (últimos 7 dias inteiros) continuar igual.
                É uma estimativa: muda com orçamento, criativos e sazonalidade.
              </span>
            </p>
          </>
        ) : (
          <div className="mt-2 text-nq-caption text-nq-muted">Sem dados dos últimos 7 dias para projetar.</div>
        )}
      </Surface>
      </div>
    </section>
  );

  const performance = (
    <Section title="Desempenho" testId="overview-performance">
      {daily && daily.length >= 2 && (
        <Surface className="p-4">
          <DailyChart days={daily} />
        </Surface>
      )}
      <Surface className="p-4 space-y-5">
        {s && ps ? (
          <>
            <CompareBars testId="compare-revenue" label="Receita" current={Number(s.grossRevenue) || 0} previous={Number(ps.grossRevenue) || 0} format={n => brl(n)} />
            <CompareBars testId="compare-spend" label="Investimento" current={Number(s.totalSpend) || 0} previous={Number(ps.totalSpend) || 0} format={n => brl(n)} />
            <CompareBars testId="compare-sales" label="Vendas pagas" current={Number(s.paidOrdersCount) || 0} previous={Number(ps.paidOrdersCount) || 0} format={n => int(n)} />
            <p className="text-nq-caption text-nq-muted">
              Comparado com os {globalPeriod.period === 'yesterday' ? 'dia anterior' : 'dias anteriores de mesmo tamanho'} ({prev.label.replace('vs ', '')}
).
              {['7d', '30d', '90d'].includes(globalPeriod.period) ? ' O período atual inclui hoje, que ainda não terminou.' : ''}
            </p>
          </>
        ) : (
          <p className="text-nq-aux text-nq-muted" data-testid="compare-unavailable">
            {prev.query ? (first || loading ? 'Carregando comparação…' : 'Não foi possível carregar o período anterior.') : prev.unavailableReason}
          </p>
        )}
      </Surface>
    </Section>
  );

  const pendingDownloads = Number(delivery?.pendingDownloads) || 0;
  const needsYou = (
    <Section title="Precisa de você" testId="overview-needs-you">
      {awaiting.length === 0 && guardTrouble.length === 0 && pendingDownloads === 0 ? (
        <Surface className="px-4 py-4 text-nq-aux text-nq-muted">Nada pendente agora.</Surface>
      ) : (
        <RowGroup>
          {awaiting.length > 0 && (
            <Disclosure
              testId="needs-launch-approval"
              summary={
                <span className="flex flex-col">
                  <StatusPill tone="attention">Aguardando sua decisão</StatusPill>
                  <span className="mt-1 text-nq-body text-nq-text">
                    {awaiting.length === 1 ? '1 campanha pronta para ativar' : `${awaiting.length} campanhas prontas para ativar`}
                  </span>
                </span>
              }
            >
              {/* componente original: Sim/Não, confirmação e auditoria sem mudança */}
              <LaunchPlansCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} onAnswered={() => setReload(n => n + 1)} />
            </Disclosure>
          )}
          {guardTrouble.map(p => (
            <Row
              key={`g-${p.id}`}
              testId="needs-guard"
              left={p.spec?.campaign?.name || p.code}
              sub={<StatusPill tone="critical">{p.guard_state === 'PAUSE_FAILED' ? 'Falha ao pausar: pause no Gerenciador da Meta' : 'Teto atingido, campanha pausada'}</StatusPill>}
              chevron
              onClick={() => onOpenTab?.('campaigns')}
            />
          ))}
          {pendingDownloads > 0 && (
            <Row
              testId="needs-downloads"
              left={pendingDownloads === 1 ? '1 arquivo liberado ainda não baixado' : `${int(pendingDownloads)} arquivos liberados ainda não baixados`}
              sub="Um pedido do kit tem mais de um arquivo"
              chevron={!!onViewSales}
              onClick={onViewSales}
            />
          )}
        </RowGroup>
      )}
    </Section>
  );

  // NORQVA-0084: o Teto dos experimentos é o próprio cartão (consumo, saldo, teto NORQVA × limite na
  // Meta, regras e edição), o mesmo da tela Campanhas; aqui, para todos os experimentos em andamento.
  const guardSection = guarded.length > 0 && (
    <div data-testid="overview-guard" className="space-y-2">
      <ExperimentGuardCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} onChanged={() => setReload(n => n + 1)} />
      {onOpenTab && (
        <button type="button" onClick={() => onOpenTab('campaigns')} className="h-10 px-1 text-nq-aux text-nq-muted">
          Ver campanhas
        </button>
      )}
    </div>
  );

  const operation = (
    <Section title="Operação" testId="overview-operation">
      <RowGroup>
        <Row testId="op-paid" left="Pedidos pagos" right={commerce ? int(commerce.paidOrders) : '—'} subRight={commerce ? `de ${int(commerce.totalOrders)} criados` : undefined} />
        <Row
          testId="op-pending"
          left="Aguardando pagamento"
          right={commerce ? int(commerce.pendingOrders) : '—'}
          subRight={commerce && commerce.cancelledOrders > 0 ? `${int(commerce.cancelledOrders)} cancelados` : undefined}
        />
        <Row
          testId="op-pix"
          left="Pagamentos confirmados"
          sub={finance ? `${int(finance.totalPixConfirmed)} de ${int(finance.totalPixCreated)} cobranças` : undefined}
          right={finance ? pct(finance.approvalRate) : '—'}
          subRight="aprovação"
        />
        <Row
          testId="op-delivery"
          left="Arquivos entregues"
          sub={delivery ? `${int(delivery.completedDownloads)} já baixados` : undefined}
          right={delivery ? int(delivery.totalEntitlements) : '—'}
          subRight="liberadas"
        />
      </RowGroup>
      {metaCreditSlot}
    </Section>
  );

  const campaignSection = (
    <Section
      title="Campanhas"
      testId="overview-campaigns"
      action={onOpenTab && (
        <button type="button" onClick={() => onOpenTab('campaigns')} className="h-10 text-nq-aux text-nq-muted">Ver todas</button>
      )}
    >
      {campaigns.length === 0 ? (
        <Surface className="px-4 py-4 text-nq-aux text-nq-muted">Nenhuma campanha sincronizada da Meta.</Surface>
      ) : (
        <RowGroup>
          {campaigns.slice(0, 4).map(c => {
            const losing = c.spend !== null && c.revenue !== null && c.spend > 0 && c.revenue < c.spend;
            return (
              <div key={c.id} data-testid="overview-campaign">
                <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* D-0082: o nome do produto ligado à campanha; o nome da Meta fica nos detalhes */}
                    <div className={`text-nq-body text-nq-text ${c.productName ? 'break-words' : 'break-all'}`} data-testid="overview-campaign-name">
                      {c.productName || c.name}
                    </div>
                    {c.productName && repeatedProducts.has(c.productName) && (
                      <div className="text-nq-caption text-nq-subtle break-all">{c.name}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <StatusPill tone={c.tone}>{c.statusLabel}</StatusPill>
                      {losing && <StatusPill tone="attention">Receita abaixo do investimento</StatusPill>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-nq-body font-semibold tabular-nums ${c.roas === null ? 'text-nq-muted' : c.roas >= 1 ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>{multiple(c.roas)}</div>
                    <div className="text-nq-caption text-nq-muted">ROAS</div>
                  </div>
                </div>
                <div className="px-4 pb-3 grid grid-cols-3 gap-3 text-nq-caption">
                  <div className="min-w-0"><div className="text-nq-muted">Investido</div><div className="text-nq-text tabular-nums truncate">{brl(c.spend)}</div></div>
                  <div className="min-w-0"><div className="text-nq-muted">Receita atribuída</div><div className="text-nq-text tabular-nums truncate">{brl(c.revenue)}</div></div>
                  <div className="min-w-0"><div className="text-nq-muted">Vendas</div><div className="text-nq-text tabular-nums">{int(c.orders)}</div></div>
                </div>
                <Disclosure summary="Detalhes técnicos" className="-mt-1">
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-nq-caption">
                    <dt className="text-nq-muted">Campanha na Meta</dt>
                    <dd className="font-mono text-nq-text break-all">{c.name}</dd>
                    <dt className="text-nq-muted">ID na Meta</dt>
                    <dd className="font-mono text-nq-text break-all">{c.metaId}</dd>
                    <dt className="text-nq-muted">Situação na Meta</dt>
                    <dd className="font-mono text-nq-text">{c.raw || '—'}</dd>
                    <dt className="text-nq-muted">Sincronizada</dt>
                    <dd className="text-nq-text">{when(c.syncedAt)}</dd>
                  </dl>
                </Disclosure>
              </div>
            );
          })}
        </RowGroup>
      )}
      {meta && (
        <RowGroup>
          <Disclosure summary="Tráfego da Meta no período" testId="overview-meta-traffic">
            <div className="grid grid-cols-3 gap-x-3 gap-y-4">
              <Stat label="Impressões" value={int(meta.impressions)} />
              <Stat label="Alcance" value={int(meta.reach)} />
              <Stat label="Cliques" value={int(meta.clicks)} />
              <Stat label="CTR" value={pct(meta.ctr, 2)} />
              <Stat label="CPC" value={brl(meta.cpc)} />
              <Stat label="CPM" value={brl(meta.cpm)} />
            </div>
          </Disclosure>
        </RowGroup>
      )}
    </Section>
  );

  const sales = (
    <Section
      title="Últimas vendas"
      testId="overview-recent-orders"
      action={onViewSales && (
        <button type="button" onClick={onViewSales} data-testid="view-all-sales" className="h-10 text-nq-aux text-nq-muted">Ver todas</button>
      )}
    >
      {recent.length === 0 ? (
        <Surface className="px-4 py-4 text-nq-aux text-nq-muted">Nenhum pedido no período.</Surface>
      ) : (
        <RowGroup>
          {recent.slice(0, 5).map(o => {
            const st = orderStatus(o.status);
            const open = openOrder === o.id;
            const dl = deliveryStatusLabel(o);
            const em = accessEmailLabel(o.access_email_status);
            const card = o.payment_method === 'CREDIT_CARD';
            return (
              <div key={o.id} data-testid="overview-order">
                <Row
                  left={o.customer_name || 'Cliente sem nome'}
                  sub={`${when(o.created_at)} · ${methodLabel(o.payment_method)}`}
                  right={brl(Number(o.total_amount))}
                  subRight={<StatusPill tone={st.tone}>{st.label}</StatusPill>}
                  onClick={() => setOpenOrder(open ? null : o.id)}
                  ariaLabel={`${o.customer_name || 'Pedido'}, ${brl(Number(o.total_amount))}, ${st.label}. ${open ? 'Fechar' : 'Ver'} detalhes`}
                />
                {open && (
                  <dl className="px-4 pb-4 -mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-nq-caption">
                    <dt className="text-nq-muted">Pedido</dt>
                    <dd className="font-mono text-nq-text break-all">{o.id}</dd>
                    {o.customer_email && (<><dt className="text-nq-muted">E-mail</dt><dd className="text-nq-text break-all">{o.customer_email}</dd></>)}
                    <dt className="text-nq-muted">Pagamento</dt>
                    <dd className="text-nq-text">
                      {paymentLabel(o.payment_status)}
                      {card && o.payment_amount !== null && o.payment_amount !== undefined && Math.abs(Number(o.payment_amount) - Number(o.total_amount)) > 0.001
                        ? ` · cobrado ${brl(Number(o.payment_amount))} no cartão`
                        : ''}
                    </dd>
                    <dt className="text-nq-muted">Entrega</dt>
                    <dd><StatusPill tone={DL_TONE[dl.tone]}>{sentence(dl.text)}</StatusPill></dd>
                    {em && (<><dt className="text-nq-muted">Acesso</dt><dd><StatusPill tone={DL_TONE[em.tone]}>{sentence(em.text)}</StatusPill></dd></>)}
                  </dl>
                )}
              </div>
            );
          })}
        </RowGroup>
      )}
    </Section>
  );

  return (
    <div data-testid="executive-overview" className="w-full max-w-6xl mx-auto pb-6 text-nq-text">
      {metaSync && (
        <p className="px-1 mb-4 text-nq-caption text-nq-subtle" data-testid="overview-freshness">
          Meta atualizada às {metaSync}
        </p>
      )}
      {/* Celular: uma coluna, na ordem de leitura (resultado → o que precisa de você → detalhes).
          Computador: duas colunas (números à esquerda, ações e listas à direita). */}
      <div className="flex flex-col gap-9 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-9 lg:grid-flow-row-dense lg:items-start">
        <div className="lg:col-start-1">{hero}</div>
        <div className="lg:col-start-2">{needsYou}</div>
        <div className="lg:col-start-1">{performance}</div>
        {guardSection && <div className="lg:col-start-2">{guardSection}</div>}
        <div className="lg:col-start-2">{campaignSection}</div>
        <div className="lg:col-start-1">{operation}</div>
        <div className="lg:col-start-2">{sales}</div>
      </div>
    </div>
  );
}
