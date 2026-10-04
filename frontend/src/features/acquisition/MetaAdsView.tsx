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
import { 
  TrendingUp, 
  Layers, 
  Target, 
  Eye, 
  MousePointer, 
  DollarSign, 
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
        badgeClass: 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
      };
    case 'PENDING_START_TIME':
      return {
        label: 'PROGRAMADO',
        badgeClass: 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
      };
    case 'IN_PROCESS':
      return {
        label: 'EM PROCESSAMENTO',
        badgeClass: 'bg-amber-950/40 text-amber-400 border border-amber-500/20'
      };
    case 'WITH_ISSUES':
      return {
        label: 'COM PROBLEMAS',
        badgeClass: 'bg-orange-950/60 text-orange-400 border border-orange-500/30'
      };
    case 'PAUSED':
      return {
        label: 'PAUSADO',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700'
      };
    case 'CAMPAIGN_PAUSED':
      return {
        label: 'PAUSADO P/ CAMPANHA',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700'
      };
    case 'ADSET_PAUSED':
      return {
        label: 'PAUSADO P/ CONJUNTO',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700'
      };
    case 'DISAPPROVED':
      return {
        label: 'REJEITADO',
        badgeClass: 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
      };
    case 'ARCHIVED':
      return {
        label: 'ARQUIVADO',
        badgeClass: 'bg-slate-900 text-slate-500 border border-slate-800'
      };
    case 'DELETED':
      return {
        label: 'EXCLUÍDO',
        badgeClass: 'bg-slate-900 text-slate-500 border border-slate-800'
      };
    case 'COMPLETED':
      return {
        label: 'CONCLUÍDO',
        badgeClass: 'bg-slate-800 text-emerald-400/80 border border-slate-700'
      };
    default:
      return {
        label: raw || 'DESCONHECIDO',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700'
      };
  }
}

export const MetaAdsView: React.FC<MetaAdsViewProps> = ({
  currentUser,
  isDemoView,
  apiFetch,
  showError,
  showSuccess
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';
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

  const loadAlerts = async () => {
    const mode = isDemoView ? 'demo' : 'real';
    try {
      const r = await apiFetch(`/alerts?mode=${mode}`, {}, mode, currentUser);
      setAlerts(Array.isArray(r?.alerts) ? r.alerts : []);
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
        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${deliveryStatus.badgeClass}`}>
          {deliveryStatus.label}
        </span>
        {item.status && item.effective_status && item.status !== item.effective_status && (
          <span className="text-[9px] font-mono text-slate-500">
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
      setPerf(Array.isArray(perfRes?.creatives) ? perfRes.creatives : []);
      loadAlerts();

      setCampaigns(Array.isArray(cmpRes) ? cmpRes : []);
      setAdSets(Array.isArray(setRes) ? setRes : []);
      setAds(Array.isArray(adRes) ? adRes : []);
      setInsights(Array.isArray(insRes) ? insRes : []);
    } catch (err: any) {
      showError(err.message || 'Erro ao carregar dados de Meta Ads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [isDemoView, periodQs]);

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

  return (
    <div className="space-y-6 text-sm">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-200 font-mono uppercase">
              Aquisição — Meta Ads
            </h2>
            {status?.apiVersion && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-400 border border-blue-500/30">
                Graph API {status.apiVersion}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            Resultados por campanha, conjunto e anúncio no período: gasto da Meta + visitas, checkouts e vendas do NORQVA
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 text-slate-950 font-bold rounded-md hover:bg-emerald-400 disabled:opacity-50 transition font-mono text-xs shadow-md shadow-emerald-500/10"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </button>
          )}
        </div>
      </div>

      {/* NORQVA-0019: campanhas criadas pausadas aguardando o SIM/NÃO do operador */}
      <LaunchPlansCard apiFetch={apiFetch} currentUser={currentUser} isDemoView={isDemoView} showError={showError} showSuccess={showSuccess} />

      {/* Governance banner: read-only for non-admins; control status for admins (NORQVA-0006) */}
      {isAdmin && control.status ? (
        <MetaControlBanner status={control.status} onRecheck={() => control.refresh(true)} />
      ) : (
        <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-emerald-400" /> Investimento
          </div>
          <div className="text-base font-bold text-slate-100 font-mono">
            R$ {totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
            <Eye className="h-3 w-3 text-blue-400" /> Impressões
          </div>
          <div className="text-base font-bold text-slate-100 font-mono">
            {totalImpressions.toLocaleString('pt-BR')}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
            <MousePointer className="h-3 w-3 text-cyan-400" /> Cliques
          </div>
          <div className="text-base font-bold text-slate-100 font-mono">
            {totalClicks.toLocaleString('pt-BR')}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase">CPC Médio</div>
          <div className="text-base font-bold text-slate-100 font-mono">
            R$ {avgCpc.toFixed(2)}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase">CPM Médio</div>
          <div className="text-base font-bold text-slate-100 font-mono">
            R$ {avgCpm.toFixed(2)}
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-400 uppercase">CTR Médio</div>
          <div className="text-base font-bold text-emerald-400 font-mono">
            {avgCtr.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2.5 font-mono text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'campaigns'
              ? 'border-emerald-400 text-emerald-400 bg-slate-900/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" /> Campanhas ({campaigns.length})
        </button>
        <button
          onClick={() => setActiveTab('adsets')}
          className={`px-4 py-2.5 font-mono text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'adsets'
              ? 'border-emerald-400 text-emerald-400 bg-slate-900/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target className="h-4 w-4" /> Conjuntos ({adSets.length})
        </button>
        <button
          onClick={() => setActiveTab('ads')}
          className={`px-4 py-2.5 font-mono text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'ads'
              ? 'border-emerald-400 text-emerald-400 bg-slate-900/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Anúncios ({ads.length})
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`px-4 py-2.5 font-mono text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'insights'
              ? 'border-emerald-400 text-emerald-400 bg-slate-900/30'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Insights Históricos ({insights.length})
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 font-mono text-xs">
          Carregando dados da Meta Marketing API...
        </div>
      ) : (
        <div className="space-y-4">
          {(campaignFilter || adsetFilter) && activeTab !== 'campaigns' && activeTab !== 'insights' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono" data-testid="drill-filter">
              <span className="text-slate-500">Filtrando:</span>
              {campaignFilter && (
                <button onClick={() => { setCampaignFilter(null); setAdsetFilter(null); }} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                  {campaignFilter.name} ✕
                </button>
              )}
              {adsetFilter && activeTab === 'ads' && (
                <button onClick={() => setAdsetFilter(null)} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                  {adsetFilter.name} ✕
                </button>
              )}
            </div>
          )}

          {/* TAB 1: CAMPAIGNS */}
          {activeTab === 'campaigns' && (
            <div className="rounded-lg border border-slate-800 overflow-x-auto bg-slate-900/20">
              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhuma campanha sincronizada. Clique em "Sincronizar Agora" para ingerir da Meta.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3">Campanha</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 whitespace-nowrap">Orçamento/dia</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {[...campaigns]
                      .map((c) => ({ c, m: metricsFor(p => String(p.campaign_id) === String(c.meta_campaign_id)) }))
                      .sort((x, y) => y.m.spend - x.m.spend)
                      .map(({ c, m }) => (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3">
                          <button
                            onClick={() => { setCampaignFilter(c); setAdsetFilter(null); setActiveTab('adsets'); }}
                            className="font-bold text-slate-200 hover:text-emerald-400 text-left underline-offset-2 hover:underline"
                            title="Ver conjuntos desta campanha"
                          >
                            {c.name}
                          </button>
                          <div className="font-mono text-slate-500 text-[10px]">{c.meta_campaign_id}</div>
                        </td>
                        <td className="p-3">{renderStatusBadge(c)}</td>
                        <td className="p-3 font-mono text-slate-200 whitespace-nowrap">
                          {c.daily_budget ? `R$ ${parseFloat(c.daily_budget).toFixed(2)}` : '—'}
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
          {activeTab === 'adsets' && (
            <div className="rounded-lg border border-slate-800 overflow-x-auto bg-slate-900/20">
              {adSets.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum conjunto de anúncios sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3">Conjunto</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 whitespace-nowrap">Orçamento/dia</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {adSets
                      .filter((s) => !campaignFilter || String(s.campaign_id) === String(campaignFilter.id))
                      .map((s) => ({ s, m: metricsFor(p => String(p.adset_id) === String(s.meta_adset_id)) }))
                      .sort((x, y) => y.m.spend - x.m.spend)
                      .map(({ s, m }) => (
                      <tr key={s.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3">
                          <button
                            onClick={() => { setAdsetFilter(s); setActiveTab('ads'); }}
                            className="font-bold text-slate-200 hover:text-emerald-400 text-left underline-offset-2 hover:underline"
                            title="Ver anúncios deste conjunto"
                          >
                            {s.name}
                          </button>
                          <div className="text-slate-500 text-[10px]">{s.campaign_name || '—'}</div>
                        </td>
                        <td className="p-3">{renderStatusBadge(s)}</td>
                        <td className="p-3 font-mono text-slate-200 whitespace-nowrap">
                          {s.daily_budget ? `R$ ${parseFloat(s.daily_budget).toFixed(2)}` : '—'}
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
          {activeTab === 'ads' && (
            <div className="rounded-lg border border-slate-800 overflow-x-auto bg-slate-900/20">
              {ads.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum anúncio sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3">Anúncio</th>
                      <th className="p-3">Status</th>
                      <MetricHeaderCells />
                      {isAdmin && <th className="p-3">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
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
                      <tr key={a.id} className={`hover:bg-slate-800/30 transition ${alert ? 'bg-red-950/20' : ''}`}>
                        <td className="p-3">
                          <div className="font-bold text-slate-200">{a.name}</div>
                          <div className="text-slate-500 text-[10px]">{a.adset_name || '—'}</div>
                          {alert && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 text-[10px] font-bold" data-testid="ad-alert-badge">
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
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20">
              {insights.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum insight histórico gravado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
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
                  <tbody className="divide-y divide-slate-850">
                    {insights.map((ins) => (
                      <tr key={ins.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5">
                          <div className="font-bold text-slate-200">{ins.campaign_name || ins.entity_meta_id}</div>
                          <div className="text-[10px] font-mono text-slate-500 uppercase">{ins.entity_level}</div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                          {ins.date_start} → {ins.date_stop}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-emerald-400">
                          R$ {parseFloat(ins.spend).toFixed(2)}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {parseInt(ins.impressions, 10).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {parseInt(ins.clicks, 10).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {ins.cpc ? `R$ ${parseFloat(ins.cpc).toFixed(2)}` : '—'}
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {ins.ctr ? `${parseFloat(ins.ctr).toFixed(2)}%` : '—'}
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
