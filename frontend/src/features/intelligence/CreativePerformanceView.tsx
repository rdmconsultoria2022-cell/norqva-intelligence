import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  Eye,
  MousePointer,
  ShoppingCart,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
  BarChart3,
  Calendar,
  Layers,
  Sparkles,
  Info,
  Clock,
  ArrowDown,
  Filter
} from 'lucide-react';
import {
  CreativePerformanceData,
  CreativeItemPerformance,
  ConfidenceGrade,
  ConfidenceReason,
  PeriodFilterOption
} from './creativePerformanceTypes';

interface CreativePerformanceViewProps {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Pure Formatting Helpers (READ-ONLY PRESENTATION)
// ---------------------------------------------------------------------------

export function formatBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'R$ 0,00';
  }
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatCAC(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  return formatBRL(value);
}

export function formatROAS(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00x';
  }
  return `${value.toFixed(2).replace('.', ',')}x`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00%';
  }
  return `${value.toFixed(2).replace('.', ',')}%`;
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  return Math.round(value).toLocaleString('pt-BR');
}

export function formatDateTimeBR(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

export function getShortAdName(fullName: string): string {
  if (!fullName) return 'Anúncio';
  const upper = fullName.toUpperCase();
  if (upper.includes('SEPARACAO') || upper.includes('SEPARAÇÃO')) return 'A — Separação';
  if (upper.includes('EMULSAO') || upper.includes('EMULSÃO')) return 'B — Emulsão';
  if (upper.includes('MASSA')) return 'C — Massa';
  return fullName;
}

export function getConfidenceBadge(confidence: ConfidenceGrade | string) {
  switch (confidence) {
    case 'CONFIDENT':
      return {
        label: 'Amostra confiável',
        badgeClass: 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
      };
    case 'LEARNING':
      return {
        label: 'Aprendendo',
        badgeClass: 'bg-sky-950/80 text-sky-400 border border-sky-500/30'
      };
    case 'OBSERVING':
      return {
        label: 'Observando',
        badgeClass: 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
      };
    default:
      return {
        label: 'Dados insuficientes',
        badgeClass: 'bg-slate-900 text-slate-400 border border-slate-800'
      };
  }
}

export function getConfidenceReasonText(reason: ConfidenceReason | string): string {
  switch (reason) {
    case 'SUFFICIENT_SAMPLE':
      return 'Volume de cliques e conversões suficiente para análise estatística confiável.';
    case 'LEARNING_SAMPLE':
      return 'Fase de aprendizado com conversões preliminares registradas.';
    case 'INSUFFICIENT_PURCHASES':
      return 'Cliques registrados, porém sem conversões pagas suficientes para cálculo conclusivo.';
    case 'INSUFFICIENT_CLICKS':
      return 'Volume de tráfego inicial ainda abaixo do limiar estatístico mínimo.';
    default:
      return 'Amostra em consolidação analítica.';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CreativePerformanceView: React.FC<CreativePerformanceViewProps> = ({
  currentUser,
  isDemoView,
  apiFetch,
  showError,
  showSuccess
}) => {
  const [data, setData] = useState<CreativePerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Period filter states
  const [period, setPeriod] = useState<PeriodFilterOption>('30d');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [appliedCustomDates, setAppliedCustomDates] = useState<{ from?: string; to?: string }>({});

  const calculateDateRange = useCallback((option: PeriodFilterOption): { from?: string; to?: string } => {
    if (option === 'custom') {
      return appliedCustomDates;
    }

    const today = new Date();
    const toStr = today.toISOString().split('T')[0];

    if (option === 'today') {
      return { from: toStr, to: toStr };
    }

    if (option === '7d') {
      const past7 = new Date();
      past7.setDate(today.getDate() - 6);
      return { from: past7.toISOString().split('T')[0], to: toStr };
    }

    if (option === '30d') {
      const past30 = new Date();
      past30.setDate(today.getDate() - 29);
      return { from: past30.toISOString().split('T')[0], to: toStr };
    }

    return {};
  }, [appliedCustomDates]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const range = calculateDateRange(period);

      const params = new URLSearchParams();
      params.set('mode', mode);
      if (range.from) params.set('date_from', range.from);
      if (range.to) params.set('date_to', range.to);

      const res = await apiFetch(`/intelligence/creative-performance?${params.toString()}`);
      if (res && res.summary) {
        setData(res);
      } else {
        setData(null);
      }
    } catch (err: any) {
      const errorMsg = 'Não foi possível carregar os dados de performance.';
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [isDemoView, period, calculateDateRange, apiFetch, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyCustomFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDateFrom || !customDateTo) {
      showError('Selecione as datas inicial e final para o filtro personalizado.');
      return;
    }
    if (customDateFrom > customDateTo) {
      showError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setAppliedCustomDates({ from: customDateFrom, to: customDateTo });
    setPeriod('custom');
  };

  // Safe accessor shortcuts
  const summary = data?.summary;
  const creatives = data?.creatives || [];
  const unattributed = data?.unattributed;
  const dataFreshness = data?.dataFreshness;

  const campaignName = creatives[0]?.campaign_id
    ? `NORQVA_TRATTORIA_REVENUE_V1`
    : 'NORQVA TRATTORIA';

  return (
    <div className="space-y-6 text-sm">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER & CONTROLS */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-100 font-mono uppercase flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
              Performance de Criativos
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              V1 ENGINE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Compare investimento, tráfego, conversões e receita por anúncio.
          </p>
        </div>

        {/* Info Chips & Actions */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400">Campanha:</span>
            <span className="font-bold text-slate-200 truncate max-w-[200px]" title={campaignName}>
              {campaignName}
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400">Última Sync:</span>
            <span className="font-bold text-slate-200">
              {formatDateTimeBR(dataFreshness?.last_meta_sync)}
            </span>
            {dataFreshness?.meta_sync_status === 'SUCCESS' && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" title="Sincronização OK" />
            )}
            {dataFreshness?.meta_sync_status === 'FAILED' && (
              <span className="h-2 w-2 rounded-full bg-rose-400" title="Falha na sincronização" />
            )}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition font-mono text-xs border border-slate-700 disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* PERIOD FILTER */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-800">
        <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
          <Filter className="h-3.5 w-3.5 text-emerald-400" />
          <span className="uppercase font-semibold">Período:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition ${
              period === 'today'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPeriod('7d')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition ${
              period === '7d'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            Últimos 7 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod('30d')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition ${
              period === '30d'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            Últimos 30 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition ${
              period === 'custom'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            Personalizado
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker */}
      {period === 'custom' && (
        <form
          onSubmit={handleApplyCustomFilter}
          className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-mono"
        >
          <div className="flex items-center gap-2">
            <span className="text-slate-400">De:</span>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Até:</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-1.5 bg-emerald-500 text-slate-950 font-bold rounded hover:bg-emerald-400 transition"
          >
            Filtrar
          </button>
        </form>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* DATA FRESHNESS ALERT (IF FAILED) */}
      {/* ----------------------------------------------------------------- */}
      {dataFreshness?.meta_sync_status === 'FAILED' && (
        <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Aviso de Sincronização:</strong> O último ciclo de sincronização com a Meta falhou. Os dados exibidos correspondem à última captura válida ({formatDateTimeBR(dataFreshness?.last_meta_sync)}).
          </span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* ERROR STATE */}
      {/* ----------------------------------------------------------------- */}
      {error && !loading && (
        <div className="p-8 rounded-lg bg-red-950/20 border border-red-500/30 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm font-semibold text-red-200">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 rounded text-xs font-mono font-bold transition"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* LOADING STATE */}
      {/* ----------------------------------------------------------------- */}
      {loading && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-900/60 rounded-lg border border-slate-800" />
            ))}
          </div>
          <div className="h-28 bg-slate-900/60 rounded-lg border border-slate-800" />
          <div className="h-64 bg-slate-900/60 rounded-lg border border-slate-800" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* EMPTY STATE */}
      {/* ----------------------------------------------------------------- */}
      {!loading && !error && creatives.length === 0 && (
        <div className="p-12 rounded-lg bg-slate-900/20 border border-slate-800 text-center text-slate-400 space-y-2">
          <Info className="h-8 w-8 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold">Não há dados suficientes para este período.</p>
          <p className="text-xs text-slate-500">
            Tente selecionar outro intervalo temporal ou aguarde a próxima sincronização com a Meta.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* MAIN CONTENT (DATA LOADED) */}
      {/* ----------------------------------------------------------------- */}
      {!loading && !error && data && creatives.length > 0 && (
        <>
          {/* 1. KPI SUMMARY CARDS (5 TOP CARDS) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {/* Card 1: Investimento */}
            <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-emerald-400" /> Investimento
              </div>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {formatBRL(summary?.total_spend)}
              </div>
            </div>

            {/* Card 2: Receita */}
            <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-emerald-400" /> Receita
              </div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {formatBRL(summary?.total_revenue)}
              </div>
            </div>

            {/* Card 3: Vendas */}
            <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <ShoppingCart className="h-3 w-3 text-cyan-400" /> Vendas
              </div>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {formatInteger(summary?.total_paid_orders)}
              </div>
            </div>

            {/* Card 4: CAC Médio (STRICT NULL DISPLAY: "—") */}
            <div className="p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase">CAC Médio</div>
              <div className="text-lg font-bold text-slate-100 font-mono">
                {formatCAC(summary?.blended_cac)}
              </div>
            </div>

            {/* Card 5: ROAS */}
            <div className="col-span-2 md:col-span-1 p-3.5 rounded-lg bg-slate-900/50 border border-slate-800 space-y-1">
              <div className="text-[10px] font-mono text-slate-400 uppercase">ROAS</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">
                {formatROAS(summary?.blended_roas)}
              </div>
            </div>
          </div>

          {/* 2. COMPACT FUNNEL SECTION */}
          <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800 space-y-3">
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Funil Comercial Agregado
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Step 1: Impressões */}
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800 text-center space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Impressões</div>
                <div className="text-sm font-bold text-slate-100 font-mono">
                  {formatInteger(summary?.total_impressions)}
                </div>
              </div>

              {/* Step 2: Cliques */}
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800 text-center space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Cliques</div>
                <div className="text-sm font-bold text-slate-100 font-mono">
                  {formatInteger(summary?.total_clicks)}
                </div>
              </div>

              {/* Step 3: Visualizações da Oferta */}
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800 text-center space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Visitas Oferta</div>
                <div className="text-sm font-bold text-slate-100 font-mono">
                  {formatInteger(
                    creatives.reduce((acc, c) => acc + (c.offer_views || 0), 0)
                  )}
                </div>
              </div>

              {/* Step 4: Checkouts */}
              <div className="p-3 rounded bg-slate-950/60 border border-slate-800 text-center space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Checkouts</div>
                <div className="text-sm font-bold text-slate-100 font-mono">
                  {formatInteger(summary?.total_checkouts)}
                </div>
              </div>

              {/* Step 5: Compras */}
              <div className="col-span-2 sm:col-span-1 p-3 rounded bg-slate-950/60 border border-slate-800 text-center space-y-0.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase">Compras</div>
                <div className="text-sm font-bold text-emerald-400 font-mono">
                  {formatInteger(summary?.total_paid_orders)}
                </div>
              </div>
            </div>
          </div>

          {/* 3. CREATIVE COMPARISON TABLE (13 COLUMNS) */}
          <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20">
            <div className="p-3.5 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between">
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
                Comparação de Desempenho por Anúncio
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {creatives.length} criativo(s) ativo(s)
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-[1000px]">
                <thead className="bg-slate-900/90 text-slate-400 font-mono border-b border-slate-800">
                  <tr>
                    <th className="p-3 sticky left-0 bg-slate-900 z-20 border-r border-slate-800 shadow-md">CRIATIVO</th>
                    <th className="p-3">STATUS DE CONFIANÇA</th>
                    <th className="p-3 text-right">INVESTIMENTO</th>
                    <th className="p-3 text-right">IMPRESSÕES</th>
                    <th className="p-3 text-right">CLIQUES</th>
                    <th className="p-3 text-right">CTR</th>
                    <th className="p-3 text-right">CPC</th>
                    <th className="p-3 text-right">VISITAS</th>
                    <th className="p-3 text-right">CHECKOUTS</th>
                    <th className="p-3 text-right">VENDAS</th>
                    <th className="p-3 text-right">RECEITA</th>
                    <th className="p-3 text-right">CAC</th>
                    <th className="p-3 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {creatives.map((c) => {
                    const badge = getConfidenceBadge(c.confidence);
                    const reasonText = getConfidenceReasonText(c.confidence_reason);
                    const shortName = getShortAdName(c.ad_name);

                    return (
                      <tr key={c.ad_id} className="hover:bg-slate-800/30 transition">
                        {/* Col 1: Criativo (Sticky First Column) */}
                        <td className="p-3 sticky left-0 bg-slate-900/95 z-10 border-r border-slate-800 shadow-md">
                          <div className="font-bold text-slate-100" title={c.ad_name}>
                            {shortName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate max-w-[140px] sm:max-w-[180px]" title={c.ad_id}>
                            {c.ad_name}
                          </div>
                        </td>

                        {/* Col 2: Status de Confiança */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5" title={reasonText}>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${badge.badgeClass}`}>
                              {badge.label}
                            </span>
                            <HelpCircle className="h-3 w-3 text-slate-500 cursor-help" />
                          </div>
                        </td>

                        {/* Col 3: Investimento */}
                        <td className="p-3 text-right font-mono text-slate-200">
                          {formatBRL(c.spend)}
                        </td>

                        {/* Col 4: Impressões */}
                        <td className="p-3 text-right font-mono text-slate-400">
                          {formatInteger(c.impressions)}
                        </td>

                        {/* Col 5: Cliques */}
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatInteger(c.clicks)}
                        </td>

                        {/* Col 6: CTR */}
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatPercent(c.ctr)}
                        </td>

                        {/* Col 7: CPC */}
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatBRL(c.cpc)}
                        </td>

                        {/* Col 8: Visitas / Oferta */}
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatInteger(c.offer_views)}
                        </td>

                        {/* Col 9: Checkouts */}
                        <td className="p-3 text-right font-mono text-slate-300">
                          {formatInteger(c.checkout_started)}
                        </td>

                        {/* Col 10: Vendas */}
                        <td className="p-3 text-right font-mono font-bold text-slate-100">
                          {formatInteger(c.paid_orders)}
                        </td>

                        {/* Col 11: Receita */}
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">
                          {formatBRL(c.gross_revenue)}
                        </td>

                        {/* Col 12: CAC (Strict null: "—") */}
                        <td className="p-3 text-right font-mono text-slate-200">
                          {formatCAC(c.cac)}
                        </td>

                        {/* Col 13: ROAS */}
                        <td className="p-3 text-right font-mono font-bold text-emerald-400">
                          {formatROAS(c.roas)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. UNATTRIBUTED REVENUE SECTION */}
          {unattributed && (
            <div className="p-4 rounded-lg bg-slate-900/40 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-mono font-bold uppercase text-slate-300 flex items-center gap-2">
                  <Info className="h-4 w-4 text-slate-400" />
                  Receita sem atribuição
                </div>
                <p className="text-xs text-slate-400 max-w-xl">
                  Vendas confirmadas cuja origem não pôde ser associada deterministicamente a um anúncio.
                </p>
              </div>

              <div className="flex items-center gap-6 text-xs font-mono shrink-0">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Pedidos Não Atribuídos</div>
                  <div className="text-base font-bold text-slate-200">
                    {formatInteger(unattributed.unattributed_paid_orders)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Receita Não Atribuída</div>
                  <div className="text-base font-bold text-emerald-400">
                    {formatBRL(unattributed.unattributed_revenue)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
