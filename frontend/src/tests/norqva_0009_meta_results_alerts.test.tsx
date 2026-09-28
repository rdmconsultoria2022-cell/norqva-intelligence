import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MetaAdsView } from '../features/acquisition/MetaAdsView';
import { aggregateMetrics } from '../features/acquisition/MetaResults';
import { Sidebar } from '../components/layout/Sidebar';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };

const campaigns = [{ id: 'c1', meta_campaign_id: 'MC1', name: 'BB-B01 | Rodada 1', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '50.00' }];
const adsets = [{ id: 's1', meta_adset_id: 'MS1', campaign_id: 'c1', campaign_name: 'BB-B01 | Rodada 1', name: 'BR amplo', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: null }];
const ads = [
  { id: 'a1', meta_ad_id: 'MA1', adset_id: 's1', adset_name: 'BR amplo', name: 'BB-B01-H03-M1-C1', status: 'ACTIVE', effective_status: 'ACTIVE' },
  { id: 'a2', meta_ad_id: 'MA2', adset_id: 's1', adset_name: 'BR amplo', name: 'BB-B01-H01-M1-C1', status: 'ACTIVE', effective_status: 'ACTIVE' }
];
const perf = {
  creatives: [
    { ad_id: 'MA1', adset_id: 'MS1', campaign_id: 'MC1', spend: 60, impressions: 2000, clicks: 50, link_clicks: 40, offer_views: 30, checkout_started: 2, paid_orders: 0, gross_revenue: 0 },
    { ad_id: 'MA2', adset_id: 'MS1', campaign_id: 'MC1', spend: 20, impressions: 1000, clicks: 20, link_clicks: 10, offer_views: 9, checkout_started: 1, paid_orders: 1, gross_revenue: 29.9 }
  ]
};
const alert = {
  id: 'al1', meta_ad_id: 'MA1', ad_name: 'BB-B01-H03-M1-C1', campaign_name: 'BB-B01 | Rodada 1',
  message: 'BB-B01-H03-M1-C1 gastou R$ 60,00 sem nenhuma venda. Recomendação: pausar.', status: 'OPEN', created_at: '2026-09-29T12:00:00Z'
};
const ready = { enabled: true, ready: true, mode: 'real', failedChecks: [], limits: { minDailyBudget: 5, maxDailyBudget: 100 } };

const makeFetch = () =>
  vi.fn((url: string) => {
    if (url.startsWith('/meta-control/status')) return Promise.resolve(ready);
    if (url.startsWith('/meta-control/')) return Promise.resolve({ success: true });
    if (url.startsWith('/alerts/')) return Promise.resolve({ ...alert, status: 'ACKNOWLEDGED' });
    if (url.startsWith('/alerts')) return Promise.resolve({ alerts: [alert] });
    if (url.startsWith('/intelligence/creative-performance')) return Promise.resolve(perf);
    if (url.includes('/meta/campaigns')) return Promise.resolve(campaigns);
    if (url.includes('/meta/adsets')) return Promise.resolve(adsets);
    if (url.includes('/meta/ads')) return Promise.resolve(ads);
    return Promise.resolve([]);
  });

describe('NORQVA-0009 — Meta results & alerts', () => {
  it('aggregates metrics (CTR, CPC, CPA, ROAS)', () => {
    const m = aggregateMetrics(perf.creatives as any);
    expect(m.spend).toBe(80);
    expect(m.sales).toBe(1);
    expect(m.cpa).toBe(80);
    expect(m.ctr).toBeCloseTo((50 / 3000) * 100, 5);
    expect(m.roas).toBeCloseTo(29.9 / 80, 5);
  });

  it('shows campaign metrics, drills down to ads, and flags the ad with an open alert', async () => {
    renderView();
    expect(await screen.findByTestId('results-summary')).toHaveTextContent('R$ 80,00');
    fireEvent.click(await screen.findByRole('button', { name: 'BB-B01 | Rodada 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'BR amplo' }));
    expect(await screen.findByTestId('ad-alert-badge')).toBeInTheDocument();
    expect(screen.getByTestId('drill-filter')).toHaveTextContent('BR amplo');
  });

  it('alert panel: pause asks confirmation and sends PAUSED for the ad; ack posts to the alert', async () => {
    const apiFetch = renderView();
    const panel = await screen.findByTestId('alerts-panel');
    expect(panel).toHaveTextContent('Recomendação: pausar');

    fireEvent.click(await screen.findByRole('button', { name: /Pausar anúncio/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('BB-B01-H03-M1-C1');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/meta-control/ad/MA1/status?mode=real', { method: 'POST', body: JSON.stringify({ status: 'PAUSED' }) }, 'real', admin)
    );

    fireEvent.click(screen.getByRole('button', { name: /Marcar como visto/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/alerts/al1/ack?mode=real', { method: 'POST' }, 'real', admin));
  });

  it('sidebar shows the open alerts badge on Meta Ads', () => {
    render(<Sidebar currentUser={admin as any} activeTab="dashboard" setActiveTab={vi.fn()} handleSignOut={vi.fn()} badges={{ 'meta-ads': 2 }} />);
    expect(screen.getByTestId('badge-meta-ads')).toHaveTextContent('2');
  });
});

function renderView() {
  const apiFetch = makeFetch();
  render(<MetaAdsView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
}
