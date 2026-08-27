import React, { useState, useEffect } from 'react';
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
      const [cmpRes, setRes, adRes, insRes] = await Promise.all([
        apiFetch(`/meta/campaigns?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/adsets?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/ads?mode=${mode}`, {}, mode, currentUser).catch(() => []),
        apiFetch(`/meta/insights?mode=${mode}`, {}, mode, currentUser).catch(() => [])
      ]);

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
  }, [isDemoView]);

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
            Ingestão e leitura em tempo real de campanhas, conjuntos de anúncios e métricas de mídia
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

      {/* Mandatory Governance Banner */}
      <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
        <span>
          <strong>Dados de mídia em modo somente leitura.</strong> Atribuição de vendas ainda não certificada (Phase A - Read-Only Ingestion).
        </span>
      </div>

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
          {/* TAB 1: CAMPAIGNS */}
          {activeTab === 'campaigns' && (
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20">
              {campaigns.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhuma campanha sincronizada. Clique em "Sincronizar Agora" para ingerir da Meta.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Nome da Campanha</th>
                      <th className="p-3.5">Meta ID</th>
                      <th className="p-3.5">Objetivo</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Última Sincronização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5 font-bold text-slate-200">{c.name}</td>
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">{c.meta_campaign_id}</td>
                        <td className="p-3.5 font-mono text-slate-300 text-[11px]">{c.objective || '—'}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            c.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500 text-[10px]">
                          {c.last_synced_at ? new Date(c.last_synced_at).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 2: ADSETS */}
          {activeTab === 'adsets' && (
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20">
              {adSets.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum conjunto de anúncios sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Conjunto</th>
                      <th className="p-3.5">Campanha</th>
                      <th className="p-3.5">Meta ID</th>
                      <th className="p-3.5">Orçamento Diário</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {adSets.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5 font-bold text-slate-200">{s.name}</td>
                        <td className="p-3.5 text-slate-300">{s.campaign_name || '—'}</td>
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">{s.meta_adset_id}</td>
                        <td className="p-3.5 font-mono text-slate-200">
                          {s.daily_budget ? `R$ ${parseFloat(s.daily_budget).toFixed(2)}` : '—'}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            s.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 3: ADS */}
          {activeTab === 'ads' && (
            <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/20">
              {ads.length === 0 ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs">
                  Nenhum anúncio sincronizado.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/70 text-slate-400 font-mono border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Anúncio</th>
                      <th className="p-3.5">Conjunto</th>
                      <th className="p-3.5">Meta Ad ID</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {ads.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3.5 font-bold text-slate-200">{a.name}</td>
                        <td className="p-3.5 text-slate-300">{a.adset_name || '—'}</td>
                        <td className="p-3.5 font-mono text-slate-400 text-[11px]">{a.meta_ad_id}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            a.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
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
