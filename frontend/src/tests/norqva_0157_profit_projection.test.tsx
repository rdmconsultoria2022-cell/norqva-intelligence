import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardView } from '../features/dashboard/DashboardView';
import { GlobalPeriodProvider } from '../lib/globalPeriod';
import { addDays, todayInSaoPaulo } from '../features/dashboard/previousPeriod';

// NORQVA-0157: Visão Geral com Custos abaixo do Investimento, Lucro estimado em destaque e projeção de 30 dias
// pelo ritmo dos últimos 7 dias inteiros (custom: hoje−7 até ontem), qualquer que seja o período escolhido.

const admin = { id: 'u', name: 'Ricardo', role: 'ADMIN', email: 'r@x.test' } as any;
const exec = { meta: { campaigns: [] }, commerce: { pendingOrders: 4 }, finance: {}, delivery: {}, recentOrders: [] };
const period = {
  costCoverage: 'COMPLETE',
  summary: { totalSpend: 542.62, grossRevenue: 607.8, totalCosts: 83.69, netProfit: -18.51, paidOrdersCount: 22, roas: 1.12, costCoverage: 'COMPLETE' },
  byCampaign: []
};
// últimos 7 dias inteiros: R$ 70/dia de receita etc. → 30 dias = ×30/7
const last7 = { summary: { totalSpend: 350, grossRevenue: 700, totalCosts: 70, netProfit: 280, paidOrdersCount: 21 } };

function renderOverview(apiFetch: any) {
  return render(
    <GlobalPeriodProvider initial={{ period: '30d' }}>
      <DashboardView section="overview" currentUser={admin} isDemoView={false} experiments={[]} apiFetch={apiFetch}
        onSelectExperiment={vi.fn()} onRegisterPerformance={vi.fn()} onAuthorizeCapital={vi.fn()} refreshTrigger={0}
        showError={vi.fn()} showSuccess={vi.fn()} />
    </GlobalPeriodProvider>
  );
}

describe('NORQVA-0157 — lucro, custos e projeção de 30 dias', () => {
  it('mostra Custos, Lucro estimado e a projeção pelos últimos 7 dias inteiros', async () => {
    const apiFetch = vi.fn(async (url: string) => {
      if (url.includes('/financial/dashboard') && url.includes(`endDate=${addDays(todayInSaoPaulo(), -1)}`)) return last7;
      if (url.includes('/financial/dashboard')) return period;
      if (url.includes('/executive/dashboard')) return exec;
      return {};
    });
    renderOverview(apiFetch);
    await waitFor(() => expect(screen.getByTestId('overview-costs')).toHaveTextContent('R$ 83,69'));
    expect(screen.getByTestId('overview-net')).toHaveTextContent('Lucro estimado');
    expect(screen.getByTestId('overview-net')).toHaveTextContent('-R$ 18,51');

    await waitFor(() => expect(screen.getByTestId('projection-revenue')).toHaveTextContent('R$ 3.000,00'));
    expect(screen.getByTestId('projection-spend')).toHaveTextContent('R$ 1.500,00');
    expect(screen.getByTestId('projection-costs')).toHaveTextContent('R$ 300,00');
    expect(screen.getByTestId('projection-net')).toHaveTextContent('R$ 1.200,00');
    expect(screen.getByTestId('projection-sales')).toHaveTextContent('90');

    const yesterday = addDays(todayInSaoPaulo(), -1);
    const q = apiFetch.mock.calls.map(c => String(c[0])).find(u => u.includes('period=custom') && new URLSearchParams(u.split('?')[1]).get('endDate') === yesterday)!;
    const start = new URLSearchParams(q.split('?')[1]).get('startDate')!;
    const end = new URLSearchParams(q.split('?')[1]).get('endDate')!;
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
    expect(days).toBe(7);
  });

  it('sem os dados dos 7 dias, a projeção avisa e a tela segue', async () => {
    const apiFetch = vi.fn(async (url: string) => {
      if (url.includes('/financial/dashboard') && url.includes(`endDate=${addDays(todayInSaoPaulo(), -1)}`)) throw new Error('falhou');
      if (url.includes('/financial/dashboard')) return period;
      if (url.includes('/executive/dashboard')) return exec;
      return {};
    });
    renderOverview(apiFetch);
    await waitFor(() => expect(screen.getByTestId('overview-costs')).toHaveTextContent('R$ 83,69'));
    await waitFor(() => expect(screen.getByTestId('overview-projection')).toHaveTextContent('Sem dados dos últimos 7 dias'));
  });
});
