import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { DashboardView } from '../features/dashboard/DashboardView';

describe('DashboardView Component — Financial Intelligence & Executive Views', () => {
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

  const mockFinancialData = {
    mode: 'demo',
    period: 'all',
    dateFilter: null,
    summary: {
      totalSpend: 1500.00,
      grossRevenue: 5000.00,
      paidOrdersCount: 25,
      pendingOrdersCount: 5,
      gatewayFees: 125.00,
      otherCosts: 0.00,
      totalCosts: 125.00,
      isCostKnown: true,
      resultAfterMedia: 3500.00,
      netProfit: 3375.00,
      netMargin: 67.5,
      aov: 200.00,
      roas: 3.33
    },
    byProduct: [
      {
        productId: 'prd-1',
        productHumanId: 'PRD-TRATTORIA-01',
        productName: 'Trattoria em Casa',
        unitsSold: 25,
        grossRevenue: 5000.00,
        attributedSpend: 1500.00,
        gatewayFees: 125.00,
        netProfit: 3375.00,
        netMargin: 67.5
      }
    ],
    byCampaign: [
      {
        campaignId: 'camp-1',
        metaCampaignId: 'CAMP-001',
        campaignName: 'Campanha Trattoria 01',
        status: 'ACTIVE',
        effectiveStatus: 'ACTIVE',
        spend: 1500.00,
        impressions: 45000,
        clicks: 1800,
        ctr: 4.0,
        cpc: 0.83,
        attributedOrders: 20,
        attributedRevenue: 4000.00,
        resultAfterMedia: 2500.00,
        roas: 2.67
      }
    ],
    byCreative: [
      {
        adId: 'ad-1',
        metaAdId: 'AD-001',
        adName: 'Criativo Vídeo Receita',
        adsetName: 'Conjunto Aberto',
        campaignName: 'Campanha Trattoria 01',
        status: 'ACTIVE',
        effectiveStatus: 'ACTIVE',
        spend: 1500.00,
        clicks: 1800,
        impressions: 45000,
        attributedOrders: 20,
        attributedRevenue: 4000.00
      }
    ],
    unattributed: {
      revenue: 1000.00,
      ordersCount: 5
    },
    reconciliation: {
      isReconciled: true,
      productTotalRevenue: 5000.00,
      campaignPlusUnattributedRevenue: 5000.00,
      totalSpendSum: 1500.00,
      revenueDiff: 0.00
    }
  };

  const mockExecutiveData = {
    meta: { spend: 1500, impressions: 45000, reach: 38000, clicks: 1800, ctr: 4.0, cpc: 0.83, cpm: 33.33, campaigns: [] },
    commerce: { totalOrders: 30, pendingOrders: 5, paidOrders: 25, cancelledOrders: 0, grossRevenue: 5000, aov: 200 },
    finance: { totalPixCreated: 30, totalPixConfirmed: 25, approvalRate: 83.3, confirmedRevenue: 5000, reconciledTransactions: 25 },
    delivery: { totalEntitlements: 25, totalDownloads: 20, completedDownloads: 20, pendingDownloads: 5 },
    recentOrders: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Financial Intelligence V1 with KPIs and reconciliation status on mount', async () => {
    const apiFetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/financial/dashboard')) return Promise.resolve(mockFinancialData);
      if (url.includes('/executive/dashboard')) return Promise.resolve(mockExecutiveData);
      return Promise.resolve({});
    });

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
    expect(screen.getByText(/Carregando inteligência financeira/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Inteligência Financeira V1')).toBeInTheDocument();
      expect(screen.getByText(/Integridade financeira ✓ Conciliado/i)).toBeInTheDocument();
      expect(screen.getAllByText('PRD-TRATTORIA-01').length).toBeGreaterThanOrEqual(1);
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/financial/dashboard?mode=demo&period=all'),
      expect.any(Object)
    );
  });

  it('switches between subviews (Financial, Executive, Experiments) seamlessly', async () => {
    const apiFetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/financial/dashboard')) return Promise.resolve(mockFinancialData);
      if (url.includes('/executive/dashboard')) return Promise.resolve(mockExecutiveData);
      return Promise.resolve({});
    });

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

    await waitFor(() => {
      expect(screen.getByText('Inteligência Financeira V1')).toBeInTheDocument();
    });

    // Switch to Executive subview
    fireEvent.click(screen.getByText('Visão Executiva V1'));
    await waitFor(() => {
      expect(screen.getByText(/Funil Transacional Determinístico/i)).toBeInTheDocument();
    });

    // Switch to Experiments subview
    fireEvent.click(screen.getByText(/Experimentos/i));
    await waitFor(() => {
      expect(screen.getByText('Tabela de Experimentos Operacionais')).toBeInTheDocument();
      expect(screen.getByText('EXP-001')).toBeInTheDocument();
    });
  });

  it('renders Real Mode pre-revenue state accurately with negative result after media and verified campaigns', async () => {
    const mockRealFinancialData = {
      mode: 'real',
      period: 'all',
      dataProvenanceAuthority: 'COMMERCIAL_PRODUCTION_ONLY',
      costCoverage: 'COMPLETE',
      gatewayCostState: 'KNOWN_ZERO',
      netResultSemantic: 'RESULTADO_LIQUIDO_REAL',
      summary: {
        totalSpend: 304.44,
        totalImpressions: 7324,
        totalReach: 5517,
        totalClicks: 232,
        grossRevenue: 0.00,
        grossPaidRevenue: 0.00,
        refundPrincipal: 0.00,
        cumulativeGrossRevenue: 0.00,
        netCommercialRevenue: 0.00,
        resultAfterMedia: -304.44,
        gatewayFees: 0.00,
        otherCosts: 0.00,
        totalCosts: 0.00,
        isCostKnown: true,
        costCoverage: 'COMPLETE',
        gatewayCostState: 'KNOWN_ZERO',
        netProfit: -304.44,
        netMargin: null,
        totalOrdersCount: 0,
        paidOrdersCount: 0,
        pendingOrdersCount: 0,
        failedOrdersCount: 0,
        cancelledOrdersCount: 0,
        refundedOrdersCount: 0,
        aov: 0.00,
        roas: 0.00
      },
      byProduct: [],
      byCampaign: [
        {
          campaignId: '3da22866-b978-4e76-9184-eee515d20dbe',
          metaCampaignId: '120249371827010097',
          campaignName: 'NORQVA | EXP-2026-001 | TRATTORIA | SALES',
          status: 'ACTIVE',
          effectiveStatus: 'ACTIVE',
          spend: 169.06,
          impressions: 2499,
          clicks: 124,
          ctr: 4.96,
          cpc: 1.36,
          attributedOrders: 0,
          attributedRevenue: 0.00,
          resultAfterMedia: -169.06,
          roas: 0.00
        },
        {
          campaignId: '52cb8d48-dfe8-458c-b829-2d6e05023803',
          metaCampaignId: '120249269452810097',
          campaignName: 'NORQVA E2E META TESTE 01',
          status: 'ACTIVE',
          effectiveStatus: 'ACTIVE',
          spend: 135.38,
          impressions: 4825,
          clicks: 108,
          ctr: 2.24,
          cpc: 1.25,
          attributedOrders: 0,
          attributedRevenue: 0.00,
          resultAfterMedia: -135.38,
          roas: 0.00
        }
      ],
      byCreative: [],
      unattributed: { ordersCount: 0, revenue: 0 },
      conflicted: { ordersCount: 0, revenue: 0 },
      reconciliation: {
        isReconciled: true,
        totalGrossRevenue: 0.00,
        productTotalRevenue: 0.00,
        campaignAttributedRevenue: 0.00,
        unattributedRevenue: 0.00,
        conflictedRevenue: 0.00,
        campaignPlusUnattributedRevenue: 0.00,
        totalSpend: 304.44,
        campaignTotalSpend: 304.44
      }
    };

    const apiFetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/financial/dashboard')) return Promise.resolve(mockRealFinancialData);
      if (url.includes('/executive/dashboard')) return Promise.resolve(mockExecutiveData);
      return Promise.resolve({});
    });

    render(
      <DashboardView
        currentUser={mockCurrentUser}
        isDemoView={false}
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

    // Wait for financial dashboard to finish loading and render
    expect(await screen.findByText(/Integridade financeira/i)).toBeInTheDocument();
    expect(screen.getByText(/^MODO REAL$/i)).toBeInTheDocument();
    expect(screen.getByText(/Commerce: Pré-produção/i)).toBeInTheDocument();
    
    // Verified Spend & Gross Revenue
    expect(screen.getAllByText(/304,44/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/0,00/).length).toBeGreaterThanOrEqual(1);
    
    // Negative Results (R$ -304,44)
    expect(screen.getAllByText(/-304,44/).length).toBeGreaterThanOrEqual(1);

    // Campaign list rendering
    expect(screen.getAllByText(/NORQVA \| EXP-2026-001 \| TRATTORIA \| SALES/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/NORQVA E2E META TESTE 01/i).length).toBeGreaterThanOrEqual(1);

    // Check period switching
    fireEvent.click(screen.getByText('7 Dias'));
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining('period=7d'),
        expect.any(Object)
      );
    });
  });
});
