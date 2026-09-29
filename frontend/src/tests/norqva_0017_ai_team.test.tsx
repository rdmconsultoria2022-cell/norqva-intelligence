import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiTeamView } from '../features/intelligence/AiTeamView';

const base = {
  source: 'MANUAL', source_level: null, brief: 'Testar para autônomos', product_name: 'Bolso Blindado', niche_name: null,
  task_kind: null, task_status: null, task_response: null, session_url: null, updated_at: '2026-09-29T03:00:00Z',
  ai_score: null, verdict: null, evaluation: null, second_opinion: null, plan: null, batch_code: null
};
const opps = [
  { ...base, id: 'o1', human_id: 'OPP-0001', title: 'Autônomos', status: 'CAPTADA' },
  {
    ...base, id: 'o2', human_id: 'OPP-0002', title: 'Nicho UE: Finanças pessoais', source: 'EU_MARKET', status: 'PLANO_PRONTO', ai_score: 74, verdict: 'TESTAR',
    task_kind: 'PLAN', task_status: 'DONE', session_url: 'https://claude.ai/code/session_x',
    evaluation: { by: 'Claude', score: 74, verdict: 'TESTAR', summary: 'Demanda validada na UE.', risks: ['Margem apertada'] },
    second_opinion: { by: 'GPT', score: 61, verdict: 'TESTAR', summary: 'Amostra pequena.', risks: [] },
    plan: { summary: 'Teste de 2 ganchos.', campaign: { daily_budget: 30 }, test_plan: 'Pausar com 2× CPA sem venda.', creatives_count: 2 },
    batch_code: 'OPP-0002-B01'
  }
];

function setup(role = 'ADMIN') {
  const apiFetch = vi.fn(async (url: string, _opts?: any) => (url.startsWith('/ai-team/opportunities?') ? { opportunities: opps } : {}));
  render(<AiTeamView currentUser={{ id: 'u', role }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
}

describe('NORQVA-0017 — Time de IAs', () => {
  it('groups opportunities by stage and shows Claude + GPT opinions and the plan', async () => {
    setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(2));
    expect(screen.getByTestId('ai-stage-CAPTADA')).toHaveTextContent('Autônomos');
    expect(screen.getByTestId('ai-stage-PLANO_PRONTO')).toHaveTextContent('TESTAR · 74');
    fireEvent.click(screen.getByText('Nicho UE: Finanças pessoais'));
    const d = screen.getByTestId('ai-opportunity-detail');
    expect(d).toHaveTextContent('Demanda validada na UE.');
    expect(d).toHaveTextContent('Amostra pequena.');
    expect(screen.getByTestId('ai-opportunity-plan')).toHaveTextContent('OPP-0002-B01');
  });

  it('admin actions call the API with the right payload', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /Pedir avaliação/ }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/ai-team/opportunities/o1/dispatch?mode=real')).toBe(true));
    const call = apiFetch.mock.calls.find(c => c[0] === '/ai-team/opportunities/o1/dispatch?mode=real') as any;
    expect(JSON.parse(call[1].body)).toEqual({ kind: 'EVALUATE' });
    fireEvent.click(screen.getByRole('button', { name: /Aprovar plano/ }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/ai-team/opportunities/o2/decision?mode=real')).toBe(true));
  });

  it('creates an opportunity from a brief; other roles only read', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity').length).toBe(2));
    fireEvent.change(screen.getByPlaceholderText(/testar o Bolso Blindado/), { target: { value: 'Novo público: MEIs' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar/ }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/ai-team/opportunities?mode=real' && c[1]?.method === 'POST')).toBe(true));
  });

  it('non-admin sees no action buttons', async () => {
    setup('CREATIVE');
    await waitFor(() => expect(screen.getAllByTestId('ai-opportunity').length).toBe(2));
    expect(screen.queryByRole('button', { name: /Pedir avaliação/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Criar$/ })).toBeNull();
  });
});
