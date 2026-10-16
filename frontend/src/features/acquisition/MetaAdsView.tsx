import React, { useState, useEffect } from 'react';
import { useGlobalPeriod, periodQuery } from '../../lib/globalPeriod';
import {
  useMetaControl,
  MetaControlBanner,
  MetaControlActions,
  MetaControlDialog,
  MetaControlPendingAction
} from './MetaControl';
import {
  aggregateMetrics,
  MetricHeaderCells,
  MetricCells,
  ResultsSummary,
  AlertsPanel,
  AdAlert,
  PerfItem
} from './MetaResults';
import { LaunchPlansCard } from './LaunchPlansCard';
import { useIsMobile, StatusPill, Tone, brl as brlFmt, int as intFmt, multiple } from '../../components/ui/premium';
import { ExperimentGuardCard } from './ExperimentGuardCard';
import { 
  TrendingUp, 
  Layers, 
  Target, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  BarChart3,
  Sparkles
} from 'lucide-react';

interface MetaAdsViewProps {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: any;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  /** NORQVA-0028: dentro de uma campanha — mostra só os objetos desta campanha da Meta (ID da Meta) */
  scopeCampaignId?: string | null;
}

// Helper function to map Meta effective_status / status
export interface MetaStatusConfig {
  label: string;
  badgeClass: string;
}

export function getMetaDeliveryStatus(effectiveStatus?: string | null, configuredStatus?: string | null): MetaStatusConfig {
  const raw = (effectiveStatus || configuredStatus || '').toUpperCase();

  switch (raw) {
    case 'ACTIVE':
      return {
        label: 'VEICULANDO',
        badgeClass: 'bg-nq-positive/10 text-nq-positive-text border border-nq-positive/40'
      };
    case 'PENDING_START_TIME':
      return {
        label: 'PROGRAMADO',
        badgeClass: 'bg-nq-attention/10 text-nq-attention border border-nq-attention/40'
      };
    case 'IN_PROCESS':
      return {
        label: 'EM PROCESSAMENTO',
        badgeClass: 'bg-nq-attention/10 text-nq-attention border border-nq-attention/40'
      };
    case 'WITH_ISSUES':
      return {
        label: 'COM PROBLEMAS',
        badgeClass: 'bg-nq-attention/10 text-nq-attention border border-nq-attention/40'
      };
    case 'PAUSED':
      return {
        label: 'PAUSADO',
        badgeClass: 'bg-nq-raised text-nq-muted border border-nq-line'
      };
    case 'CAMPAIGN_PAUSED':
      return {
        label: 'PAUSADO P/ CAMPANHA',
        badgeClass: 'bg-nq-raised text-nq-muted border border-nq-line'
      };
    case 'ADSET_PAUSED':
      return {
        label: 'PAUSADO P/ CONJUNTO',
        badgeClass: 'bg-nq-raised text-nq-muted border border-nq-line'
      };
    case 'DISAPPROVED':
      return {
        label: 'REJEITADO',
        badgeClass: 'bg-nq-critical/10 text-nq-critical-text border border-nq-critical/40'
      };
    case 'ARCHIVED':
      return {
        label: 'ARQUIVADO',
        badgeClass: 'bg-nq-surface text-nq-subtle border border-nq-line'
      };
    case 'DELETED':
      return {
        label: 'EXCLUÍDO',
        badgeClass: 'bg-nq-surface text-nq-subtle border border-nq-line'
      };
    case 'COMPLETED':
      return {
        label: 'CONCLUÍDO',
        badgeClass: 'bg-nq-raised text-nq-positive-text border border-nq-line'
      };
    default:
      return {
        label: raw || 'DESCONHECIDO',
        badgeClass: 'bg-nq-raised text-nq-muted border border-nq-line'
      };
  }
}

export const MetaAdsView: React.FC<MetaAdsViewProps> = ({
  currentUser,
  isDemoView,
  apiFetch,
  showError,
  showSuccess,
  scopeCampaignId = null
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const scoped = !!scopeCampaignId;
  // NORQVA-0083: no celular, as tabelas largas viram lista (só um dos dois layouts é desenhado)
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'adsets' | 'ads' | 'insights'>('campaigns');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [adSets, setAdSets] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  // NORQVA-0006: campaign control (ADMIN)
  const control = useMetaControl({ apiFetch, currentUser, isDemoView, enabled: isAdmin });
  const [pendingControl, setPendingControl] = useState<MetaControlPendingAction | null>(null);
  const toBudget = (v: any) => (v === null || v === undefined || v === '' ? null : parseFloat(v));
  // NORQVA-0009: results per campaign / ad set / ad (Meta spend + NORQVA funnel) and ad alerts
  const [perf, setPerf] = useState<PerfItem[]>([]);
  const [alerts, setAlerts] = useState<AdAlert[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<any | null>(null);
  const [adsetFilter, setAdsetFilter] = useState<any | null>(null);
  const metricsFor = (pred: (p: PerfItem) => boolean) => aggregateMetrics(perf.filter(pred));
  const openAlertByAd = new Map(alerts.filter(a => a.status !== 'RESOLVED').map(a => [String(a.meta_ad_id), a]));

  const loadAlerts = async (scopeAds?: any[]) => {
    const mode = isDemoView ? 'demo' : 'real';
    try {
      const r = await apiFetch(`/alerts?mode=${mode}`, {}, mode, currentUser);
      let list: AdAlert[] = Array.isArray(r?.alerts) ? r.alerts : [];
      if (scopeCampaignId) {
        const adIds = new Set((scopeAds || ads).map((a: any) => String(a.meta_ad_id)));
        list = list.filter(a => adIds.has(String(a.meta_ad_id)));
      }
      setAlerts(list);
    } catch {
      setAlerts([]);
    }
  };

  const ackAlert = async (a: AdAlert) => {
    const mode = isDemoView ? 'demo' : 'real';
    try {
      await apiFetch(`/alerts/${a.id}/ack?mode=${mode}`, { method: 'POST' }, mode, currentUser);
      await loadAlerts();
    } catch (err: any) {
      showError(err.message || 'Falha ao marcar o alerta.');
    }
  };

  const renderStatusBadge = (item: { status?: string; effective_status?: string }) => {
    const deliveryStatus = getMetaDeliveryStatus(item.effective_status, item.status);
    const configured = item.status || '—';
    const effective = item.effective_status || item.status || '—';
    const tooltip = `Status configurado: ${configured} | Veiculação: ${effective}`;

    return (
      <div className="flex flex-col gap-0.5 items-start" title={tooltip}>
        <span className={`px-2 py-0.5 rounded text-[12px] font-bold ${deliveryStatus.badgeClass}`}>
          {deliveryStatus.label}
        </span>
        {item.status && item.effective_status && item.status !== item.effective_status && (
          <span className="text-[12px] text-nq-subtle">
            Admin: {item.status}
          </span>
        )}
      </div>
    );
  };

  // NORQVA-0004: insights follow the global period (campaign/ad lists are not dated)
  const { globalPeriod } = useGlobalPeriod();
  const periodQs = periodQuery(globalPeriod);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      
      // Load connection status (ADMIN only)
      if (isAdmin) {
        try {
          const statusRes = await apiFetch(`/meta/connection/status?mode=${mode}`, {}, mode, currentUser);
          setStatus(statusRes);
        } catch (e) {
          console.error('Status fetch error:', e);
        }
      }

      // Load campaigns, adsets, ads, insights
      const [cmpRes, setRes, adRes, insRes, perfRes] = await Promise.all([
        apiFetch(`/meta/campaigns?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/adsets?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/ads?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/insights?mode=${mode}&${periodQs}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/intelligence/creative-performance?mode=${mode}&${periodQs}`, {}, mode, currentUser).catch(() => null)
      ]);
      let allCampaigns: any[] = Array.isArray(cmpRes) ? cmpRes : [];
      let allSets: any[] = Array.isArray(setRes) ? setRes : [];
      let allAds: any[] = Array.isArray(adRes) ? adRes : [];
      let allInsights: any[] = Array.isArray(insRes) ? insRes : [];
      let allPerf: PerfItem[] = Array.isArray(perfRes?.creatives) ? perfRes.creatives : [];
      if (scopeCampaignId) {
        // NORQVA-0028: só a campanha aberta na tela Campanhas
        allCampaigns = allCampaigns.filter(c => String(c.meta_campaign_id) === String(scopeCampaignId));
        const cmpDbIds = new Set(allCampaigns.map(c => String(c.id)));
        allSets = allSets.filter(s => cmpDbIds.has(String(s.campaign_id)));
        const setIds = new Set(allSets.map(s => String(s.id)));
        allAds = allAds.filter(a => setIds.has(String(a.adset_id)));
        allInsights = allInsights.filter(i => cmpDbIds.has(String(i.campaign_id)));
        allPerf = allPerf.filter(p => String(p.campaign_id) === String(scopeCampaignId));
      }
      setPerf(allPerf);
      loadAlerts(allAds);

      setCampaigns(allCampaigns);
      setAdSets(allSets);
      setAds(allAds);
      setInsights(allInsights);
    } catch (err: any) {
      showError(err.message || 'Erro ao carregar dados de Meta Ads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [isDemoView, periodQs, scopeCampaignId]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      const res = await apiFetch(
        `/meta/sync?mode=${mode}`,
        { method: 'POST' },
        mode,
        currentUser
      );
      showSuccess(res.message || 'Sincronização concluída com sucesso!');
      await loadAllData();
    } catch (err: any) {
      showError(err.message || 'Falha ao sincronizar dados com a Meta.');
    } finally {
      setSyncing(false);
    }
  };

  // Aggregated KPIs from Insights
  const totalSpend = insights.reduce((acc, row) => acc + (parseFloat(row.spend) || 0), 0);
  const totalImpressions = insights.reduce((acc, row) => acc + (parseInt(row.impressions, 10) || 0), 0);
  const totalClicks = insights.reduce((acc, row) => acc + (parseInt(row.clicks, 10) || 0), 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // ---- NORQVA-0083: lista para celular (mesmos dados, filtros, ordem e ações das tabelas) ----
  const statusTone = (raw?: string): Tone => {
    const v = String(raw || '').toUpperCase();
    if (v === 'ACTIVE') return 'positive';
    if (['DISAPPROVED', 'WITH_ISSUES'].includes(v)) return 'critical';
    if (['PENDING_START_TIME', 'IN_PROCESS', 'PENDING_REVIEW'].includes(v)) return 'attention';
    return 'neutral';
  };
  const sentenceCase = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);
  const mobileItem = (opts: {
    key: string;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    item: { status?: string; effective_status?: string };
    budget?: string | null;
    m: ReturnType<typeof aggregateMetrics>;
    actions?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <div key={opts.key} className="px-4 py-4 space-y-3" data-testid="meta-mobile-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] leading-[22px] text-nq-text break-all">{opts.title}</div>
          {opts.subtitle && <div className="text-[12px] leading-4 text-nq-subtle break-all mt-0.5">{opts.subtitle}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className={`text-[15px] font-semibold tabular-nums ${opts.m.roas === null ? 'text-nq-muted' : opts.m.roas >= 1 ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>{multiple(opts.m.roas)}</div>
          <div className="text-[12px] text-nq-muted">ROAS</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusPill tone={statusTone(opts.item.effective_status || opts.item.status)}>
          {sentenceCase(getMetaDeliveryStatus(opts.item.effective_status, opts.item.status).label)}
        </StatusPill>
        {opts.budget && <span className="text-[12px] text-nq-muted tabular-nums">{opts.budget}/dia</span>}
        {opts.extra}
      </div>
      <div className="grid grid-cols-4 gap-2 text-[12px] leading-4">
        <div className="min-w-0"><div className="text-nq-muted">Investido</div><div className="mt-0.5 text-nq-text tabular-nums truncate">{brlFmt(opts.m.spend)}</div></div>
        <div className="min-w-0"><div className="text-nq-muted">Vendas</div><div className="mt-0.5 text-nq-text tabular-nums">{intFmt(opts.m.sales)}</div></div>
        <div className="min-w-0"><div className="text-nq-muted">CPA</div><div className="mt-0.5 text-nq-text tabular-nums truncate">{brlFmt(opts.m.cpa)}</div></div>
        <div className="min-w-0"><div className="text-nq-muted">Cliques</div><div className="mt-0.5 text-nq-text tabular-nums">{intFmt(opts.m.linkClicks)}</div></div>
      </div>
      {opts.actions}
    </div>
  );
  const mobileList = (rows: React.ReactNode[], empty: string) => (
    <div className="rounded-2xl bg-nq-surface overflow-hidden divide-y divide-nq-line/70" data-testid="meta-mobile-list">
      {rows.length === 0 ? <div className="p-6 text-center text-[13px] text-nq-muted">{empty}</div> : rows}
    </div>
  );
  const adsOfFilter = (a: any) => {
    if (adsetFilter) return String(a.adset_id) === String(adsetFilter.id);
    if (campaignFilter) {
      const setIds = new Set(adSets.filter(s => String(s.campaign_id) === String(campaignFilter.id)).map(s => String(s.id)));
      return setIds.has(String(a.adset_id));
    }
    return true;
  };
  const money2 = (v: any) => (v ? `R$ ${parseFloat(v).toFixed(2).replace('.', ',')}` : null);
  const mobileCampaigns = !isMobile ? null : mobileList(
    [...campaigns]
      .map(c => ({ c, m: metricsFor(p => String(p.campaign_id) === String(c.meta_campaign_id)) }))
      .sort((x, y) => y.m.spend - x.m.spend)
      .map(({ c, m }) =>
        mobileItem({
          key: String(c.id),
          title: (
            <button onClick={() => { setCampaignFilter(c); setAdsetFilter(null); setActiveTab('adsets'); }} className="text-left underline-offset-2 hover:underline">
              {c.name}
            </button>
          ),
          item: c,
          budget: money2(c.daily_budget),
          m,
          actions: isAdmin ? (
            <MetaControlActions
              status={control.status}
              onRequest={setPendingControl}
              target={{ entityType: 'campaign', id: c.meta_campaign_id, name: c.name, status: c.status, dailyBudget: toBudget(c.daily_budget) }}
            />
          ) : null
        })
      ),
    'Nenhuma campanha sincronizada.'
  );
  const mobileAdsets = !isMobile ? null : mobileList(
    adSets
      .filter(s => !campaignFilter || String(s.campaign_id) === String(campaignFilter.id))
      .map(s => ({ s, m: metricsFor(p => String(p.adset_id) === String(s.meta_adset_id)) }))
      .sort((x, y) => y.m.spend - x.m.spend)
      .map(({ s, m }) =>
        mobileItem({
          key: String(s.id),
          title: (
            <button onClick={() => { setAdsetFilter(s); setActiveTab('ads'); }} className="text-left underline-offset-2 hover:underline">
              {s.name}
            </button>
          ),
          subtitle: s.campaign_name || null,
          item: s,
          budget: money2(s.daily_budget),
          m,
          actions: isAdmin ? (
            <MetaControlActions
              status={control.status}
              onRequest={setPendingControl}
              target={{ entityType: 'adset', id: s.meta_adset_id, name: s.name, status: s.status, dailyBudget: toBudget(s.daily_budget) }}
            />
          ) : null
        })
      ),
    'Nenhum conjunto de anúncios sincronizado.'
  );
  const mobileAds = !isMobile ? null : mobileList(
    ads
      .filter(adsOfFilter)
      .map(a => ({ a, m: metricsFor(p => String(p.ad_id) === String(a.meta_ad_id)) }))
      .sort((x, y) => y.m.spend - x.m.spend)
      .map(({ a, m }) => {
        const alert = openAlertByAd.get(String(a.meta_ad_id));
        return mobileItem({
          key: String(a.id),
          title: a.name,
          subtitle: a.adset_name || null,
          item: a,
          m,
          extra: alert ? <span className="text-[12px] font-semibold text-nq-critical-text" data-testid="ad-alert-badge">Pausar recomendado</span> : null,
          actions: isAdmin ? (
            <MetaControlActions
              status={control.status}
              onRequest={setPendingControl}
              target={{ entityType: 'ad', id: a.meta_ad_id, name: a.name, status: a.status }}
            />
          ) : null
        });
      }),
    'Nenhum anúncio sincronizado.'
  );

  return (
    <div className="space-y-6 text-sm">
      {/* Header & Controls */}
      {!scoped && (
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-nq-text">
              Aquisição — Meta Ads
            </h2>
            {status?.apiVersion && (
              <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-nq-info/10 text-nq-info border border-nq-info/40">
                Graph API {status.apiVersion}
              </span>
            )}
          </div>
          <p className="text-xs text-nq-muted">
            Resultados por campanha, conjunto e anúncio no período: gasto da Meta + visitas, checkouts e vendas do NORQVA
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-nq-positive text-nq-on-positive font-bold rounded-md hover:brightness-110 disabled:opacity-50 transition text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
          )}
        </div>
      </div>

      )}

      {/* NORQVA-0019: campanhas criadas pausadas aguardando o SIM/NÃO do operador (na campanha, o quadro fica no topo da tela Campanhas) */}
      {!scoped && <LaunchPlansCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />}
      {!scoped && <ExperimentGuardCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />}

      {/* Governance banner: read-only for non-admins; control status for admins (NORQVA-0006) */}
      {isAdmin && control.status ? (
        <MetaControlBanner status={control.status} onRecheck={() => control.refresh(true)} />
      ) : (
        <div className="p-4 rounded-2xl bg-nq-attention/10 text-nq-attention text-[13px] leading-[18px] flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-nq-attention" />
          <span>
            <strong>Dados de mídia em modo somente leitura.</strong> Atribuição de vendas ainda não certificada (Phase A - Read-Only Ingestion).
          </span>
        </div>
      )}

      <MetaControlDialog
        action={pendingControl}
        status={control.status}
        isDemoView={isDemoView}
        currentUser={currentUser}
        apiFetch={apiFetch}
        onClose={() => setPendingControl(null)}
        onDone={(msg) => {
          setPendingControl(null);
          showSuccess(msg);
          loadAllData();
        }}
        onError={(msg) => showError(msg)}
        scopeCampaign={scopeCampaignId}
      />

      <AlertsPanel
        alerts={alerts.filter(a => a.status !== 'RESOLVED')}
        canPause={(a) => {
          const ad = ads.find(x => String(x.meta_ad_id) === String(a.meta_ad_id));
          return !!(isAdmin && control.status?.ready && ad && String(ad.status).toUpperCase() === 'ACTIVE');
        }}
        onPause={(a) =>
          setPendingControl({ kind: 'status', target: { entityType: 'ad', id: a.meta_ad_id, name: a.ad_name, status: 'ACTIVE' }, next: 'PAUSED' })
        }
        onAck={ackAlert}
      />

      {perf.length > 0 && <ResultsSummary m={aggregateMetrics(perf)} />}

      {/* Summary KPI Cards (NORQVA-0083: uma superfície só, sem bordas) */}
      <div className="rounded-2xl bg-nq-surface p-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-5" data-testid="meta-kpis">
        {[
          ['Investimento', `R$ ${totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
          ['Impressões', totalImpressions.toLocaleString('pt-BR')],
          ['Cliques', totalClicks.toLocaleString('pt-BR')],
          ['CPC Médio', `R$ ${avgCpc.toFixed(2).replace('.', ',')}`],
          ['CPM Médio', `R$ ${avgCpm.toFixed(2).replace('.', ',')}`],
          ['CTR Médio', `${avgCtr.toFixed(2).replace('.', ',')}%`]
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <div className="text-[13px] text-nq-muted">{k}</div>
            <div className="mt-1 text-[17px] leading-6 font-semibold text-nq-text tabular-nums truncate">{v}</div>
          </div>
        ))}
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'campaigns'
              ? 'bg-nq-text text-nq-bg'
              : 'bg-nq-surface text-nq-muted hover:text-nq-text'
          }`}
        >
          <Layers className="h-4 w-4" /> Campanhas ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('adsets')}
          className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'adsets'
              ? 'bg-nq-text text-nq-bg'
              : 'bg-nq-surface text-nq-muted hover:text-nq-text'
          }`}
        >
          <Target className="h-4 w-4" /> Conjuntos ({adSets.length})
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'ads'
              ? 'bg-nq-text text-nq-bg'
              : 'bg-nq-surface text-nq-muted hover:text-nq-text'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Anúncios ({ads.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`shrink-0 h-10 px-4 rounded-full text-[13px] font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'insights'
              ? 'bg-nq-text text-nq-bg'
              : 'bg-nq-surface text-nq-muted hover:text-nq-text'
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Insights Históricos ({insights.length})
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="p-12 text-center text-nq-subtle text-xs">
          Carregando dados da Meta Marketing API...
        </div>
      ) : (
        <div className="space-y-4">
          {(campaignFilter || adsetFilter) && activeTab !== 'campaigns' && activeTab !== 'insights' && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="drill-filter">
              <span className="text-nq-subtle">Filtrando:</span>
              {campaignFilter && (
                <button onClick={() => { setCampaignFilter(null); setAdsetFilter(null); }} className="px-2 py-0.5 rounded bg-nq-raised text-nq-text">
                  {campaignFilter.name} ✕
                </button>
              )}
              {adsetFilter && activeTab === 'ads' && (
                <button onClick={() => setAdsetFilter(null)} className="px-2 py-0.5 rounded bg-nq-raised text-nq-text">
                  {adsetFilter.name} ✕
                </button>
              )}
            </div>
          )}

          {/* TAB 1: CAMPAIGNS */}
          {activeTab === 'campaigns' && isMobile && mobileCampaigns}
          {activeTab === 'campaigns' && !isMobile && (
            <div className="rounded-lg border border-nq-line overflow-x-auto bg-nq-surface">
              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-nq-subtle text-xs">
                  Nenhuma campanha sincronizada. Clique em "Sincronizar Agora" para ingerir da Meta.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-nq-surface text-nq-muted border-b border-nq-line">
                    <tr>
                      <th className="p-3">Campanha</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 whitespace-nowrap">Orçamento/dia</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {[...campaigns]
                      .map((c) => ({ c, m: metricsFor(p => String(p.campaign_id) === String(c.meta_campaign_id)) }))
                      .sort((x, y) => y.m.spend - x.m.spend)
                      .map(({ c, m }) => (
                      <tr key={c.id} className="hover:bg-nq-raised transition">
                        <td className="p-3">
                          <button
                            onClick={() => { setCampaignFilter(c); setAdsetFilter(null); setActiveTab('adsets'); }}
                            className="font-bold text-nq-text hover:text-nq-positive-text text-left underline-offset-2 hover:underline"
                            title="Ver conjuntos desta campanha"
                          >
                            {c.name}
                          </button>
                          <div className="text-nq-subtle text-[12px]">{c.meta_campaign_id}</div>
                        </td>
                        <td className="p-3">{renderStatusBadge(c)}</td>
                        <td className="p-3 text-nq-text whitespace-nowrap">
                          {c.daily_budget ? `R$ ${parseFloat(c.daily_budget).toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <MetricCells m={m} />
                        {isAdmin && (
                          <td className="p-3">
                            <MetaControlActions
                              status={control.status}
                              onRequest={setPendingControl}
                              target={{ entityType: 'campaign', id: c.meta_campaign_id, name: c.name, status: c.status, dailyBudget: toBudget(c.daily_budget) }}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: ADSETS */}
          {activeTab === 'adsets' && isMobile && mobileAdsets}
          {activeTab === 'adsets' && !isMobile && (
            <div className="rounded-lg border border-nq-line overflow-x-auto bg-nq-surface">
              {adSets.length === 0 ? (
                <div className="p-12 text-center text-nq-subtle text-xs">
                  Nenhum conjunto de anúncios sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-nq-surface text-nq-muted border-b border-nq-line">
                    <tr>
                      <th className="p-3">Conjunto</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 whitespace-nowrap">Orçamento/dia</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {adSets
                      .filter((s) => !campaignFilter || String(s.campaign_id) === String(campaignFilter.id))
                      .map((s) => ({ s, m: metricsFor(p => String(p.adset_id) === String(s.meta_adset_id)) }))
                      .sort((x, y) => y.m.spend - x.m.spend)
                      .map(({ s, m }) => (
                      <tr key={s.id} className="hover:bg-nq-raised transition">
                        <td className="p-3">
                          <button
                            onClick={() => { setAdsetFilter(s); setActiveTab('ads'); }}
                            className="font-bold text-nq-text hover:text-nq-positive-text text-left underline-offset-2 hover:underline"
                            title="Ver anúncios deste conjunto"
                          >
                            {s.name}
                          </button>
                          <div className="text-nq-subtle text-[12px]">{s.campaign_name || '—'}</div>
                        </td>
                        <td className="p-3">{renderStatusBadge(s)}</td>
                        <td className="p-3 text-nq-text whitespace-nowrap">
                          {s.daily_budget ? `R$ ${parseFloat(s.daily_budget).toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <MetricCells m={m} />
                        {isAdmin && (
                          <td className="p-3">
                            <MetaControlActions
                              status={control.status}
                              onRequest={setPendingControl}
                              target={{ entityType: 'adset', id: s.meta_adset_id, name: s.name, status: s.status, dailyBudget: toBudget(s.daily_budget) }}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 3: ADS */}
          {activeTab === 'ads' && isMobile && mobileAds}
          {activeTab === 'ads' && !isMobile && (
            <div className="rounded-lg border border-nq-line overflow-x-auto bg-nq-surface">
              {ads.length === 0 ? (
                <div className="p-12 text-center text-nq-subtle text-xs">
                  Nenhum anúncio sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-nq-surface text-nq-muted border-b border-nq-line">
                    <tr>
                      <th className="p-3">Anúncio</th>
                      <th className="p-3">Status</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {ads
                      .filter((a) => {
                        if (adsetFilter) return String(a.adset_id) === String(adsetFilter.id);
                        if (campaignFilter) {
                          const setIds = new Set(adSets.filter(s => String(s.campaign_id) === String(campaignFilter.id)).map(s => String(s.id)));
                          return setIds.has(String(a.adset_id));
                        }
                        return true;
                      })
                      .map((a) => ({ a, m: metricsFor(p => String(p.ad_id) === String(a.meta_ad_id)) }))
                      .sort((x, y) => y.m.spend - x.m.spend)
                      .map(({ a, m }) => {
                        const alert = openAlertByAd.get(String(a.meta_ad_id));
                        return (
                      <tr key={a.id} className={`hover:bg-nq-raised transition ${alert ? 'bg-nq-critical/10' : ''}`}>
                        <td className="p-3">
                          <div className="font-bold text-nq-text">{a.name}</div>
                          <div className="text-nq-subtle text-[12px]">{a.adset_name || '—'}</div>
                          {alert && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-nq-critical/20 text-nq-critical-text text-[12px] font-bold" data-testid="ad-alert-badge">
                              Pausar recomendado
                            </span>
                          )}
                        </td>
                        <td className="p-3">{renderStatusBadge(a)}</td>
                        <MetricCells m={m} />
                        {isAdmin && (
                          <td className="p-3">
                            <MetaControlActions
                              status={control.status}
                              onRequest={setPendingControl}
                              target={{ entityType: 'ad', id: a.meta_ad_id, name: a.name, status: a.status }}
                            />
                          </td>
                        )}
                      </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 4: INSIGHTS */}
          {activeTab === 'insights' && (
            <div className="rounded-lg border border-nq-line overflow-hidden bg-nq-surface">
              {insights.length === 0 ? (
                <div className="p-12 text-center text-nq-subtle text-xs">
                  Nenhum insight histórico gravado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-nq-surface text-nq-muted border-b border-nq-line">
                    <tr>
                      <th className="p-3.5">Nível / Entidade</th>
                      <th className="p-3.5">Período</th>
                      <th className="p-3.5">Investimento</th>
                      <th className="p-3.5">Impressões</th>
                      <th className="p-3.5">Cliques</th>
                      <th className="p-3.5">CPC</th>
                      <th className="p-3.5">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nq-line/60">
                    {insights.map((ins) => (
                      <tr key={ins.id} className="hover:bg-nq-raised transition">
                        <td className="p-3.5">
                          <div className="font-bold text-nq-text">{ins.campaign_name || ins.entity_meta_id}</div>
                          <div className="text-[12px] text-nq-subtle">{ins.entity_level}</div>
                        </td>
                        <td className="p-3.5 text-nq-muted text-[12px]">
                          {ins.date_start} → {ins.date_stop}
                        </td>
                        <td className="p-3.5 font-bold text-nq-positive-text">
                          R$ {parseFloat(ins.spend).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="p-3.5 text-nq-text">
                          {parseInt(ins.impressions, 10).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 text-nq-text">
                          {parseInt(ins.clicks, 10).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 text-nq-text">
                          {ins.cpc ? `R$ ${parseFloat(ins.cpc).toFixed(2).replace('.', ',')}` : '—'}
                        </td>
                        <td className="p-3.5 text-nq-text">
                          {ins.ctr ? `${parseFloat(ins.ctr).toFixed(2).replace('.', ',')}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
