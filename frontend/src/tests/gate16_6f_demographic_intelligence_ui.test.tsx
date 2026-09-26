import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  DemographicIntelligenceView,
  formatBRL,
  formatPercent,
  formatCPC,
  formatInteger,
  formatConfidenceBadge,
  getConfidenceNotice
} from '../features/intelligence/DemographicIntelligenceView';
import { DemographicAnalyticsData } from '../features/intelligence/demographicTypes';

describe('GATE 16.6F: Demographic Intelligence UI (Read-Only Presentation)', () => {
  const mockUser = {
    id: 'user-admin-1',
    name: 'Admin Tester',
    email: 'admin@norqva.com',
    role: 'ADMIN'
  };

  const mockPayload: DemographicAnalyticsData = {
    period: 'today',
    mode: 'real',
    generated_at: '2026-09-25T21:40:00.000Z',
    time_window: {
      start_date: '2026-09-25',
      end_date: '2026-09-25',
      time_zone: 'America/Sao_Paulo'
    },
    summary: {
      total_spend: 55.59,
      total_impressions: 2200,
      total_reach: 1800,
      total_clicks: 95,
      total_link_clicks: 80,
      ctr: 4.32,
      cpc: 0.59,
      cpm: 25.27,
      media_sample_confidence: 'LEARNING'
    },
    cohorts: {
      under_45: {
        spend: 15.59,
        impressions: 700,
        reach: 600,
        clicks: 25,
        link_clicks: 20,
        ctr: 3.57,
        cpc: 0.62,
        cpm: 22.27,
        spend_share: 28.05,
        impressions_share: 31.82,
        click_share: 26.32,
        media_sample_confidence: 'OBSERVING'
      },
      age_45_plus: {
        spend: 40.00,
        impressions: 1500,
        reach: 1200,
        clicks: 70,
        link_clicks: 60,
        ctr: 4.67,
        cpc: 0.57,
        cpm: 26.67,
        spend_share: 71.95,
        impressions_share: 68.18,
        click_share: 73.68,
        media_sample_confidence: 'LEARNING'
      },
      unknown: {
        spend: 0.00,
        impressions: 0,
        reach: 0,
        clicks: 0,
        link_clicks: 0,
        ctr: null,
        cpc: null,
        cpm: null,
        spend_share: 0.00,
        impressions_share: 0.00,
        click_share: 0.00,
        media_sample_confidence: 'NO_DATA'
      }
    },
    by_age: [
      { age_group: '18-24', spend: 5.00, impressions: 200, reach: 180, clicks: 8, link_clicks: 6, ctr: 4.00, cpc: 0.63, cpm: 25.00, spend_share: 8.99, impressions_share: 9.09, click_share: 8.42, media_sample_confidence: 'OBSERVING' },
      { age_group: '25-34', spend: 5.59, impressions: 250, reach: 220, clicks: 9, link_clicks: 7, ctr: 3.60, cpc: 0.62, cpm: 22.36, spend_share: 10.06, impressions_share: 11.36, click_share: 9.47, media_sample_confidence: 'OBSERVING' },
      { age_group: '35-44', spend: 5.00, impressions: 250, reach: 200, clicks: 8, link_clicks: 7, ctr: 3.20, cpc: 0.63, cpm: 20.00, spend_share: 8.99, impressions_share: 11.36, click_share: 8.42, media_sample_confidence: 'OBSERVING' },
      { age_group: '45-54', spend: 20.00, impressions: 800, reach: 650, clicks: 35, link_clicks: 30, ctr: 4.38, cpc: 0.57, cpm: 25.00, spend_share: 35.98, impressions_share: 36.36, click_share: 36.84, media_sample_confidence: 'LEARNING' },
      { age_group: '55-64', spend: 12.00, impressions: 450, reach: 350, clicks: 22, link_clicks: 19, ctr: 4.89, cpc: 0.55, cpm: 26.67, spend_share: 21.59, impressions_share: 20.45, click_share: 23.16, media_sample_confidence: 'OBSERVING' },
      { age_group: '65+', spend: 8.00, impressions: 250, reach: 200, clicks: 13, link_clicks: 11, ctr: 5.20, cpc: 0.62, cpm: 32.00, spend_share: 14.39, impressions_share: 11.36, click_share: 13.68, media_sample_confidence: 'OBSERVING' },
      { age_group: 'unknown', spend: 0.00, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, ctr: null, cpc: null, cpm: null, spend_share: 0.00, impressions_share: 0.00, click_share: 0.00, media_sample_confidence: 'NO_DATA' }
    ],
    by_gender: [
      { gender: 'male', spend: 20.00, impressions: 800, reach: 650, clicks: 35, link_clicks: 30, ctr: 4.38, cpc: 0.57, cpm: 25.00, spend_share: 35.98, impressions_share: 36.36, click_share: 36.84, media_sample_confidence: 'LEARNING' },
      { gender: 'female', spend: 35.59, impressions: 1400, reach: 1150, clicks: 60, link_clicks: 50, ctr: 4.29, cpc: 0.59, cpm: 25.42, spend_share: 64.02, impressions_share: 63.64, click_share: 63.16, media_sample_confidence: 'LEARNING' },
      { gender: 'unknown', spend: 0.00, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, ctr: null, cpc: null, cpm: null, spend_share: 0.00, impressions_share: 0.00, click_share: 0.00, media_sample_confidence: 'NO_DATA' }
    ],
    by_ad: [
      {
        ad_id: 'ad_uuid_1',
        meta_ad_id: 'ad_meta_A',
        ad_name: 'TRATTORIA_V1_AD_A_HOOK_SEPARACAO',
        adset_name: 'TRATTORIA_V1_ADSET',
        campaign_name: 'NORQVA_TRATTORIA_REVENUE_V1',
        spend: 35.59,
        impressions: 1400,
        reach: 1200,
        clicks: 60,
        link_clicks: 50,
        ctr: 4.29,
        cpc: 0.59,
        cpm: 25.42,
        under_45: {
          spend: 10.00,
          impressions: 400,
          reach: 350,
          clicks: 15,
          link_clicks: 12,
          ctr: 3.75,
          cpc: 0.67,
          cpm: 25.00,
          spend_share: 28.10,
          impressions_share: 28.57,
          click_share: 25.00,
          media_sample_confidence: 'OBSERVING'
        },
        age_45_plus: {
          spend: 25.59,
          impressions: 1000,
          reach: 850,
          clicks: 45,
          link_clicks: 38,
          ctr: 4.50,
          cpc: 0.57,
          cpm: 25.59,
          spend_share: 71.90,
          impressions_share: 71.43,
          click_share: 75.00,
          media_sample_confidence: 'LEARNING'
        },
        unknown: {
          spend: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          link_clicks: 0,
          ctr: null,
          cpc: null,
          cpm: null,
          spend_share: 0,
          impressions_share: 0,
          click_share: 0,
          media_sample_confidence: 'NO_DATA'
        },
        by_age: [],
        click_share_45_plus: 75.00,
        spend_share_45_plus: 71.90,
        cpc_45_plus: 0.57,
        cpc_under_45: 0.67,
        media_sample_confidence: 'LEARNING'
      },
      {
        ad_id: 'ad_uuid_2',
        meta_ad_id: 'ad_meta_B',
        ad_name: 'TRATTORIA_V1_AD_B_HOOK_EMULSAO',
        adset_name: 'TRATTORIA_V1_ADSET',
        campaign_name: 'NORQVA_TRATTORIA_REVENUE_V1',
        spend: 20.00,
        impressions: 800,
        reach: 600,
        clicks: 35,
        link_clicks: 30,
        ctr: 4.38,
        cpc: 0.57,
        cpm: 25.00,
        under_45: {
          spend: 5.59,
          impressions: 300,
          reach: 250,
          clicks: 10,
          link_clicks: 8,
          ctr: 3.33,
          cpc: 0.56,
          cpm: 18.63,
          spend_share: 27.95,
          impressions_share: 37.50,
          click_share: 28.57,
          media_sample_confidence: 'OBSERVING'
        },
        age_45_plus: {
          spend: 14.41,
          impressions: 500,
          reach: 350,
          clicks: 25,
          link_clicks: 22,
          ctr: 5.00,
          cpc: 0.58,
          cpm: 28.82,
          spend_share: 72.05,
          impressions_share: 62.50,
          click_share: 71.43,
          media_sample_confidence: 'OBSERVING'
        },
        unknown: {
          spend: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          link_clicks: 0,
          ctr: null,
          cpc: null,
          cpm: null,
          spend_share: 0,
          impressions_share: 0,
          click_share: 0,
          media_sample_confidence: 'NO_DATA'
        },
        by_age: [],
        click_share_45_plus: 71.43,
        spend_share_45_plus: 72.05,
        cpc_45_plus: 0.58,
        cpc_under_45: 0.56,
        media_sample_confidence: 'LEARNING'
      }
    ],
    hypothesis_45_plus: {
      click_share_45_plus: 73.68,
      spend_share_45_plus: 71.95,
      impression_share_45_plus: 68.18,
      ctr_45_plus: 4.67,
      ctr_under_45: 3.57,
      cpc_45_plus: 0.57,
      cpc_under_45: 0.62,
      media_sample_confidence_45_plus: 'LEARNING',
      media_sample_confidence_under_45: 'OBSERVING'
    }
  };

  it('1. Renders <45 summary cohort metrics correctly', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Público <45 anos')).toBeInTheDocument();
    });

    expect(screen.getByText('Share: 26,32%')).toBeInTheDocument();
    expect(screen.getByText('Share: 28,05%')).toBeInTheDocument();
    expect(screen.getByText('3,57%')).toBeInTheDocument();
  });

  it('2. Renders 45+ summary cohort metrics correctly', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Público 45+ anos')).toBeInTheDocument();
    });

    expect(screen.getByText('Share: 73,68%')).toBeInTheDocument();
    expect(screen.getByText('Share: 71,95%')).toBeInTheDocument();
    expect(screen.getByText('4,67%')).toBeInTheDocument();
  });

  it('3. Isolates unknown cohort in click share breakdown', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Não identificado:')).toBeInTheDocument();
      expect(screen.getAllByText('0,00%').length).toBeGreaterThan(0);
    });
  });

  it('4. Highlights 45+ click share visually', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Participação 45+ nos Cliques')).toBeInTheDocument();
      expect(screen.getByText('73,68%')).toBeInTheDocument();
    });
  });

  it('5. Renders all 7 age distribution groups', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Distribuição por Faixa Etária')).toBeInTheDocument();
    });

    expect(screen.getByText('18-24 anos')).toBeInTheDocument();
    expect(screen.getByText('25-34 anos')).toBeInTheDocument();
    expect(screen.getByText('35-44 anos')).toBeInTheDocument();
    expect(screen.getByText('45-54 anos')).toBeInTheDocument();
    expect(screen.getByText('55-64 anos')).toBeInTheDocument();
    expect(screen.getByText('65+ anos')).toBeInTheDocument();
  });

  it('6. Renders gender distribution breakdown', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Distribuição por Gênero')).toBeInTheDocument();
      expect(screen.getByText('Masculino')).toBeInTheDocument();
      expect(screen.getByText('Feminino')).toBeInTheDocument();
    });
  });

  it('7. Renders dynamic by_ad creative analysis ("Quem cada criativo está atraindo?")', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('Quem cada criativo está atraindo?')).toBeInTheDocument();
      expect(screen.getByText('TRATTORIA_V1_AD_A_HOOK_SEPARACAO')).toBeInTheDocument();
      expect(screen.getByText('TRATTORIA_V1_AD_B_HOOK_EMULSAO')).toBeInTheDocument();
    });

    expect(screen.getByText('ID: ad_meta_A')).toBeInTheDocument();
    expect(screen.getByText('ID: ad_meta_B')).toBeInTheDocument();
  });

  it('8. Confidence NO_DATA formatting helper', () => {
    const badge = formatConfidenceBadge('NO_DATA');
    expect(badge.label).toBe('Sem dados');
    expect(getConfidenceNotice('NO_DATA')).toContain('Ainda não existem dados');
  });

  it('9. Confidence OBSERVING formatting helper', () => {
    const badge = formatConfidenceBadge('OBSERVING');
    expect(badge.label).toBe('Observando');
    expect(getConfidenceNotice('OBSERVING')).toContain('Amostra inicial');
  });

  it('10. Confidence LEARNING formatting helper', () => {
    const badge = formatConfidenceBadge('LEARNING');
    expect(badge.label).toBe('Aprendizado');
    expect(getConfidenceNotice('LEARNING')).toContain('Tendência em formação');
  });

  it('11. Confidence SUFFICIENT_MEDIA_SAMPLE formatting helper', () => {
    const badge = formatConfidenceBadge('SUFFICIENT_MEDIA_SAMPLE');
    expect(badge.label).toBe('Amostra suficiente');
    expect(getConfidenceNotice('SUFFICIENT_MEDIA_SAMPLE')).toContain('Amostra de mídia suficiente');
  });

  it('12, 13, 14, 15, 16. Period filter buttons trigger API requests with correct period parameters', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=real&period=today');
    });

    // Click Ontem
    fireEvent.click(screen.getByRole('button', { name: 'Ontem' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=real&period=yesterday');
    });

    // Click 7 dias
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=real&period=7d');
    });

    // Click 30 dias
    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=real&period=30d');
    });

    // Click 90 dias
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=real&period=90d');
    });
  });

  it('17. Preserves DEMO vs REAL isolation in API call', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={true} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/intelligence/demographics?mode=demo&period=today');
      expect(screen.getByText('Sandbox Demo')).toBeInTheDocument();
    });
  });

  it('18. Displays loading skeleton while fetching', () => {
    const pendingPromise = new Promise(() => {});
    const mockApiFetch = vi.fn().mockReturnValue(pendingPromise);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    expect(screen.getByTestId('demographics-loading')).toBeInTheDocument();
  });

  it('19. Displays empty state when payload has 0 impressions/clicks', async () => {
    const emptyPayload: DemographicAnalyticsData = {
      ...mockPayload,
      summary: {
        total_spend: 0,
        total_impressions: 0,
        total_reach: null,
        total_clicks: 0,
        total_link_clicks: null,
        ctr: null,
        cpc: null,
        cpm: null,
        media_sample_confidence: 'NO_DATA'
      },
      by_ad: []
    };
    const mockApiFetch = vi.fn().mockResolvedValue(emptyPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByTestId('demographics-empty')).toBeInTheDocument();
      expect(screen.getByText('Nenhum dado demográfico no período')).toBeInTheDocument();
    });
  });

  it('20. Displays error state on fetch failure', async () => {
    const mockApiFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const mockShowError = vi.fn();
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} showError={mockShowError} />);

    await waitFor(() => {
      expect(screen.getByTestId('demographics-error')).toBeInTheDocument();
      expect(screen.getByText('Falha ao carregar inteligência demográfica')).toBeInTheDocument();
    });
  });

  it('21, 22, 23. Strict Economic Truth Boundary: ZERO revenue, CAC, or ROAS per age is displayed', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByTestId('demographics-content')).toBeInTheDocument();
    });

    // Ensure forbidden terms are absent from the entire demographic view
    expect(screen.queryByText(/Receita 45+/i)).toBeNull();
    expect(screen.queryByText(/CAC 45+/i)).toBeNull();
    expect(screen.queryByText(/ROAS 45+/i)).toBeNull();
    expect(screen.queryByText(/45+ compra mais/i)).toBeNull();
    expect(screen.queryByText(/45+ converte melhor/i)).toBeNull();
  });

  it('24. ZERO Meta mutations or automated budget buttons exist in the UI', async () => {
    const mockApiFetch = vi.fn().mockResolvedValue(mockPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByTestId('demographics-content')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /pausar público/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /alterar orçamento/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /excluir <45/i })).toBeNull();
  });

  it('25, 26. Dynamic rendering with arbitrary number of ads without Trattoria hardcoding', async () => {
    const multiAdPayload: DemographicAnalyticsData = {
      ...mockPayload,
      by_ad: [
        {
          ad_id: 'ad_custom_1',
          meta_ad_id: '12025000000001',
          ad_name: 'GENERIC_ECOM_HOOK_TEST_V1',
          spend: 150.00,
          impressions: 6000,
          reach: 5000,
          clicks: 200,
          link_clicks: 180,
          ctr: 3.33,
          cpc: 0.75,
          cpm: 25.00,
          under_45: { spend: 50, impressions: 2000, reach: 1800, clicks: 60, link_clicks: 50, ctr: 3.00, cpc: 0.83, cpm: 25.00, spend_share: 33.33, impressions_share: 33.33, click_share: 30.00, media_sample_confidence: 'LEARNING' },
          age_45_plus: { spend: 100, impressions: 4000, reach: 3200, clicks: 140, link_clicks: 130, ctr: 3.50, cpc: 0.71, cpm: 25.00, spend_share: 66.67, impressions_share: 66.67, click_share: 70.00, media_sample_confidence: 'SUFFICIENT_MEDIA_SAMPLE' },
          unknown: { spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, ctr: null, cpc: null, cpm: null, spend_share: 0, impressions_share: 0, click_share: 0, media_sample_confidence: 'NO_DATA' },
          by_age: [],
          click_share_45_plus: 70.00,
          spend_share_45_plus: 66.67,
          cpc_45_plus: 0.71,
          cpc_under_45: 0.83,
          media_sample_confidence: 'SUFFICIENT_MEDIA_SAMPLE'
        }
      ]
    };

    const mockApiFetch = vi.fn().mockResolvedValue(multiAdPayload);
    render(<DemographicIntelligenceView isDemoView={false} apiFetch={mockApiFetch} />);

    await waitFor(() => {
      expect(screen.getByText('GENERIC_ECOM_HOOK_TEST_V1')).toBeInTheDocument();
      expect(screen.getByText('ID: 12025000000001')).toBeInTheDocument();
      expect(screen.getByText('70,00%')).toBeInTheDocument();
    });
  });
});
