import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AccountCreditView } from '../features/meta-credit/AccountCreditView';

// Créditos da conta Meta — cartões somente leitura + link para a cobrança da Meta.

const panel = {
  fetched_at: '2026-10-06T21:40:00Z', cached: false,
  account: { id: 'act_123', name: 'NORQVA', currency: 'BRL', status: 1, status_label: 'Ativa', is_prepay: true },
  funding: { type: 20, type_label: 'Saldo pré-pago', display: 'Saldo disponível (R$ 120,00 BRL)', prepaid_balance: 120 },
  limit: 1000, spent: 865.44, available: 134.56, used_pct: 86.5, balance_due: 0,
  spend_7d: 420, avg_daily_7d: 60, active_daily_budgets: 90,
  forecast: { days_at_avg: 2.2, date_at_avg: '2026-10-08', days_at_budgets: 1.5, date_at_budgets: '2026-10-07' },
  alerts: [{ level: 'WARNING', message: 'O limite de gastos da conta acaba em menos de 3 dias no ritmo atual.' }],
  billing_url: 'https://business.facebook.com/billing_hub/accounts/details/?asset_id=123',
  notes: ['Adicionar crédito ou pagar é feito na central de cobrança da Meta (não há API para isso).']
};

describe('Créditos Meta', () => {
  it('shows available credit, forecast, funding and the billing link', async () => {
    const apiFetch = vi.fn(async () => panel);
    render(<AccountCreditView currentUser={{ role: 'ADMIN' }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('credit-available')).toHaveTextContent('134,56'));
    expect(screen.getByTestId('credit-available')).toHaveTextContent('1.000,00');
    expect(screen.getByTestId('credit-forecast')).toHaveTextContent('1,5 dias');
    expect(screen.getByTestId('credit-forecast')).toHaveTextContent('07/10/2026');
    expect(screen.getByTestId('credit-funding')).toHaveTextContent('Saldo pré-pago');
    expect(screen.getByTestId('credit-alerts')).toHaveTextContent('menos de 3 dias');
    expect(screen.getByTestId('credit-add-link')).toHaveAttribute('href', panel.billing_url);
    expect(screen.getByTestId('credit-add-link')).toHaveAttribute('target', '_blank');

    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String((c as any)[0]).includes('refresh=1'))).toBe(true));
    expect(apiFetch.mock.calls.every(c => !(c as any)[1] || (c as any)[1].method === undefined)).toBe(true); // only GETs
  });

  it('shows "Sem limite" when the account has no spending limit', async () => {
    const apiFetch = vi.fn(async () => ({ ...panel, limit: null, available: null, used_pct: null, forecast: { days_at_avg: null, date_at_avg: null, days_at_budgets: null, date_at_budgets: null } }));
    render(<AccountCreditView currentUser={{ role: 'ADMIN' }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('credit-available')).toHaveTextContent('Sem limite'));
  });

  it('is admin-only', () => {
    const apiFetch = vi.fn();
    render(<AccountCreditView currentUser={{ role: 'CREATIVE' }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} />);
    expect(screen.getByTestId('credit-forbidden')).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
