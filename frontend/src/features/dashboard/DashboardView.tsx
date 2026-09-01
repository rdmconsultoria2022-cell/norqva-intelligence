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
  MousePointer
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
  const [activeSubView, setActiveSubView] = useState<'executive' | 'experiments'>('executive');
  const [execData, setExecData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Experiments sub-view filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('human_id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const activeControllerRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    fetchExecutiveData();
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [isDemoView, refreshTrigger, apiFetch]);

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

  if (loading && !execData) {
    return (
      <div className="h-72 flex flex-col items-center justify-center text-slate-400">
        <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
        Carregando dados executivos reais...
      </div>
    );
  }

  const meta = execData?.meta || { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: null, cpc: null, cpm: null, frequency: null, campaigns: [] };
  const commerce = execData?.commerce || { totalOrders: 0, pendingOrders: 0, paidOrders: 0, cancelledOrders: 0, grossRevenue: 0, aov: 0 };
  const finance = execData?.finance || { totalPixCreated: 0, totalPixConfirmed: 0, approvalRate: null, confirmedRevenue: 0, reconciledTransactions: 0 };
  const delivery = execData?.delivery || { totalEntitlements: 0, totalDownloads: 0, completedDownloads: 0, pendingDownloads: 0 };
  const recentOrders = execData?.recentOrders || [];

  return (
    <div className="space-y-6 text-sm">
      {/* Top Controls: View Switcher & Data Freshness */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-slate-800 rounded bg-slate-900/40">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubView('executive')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeSubView === 'executive'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Visão Executiva V1
          </button>
          <button
            onClick={() => setActiveSubView('experiments')}
            className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition flex items-center gap-2 ${
              activeSubView === 'experiments'
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Experimentos ({experiments?.length || 0})
          </button>
        </div>

        {/* Data Freshness Badges */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
            <span>Meta: {meta.lastSync ? new Date(meta.lastSync).toLocaleString('pt-BR') : 'Sincronização pendente'}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span>Finanças: Webhook Asaas (Tempo Real)</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span>Commerce: Tempo Real</span>
          </div>
        </div>
      </div>

      {activeSubView === 'executive' ? (
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
