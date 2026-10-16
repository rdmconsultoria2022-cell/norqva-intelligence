import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DashboardView } from '../features/dashboard/DashboardView';
import { GlobalPeriodProvider } from '../lib/globalPeriod';

// NORQVA-0082 (D-0082): Visão Geral premium — gráfico diário, nome do produto nas campanhas,
// e nunca mostrar zero como se fosse número real quando a leitura falha.

const admin = { id: 'u', name: 'Ricardo', role: 'ADMIN', email: 'r@x.test' } as any;

const exec = {
  meta: {
    spend: 50, impressions: 1000, reach: 800, clicks: 40, ctr: 4, cpc: 1.25, cpm: 50,
    campaigns: [
      { id: 'c1', name: 'NQ_TR_V1_EMO_CBO_OUT26', meta_campaign_id: '111', status: 'ACTIVE', effective_status: 'ACTIVE', last_synced_at: null },
      { id: 'c2', name: 'NQ_SEM_PRODUTO', meta_campaign_id: '222', status: 'PAUSED', effective_status: 'PAUSED', last_synced_at: null }
    ]
  },
  commerce: { totalOrders: 3, pendingOrders: 1, paidOrders: 2, cancelledOrders: 0, grossRevenue: 49.8, aov: 24.9 },
  finance: { totalPixCreated: 3, totalPixConfirmed: 2, approvalRate: 66.7, confirmedRevenue: 49.8, reconciledTransactions: 2 },
  delivery: { totalEntitlements: 2, totalDownloads: 2, completedDownloads: 2, pendingDownloads: 0 },
  recentOrders: []
};
const fin = {
  costCoverage: 'COMPLETE',
  summary: { totalSpend: 50, grossRevenue: 49.8, netProfit: -3.2, paidOrdersCount: 2, roas: 1, costCoverage: 'COMPLETE' },
  byCampaign: [
    { metaCampaignId: '111', campaignName: 'NQ_TR_V1_EMO_CBO_OUT26', productId: 'p1', productName: 'Trattoria em Casa', spend: 40, attributedRevenue: 49.8, attributedOrders: 2, roas: 1.25 },
    { metaCampaignId: '222', campaignName: 'NQ_SEM_PRODUTO', productId: null, productName: null, spend: 10, attributedRevenue: 0, attributedOrders: 0, roas: 0 }
  ]
};
const daily = {
  days: [
    { date: '2026-10-14', revenue: 0, paidOrders: 0, spend: 20 },
    { date: '2026-10-15', revenue: 24.9, paidOrders: 1, spend: 15 },
    { date: '2026-10-16', revenue: 24.9, paidOrders: 1, spend: 15 }
  ]
};

function renderOverview(apiFetch: any) {
  return render(
    <GlobalPeriodProvider initial={{ period: '7d' }}>
      <DashboardView
        section="overview"
        currentUser={admin}
        isDemoView={false}
        experiments={[]}
        apiFetch={apiFetch}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={0}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    </GlobalPeriodProvider>
  );
}

describe('NORQVA-0082 — Visão Geral premium', () => {
  it('mostra o gráfico diário com a lista dos dias', async () => {
    const apiFetch = vi.fn(async (url: string) =>
      url.includes('/executive/daily') ? daily : url.includes('/executive/dashboard') ? exec : url.includes('/financial/dashboard') ? fin : {}
    );
    renderOverview(apiFetch);
    const chart = await screen.findByTestId('daily-chart');
    expect(within(chart).getByRole('img').getAttribute('aria-label')).toContain('14/10 a 16/10');
    fireEvent.click(within(screen.getByTestId('daily-table')).getByRole('button'));
    expect(screen.getByTestId('daily-table').textContent).toContain('R$ 20,00');
    expect(apiFetch.mock.calls.some(c => String(c[0]).startsWith('/executive/daily?mode=real&period=7d'))).toBe(true);
  });

  it('sem a série diária, a tela continua (sem gráfico)', async () => {
    const apiFetch = vi.fn(async (url: string) => {
      if (url.includes('/executive/daily')) throw new Error('falhou');
      return url.includes('/executive/dashboard') ? exec : url.includes('/financial/dashboard') ? fin : {};
    });
    renderOverview(apiFetch);
    await waitFor(() => expect(screen.getByTestId('overview-revenue').textContent).toContain('49,80'));
    expect(screen.queryByTestId('daily-chart')).toBeNull();
  });

  it('campanha aparece com o nome do produto; o nome da Meta fica nos detalhes', async () => {
    const apiFetch = vi.fn(async (url: string) =>
      url.includes('/executive/dashboard') ? exec : url.includes('/financial/dashboard') ? fin : {}
    );
    renderOverview(apiFetch);
    await waitFor(() => expect(screen.getAllByTestId('overview-campaign-name').length).toBe(2));
    const names = screen.getAllByTestId('overview-campaign-name').map(n => n.textContent);
    expect(names).toContain('Trattoria em Casa');
    expect(names).toContain('NQ_SEM_PRODUTO'); // sem vínculo comprovado: fica o nome da Meta
    const first = screen.getAllByTestId('overview-campaign')[0];
    fireEvent.click(within(first).getByRole('button', { name: /Detalhes técnicos/ }));
    expect(first.textContent).toContain('NQ_TR_V1_EMO_CBO_OUT26');
  });

  it('se a leitura falha, mostra "—" e um aviso, nunca R$ 0,00', async () => {
    const showError = vi.fn();
    const apiFetch = vi.fn(async () => {
      throw new Error('servidor fora');
    });
    render(
      <GlobalPeriodProvider initial={{ period: '7d' }}>
        <DashboardView section="overview" currentUser={admin} isDemoView={false} experiments={[]} apiFetch={apiFetch as any}
          onSelectExperiment={vi.fn()} onRegisterPerformance={vi.fn()} onAuthorizeCapital={vi.fn()} refreshTrigger={0}
          showError={showError} showSuccess={vi.fn()} />
      </GlobalPeriodProvider>
    );
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.getByTestId('overview-revenue').textContent).toContain('—');
    expect(screen.getByTestId('overview-revenue').textContent).not.toContain('R$ 0,00');
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar');
  });
});
