// NORQVA-0071: menu fixo no topo com o período compacto à direita; Visão Geral com
// resultados, funil e tráfego Meta Ads (nessa ordem) antes do resto.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GlobalPeriodProvider, useGlobalPeriod, periodQuery } from '../lib/globalPeriod';
import { Header } from '../components/layout/Header';
import { visibleGroups } from '../components/layout/navigation';
import { DashboardView } from '../features/dashboard/DashboardView';

function PeriodProbe() {
  const { globalPeriod } = useGlobalPeriod();
  return <span data-testid="period-probe">{periodQuery(globalPeriod)}</span>;
}

const headerProps = {
  activeTab: 'dashboard',
  setActiveTab: vi.fn(),
  currentUser: { id: 'u', name: 'Ricardo Lucas', role: 'ADMIN', email: 'r@x.test' } as any,
  handleSignOut: vi.fn(),
  groups: visibleGroups('ADMIN'),
  isDemoView: false,
  setIsDemoView: vi.fn()
};

describe('NORQVA-0071: período compacto no menu do topo', () => {
  it('mostra só o período escolhido; as opções ficam ocultas até abrir', () => {
    render(
      <GlobalPeriodProvider initial={{ period: 'today' }}>
        <Header {...headerProps} showPeriodFilter />
      </GlobalPeriodProvider>
    );
    const trigger = screen.getByRole('button', { name: 'Período: Hoje' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: '7 dias' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perfil: Ricardo Lucas' })).toBeInTheDocument();
  });

  it('abre, escolhe e fecha; o período vale para a tela', () => {
    render(
      <GlobalPeriodProvider initial={{ period: 'today' }}>
        <Header {...headerProps} showPeriodFilter />
        <PeriodProbe />
      </GlobalPeriodProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }));
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    expect(screen.getByTestId('period-probe').textContent).toBe('period=7d');
    expect(screen.queryByRole('button', { name: '30 dias' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Período: 7 dias' })).toBeInTheDocument();
  });

  it('Personalizado abre as datas dentro do menu e valida', () => {
    render(
      <GlobalPeriodProvider initial={{ period: 'today' }}>
        <Header {...headerProps} showPeriodFilter />
        <PeriodProbe />
      </GlobalPeriodProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(screen.getByText('Selecione as datas inicial e final.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(screen.getByTestId('period-probe').textContent).toBe('period=custom&startDate=2026-10-01&endDate=2026-10-15');
    expect(screen.getByRole('button', { name: 'Período: 01/10/2026 a 15/10/2026' })).toBeInTheDocument();
  });

  it('fecha ao tocar fora ou com Esc', () => {
    render(
      <GlobalPeriodProvider initial={{ period: 'today' }}>
        <Header {...headerProps} showPeriodFilter />
        <p>fora</p>
      </GlobalPeriodProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }));
    expect(screen.getByRole('button', { name: 'Ontem' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('fora'));
    expect(screen.queryByRole('button', { name: 'Ontem' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Período:/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Ontem' })).not.toBeInTheDocument();
  });

  it('nas telas em que o período não filtra nada, o filtro não aparece', () => {
    render(
      <GlobalPeriodProvider>
        <Header {...headerProps} activeTab="products" />
      </GlobalPeriodProvider>
    );
    expect(screen.queryByTestId('global-period-selector')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Perfil: Ricardo Lucas' })).toBeInTheDocument();
  });
});

describe('NORQVA-0071/0082: ordem da Visão Geral', () => {
  // NORQVA-0082 (D-0082): resultado do período primeiro (receita em destaque e os quatro números),
  // depois o que precisa do operador, desempenho, campanhas e operação (com o crédito Meta).
  it('resultado, precisa de você, desempenho, campanhas e operação, nessa ordem', async () => {
    const apiFetch = vi.fn(async (url: string) => {
      if (url.includes('/executive/dashboard'))
        return {
          meta: { spend: 772.65, impressions: 10005, reach: 8000, clicks: 402, ctr: 4.02, cpc: 1.92, cpm: 77.2, campaigns: [], lastSync: '2026-10-16T16:52:00Z' },
          commerce: { totalOrders: 20, pendingOrders: 6, paidOrders: 14, cancelledOrders: 0, grossRevenue: 380.16, aov: 26.94 },
          finance: { totalPixCreated: 20, totalPixConfirmed: 14, approvalRate: 70, confirmedRevenue: 380.16, reconciledTransactions: 14 },
          delivery: { totalEntitlements: 22, totalDownloads: 12, completedDownloads: 12, pendingDownloads: 10 },
          recentOrders: []
        };
      if (url.includes('/financial/dashboard'))
        return {
          costCoverage: 'PARTIAL',
          summary: { totalSpend: 772.65, grossRevenue: 380.16, netProfit: -410.1, paidOrdersCount: 14, roas: 0.49, costCoverage: 'PARTIAL' },
          byCampaign: []
        };
      return {};
    });
    render(
      <DashboardView
        section="overview"
        currentUser={{ id: 'u', name: 'ADMIN', role: 'ADMIN', email: 'a@x.test' } as any}
        isDemoView={false}
        experiments={[]}
        apiFetch={apiFetch as any}
        onSelectExperiment={vi.fn()}
        onRegisterPerformance={vi.fn()}
        onAuthorizeCapital={vi.fn()}
        refreshTrigger={0}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        metaCreditSlot={<div data-testid="credit-slot">Crédito Meta</div>}
      />
    );
    await waitFor(() => expect(screen.getByTestId('overview-revenue').textContent).toContain('380,16'));
    expect(screen.getByTestId('overview-spend').textContent).toContain('772,65');
    // resultado negativo e custos parciais ficam claros
    expect(screen.getByTestId('overview-net').textContent).toContain('custos parciais');
    expect(screen.getByTestId('overview-net-note').textContent).toContain('Não é lucro contábil');

    const order = ['overview-hero', 'overview-needs-you', 'overview-performance', 'overview-campaigns', 'overview-operation'].map(id =>
      screen.getByTestId(id)
    );
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByTestId('overview-operation').contains(screen.getByTestId('credit-slot'))).toBe(true);

    // tráfego da Meta fica recolhido; ao abrir, mostra os números
    const traffic = screen.getByTestId('overview-meta-traffic');
    fireEvent.click(within(traffic).getByRole('button'));
    expect(traffic.textContent).toContain('10.005');
  });
});
