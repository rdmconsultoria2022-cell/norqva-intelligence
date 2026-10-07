import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignBaseView } from '../features/intelligence/CampaignBaseView';
import { GlobalPeriodProvider } from '../lib/globalPeriod';
import { Sidebar } from '../components/layout/Sidebar';

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

const row = (over: any) => ({
  key: 'k', level: 'ad', name: 'BB-B01-H01-M1-C1', meta_id: '1', status: 'ACTIVE', campaign_name: 'BB-B01 | Rodada 1', adset_name: 'R1',
  product_name: 'Bolso Blindado', niche: 'Finanças', ads_count: 1, winners_count: 0,
  creative: { title: 'Veja quanto ainda está disponível', body: 'Organize seu dinheiro', cta: 'LEARN_MORE', thumbnail_url: null, video_id: '9' },
  totals: { spend: 40, sales: 2, revenue: 59.8, impressions: 5000, reach: 4000, link_clicks: 70, landing_page_views: 60, initiate_checkouts: 5, meta_purchases: 2 },
  metrics: { ctr_link: 1.4, cpc_link: 0.57, cpm: 8, frequency: 1.25, hook_rate: 31, hold_rate: 22, completion_rate: 10, lpv_rate: 85.7, cvr: 3.33, cpa: 20, roas: 1.5, breakeven_cpa: 26.12 },
  score: 71, confidence: 0.51, classification: 'PROMISSOR', reason: 'CPA R$ 20,00 dentro do equilíbrio (R$ 26,12): manter.',
  ...over
});

const base = {
  level: 'ad',
  rows: [row({}), row({ key: 'k2', name: 'BB-B01-H03-M1-C1', score: 12, classification: 'PERDEDOR', reason: 'Gastou 2× sem venda: pausar.' })],
  summary: { entities: 2, spend: 80, sales: 2, revenue: 59.8, roas: 0.75, by_class: { VENCEDOR: 0, PROMISSOR: 1, TESTANDO: 0, PERDEDOR: 1, SEM_DADOS: 0 } },
  data: { ads_with_data: 2, latest_insight_date: '2026-09-28', unattributed_sales: 1 }
};

function setup(role = 'ADMIN') {
  const apiFetch = vi.fn(async (url: string) => {
    if (url.startsWith('/intelligence/campaign-base')) return base;
    if (url === '/meta/backfill/status') return { running: false, windows: 0, done: 0, failed: 0 };
    if (url === '/meta/backfill') return { status: { running: true, windows: 25, done: 0, failed: 0, current: { since: '2026-08-30', until: '2026-09-28' } } };
    return {};
  });
  render(
    <GlobalPeriodProvider>
      <CampaignBaseView currentUser={{ id: 'u', role }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />
    </GlobalPeriodProvider>
  );
  return apiFetch;
}

describe('NORQVA-0017 — Base de campanhas', () => {
  it('loads the ranking, filters by class and expands the detail with the creative', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('campaign-base-row')).toHaveLength(2));
    expect(apiFetch.mock.calls.find(c => String(c[0]).startsWith('/intelligence/campaign-base'))?.[0]).toContain('level=campaign');
    expect(screen.getByText(/1 venda\(s\) no período sem anúncio identificado/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Perdedor \(1\)/ }));
    expect(screen.getAllByTestId('campaign-base-row')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Todos/ }));

    fireEvent.click(screen.getByText('BB-B01-H01-M1-C1'));
    expect(screen.getByTestId('campaign-base-detail')).toHaveTextContent('dentro do equilíbrio');
    expect(screen.getByTestId('campaign-base-detail')).toHaveTextContent('Organize seu dinheiro');
  });

  it('switches level and starts the history import (admin)', async () => {
    const apiFetch = setup();
    await waitFor(() => expect(screen.getAllByTestId('campaign-base-row').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('tab', { name: 'Nichos' }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).includes('level=niche'))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /Importar histórico/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 de 25 janelas'));
    const call = apiFetch.mock.calls.find(c => c[0] === '/meta/backfill');
    expect(JSON.parse((call as any)[1].body)).toEqual({ days: 730 });
  });

  it('hides admin actions for other roles', async () => {
    setup('CREATIVE');
    await waitFor(() => expect(screen.getAllByTestId('campaign-base-row').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /Importar histórico/ })).toBeNull();
  });

  it('is in the sidebar', () => {
    render(<Sidebar currentUser={{ id: 'u', name: 'A', role: 'ADMIN', email: 'a@x.test' } as any} activeTab="dashboard" setActiveTab={vi.fn()} handleSignOut={vi.fn()} />);
    expect(screen.getByText('Base de campanhas')).toBeInTheDocument();
  });
});
