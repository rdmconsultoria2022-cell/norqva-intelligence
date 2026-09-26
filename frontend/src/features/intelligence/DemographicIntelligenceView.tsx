import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Info,
  TrendingUp,
  MousePointer,
  DollarSign,
  Eye,
  ShieldAlert,
  PieChart as PieIcon,
  Sparkles,
  Layers,
  HelpCircle
} from 'lucide-react';
import {
  DemographicAnalyticsData,
  DemographicPeriodOption,
  MediaSampleConfidence,
  AdDemographicSlice
} from './demographicTypes';

interface DemographicIntelligenceViewProps {
  currentUser?: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError?: (msg: string) => void;
  showSuccess?: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Pure Formatting Helpers (pt-BR, BRL, Percentages)
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

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0,00%';
  }
  return `${value.toFixed(2).replace('.', ',')}%`;
}

export function formatCPC(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—';
  }
  return formatBRL(value);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  return Math.round(value).toLocaleString('pt-BR');
}

export function formatAgeGroupLabel(age: string): string {
  if (!age) return 'Não identificado';
  const clean = age.trim().toLowerCase();
  if (clean === 'unknown') return 'Não identificado';
  if (clean === '65+') return '65+ anos';
  return `${clean} anos`;
}

export function formatGenderLabel(gender: string): string {
  if (!gender) return 'Não identificado';
  const clean = gender.trim().toLowerCase();
  if (clean === 'male') return 'Masculino';
  if (clean === 'female') return 'Feminino';
  return 'Não identificado';
}

export function formatConfidenceBadge(confidence: MediaSampleConfidence | string | undefined): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (confidence) {
    case 'SUFFICIENT_MEDIA_SAMPLE':
      return {
        label: 'Amostra suficiente',
        bgClass: 'bg-emerald-950/40',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/40'
      };
    case 'LEARNING':
      return {
        label: 'Aprendizado',
        bgClass: 'bg-amber-950/40',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-500/40'
      };
    case 'OBSERVING':
      return {
        label: 'Observando',
        bgClass: 'bg-sky-950/40',
        textClass: 'text-sky-400',
        borderClass: 'border-sky-500/40'
      };
    case 'NO_DATA':
    default:
      return {
        label: 'Sem dados',
        bgClass: 'bg-slate-800/60',
        textClass: 'text-slate-400',
        borderClass: 'border-slate-700/60'
      };
  }
}

export function getConfidenceNotice(confidence: MediaSampleConfidence | string | undefined): string {
  switch (confidence) {
    case 'SUFFICIENT_MEDIA_SAMPLE':
      return 'Amostra de mídia suficiente para análise de eficiência de tráfego.';
    case 'LEARNING':
      return 'Tendência em formação. Continue coletando dados antes de alterações relevantes de investimento.';
    case 'OBSERVING':
      return 'Amostra inicial. Evite decisões de segmentação com base apenas nesses dados.';
    case 'NO_DATA':
    default:
      return 'Ainda não existem dados de cliques para este período.';
  }
}

const PERIOD_OPTIONS: Array<{ id: DemographicPeriodOption; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' }
];

export const DemographicIntelligenceView: React.FC<DemographicIntelligenceViewProps> = ({
  isDemoView,
  apiFetch,
  showError
}) => {
  const [data, setData] = useState<DemographicAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DemographicPeriodOption>('today');

  const apiFetchRef = React.useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const showErrorRef = React.useRef(showError);
  showErrorRef.current = showError;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const params = new URLSearchParams({
        mode,
        period
      });

      const res = await apiFetchRef.current(`/intelligence/demographics?${params.toString()}`);
      if (res && res.summary) {
        setData(res);
      } else {
        setData(null);
      }
    } catch (err: any) {
      const errorMsg = 'Não foi possível carregar os dados demográficos.';
      setError(errorMsg);
      showErrorRef.current?.(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [isDemoView, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Safe data shortcuts
  const summary = data?.summary;
  const cohorts = data?.cohorts;
  const hypothesis = data?.hypothesis_45_plus;
  const byAge = data?.by_age || [];
  const byGender = data?.by_gender || [];
  const byAd = data?.by_ad || [];

  const hasData = summary && summary.total_impressions > 0;

  return (
    <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      {/* ----------------------------------------------------------------- */}
      {/* 1. Header & Controls */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-purple-950/40 text-purple-400 border border-purple-500/30">
              Media Intelligence
            </span>
            {isDemoView && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-amber-950/40 text-amber-400 border border-amber-500/30">
                Sandbox Demo
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="h-6 w-6 text-purple-400" />
            Inteligência Demográfica
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Composição de tráfego, faixas etárias e atratividade por criativo (Meta Ads)
          </p>
        </div>

        {/* Controls & Period Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-1">
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setPeriod(opt.id)}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    active
                      ? 'bg-purple-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
            title="Atualizar dados"
            aria-label="Atualizar dados"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. Loading State */}
      {/* ----------------------------------------------------------------- */}
      {loading && (
        <div className="space-y-6 animate-pulse" data-testid="demographics-loading">
          <div className="h-44 bg-slate-900/60 rounded-xl border border-slate-800/80 p-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-60 bg-slate-900/60 rounded-xl border border-slate-800/80" />
            <div className="h-60 bg-slate-900/60 rounded-xl border border-slate-800/80" />
          </div>
          <div className="h-72 bg-slate-900/60 rounded-xl border border-slate-800/80" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. Error State */}
      {/* ----------------------------------------------------------------- */}
      {!loading && error && (
        <div
          data-testid="demographics-error"
          className="rounded-xl bg-red-950/30 border border-red-500/30 p-6 text-center space-y-3"
        >
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <div className="text-sm font-bold text-red-200">Falha ao carregar inteligência demográfica</div>
          <p className="text-xs text-red-300/80 max-w-md mx-auto">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 4. Empty / No Data State */}
      {/* ----------------------------------------------------------------- */}
      {!loading && !error && !hasData && (
        <div
          data-testid="demographics-empty"
          className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-12 text-center space-y-4"
        >
          <div className="h-12 w-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">Nenhum dado demográfico no período</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Não foram registradas impressões ou cliques com segmentação etária para o filtro selecionado (
              {PERIOD_OPTIONS.find((p) => p.id === period)?.label}).
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Janela: {data?.time_window?.start_date || '—'} até {data?.time_window?.end_date || '—'} (America/Sao_Paulo)
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 5. Success Content */}
      {/* ----------------------------------------------------------------- */}
      {!loading && !error && hasData && (
        <div className="space-y-8" data-testid="demographics-content">
          {/* ============================================================= */}
          {/* A. Executive Hypothesis 45+ Banner */}
          {/* ============================================================= */}
          <div className="rounded-xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 md:p-8 space-y-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                  Composição Demográfica da Mídia
                </span>
                <h2 className="text-lg md:text-xl font-bold text-white mt-0.5">
                  Participação 45+ nos Cliques
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const badge = formatConfidenceBadge(hypothesis?.media_sample_confidence_45_plus);
                  return (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Click Share Visual Proportional Bar */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div
                  style={{ width: `${hypothesis?.click_share_45_plus || 0}%` }}
                  className="bg-purple-500 transition-all duration-500 hover:opacity-90"
                  title={`45+: ${formatPercent(hypothesis?.click_share_45_plus)}`}
                />
                <div
                  style={{ width: `${cohorts?.under_45?.click_share || 0}%` }}
                  className="bg-sky-500 transition-all duration-500 hover:opacity-90"
                  title={`<45: ${formatPercent(cohorts?.under_45?.click_share)}`}
                />
                <div
                  style={{ width: `${cohorts?.unknown?.click_share || 0}%` }}
                  className="bg-slate-600 transition-all duration-500 hover:opacity-90"
                  title={`Não identificado: ${formatPercent(cohorts?.unknown?.click_share)}`}
                />
              </div>

              {/* Legend with shares */}
              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-slate-300 font-semibold">45+ anos:</span>
                  <span className="text-white font-bold text-sm">
                    {formatPercent(hypothesis?.click_share_45_plus)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-sky-500 shrink-0" />
                  <span className="text-slate-300 font-semibold">&lt;45 anos:</span>
                  <span className="text-white font-bold text-sm">
                    {formatPercent(cohorts?.under_45?.click_share)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-600 shrink-0" />
                  <span className="text-slate-400">Não identificado:</span>
                  <span className="text-slate-300 font-medium">
                    {formatPercent(cohorts?.unknown?.click_share)}
                  </span>
                </div>
              </div>
            </div>

            {/* Confidence Notice Box */}
            <div className="rounded-lg bg-slate-950/60 border border-slate-800/80 p-3.5 flex items-start gap-3">
              <Info className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-0.5">
                <div className="font-semibold text-white">Status da Amostra:</div>
                <div>{getConfidenceNotice(hypothesis?.media_sample_confidence_45_plus)}</div>
              </div>
            </div>

            {/* Dual Comparison Cards (<45 vs 45+) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card <45 */}
              <div className="rounded-lg bg-slate-950/40 border border-sky-500/20 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <h3 className="text-sm font-bold text-sky-200 uppercase tracking-wide">
                      Público &lt;45 anos
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">18–44 anos</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Investimento</span>
                    <span className="text-sm font-bold text-white">
                      {formatBRL(cohorts?.under_45?.spend)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Share: {formatPercent(cohorts?.under_45?.spend_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Cliques</span>
                    <span className="text-sm font-bold text-white">
                      {formatInteger(cohorts?.under_45?.clicks)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Share: {formatPercent(cohorts?.under_45?.click_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">CTR</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatPercent(cohorts?.under_45?.ctr)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">CPC</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatCPC(cohorts?.under_45?.cpc)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 45+ */}
              <div className="rounded-lg bg-slate-950/40 border border-purple-500/20 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                    <h3 className="text-sm font-bold text-purple-200 uppercase tracking-wide">
                      Público 45+ anos
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">45 a 65+ anos</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Investimento</span>
                    <span className="text-sm font-bold text-white">
                      {formatBRL(cohorts?.age_45_plus?.spend)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Share: {formatPercent(hypothesis?.spend_share_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Cliques</span>
                    <span className="text-sm font-bold text-white">
                      {formatInteger(cohorts?.age_45_plus?.clicks)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Share: {formatPercent(hypothesis?.click_share_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">CTR</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatPercent(hypothesis?.ctr_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">CPC</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {formatCPC(hypothesis?.cpc_45_plus)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* B. By Age Breakdown (All 7 Buckets) */}
          {/* ============================================================= */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="h-5 w-5 text-purple-400" />
                  Distribuição por Faixa Etária
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Métricas agregadas detalhadas por bucket etário da Meta
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Total de Cliques: {formatInteger(summary?.total_clicks)}
              </div>
            </div>

            {/* Visual Bars & Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Faixa Etária</th>
                    <th className="py-3 px-3">Share de Cliques</th>
                    <th className="py-3 px-3 text-right">Investimento</th>
                    <th className="py-3 px-3 text-right">Impressões</th>
                    <th className="py-3 px-3 text-right">Cliques</th>
                    <th className="py-3 px-3 text-right">CTR</th>
                    <th className="py-3 px-3 text-right">CPC</th>
                    <th className="py-3 px-3 text-center">Amostra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {byAge.map((item) => {
                    const is45Plus = ['45-54', '55-64', '65+'].includes(item.age_group);
                    const isUnknown = item.age_group === 'unknown';
                    const badge = formatConfidenceBadge(item.media_sample_confidence);

                    return (
                      <tr key={item.age_group} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-3 font-semibold text-white whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                isUnknown ? 'bg-slate-500' : is45Plus ? 'bg-purple-400' : 'bg-sky-400'
                              }`}
                            />
                            {formatAgeGroupLabel(item.age_group)}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${item.click_share || 0}%` }}
                                className={`h-full rounded-full ${
                                  isUnknown ? 'bg-slate-500' : is45Plus ? 'bg-purple-500' : 'bg-sky-500'
                                }`}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-slate-300 w-12 text-right">
                              {formatPercent(item.click_share)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-200 font-mono">
                          {formatBRL(item.spend)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-300 font-mono">
                          {formatInteger(item.impressions)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-bold text-white font-mono">
                          {formatInteger(item.clicks)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-200 font-mono">
                          {formatPercent(item.ctr)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-200 font-mono">
                          {formatCPC(item.cpc)}
                        </td>
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================= */}
          {/* C. By Creative / Ad Breakdown ("Quem cada criativo está atraindo?") */}
          {/* ============================================================= */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                  Comportamento por Criativo
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <Sparkles className="h-5 w-5 text-purple-400" />
                  Quem cada criativo está atraindo?
                </h3>
              </div>
              <div className="text-xs text-slate-400">
                {byAd.length} {byAd.length === 1 ? 'anúncio analisado' : 'anúncios analisados'}
              </div>
            </div>

            {byAd.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nenhum anúncio com dados demográficos no período selecionado.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {byAd.map((ad) => {
                  const badge = formatConfidenceBadge(ad.media_sample_confidence);

                  return (
                    <div
                      key={ad.ad_id || ad.meta_ad_id}
                      className="rounded-lg bg-slate-950/60 border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold text-white leading-tight">
                            {ad.ad_name}
                          </h4>
                          <span className="text-[10px] font-mono text-slate-500 block mt-0.5">
                            ID: {ad.meta_ad_id}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border shrink-0 ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {/* Click Share Progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Share 45+:</span>
                          <span className="text-purple-400 font-bold font-mono">
                            {formatPercent(ad.click_share_45_plus)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${ad.click_share_45_plus || 0}%` }}
                            className="bg-purple-500"
                            title={`45+: ${formatPercent(ad.click_share_45_plus)}`}
                          />
                          <div
                            style={{ width: `${ad.under_45?.click_share || 0}%` }}
                            className="bg-sky-500"
                            title={`<45: ${formatPercent(ad.under_45?.click_share)}`}
                          />
                          <div
                            style={{ width: `${ad.unknown?.click_share || 0}%` }}
                            className="bg-slate-600"
                            title={`Não identificado: ${formatPercent(ad.unknown?.click_share)}`}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                          <span>&lt;45: {formatPercent(ad.under_45?.click_share)}</span>
                          <span>Não ident: {formatPercent(ad.unknown?.click_share)}</span>
                        </div>
                      </div>

                      {/* Metrics Comparison Grid */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                        <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
                          <span className="text-[10px] text-purple-400 font-semibold block uppercase">
                            Público 45+
                          </span>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-slate-400 text-[11px]">CPC:</span>
                            <span className="font-mono font-bold text-white">
                              {formatCPC(ad.cpc_45_plus)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-[11px] text-slate-400">
                            <span>CTR:</span>
                            <span className="font-mono text-slate-300">
                              {formatPercent(ad.age_45_plus?.ctr)}
                            </span>
                          </div>
                        </div>

                        <div className="rounded bg-slate-900/60 p-2.5 border border-slate-800">
                          <span className="text-[10px] text-sky-400 font-semibold block uppercase">
                            Público &lt;45
                          </span>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-slate-400 text-[11px]">CPC:</span>
                            <span className="font-mono font-bold text-white">
                              {formatCPC(ad.cpc_under_45)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-[11px] text-slate-400">
                            <span>CTR:</span>
                            <span className="font-mono text-slate-300">
                              {formatPercent(ad.under_45?.ctr)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Totals Footer */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                        <span>Investimento: {formatBRL(ad.spend)}</span>
                        <span>Cliques: {formatInteger(ad.clicks)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================================================= */}
          {/* D. Gender Breakdown */}
          {/* ============================================================= */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PieIcon className="h-5 w-5 text-purple-400" />
                Distribuição por Gênero
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Métricas de entrega de mídia distribuídas por gênero
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {byGender.map((g) => (
                <div
                  key={g.gender}
                  className="rounded-lg bg-slate-950/40 border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      {formatGenderLabel(g.gender)}
                    </span>
                    <span className="text-xs font-mono font-bold text-purple-400">
                      {formatPercent(g.click_share)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Investimento</span>
                      <span className="font-mono text-slate-200">{formatBRL(g.spend)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Cliques</span>
                      <span className="font-mono text-slate-200">{formatInteger(g.clicks)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">CTR</span>
                      <span className="font-mono text-slate-200">{formatPercent(g.ctr)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">CPC</span>
                      <span className="font-mono text-slate-200">{formatCPC(g.cpc)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
