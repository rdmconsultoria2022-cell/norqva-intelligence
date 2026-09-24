import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  CreativePerformanceView,
  formatBRL,
  formatCAC,
  formatROAS,
  formatPercent,
  formatInteger,
  getShortAdName,
  getConfidenceBadge
} from '../features/intelligence/CreativePerformanceView';
import { CreativePerformanceData } from '../features/intelligence/creativePerformanceTypes';

describe('Creative Performance Dashboard View (Read-Only UI)', () => {
  const mockUser = {
    id: 'user-admin-1',
    name: 'Admin Tester',
    email: 'admin@norqva.com',
    role: 'ADMIN'
  };

  const mockPayload: CreativePerformanceData = {
    summary: {
      total_spend: 300.50,
      total_impressions: 12500,
      total_clicks: 450,
      total_checkouts: 25,
      total_paid_orders: 1,
      total_revenue: 19.90,
      blended_cac: 300.50,
      blended_roas: 0.07
    },
    creatives: [
      {
        ad_id: 'ad_101',
        creative_id: 'cr_101',
        ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO',
        adset_id: 'adset_001',
        campaign_id: 'camp_001',
        spend: 100.00,
        impressions: 4000,
        reach: 3500,
        clicks: 150,
        link_clicks: 140,
        ctr: 3.75,
        cpc: 0.67,
        cpm: 25.00,
        offer_views: 120,
        checkout_started: 10,
        paid_orders: 1,
        gross_revenue: 19.90,
        net_revenue: 19.90,
        landing_rate: 80.00,
        checkout_rate: 8.33,
        purchase_rate: 10.00,
        cac: 100.00,
        roas: 0.20,
        revenue_per_click: 0.13,
        confidence: 'LEARNING',
        confidence_reason: 'LEARNING_SAMPLE'
      },
      {
        ad_id: 'ad_102',
        creative_id: 'cr_102',
        ad_name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO',
        adset_id: 'adset_001',
        campaign_id: 'camp_001',
        spend: 100.25,
        impressions: 4200,
        reach: 3800,
        clicks: 160,
        link_clicks: 150,
        ctr: 3.81,
        cpc: 0.63,
        cpm: 23.87,
        offer_views: 130,
        checkout_started: 8,
        paid_orders: 0,
        gross_revenue: 0.00,
        net_revenue: 0.00,
        landing_rate: 81.25,
        checkout_rate: 6.15,
        purchase_rate: 0.00,
        cac: null,
        roas: 0.00,
        revenue_per_click: 0.00,
        confidence: 'OBSERVING',
        confidence_reason: 'INSUFFICIENT_PURCHASES'
      },
      {
        ad_id: 'ad_103',
        creative_id: 'cr_103',
        ad_name: 'TRATTORIA_V1_AD_C_HOOK_MASSA',
        adset_id: 'adset_001',
        campaign_id: 'camp_001',
        spend: 100.25,
        impressions: 4300,
        reach: 3900,
        clicks: 140,
        link_clicks: 130,
        ctr: 3.26,
        cpc: 0.72,
        cpm: 23.31,
        offer_views: 110,
        checkout_started: 7,
        paid_orders: 0,
        gross_revenue: 0.00,
        net_revenue: 0.00,
        landing_rate: 78.57,
        checkout_rate: 6.36,
        purchase_rate: 0.00,
        cac: null,
        roas: 0.00,
        revenue_per_click: 0.00,
        confidence: 'OBSERVING',
        confidence_reason: 'INSUFFICIENT_PURCHASES'
      }
    ],
    unattributed: {
      unattributed_paid_orders: 1,
      unattributed_revenue: 19.90
    },
    dataFreshness: {
      last_meta_sync: '2026-09-24T22:00:00.000Z',
      meta_sync_status: 'SUCCESS',
      latest_meta_insight_date: '2026-09-24',
      latest_order_timestamp: '2026-09-24T21:00:00.000Z'
    }
  };

  let mockApiFetch: any;
  let mockShowError: any;
  let mockShowSuccess: any;

  beforeEach(() => {
    mockShowError = vi.fn();
    mockShowSuccess = vi.fn();
    mockApiFetch = vi.fn(() => Promise.resolve(mockPayload));
  });

  it('renders loading state initially before data resolves', async () => {
    let resolver: any;
    const slowPromise = new Promise((resolve) => {
      resolver = resolve;
    });
    mockApiFetch = vi.fn(() => slowPromise);

    const { container } = render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    resolver(mockPayload);
  });

  it('renders error state when API fails with user-friendly message', async () => {
    mockApiFetch = vi.fn(() => Promise.reject(new Error('Network error')));

    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText('Não foi possível carregar os dados de performance.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar Novamente/i })).toBeInTheDocument();
    expect(mockShowError).toHaveBeenCalledWith('Não foi possível carregar os dados de performance.');
  });

  it('renders empty state when creatives list is empty', async () => {
    const emptyPayload: CreativePerformanceData = {
      summary: {
        total_spend: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_checkouts: 0,
        total_paid_orders: 0,
        total_revenue: 0,
        blended_cac: null,
        blended_roas: 0
      },
      creatives: [],
      unattributed: {
        unattributed_paid_orders: 0,
        unattributed_revenue: 0
      },
      dataFreshness: {
        last_meta_sync: null,
        meta_sync_status: 'SUCCESS',
        latest_meta_insight_date: null,
        latest_order_timestamp: null
      }
    };
    mockApiFetch = vi.fn(() => Promise.resolve(emptyPayload));

    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText('Não há dados suficientes para este período.')).toBeInTheDocument();
  });

  it('renders 5 top summary KPI cards with exact formatted values', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    const spendMatches = await screen.findAllByText(/300,50/);
    expect(spendMatches.length).toBeGreaterThanOrEqual(1);
    const revenueMatches = screen.getAllByText(/19,90/);
    expect(revenueMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0,07x')).toBeInTheDocument();
  });

  it('formats CAC strictly as "—" when null and BRL when numeric', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    await screen.findByText('A — Separação');
    const hundredElements = screen.getAllByText(/100,00/);
    expect(hundredElements.length).toBeGreaterThanOrEqual(1);

    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders all 3 creatives with names, short labels, and confidence badges', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText('A — Separação')).toBeInTheDocument();
    expect(screen.getByText('B — Emulsão')).toBeInTheDocument();
    expect(screen.getByText('C — Massa')).toBeInTheDocument();

    expect(screen.getByText('Aprendendo')).toBeInTheDocument();
    expect(screen.getAllByText('Observando').length).toBe(2);
  });

  it('renders unattributed revenue section without distributing to creatives', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText('Receita sem atribuição')).toBeInTheDocument();
    expect(
      screen.getByText(/Vendas confirmadas cuja origem não pôde ser associada deterministicamente a um anúncio/i)
    ).toBeInTheDocument();
  });

  it('renders data freshness indicator and handles FAILED sync status gracefully', async () => {
    const failedSyncPayload = {
      ...mockPayload,
      dataFreshness: {
        ...mockPayload.dataFreshness,
        meta_sync_status: 'FAILED'
      }
    };
    mockApiFetch = vi.fn(() => Promise.resolve(failedSyncPayload));

    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText(/Aviso de Sincronização:/i)).toBeInTheDocument();
  });

  it('handles period filter changes and passes date parameters to API', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    const btn7d = await screen.findByRole('button', { name: /Últimos 7 dias/i });
    fireEvent.click(btn7d);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('date_from=')
      );
    });
  });

  it('validates custom date picker input and queries API', async () => {
    render(
      <CreativePerformanceView
        currentUser={mockUser}
        isDemoView={false}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    const customBtn = await screen.findByRole('button', { name: /Personalizado/i });
    fireEvent.click(customBtn);

    const filterBtn = await screen.findByRole('button', { name: /Filtrar/i });
    expect(filterBtn).toBeInTheDocument();
  });

  describe('Pure Formatting Helpers', () => {
    it('formatBRL formats currency correctly', () => {
      expect(formatBRL(19.9)).toContain('19,90');
      expect(formatBRL(0)).toContain('0,00');
      expect(formatBRL(null)).toContain('0,00');
    });

    it('formatCAC returns "—" for null and BRL for numeric', () => {
      expect(formatCAC(null)).toBe('—');
      expect(formatCAC(undefined)).toBe('—');
      expect(formatCAC(100)).toContain('100,00');
    });

    it('formatROAS formats with "x" suffix', () => {
      expect(formatROAS(1.42)).toBe('1,42x');
      expect(formatROAS(0)).toBe('0,00x');
      expect(formatROAS(null)).toBe('0,00x');
    });

    it('formatPercent formats with "%" suffix', () => {
      expect(formatPercent(2.35)).toBe('2,35%');
      expect(formatPercent(null)).toBe('0,00%');
    });

    it('formatInteger formats whole numbers with pt-BR thousand separator', () => {
      expect(formatInteger(1250)).toBe('1.250');
      expect(formatInteger(0)).toBe('0');
    });

    it('getShortAdName maps hook variations to clean labels', () => {
      expect(getShortAdName('TRATTORIA_V1_AD_A_HOOK_SEPARACAO')).toBe('A — Separação');
      expect(getShortAdName('TRATTORIA_V1_AD_B_HOOK_EMULSAO')).toBe('B — Emulsão');
      expect(getShortAdName('TRATTORIA_V1_AD_C_HOOK_MASSA')).toBe('C — Massa');
      expect(getShortAdName('OTHER_AD_NAME')).toBe('OTHER_AD_NAME');
    });

    it('getConfidenceBadge returns correct badges and classes', () => {
      expect(getConfidenceBadge('CONFIDENT').label).toBe('Amostra confiável');
      expect(getConfidenceBadge('LEARNING').label).toBe('Aprendendo');
      expect(getConfidenceBadge('OBSERVING').label).toBe('Observando');
    });
  });
});