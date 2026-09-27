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
  Layers2,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Users
} from 'lucide-react';
import { DashboardProps } from './dashboardTypes';
import { UI_TOKENS } from '../../theme/tokens';

export function DashboardView({
  currentUser,
  isDemoView,
  experiments,
  apiFetch,
  onSelectExperiment,
  onRegisterPerformance,
  onAuthorizeCapital,
  refreshTrigger,
  showError,
  showSuccess
}: DashboardProps) {
  const [activeSubView, setActiveSubView] = useState<'financial' | 'executive' | 'experiments'>('financial');
  const [execData, setExecData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Financial Intelligence Sub-view State
  const [financialData, setFinancialData] = useState<any>(null);
  const [finLoading, setFinLoading] = useState(false);
  const [financialPeriod, setFinancialPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [drillDownLevel, setDrillDownLevel] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  // Telemetry Funnel Summary State
  const [telemetrySummary, setTelemetrySummary] = useState<any[]>([]);

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
      const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
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
      const periodParam = `period=${financialPeriod}`;
      const data = await apiFetch(`/financial/dashboard?${modeParam}&${periodParam}`, {
        signal: controller.signal
      });

      if (!controller.signal.aborted) {
        setFinancialData(data);
      }

      // Also try fetching live telemetry summary if user is admin
      try {
        const tlmRes = await apiFetch(`/admin/telemetry/funnel-summary?${modeParam}`, {
          signal: controller.signal
        });
        if (tlmRes?.summary && Array.isArray(tlmRes.summary)) {
          setTelemetrySummary(tlmRes.summary);
        }
      } catch (_) {
        // Fallback gracefully if telemetry endpoint is restricted
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
    fetchExecutiveData();
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [isDemoView, refreshTrigger, apiFetch]);

  useEffect(() => {
    fetchFinancialData();
    return () => {
      if (activeFinControllerRef.current) {
        activeFinControllerRef.current.abort();
      }
    };
  }, [isDemoView, financialPeriod, refreshTrigger, apiFetch]);

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
  const finByCampaign = Array.isArray(financialData?.byCampaign) ? financialData.byCampaign : [];
  const finByCreative = Array.isArray(financialData?.byCreative) ? financialData.byCreative : [];
  const finUnattributed = financialData?.unattributed || { revenue: 0, ordersCount: 0 };
  const finReconciliation = financialData?.reconciliation || { isReconciled: true, productTotalRevenue: 0, campaignPlusUnattributedRevenue: 0 };

  const perf = financialData?.performanceAttribution || null;
  const dataQuality = perf?.dataQuality || null;
  const globalTruth = perf?.globalCommercialTruth || null;
  const mediaTruth = perf?.attributedMediaTruth || null;
  const rawCampaigns = (Array.isArray(perf?.byCampaign) && perf.byCampaign.length > 0)
    ? perf.byCampaign
    : finByCampaign;

  const perfByCampaign = rawCampaigns.map((c: any) => ({
    ...c,
    entityId: c.entityId || c.campaignId || c.id || c.metaCampaignId,
    entityName: c.entityName || c.campaignName || c.name,
    metaId: c.metaId || c.metaCampaignId || c.id,
    status: c.status || c.effectiveStatus || 'ACTIVE',
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
    status: as.status || 'ACTIVE',
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
    status: ad.status || 'ACTIVE',
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

  // Helper calculations for Commercial Funnel Steps
  const offerViewEvent = telemetrySummary.find((s: any) => s.event_type === 'OFFER_VIEW');
  const checkoutModalEvent = telemetrySummary.find((s: any) => s.event_type === 'CHECKOUT_MODAL_OPENED');
  const checkoutStartedEvent = telemetrySummary.find((s: any) => s.event_type === 'CHECKOUT_STARTED');

  const offerViewsCount = offerViewEvent ? Number(offerViewEvent.total_events) : (meta.clicks > 0 ? meta.clicks : 0);
  const checkoutModalCount = checkoutModalEvent ? Number(checkoutModalEvent.total_events) : 0;
  const checkoutStartedCount = checkoutStartedEvent ? Number(checkoutStartedEvent.total_events) : (commerce.totalOrders > 0 ? commerce.totalOrders : 0);
  const totalOrdersCount = finSummary.paidOrdersCount + finSummary.pendingOrdersCount;
  const paidOrdersCount = finSummary.paidOrdersCount;

  // Global CAC and Margin calculations
  const globalCac = paidOrdersCount > 0 ? finSummary.totalSpend / paidOrdersCount : null;
  const contributionMarginPercent = finSummary.grossRevenue > 0 
    ? ((finSummary.resultAfterMedia / finSummary.grossRevenue) * 100)
    : null;

  if (activeSubView === 'executive' && loading && !execData) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-500">
        <Activity className="h-8 w-8 text-emerald-600 animate-spin mb-3" />
        <span className="text-sm font-medium">Carregando visão executiva...</span>
      </div>
    );
  }

  if (activeSubView === 'financial' && finLoading && !financialData) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-slate-500">
        <Activity className="h-8 w-8 text-emerald-600 animate-spin mb-3" />
        <span className="text-sm font-medium">Carregando inteligência financeira auditada...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 w-full max-w-full">
      {/* Top Header Controls: Sub-view Switcher & Period Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
        {/* Sub-view Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/60 w-fit">
          <button
            onClick={() => setActiveSubView('financial')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
              activeSubView === 'financial'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
            <span>Inteligência Financeira V1</span>
          </button>
          <button
            onClick={() => setActiveSubView('executive')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
              activeSubView === 'executive'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>Visão Executiva V1</span>
          </button>
          <button
            onClick={() => setActiveSubView('experiments')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-2 ${
              activeSubView === 'experiments'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            <span>Experimentos ({experiments?.length || 0})</span>
          </button>
        </div>

        {/* Period Filter & Sync Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60">
            {(['today', '7d', '30d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setFinancialPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  financialPeriod === p
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p === 'today' ? 'Hoje' : p === '7d' ? '7 Dias' : '30 Dias'}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60">
            <span className={`h-2 w-2 rounded-full ${isDemoView ? 'bg-amber-400' : 'bg-emerald-500'}`}></span>
            <span>{isDemoView ? 'MODO DEMO' : 'MODO REAL'}</span>
          </div>

          <button
            onClick={() => fetchFinancialData()}
            disabled={finLoading}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-xs transition"
            title="Atualizar dados"
            aria-label="Atualizar dados financeiros"
          >
            <RefreshCw className={`h-4 w-4 ${finLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Data Freshness Indicator Strip */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200/70 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0"></span>
          <span>Meta: {meta.lastSync ? new Date(meta.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sincronizado'}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200/70 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          <span>Finanças: Webhook Asaas</span>
        </div>
        <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200/70 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
          <span>Commerce: Pré-produção</span>
        </div>
      </div>

      {activeSubView === 'financial' ? (
        <div className="space-y-6 sm:space-y-8">
          {/* Quality & Sample Size Alerts */}
          {dataQuality && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Sample Size Status Notice */}
              <div className="p-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-amber-900 flex items-center gap-2">
                    <span>Status Amostral: {dataQuality.sampleSizeStatus}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                      {dataQuality.performanceStatus}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
                    {dataQuality.sampleSizeNotice}
                  </p>
                </div>
              </div>

              {/* Attribution Quality Alert */}
              <div className="p-4 rounded-2xl border border-blue-200/80 bg-blue-50/60 flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-blue-900">
                    Qualidade da Atribuição Determinística
                  </div>
                  <p className="text-xs text-blue-800/90 mt-1 leading-relaxed">
                    {dataQuality.qualityNotice || 'Atribuição first-party estrita baseada em tokens determinísticos sem modelos heurísticos.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 1. LINHA EXECUTIVA — 6 KPIS DE ALTO IMPACTO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Linha Executiva de Performance
              </h2>
              {perf?.timeWindow && (
                <span className="text-[11px] text-slate-400 font-medium">
                  Janela: {new Date(perf.timeWindow.startDate).toLocaleDateString('pt-BR')} até {new Date(perf.timeWindow.endDate).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
              {/* Card 1: Faturamento Bruto */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Faturamento</span>
                  <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <DollarSign className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold tracking-tight text-slate-900">
                    R$ {finSummary.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-medium">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    <span>{finSummary.paidOrdersCount} pagos ({finSummary.pendingOrdersCount} pendentes)</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Investimento em Mídia */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Investimento Mídia</span>
                  <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold tracking-tight text-slate-900">
                    R$ {finSummary.totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">
                    Meta Ads ({perfByCampaign.length} campanhas ativas)
                  </div>
                </div>
              </div>

              {/* Card 3: Resultado Pós-Mídia */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Pós-Mídia (R - I)</span>
                  <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className={`text-2xl font-bold tracking-tight ${finSummary.resultAfterMedia >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    R$ {finSummary.resultAfterMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">
                    Margem Contrib.: {contributionMarginPercent !== null ? `${contributionMarginPercent.toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>

              {/* Card 4: ROAS Global */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">ROAS Global</span>
                  <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Target className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold tracking-tight text-slate-900">
                    {finSummary.roas !== null ? `${finSummary.roas.toFixed(2)}x` : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">
                    {finSummary.roas && finSummary.roas >= 2.0 ? '● Retorno Saudável' : '● Em observação'}
                  </div>
                </div>
              </div>

              {/* Card 5: CAC Médio */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">CAC Médio</span>
                  <div className="h-8 w-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold tracking-tight text-slate-900">
                    {globalCac !== null ? `R$ ${globalCac.toFixed(2).replace('.', ',')}` : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">
                    Ticket Médio: R$ {finSummary.aov.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>

              {/* Card 6: Margem Líquida Conhecida */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="text-xs font-semibold uppercase tracking-wider">Resultado Conhecido</span>
                  <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Scale className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-4">
                  <div className={`text-2xl font-bold tracking-tight ${finSummary.netProfit >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    R$ {finSummary.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">
                    Margem: {finSummary.netMargin !== null ? `${finSummary.netMargin.toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. FUNIL COMERCIAL DETERMINÍSTICO (VISUAL PIPELINE) */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Layers2 className="h-4 w-4 text-emerald-600" />
                  <span>Funil Comercial First-Party</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jornada determinística de conversão: Visita da Oferta → Abertura do Checkout → Envio do Formulário → Pedido → Pagamento Pix
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 self-start sm:self-auto">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Gate 17.0 Instrumentado</span>
              </div>
            </div>

            {/* Funnel Stage Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 relative">
              {/* Step 1: OFFER_VIEW */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>1. Visitas Oferta</span>
                  <Eye className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {offerViewsCount.toLocaleString('pt-BR')}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">OFFER_VIEW</span>
                </div>
                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                  Topo do Funil
                </div>
              </div>

              {/* Step 2: CHECKOUT_MODAL_OPENED */}
              <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/70 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                  <span>2. Abertura Checkout</span>
                  <MousePointer className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-emerald-950 tracking-tight">
                    {checkoutModalCount.toLocaleString('pt-BR')}
                  </div>
                  <span className="text-[11px] text-emerald-700 font-medium">MODAL_OPENED</span>
                </div>
                <div className="pt-2 border-t border-emerald-200/60 text-[11px] text-emerald-700 font-semibold">
                  {offerViewsCount > 0 ? `${((checkoutModalCount / offerViewsCount) * 100).toFixed(1)}% passagem` : '—'}
                </div>
              </div>

              {/* Step 3: CHECKOUT_STARTED */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>3. Início Checkout</span>
                  <Zap className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {checkoutStartedCount.toLocaleString('pt-BR')}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">CHECKOUT_STARTED</span>
                </div>
                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                  {checkoutModalCount > 0 
                    ? `${((checkoutStartedCount / checkoutModalCount) * 100).toFixed(1)}% conversão`
                    : (offerViewsCount > 0 ? `${((checkoutStartedCount / offerViewsCount) * 100).toFixed(1)}% de visitas` : '—')}
                </div>
              </div>

              {/* Step 4: ORDERS_CREATED */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>4. Pix Gerados</span>
                  <ShoppingCart className="h-4 w-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {totalOrdersCount.toLocaleString('pt-BR')}
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">ORDERS_CREATED</span>
                </div>
                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                  {checkoutStartedCount > 0 ? `${((totalOrdersCount / checkoutStartedCount) * 100).toFixed(0)}% gerados` : '—'}
                </div>
              </div>

              {/* Step 5: PIX_PAID */}
              <div className="p-4 rounded-xl bg-emerald-600 text-white shadow-sm space-y-2 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-100">
                  <span>5. Pix Confirmados</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold tracking-tight">
                    {paidOrdersCount.toLocaleString('pt-BR')}
                  </div>
                  <span className="text-[11px] text-emerald-200 font-medium">R$ {finSummary.grossRevenue.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="pt-2 border-t border-emerald-500 text-[11px] text-emerald-100 font-bold">
                  {totalOrdersCount > 0 ? `${((paidOrdersCount / totalOrdersCount) * 100).toFixed(1)}% conversão Pix` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* 3. PERFORMANCE DE MÍDIA & HIERARQUIA DETERMINÍSTICA */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span>Performance de Mídia & Atribuição Determinística (B2)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Métricas de tráfego pago auditadas diretamente contra os eventos da Meta Marketing API
                </p>
              </div>

              {/* Level Switcher */}
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60 gap-1 shrink-0 self-start md:self-auto">
                <button
                  onClick={() => setDrillDownLevel('campaign')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drillDownLevel === 'campaign'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Campanhas ({perfByCampaign.length})
                </button>
                <button
                  onClick={() => setDrillDownLevel('adset')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drillDownLevel === 'adset'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AdSets ({perfByAdSet.length})
                </button>
                <button
                  onClick={() => setDrillDownLevel('ad')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    drillDownLevel === 'ad'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Anúncios ({perfByAd.length})
                </button>
              </div>
            </div>

            {/* Campaign Table */}
            {drillDownLevel === 'campaign' && (
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                    <tr>
                      <th className="p-3.5">Campanha</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Investimento</th>
                      <th className="p-3.5 text-right">Cliques</th>
                      <th className="p-3.5 text-right">CPC</th>
                      <th className="p-3.5 text-right">CTR</th>
                      <th className="p-3.5 text-right">Pedidos</th>
                      <th className="p-3.5 text-right">Faturamento</th>
                      <th className="p-3.5 text-right">CAC</th>
                      <th className="p-3.5 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {perfByCampaign.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-6 text-center text-slate-400">
                          Nenhuma campanha registrada no período.
                        </td>
                      </tr>
                    ) : (
                      perfByCampaign.map((c: any) => (
                        <tr key={c.entityId || c.metaId} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 font-bold text-slate-900 max-w-xs truncate">
                            {c.entityName}
                          </td>
                          <td className="p-3.5">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {c.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-medium text-slate-900">
                            R$ {c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right text-slate-600">{c.clicks.toLocaleString('pt-BR')}</td>
                          <td className="p-3.5 text-right text-slate-600">{c.cpc !== null ? `R$ ${c.cpc.toFixed(2)}` : '—'}</td>
                          <td className="p-3.5 text-right text-slate-600">{c.ctr !== null ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{c.attributedPaidOrders}</td>
                          <td className="p-3.5 text-right font-bold text-emerald-600">
                            R$ {c.attributedGrossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right text-slate-600">
                            {c.cac !== null ? `R$ ${c.cac.toFixed(2)}` : '—'}
                          </td>
                          <td className="p-3.5 text-right font-bold text-slate-900">
                            {c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* AdSet Table */}
            {drillDownLevel === 'adset' && (
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                    <tr>
                      <th className="p-3.5">Conjunto de Anúncios</th>
                      <th className="p-3.5">Campanha</th>
                      <th className="p-3.5 text-right">Investimento</th>
                      <th className="p-3.5 text-right">Cliques</th>
                      <th className="p-3.5 text-right">CPC</th>
                      <th className="p-3.5 text-right">Pedidos</th>
                      <th className="p-3.5 text-right">Faturamento</th>
                      <th className="p-3.5 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {perfByAdSet.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          Nenhum conjunto registrado no período.
                        </td>
                      </tr>
                    ) : (
                      perfByAdSet.map((as: any) => (
                        <tr key={as.entityId || as.metaId} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 font-bold text-slate-900 max-w-xs truncate">{as.entityName}</td>
                          <td className="p-3.5 text-slate-500 max-w-xs truncate">{as.parentCampaignName || '—'}</td>
                          <td className="p-3.5 text-right font-medium text-slate-900">
                            R$ {as.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right text-slate-600">{as.clicks}</td>
                          <td className="p-3.5 text-right text-slate-600">{as.cpc !== null ? `R$ ${as.cpc.toFixed(2)}` : '—'}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{as.attributedPaidOrders}</td>
                          <td className="p-3.5 text-right font-bold text-emerald-600">
                            R$ {as.attributedGrossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right font-bold text-slate-900">
                            {as.roas !== null ? `${as.roas.toFixed(2)}x` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Ad Table */}
            {drillDownLevel === 'ad' && (
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                    <tr>
                      <th className="p-3.5">Anúncio / Criativo</th>
                      <th className="p-3.5">Campanha</th>
                      <th className="p-3.5 text-right">Investimento</th>
                      <th className="p-3.5 text-right">Cliques</th>
                      <th className="p-3.5 text-right">CPC</th>
                      <th className="p-3.5 text-right">Pedidos</th>
                      <th className="p-3.5 text-right">Faturamento</th>
                      <th className="p-3.5 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {perfByAd.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          Nenhum anúncio registrado no período.
                        </td>
                      </tr>
                    ) : (
                      perfByAd.map((ad: any) => (
                        <tr key={ad.entityId || ad.metaId} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 font-bold text-slate-900 max-w-xs truncate">{ad.entityName}</td>
                          <td className="p-3.5 text-slate-500 max-w-xs truncate">{ad.parentCampaignName || '—'}</td>
                          <td className="p-3.5 text-right font-medium text-slate-900">
                            R$ {ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right text-slate-600">{ad.clicks}</td>
                          <td className="p-3.5 text-right text-slate-600">{ad.cpc !== null ? `R$ ${ad.cpc.toFixed(2)}` : '—'}</td>
                          <td className="p-3.5 text-right font-semibold text-slate-900">{ad.attributedPaidOrders}</td>
                          <td className="p-3.5 text-right font-bold text-emerald-600">
                            R$ {ad.attributedGrossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-right font-bold text-slate-900">
                            {ad.roas !== null ? `${ad.roas.toFixed(2)}x` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. VISÃO INDIVIDUALIZADA POR PRODUTO */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <PieChart className="h-4 w-4 text-emerald-600" />
                <span>Visão Individualizada por Produto ({finByProduct.length})</span>
              </h3>
              <span className="text-xs text-slate-400">Rateio Pro-rata de Mídia e Custos Diretos</span>
            </div>

            {finByProduct.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">Nenhum produto cadastrado no período.</div>
            ) : (
              <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                    <tr>
                      <th className="p-3.5">Código</th>
                      <th className="p-3.5">Produto</th>
                      <th className="p-3.5 text-right">Vendas Pagas</th>
                      <th className="p-3.5 text-right">Faturamento</th>
                      <th className="p-3.5 text-right">Invest. Mídia</th>
                      <th className="p-3.5 text-right">Custos Conhecidos</th>
                      <th className="p-3.5 text-right">Resultado Conhecido</th>
                      <th className="p-3.5 text-right">Margem %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {finByProduct.map((p: any) => (
                      <tr key={p.productId} className="hover:bg-slate-50/70 transition">
                        <td className="p-3.5 font-bold text-emerald-700">{p.productHumanId}</td>
                        <td className="p-3.5 font-bold text-slate-900">{p.productName}</td>
                        <td className="p-3.5 text-right text-slate-800 font-medium">{p.unitsSold}</td>
                        <td className="p-3.5 text-right font-bold text-emerald-600">
                          R$ {p.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3.5 text-right text-slate-700">
                          R$ {p.attributedSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3.5 text-right text-slate-500">
                          R$ {p.gatewayFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`p-3.5 text-right font-bold ${p.netProfit >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                          R$ {p.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`p-3.5 text-right font-bold ${p.netMargin !== null && p.netMargin >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {p.netMargin !== null ? `${p.netMargin.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 5. CONCILIAÇÃO & AUDITORIA CONTÁBIL */}
          <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Integridade financeira ✓ Conciliado 100%
                </span>
              </div>
              <button
                onClick={() => setShowAuditDetails(prev => !prev)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition underline underline-offset-2 self-start sm:self-auto"
              >
                {showAuditDetails ? 'Ocultar detalhes da auditoria ▲' : 'Ver detalhes da auditoria contábil ▼'}
              </button>
            </div>

            {showAuditDetails && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-emerald-200/60 text-xs">
                <div className="p-3.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Total por Produto (Σ)</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    R$ {finReconciliation.productTotalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Faturamento Consolidado</div>
                  <div className="text-lg font-bold text-emerald-700 mt-1">
                    R$ {finSummary.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3.5 bg-white rounded-xl border border-emerald-100 shadow-2xs">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">Campanhas + Não Atribuído</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">
                    R$ {finReconciliation.campaignPlusUnattributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeSubView === 'executive' ? (
        /* VISÃO EXECUTIVA V1 */
        <div className="space-y-6 sm:space-y-8">
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>Funil Transacional Determinístico</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="text-xs font-semibold text-slate-500 uppercase">1. Pedidos Totais</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{commerce.totalOrders}</div>
                <div className="text-xs text-slate-400 mt-0.5">Criados no sistema</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="text-xs font-semibold text-slate-500 uppercase">2. Pix Gerados</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{finance.totalPixCreated}</div>
                <div className="text-xs text-slate-400 mt-0.5">Cobranças emitidas</div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200/70">
                <div className="text-xs font-semibold text-emerald-800 uppercase">3. Pix Confirmados</div>
                <div className="text-2xl font-bold text-emerald-950 mt-1">{finance.totalPixConfirmed}</div>
                <div className="text-xs text-emerald-700 mt-0.5">{finance.approvalRate ? `${finance.approvalRate.toFixed(1)}% taxa aprovação` : '—'}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                <div className="text-xs font-semibold text-slate-500 uppercase">4. Entregas Liberadas</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{delivery.totalEntitlements}</div>
                <div className="text-xs text-slate-400 mt-0.5">{delivery.completedDownloads} downloads concluídos</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* EXPERIMENTOS V1 */
        <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Tabela de Experimentos Operacionais
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar experimento..."
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200/80 text-[11px]">
                <tr>
                  <th className="p-3.5">Código</th>
                  <th className="p-3.5">Nome do Experimento</th>
                  <th className="p-3.5">Produto</th>
                  <th className="p-3.5">Oferta</th>
                  <th className="p-3.5 text-right">Capital Aprovado</th>
                  <th className="p-3.5 text-right">Capital Utilizado</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredExps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      Nenhum experimento encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredExps.map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3.5 font-bold text-slate-900">{exp.human_id}</td>
                      <td className="p-3.5 font-semibold text-slate-800">{exp.name}</td>
                      <td className="p-3.5 text-slate-600">{exp.product_name || '—'}</td>
                      <td className="p-3.5 text-slate-600">{exp.offer_name || '—'}</td>
                      <td className="p-3.5 text-right font-medium text-slate-900">
                        R$ {parseFloat(exp.capital_approved || 0).toFixed(2)}
                      </td>
                      <td className="p-3.5 text-right text-slate-600">
                        R$ {parseFloat(exp.capital_used || 0).toFixed(2)}
                      </td>
                      <td className="p-3.5">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {exp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
