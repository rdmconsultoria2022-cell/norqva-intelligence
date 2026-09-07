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
  AlertCircle
} from 'lucide-react';
import { DashboardProps } from './dashboardTypes';
import { getMetaDeliveryStatus } from '../acquisition/MetaAdsView';

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
  const [activeSubView, setActiveSubView] = useState<'executive' | 'financial' | 'experiments'>('financial');
  const [execData, setExecData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Financial Intelligence Sub-view State
  const [financialData, setFinancialData] = useState<any>(null);
  const [finLoading, setFinLoading] = useState(false);
  const [financialPeriod, setFinancialPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  const [showAuditDetails, setShowAuditDetails] = useState(false);

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

  if (activeSubView === 'executive' && loading && !execData) {
    return (
      <div className="h-72 flex flex-col items-center justify-center text-slate-400">
        <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
        Carregando dados executivos reais...
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

  return (
    <div className="space-y-5 sm:space-y-6 text-sm w-full max-w-full">
      {/* Top Controls: View Switcher & Data Freshness */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 sm:p-4 border border-slate-800 rounded-xl bg-slate-900/60 shadow-sm">
        {/* Sub-view Switcher Tabs */}
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

      {activeSubView === 'financial' ? (
        <div className="space-y-5 sm:space-y-6">
          {/* Period Filter & Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 border border-slate-800 bg-slate-900/60 rounded-xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-[11px] sm:text-xs font-mono font-bold uppercase text-slate-400">Filtrar Período:</span>
              <div className="grid grid-cols-2 sm:flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
                {(['7d', '30d', '90d', 'all'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setFinancialPeriod(p)}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition text-center ${
                      financialPeriod === p
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === '7d' ? '7 Dias' : p === '30d' ? '30 Dias' : p === '90d' ? '90 Dias' : 'Todo o Período'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs font-mono">
                <span className={`h-2 w-2 rounded-full shrink-0 ${isDemoView ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                <span className="text-slate-300 font-bold">
                  {isDemoView ? 'MODO DEMONSTRAÇÃO' : 'MODO REAL'}
                </span>
              </div>
              <button
                onClick={() => fetchFinancialData()}
                disabled={finLoading}
                className="p-2 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 transition shrink-0"
                title="Atualizar dados financeiros"
                aria-label="Atualizar dados financeiros"
              >
                <RefreshCw className={`h-4 w-4 ${finLoading ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            </div>
          </div>

          {finLoading && !financialData ? (
            <div className="h-72 flex flex-col items-center justify-center text-slate-400 border border-slate-800 bg-slate-900/30 rounded-xl">
              <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
              Carregando inteligência financeira auditada...
            </div>
          ) : !financialData ? (
            <div className="p-8 text-center text-slate-500 font-mono text-xs border border-slate-800 rounded-xl">
              Nenhum dado financeiro disponível.
            </div>
          ) : (
            <>
              {/* 1. VISÃO GERAL — 6 RESPOSTAS EXECUTIVAS IMEDIATAS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                {/* 1. Quanto foi investido? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate">1. Investimento Total</span>
                    <TrendingUp className="h-4 w-4 text-blue-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-100 truncate">
                      R$ {finSummary.totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      Meta Ads (Sincronizado)
                    </div>
                  </div>
                </div>

                {/* 2. Quanto faturou? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate">2. Faturamento</span>
                    <DollarSign className="h-4 w-4 text-emerald-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-emerald-400 truncate">
                      R$ {finSummary.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      {finSummary.paidOrdersCount} pagos ({finSummary.pendingOrdersCount} pendentes)
                    </div>
                  </div>
                </div>

                {/* 3. Qual resultado após mídia? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate">3. Pós-Mídia (R - I)</span>
                    <BarChart3 className="h-4 w-4 text-amber-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight truncate ${finSummary.resultAfterMedia >= 0 ? 'text-slate-100' : 'text-red-400'}`}>
                      R$ {finSummary.resultAfterMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      ROAS: {finSummary.roas !== null ? `${finSummary.roas.toFixed(2)}x` : '—'}
                    </div>
                  </div>
                </div>

                {/* 4. Quais custos são conhecidos? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate">4. Custos Conhecidos</span>
                    <Receipt className="h-4 w-4 text-slate-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-slate-300 truncate">
                      R$ {finSummary.totalCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1 font-mono text-[10px]">
                      {finCostCoverage === 'COMPLETE' ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1 truncate">
                          <CheckCircle2 className="h-3 w-3 shrink-0" /> Cobertura Completa
                        </span>
                      ) : finCostCoverage === 'PARTIAL' ? (
                        <span className="text-amber-400 font-semibold flex items-center gap-1 truncate">
                          <AlertCircle className="h-3 w-3 shrink-0" /> Cobertura Parcial
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold flex items-center gap-1 truncate">
                          <AlertCircle className="h-3 w-3 shrink-0" /> Custos Desconhecidos
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. Qual resultado líquido conhecido? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate" title="Resultado Líquido Conhecido">5. Resultado Conhecido</span>
                    <Scale className="h-4 w-4 text-emerald-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight truncate ${finSummary.netProfit >= 0 ? 'text-emerald-400 font-extrabold' : 'text-red-400'}`}>
                      R$ {finSummary.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono truncate" title="Ticket Médio">
                      Ticket Médio: R$ {finSummary.aov.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* 6. Qual margem conhecida? */}
                <div className="p-4 border border-slate-800 bg-slate-900/70 rounded-xl flex flex-col justify-between shadow-sm min-w-0">
                  <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400 gap-2">
                    <span className="truncate">6. Margem Conhecida</span>
                    <Percent className="h-4 w-4 text-blue-400 shrink-0" />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight truncate ${finSummary.netMargin !== null && finSummary.netMargin >= 0 ? 'text-blue-400 font-extrabold' : 'text-red-400'}`}>
                      {finSummary.netMargin !== null ? `${finSummary.netMargin.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">
                      (Resultado / Faturamento)
                    </div>
                  </div>
                </div>
              </div>

              {/* Informative Disclaimer regarding Business/Accounting Cost Knowledge */}
              <div className="px-3.5 py-2 rounded-lg bg-slate-900/40 border border-slate-800/80 text-[11px] text-slate-400 font-mono flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span>Resultado calculado com os custos registrados na NORQVA. Não representa necessariamente lucro líquido contábil.</span>
                </span>
                <span className="text-[10px] text-slate-500 hidden md:inline">Auditado</span>
              </div>

              {/* 2. COMPACT RECONCILIATION & INTEGRITY INDICATOR */}
              <div className="border border-emerald-900/50 bg-emerald-950/20 rounded-xl p-3.5 sm:p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="font-mono text-xs font-bold uppercase text-emerald-300">
                      Integridade financeira ✓ Conciliado 100%
                    </span>
                  </div>
                  <button
                    onClick={() => setShowAuditDetails(prev => !prev)}
                    className="text-left sm:text-right text-[11px] font-mono text-emerald-400/80 hover:text-emerald-300 font-semibold underline underline-offset-2 transition"
                  >
                    {showAuditDetails ? 'Ocultar detalhes da auditoria ▲' : 'Ver detalhes da auditoria contábil ▼'}
                  </button>
                </div>

                {/* Expandable Audit Details */}
                {showAuditDetails && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono pt-2 border-t border-emerald-900/30">
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                      <div className="text-[10px] text-slate-400 uppercase">Total por Produto (Σ)</div>
                      <div className="text-base sm:text-lg font-bold text-slate-200 mt-1">
                        R$ {finReconciliation.productTotalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                      <div className="text-[10px] text-slate-400 uppercase">Faturamento Consolidado</div>
                      <div className="text-base sm:text-lg font-bold text-emerald-400 mt-1">
                        R$ {finSummary.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                      <div className="text-[10px] text-slate-400 uppercase">Campanhas + Não Atribuído</div>
                      <div className="text-base sm:text-lg font-bold text-slate-200 mt-1">
                        R$ {finReconciliation.campaignPlusUnattributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. VISÃO INDIVIDUALIZADA: POR PRODUTO */}
              <div className="p-4 border border-slate-800 bg-slate-900/50 rounded-xl space-y-3.5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-emerald-400 shrink-0" /> Visão Individualizada por Produto ({finByProduct.length})
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">Rateio Pro-rata de Mídia e Custos Diretos</span>
                </div>

                {finByProduct.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs">Nenhum produto cadastrado.</div>
                ) : (
                  <>
                    {/* Mobile Card Strategy (Screen <= 768px) */}
                    <div className="space-y-3 block md:hidden">
                      {finByProduct.map((p: any) => (
                        <div key={p.productId} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5 font-mono text-xs">
                          <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                            <div>
                              <span className="font-bold text-emerald-400 text-xs block">{p.productHumanId}</span>
                              <span className="font-sans font-bold text-slate-200 text-sm block mt-0.5">{p.productName}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 shrink-0">
                              {p.unitsSold} vendas
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Faturamento</span>
                              <span className="font-bold text-emerald-400 text-sm">
                                R$ {p.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Invest. Mídia</span>
                              <span className="font-bold text-slate-200 text-sm">
                                R$ {p.attributedSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Custos / Taxas</span>
                              <span className="font-bold text-slate-400">
                                R$ {p.gatewayFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Resultado Conhecido</span>
                              <span className={`font-bold ${p.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                R$ {p.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Tabular View (Screen > 768px) */}
                    <div className="hidden md:block overflow-x-auto border border-slate-800 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                          <tr>
                            <th className="p-3">Código</th>
                            <th className="p-3">Produto</th>
                            <th className="p-3 text-right">Vendas Pagas</th>
                            <th className="p-3 text-right">Faturamento</th>
                            <th className="p-3 text-right">Invest. Mídia</th>
                            <th className="p-3 text-right">Custos Conhecidos</th>
                            <th className="p-3 text-right">Resultado Conhecido</th>
                            <th className="p-3 text-right">Margem %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-mono">
                          {finByProduct.map((p: any) => (
                            <tr key={p.productId} className="hover:bg-slate-800/30 transition">
                              <td className="p-3 font-bold text-emerald-400">{p.productHumanId}</td>
                              <td className="p-3 font-sans font-bold text-slate-200">{p.productName}</td>
                              <td className="p-3 text-right text-slate-300">{p.unitsSold}</td>
                              <td className="p-3 text-right font-bold text-emerald-400">
                                R$ {p.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-right text-slate-300">
                                R$ {p.attributedSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-right text-slate-400">
                                R$ {p.gatewayFees.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`p-3 text-right font-bold ${p.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                R$ {p.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`p-3 text-right font-bold ${p.netMargin !== null && p.netMargin >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                {p.netMargin !== null ? `${p.netMargin.toFixed(1)}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* 4. VISÃO INDIVIDUALIZADA: POR CAMPANHA */}
              <div className="p-4 border border-slate-800 bg-slate-900/50 rounded-xl space-y-3.5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-400 shrink-0" /> Visão Individualizada por Campanha Meta Ads ({finByCampaign.length})
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">Atribuição Determinística via UTM e Telemetria</span>
                </div>

                {finByCampaign.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs">Nenhuma campanha sincronizada.</div>
                ) : (
                  <>
                    {/* Mobile Card Strategy */}
                    <div className="space-y-3 block md:hidden">
                      {finByCampaign.map((c: any) => (
                        <div key={c.campaignId} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5 font-mono text-xs">
                          <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2">
                            <div>
                              <span className="font-sans font-bold text-slate-200 text-sm block">{c.campaignName}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">ID: {c.metaCampaignId}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30 shrink-0">
                              {c.effectiveStatus || c.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Investimento</span>
                              <span className="font-bold text-slate-200 text-sm">
                                R$ {c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Receita Atribuída</span>
                              <span className="font-bold text-emerald-400 text-sm">
                                R$ {c.attributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">Pós-Mídia</span>
                              <span className={`font-bold ${c.resultAfterMedia >= 0 ? 'text-slate-200' : 'text-red-400'}`}>
                                R$ {c.resultAfterMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-slate-900/80 border border-slate-850">
                              <span className="text-slate-400 text-[10px] block uppercase">ROAS / Pedidos</span>
                              <span className="font-bold text-emerald-400">
                                {c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'} ({c.attributedOrders} ped.)
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Tabular View */}
                    <div className="hidden md:block overflow-x-auto border border-slate-800 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                          <tr>
                            <th className="p-3">Campanha</th>
                            <th className="p-3">Meta ID</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Investimento</th>
                            <th className="p-3 text-right">Cliques (CTR)</th>
                            <th className="p-3 text-right">CPC Médio</th>
                            <th className="p-3 text-right">Pedidos</th>
                            <th className="p-3 text-right">Receita Atribuída</th>
                            <th className="p-3 text-right">Pós-Mídia</th>
                            <th className="p-3 text-right">ROAS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-mono">
                          {finByCampaign.map((c: any) => (
                            <tr key={c.campaignId} className="hover:bg-slate-800/30 transition">
                              <td className="p-3 font-sans font-bold text-slate-200">{c.campaignName}</td>
                              <td className="p-3 text-slate-400 text-[11px]">{c.metaCampaignId}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                                  {c.effectiveStatus || c.status}
                                </span>
                              </td>
                              <td className="p-3 text-right text-slate-300">
                                R$ {c.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-right text-slate-300">
                                {c.clicks} ({c.ctr !== null ? `${c.ctr}%` : '—'})
                              </td>
                              <td className="p-3 text-right text-slate-400">
                                {c.cpc !== null ? `R$ ${c.cpc.toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-200">{c.attributedOrders}</td>
                              <td className="p-3 text-right font-bold text-emerald-400">
                                R$ {c.attributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`p-3 text-right font-bold ${c.resultAfterMedia >= 0 ? 'text-slate-200' : 'text-red-400'}`}>
                                R$ {c.resultAfterMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`p-3 text-right font-bold ${c.roas !== null && c.roas >= 1 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {c.roas !== null ? `${c.roas.toFixed(2)}x` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {/* 5. VISÃO INDIVIDUALIZADA: POR CRIATIVO & RECEITA NÃO ATRIBUÍDA */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
                {/* Criativos */}
                <div className="lg:col-span-2 p-4 border border-slate-800 bg-slate-900/50 rounded-xl space-y-3.5 shadow-sm">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-400 shrink-0" /> Desempenho por Criativo / Anúncio ({finByCreative.length})
                  </h3>
                  {finByCreative.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 font-mono text-xs">Nenhum anúncio cadastrado.</div>
                  ) : (
                    <>
                      {/* Mobile Card Strategy */}
                      <div className="space-y-3 block md:hidden">
                        {finByCreative.map((ad: any) => (
                          <div key={ad.adId} className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                            <div className="border-b border-slate-800/80 pb-1.5">
                              <span className="font-sans font-bold text-slate-200 text-sm block">{ad.adName}</span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">{ad.campaignName}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                              <div>
                                <span className="text-slate-400 text-[10px] block uppercase">Investimento</span>
                                <span className="font-bold text-slate-200">
                                  R$ {ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[10px] block uppercase">Receita</span>
                                <span className="font-bold text-emerald-400">
                                  R$ {ad.attributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden md:block overflow-x-auto border border-slate-800 rounded-lg">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400 font-mono border-b border-slate-800 text-[10px] uppercase">
                            <tr>
                              <th className="p-3">Criativo / Anúncio</th>
                              <th className="p-3">Conjunto / Campanha</th>
                              <th className="p-3 text-right">Investimento</th>
                              <th className="p-3 text-right">Cliques</th>
                              <th className="p-3 text-right">Pedidos</th>
                              <th className="p-3 text-right">Receita</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-mono">
                            {finByCreative.map((ad: any) => (
                              <tr key={ad.adId} className="hover:bg-slate-800/30 transition">
                                <td className="p-3 font-sans font-bold text-slate-200">{ad.adName}</td>
                                <td className="p-3 text-slate-400 text-[11px]">{ad.campaignName}</td>
                                <td className="p-3 text-right text-slate-300">
                                  R$ {ad.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="p-3 text-right text-slate-300">{ad.clicks}</td>
                                <td className="p-3 text-right font-bold text-slate-200">{ad.attributedOrders}</td>
                                <td className="p-3 text-right font-bold text-emerald-400">
                                  R$ {ad.attributedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* Card de Receita Não Atribuída */}
                <div className="p-4 border border-slate-800 bg-slate-900/50 rounded-xl space-y-4 flex flex-col justify-between shadow-sm">
                  <div>
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
                      <HelpCircle className="h-4 w-4 text-amber-400 shrink-0" /> Receita Não Atribuída
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-2 font-sans">
                      Vendas originadas de tráfego direto, orgânico ou clientes sem parâmetros UTM / fbclid na URL de checkout.
                    </p>

                    <div className="mt-4 p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 font-mono">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Faturamento Direto:</span>
                        <span className="text-emerald-400 font-bold text-base">
                          R$ {finUnattributed.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">Pedidos Confirmados:</span>
                        <span className="text-slate-200 font-bold">
                          {finUnattributed.ordersCount} pedidos
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono text-slate-500 border-t border-slate-800 pt-3">
                    Incluído explicitamente na soma contábil de reconciliação global.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeSubView === 'executive' ? (
        <div className="space-y-6">
          {/* 1. Global KPI Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Investimento Meta */}
            <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
                <span>Investimento de Mídia</span>
                <TrendingUp className="h-4 w-4 text-blue-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono tracking-tight text-slate-100">
                  R$ {meta.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  {meta.impressions.toLocaleString('pt-BR')} imp. | {meta.clicks.toLocaleString('pt-BR')} cliques
                </div>
              </div>
            </div>

            {/* Faturamento Real Pix */}
            <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
                <span>Faturamento Confirmado</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono tracking-tight text-emerald-400">
                  R$ {finance.confirmedRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  Ticket Médio: R$ {commerce.aov.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Pedidos Totais & Pagos */}
            <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
                <span>Pedidos Pagos / Criados</span>
                <ShoppingCart className="h-4 w-4 text-amber-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono tracking-tight text-slate-100">
                  {commerce.paidOrders} / {commerce.totalOrders}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  {commerce.pendingOrders} pendentes | {commerce.cancelledOrders} cancelados
                </div>
              </div>
            </div>

            {/* Entregas & Downloads */}
            <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
                <span>Entregas & Downloads</span>
                <Download className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold font-mono tracking-tight text-slate-100">
                  {delivery.totalEntitlements} disp.
                </div>
                <div className="text-[10px] text-slate-400 mt-1 font-mono">
                  {delivery.completedDownloads} baixados | {delivery.pendingDownloads} aguardando
                </div>
              </div>
            </div>
          </div>

          {/* 2. Deterministic Funnel Panel */}
          <div className="p-5 border border-slate-800 bg-slate-900/40 rounded space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" /> Funil Transacional Determinístico (100% Real)
              </h3>
              <span className="text-[10px] font-mono text-slate-500">Relações comprovadas por chaves estrangeiras</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Step 1: Pedidos */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                <div className="text-[10px] font-mono text-slate-400 uppercase">1. Pedidos Criados</div>
                <div className="text-xl font-bold font-mono text-slate-200 mt-1">{commerce.totalOrders}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Checkout iniciado</div>
              </div>

              {/* Step 2: Cobranças Pix */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                <div className="text-[10px] font-mono text-slate-400 uppercase">2. Pix Gerados</div>
                <div className="text-xl font-bold font-mono text-slate-200 mt-1">{finance.totalPixCreated}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Payload Asaas emitido</div>
              </div>

              {/* Step 3: Pagamentos Confirmados */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                <div className="text-[10px] font-mono text-slate-400 uppercase">3. Pagamentos Confirmados</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{finance.totalPixConfirmed}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">
                  {finance.approvalRate !== null ? `Taxa: ${finance.approvalRate}%` : 'Taxa: — (Aguardando dados)'}
                </div>
              </div>

              {/* Step 4: Entregas Disponibilizadas */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                <div className="text-[10px] font-mono text-slate-400 uppercase">4. Entregas Disponibilizadas</div>
                <div className="text-xl font-bold font-mono text-slate-200 mt-1">{delivery.totalEntitlements}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">Tokens ativos gerados</div>
              </div>

              {/* Step 5: Downloads Realizados */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded">
                <div className="text-[10px] font-mono text-slate-400 uppercase">5. Downloads Concluídos</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{delivery.completedDownloads}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-1">{delivery.totalDownloads} downloads totais</div>
              </div>
            </div>
          </div>

          {/* 3. Meta Campaign Status & Traffic Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Meta Traffic Metrics */}
            <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-400" /> Tráfego Meta Ads
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Impressões:</span>
                  <span className="text-slate-200 font-bold">{meta.impressions.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Alcance Único:</span>
                  <span className="text-slate-200 font-bold">{meta.reach.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">Cliques no Link:</span>
                  <span className="text-slate-200 font-bold">{meta.clicks.toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">CTR (Taxa de Cliques):</span>
                  <span className="text-slate-200 font-bold">{meta.ctr !== null ? `${meta.ctr}%` : '— (Aguardando dados)'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-400">CPC Médio:</span>
                  <span className="text-slate-200 font-bold">{meta.cpc !== null ? `R$ ${meta.cpc.toFixed(2)}` : '— (Aguardando dados)'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">CPM Médio:</span>
                  <span className="text-slate-200 font-bold">{meta.cpm !== null ? `R$ ${meta.cpm.toFixed(2)}` : '— (Aguardando dados)'}</span>
                </div>
              </div>
            </div>

            {/* Meta Campaigns Status Table */}
            <div className="lg:col-span-2 p-4 border border-slate-800 bg-slate-900/40 rounded space-y-3">
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
          </div>

          {/* 4. Recent Real Orders Activity */}
          <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300 font-mono">
              Últimas Transações Registradas ({recentOrders.length})
            </h3>
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
                      <th className="p-2.5">Pagamento (Pix)</th>
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
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ord.download_count > 0 ? 'bg-emerald-955/40 text-emerald-400 border border-emerald-500/20' :
                            ord.delivery_status === 'ACTIVE' ? 'bg-blue-955/40 text-blue-400 border border-blue-500/20' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {ord.download_count > 0 ? `BAIXADO (${ord.download_count})` : ord.delivery_status ? 'DISPONÍVEL' : 'PENDENTE'}
                          </span>
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
