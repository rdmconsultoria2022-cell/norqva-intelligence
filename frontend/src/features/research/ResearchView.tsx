import React, { useCallback, useEffect, useState } from 'react';
import { CampaignBaseView } from '../intelligence/CampaignBaseView';
import { AiTeamView, CriteriaStatus } from '../intelligence/AiTeamView';
import { CriteriaPanel, CriteriaOverview } from './CriteriaPanel';

// NORQVA-0029 (fase 5): tela Pesquisa. Junta Base de campanhas, Time de IAs (lista única de oportunidades),
// os critérios validados pelo dono e o histórico do módulo antigo (só consulta).

export type ResearchTab = 'base' | 'opportunities' | 'criteria' | 'history';

const TABS: { id: ResearchTab; label: string }[] = [
  { id: 'base', label: 'Base' },
  { id: 'opportunities', label: 'Oportunidades' },
  { id: 'criteria', label: 'Critérios' },
  { id: 'history', label: 'Histórico' }
];

interface Props {
  currentUser: any;
  isDemoView: boolean;
  apiFetch: (url: string, options?: RequestInit) => Promise<any>;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  initialTab?: ResearchTab;
  /** O módulo antigo de oportunidades, já montado em modo só leitura pelo App. */
  history?: React.ReactNode;
}

export const ResearchView: React.FC<Props> = ({ currentUser, isDemoView, apiFetch, showError, showSuccess, initialTab = 'base', history }) => {
  const [tab, setTab] = useState<ResearchTab>(initialTab);
  const [criteria, setCriteria] = useState<CriteriaStatus | null>(null);

  useEffect(() => setTab(initialTab), [initialTab]);

  const loadCriteria = useCallback(async () => {
    try {
      const r: CriteriaOverview = await apiFetch('/research/criteria');
      setCriteria({ validated: !!r?.effective?.validated, version: r?.effective?.version ?? null, texts_changed: !!r?.effective?.texts_changed });
    } catch {
      // Sem resposta, trata como não validado (o servidor também recusa a aprovação)
      setCriteria({ validated: false, version: null });
    }
  }, [apiFetch]);

  useEffect(() => {
    loadCriteria();
  }, [loadCriteria]);

  return (
    <div className="space-y-5" data-testid="research-view">
      <div>
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-tight text-nq-text">Pesquisa</h1>
        <p className="mt-1 max-w-3xl text-nq-aux text-nq-muted">
          Do que já roda na conta e no mercado europeu até o plano aprovado. As regras de avaliação ficam na aba Critérios e só valem depois da sua validação.
        </p>
      </div>

      <nav className="-mx-4 px-4 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto no-scrollbar" role="tablist" data-testid="research-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 h-10 px-4 rounded-full text-nq-aux font-medium transition-colors ${tab === t.id ? 'bg-nq-text text-nq-bg' : 'bg-nq-surface text-nq-muted hover:text-nq-text'}`}
          >
            {t.label}
            {t.id === 'criteria' && criteria && !criteria.validated && (
              <span className="ml-1.5 text-nq-caption text-nq-attention" data-testid="criteria-pending">· a validar</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'base' && <CampaignBaseView currentUser={currentUser} isDemoView={isDemoView} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />}
      {tab === 'opportunities' && (
        <AiTeamView currentUser={currentUser} isDemoView={isDemoView} apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} criteria={criteria} />
      )}
      {tab === 'criteria' && (
        <CriteriaPanel
          currentUser={currentUser}
          apiFetch={apiFetch}
          showError={showError}
          showSuccess={showSuccess}
          onChanged={r => setCriteria({ validated: !!r.effective.validated, version: r.effective.version, texts_changed: !!r.effective.texts_changed })}
        />
      )}
      {tab === 'history' && (history || <p className="text-nq-aux text-nq-muted">Sem histórico.</p>)}
    </div>
  );
};
