import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MetaAdsView } from '../features/acquisition/MetaAdsView';

describe('Meta Acquisition Core Frontend (Phase A - Read-Only Ingestion)', () => {
  const mockAdminUser = {
    id: 'user-admin-1',
    name: 'Admin Tester',
    email: 'admin@norqva.com',
    role: 'ADMIN'
  };

  const mockStatus = {
    connected: true,
    environment: 'DEMO',
    isConfigured: true,
    adAccountIdMasked: 'act_...DEMO',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    apiVersion: 'v20.0'
  };

  const mockCampaigns = [
    {
      id: 'cmp-1',
      meta_campaign_id: 'cmp_demo_001',
      name: 'Campanha Escala E2E',
      objective: 'OUTCOME_SALES',
      status: 'ACTIVE',
      last_synced_at: new Date().toISOString()
    }
  ];

  const mockInsights = [
    {
      id: 'ins-1',
      entity_level: 'CAMPAIGN',
      entity_meta_id: 'cmp_demo_001',
      campaign_name: 'Campanha Escala E2E',
      date_start: '2026-08-01',
      date_stop: '2026-08-27',
      spend: '1500.00',
      impressions: '50000',
      clicks: '1000',
      cpc: '1.50',
      cpm: '30.00',
      ctr: '2.00'
    }
  ];

  let mockApiFetch: any;
  let mockShowError: any;
  let mockShowSuccess: any;

  beforeEach(() => {
    mockShowError = vi.fn();
    mockShowSuccess = vi.fn();
    mockApiFetch = vi.fn((url: string) => {
      if (url.includes('/meta/connection/status')) return Promise.resolve(mockStatus);
      if (url.includes('/meta/campaigns')) return Promise.resolve(mockCampaigns);
      if (url.includes('/meta/adsets')) return Promise.resolve([]);
      if (url.includes('/meta/ads')) return Promise.resolve([]);
      if (url.includes('/meta/insights')) return Promise.resolve(mockInsights);
      if (url.includes('/meta/sync')) return Promise.resolve({ success: true, message: 'Sync done' });
      return Promise.resolve([]);
    });
  });

  it('renders mandatory read-only governance banner', async () => {
    render(
      <MetaAdsView
        currentUser={mockAdminUser}
        isDemoView={true}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText(/Dados de mídia em modo somente leitura/i)).toBeInTheDocument();
    expect(screen.getByText(/Atribuição de vendas ainda não certificada/i)).toBeInTheDocument();
  });

  it('renders summary KPI cards with spend, impressions, clicks, CPC, CPM, and CTR', async () => {
    render(
      <MetaAdsView
        currentUser={mockAdminUser}
        isDemoView={true}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    expect(await screen.findByText('R$ 1.500,00')).toBeInTheDocument();
    expect(screen.getByText('50.000')).toBeInTheDocument();
    expect(screen.getByText('1.000')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.50')).toBeInTheDocument();
    expect(screen.getByText('R$ 30.00')).toBeInTheDocument();
    expect(screen.getByText('2.00%')).toBeInTheDocument();
  });

  it('does NOT display attributed revenue, order CPA, or real ROAS', async () => {
    render(
      <MetaAdsView
        currentUser={mockAdminUser}
        isDemoView={true}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    await screen.findByText('Campanha Escala E2E');
    expect(screen.queryByText(/ROAS Real/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Receita Atribuída/i)).not.toBeInTheDocument();
  });

  it('allows switching to Insights tab and viewing entity metrics', async () => {
    render(
      <MetaAdsView
        currentUser={mockAdminUser}
        isDemoView={true}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    const insightsTabBtn = await screen.findByRole('button', { name: /Insights Históricos/i });
    fireEvent.click(insightsTabBtn);

    expect(await screen.findByText('2026-08-01 → 2026-08-27')).toBeInTheDocument();
  });

  it('allows ADMIN to trigger live synchronization', async () => {
    render(
      <MetaAdsView
        currentUser={mockAdminUser}
        isDemoView={true}
        apiFetch={mockApiFetch}
        showError={mockShowError}
        showSuccess={mockShowSuccess}
      />
    );

    const syncBtn = await screen.findByRole('button', { name: /Sincronizar Agora/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/meta/sync'),
        expect.objectContaining({ method: 'POST' }),
        'demo',
        mockAdminUser
      );
      expect(mockShowSuccess).toHaveBeenCalledWith('Sync done');
    });
  });
});
