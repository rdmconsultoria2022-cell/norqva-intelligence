import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExperimentGuardCard } from '../features/acquisition/ExperimentGuardCard';

// H6/H7/H8: cartão "Teto dos experimentos".

const plans = [
  { id: 'p1', code: 'TR-EXP02', status: 'ACTIVE', max_spend_brl: '420.00', daily_budget_brl: '45.00', spec: { campaign: { name: 'TR_EXP02' } }, spent_brl_last: '180.50', spent_checked_at: '2026-10-07T03:00:00Z', guard_state: 'WATCHING', spend_cap_status: null },
  { id: 'p2', code: 'OLD', status: 'REJECTED', max_spend_brl: '100', daily_budget_brl: '10', spec: { campaign: { name: 'x' } } }
];

function setup(role = 'ADMIN') {
  const showSuccess = vi.fn();
  const apiFetch = vi.fn(async (url: string, _o?: any) => {
    if (url === '/launch-plans') return { plans };
    if (url.endsWith('/spend-cap')) return { cap_brl: 200, spend_cap: { status: 'APPLIED' }, guard: { spent: 180.5 } };
    return { plans: [] };
  });
  render(<ExperimentGuardCard apiFetch={apiFetch} currentUser={{ role }} isDemoView={false} showError={vi.fn()} showSuccess={showSuccess} />);
  return { apiFetch, showSuccess };
}

describe('Teto dos experimentos', () => {
  it('shows running plans with spend vs cap and state', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('guard-plan-TR-EXP02')).toBeInTheDocument());
    expect(screen.queryByTestId('guard-plan-OLD')).toBeNull();
    const card = screen.getByTestId('guard-plan-TR-EXP02');
    expect(card).toHaveTextContent('R$ 180,50');
    expect(card).toHaveTextContent('R$ 420,00');
    expect(card).toHaveTextContent('43,0%');
    expect(screen.getByTestId('guard-state')).toHaveTextContent('Vigiando');
    expect(screen.getByTestId('guard-spend-cap')).toHaveTextContent('ainda não aplicado');
  });

  it('reduces the cap through the spend-cap endpoint', async () => {
    const { apiFetch, showSuccess } = setup();
    await waitFor(() => expect(screen.getByTestId('guard-plan-TR-EXP02')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Alterar teto' }));
    fireEvent.change(screen.getByLabelText('Novo teto de TR-EXP02'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e aplicar na Meta/ }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    const call = apiFetch.mock.calls.find(c => String(c[0]).endsWith('/spend-cap')) as any;
    expect(call[0]).toBe('/launch-plans/p1/spend-cap');
    expect(JSON.parse(call[1].body)).toEqual({ max_spend_brl: 200 });
    expect(String(showSuccess.mock.calls[0][0])).toContain('limite aplicado');
  });

  it('a raise asks for the plan code and a justification', async () => {
    const { apiFetch } = setup();
    await waitFor(() => expect(screen.getByTestId('guard-plan-TR-EXP02')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Alterar teto' }));
    fireEvent.change(screen.getByLabelText('Novo teto de TR-EXP02'), { target: { value: '450' } });
    expect(screen.getByTestId('guard-raise-confirm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Código do plano'), { target: { value: 'TR-EXP02' } });
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Igualar ao limite mínimo aceito pela Meta.' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar e aplicar na Meta/ }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).endsWith('/spend-cap'))).toBe(true));
    const call = apiFetch.mock.calls.find(c => String(c[0]).endsWith('/spend-cap')) as any;
    expect(JSON.parse(call[1].body)).toEqual({ max_spend_brl: 450, confirm_code: 'TR-EXP02', justification: 'Igualar ao limite mínimo aceito pela Meta.' });
  });

  it('shows the Meta backstop when the minimum is above the NORQVA cap', async () => {
    plans[0] = { ...plans[0], max_spend_brl: '200', spend_cap_status: 'BACKSTOP', spend_cap_applied_brl: '300' } as any;
    setup();
    await waitFor(() => expect(screen.getByTestId('guard-spend-cap')).toHaveTextContent('R$ 300,00 aplicado como trava de segurança'));
    expect(screen.getByTestId('guard-spend-cap')).toHaveTextContent('o NORQVA pausa em R$ 200,00');
  });

  it('is ADMIN-only', () => {
    const { apiFetch } = setup('PERFORMANCE');
    expect(screen.queryByTestId('experiment-guard-card')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
