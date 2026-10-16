import React, { useState, useEffect, useCallback } from 'react';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
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
import { useIsMobile } from '../../components/ui/premium';

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
        badgeClass: 'bg-nq-positive/10 text-nq-positive-text border border-nq-positive/40'
      };
    case 'LEARNING':
      return {
        label: 'Aprendendo',
        badgeClass: 'bg-nq-info/10 text-nq-info border border-nq-info/40'
      };
    case 'OBSERVING':
      return {
        label: 'Observando',
        badgeClass: 'bg-nq-attention/10 text-nq-attention border border-nq-attention/40'
      };
    default:
      return {
        label: 'Dados insuficientes',
        badgeClass: 'bg-nq-surface text-nq-muted border border-nq-line'
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
  const isMobile = useIsMobile();
  const [data, setData] = useState<CreativePerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
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
      const params = new URLSearchParams(periodQs);
      params.set('mode', mode);

      const res = await apiFetchRef.current(`/intelligence/creative-performance?${params.toString()}`);
      if (res && res.summary) {
        setData(res);
      } else {
        setData(null);
      }
    } catch (err: any) {
      const errorMsg = 'Não foi possível carregar os dados de performance.';
      setError(errorMsg);
      showErrorRef.current(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [isDemoView, periodQs]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Safe accessor shortcuts
  const summary = data?.summary;
  const creatives = data?.creatives || [];
  const unattributed = data?.unattributed;
  const dataFreshness = data?.dataFreshness;

  return (
    <div className="space-y-6 text-sm">
      {/* ----------------------------------------------------------------- */}
      {/* HEADER & CONTROLS */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-nq-section font-semibold text-nq-text">Performance de criativos</h2>
          <p className="mt-1 text-nq-aux text-nq-muted">Compare investimento, tráfego, conversões e receita por anúncio.</p>
          <p className="mt-1 flex items-center gap-1.5 text-nq-caption text-nq-subtle">
            {dataFreshness?.meta_sync_status === 'SUCCESS' && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-nq-positive" />}
            {dataFreshness?.meta_sync_status === 'FAILED' && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-nq-critical" />}
            Última leitura da Meta: {formatDateTimeBR(dataFreshness?.last_meta_sync)}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full bg-nq-surface text-nq-muted active:bg-nq-raised disabled:opacity-50"
          title="Atualizar dados"
          aria-label="Atualizar dados"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* DATA FRESHNESS ALERT (IF FAILED) */}
      {/* ----------------------------------------------------------------- */}
      {dataFreshness?.meta_sync_status === 'FAILED' && (
        <div className="p-3.5 rounded-lg bg-nq-attention/10 border border-nq-attention/40 text-nq-attention text-xs flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-nq-attention" />
          <span>
            <strong>Aviso de Sincronização:</strong> O último ciclo de sincronização com a Meta falhou. Os dados exibidos correspondem à última captura válida ({formatDateTimeBR(dataFreshness?.last_meta_sync)}).
          </span>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* ERROR STATE */}
      {/* ----------------------------------------------------------------- */}
      {error && !loading && (
        <div className="p-8 rounded-lg bg-nq-critical/10 border border-nq-critical/40 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-nq-critical-text mx-auto" />
          <p className="text-sm font-semibold text-nq-critical-text">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-nq-critical/20 border border-nq-critical/40 text-nq-critical-text hover:bg-nq-critical/30 rounded-full text-nq-aux font-bold transition min-h-[44px]"
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
              <div key={i} className="h-20 bg-nq-surface rounded-nq" />
            ))}
          </div>
          <div className="h-28 bg-nq-surface rounded-nq" />
          <div className="h-64 bg-nq-surface rounded-nq" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* EMPTY STATE */}
      {/* ----------------------------------------------------------------- */}
      {!loading && !error && creatives.length === 0 && (
        <div className="p-12 rounded-nq bg-nq-surface text-center text-nq-muted space-y-2">
          <Info className="h-8 w-8 text-nq-subtle mx-auto" />
          <p className="text-sm font-semibold">Não há dados suficientes para este período.</p>
          <p className="text-xs text-nq-subtle">
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
            <div className="p-3.5 rounded-nq bg-nq-surface space-y-1">
              <div className="text-[12px] text-nq-muted flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-nq-positive-text" /> Investimento
              </div>
              <div className="text-lg font-bold text-nq-text">
                {formatBRL(summary?.total_spend)}
              </div>
            </div>

            {/* Card 2: Receita */}
            <div className="p-3.5 rounded-nq bg-nq-surface space-y-1">
              <div className="text-[12px] text-nq-muted flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-nq-positive-text" /> Receita
              </div>
              <div className="text-lg font-bold text-nq-positive-text">
                {formatBRL(summary?.total_revenue)}
              </div>
            </div>

            {/* Card 3: Vendas */}
            <div className="p-3.5 rounded-nq bg-nq-surface space-y-1">
              <div className="text-[12px] text-nq-muted flex items-center gap-1">
                <ShoppingCart className="h-3 w-3 text-nq-info" /> Vendas
              </div>
              <div className="text-lg font-bold text-nq-text">
                {formatInteger(summary?.total_paid_orders)}
              </div>
            </div>

            {/* Card 4: CAC Médio (STRICT NULL DISPLAY: "—") */}
            <div className="p-3.5 rounded-nq bg-nq-surface space-y-1">
              <div className="text-[12px] text-nq-muted">CAC médio</div>
              <div className="text-lg font-bold text-nq-text">
                {formatCAC(summary?.blended_cac)}
              </div>
            </div>

            {/* Card 5: ROAS */}
            <div className="col-span-2 md:col-span-1 p-3.5 rounded-nq bg-nq-surface space-y-1">
              <div className="text-[12px] text-nq-muted">ROAS</div>
              <div className="text-lg font-bold text-nq-positive-text">
                {formatROAS(summary?.blended_roas)}
              </div>
            </div>
          </div>

          {/* 2. COMPACT FUNNEL SECTION */}
          <div className="p-4 rounded-nq bg-nq-surface space-y-3">
            <div className="text-xs font-bold text-nq-text flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-nq-positive-text" />
              Funil do período
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Step 1: Impressões */}
              <div className="p-3 rounded bg-nq-bg text-center space-y-0.5">
                <div className="text-[12px] text-nq-muted">Impressões</div>
                <div className="text-sm font-bold text-nq-text">
                  {formatInteger(summary?.total_impressions)}
                </div>
              </div>

              {/* Step 2: Cliques */}
              <div className="p-3 rounded bg-nq-bg text-center space-y-0.5">
                <div className="text-[12px] text-nq-muted">Cliques</div>
                <div className="text-sm font-bold text-nq-text">
                  {formatInteger(summary?.total_clicks)}
                </div>
              </div>

              {/* Step 3: Visualizações da Oferta */}
              <div className="p-3 rounded bg-nq-bg text-center space-y-0.5">
                <div className="text-[12px] text-nq-muted">Visitas à oferta</div>
                <div className="text-sm font-bold text-nq-text">
                  {formatInteger(
                    creatives.reduce((acc, c) => acc + (c.offer_views || 0), 0)
                  )}
                </div>
              </div>

              {/* Step 4: Checkouts */}
              <div className="p-3 rounded bg-nq-bg text-center space-y-0.5">
                <div className="text-[12px] text-nq-muted">Checkouts</div>
                <div className="text-sm font-bold text-nq-text">
                  {formatInteger(summary?.total_checkouts)}
                </div>
              </div>

              {/* Step 5: Compras */}
              <div className="col-span-2 sm:col-span-1 p-3 rounded bg-nq-bg text-center space-y-0.5">
                <div className="text-[12px] text-nq-muted">Compras</div>
                <div className="text-sm font-bold text-nq-positive-text">
                  {formatInteger(summary?.total_paid_orders)}
                </div>
              </div>
            </div>
          </div>

          {/* 3. CREATIVE COMPARISON TABLE (13 COLUMNS) */}
          <div className="rounded-nq overflow-hidden bg-nq-surface">
            <div className="p-3.5 bg-nq-surface border-b border-nq-line flex items-center justify-between">
              <div className="text-xs font-bold text-nq-text">
                Comparação por anúncio
              </div>
              <div className="text-[12px] text-nq-muted">
                {creatives.length} {creatives.length === 1 ? 'anúncio' : 'anúncios'} no período
              </div>
            </div>

            {isMobile ? (
              <ul className="divide-y divide-nq-line/70" data-testid="creative-mobile-list">
                {creatives.map(c => {
                  const badge = getConfidenceBadge(c.confidence);
                  const reasonText = getConfidenceReasonText(c.confidence_reason);
                  return (
                    <li key={c.ad_id} className="px-4 py-4 space-y-3">
                      <div className="min-w-0">
                        <div className="text-nq-body font-semibold text-nq-text break-words">{getShortAdName(c.ad_name)}</div>
                        <div className="text-nq-caption text-nq-subtle break-words">{c.ad_name}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[12px] font-bold ${badge.badgeClass}`}>{badge.label}</span>
                          <span className="text-nq-caption text-nq-muted">{reasonText}</span>
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {([
                          ['Investimento', formatBRL(c.spend), ''],
                          ['Receita', formatBRL(c.gross_revenue), 'text-nq-positive-text'],
                          ['Vendas', formatInteger(c.paid_orders), ''],
                          ['ROAS', formatROAS(c.roas), ''],
                          ['CAC', formatCAC(c.cac), ''],
                          ['CPC', formatBRL(c.cpc), ''],
                          ['Cliques (CTR)', `${formatInteger(c.clicks)} (${formatPercent(c.ctr)})`, ''],
                          ['Impressões', formatInteger(c.impressions), ''],
                          ['Visitas', formatInteger(c.offer_views), ''],
                          ['Checkouts', formatInteger(c.checkout_started), '']
                        ] as const).map(([k, v, cls]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-nq-caption text-nq-muted">{k}</dt>
                            <dd className={`text-nq-body font-semibold tabular-nums ${cls || 'text-nq-text'}`}>{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            ) : (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap min-w-[1000px]">
                <thead className="bg-nq-surface text-nq-muted border-b border-nq-line">
                  <tr>
                    <th className="p-3 sticky left-0 bg-nq-surface z-20 border-r border-nq-line">Criativo</th>
                    <th className="p-3">Confiança</th>
                    <th className="p-3 text-right">Investimento</th>
                    <th className="p-3 text-right">Impressões</th>
                    <th className="p-3 text-right">Cliques</th>
                    <th className="p-3 text-right">CTR</th>
                    <th className="p-3 text-right">CPC</th>
                    <th className="p-3 text-right">Visitas</th>
                    <th className="p-3 text-right">Checkouts</th>
                    <th className="p-3 text-right">Vendas</th>
                    <th className="p-3 text-right">Receita</th>
                    <th className="p-3 text-right">CAC</th>
                    <th className="p-3 text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nq-line/60">
                  {creatives.map((c) => {
                    const badge = getConfidenceBadge(c.confidence);
                    const reasonText = getConfidenceReasonText(c.confidence_reason);
                    const shortName = getShortAdName(c.ad_name);

                    return (
                      <tr key={c.ad_id} className="hover:bg-nq-raised transition">
                        {/* Col 1: Criativo (Sticky First Column) */}
                        <td className="p-3 sticky left-0 bg-nq-surface z-10 border-r border-nq-line">
                          <div className="font-bold text-nq-text" title={c.ad_name}>
                            {shortName}
                          </div>
                          <div className="text-[12px] text-nq-subtle truncate max-w-[140px] sm:max-w-[180px]" title={c.ad_id}>
                            {c.ad_name}
                          </div>
                        </td>

                        {/* Col 2: Status de Confiança */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5" title={reasonText}>
                            <span className={`px-2 py-0.5 rounded text-[12px] font-bold ${badge.badgeClass}`}>
                              {badge.label}
                            </span>
                            <HelpCircle className="h-3 w-3 text-nq-subtle cursor-help" />
                          </div>
                        </td>

                        {/* Col 3: Investimento */}
                        <td className="p-3 text-right text-nq-text">
                          {formatBRL(c.spend)}
                        </td>

                        {/* Col 4: Impressões */}
                        <td className="p-3 text-right text-nq-muted">
                          {formatInteger(c.impressions)}
                        </td>

                        {/* Col 5: Cliques */}
                        <td className="p-3 text-right text-nq-text">
                          {formatInteger(c.clicks)}
                        </td>

                        {/* Col 6: CTR */}
                        <td className="p-3 text-right text-nq-text">
                          {formatPercent(c.ctr)}
                        </td>

                        {/* Col 7: CPC */}
                        <td className="p-3 text-right text-nq-text">
                          {formatBRL(c.cpc)}
                        </td>

                        {/* Col 8: Visitas / Oferta */}
                        <td className="p-3 text-right text-nq-text">
                          {formatInteger(c.offer_views)}
                        </td>

                        {/* Col 9: Checkouts */}
                        <td className="p-3 text-right text-nq-text">
                          {formatInteger(c.checkout_started)}
                        </td>

                        {/* Col 10: Vendas */}
                        <td className="p-3 text-right font-bold text-nq-text">
                          {formatInteger(c.paid_orders)}
                        </td>

                        {/* Col 11: Receita */}
                        <td className="p-3 text-right font-bold text-nq-positive-text">
                          {formatBRL(c.gross_revenue)}
                        </td>

                        {/* Col 12: CAC (Strict null: "—") */}
                        <td className="p-3 text-right text-nq-text">
                          {formatCAC(c.cac)}
                        </td>

                        {/* Col 13: ROAS */}
                        <td className="p-3 text-right font-bold text-nq-positive-text">
                          {formatROAS(c.roas)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {/* 4. UNATTRIBUTED REVENUE SECTION */}
          {unattributed && (
            <div className="p-4 rounded-nq bg-nq-surface flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-nq-text flex items-center gap-2">
                  <Info className="h-4 w-4 text-nq-muted" />
                  Receita sem atribuição
                </div>
                <p className="text-xs text-nq-muted max-w-xl">
                  Vendas confirmadas cuja origem não pôde ser associada deterministicamente a um anúncio.
                </p>
              </div>

              <div className="flex items-center gap-6 text-xs shrink-0">
                <div>
                  <div className="text-[12px] text-nq-subtle">Pedidos não atribuídos</div>
                  <div className="text-base font-bold text-nq-text">
                    {formatInteger(unattributed.unattributed_paid_orders)}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-nq-subtle">Receita não atribuída</div>
                  <div className="text-base font-bold text-nq-positive-text">
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
