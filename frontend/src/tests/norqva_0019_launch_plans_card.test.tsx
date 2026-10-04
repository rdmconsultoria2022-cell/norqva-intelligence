import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LaunchPlansCard, LaunchPlan } from '../features/acquisition/LaunchPlansCard';

// NORQVA-0019: card "Aguardando sua decisão" — pergunta, resumo e SIM/NÃO com confirmação.

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };

const plan: LaunchPlan = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'TR-EXP02',
  status: 'AWAITING_OPERATOR',
  question_text: 'Ativar NORQVA_TRATTORIA_EXP02_CREATIVE com R$ 45/dia (3 × R$ 15), teto de R$ 420? A campanha de controle não é alterada.',
  daily_budget_brl: 45,
  max_spend_brl: 420,
  spec: {
    campaign: { name: 'NORQVA_TRATTORIA_EXP02_CREATIVE' },
    adsets: [
      { name: 'TR_EXP02_V1_EMO', daily_budget_brl: 15, targeting_summary: 'Brasil, 25–65 anos' },
      { name: 'TR_EXP02_V2_FOOD', daily_budget_brl: 15 },
      { name: 'TR_EXP02_V3_HYB', daily_budget_brl: 15 }
    ],
    ads: [
      { name: 'TR_V1_EMO', adset_name: 'TR_EXP02_V1_EMO' },
      { name: 'TR_V2_FOOD', adset_name: 'TR_EXP02_V2_FOOD' },
      { name: 'TR_V3_HYB', adset_name: 'TR_EXP02_V3_HYB' }
    ],
    pause_rules: ['Teto do experimento: R$ 420 no total.']
  }
};

function setup(opts: { user?: any; isDemoView?: boolean; plans?: LaunchPlan[] } = {}) {
  let plans = opts.plans ?? [plan];
  const apiFetch = vi.fn(async (url: string, _opts?: any) => {
    if (url === '/launch-plans') return { plans };
    if (url.endsWith('/answer')) {
      plans = [];
      return { plan: { ...plan, status: 'ACTIVE' } };
    }
    return {};
  });
  const showSuccess = vi.fn();
  const showError = vi.fn();
  render(
    <LaunchPlansCard apiFetch={apiFetch} currentUser={opts.user ?? admin} isDemoView={opts.isDemoView ?? false} showError={showError} showSuccess={showSuccess} />
  );
  return { apiFetch, showSuccess, showError };
}

describe('NORQVA-0019 — LaunchPlansCard', () => {
  it('shows the question and the plan summary', async () => {
    setup();
    expect(await screen.findByText('Aguardando sua decisão')).toBeInTheDocument();
    expect(screen.getByText(plan.question_text)).toBeInTheDocument();
    const card = screen.getByTestId('launch-plan-TR-EXP02');
    expect(card).toHaveTextContent('NORQVA_TRATTORIA_EXP02_CREATIVE');
    expect(card).toHaveTextContent('Conjuntos (3)');
    expect(card).toHaveTextContent('Anúncios (3)');
    expect(card).toHaveTextContent('R$ 45,00');
    expect(card).toHaveTextContent('R$ 420,00');
  });

  it('YES asks for confirmation before calling the answer endpoint', async () => {
    const { apiFetch, showSuccess } = setup();
    fireEvent.click(await screen.findByRole('button', { name: /Sim, ativar/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('NORQVA_TRATTORIA_EXP02_CREATIVE');
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/answer'), expect.anything(), expect.anything(), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/launch-plans/${plan.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'YES' }) }, 'real', admin)
    );
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('ativada')));
    await waitFor(() => expect(screen.queryByTestId('launch-plans-card')).not.toBeInTheDocument());
  });

  it('NO sends NO after confirmation; cancel sends nothing', async () => {
    const { apiFetch } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Não' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/launch-plans/${plan.id}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'NO' }) }, 'real', admin)
    );
  });

  it('lists only plans that need the operator; an incomplete activation offers only "Sim"', async () => {
    setup({
      plans: [
        { ...plan, id: 'p-active', code: 'TR-OLD', status: 'ACTIVE' },
        { ...plan, id: 'p-approved', code: 'TR-RETRY', status: 'APPROVED', last_error: 'A Meta não respondeu' }
      ]
    });
    const card = await screen.findByTestId('launch-plan-TR-RETRY');
    expect(card).toHaveTextContent('Ativação incompleta');
    expect(screen.queryByTestId('launch-plan-TR-OLD')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Não' })).not.toBeInTheDocument();
  });

  it('hidden for non-admins', async () => {
    const a = setup({ user: { ...admin, role: 'PERFORMANCE' } });
    expect(a.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('launch-plans-card')).not.toBeInTheDocument();
  });

  it('hidden in DEMO view and when the list is empty', async () => {
    const demo = setup({ isDemoView: true });
    expect(demo.apiFetch).not.toHaveBeenCalled();
    const empty = setup({ plans: [] });
    await waitFor(() => expect(empty.apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('launch-plans-card')).not.toBeInTheDocument();
  });
});
