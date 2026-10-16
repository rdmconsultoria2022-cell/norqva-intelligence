import { useState, useRef, useEffect } from 'react';
import {
  Plus,
  RefreshCw,
  AlertTriangle,
  History,
  Check,
  X,
  PlusCircle,
  BrainCircuit,
  Info
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { OpportunitiesProps } from './opportunityTypes';

export function OpportunitiesView({
  opportunities,
  users,
  currentUser,
  isDemoView,
  showError,
  showSuccess,
  refreshOpportunities,
  refreshProducts,
  refreshDecisions,
  readOnly = false
}: OpportunitiesProps) {
  const [selectedOpp, setSelectedOpp] = useState<any | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  // Modals inside Opportunities
  const [showAddOpp, setShowAddOpp] = useState(false);
  const [oppForm, setOppForm] = useState({
    title: '',
    category: '',
    subcategory: '',
    source: '',
    description: '',
    target_audience: '',
    problem_desire: '',
    format: '',
    reference_url: '',
    notes: ''
  });

  const [showAddEvidence, setShowAddEvidence] = useState<string | null>(null);
  const [evidenceForm, setEvidenceForm] = useState({
    type: 'FATO',
    source: '',
    url: '',
    description: '',
    reliability: '',
    observations: ''
  });

  // Review Form
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewPayload, setReviewPayload] = useState({ action: 'ACCEPT_ANALYSIS', rejection_reason: '', notes: '' });

  // Decide Form
  const [showDecideForm, setShowDecideForm] = useState(false);
  const [decidePayload, setDecidePayload] = useState({ decision: 'APPROVE_FOR_TEST', rejection_reason: '', justification: '' });

  // Override Form
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overridePayload, setOverridePayload] = useState({ score: '', reason: '' });

  // NORQVA-0029: dentro de Pesquisa este módulo vira Histórico, só para consulta (sem botões de ação)
  const isIntelligence = !readOnly && (currentUser ? (currentUser.role === 'INTELLIGENCE' || currentUser.role === 'ADMIN') : false);
  const isAdmin = !readOnly && (currentUser ? currentUser.role === 'ADMIN' : false);

  const activeOppIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Load history when selecting opportunity
  const selectOpportunity = async (opp: any) => {
    setSelectedOpp(opp);
    setHistoryLoading(true);
    activeOppIdRef.current = opp.id;
    const oppId = opp.id;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const mode = isDemoView ? 'demo' : 'real';
      const hist = await apiFetch(
        `/opportunities/${oppId}/history`,
        { signal: controller.signal },
        mode,
        currentUser
      );
      if (activeOppIdRef.current === oppId && !controller.signal.aborted) {
        setAnalysisHistory(hist.history || []);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !(err.message && err.message.includes('aborted'))) {
        console.error(err);
      }
    } finally {
      if (activeOppIdRef.current === oppId && !controller.signal.aborted) {
        setHistoryLoading(false);
      }
    }
  };

  const handleAddOpp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities?mode=${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(oppForm)
        },
        mode,
        currentUser
      );
      showSuccess('Oportunidade cadastrada e enviada para Coleta!');
      setShowAddOpp(false);
      setOppForm({
        title: '',
        category: '',
        subcategory: '',
        source: '',
        description: '',
        target_audience: '',
        problem_desire: '',
        format: '',
        reference_url: '',
        notes: ''
      });
      await refreshOpportunities();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddEvidence) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${showAddEvidence}/evidence?mode=${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(evidenceForm)
        },
        mode,
        currentUser
      );
      showSuccess('Evidência anexada com sucesso!');
      setShowAddEvidence(null);
      setEvidenceForm({
        type: 'FATO',
        source: '',
        url: '',
        description: '',
        reliability: '',
        observations: ''
      });
      // Refresh local opp state
      const updatedOpps = await apiFetch(`/opportunities?mode=${mode}`, {}, mode, currentUser);
      const matched = updatedOpps.opportunities.find((o: any) => o.id === showAddEvidence);
      if (matched) selectOpportunity(matched);
      await refreshOpportunities();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleApproveOpp = async (id: string) => {
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${id}/approve?mode=${mode}`,
        { method: 'POST' },
        mode,
        currentUser
      );
      showSuccess('Oportunidade aprovada e rascunho de produto gerado!');
      await refreshOpportunities();
      await refreshProducts();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleRunAnalysis = async (oppId: string) => {
    setAnalysisRunning(true);
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${oppId}/analyze?mode=${mode}`,
        { method: 'POST' },
        mode,
        currentUser
      );
      showSuccess('Análise de IA concluída com sucesso!');
      if (selectedOpp && selectedOpp.id === oppId) {
        const updatedOpps = await apiFetch(`/opportunities?mode=${mode}`, {}, mode, currentUser);
        const matched = updatedOpps.opportunities.find((o: any) => o.id === oppId);
        if (matched) selectOpportunity(matched);
      }
      await refreshOpportunities();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setAnalysisRunning(false);
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${selectedOpp.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify(reviewPayload)
        },
        mode,
        currentUser
      );
      showSuccess('Revisão registrada com sucesso!');
      setShowReviewForm(false);
      const updatedOpps = await apiFetch(`/opportunities?mode=${mode}`, {}, mode, currentUser);
      const matched = updatedOpps.opportunities.find((o: any) => o.id === selectedOpp.id);
      if (matched) selectOpportunity(matched);
      await refreshOpportunities();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const submitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${selectedOpp.id}/decide?mode=${mode}`,
        {
          method: 'POST',
          body: JSON.stringify(decidePayload)
        },
        mode,
        currentUser
      );
      showSuccess('Decisão de investimento gravada! Snapshot imutável gerado.');
      setShowDecideForm(false);
      const updatedOpps = await apiFetch(`/opportunities?mode=${mode}`, {}, mode, currentUser);
      const matched = updatedOpps.opportunities.find((o: any) => o.id === selectedOpp.id);
      if (matched) selectOpportunity(matched);
      await refreshOpportunities();
      await refreshDecisions();
      await refreshProducts();
    } catch (err: any) {
      showError(err.message);
    }
  };

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    try {
      const mode = isDemoView ? 'demo' : 'real';
      await apiFetch(
        `/opportunities/${selectedOpp.id}/override`,
        {
          method: 'POST',
          body: JSON.stringify({
            score: parseFloat(overridePayload.score),
            reason: overridePayload.reason
          })
        },
        mode,
        currentUser
      );
      showSuccess('Nota recalculada manualmente com sucesso!');
      setShowOverrideForm(false);
      const updatedOpps = await apiFetch(`/opportunities?mode=${mode}`, {}, mode, currentUser);
      const matched = updatedOpps.opportunities.find((o: any) => o.id === selectedOpp.id);
      if (matched) selectOpportunity(matched);
      await refreshOpportunities();
      await refreshDecisions();
    } catch (err: any) {
      showError(err.message);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-nq-section font-semibold text-nq-text">{readOnly ? 'Histórico do módulo antigo' : 'Módulo de oportunidades'}</h2>
          <p className="text-xs text-nq-muted" data-testid={readOnly ? 'legacy-readonly' : undefined}>
            {readOnly
              ? 'Só para consulta: a análise deste módulo era simulada e ele não recebe oportunidades novas. As novas ficam na aba Oportunidades.'
              : 'Qualificação matemática, mapeamento de incertezas e governança de dados'}
          </p>
        </div>
        {isIntelligence && (
          <button
            onClick={() => setShowAddOpp(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-nq-positive text-nq-on-positive font-bold rounded-full hover:brightness-110 transition min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            Nova Oportunidade
          </button>
        )}
      </div>

      {/* 2D Executive Matrix Scatter Plot */}
      <div className="p-5 bg-nq-surface rounded-nq space-y-3">
        <h3 className="text-xs font-bold text-nq-muted">Matriz Executiva (Score x Confiança)</h3>
        <div className="relative w-full h-[320px] bg-nq-bg rounded overflow-hidden font-sans">
          {/* Quadrants background labels */}
          <div className="w-1/2 h-1/2 absolute right-0 top-0 border-l border-b border-dashed border-nq-line flex items-start justify-end p-2.5 text-[12px] text-nq-positive-text font-bold bg-nq-positive/[0.01]">
            Alta Prioridade
          </div>
          <div className="w-1/2 h-1/2 absolute left-0 top-0 border-r border-b border-dashed border-nq-line flex items-start justify-start p-2.5 text-[12px] text-nq-attention/80 font-bold bg-nq-attention/[0.01]">
            Alta Incerteza (Pesquisa)
          </div>
          <div className="w-1/2 h-1/2 absolute right-0 bottom-0 border-l border-t border-dashed border-nq-line flex items-end justify-end p-2.5 text-[12px] text-nq-info/80 font-bold bg-nq-info/[0.01]">
            Validação de Escala
          </div>
          <div className="w-1/2 h-1/2 absolute left-0 bottom-0 border-r border-t border-dashed border-nq-line flex items-end justify-start p-2.5 text-[12px] text-nq-subtle/80 font-bold bg-nq-bg">
            Baixo Sinal / Arquivar
          </div>

          {/* Plotted opportunities */}
          {opportunities.map((o: any) => {
            const left = Math.max(2, Math.min(98, parseFloat(o.confidence_score) || 0));
            const bottom = Math.max(2, Math.min(98, parseFloat(o.final_product_score) || 0));
            const isHighPriority = bottom >= 60 && left >= 60;
            const isResearch = bottom >= 60 && left < 60;
            const isScale = bottom < 60 && left >= 60;

            return (
              <div
                key={o.id}
                onClick={() => selectOpportunity(o)}
                className="absolute -translate-x-1/2 translate-y-1/2 cursor-pointer group z-10"
                style={{ left: `${left}%`, bottom: `${bottom}%` }}
              >
                <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center text-[12px] font-bold transition transform hover:scale-125 ${
                  isHighPriority ? 'bg-nq-positive text-nq-on-positive border-nq-positive/40' :
                  isResearch ? 'bg-nq-attention text-nq-on-positive border-nq-attention/40' :
                  isScale ? 'bg-nq-info text-nq-on-positive border-nq-info/40' : 'bg-nq-line text-nq-on-positive border-nq-line'
                }`}>
                  {o.human_id.replace('OPP-', '')}
                </div>
                {/* Tooltip */}
                <div className="hidden group-hover:block absolute bottom-6 left-1/2 -translate-x-1/2 bg-nq-surface p-2 rounded-nq text-[12px] text-nq-text whitespace-nowrap z-30">
                  <div className="font-bold">{o.title}</div>
                  <div className="text-nq-muted mt-0.5">Score: {parseFloat(o.final_product_score || 0).toFixed(1)}</div>
                  <div className="text-nq-muted">Confiança: {parseFloat(o.confidence_score || 0).toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[12px] text-nq-subtle text-center">
          Eixo X: Confiança (%) • Eixo Y: Product Score (0-100) • Clique em um ponto para expandir a auditoria detalhada.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: List of opportunities */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between border-b border-nq-line pb-2">
            <h3 className="text-xs font-bold text-nq-muted">Lista de Oportunidades</h3>
            <span className="text-[12px] text-nq-subtle">{opportunities.length} ativas</span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
            {opportunities.length === 0 ? (
              <div className="p-8 rounded-nq bg-nq-surface text-center text-nq-subtle text-xs">
                Nenhuma oportunidade cadastrada.
              </div>
            ) : (
              opportunities.map((opp: any) => (
                <div
                  key={opp.id}
                  onClick={() => selectOpportunity(opp)}
                  className={`p-3.5 border rounded-nq cursor-pointer transition flex flex-col justify-between space-y-2.5 ${
                    selectedOpp?.id === opp.id
                      ? 'border-nq-positive/40 bg-nq-positive/10'
                      : 'border-nq-line bg-nq-surface hover:border-nq-line'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-nq-positive-text font-bold text-[12px]">{opp.human_id}</span>
                        {(opp.is_simulated || opp.ai_analysis_status === 'ANÁLISE SIMULADA' || opp.score_type === 'SIMULADA') && (
                          <span className="px-1.5 py-0.5 rounded text-[12px] bg-nq-attention/10 text-nq-attention border border-nq-attention/40 font-bold">
                            ANÁLISE SIMULADA
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-nq-text mt-0.5 line-clamp-1">{opp.title}</h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[12px] font-bold ${
                      opp.status === 'APROVADA_PARA_TESTE' ? 'bg-nq-positive/10 text-nq-positive-text border border-nq-positive/40' :
                      opp.status === 'REJEITADA' ? 'bg-nq-critical/10 text-nq-critical-text' :
                      opp.status === 'AGUARDANDO_DECISAO' ? 'bg-nq-info/10 text-nq-info' :
                      opp.status === 'AGUARDANDO_REVISAO' ? 'bg-nq-attention/10 text-nq-attention' : 'bg-nq-raised text-nq-muted'
                    }`}>
                      {opp.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-nq-line">
                    <div>
                      <span className="text-nq-subtle">Score:</span>{' '}
                      <span className="text-nq-text font-bold">
                        {opp.final_product_score ? parseFloat(opp.final_product_score).toFixed(1) : 'S/N'}
                      </span>
                    </div>
                    <div>
                      <span className="text-nq-subtle">Confiança:</span>{' '}
                      <span className="text-nq-text font-bold">
                        {opp.confidence_score ? `${parseFloat(opp.confidence_score).toFixed(0)}%` : 'S/N'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column: Audit Detail Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedOpp ? (
            <div className="h-[450px] rounded-nq bg-nq-surface flex flex-col items-center justify-center text-nq-subtle text-xs">
              Selecione uma oportunidade para auditar seus subscores, evidências, riscos e histórico.
            </div>
          ) : (
            <div className="bg-nq-surface rounded-nq p-6 space-y-6">
              {/* Header Panel */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-nq-line pb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-nq-positive-text font-bold text-xs">{selectedOpp.human_id}</span>
                    {(selectedOpp.is_simulated || selectedOpp.ai_analysis_status === 'ANÁLISE SIMULADA' || selectedOpp.score_type === 'SIMULADA') && (
                      <span className="px-2 py-0.5 rounded text-[12px] bg-nq-attention/10 text-nq-attention border border-nq-attention/40 font-bold">
                        ANÁLISE SIMULADA
                      </span>
                    )}
                    {selectedOpp.is_human_override && (
                      <span className="px-2 py-0.5 rounded text-[12px] bg-nq-attention/10 text-nq-attention border border-nq-attention/40 font-bold">
                        SOBRESCRO ADMIN
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-nq-text mt-1">{selectedOpp.title}</h3>
                  <div className="text-xs text-nq-muted mt-0.5">
                    Responsável: {selectedOpp.responsible_name || 'Não atribuído'}
                  </div>
                </div>

                {/* IA engine run button */}
                <div className="flex items-center gap-2">
                  {isIntelligence && (
                    <button
                      disabled={analysisRunning}
                      onClick={() => handleRunAnalysis(selectedOpp.id)}
                      className="px-3 py-1.5 rounded-full bg-nq-positive text-nq-on-positive hover:brightness-110 font-bold text-nq-aux flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${analysisRunning ? 'animate-spin' : ''}`} />
                      {analysisRunning ? 'Rodando...' : 'Rodar Análise de IA'}
                    </button>
                  )}
                </div>
              </div>

              {/* Description & metadata summary */}
              <div className="p-3.5 rounded bg-nq-bg text-xs text-nq-text italic">
                "{selectedOpp.description}"
              </div>

              {/* Subscores breakdown grid */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-nq-muted">Painel de Subscores e Componentes</h4>
                {selectedOpp.score_components && selectedOpp.score_components.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {selectedOpp.score_components.map((c: any) => (
                      <div key={c.id} className="p-3 bg-nq-bg rounded space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-nq-text text-[12px]">
                            {c.component_key.replace('_', ' ')}
                          </span>
                          <span className="text-nq-positive-text font-bold">
                            Score: {parseFloat(c.score).toFixed(1)}/10
                          </span>
                        </div>
                        <div className="flex justify-between text-[12px] text-nq-subtle">
                          <span>Peso: {parseFloat(c.weight).toFixed(0)}%</span>
                          <span>Evidências: {c.evidence_count}</span>
                          <span className={`px-1 rounded text-[12px] font-bold ${
                            c.confidence === 'HIGH' ? 'text-nq-positive-text bg-nq-positive/10' :
                            c.confidence === 'MEDIUM' ? 'text-nq-attention bg-nq-attention/10' : 'text-nq-critical-text bg-nq-critical/10'
                          }`}>
                            {c.confidence}
                          </span>
                        </div>
                        <p className="text-[12px] text-nq-muted leading-relaxed pt-1.5 border-t border-nq-line">
                          {c.reasoning_summary}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded border border-dashed border-nq-line text-center text-nq-subtle text-xs">
                    Sem subscores gerados. Clique em "Rodar Análise de IA" para qualificar esta oportunidade.
                  </div>
                )}
              </div>

              {/* Risk findings with Double Counting Warning */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-nq-line pb-1">
                  <h4 className="text-xs font-bold text-nq-muted">Riscos & Penalidades de IA</h4>
                  <span className="text-[12px] text-nq-subtle">
                    Ajuste Crítico: <span className="text-nq-critical-text font-bold">{selectedOpp.critical_adjustment ? parseFloat(selectedOpp.critical_adjustment).toFixed(2) : '0.00'}</span>
                  </span>
                </div>

                {selectedOpp.risks && selectedOpp.risks.length > 0 ? (
                  <div className="space-y-2">
                    {selectedOpp.risks.map((r: any) => (
                      <div key={r.id} className="p-3 rounded bg-nq-bg border border-nq-critical/40 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-nq-critical/10 text-nq-critical-text border border-nq-critical/40">
                              {r.risk_type}
                            </span>
                            <span className="text-[12px] text-nq-subtle">
                              Severidade: <span className="text-nq-text font-bold">{r.severity}</span> • Probabilidade: {r.probability}
                            </span>
                          </div>
                          <p className="text-xs text-nq-text">{r.description}</p>
                        </div>
                      </div>
                    ))}
                    
                    {/* Double Counting protection hint */}
                    <div className="p-2 border border-nq-info/40 bg-nq-info/10 rounded text-[12px] text-nq-muted">
                      ℹ️ PROTEÇÃO CONTRA DUPLA CONTAGEM ATIVA: Penalidades semanticamente repetidas sobre o mesmo componente e tipo de risco foram agrupadas pelo motor matemático. Aplica-se apenas o maior fator de severidade por grupo.
                    </div>
                  </div>
                ) : (
                  <div className="text-nq-subtle italic text-xs">Nenhum risco detectado pelo Critical Analyst.</div>
                )}
              </div>

              {/* Evidences list */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-nq-line pb-1.5">
                  <h4 className="text-xs font-bold text-nq-muted">Evidências de Suporte ({selectedOpp.evidences ? selectedOpp.evidences.length : 0})</h4>
                  {isIntelligence && (
                    <button
                      onClick={() => setShowAddEvidence(selectedOpp.id)}
                      className="text-nq-aux text-nq-positive-text hover:text-nq-positive-text font-semibold flex items-center gap-1 min-h-[44px]"
                    >
                      <Plus className="h-3.5 w-3.5" /> Anexar Evidência
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {!selectedOpp.evidences || selectedOpp.evidences.length === 0 ? (
                    <div className="text-nq-subtle italic text-xs py-2 col-span-2">Sem evidências associadas. Anexe dados para aumentar a cobertura e confiança.</div>
                  ) : (
                    selectedOpp.evidences.map((ev: any) => (
                      <div key={ev.id} className="p-3 rounded bg-nq-bg flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[12px] font-bold ${
                            ev.type === 'FATO' ? 'bg-nq-info/10 text-nq-info border border-nq-info/40' :
                            ev.type === 'INFERENCIA' ? 'bg-nq-attention/10 text-nq-attention' : 'bg-nq-raised text-nq-muted'
                          }`}>
                            {ev.type}
                          </span>
                          <span className="text-[12px] text-nq-subtle">Confiabilidade: {ev.reliability}</span>
                        </div>
                        <p className="text-xs text-nq-text italic">"{ev.description}"</p>
                        
                        <div className="text-[12px] text-nq-subtle flex items-center justify-between pt-1 border-t border-nq-line">
                          <span>Grupo: {ev.source_group || 'Não classificado'}</span>
                          {ev.url && <a href={ev.url} target="_blank" rel="noreferrer" className="text-nq-positive-text hover:underline">Link</a>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Review & Decision Governance Panel */}
              <div className="p-4 rounded bg-nq-bg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-nq-muted">Governança e Fluxo de Decisões</h4>
                  <span className="text-[12px] text-nq-subtle">Fase Atual: {selectedOpp.status}</span>
                </div>

                {/* Workflow Buttons */}
                <div className="flex flex-wrap gap-2.5">
                  {selectedOpp.status === 'AGUARDANDO_REVISAO' && isIntelligence && (
                    <button
                      onClick={() => {
                        setShowReviewForm(true);
                        setReviewPayload({ action: 'ACCEPT_ANALYSIS', rejection_reason: '', notes: '' });
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-nq-positive text-nq-on-positive hover:brightness-110 font-bold text-nq-aux min-h-[44px]"
                    >
                      Registrar Revisão
                    </button>
                  )}

                  {selectedOpp.status === 'AGUARDANDO_DECISAO' && isAdmin && (
                    <button
                      onClick={() => {
                        setShowDecideForm(true);
                        setDecidePayload({ decision: 'APPROVE_FOR_TEST', rejection_reason: '', justification: '' });
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-nq-info text-nq-on-positive hover:brightness-110 font-bold text-nq-aux min-h-[44px]"
                    >
                      Tomar Decisão Estratégica
                    </button>
                  )}

                  {isAdmin && selectedOpp.final_product_score && (
                    <button
                      onClick={() => {
                        setShowOverrideForm(true);
                        setOverridePayload({ score: parseFloat(selectedOpp.final_product_score).toFixed(1), reason: '' });
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-nq-attention/10 text-nq-attention hover:bg-nq-attention/20 font-bold text-nq-aux border border-nq-attention/40 min-h-[44px]"
                    >
                      Sobrescrever Pontuação (Admin)
                    </button>
                  )}
                  
                  {/* Approve Action spawned automatically if approved for test */}
                  {selectedOpp.status === 'AGUARDANDO_DECISAO' && isAdmin && (
                    <button
                      onClick={() => handleApproveOpp(selectedOpp.id)}
                      className="px-3.5 py-1.5 rounded-full bg-nq-positive text-nq-on-positive hover:brightness-110 font-bold text-nq-aux ml-auto min-h-[44px]"
                    >
                      Aprovar Imediato (Spawns Product)
                    </button>
                  )}
                </div>

                {selectedOpp.reviews && selectedOpp.reviews.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-nq-line">
                    <span className="text-[12px] text-nq-subtle font-bold block">Histórico de Revisões</span>
                    <div className="space-y-1.5">
                      {selectedOpp.reviews.map((rev: any) => (
                        <div key={rev.id} className="text-xs text-nq-muted bg-nq-bg p-2 rounded">
                          <span className={`font-bold ${rev.action === 'ACCEPT_ANALYSIS' ? 'text-nq-positive-text' : 'text-nq-critical-text'}`}>
                            {rev.action}
                          </span>{' '}
                          • Notas: "{rev.notes || 'N/A'}"
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Version analysis history */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-nq-muted">Histórico de Versões da IA (Auditoria)</h4>
                {historyLoading ? (
                  <div className="text-xs text-nq-subtle">Buscando logs de auditoria...</div>
                ) : analysisHistory.length === 0 ? (
                  <div className="text-xs text-nq-subtle italic">Sem versões de análises salvas no histórico.</div>
                ) : (
                  <div className="space-y-2">
                    {analysisHistory.map((h: any) => (
                      <div key={h.id} className="p-3 rounded bg-nq-bg text-xs flex items-center justify-between">
                        <div>
                          <span className="text-nq-positive-text font-bold">Versão {h.version}</span>
                          <span className="text-nq-subtle ml-2">({h.provider} - {h.model})</span>
                          <div className="text-[12px] text-nq-muted mt-1 truncate max-w-md">Summary: {h.executive_summary}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-[12px] text-nq-subtle block">Custo Estimado</span>
                          <span className="text-nq-text font-bold">${parseFloat(h.estimated_cost).toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Add Opportunity */}
      {showAddOpp && (
        <div className="fixed inset-0 z-50 bg-nq-bg flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-2xl w-full p-6 text-sm overflow-y-auto max-h-[90vh] custom-scrollbar">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Adicionar Oportunidade</h3>
            <form onSubmit={handleAddOpp} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Título</label>
                  <input
                    type="text"
                    required
                    value={oppForm.title}
                    onChange={e => setOppForm({ ...oppForm, title: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Categoria</label>
                  <input
                    type="text"
                    required
                    value={oppForm.category}
                    onChange={e => setOppForm({ ...oppForm, category: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Subcategoria</label>
                  <input
                    type="text"
                    required
                    value={oppForm.subcategory}
                    onChange={e => setOppForm({ ...oppForm, subcategory: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Fonte</label>
                  <input
                    type="text"
                    required
                    value={oppForm.source}
                    onChange={e => setOppForm({ ...oppForm, source: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Descrição</label>
                <textarea
                  required
                  value={oppForm.description}
                  onChange={e => setOppForm({ ...oppForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Público Alvo Provável</label>
                  <input
                    type="text"
                    required
                    value={oppForm.target_audience}
                    onChange={e => setOppForm({ ...oppForm, target_audience: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Problema / Desejo Central</label>
                  <input
                    type="text"
                    required
                    value={oppForm.problem_desire}
                    onChange={e => setOppForm({ ...oppForm, problem_desire: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Formato</label>
                  <input
                    type="text"
                    required
                    value={oppForm.format}
                    onChange={e => setOppForm({ ...oppForm, format: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-nq-muted mb-1">URL de Referência</label>
                  <input
                    type="url"
                    value={oppForm.reference_url}
                    onChange={e => setOppForm({ ...oppForm, reference_url: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Observações</label>
                <textarea
                  value={oppForm.notes}
                  onChange={e => setOppForm({ ...oppForm, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddOpp(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Cadastrar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Evidence */}
      {showAddEvidence && (
        <div className="fixed inset-0 z-50 bg-nq-bg flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Anexar Evidência</h3>
            <form onSubmit={handleAddEvidence} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Classificação da Evidência</label>
                <select
                  value={evidenceForm.type}
                  onChange={e => setEvidenceForm({ ...evidenceForm, type: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="FATO">FATO (Concreto/Verificado)</option>
                  <option value="INFERENCIA">INFERÊNCIA (Lógica baseada em fatos)</option>
                  <option value="HIPOTESE">HIPÓTESE (Suposição a ser validada)</option>
                  <option value="DADO_INSUFICIENTE">DADO INSUFICIENTE (Sem base sólida)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Fonte da Evidência</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: IBGE, Pesquisa Google, Entrevista com X"
                  value={evidenceForm.source}
                  onChange={e => setEvidenceForm({ ...evidenceForm, source: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">URL (Opcional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={evidenceForm.url}
                  onChange={e => setEvidenceForm({ ...evidenceForm, url: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Descrição Detalhada</label>
                <textarea
                  required
                  value={evidenceForm.description}
                  onChange={e => setEvidenceForm({ ...evidenceForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Confiabilidade</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alta, Média, Baixa"
                  value={evidenceForm.reliability}
                  onChange={e => setEvidenceForm({ ...evidenceForm, reliability: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Observações</label>
                <textarea
                  value={evidenceForm.observations}
                  onChange={e => setEvidenceForm({ ...evidenceForm, observations: e.target.value })}
                  rows={2}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEvidence(null)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Anexar Evidência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal Form */}
      {showReviewForm && (
        <div className="fixed inset-0 z-50 bg-nq-bg flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Registrar Revisão de IA</h3>
            <form onSubmit={submitReview} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Ação de Revisão</label>
                <select
                  value={reviewPayload.action}
                  onChange={e => setReviewPayload({ ...reviewPayload, action: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="ACCEPT_ANALYSIS">ACEITAR ANÁLISE (Envia para Decisão)</option>
                  <option value="REQUEST_MORE_RESEARCH">SOLICITAR MAIS EVIDÊNCIAS (Retorna para Coleta)</option>
                  <option value="REJECT_ANALYSIS">REJEITAR ANÁLISE (Rejeita Oportunidade)</option>
                </select>
              </div>

              {reviewPayload.action === 'REJECT_ANALYSIS' && (
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Motivo de Rejeição</label>
                  <select
                    required
                    value={reviewPayload.rejection_reason}
                    onChange={e => setReviewPayload({ ...reviewPayload, rejection_reason: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]"
                  >
                    <option value="">Selecione o motivo...</option>
                    <option value="LOW_DEMAND_SIGNAL">Sinal de demanda baixo</option>
                    <option value="LOW_CONFIDENCE">Confiança/Confiabilidade insuficiente</option>
                    <option value="SATURATED">Mercado saturado</option>
                    <option value="POOR_ECONOMICS">Economia de escala desfavorável</option>
                    <option value="OTHER">Outros motivos técnicos</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-nq-muted mb-1">Notas de Revisão</label>
                <textarea
                  required
                  placeholder="Justifique a aprovação ou solicitação de pesquisa..."
                  value={reviewPayload.notes}
                  onChange={e => setReviewPayload({ ...reviewPayload, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviewForm(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Registrar Revisão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Decision Modal Form */}
      {showDecideForm && (
        <div className="fixed inset-0 z-50 bg-nq-bg flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Decisão de Investimento (Admin)</h3>
            <form onSubmit={submitDecision} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Decisão Final</label>
                <select
                  value={decidePayload.decision}
                  onChange={e => setDecidePayload({ ...decidePayload, decision: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]"
                >
                  <option value="APPROVE_FOR_TEST">APROVAR PARA TESTE (Cria Produto Planejado)</option>
                  <option value="REJECT">REJEITAR OPORTUNIDADE</option>
                  <option value="ARCHIVE">ARQUIVAR OPORTUNIDADE (Soft Delete)</option>
                </select>
              </div>

              {decidePayload.decision === 'REJECT' && (
                <div>
                  <label className="block text-xs text-nq-muted mb-1">Motivo de Rejeição</label>
                  <select
                    required
                    value={decidePayload.rejection_reason}
                    onChange={e => setDecidePayload({ ...decidePayload, rejection_reason: e.target.value })}
                    className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-text min-h-[44px]"
                  >
                    <option value="">Selecione o motivo...</option>
                    <option value="LOW_DEMAND_SIGNAL">Sinal de demanda baixo</option>
                    <option value="LOW_CONFIDENCE">Confiança/Confiabilidade insuficiente</option>
                    <option value="SATURATED">Mercado saturado</option>
                    <option value="POOR_ECONOMICS">Economia de escala desfavorável</option>
                    <option value="OTHER">Outros motivos técnicos</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-nq-muted mb-1">Justificativa Final</label>
                <textarea
                  required
                  placeholder="Justifique a decisão com base nos dados consolidados..."
                  value={decidePayload.justification}
                  onChange={e => setDecidePayload({ ...decidePayload, justification: e.target.value })}
                  rows={3}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDecideForm(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Gravar Decisão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Override Modal Form */}
      {showOverrideForm && (
        <div className="fixed inset-0 z-50 bg-nq-bg flex items-center justify-center p-4">
          <div className="bg-nq-surface rounded-nq max-w-md w-full p-6 text-sm">
            <h3 className="text-nq-section font-semibold text-nq-text mb-4">Sobrescrever Pontuação (Admin)</h3>
            <form onSubmit={submitOverride} className="space-y-4">
              <div>
                <label className="block text-xs text-nq-muted mb-1">Nova Pontuação Global (0 a 100)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  required
                  value={overridePayload.score}
                  onChange={e => setOverridePayload({ ...overridePayload, score: e.target.value })}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 text-nq-positive-text text-sm min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs text-nq-muted mb-1">Justificativa da Alteração</label>
                <textarea
                  required
                  placeholder="Justifique por que esta pontuação foi alterada..."
                  value={overridePayload.reason}
                  onChange={e => setOverridePayload({ ...overridePayload, reason: e.target.value })}
                  rows={3}
                  className="w-full bg-nq-bg rounded-xl p-2 focus:outline-none focus:border-nq-positive/40 min-h-[44px]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideForm(false)}
                  className="px-4 py-2 rounded-full bg-nq-raised text-nq-text hover:bg-nq-line font-semibold min-h-[44px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full bg-nq-positive text-nq-on-positive font-bold hover:brightness-110 min-h-[44px]"
                >
                  Sobrescrever Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
