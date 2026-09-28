import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MetaAdsView } from '../features/acquisition/MetaAdsView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };
const perf = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' };

const campaigns = [
  { id: 'c1', meta_campaign_id: '120249722943110097', name: 'BB-B01 | Rodada 1', objective: 'OUTCOME_SALES', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '50.00' }
];

const readyStatus = { enabled: true, ready: true, mode: 'real', failedChecks: [], limits: { minDailyBudget: 5, maxDailyBudget: 100 } };

function makeFetch(controlStatus: any) {
  return vi.fn((url: string, _opts?: any) => {
    if (url.startsWith('/meta-control/status')) return Promise.resolve(controlStatus);
    if (url.startsWith('/meta-control/')) return Promise.resolve({ success: true });
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
    expect(await screen.findByText('R$ 50.00')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Pausar/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('BB-B01 | Rodada 1');
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/meta-control/campaign'), expect.anything(), expect.anything(), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/meta-control/campaign/120249722943110097/status?mode=real',
        { method: 'POST', body: JSON.stringify({ status: 'PAUSED' }) },
        'real',
        admin
      )
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/meta-control/campaign/120249722943110097/budget?mode=real',
        { method: 'POST', body: JSON.stringify({ daily_budget: 70 }) },
        'real',
        admin
      )
    );
  });

  it('when the control is off, buttons are disabled and the banner explains how to enable it', async () => {
    const apiFetch = makeFetch({ ...readyStatus, enabled: false, ready: false });
    renderView(apiFetch);
    expect(await screen.findByText(/Controle de campanhas desligado/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Pausar/ })).toBeDisabled();
  });

  it('non-admin sees no control actions and no control status call', async () => {
    const apiFetch = makeFetch(readyStatus);
    renderView(apiFetch, perf);
    expect(await screen.findByText('BB-B01 | Rodada 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pausar/ })).toBeNull();
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/meta-control/status'), expect.anything(), expect.anything(), expect.anything());
  });
});
