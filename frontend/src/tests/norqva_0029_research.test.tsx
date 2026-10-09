// NORQVA-0029: tela Pesquisa — abas, critérios validados pelo dono, trava do "Aprovar plano" e histórico só leitura.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ResearchView } from '../features/research/ResearchView';
import { CriteriaPanel } from '../features/research/CriteriaPanel';
import { AiTeamView } from '../features/intelligence/AiTeamView';
import { OpportunitiesView } from '../features/opportunities/OpportunitiesView';
import { ShortlistPanel } from '../features/intelligence/ShortlistPanel';

const admin = { id: 'u1', name: 'Ricardo', role: 'ADMIN', email: 'a@x.test' } as any;
const viewer = { id: 'u2', name: 'Ana', role: 'PERFORMANCE', email: 'p@x.test' } as any;

const numbers = {
  winner_min_sales: 3, winner_cpa_ratio: 0.66, promising_cpa_ratio: 1, loser_spend_ratio: 2, loser_ctr_min_pct: 0.6, loser_ctr_min_spend: 15,
  loser_cpa_ratio: 1.5, no_data_spend_ratio: 0.5, no_breakeven_min_spend: 5, no_breakeven_winner_roas: 1.5, shortlist_min_spend: 10,
  shortlist_min_impressions: 500, shortlist_min_days: 2, shortlist_max_cpa_ratio: 1.5, eu_min_ads: 5, eu_w_long_runners: 0.4,
  eu_w_advertisers: 0.25, eu_w_reach: 0.2, eu_w_momentum: 0.15, eu_validated_min: 70, eu_promising_min: 45
};
const defs = [
  { key: 'winner_min_sales', group: 'BASE', label: 'Vencedor: vendas mínimas', unit: 'vendas', min: 1, max: 50, integer: true },
  { key: 'shortlist_min_spend', group: 'SHORTLIST', label: 'Candidato: gasto mínimo', unit: 'R$', min: 0, max: 100000 },
  { key: 'eu_validated_min', group: 'EU', label: 'Nicho validado: nota a partir de', unit: 'pontos', min: 1, max: 100, integer: true }
];
const draftV1 = { version: 1, status: 'DRAFT', numbers, note: null, created_by_name: null, created_at: '2026-10-08T22:00:00Z', validated_by_name: null, validated_at: null, texts_hash: 'h1' };

const overview = (over: any = {}) => ({
  effective: { numbers, version: null, validated: false, texts_changed: false },
  validated: null,
  draft: draftV1,
  versions: [draftV1],
  defs,
  texts: { validator_checks: [{ key: 'AMOSTRA', label: 'Tamanho da amostra e confiança dos dados' }], ai_rules: ['Nunca publicar, pausar ou mudar orçamento na Meta; o dono aprova.'] },
  texts_hash: 'h1',
  ...over
});

const fetcher = (ov: any) =>
  vi.fn(async (url: string, opts?: any) => {
    if (url === '/research/criteria') return ov;
    if (url === '/research/criteria/drafts') return { ...draftV1, version: 2 };
    if (url.includes('/validate')) return { ...draftV1, status: 'VALIDATED' };
    if (url.startsWith('/ai-team/opportunities?')) return { opportunities: [] };
    return {};
  });

describe('NORQVA-0029 — tela Pesquisa', () => {
  it('abre com as quatro abas e avisa que os critérios estão a validar', async () => {
    const apiFetch = fetcher(overview());
    render(
      <ResearchView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} initialTab="history" history={<div data-testid="legacy">antigo</div>} />
    );
    const tabs = screen.getByTestId('research-tabs');
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent?.replace('a validar', ''))).toEqual(['Base', 'Oportunidades', 'Critérios', 'Histórico']);
    expect(await screen.findByTestId('criteria-pending')).toBeInTheDocument();
    expect(screen.getByTestId('legacy')).toBeInTheDocument();
    fireEvent.click(within(tabs).getByText('Oportunidades'));
    expect(await screen.findByTestId('criteria-not-validated')).toBeInTheDocument();
  });

  it('abre na aba pedida pelo endereço antigo', () => {
    render(<ResearchView currentUser={admin} isDemoView={false} apiFetch={fetcher(overview())} showError={vi.fn()} showSuccess={vi.fn()} initialTab="history" history={<div data-testid="legacy" />} />);
    expect(screen.getByTestId('legacy')).toBeInTheDocument();
  });
});

describe('NORQVA-0029 — aba Critérios', () => {
  it('ADMIN ajusta um número: salva só o que mudou como rascunho', async () => {
    const apiFetch = fetcher(overview());
    render(<CriteriaPanel currentUser={admin} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('criteria-status')).toHaveTextContent('Nada validado ainda');
    expect(screen.getByTestId('criteria-texts')).toHaveTextContent('Tamanho da amostra');
    fireEvent.change(screen.getByLabelText('Vencedor: vendas mínimas'), { target: { value: '4' } });
    expect(screen.getByTestId('validate-criteria')).toBeDisabled();
    fireEvent.click(screen.getByTestId('save-criteria-draft'));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(c => c[0] === '/research/criteria/drafts');
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as any).body).numbers).toEqual({ winner_min_sales: '4' });
    });
  });

  it('ADMIN valida o rascunho', async () => {
    const apiFetch = fetcher(overview());
    render(<CriteriaPanel currentUser={admin} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('validate-criteria'));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/research/criteria/1/validate')).toBe(true));
  });

  it('mostra a versão validada em vigor', async () => {
    const validated = { ...draftV1, status: 'VALIDATED', validated_by_name: 'Ricardo', validated_at: '2026-10-08T23:00:00Z' };
    render(
      <CriteriaPanel
        currentUser={admin}
        apiFetch={fetcher(overview({ effective: { numbers, version: 1, validated: true, texts_changed: false }, validated, draft: null, versions: [validated] }))}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );
    expect(await screen.findByTestId('criteria-status')).toHaveTextContent('Valendo: versão 1');
    expect(screen.getByTestId('criteria-status')).toHaveTextContent('Ricardo');
    expect(screen.getByTestId('save-criteria-draft')).toBeDisabled();
  });

  it('perfil de análise só lê', async () => {
    render(<CriteriaPanel currentUser={viewer} apiFetch={fetcher(overview())} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('criteria-status');
    expect(screen.queryByLabelText('Vencedor: vendas mínimas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-criteria-draft')).not.toBeInTheDocument();
    expect(screen.queryByTestId('validate-criteria')).not.toBeInTheDocument();
  });
});

describe('NORQVA-0029 — Oportunidades', () => {
  const opp = {
    id: 'o2', human_id: 'OPP-0002', title: 'Plano pronto', source: 'MANUAL', source_level: null, brief: 'x', status: 'PLANO_PRONTO',
    ai_score: 74, verdict: 'TESTAR', evaluation: { summary: 'ok' }, second_opinion: null, plan: { summary: 'p' }, batch_code: null,
    task_kind: null, task_status: null, task_response: null, session_url: null, updated_at: '2026-10-08T00:00:00Z', criteria_version: null
  };
  const fetchOpps = (list: any[]) => vi.fn(async (url: string) => (url.startsWith('/ai-team/opportunities?') ? { opportunities: list } : {}));

  it('sem critérios validados, Aprovar plano fica travado e a avaliação mostra o aviso', async () => {
    render(<AiTeamView currentUser={admin} isDemoView={false} apiFetch={fetchOpps([opp])} showError={vi.fn()} showSuccess={vi.fn()} criteria={{ validated: false, version: null }} />);
    expect(await screen.findByTestId('criteria-badge')).toHaveTextContent('critério não validado');
    expect(screen.getByRole('button', { name: /Aprovar plano/ })).toBeDisabled();
  });

  it('com critérios validados, Aprovar plano libera e mostra a versão usada', async () => {
    render(
      <AiTeamView currentUser={admin} isDemoView={false} apiFetch={fetchOpps([{ ...opp, criteria_version: 3 }])} showError={vi.fn()} showSuccess={vi.fn()} criteria={{ validated: true, version: 3 }} />
    );
    expect(await screen.findByTestId('criteria-badge')).toHaveTextContent('critérios v3');
    expect(screen.getByRole('button', { name: /Aprovar plano/ })).not.toBeDisabled();
    expect(screen.queryByTestId('criteria-not-validated')).not.toBeInTheDocument();
  });
});

describe('NORQVA-0029 — Histórico e seleção', () => {
  it('o módulo antigo fica só para consulta, sem botão de nova oportunidade', () => {
    render(
      <OpportunitiesView
        readOnly
        opportunities={[]}
        users={[]}
        currentUser={admin}
        isDemoView={false}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshOpportunities={vi.fn()}
        refreshProducts={vi.fn()}
        refreshDecisions={vi.fn()}
      />
    );
    expect(screen.getByTestId('legacy-readonly')).toHaveTextContent('Só para consulta');
    expect(screen.queryByRole('button', { name: /Nova Oportunidade/ })).not.toBeInTheDocument();
  });

  it('a seleção de candidatos usa os limites validados do servidor no primeiro carregamento', async () => {
    const apiFetch = vi.fn(async (_url: string) => ({
      criteria: { limit: 30, levels: ['campaign', 'ad'], classes: ['VENCEDOR'], min_spend: 25, min_impressions: 800, min_days: 3, max_cpa_ratio: 1.2, require_product: false },
      candidates: [],
      pool: { campaign: 0, ad: 0 },
      excluded: { total: 0, by_reason: {} },
      note: null
    }));
    render(<ShortlistPanel mode="real" periodQs="" canSend apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch.mock.calls[0][0]).not.toContain('min_spend');
    expect(await screen.findByTestId('shortlist-criteria-summary')).toHaveTextContent('Dias no ar ≥ 3');
  });
});
