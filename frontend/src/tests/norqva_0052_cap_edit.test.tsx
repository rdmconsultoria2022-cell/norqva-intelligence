// NORQVA-0052: editar o teto em qualquer situação e regra "campanha lucrativa não é pausada".
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExperimentGuardCard, ceilingOfPlan } from '../features/acquisition/ExperimentGuardCard';

const base = { daily_budget_brl: '20.00', spec: { campaign: { name: 'KIT' } }, spend_cap_status: null };

function setup(plan: any, guard: any = null) {
  const showSuccess = vi.fn();
  const onChanged = vi.fn();
  const apiFetch = vi.fn(async (url: string, _o?: any) => {
    if (url === '/launch-plans') return { plans: [plan] };
    if (url.endsWith('/guard')) return guard;
    if (url.endsWith('/spend-cap')) return { cap_brl: 300, spend_cap: { status: 'SKIPPED' }, uncapped: plan.guard_state === 'CAPPED' };
    return {};
  });
  render(<ExperimentGuardCard apiFetch={apiFetch} currentUser={{ role: 'ADMIN' }} isDemoView={false} showError={vi.fn()} showSuccess={showSuccess} planId={plan.id} onChanged={onChanged} />);
  return { apiFetch, showSuccess, onChanged };
}

const spendCall = (apiFetch: any) => apiFetch.mock.calls.find((c: any[]) => String(c[0]).endsWith('/spend-cap')) as any;

describe('NORQVA-0052 — editar teto na tela Campanhas', () => {
  it('teto máximo padrão é 3x o teto inicial', () => {
    expect(ceilingOfPlan({ id: 'x', code: 'X', status: 'ACTIVE', max_spend_brl: '200', daily_budget_brl: '20' })).toBe(600);
    expect(ceilingOfPlan({ id: 'x', code: 'X', status: 'ACTIVE', max_spend_brl: '300', max_spend_initial_brl: '200', daily_budget_brl: '20' })).toBe(600);
    expect(ceilingOfPlan({ id: 'x', code: 'X', status: 'ACTIVE', max_spend_brl: '300', max_spend_ceiling_brl: '450', daily_budget_brl: '20' })).toBe(450);
  });

  it('rascunho aparece e sobe o teto sem pedir código (nada gasta antes do Sim)', async () => {
    const { apiFetch, onChanged } = setup({ ...base, id: 'd1', code: 'CMP-KIT', status: 'DRAFT', max_spend_brl: '160.00' });
    fireEvent.click(await screen.findByRole('button', { name: 'Editar teto' }));
    fireEvent.change(screen.getByLabelText('Novo teto de CMP-KIT'), { target: { value: '200' } });
    expect(screen.queryByTestId('guard-raise-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(JSON.parse(spendCall(apiFetch)[1].body)).toEqual({ max_spend_brl: 200 });
  });

  it('campanha parada no teto pode subir o teto (com código e motivo) e mostra o lucro atual', async () => {
    const plan = { ...base, id: 'c1', code: 'CMP-TR', status: 'ACTIVE', experiment_id: 'e1', max_spend_brl: '200.00', spent_brl_last: '201.00', guard_state: 'CAPPED', cap_extensions: 1 };
    const { apiFetch, showSuccess } = setup(plan, { profit: { sales: 5, net_brl: 130, spent_brl: 201, min_sales: 3, profitable_lifetime: false } });
    expect(await screen.findByTestId('guard-profit-now')).toHaveTextContent('ainda sem lucro comprovado');
    expect(screen.getByTestId('guard-profit-rule')).toHaveTextContent('não pausa');
    expect(screen.getByTestId('guard-profit-rule')).toHaveTextContent('R$ 600,00');
    fireEvent.click(screen.getByRole('button', { name: 'Editar teto' }));
    fireEvent.change(screen.getByLabelText('Novo teto de CMP-TR'), { target: { value: '300' } });
    expect(screen.getByTestId('guard-raise-confirm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Código da campanha'), { target: { value: 'CMP-TR' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Mais uma semana de teste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(JSON.parse(spendCall(apiFetch)[1].body)).toEqual({ max_spend_brl: 300, confirm_code: 'CMP-TR', justification: 'Mais uma semana de teste' });
    expect(String(showSuccess.mock.calls[0][0])).toContain('continua pausada até você reativar');
  });

  it('teto máximo e "não pausar com lucro" vão juntos; desligar não pede código', async () => {
    const { apiFetch } = setup({ ...base, id: 'a1', code: 'CMP-A', status: 'ACTIVE', max_spend_brl: '200.00', guard_state: 'WATCHING' });
    fireEvent.click(await screen.findByRole('button', { name: 'Editar teto' }));
    expect(screen.getByLabelText('Teto máximo de CMP-A')).toHaveValue('600');
    fireEvent.change(screen.getByLabelText('Teto máximo de CMP-A'), { target: { value: '400' } });
    fireEvent.click(screen.getByLabelText('Não pausar se estiver dando lucro'));
    expect(screen.queryByTestId('guard-raise-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(spendCall(apiFetch)).toBeTruthy());
    expect(JSON.parse(spendCall(apiFetch)[1].body)).toEqual({ max_spend_brl: 200, max_spend_ceiling_brl: 400, profit_extend_enabled: false });
  });
});
