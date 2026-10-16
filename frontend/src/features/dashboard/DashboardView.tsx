import { useGlobalPeriod, periodQuery, periodLabel } from '../../lib/globalPeriod';
import { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2, 
  Download, 
  Layers, 
  RefreshCw,
  Search,
  ShoppingCart,
  Zap,
  ArrowRight,
  ShieldCheck,
  Eye,
  MousePointer,
  PieChart,
  BarChart3,
  Scale,
  Percent,
  Receipt,
  HelpCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Layers2
} from 'lucide-react';
import { DashboardProps } from './dashboardTypes';
import { getMetaDeliveryStatus } from '../acquisition/MetaAdsView';
import { LaunchPlansCard } from '../acquisition/LaunchPlansCard';
import { ExperimentGuardCard } from '../acquisition/ExperimentGuardCard';
import { deliveryStatusLabel, accessEmailLabel } from '../../utils/deliveryStatusLabel';
import { ExecutiveOverview } from './ExecutiveOverview';
import { FinancialResults } from './FinancialResults';

// NORQVA-0023: cores do rótulo de entrega e do e-mail de acesso
const LABEL_TONE_CLASS: Record<string, string> = {
  ok: 'bg-emerald-955/40 text-emerald-400 border border-emerald-500/20',
  info: 'bg-blue-955/40 text-blue-400 border border-blue-500/20',
  warn: 'bg-amber-955/40 text-amber-400 border border-amber-500/20',
  muted: 'bg-slate-800 text-slate-400'
};

// NORQVA-0072: valores curtos para os cartões no celular (todos cabem numa linha sem deslizar).
// Em telas a partir de 1280px os valores aparecem completos.
function brlShort(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 999_500) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `R$ ${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`;
  if (abs >= 1_000) return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numShort(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 999_500) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString('pt-BR')} mil`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString('pt-BR');
}

// NORQVA-0082 (protótipo): a Visão Geral passou para ExecutiveOverview (mesmos dados, nova apresentação).
// O restante (aba Financeiro de Resultados e as sub-telas antigas) continua aqui sem mudança.
export function DashboardView(props: DashboardProps) {
  if (props.section === 'overview') return <ExecutiveOverview {...props} />;
  return <LegacyDashboardView {...props} />;
}

function LegacyDashboardView({
  currentUser,
  isDemoView,
  experiments,
  apiFetch,
  onSelectExperiment,
  onRegisterPerformance,
  onAuthorizeCapital,
  refreshTrigger,
  showError,
  showSuccess,
  onViewSales,
  section,
  metaCreditSlot
}: DashboardProps) {
  const [activeSubView, setActiveSubView] = useState<'executive' | 'financial' | 'experiments'>(section === 'overview' ? 'executive' : 'financial');
  const [execData, setExecData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Financial Intelligence Sub-view State
  const [financialData, setFinancialData] = useState<any>(null);
  const [finLoading, setFinLoading] = useState(false);
  // NORQVA-0004: global period shared by every screen (executive + financial use the same one)
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);

  // Experiments sub-view filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('human_id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const activeControllerRef = useRef<AbortController | null>(null);
  const activeFinControllerRef = useRef<AbortController | null>(null);

  const fetchExecutiveData = async () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeControllerRef.current = controller;

    setLoading(true);
    try {
      const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}&${periodQs}`;
      const data = await apiFetch(`/executive/dashboard${modeParam}`, {
        signal: controller.signal
      });

      if (!controller.signal.aborted) {
        setExecData(data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('aborted'))) {
        return;
      }
      if (!controller.signal.aborted) {
        showError(err.message || 'Erro ao carregar métricas do dashboard executivo.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  };

  const fetchFinancialData = async () => {
    if (activeFinControllerRef.current) {
      activeFinControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeFinControllerRef.current = controller;

    setFinLoading(true);
    try {
      const modeParam = `mode=${isDemoView ? 'demo' : 'real'}`;
      const periodParam = periodQs;
      const data = await apiFetch(`/financial/dashboard?${modeParam}&${periodParam}`, {
        signal: controller.signal
      });

      if (!controller.signal.aborted) {
        setFinancialData(data);
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || (err.message && err.message.includes('aborted'))) {
        return;
      }
      if (!controller.signal.aborted) {
        showError(err.message || 'Erro ao carregar métricas de inteligência financeira.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setFinLoading(false);
      }
    }
  };

  useEffect(() => {
    if (section === 'financial') return;
    fetchExecutiveData();
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [isDemoView, periodQs, refreshTrigger, apiFetch]);

  useEffect(() => {
    if (section === 'overview') return;
    fetchFinancialData();
    return () => {
      if (activeFinControllerRef.current) {
        activeFinControllerRef.current.abort();
      }
    };
  }, [isDemoView, periodQs, refreshTrigger, apiFetch]);

  // Filter & sort experiments list (for experiments tab)
  const filteredExps = (experiments || [])
    .filter((e: any) => {
      const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.human_id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a: any, b: any) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortOrder === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const meta = execData?.meta || { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: null, cpc: null, cpm: null, frequency: null, campaigns: [] };
  const commerce = execData?.commerce || { totalOrders: 0, pendingOrders: 0, paidOrders: 0, cancelledOrders: 0, grossRevenue: 0, aov: 0 };
  const finance = execData?.finance || { totalPixCreated: 0, totalPixConfirmed: 0, approvalRate: null, confirmedRevenue: 0, reconciledTransactions: 0 };
  const delivery = execData?.delivery || { totalEntitlements: 0, totalDownloads: 0, completedDownloads: 0, pendingDownloads: 0 };
  const recentOrders = execData?.recentOrders || [];

  const finSummary = financialData?.summary || {
    totalSpend: 0,
    grossRevenue: 0,
    paidOrdersCount: 0,
    pendingOrdersCount: 0,
    gatewayFees: 0,
    otherCosts: 0,
    totalCosts: 0,
    isCostKnown: true,
    resultAfterMedia: 0,
    netProfit: 0,
    netMargin: null,
    aov: 0,
    roas: null
  };
  const finCostCoverage = financialData?.costCoverage || (finSummary.isCostKnown ? 'COMPLETE' : 'PARTIAL');
  const finByProduct = Array.isArray(financialData?.byProduct) ? financialData.byProduct : [];
  // NORQVA-0008/0086: a divisão direta x rateio aparece em FinancialResults (SpendSplit)
  const finByCampaign = Array.isArray(financialData?.byCampaign) ? financialData.byCampaign : [];
  const finByCreative = Array.isArray(financialData?.byCreative) ? financialData.byCreative : [];
  const finUnattributed = financialData?.unattributed || { revenue: 0, ordersCount: 0 };
  const finReconciliation = financialData?.reconciliation || { isReconciled: true, productTotalRevenue: 0, campaignPlusUnattributedRevenue: 0 };

  const perf = financialData?.performanceAttribution || null;
  const dataQuality = perf?.dataQuality || null;
  const globalTruth = perf?.globalCommercialTruth || null;
  const mediaTruth = perf?.attributedMediaTruth || null;
  // NORQVA-0031: os três cartões de receita vêm do resumo comercial da mídia (antes liam nomes que não existem)
  const rollup = mediaTruth?.commercialRollup || null;
  const money = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
  const revenueCards = rollup
    ? {
        attributedRevenue: money(rollup.attributedRevenue),
        attributedOrders: Number(rollup.attributedPaidOrders) || 0,
        organicRevenue: money(rollup.organicRevenue),
        organicOrders: Number(rollup.organicOrdersCount) || 0,
        ambiguousRevenue: money(rollup.ambiguousRevenue),
        ambiguousOrders: Number(rollup.ambiguousOrdersCount) || 0,
        otherRevenue: money(Number(rollup.unattributedRevenue || 0) + Number(rollup.ambiguousRevenue || 0)),
        otherOrders: (Number(rollup.unattributedOrdersCount) || 0) + (Number(rollup.ambiguousOrdersCount) || 0)
      }
    : null;
  const cardsTotal = revenueCards ? money(revenueCards.attributedRevenue + revenueCards.organicRevenue + revenueCards.otherRevenue) : 0;
  const paidRevenue = globalTruth ? money(globalTruth.grossRevenue) : null;
  const cardsMismatch = revenueCards !== null && paidRevenue !== null && Math.abs(cardsTotal - paidRevenue) > 0.01;
  const funnel = perf?.funnelIntegrity || null;
  const rawCampaigns = (Array.isArray(perf?.byCampaign) && perf.byCampaign.length > 0)
    ? perf.byCampaign
    : finByCampaign;

  const perfByCampaign = rawCampaigns.map((c: any) => ({
    ...c,
    entityId: c.entityId || c.campaignId || c.id || c.metaCampaignId,
    entityName: c.entityName || c.campaignName || c.name,
    metaId: c.metaId || c.metaCampaignId || c.id,
    status: c.status || c.effectiveStatus || null,
    spend: c.spend ?? 0,
    clicks: c.clicks ?? 0,
    impressions: c.impressions ?? 0,
    ctr: c.ctr ?? null,
    cpc: c.cpc ?? null,
    attributedPaidOrders: c.attributedPaidOrders ?? c.attributedOrders ?? 0,
    attributedGrossRevenue: c.attributedGrossRevenue ?? c.attributedRevenue ?? 0,
    resultAfterMedia: c.resultAfterMedia ?? c.contributionAfterMedia ?? ((c.attributedRevenue || c.attributedGrossRevenue || 0) - (c.spend || 0)),
    cac: c.cac ?? null,
    roas: c.roas ?? null,
    performanceStatus: c.performanceStatus || c.sampleStatus || 'OBSERVING'
  }));

  const rawAdSets = Array.isArray(perf?.byAdSet) ? perf.byAdSet : [];
  const perfByAdSet = rawAdSets.map((as: any) => ({
    ...as,
    entityId: as.entityId || as.adsetId || as.id || as.metaAdsetId,
    entityName: as.entityName || as.adsetName || as.name,
    parentCampaignName: as.parentCampaignName || as.campaignName,
    metaId: as.metaId || as.metaAdsetId || as.adsetId || as.id,
    status: as.status || as.effectiveStatus || null,
    spend: as.spend ?? 0,
    clicks: as.clicks ?? 0,
    impressions: as.impressions ?? 0,
    ctr: as.ctr ?? null,
    cpc: as.cpc ?? null,
    attributedPaidOrders: as.attributedPaidOrders ?? as.attributedOrders ?? 0,
    attributedGrossRevenue: as.attributedGrossRevenue ?? as.attributedRevenue ?? 0,
    resultAfterMedia: as.resultAfterMedia ?? as.contributionAfterMedia ?? ((as.attributedRevenue || as.attributedGrossRevenue || 0) - (as.spend || 0)),
    cac: as.cac ?? null,
    roas: as.roas ?? null,
    performanceStatus: as.performanceStatus || as.sampleStatus || 'OBSERVING'
  }));

  const rawAds = (Array.isArray(perf?.byAd) && perf.byAd.length > 0)
    ? perf.byAd
    : finByCreative;

  const perfByAd = rawAds.map((ad: any) => ({
    ...ad,
    entityId: ad.entityId || ad.adId || ad.id || ad.metaAdId,
    entityName: ad.entityName || ad.adName || ad.name,
    parentCampaignName: ad.parentCampaignName || ad.campaignName,
    metaId: ad.metaId || ad.metaAdId || ad.adId || ad.id,
    status: ad.status || ad.effectiveStatus || null,
    spend: ad.spend ?? 0,
    clicks: ad.clicks ?? 0,
    impressions: ad.impressions ?? 0,
    ctr: ad.ctr ?? null,
    cpc: ad.cpc ?? null,
    attributedPaidOrders: ad.attributedPaidOrders ?? ad.attributedOrders ?? 0,
    attributedGrossRevenue: ad.attributedGrossRevenue ?? ad.attributedRevenue ?? 0,
    resultAfterMedia: ad.resultAfterMedia ?? ad.contributionAfterMedia ?? ((ad.attributedRevenue || ad.attributedGrossRevenue || 0) - (ad.spend || 0)),
    cac: ad.cac ?? null,
    roas: ad.roas ?? null,
    performanceStatus: ad.performanceStatus || ad.sampleStatus || 'OBSERVING'
  }));

  if (activeSubView === 'executive' && loading && !execData) {
    return (
      <div className="space-y-4">
        <div className="h-72 flex flex-col items-center justify-center text-slate-400">
          <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
          Carregando dados executivos reais...
        </div>
        {metaCreditSlot}
      </div>
    );
  }

  if (activeSubView === 'financial' && finLoading && !financialData) {
    return (
      <div className="h-72 flex flex-col items-center justify-center text-slate-400">
        <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
        Carregando inteligência financeira auditada...
      </div>
    );
  }

  // NORQVA-0071: na Visão Geral, os resultados vêm primeiro; o quadro "Hoje" (avisos e situação
  // das integrações) desce para depois do tráfego Meta Ads.
  const resultsFirst = section === 'overview' && activeSubView === 'executive';
  const topControls = (
    <>
      {/* Top Controls: View Switcher & Data Freshness */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 sm:p-4 border border-slate-800 rounded-xl bg-slate-900/60 shadow-sm">
        {/* Sub-view Switcher Tabs (NORQVA-0030: some quando a tela já escolheu a seção) */}
        {section ? (
          <h2 className="text-sm font-bold text-slate-200" data-testid="dashboard-section-title">
            {section === 'overview' ? 'Hoje: o que precisa de você e como estão as vendas' : 'Financeiro do período'}
          </h2>
        ) : (
        <div className="grid grid-cols-1 sm:flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setActiveSubView('financial')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-2 ${
              activeSubView === 'financial'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" /> Inteligência Financeira V1
          </button>
          <button
            onClick={() => setActiveSubView('executive')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-2 ${
              activeSubView === 'executive'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Visão Executiva V1
          </button>
          <button
            onClick={() => setActiveSubView('experiments')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center gap-2 ${
              activeSubView === 'experiments'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-950/80 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Experimentos ({experiments?.length || 0})
          </button>
        </div>
        )}

        {/* Data Freshness Badges */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0"></span>
            <span className="truncate">Meta: {meta.lastSync ? new Date(meta.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sincronizado'}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"></span>
            <span>Finanças: Webhook Asaas</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/90 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"></span>
            <span>Commerce: Pré-produção</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-5 sm:space-y-6 text-sm w-full max-w-full">
      {!resultsFirst && section !== 'financial' && topControls}

      {activeSubView === 'financial' ? (
        <FinancialResults
          finLoading={finLoading}
          hasData={!!financialData}
          periodText={periodLabel(globalPeriod)}
          timeWindow={perf?.timeWindow || null}
          dataQuality={dataQuality}
          summary={finSummary}
          costCoverage={finCostCoverage}
          byProduct={finByProduct}
          reconciliation={finReconciliation}
          byCampaign={perfByCampaign}
          byAdSet={perfByAdSet}
          byAd={perfByAd}
          revenueCards={revenueCards}
          cardsMismatch={cardsMismatch}
          cardsTotal={cardsTotal}
          paidRevenue={paidRevenue}
          onRefresh={() => fetchFinancialData()}
        />
      ) : activeSubView === 'executive' ? (
        <div className="space-y-5 sm:space-y-6">
          {/* NORQVA-0071: ordem da Visão Geral = 1) resultados, 2) funil, 3) tráfego Meta Ads, todos na horizontal.
              NORQVA-0072: cada faixa numa linha só, sem deslizar; abaixo de 1280px valores e rótulos curtos. */}

          {/* 1. Resultados do período (NORQVA-0072: tudo numa linha, sem deslizar; até telas largas, rótulos e valores curtos) */}
          <section aria-labelledby="overview-results-title" data-testid="overview-results" className="space-y-1.5 xl:space-y-2">
            <h3 id="overview-results-title" className="font-bold text-[10px] xl:text-xs uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-emerald-400" /> Resultados · {periodLabel(globalPeriod)}
            </h3>
            <div className="grid grid-cols-4 gap-1.5 xl:gap-3">
              <div className="min-w-0 p-2 xl:p-4 border border-slate-800 bg-slate-900/50 rounded-lg">
                <div className="flex justify-between items-center gap-1 text-[9px] xl:text-xs font-mono uppercase text-slate-400">
                  <span className="truncate"><span className="xl:hidden">Invest.</span><span className="hidden xl:inline">Investimento de Mídia</span></span>
                  <TrendingUp className="h-3 w-3 xl:h-4 xl:w-4 text-blue-400 shrink-0 hidden min-[400px]:block xl:block" />
                </div>
                <div className="mt-1 xl:mt-2.5 text-[12px] min-[400px]:text-[13px] lg:text-lg xl:text-2xl font-bold font-sans xl:font-mono tabular-nums tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-slate-100">
                  <span className="hidden xl:inline">R$ {(meta.spend).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span className="xl:hidden">{brlShort(meta.spend)}</span>
                </div>
                <div className="text-[9px] xl:text-[10px] text-slate-400 mt-0.5 xl:mt-1 font-mono truncate">
                  <span className="xl:hidden">{meta.clicks.toLocaleString('pt-BR')} cliques</span><span className="hidden xl:inline">{meta.impressions.toLocaleString('pt-BR')} imp. | {meta.clicks.toLocaleString('pt-BR')} cliques</span>
                </div>
              </div>
              <div className="min-w-0 p-2 xl:p-4 border border-slate-800 bg-slate-900/50 rounded-lg">
                <div className="flex justify-between items-center gap-1 text-[9px] xl:text-xs font-mono uppercase text-slate-400">
                  <span className="truncate"><span className="xl:hidden">Fatur.</span><span className="hidden xl:inline">Faturamento Confirmado</span></span>
                  <DollarSign className="h-3 w-3 xl:h-4 xl:w-4 text-emerald-400 shrink-0 hidden min-[400px]:block xl:block" />
                </div>
                <div className="mt-1 xl:mt-2.5 text-[12px] min-[400px]:text-[13px] lg:text-lg xl:text-2xl font-bold font-sans xl:font-mono tabular-nums tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-emerald-400">
                  <span className="hidden xl:inline">R$ {(finance.confirmedRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span><span className="xl:hidden">{brlShort(finance.confirmedRevenue)}</span>
                </div>
                <div className="text-[9px] xl:text-[10px] text-slate-400 mt-0.5 xl:mt-1 font-mono truncate">
                  <span className="xl:hidden">TM {brlShort(commerce.aov)}</span><span className="hidden xl:inline">Ticket Médio: R$ {commerce.aov.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div className="min-w-0 p-2 xl:p-4 border border-slate-800 bg-slate-900/50 rounded-lg">
                <div className="flex justify-between items-center gap-1 text-[9px] xl:text-xs font-mono uppercase text-slate-400">
                  <span className="truncate"><span className="xl:hidden">Pedidos</span><span className="hidden xl:inline">Pedidos Pagos / Criados</span></span>
                  <ShoppingCart className="h-3 w-3 xl:h-4 xl:w-4 text-amber-400 shrink-0 hidden min-[400px]:block xl:block" />
                </div>
                <div className="mt-1 xl:mt-2.5 text-[12px] min-[400px]:text-[13px] lg:text-lg xl:text-2xl font-bold font-sans xl:font-mono tabular-nums tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-slate-100">
                  {commerce.paidOrders} / {commerce.totalOrders}
                </div>
                <div className="text-[9px] xl:text-[10px] text-slate-400 mt-0.5 xl:mt-1 font-mono truncate">
                  <span className="xl:hidden">{commerce.pendingOrders} pend.</span><span className="hidden xl:inline">{commerce.pendingOrders} pendentes | {commerce.cancelledOrders} cancelados</span>
                </div>
              </div>
              <div className="min-w-0 p-2 xl:p-4 border border-slate-800 bg-slate-900/50 rounded-lg">
                <div className="flex justify-between items-center gap-1 text-[9px] xl:text-xs font-mono uppercase text-slate-400">
                  <span className="truncate"><span className="xl:hidden">Entregas</span><span className="hidden xl:inline">Entregas & Downloads</span></span>
                  <Download className="h-3 w-3 xl:h-4 xl:w-4 text-emerald-400 shrink-0 hidden min-[400px]:block xl:block" />
                </div>
                <div className="mt-1 xl:mt-2.5 text-[12px] min-[400px]:text-[13px] lg:text-lg xl:text-2xl font-bold font-sans xl:font-mono tabular-nums tracking-tight whitespace-nowrap overflow-hidden text-ellipsis text-slate-100">
                  {delivery.totalEntitlements}<span className="hidden xl:inline"> disp.</span>
                </div>
                <div className="text-[9px] xl:text-[10px] text-slate-400 mt-0.5 xl:mt-1 font-mono truncate">
                  <span className="xl:hidden">{delivery.completedDownloads} baixados</span><span className="hidden xl:inline">{delivery.completedDownloads} baixados | {delivery.pendingDownloads} aguardando</span>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Funil transacional, da esquerda para a direita */}
          <section data-testid="overview-funnel" className="p-2.5 xl:p-5 border border-slate-800 bg-slate-900/40 rounded-lg space-y-2 xl:space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <h3 className="font-bold text-[10px] xl:text-xs uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-emerald-400" /> <span className="xl:hidden">Funil</span><span className="hidden xl:inline">Funil Transacional Determinístico (100% Real)</span>
              </h3>
              <span className="hidden xl:inline text-[10px] font-mono text-slate-500">Relações comprovadas por chaves estrangeiras</span>
            </div>
            <div className="grid grid-cols-5 gap-1 xl:gap-3">
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Pedidos</span><span className="hidden xl:inline">1. Pedidos Criados</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{commerce.totalOrders}</div>
                <div className="text-[8px] xl:text-[9px] text-slate-500 font-mono mt-0.5 truncate"><span className="xl:hidden">criados</span><span className="hidden xl:inline">Checkout iniciado</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Pix</span><span className="hidden xl:inline">2. Pix Gerados</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{finance.totalPixCreated}</div>
                <div className="text-[8px] xl:text-[9px] text-slate-500 font-mono mt-0.5 truncate"><span className="xl:hidden">gerados</span><span className="hidden xl:inline">Payload Asaas emitido</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Pagos</span><span className="hidden xl:inline">3. Pagamentos Confirmados</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-emerald-400 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{finance.totalPixConfirmed}</div>
                <div className="text-[8px] xl:text-[9px] text-slate-500 font-mono mt-0.5 truncate"><span className="xl:hidden">{finance.approvalRate !== null ? `${finance.approvalRate}%` : '—'}</span><span className="hidden xl:inline">{finance.approvalRate !== null ? `Taxa: ${finance.approvalRate}%` : 'Taxa: — (Aguardando dados)'}</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Entreg.</span><span className="hidden xl:inline">4. Entregas Disponibilizadas</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{delivery.totalEntitlements}</div>
                <div className="text-[8px] xl:text-[9px] text-slate-500 font-mono mt-0.5 truncate"><span className="xl:hidden">liberadas</span><span className="hidden xl:inline">Tokens ativos gerados</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Downl.</span><span className="hidden xl:inline">5. Downloads Concluídos</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-emerald-400 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{delivery.completedDownloads}</div>
                <div className="text-[8px] xl:text-[9px] text-slate-500 font-mono mt-0.5 truncate"><span className="xl:hidden">{delivery.totalDownloads} total</span><span className="hidden xl:inline">{delivery.totalDownloads} downloads totais</span></div>
              </div>
            </div>
          </section>

          {/* 3. Tráfego Meta Ads */}
          <section data-testid="overview-meta-traffic" className="p-2.5 xl:p-5 border border-slate-800 bg-slate-900/40 rounded-lg space-y-2 xl:space-y-3">
            <h3 className="font-bold text-[10px] xl:text-xs uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 xl:h-4 xl:w-4 text-blue-400" /> Tráfego Meta Ads
            </h3>
            <div className="grid grid-cols-6 gap-1 xl:gap-3">
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Impr.</span><span className="hidden xl:inline">Impressões</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis"><span className="hidden xl:inline">{meta.impressions.toLocaleString('pt-BR')}</span><span className="xl:hidden">{numShort(meta.impressions)}</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Alcance</span><span className="hidden xl:inline">Alcance Único</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis"><span className="hidden xl:inline">{meta.reach.toLocaleString('pt-BR')}</span><span className="xl:hidden">{numShort(meta.reach)}</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">Cliques</span><span className="hidden xl:inline">Cliques no Link</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis"><span className="hidden xl:inline">{meta.clicks.toLocaleString('pt-BR')}</span><span className="xl:hidden">{numShort(meta.clicks)}</span></div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">CTR</span><span className="hidden xl:inline">CTR</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{meta.ctr !== null ? <><span className="hidden xl:inline">{`${meta.ctr}%`}</span><span className="xl:hidden">{`${meta.ctr >= 10 ? Number(meta.ctr).toFixed(1).replace('.', ',') : meta.ctr}%`}</span></> : '—'}</div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">CPC</span><span className="hidden xl:inline">CPC Médio</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{meta.cpc !== null ? <><span className="hidden xl:inline">R$ </span>{meta.cpc.toFixed(2).replace('.', ',')}</> : '—'}</div>
              </div>
              <div className="min-w-0 px-1 py-2 xl:p-3 bg-slate-950 border border-slate-800 rounded text-center xl:text-left">
                <div className="text-[8.5px] xl:text-[10px] font-mono text-slate-400 uppercase truncate"><span className="xl:hidden">CPM</span><span className="hidden xl:inline">CPM Médio</span></div>
                <div className="text-[11px] min-[400px]:text-[12px] lg:text-base xl:text-xl font-bold font-sans xl:font-mono tabular-nums text-slate-200 mt-0.5 xl:mt-1 whitespace-nowrap overflow-hidden text-ellipsis">{meta.cpm !== null ? <><span className="hidden xl:inline">R$ </span>{meta.cpm.toFixed(2).replace('.', ',')}</> : '—'}</div>
              </div>
            </div>
            {(meta.ctr === null || meta.cpc === null || meta.cpm === null) && (
              <p className="text-[10px] font-mono text-slate-500">— = aguardando dados da Meta.</p>
            )}
          </section>

          {/* Depois dos três blocos: crédito Meta, situação do dia e o que precisa de você */}
          {metaCreditSlot}
          {resultsFirst && topControls}

          {/* NORQVA-0019: campanhas criadas pausadas aguardando o SIM/NÃO do operador */}
          <LaunchPlansCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />
          <ExperimentGuardCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />

          {/* Meta Campaigns Status Table */}
          <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 font-mono">
              Campanhas em Operação ({meta.campaigns.length})
            </h3>
            {meta.campaigns.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Nenhuma campanha sincronizada da Meta.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-850 rounded">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Campanha</th>
                      <th className="p-2.5">Meta ID</th>
                      <th className="p-2.5">Status Efetivo</th>
                      <th className="p-2.5">Última Sincronização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {meta.campaigns.map((c: any) => {
                      const deliveryStatus = getMetaDeliveryStatus(c.effective_status, c.status);
                      return (
                        <tr key={c.id} className="hover:bg-slate-800/30 transition">
                          <td className="p-2.5 font-bold text-slate-200">{c.name}</td>
                          <td className="p-2.5 font-mono text-slate-400 text-[11px]">{c.meta_campaign_id}</td>
                          <td className="p-2.5">
                            <div className="flex flex-col gap-0.5 items-start">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${deliveryStatus.badgeClass}`}>
                                {deliveryStatus.label}
                              </span>
                              {c.status && c.effective_status && c.status !== c.effective_status && (
                                <span className="text-[9px] font-mono text-slate-500">
                                  Admin: {c.status}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 text-[10px]">
                            {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString('pt-BR') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Recent Real Orders Activity */}
          <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 font-mono">
                Últimas Transações Registradas ({recentOrders.length})
              </h3>
              {onViewSales && (
                <button type="button" onClick={onViewSales} data-testid="view-all-sales" className="text-[11px] text-emerald-400 hover:text-emerald-300 underline">
                  Ver todas as vendas
                </button>
              )}
            </div>
            {recentOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs">
                Nenhum pedido registrado no período selecionado. (Aguardando primeiras conversões da campanha).
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-850 rounded">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">Pedido</th>
                      <th className="p-2.5">Cliente</th>
                      <th className="p-2.5">Valor</th>
                      <th className="p-2.5">Status do Pedido</th>
                      <th className="p-2.5">Pagamento</th>
                      <th className="p-2.5">Entrega Digital</th>
                      <th className="p-2.5">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {recentOrders.map((ord: any) => (
                      <tr key={ord.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-2.5 font-mono text-emerald-400 font-bold">{ord.id.substring(0, 8)}...</td>
                        <td className="p-2.5 text-slate-200">
                          <div>{ord.customer_name || 'Anônimo'}</div>
                          <div className="text-[10px] font-mono text-slate-500">{ord.customer_email || '—'}</div>
                        </td>
                        <td className="p-2.5 font-mono text-slate-100 font-bold">
                          R$ {parseFloat(ord.total_amount).toFixed(2)}
                          {ord.payment_method === 'CREDIT_CARD' && ord.payment_amount !== null && ord.payment_amount !== undefined && Math.abs(Number(ord.payment_amount) - Number(ord.total_amount)) > 0.001 && (
                            <div className="text-[10px] font-normal text-slate-400">cartão: R$ {Number(ord.payment_amount).toFixed(2)}</div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ord.status === 'PAID' ? 'bg-emerald-955/40 text-emerald-400 border border-emerald-500/20' :
                            ord.status === 'PENDING' ? 'bg-amber-955/40 text-amber-400 border border-amber-500/20' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {ord.status}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ord.payment_status === 'CONFIRMED' ? 'bg-emerald-955/40 text-emerald-400 border border-emerald-500/20' :
                            ord.payment_status === 'PENDING' ? 'bg-amber-955/40 text-amber-400 border border-amber-500/20' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {ord.payment_status || 'NÃO INICIADO'}
                          </span>
                          {ord.payment_method && (
                            <div className="mt-1 text-[10px] font-mono text-slate-500">{ord.payment_method === 'CREDIT_CARD' ? 'Cartão' : 'Pix'}</div>
                          )}
                        </td>
                        <td className="p-2.5">
                          {(() => {
                            const dl = deliveryStatusLabel(ord);
                            const em = accessEmailLabel(ord.access_email_status);
                            return (
                              <div className="flex flex-col items-start gap-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${LABEL_TONE_CLASS[dl.tone]}`}>
                                  {dl.text}
                                </span>
                                {em && (
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${LABEL_TONE_CLASS[em.tone]}`}>
                                    {em.text}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="p-2.5 font-mono text-slate-500 text-[10px]">
                          {new Date(ord.created_at).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Subview: Experiments & Capital */
        <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">Tabela de Experimentos Operacionais</h3>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
              >
                <option value="ALL">TODOS OS STATUS</option>
                <option value="PLANEJADO">PLANEJADO</option>
                <option value="AUTORIZADO">AUTORIZADO</option>
                <option value="ATIVO">ATIVO</option>
                <option value="PAUSADO">PAUSADO</option>
                <option value="CONCLUIDO">CONCLUÍDO</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-850 rounded">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                  <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => toggleSort('human_id')}>ID</th>
                  <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => toggleSort('name')}>Experimento</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => toggleSort('capital_used')}>Investimento</th>
                  <th className="p-3">Capital Restante</th>
                  <th className="p-3 cursor-pointer hover:text-slate-200" onClick={() => toggleSort('status')}>Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 bg-slate-955/20 text-xs">
                {filteredExps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-mono">
                      Nenhum experimento encontrado para os critérios de busca.
                    </td>
                  </tr>
                ) : (
                  filteredExps.map((exp: any) => {
                    const remaining = parseFloat((parseFloat(exp.capital_approved) - parseFloat(exp.capital_used)).toFixed(2));
                    return (
                      <tr key={exp.id} className="hover:bg-slate-900/30 transition">
                        <td className="p-3 font-mono text-emerald-400 font-bold">{exp.human_id}</td>
                        <td className="p-3 font-semibold text-slate-200">{exp.name}</td>
                        <td className="p-3 text-slate-400 truncate max-w-[150px]">{exp.product_name}</td>
                        <td className="p-3 font-mono">R${parseFloat(exp.capital_used).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className={`p-3 font-mono ${remaining <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          R${remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R${parseFloat(exp.capital_approved).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            exp.status === 'ATIVO' ? 'bg-emerald-955/40 text-emerald-400 border border-emerald-500/20' :
                            exp.status === 'PLANEJADO' ? 'bg-slate-800 text-slate-400' : 'bg-amber-955/20 text-amber-400'
                          }`}>
                            {exp.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <button
                            onClick={() => onSelectExperiment(exp)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium"
                          >
                            Detalhes
                          </button>
                          <button
                            onClick={() => onRegisterPerformance(exp.id)}
                            className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 font-medium"
                          >
                            Performance
                          </button>
                          <button
                            onClick={() => onAuthorizeCapital(exp)}
                            className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-medium"
                          >
                            Orçamento
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
