import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { DashboardView } from '../features/dashboard/DashboardView';

describe('DashboardView Component Regression', () => {
  const mockCurrentUser = { id: '1', name: 'Test User', role: 'ADMIN', email: 'test@norqva.com' };
  const mockExperiments = [
    {
      id: 'exp-1',
      human_id: 'EXP-001',
      name: 'Experiment 1',
      product_name: 'Product A',
      offer_name: 'Offer X',
      capital_approved: '1000',
      capital_used: '200',
      status: 'ATIVO'
    }
  ];

  const mockMetrics = {
    receita: 5000,
    netRevenue: 4500,
    investment: 800,
    contributionMargin: 3700,
    roas: 6.25,
    ctr: 2.5,
    cpc: 0.5,
    capitalUsed: 200,
    capitalApproved: 1000,
    capitalRemaining: 800
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performs exactly 1 initial fetch on mount with default 7_DIAS filter', async () => {
    const apiFetchMock = vi.fn().mockResolvedValue({ metrics: mockMetrics });

    render(
      <DashboardView
        currentUser={mockCurrentUser}
        isDemoView={true}
        experiments={mockExperiments}
        apiFetch={apiFetchMock}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={0}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );

    // Initial loading should display
    expect(screen.getByText(/Carregando métricas consolidadas/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('R$5.000,00')).toBeInTheDocument();
    });

    // Check fetch query parameters and count
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dashboard?mode=demo&filter=7_DIAS'),
      expect.any(Object)
    );
  });

  it('aborts stale requests and discards response correctly', async () => {
    let resolveFirstFetch: any;
    const firstFetchPromise = new Promise((resolve) => {
      resolveFirstFetch = resolve;
    });

    const apiFetchMock = vi.fn()
      .mockImplementationOnce(() => firstFetchPromise)
      .mockResolvedValueOnce({ metrics: mockMetrics });

    const { rerender } = render(
      <DashboardView
        currentUser={mockCurrentUser}
        isDemoView={true}
        experiments={mockExperiments}
        apiFetch={apiFetchMock}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={0}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );

    // Rerender with new refreshTrigger to trigger a new fetch immediately
    rerender(
      <DashboardView
        currentUser={mockCurrentUser}
        isDemoView={true}
        experiments={mockExperiments}
        apiFetch={apiFetchMock}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={1} // changed trigger
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );

    // The first promise resolves now
    resolveFirstFetch({ metrics: { ...mockMetrics, receita: 9999 } });

    await waitFor(() => {
      expect(screen.getByText('R$5.000,00')).toBeInTheDocument();
    });

    // Check that we didn't render the resolved first fetch stale response (9999)
    expect(screen.queryByText('R$9.999,00')).not.toBeInTheDocument();
  });
});
