import { useState, useEffect, useRef } from 'react';
import { Activity, Calendar, DollarSign, TrendingUp, AlertTriangle, Search } from 'lucide-react';
import { DashboardProps } from './dashboardTypes';

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
  const [dashFilter, setDashFilter] = useState('7_DIAS');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('human_id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const activeControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Avoid making requests for PERSONALIZADO filter unless both dates are filled
    if (dashFilter === 'PERSONALIZADO' && (!startDate || !endDate)) {
      return;
    }

    // Abort previous request to prevent race conditions
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;

    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const modeParam = `?mode=${isDemoView ? 'demo' : 'real'}`;
        const queryParams = `&filter=${dashFilter}&startDate=${startDate}&endDate=${endDate}`;
        const data = await apiFetch(`/dashboard${modeParam}${queryParams}`, {
          signal: controller.signal
        });
        
        if (!controller.signal.aborted) {
          setMetrics(data.metrics);
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || (err.message && err.message.includes('aborted'))) {
          // Silent ignore aborts
          return;
        }
        if (!controller.signal.aborted) {
          showError(err.message || 'Erro ao carregar métricas do dashboard.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchMetrics();

    return () => {
      controller.abort();
    };
  }, [dashFilter, startDate, endDate, isDemoView, refreshTrigger, apiFetch]);

  if (loading && !metrics) {
    return (
      <div className="h-60 flex flex-col items-center justify-center text-slate-400">
        <Activity className="h-8 w-8 text-emerald-500 animate-spin mb-2" />
        Carregando métricas consolidadas...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="h-60 flex flex-col items-center justify-center text-slate-455">
        <Activity className="h-8 w-8 text-slate-500 mb-2" />
        Nenhuma métrica disponível.
      </div>
    );
  }

  // Capital percentage
  const capPct = metrics.capitalApproved > 0 ? (metrics.capitalUsed / metrics.capitalApproved) * 100 : 0;
  const isBudgetWarning = capPct >= 80 && capPct < 100;
  const isBudgetLimit = capPct >= 100;

  // Filter & sort experiments list
  const filteredExps = experiments
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

  return (
    <div className="space-y-6 text-sm">
      {/* Dashboard Date controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-slate-800 rounded bg-slate-900/40">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span className="font-semibold text-xs uppercase tracking-wider text-slate-400">Período Operacional:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['HOJE', '7_DIAS', '30_DIAS', 'PERSONALIZADO'].map((f) => (
            <button
              key={f}
              onClick={() => setDashFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition ${
                dashFilter === f
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}

          {dashFilter === 'PERSONALIZADO' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-slate-200 focus:outline-none"
              />
              <span className="text-slate-500">a</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded p-1 text-xs text-slate-200 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Receita Card */}
        <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
            <span>Receita Operacional</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-100">
              R${metrics.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Líquido: R${metrics.netRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (reembolsos desc.)
            </div>
          </div>
        </div>

        {/* Investimento Card */}
        <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
            <span>Investimento de Mídia</span>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
              R${metrics.investment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Calculado via performance
            </div>
          </div>
        </div>

        {/* Margem Card */}
        <div className={`p-4 border rounded flex flex-col justify-between ${
          metrics.contributionMargin < 0
            ? 'border-red-900 bg-red-950/15'
            : 'border-slate-800 bg-slate-900/50'
        }`}>
          <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
            <span>Margem Contribuição</span>
            <span className={`h-2 w-2 rounded-full ${metrics.contributionMargin < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold tracking-tight ${metrics.contributionMargin < 0 ? 'text-red-400' : 'text-slate-100'}`}>
              R${metrics.contributionMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              Fórmula: receita - devoluções - taxas - investimento
            </div>
          </div>
        </div>

        {/* ROAS Card */}
        <div className="p-4 border border-slate-800 bg-slate-900/50 rounded flex flex-col justify-between">
          <div className="flex justify-between items-center text-xs font-mono uppercase text-slate-400">
            <span>ROAS Geral</span>
            <span className="text-[10px] font-mono bg-slate-800 px-1 rounded text-slate-300">Total</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
              {metrics.roas === 'Dados insuficientes' ? 'Dados insuficientes' : `${metrics.roas.toFixed(2)}x`}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono">
              CTR: {metrics.ctr === 'Dados insuficientes' ? 'N/A' : `${metrics.ctr}%`} | CPC: R${metrics.cpc === 'Dados insuficientes' ? 'N/A' : metrics.cpc}
            </div>
          </div>
        </div>
      </div>

      {/* Capital at Risk Progress Bar & Financial KPI */}
      <div className="p-5 border border-slate-800 bg-slate-900/60 rounded space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">Limite de Capital At Risk Autorizado</span>
            <h4 className="text-lg font-bold tracking-tight text-slate-200 font-mono">
              R${metrics.capitalUsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / R${metrics.capitalApproved.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} utilizados
            </h4>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono uppercase text-slate-500">Restante:</span>
            <div className="text-emerald-400 font-bold font-mono">R${metrics.capitalRemaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Budget Bar */}
        <div className="w-full bg-slate-955 border border-slate-800 h-2.5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isBudgetLimit ? 'bg-red-500' : isBudgetWarning ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(capPct, 100)}%` }}
          ></div>
        </div>

        {/* Warning messages */}
        {isBudgetWarning && (
          <div className="p-3 border border-amber-900 bg-amber-955/20 text-amber-200 rounded text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span>ATENÇÃO: Limite de gasto operacional global ultrapassou 80% do orçamento autorizado!</span>
          </div>
        )}
        {isBudgetLimit && (
          <div className="p-3 border border-red-955 bg-red-955/30 text-red-200 rounded text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span>LIMITE ATINGIDO: Investimento de capital global esgotado. Lançamento de performance bloqueado até ampliação pelo ADMIN.</span>
          </div>
        )}

        {/* Individual Active Experiment budget warnings */}
        {experiments && experiments.filter((e: any) => e.status !== 'PLANEJADO' && parseFloat(e.capital_approved) > 0).map((e: any) => {
          const approved = parseFloat(e.capital_approved);
          const used = parseFloat(e.capital_used);
          const pct = (used / approved) * 100;
          if (pct >= 80) {
            const isLimit = pct >= 100;
            return (
              <div
                key={`exp-warning-${e.id}`}
                className={`p-3 border rounded text-xs flex items-center gap-2 ${
                  isLimit ? 'border-red-955 bg-red-955/30 text-red-200' : 'border-amber-900 bg-amber-955/20 text-amber-200'
                }`}
              >
                <AlertTriangle className={`h-4 w-4 ${isLimit ? 'text-red-400' : 'text-amber-400'}`} />
                <span>
                  {isLimit
                    ? `LIMITE DE EXPERIMENTO ATINGIDO: O experimento [${e.human_id}] ${e.name} atingiu 100% de seu capital aprovado (R$${used.toLocaleString('pt-BR')} / R$${approved.toLocaleString('pt-BR')})!`
                    : `ALERTA DE EXPERIMENTO: O experimento [${e.human_id}] ${e.name} atingiu ${pct.toFixed(1)}% do orçamento autorizado (R$${used.toLocaleString('pt-BR')} / R$${approved.toLocaleString('pt-BR')})!`
                  }
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* Tabela de Experimentos Activos */}
      <div className="p-4 border border-slate-800 bg-slate-900/40 rounded space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">Tabela de Experimentos Operacionais</h3>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
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
            {/* Status Filter */}
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

        {/* Responsive Table */}
        <div className="overflow-x-auto custom-scrollbar border border-slate-850 rounded">
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

      {/* Alertas V1 Section */}
      <div className="p-4 border border-slate-800 bg-slate-900/30 rounded space-y-3">
        <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Alertas Ativos (V1)
        </h3>
        <div className="space-y-2 text-xs">
          {capPct >= 80 && (
            <div className="p-3 rounded bg-amber-955/20 border border-amber-900/50 text-amber-300 flex items-start gap-2">
              <span className="font-bold font-mono">CAPITAL_80%:</span>
              <span>Gasto consolidado da plataforma atingiu R${metrics.capitalUsed} ({capPct.toFixed(1)}%). Necessário auditoria de ROI antes do próximo real de investimento.</span>
            </div>
          )}
          {experiments.filter((e: any) => e.status === 'ATIVO' && parseFloat(e.capital_used) === 0).map((e: any) => (
            <div key={e.id} className="p-3 rounded bg-red-955/15 border border-red-900/30 text-red-300 flex items-start gap-2">
              <span className="font-bold font-mono text-red-400">DADOS DESATUALIZADOS:</span>
              <span>O experimento ativo {e.human_id} ({e.name}) não possui nenhum registro de investimento associado.</span>
            </div>
          ))}
          {experiments.filter((e: any) => e.status === 'ATIVO' && parseFloat(e.capital_used) > 0).length === 0 && (
            <div className="text-slate-500 font-mono py-2 text-center">Nenhum alerta de integridade ativo no momento.</div>
          )}
        </div>
      </div>
    </div>
  );
}
