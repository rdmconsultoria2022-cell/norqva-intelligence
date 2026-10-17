import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MetaAdsView } from '../features/acquisition/MetaAdsView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };
const perf = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' };
const ops = { id: 'u3', name: 'Ops', email: 'o@norqva.test', role: 'OPERATIONS' };

const campaigns = [
  { id: 'c1', meta_campaign_id: '120249722943110097', name: 'BB-B01 | Rodada 1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '50.00' }
];

const readyStatus = { enabled: true, ready: true, mode: 'real', failedChecks: [], limits: { minDailyBudget: 5, maxDailyBudget: 100 } };

function makeFetch(controlStatus: any) {
  return vi.fn((url: string, _opts?: any) => {
    if (url.startsWith('/meta-control/status')) return Promise.resolve(controlStatus);
    if (url.startsWith('/meta-changes')) return Promise.resolve({ change: { state: 'CONFIRMED' } });
    if (url.includes('/meta/campaigns')) return Promise.resolve(campaigns);
    if (url.includes('/meta/connection/status')) return Promise.resolve({ connected: true });
    return Promise.resolve([]);
  });
}

const renderView = (apiFetch: any, user: any = admin, extra: any = {}) =>
  render(
    <MetaAdsView currentUser={user} isDemoView={false} apiFetch={apiFetch} showError={extra.showError || vi.fn()} showSuccess={extra.showSuccess || vi.fn()} />
  );

describe('NORQVA-0006 — Meta campaign control (UI)', () => {
  it('pausing asks for confirmation, then sends the Meta ID and refreshes', async () => {
    const apiFetch = makeFetch(readyStatus);
    const showSuccess = vi.fn();
    renderView(apiFetch, admin, { showSuccess });

    expect(await screen.findByText(/Controle de campanhas ativo/)).toBeInTheDocument();
    // NORQVA-0083: decimais com vírgula (pt-BR)
    expect(await screen.findByText('R$ 50,00')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Pausar/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('BB-B01 | Rodada 1');
    expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/meta-changes'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    // NORQVA-0097: vira uma ficha de alteração, com id próprio
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/meta-changes?mode=real')).toBe(true));
    const call = apiFetch.mock.calls.find(c => c[0] === '/meta-changes?mode=real')!;
    expect(JSON.parse((call[1] as any).body)).toMatchObject({ entity_type: 'campaign', meta_id: '120249722943110097', kind: 'STATUS', value: 'PAUSED' });
    expect(JSON.parse((call[1] as any).body).id).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('pausado')));
  });

  it('budget above the ceiling cannot be confirmed; a valid value is sent', async () => {
    const apiFetch = makeFetch(readyStatus);
    renderView(apiFetch);

    fireEvent.click(await screen.findByRole('button', { name: /Orçamento/ }));
    const input = screen.getByLabelText(/Novo orçamento diário/);
    fireEvent.change(input, { target: { value: '150' } });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();

    fireEvent.change(input, { target: { value: '70' } });
    // NORQVA-0097: revisão do aumento e confirmação a mais
    expect(screen.getByTestId('budget-review')).toHaveTextContent('+ R$ 20,00 por dia');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Aumentar o gasto em/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => c[0] === '/meta-changes?mode=real')).toBe(true));
    const call = apiFetch.mock.calls.find(c => c[0] === '/meta-changes?mode=real')!;
    expect(JSON.parse((call[1] as any).body)).toMatchObject({ entity_type: 'campaign', kind: 'DAILY_BUDGET', value: 70 });
  });

  it('when the control is off, buttons are disabled and the banner explains how to enable it', async () => {
    const apiFetch = makeFetch({ ...readyStatus, enabled: false, ready: false });
    renderView(apiFetch);
    expect(await screen.findByText(/Controle de campanhas desligado/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Pausar/ })).toBeDisabled();
  });

  it('Performance pede: o orçamento vira pedido ao administrador', async () => {
    const apiFetch = makeFetch(readyStatus);
    renderView(apiFetch, perf);
    fireEvent.click(await screen.findByRole('button', { name: /Orçamento/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('aguardando a autorização do administrador');
    expect(screen.getByRole('button', { name: 'Pedir' })).toBeInTheDocument();
  });

  it('other profiles see no control actions and no control status call', async () => {
    const apiFetch = makeFetch(readyStatus);
    renderView(apiFetch, ops);
    expect(await screen.findByText('BB-B01 | Rodada 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pausar/ })).toBeNull();
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/meta-control/status'), expect.anything(), expect.anything(), expect.anything());
  });
});
