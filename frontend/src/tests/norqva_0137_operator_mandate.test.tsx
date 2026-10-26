// NORQVA-0137: cartão do mandato do operador (tela Campanhas, só ADMIN).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OperatorMandate, parseCampaignLines } from '../features/campaigns/OperatorMandate';

const live = {
  mandate: {
    id: 'm1',
    name: 'Mandato Trattoria',
    status: 'ACTIVE',
    ends_at: '2026-11-16T17:21:00Z',
    days_left: 21,
    capital_brl: 1500,
    daily_cap_brl: 100,
    daily_budget_sum_brl: 60,
    spent_brl: 120,
    result_brl: -45.5,
    paid_sales: 3,
    rules: { brake_spend_brl: 750 },
    brake: { state: 'LIVRE', pause_pending: false },
    last_check_at: '2026-10-26T18:00:00Z',
    last_check_error: null,
    campaigns: [{ meta_campaign_id: '120250112900200097', name: 'NQ – Kit 5 livros', status: 'ACTIVE', offer_human_id: 'OFF-000012', offer_source: 'CONFIGURED', max_cpa: 26.12, spend: 120, paid_sales: 3, cpa: 40 }]
  }
};

function setup(data: any) {
  const showSuccess = vi.fn();
  const showError = vi.fn();
  const apiFetch = vi.fn(async (url: string, o?: any) => {
    if (!o?.method) return data;
    return data;
  });
  render(<OperatorMandate apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />);
  return { apiFetch, showSuccess, showError };
}
const call = (apiFetch: any, url: string) => apiFetch.mock.calls.find((c: any[]) => String(c[0]).startsWith(url) && c[1]?.method) as any;

describe('NORQVA-0137 — mandato do operador', () => {
  it('lê "ID" ou "ID:oferta" por linha', () => {
    expect(parseCampaignLines('123456\n789012:OFF-000012\n')).toEqual([{ meta_campaign_id: '123456' }, { meta_campaign_id: '789012', offer_human_id: 'OFF-000012' }]);
  });

  it('mostra situação, capital, resultado, freio e campanhas; encerrar pede ENCERRAR', async () => {
    const { apiFetch } = setup(live);
    expect(await screen.findByText('Em operação')).toBeInTheDocument();
    expect(screen.getByTestId('mandate-spent')).toHaveTextContent('120');
    expect(screen.getByTestId('mandate-brake')).toHaveTextContent('Livre');
    expect(screen.getByText('NQ – Kit 5 livros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar mandato' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar encerramento' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Confirmação para encerrar'), { target: { value: 'encerrar' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(call(apiFetch, '/mandate/end')).toBeTruthy());
    expect(JSON.parse(call(apiFetch, '/mandate/end')[1].body)).toEqual({ confirm: 'encerrar' });
  });

  it('sem mandato: ativar pede confirmação e manda as campanhas', async () => {
    const { apiFetch } = setup({ mandate: null });
    expect(await screen.findByTestId('mandate-empty')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Campanhas do mandato'), { target: { value: '120250112900200097:OFF-000012' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ativar mandato' }));
    expect(call(apiFetch, '/mandate?')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ativação' }));
    await waitFor(() => expect(call(apiFetch, '/mandate?')).toBeTruthy());
    expect(JSON.parse(call(apiFetch, '/mandate?')[1].body)).toEqual({ campaigns: [{ meta_campaign_id: '120250112900200097', offer_human_id: 'OFF-000012' }] });
  });
});
