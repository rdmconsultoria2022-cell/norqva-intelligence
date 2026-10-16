import React, { useEffect, useState } from 'react';
import { DashboardView } from '../dashboard/DashboardView';
import { CreativePerformanceView } from '../intelligence/CreativePerformanceView';
import { DemographicIntelligenceView } from '../intelligence/DemographicIntelligenceView';
import { AccountCreditView } from '../meta-credit/AccountCreditView';
import { DecisionsView } from './DecisionsView';

// NORQVA-0030 (fase 6): tela Resultados. Junta Financeiro (antes em Visão Geral), Performance de Criativos,
// Demografia, Créditos Meta (só ADMIN) e Decisões. Nenhum cálculo muda; as telas só trocam de lugar.

export type ResultsTab = 'financial' | 'creatives' | 'audience' | 'credit' | 'decisions';

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  decisions: any[];
  refreshTrigger: number;
  initialTab?: ResultsTab;
}

export const ResultsView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError, showSuccess, decisions, refreshTrigger, initialTab = 'financial' }) => {
  const isAdmin = currentUser?.role === 'ADMIN';
  const tabs: { id: ResultsTab; label: string }[] = [
    { id: 'financial', label: 'Financeiro' },
    { id: 'creatives', label: 'Criativos' },
    { id: 'audience', label: 'Público' },
    ...(isAdmin ? [{ id: 'credit' as ResultsTab, label: 'Crédito Meta' }] : []),
    { id: 'decisions', label: 'Decisões' }
  ];
  const safe = (t: ResultsTab): ResultsTab => (t === 'credit' && !isAdmin ? 'financial' : t);
  const [tab, setTab] = useState<ResultsTab>(safe(initialTab));
  useEffect(() => setTab(safe(initialTab)), [initialTab, isAdmin]);

  return (
    <div className="space-y-5" data-testid="results-view">
      <div>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Resultados</h1>
        <p className="mt-1 max-w-3xl text-nq-aux text-nq-muted">
          Como estamos indo: dinheiro, criativos, público, crédito da conta Meta e o registro das decisões. Financeiro, Criativos e Público seguem o período escolhido no topo.
        </p>
      </div>

      <nav className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="tablist" data-testid="results-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${tab === t.id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted hover:text-nq-text'}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'financial' && (
        <DashboardView
          section="financial"
          currentUser={currentUser}
          isDemoView={isDemoView}
          experiments={[]}
          apiFetch={apiFetch}
          onSelectExperiment={() => {}}
          onRegisterPerformance={() => {}}
          onAuthorizeCapital={() => {}}
          refreshTrigger={refreshTrigger}
          showError={showError}
          showSuccess={showSuccess}
        />
      )}
      {tab === 'creatives' && <CreativePerformanceView currentUser={currentUser} isDemoView={isDemoView} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />}
      {tab === 'audience' && <DemographicIntelligenceView currentUser={currentUser} isDemoView={isDemoView} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />}
      {tab === 'credit' && isAdmin && <AccountCreditView currentUser={currentUser} isDemoView={isDemoView} apiFetch={apiFetch} showError={showError} />}
      {tab === 'decisions' && <DecisionsView decisions={decisions} />}
    </div>
  );
};
