import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, RefreshCw, History, Trophy, TrendingUp, FlaskConical, XCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useGlobalPeriod, periodQuery, periodLabel } from '../../lib/globalPeriod';
import { MarketEuPanel } from './MarketEuPanel';
import { ShortlistPanel } from './ShortlistPanel';
import { useIsMobile } from '../../components/ui/premium';

// NORQVA-0017 (fase 1): Base de campanhas — ranking of niches, products, campaigns, ad sets and ads
// of our Meta account, with score (0–100), confidence and classification (BB-B01 test rules).

export type Level = 'niche' | 'product' | 'campaign' | 'adset' | 'ad';
export type IntelClass = 'VENCEDOR' | 'PROMISSOR' | 'TESTANDO' | 'PERDEDOR' | 'SEM_DADOS';

export interface IntelRow {
  key: string;
  level: Level;
  name: string;
  meta_id: string | null;
  status: string | null;
  campaign_name: string | null;
  adset_name: string | null;
  product_name: string | null;
  niche: string | null;
  ads_count: number;
  winners_count: number;
  products?: string[];
  creative?: { title: string | null; body: string | null; cta: string | null; thumbnail_url: string | null; video_id: string | null } | null;
  targeting?: any;
  totals: Record<string, number>;
  metrics: Record<string, number | null>;
  score: number;
  confidence: number;
  classification: IntelClass;
  reason: string;
}

export interface CampaignBase {
  level: Level;
  rows: IntelRow[];
  summary: { entities: number; spend: number; sales: number; revenue: number; roas: number | null; by_class: Record<IntelClass, number> };
  data: { ads_with_data: number; latest_insight_date: string | null; unattributed_sales: number };
  /** NORQVA-0029: versão dos critérios usada nas classes */
  criteria?: { version: number | null; validated: boolean };
}

export const LEVELS: { id: Level; label: string }[] = [
  { id: 'niche', label: 'Nichos' },
  { id: 'product', label: 'Produtos' },
  { id: 'campaign', label: 'Campanhas' },
  { id: 'adset', label: 'Conjuntos' },
  { id: 'ad', label: 'Anúncios' }
];

export const CLASS_META: Record<IntelClass, { label: string; cls: string; icon: React.ElementType }> = {
  VENCEDOR: { label: 'Vencedor', cls: 'bg-nq-positive/15 text-nq-positive-text border-nq-positive/40', icon: Trophy },
  PROMISSOR: { label: 'Promissor', cls: 'bg-nq-info/15 text-nq-info border-nq-info/40', icon: TrendingUp },
  TESTANDO: { label: 'Testando', cls: 'bg-nq-attention/15 text-nq-attention border-nq-attention/40', icon: FlaskConical },
  PERDEDOR: { label: 'Perdedor', cls: 'bg-nq-critical/15 text-nq-critical-text border-nq-critical/40', icon: XCircle },
  SEM_DADOS: { label: 'Sem dados', cls: 'bg-nq-raised text-nq-muted border-nq-line', icon: Clock }
};

export const brl = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const int = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('pt-BR'));

export const ClassBadge: React.FC<{ c: IntelClass }> = ({ c }) => {
  const m = CLASS_META[c];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[12px] font-semibold ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
};

export const ScoreBar: React.FC<{ score: number; confidence: number }> = ({ score, confidence }) => (
  <span className="block min-w-[88px]" title={`Confiança ${Math.round(confidence * 100)}%`}>
    <span className="flex items-baseline justify-between gap-2 text-xs">
      <span className="font-bold text-nq-text">{score}</span>
      <span className="text-[12px] text-nq-subtle">conf. {Math.round(confidence * 100)}%</span>
    </span>
    <span className="mt-1 block h-1.5 rounded-full bg-nq-raised overflow-hidden">
      <span className="block h-1.5 rounded-full bg-nq-positive" style={{ width: `${Math.max(2, Math.min(100, score))}%`, opacity: 0.35 + 0.65 * confidence }} />
    </span>
  </span>
);

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

export const CampaignBaseView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError, showSuccess }) => {
  const { globalPeriod } = useGlobalPeriod();
  const mode = isDemoView ? 'demo' : 'real';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isMobile = useIsMobile();
  const [source, setSource] = useState<'account' | 'eu'>('account');
  const [level, setLevel] = useState<Level>('campaign');
  const [data, setData] = useState<CampaignBase | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<IntelClass | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [backfill, setBackfill] = useState<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/intelligence/campaign-base?mode=${mode}&level=${level}&${periodQuery(globalPeriod)}`);
      setData(r);
    } catch (e: any) {
      showError(e?.message || 'Falha ao carregar a base de campanhas.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, mode, level, globalPeriod]);

  useEffect(() => {
    load();
  }, [load]);

  const pollBackfill = useCallback(async () => {
    try {
      const s = await apiFetch('/meta/backfill/status');
      setBackfill(s);
      if (!s?.running && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        load();
      }
    } catch {
      /* ignore */
    }
  }, [apiFetch, load]);

  useEffect(() => {
    if (!isAdmin || isDemoView) return;
    pollBackfill();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isAdmin, isDemoView]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await apiFetch(`/meta/sync?mode=${mode}`, { method: 'POST' });
      showSuccess('Dados da Meta atualizados.');
      load();
    } catch (e: any) {
      showError(e?.message || 'Falha ao sincronizar com a Meta.');
    } finally {
      setSyncing(false);
    }
  };

  const startBackfill = async () => {
    try {
      const r = await apiFetch('/meta/backfill', { method: 'POST', body: JSON.stringify({ days: 730 }), headers: { 'Content-Type': 'application/json' } });
      setBackfill(r?.status || null);
      showSuccess('Importação do histórico iniciada (até 2 anos, em janelas de 30 dias).');
      if (!pollRef.current) pollRef.current = setInterval(pollBackfill, 5000);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível iniciar a importação.');
    }
  };

  const canCreateOpp = isAdmin || currentUser?.role === 'INTELLIGENCE';
  const createOpportunity = async (r: IntelRow) => {
    try {
      const o = await apiFetch(`/ai-team/opportunities?mode=${mode}`, {
        method: 'POST',
        body: JSON.stringify({ source: 'ACCOUNT', source_level: r.level, source_ref: r.key }),
        headers: { 'Content-Type': 'application/json' }
      });
      showSuccess(`Oportunidade ${o?.human_id || ''} criada. Veja em "Time de IAs".`);
    } catch (e: any) {
      showError(e?.message || 'Não foi possível criar a oportunidade.');
    }
  };

  const rows = useMemo(() => (data?.rows || []).filter(r => filter === 'ALL' || r.classification === filter), [data, filter]);

  return (
    <div className="space-y-5" data-testid="campaign-base-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-nq-section font-semibold text-nq-text">Base de campanhas</h2>
          <p className="mt-1 max-w-3xl text-nq-aux text-nq-muted">
            Ranking dos nichos, produtos, campanhas, conjuntos e anúncios da nossa conta Meta. Vendas = pedidos pagos do NORQVA
            atribuídos ao anúncio; compras da Meta aparecem só como referência. Período: {periodLabel(globalPeriod) || 'todo o histórico'}.
          </p>
          {data?.criteria && (
            <p className={`mt-1 text-[12px] ${data.criteria.validated ? 'text-nq-subtle' : 'text-nq-attention'}`} data-testid="base-criteria">
              {data.criteria.validated
                ? `Classes pelos critérios v${data.criteria.version}, validados por você.`
                : data.criteria.version
                  ? `Classes pelos critérios v${data.criteria.version}; os textos mudaram e precisam de nova validação.`
                  : 'Classes pelos critérios de sempre, ainda não validados (aba Critérios).'}
            </p>
          )}
        </div>
        {isAdmin && !isDemoView && source === 'account' && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={syncNow} disabled={syncing} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-nq-surface px-4 text-nq-aux font-medium text-nq-text active:bg-nq-raised disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> Atualizar dados
            </button>
            <button onClick={startBackfill} disabled={!!backfill?.running} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-nq-positive px-4 text-nq-aux font-semibold text-nq-on-positive hover:brightness-110 disabled:opacity-50">
              <History className="h-3.5 w-3.5" /> Importar histórico
            </button>
          </div>
        )}
      </div>

      <div className="inline-flex rounded-full bg-nq-surface p-1 text-nq-aux" role="radiogroup" aria-label="Fonte dos dados">
        {([['account', 'Nossa conta Meta'], ['eu', 'Mercado europeu']] as const).map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={source === id}
            onClick={() => setSource(id)}
            className={`h-10 rounded-full px-4 font-medium transition-colors ${source === id ? 'bg-nq-text text-nq-bg' : 'text-nq-muted hover:text-nq-text'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === 'eu' ? (
        <MarketEuPanel isAdmin={isAdmin} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />
      ) : (
      <>
      {backfill?.running && (
        <div className="rounded-nq bg-nq-surface p-4 text-nq-aux text-nq-text" role="status">
          Importando histórico: {backfill.done + backfill.failed} de {backfill.windows} janelas
          {backfill.current ? ` (agora ${backfill.current.since} a ${backfill.current.until})` : ''}.
          <div className="mt-2 h-1.5 rounded-full bg-nq-raised overflow-hidden">
            <div className="h-1.5 rounded-full bg-nq-positive" style={{ width: `${backfill.windows ? ((backfill.done + backfill.failed) / backfill.windows) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {backfill && !backfill.running && backfill.finishedAt && (
        <div className="text-xs text-nq-subtle">
          Última importação: {backfill.done} janelas ok{backfill.failed ? `, ${backfill.failed} com falha (${backfill.lastError})` : ''}.
        </div>
      )}

      <ShortlistPanel
        mode={mode}
        periodQs={periodQuery(globalPeriod)}
        canSend={canCreateOpp}
        apiFetch={apiFetch}
        showError={showError}
        showSuccess={showSuccess}
      />

      <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="tablist" aria-label="Nível">
        {LEVELS.map(l => (
          <button
            key={l.id}
            role="tab"
            aria-selected={level === l.id}
            onClick={() => {
              setLevel(l.id);
              setOpen(null);
            }}
            className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${level === l.id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted hover:text-nq-text'}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Investido" value={brl(data.summary.spend)} />
          <Stat label="Vendas" value={String(data.summary.sales)} />
          <Stat label="Receita" value={brl(data.summary.revenue)} />
          <Stat label="ROAS" value={data.summary.roas === null ? '—' : data.summary.roas.toLocaleString('pt-BR')} />
          <Stat label="Anúncios com dados" value={String(data.data.ads_with_data)} hint={data.data.latest_insight_date ? `até ${data.data.latest_insight_date.split('-').reverse().join('/')}` : 'sem dados ainda'} />
        </div>
      )}

      {data && (
        <div className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar lg:flex-wrap">
          <FilterChip active={filter === 'ALL'} onClick={() => setFilter('ALL')} label={`Todos (${data.rows.length})`} />
          {(Object.keys(CLASS_META) as IntelClass[]).map(c => (
            <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)} label={`${CLASS_META[c].label} (${data.summary.by_class[c] || 0})`} />
          ))}
        </div>
      )}

      {isMobile ? (
        <div className="rounded-nq bg-nq-surface divide-y divide-nq-line/70 overflow-hidden" data-testid="campaign-base-list">
          {loading && <div className="px-4 py-6 text-center text-nq-aux text-nq-subtle">Carregando…</div>}
          {!loading && rows.length === 0 && (
            <div className="px-4 py-6 text-center text-nq-aux text-nq-subtle">
              Nada para mostrar neste período. {isAdmin && !isDemoView ? 'Use "Importar histórico" para trazer os dados da conta.' : ''}
            </div>
          )}
          {!loading &&
            rows.map((r, i) => (
              <div key={r.key}>
                <button
                  type="button"
                  className="w-full px-4 py-3.5 text-left active:bg-nq-raised min-h-[44px]"
                  aria-expanded={open === r.key}
                  onClick={() => setOpen(open === r.key ? null : r.key)}
                  data-testid="campaign-base-row"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-nq-body font-medium text-nq-text break-words">
                        <span className="text-nq-subtle">{i + 1}. </span>
                        {r.name}
                      </span>
                      <span className="block text-nq-caption text-nq-subtle break-words">
                        {[r.campaign_name, r.adset_name, r.product_name, level === 'niche' ? `${r.ads_count} anúncios` : null].filter(Boolean).join(' · ')}
                        {r.winners_count > 0 && level !== 'ad' ? ` · ${r.winners_count} vencedor(es)` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-nq-body font-semibold tabular-nums text-nq-text">{brl(r.totals.spend)}</span>
                      <span className="block text-nq-caption text-nq-muted">{r.totals.sales} vendas</span>
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <ClassBadge c={r.classification} />
                    <ScoreBar score={r.score} confidence={r.confidence} />
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-nq-caption text-nq-muted tabular-nums">
                    <span>CPA {brl(r.metrics.cpa)} / {brl(r.metrics.breakeven_cpa)}</span>
                    <span>ROAS {r.metrics.roas === null ? '—' : r.metrics.roas}</span>
                    <span>CTR {pct(r.metrics.ctr_link)}</span>
                    <span>Hook {pct(r.metrics.hook_rate)}</span>
                    <span>Hold {pct(r.metrics.hold_rate)}</span>
                    <span>{int(r.totals.landing_page_views)} visitas</span>
                  </span>
                </button>
                {open === r.key && (
                  <div className="px-4 pb-4 bg-nq-surface">
                    <RowDetail r={r} onCreateOpportunity={canCreateOpp ? () => createOpportunity(r) : undefined} />
                  </div>
                )}
              </div>
            ))}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-nq bg-nq-surface">
        <table className="w-full text-left text-nq-aux">
          <thead className="border-b border-nq-line text-nq-caption text-nq-muted">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{LEVELS.find(l => l.id === level)?.label.replace(/s$/, '')}</th>
              <th className="px-3 py-2">Classe</th>
              <th className="px-3 py-2">Pontuação</th>
              <th className="px-3 py-2 text-right">Investido</th>
              <th className="px-3 py-2 text-right">Vendas</th>
              <th className="px-3 py-2 text-right">CPA / equilíbrio</th>
              <th className="px-3 py-2 text-right">ROAS</th>
              <th className="px-3 py-2 text-right">CTR link</th>
              <th className="px-3 py-2 text-right">Hook</th>
              <th className="px-3 py-2 text-right">Hold</th>
              <th className="px-3 py-2 text-right">Visitas</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-nq-subtle">Carregando…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-nq-subtle">
                  Nada para mostrar neste período. {isAdmin && !isDemoView ? 'Use "Importar histórico" para trazer os dados da conta.' : ''}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r, i) => (
                <React.Fragment key={r.key}>
                  <tr className="cursor-pointer border-t border-nq-line/60 hover:bg-nq-raised" onClick={() => setOpen(open === r.key ? null : r.key)} data-testid="campaign-base-row">
                    <td className="px-3 py-2 text-nq-subtle">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 font-medium text-nq-text">
                        {open === r.key ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} {r.name}
                      </div>
                      <div className="text-[12px] text-nq-subtle">
                        {[r.campaign_name, r.adset_name, r.product_name, level === 'niche' ? `${r.ads_count} anúncios` : null].filter(Boolean).join(' · ')}
                        {r.winners_count > 0 && level !== 'ad' ? ` · ${r.winners_count} vencedor(es)` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2"><ClassBadge c={r.classification} /></td>
                    <td className="px-3 py-2"><ScoreBar score={r.score} confidence={r.confidence} /></td>
                    <td className="px-3 py-2 text-right">{brl(r.totals.spend)}</td>
                    <td className="px-3 py-2 text-right">{r.totals.sales}</td>
                    <td className="px-3 py-2 text-right">
                      {brl(r.metrics.cpa)} <span className="text-nq-subtle">/ {brl(r.metrics.breakeven_cpa)}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{r.metrics.roas === null ? '—' : r.metrics.roas}</td>
                    <td className="px-3 py-2 text-right">{pct(r.metrics.ctr_link)}</td>
                    <td className="px-3 py-2 text-right">{pct(r.metrics.hook_rate)}</td>
                    <td className="px-3 py-2 text-right">{pct(r.metrics.hold_rate)}</td>
                    <td className="px-3 py-2 text-right">{int(r.totals.landing_page_views)}</td>
                  </tr>
                  {open === r.key && (
                    <tr className="border-t border-nq-line/60 bg-nq-raised/40">
                      <td colSpan={12} className="px-4 py-3">
                        <RowDetail r={r} onCreateOpportunity={canCreateOpp ? () => createOpportunity(r) : undefined} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
          </tbody>
        </table>
      </div>
      )}
      {data && data.data.unattributed_sales > 0 && (
        <p className="text-[12px] text-nq-subtle">{data.data.unattributed_sales} venda(s) no período sem anúncio identificado (não entram no ranking).</p>
      )}
      </>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-nq bg-nq-surface p-4 min-w-0">
    <div className="text-nq-caption text-nq-muted">{label}</div>
    <div className="mt-1 text-[20px] leading-7 font-semibold tabular-nums text-nq-text truncate">{value}</div>
    {hint && <div className="text-[12px] text-nq-subtle">{hint}</div>}
  </div>
);

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button onClick={onClick} aria-pressed={active} className={`shrink-0 h-10 rounded-full px-4 text-nq-aux font-medium transition-colors ${active ? 'bg-nq-raised text-nq-text ring-1 ring-nq-line' : 'text-nq-muted hover:text-nq-text'}`}>
    {label}
  </button>
);

export const RowDetail: React.FC<{ r: IntelRow; onCreateOpportunity?: () => void }> = ({ r, onCreateOpportunity }) => {
  const t = r.totals;
  const m = r.metrics;
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="campaign-base-detail">
      <div className="space-y-1 text-xs text-nq-text md:col-span-2">
        <p className="text-sm text-nq-text">{r.reason}</p>
        {onCreateOpportunity && (
          <button onClick={onCreateOpportunity} className="mt-1 rounded-full bg-nq-raised px-4 min-h-[40px] text-nq-aux font-semibold text-nq-text hover:brightness-110 min-h-[44px]">
            Criar oportunidade para o time de IAs
          </button>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-2 sm:grid-cols-3">
          <span>Impressões: {int(t.impressions)}</span>
          <span>Alcance: {int(t.reach)}</span>
          <span>Frequência: {m.frequency ?? '—'}</span>
          <span>Cliques no link: {int(t.link_clicks)}</span>
          <span>CPC link: {brl(m.cpc_link)}</span>
          <span>CPM: {brl(m.cpm)}</span>
          <span>Visitas / clique: {pct(m.lpv_rate)}</span>
          <span>Checkouts (Meta): {int(t.initiate_checkouts)}</span>
          <span>Conversão: {pct(m.cvr)}</span>
          <span>Receita: {brl(t.revenue)}</span>
          <span>Compras (Meta): {int(t.meta_purchases)}</span>
          <span>Vídeo até o fim: {pct(m.completion_rate)}</span>
        </div>
        {r.products && r.products.length > 0 && <p className="pt-2 text-nq-muted">Produtos: {r.products.join(', ')}</p>}
        {r.targeting && (
          <p className="pt-2 text-nq-muted">
            Público: {r.targeting.age_min ?? '?'}–{r.targeting.age_max ?? '?'} anos · {(r.targeting.countries || []).join(', ') || '—'}
            {r.targeting.advantage_audience ? ' · Advantage+ público' : ''}
            {r.targeting.interests?.length ? ` · interesses: ${r.targeting.interests.join(', ')}` : ''}
          </p>
        )}
      </div>
      {r.creative && (
        <div className="flex gap-3 text-xs text-nq-text">
          {r.creative.thumbnail_url && <img src={r.creative.thumbnail_url} alt="" className="h-28 w-20 rounded object-cover" loading="lazy" />}
          <div className="min-w-0">
            {r.creative.title && <p className="font-semibold text-nq-text">{r.creative.title}</p>}
            {r.creative.body && <p className="mt-1 line-clamp-5 whitespace-pre-line text-nq-muted">{r.creative.body}</p>}
            {r.creative.cta && <p className="mt-1 text-[12px] text-nq-subtle">CTA: {r.creative.cta}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
