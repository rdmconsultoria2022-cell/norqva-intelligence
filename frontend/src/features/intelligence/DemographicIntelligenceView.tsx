import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalPeriod, periodQuery, periodLabel } from '../../lib/globalPeriod';
import { useIsMobile } from '../../components/ui/premium';
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
        bgClass: 'bg-nq-positive/10',
        textClass: 'text-nq-positive-text',
        borderClass: 'border-nq-positive/40'
      };
    case 'LEARNING':
      return {
        label: 'Aprendizado',
        bgClass: 'bg-nq-attention/10',
        textClass: 'text-nq-attention',
        borderClass: 'border-nq-attention/40'
      };
    case 'OBSERVING':
      return {
        label: 'Observando',
        bgClass: 'bg-nq-info/10',
        textClass: 'text-nq-info',
        borderClass: 'border-nq-info/40'
      };
    case 'NO_DATA':
    default:
      return {
        label: 'Sem dados',
        bgClass: 'bg-nq-raised',
        textClass: 'text-nq-muted',
        borderClass: 'border-nq-line'
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
  const isMobile = useIsMobile();
  const [data, setData] = useState<DemographicAnalyticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // NORQVA-0004: global period shared by every screen
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);

  const apiFetchRef = React.useRef(apiFetch);
  apiFetchRef.current = apiFetch;
  const showErrorRef = React.useRef(showError);
  showErrorRef.current = showError;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetchRef.current(`/intelligence/demographics?mode=${mode}&${periodQs}`);
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
  }, [isDemoView, periodQs]);

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
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* ----------------------------------------------------------------- */}
      {/* 1. Header & Controls */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-nq-section font-semibold text-nq-text">Inteligência demográfica</h2>
          <p className="mt-1 text-nq-aux text-nq-muted">Composição do tráfego, faixas etárias e quem cada criativo atrai (Meta Ads).</p>
          {isDemoView && <p className="mt-1 text-nq-caption text-nq-attention">Dados de demonstração</p>}
        </div>

        {/* Controls & Period Selector */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={loadData}
            disabled={loading}
            className="h-11 w-11 flex items-center justify-center rounded-full bg-nq-surface text-nq-muted hover:text-nq-text active:bg-nq-raised transition disabled:opacity-50"
            title="Atualizar dados"
            aria-label="Atualizar dados"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* 2. Loading State */}
      {/* ----------------------------------------------------------------- */}
      {loading && (
        <div className="space-y-6 animate-pulse" data-testid="demographics-loading">
          <div className="h-44 bg-nq-surface rounded-nq p-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-60 bg-nq-surface rounded-nq" />
            <div className="h-60 bg-nq-surface rounded-nq" />
          </div>
          <div className="h-72 bg-nq-surface rounded-nq" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* 3. Error State */}
      {/* ----------------------------------------------------------------- */}
      {!loading && error && (
        <div
          data-testid="demographics-error"
          className="rounded-xl bg-nq-critical/10 border border-nq-critical/40 p-6 text-center space-y-3"
        >
          <AlertCircle className="h-8 w-8 text-nq-critical-text mx-auto" />
          <div className="text-sm font-bold text-nq-critical-text">Falha ao carregar inteligência demográfica</div>
          <p className="text-xs text-nq-critical-text/80 max-w-md mx-auto">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 rounded-lg bg-nq-raised hover:brightness-110 text-nq-text text-nq-aux font-semibold transition min-h-[44px]"
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
          className="rounded-nq bg-nq-surface p-12 text-center space-y-4"
        >
          <div className="h-12 w-12 rounded-full bg-nq-raised flex items-center justify-center mx-auto text-nq-muted">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-nq-text">Nenhum dado demográfico no período</h3>
            <p className="text-xs text-nq-muted max-w-md mx-auto mt-1">
              Não foram registradas impressões ou cliques com segmentação etária para o filtro selecionado (
              {periodLabel(globalPeriod)}).
            </p>
          </div>
          <div className="text-[12px] text-nq-subtle">
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
          <div className="rounded-nq bg-nq-surface p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[12px] text-nq-muted font-bold">
                  Composição Demográfica da Mídia
                </span>
                <h2 className="text-lg md:text-xl font-bold text-nq-text mt-0.5">
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
              <div className="h-4 w-full bg-nq-bg rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${hypothesis?.click_share_45_plus || 0}%` }}
                  className="bg-purple-500 transition-all duration-500 hover:opacity-90"
                  title={`45+: ${formatPercent(hypothesis?.click_share_45_plus)}`}
                />
                <div
                  style={{ width: `${cohorts?.under_45?.click_share || 0}%` }}
                  className="bg-nq-info transition-all duration-500 hover:opacity-90"
                  title={`<45: ${formatPercent(cohorts?.under_45?.click_share)}`}
                />
                <div
                  style={{ width: `${cohorts?.unknown?.click_share || 0}%` }}
                  className="bg-slate-600 transition-all duration-500 hover:opacity-90"
                  title={`Não identificado: ${formatPercent(cohorts?.unknown?.click_share)}`}
                />
              </div>

              {/* Legend with shares */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-purple-500 shrink-0" />
                  <span className="text-nq-text font-semibold">45+ anos:</span>
                  <span className="text-nq-text font-bold text-sm">
                    {formatPercent(hypothesis?.click_share_45_plus)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-nq-info shrink-0" />
                  <span className="text-nq-text font-semibold">&lt;45 anos:</span>
                  <span className="text-nq-text font-bold text-sm">
                    {formatPercent(cohorts?.under_45?.click_share)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-slate-600 shrink-0" />
                  <span className="text-nq-muted">Não identificado:</span>
                  <span className="text-nq-text font-medium">
                    {formatPercent(cohorts?.unknown?.click_share)}
                  </span>
                </div>
              </div>
            </div>

            {/* Confidence Notice Box */}
            <div className="rounded-lg bg-nq-bg p-3.5 flex items-start gap-3">
              <Info className="h-4 w-4 text-nq-muted shrink-0 mt-0.5" />
              <div className="text-xs text-nq-text space-y-0.5">
                <div className="font-semibold text-nq-text">Status da Amostra:</div>
                <div>{getConfidenceNotice(hypothesis?.media_sample_confidence_45_plus)}</div>
              </div>
            </div>

            {/* Dual Comparison Cards (<45 vs 45+) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card <45 */}
              <div className="rounded-lg bg-nq-bg border border-nq-line p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-nq-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    <h3 className="text-sm font-bold text-nq-info">
                      Público &lt;45 anos
                    </h3>
                  </div>
                  <span className="text-[12px] text-nq-muted">18–44 anos</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-nq-muted block text-[12px]">Investimento</span>
                    <span className="text-sm font-bold text-nq-text">
                      {formatBRL(cohorts?.under_45?.spend)}
                    </span>
                    <span className="text-[12px] text-nq-subtle block">
                      Share: {formatPercent(cohorts?.under_45?.spend_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">Cliques</span>
                    <span className="text-sm font-bold text-nq-text">
                      {formatInteger(cohorts?.under_45?.clicks)}
                    </span>
                    <span className="text-[12px] text-nq-subtle block">
                      Share: {formatPercent(cohorts?.under_45?.click_share)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">CTR</span>
                    <span className="text-sm font-semibold text-nq-text">
                      {formatPercent(cohorts?.under_45?.ctr)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">CPC</span>
                    <span className="text-sm font-semibold text-nq-text">
                      {formatCPC(cohorts?.under_45?.cpc)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 45+ */}
              <div className="rounded-lg bg-nq-bg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-nq-line pb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
                    <h3 className="text-sm font-bold text-nq-text">
                      Público 45+ anos
                    </h3>
                  </div>
                  <span className="text-[12px] text-nq-muted">45 a 65+ anos</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-nq-muted block text-[12px]">Investimento</span>
                    <span className="text-sm font-bold text-nq-text">
                      {formatBRL(cohorts?.age_45_plus?.spend)}
                    </span>
                    <span className="text-[12px] text-nq-subtle block">
                      Share: {formatPercent(hypothesis?.spend_share_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">Cliques</span>
                    <span className="text-sm font-bold text-nq-text">
                      {formatInteger(cohorts?.age_45_plus?.clicks)}
                    </span>
                    <span className="text-[12px] text-nq-subtle block">
                      Share: {formatPercent(hypothesis?.click_share_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">CTR</span>
                    <span className="text-sm font-semibold text-nq-text">
                      {formatPercent(hypothesis?.ctr_45_plus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-nq-muted block text-[12px]">CPC</span>
                    <span className="text-sm font-semibold text-nq-text">
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
          <div className="rounded-nq bg-nq-surface p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-nq-line pb-4">
              <div>
                <h3 className="text-base font-bold text-nq-text flex items-center gap-2">
                  <Layers className="h-5 w-5 text-nq-muted" />
                  Distribuição por Faixa Etária
                </h3>
                <p className="text-xs text-nq-muted mt-0.5">
                  Métricas agregadas detalhadas por bucket etário da Meta
                </p>
              </div>
              <div className="text-xs text-nq-muted">
                Total de Cliques: {formatInteger(summary?.total_clicks)}
              </div>
            </div>

            {/* Visual Bars & Table (NORQVA-0086: no celular vira lista) */}
            {isMobile ? (
              <ul className="divide-y divide-nq-line/70 -mx-1" data-testid="age-mobile-list">
                {byAge.map(item => {
                  const is45Plus = ['45-54', '55-64', '65+'].includes(item.age_group);
                  const isUnknown = item.age_group === 'unknown';
                  const badge = formatConfidenceBadge(item.media_sample_confidence);
                  return (
                    <li key={item.age_group} className="px-1 py-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-nq-body font-semibold text-nq-text">{formatAgeGroupLabel(item.age_group)}</span>
                        <span className="text-nq-body font-semibold tabular-nums text-nq-text">{formatPercent(item.click_share)}</span>
                      </div>
                      <div className="h-1.5 bg-nq-raised rounded-full overflow-hidden">
                        <div
                          style={{ width: `${item.click_share || 0}%` }}
                          className={`h-full rounded-full ${isUnknown ? 'bg-slate-500' : is45Plus ? 'bg-purple-500' : 'bg-nq-info'}`}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nq-caption text-nq-muted tabular-nums">
                        <span>{formatInteger(item.clicks)} cliques</span>
                        <span>CTR {formatPercent(item.ctr)}</span>
                        <span>CPC {formatCPC(item.cpc)}</span>
                        <span>{formatBRL(item.spend)}</span>
                        <span className={`${badge.textClass}`}>{badge.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-nq-line text-nq-muted font-semibold text-[12px]">
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
                <tbody className="divide-y divide-nq-line/60">
                  {byAge.map((item) => {
                    const is45Plus = ['45-54', '55-64', '65+'].includes(item.age_group);
                    const isUnknown = item.age_group === 'unknown';
                    const badge = formatConfidenceBadge(item.media_sample_confidence);

                    return (
                      <tr key={item.age_group} className="hover:bg-nq-raised transition">
                        <td className="py-3.5 px-3 font-semibold text-nq-text whitespace-nowrap">
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
                            <div className="h-2 flex-1 bg-nq-raised rounded-full overflow-hidden">
                              <div
                                style={{ width: `${item.click_share || 0}%` }}
                                className={`h-full rounded-full ${
                                  isUnknown ? 'bg-slate-500' : is45Plus ? 'bg-purple-500' : 'bg-nq-info'
                                }`}
                              />
                            </div>
                            <span className="text-[12px] text-nq-text w-12 text-right">
                              {formatPercent(item.click_share)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right text-nq-text">
                          {formatBRL(item.spend)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-nq-text">
                          {formatInteger(item.impressions)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-bold text-nq-text">
                          {formatInteger(item.clicks)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-nq-text">
                          {formatPercent(item.ctr)}
                        </td>
                        <td className="py-3.5 px-3 text-right text-nq-text">
                          {formatCPC(item.cpc)}
                        </td>
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[12px] font-semibold border ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
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
            )}
          </div>

          {/* ============================================================= */}
          {/* C. By Creative / Ad Breakdown ("Quem cada criativo está atraindo?") */}
          {/* ============================================================= */}
          <div className="rounded-nq bg-nq-surface p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-nq-line pb-4">
              <div>
                <span className="text-[12px] text-nq-muted font-bold">
                  Comportamento por Criativo
                </span>
                <h3 className="text-base font-bold text-nq-text flex items-center gap-2 mt-0.5">
                  <Sparkles className="h-5 w-5 text-nq-muted" />
                  Quem cada criativo está atraindo?
                </h3>
              </div>
              <div className="text-xs text-nq-muted">
                {byAd.length} {byAd.length === 1 ? 'anúncio analisado' : 'anúncios analisados'}
              </div>
            </div>

            {byAd.length === 0 ? (
              <div className="text-center py-8 text-xs text-nq-muted">
                Nenhum anúncio com dados demográficos no período selecionado.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {byAd.map((ad) => {
                  const badge = formatConfidenceBadge(ad.media_sample_confidence);

                  return (
                    <div
                      key={ad.ad_id || ad.meta_ad_id}
                      className="rounded-lg bg-nq-bg p-5 space-y-4"
                    >
                      {/* Header */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-nq-text leading-tight break-all">
                            {ad.ad_name}
                          </h4>
                          <span className="text-[12px] text-nq-subtle block mt-0.5">
                            ID: {ad.meta_ad_id}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[12px] font-semibold border shrink-0 ${badge.bgClass} ${badge.textClass} ${badge.borderClass}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {/* Click Share Progress */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-nq-muted">Share 45+:</span>
                          <span className="text-nq-muted font-bold">
                            {formatPercent(ad.click_share_45_plus)}
                          </span>
                        </div>
                        <div className="h-2.5 w-full bg-nq-raised rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${ad.click_share_45_plus || 0}%` }}
                            className="bg-purple-500"
                            title={`45+: ${formatPercent(ad.click_share_45_plus)}`}
                          />
                          <div
                            style={{ width: `${ad.under_45?.click_share || 0}%` }}
                            className="bg-nq-info"
                            title={`<45: ${formatPercent(ad.under_45?.click_share)}`}
                          />
                          <div
                            style={{ width: `${ad.unknown?.click_share || 0}%` }}
                            className="bg-slate-600"
                            title={`Não identificado: ${formatPercent(ad.unknown?.click_share)}`}
                          />
                        </div>
                        <div className="flex justify-between text-[12px] text-nq-subtle">
                          <span>&lt;45: {formatPercent(ad.under_45?.click_share)}</span>
                          <span>Não ident: {formatPercent(ad.unknown?.click_share)}</span>
                        </div>
                      </div>

                      {/* Metrics Comparison Grid */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-nq-line text-xs">
                        <div className="rounded-nq bg-nq-surface p-2.5">
                          <span className="text-[12px] text-nq-muted font-semibold block">
                            Público 45+
                          </span>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-nq-muted text-[12px]">CPC:</span>
                            <span className="font-bold text-nq-text">
                              {formatCPC(ad.cpc_45_plus)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-[12px] text-nq-muted">
                            <span>CTR:</span>
                            <span className="text-nq-text">
                              {formatPercent(ad.age_45_plus?.ctr)}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-nq bg-nq-surface p-2.5">
                          <span className="text-[12px] text-nq-info font-semibold block">
                            Público &lt;45
                          </span>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-nq-muted text-[12px]">CPC:</span>
                            <span className="font-bold text-nq-text">
                              {formatCPC(ad.cpc_under_45)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between text-[12px] text-nq-muted">
                            <span>CTR:</span>
                            <span className="text-nq-text">
                              {formatPercent(ad.under_45?.ctr)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Totals Footer */}
                      <div className="flex items-center justify-between text-[12px] text-nq-muted pt-1">
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
          <div className="rounded-nq bg-nq-surface p-4 md:p-6 space-y-6">
            <div className="border-b border-nq-line pb-4">
              <h3 className="text-base font-bold text-nq-text flex items-center gap-2">
                <PieIcon className="h-5 w-5 text-nq-muted" />
                Distribuição por Gênero
              </h3>
              <p className="text-xs text-nq-muted mt-0.5">
                Métricas de entrega de mídia distribuídas por gênero
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {byGender.map((g) => (
                <div
                  key={g.gender}
                  className="rounded-lg bg-nq-bg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-nq-text">
                      {formatGenderLabel(g.gender)}
                    </span>
                    <span className="text-xs font-bold text-nq-muted">
                      {formatPercent(g.click_share)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-nq-subtle block text-[12px]">Investimento</span>
                      <span className="text-nq-text">{formatBRL(g.spend)}</span>
                    </div>
                    <div>
                      <span className="text-nq-subtle block text-[12px]">Cliques</span>
                      <span className="text-nq-text">{formatInteger(g.clicks)}</span>
                    </div>
                    <div>
                      <span className="text-nq-subtle block text-[12px]">CTR</span>
                      <span className="text-nq-text">{formatPercent(g.ctr)}</span>
                    </div>
                    <div>
                      <span className="text-nq-subtle block text-[12px]">CPC</span>
                      <span className="text-nq-text">{formatCPC(g.cpc)}</span>
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
