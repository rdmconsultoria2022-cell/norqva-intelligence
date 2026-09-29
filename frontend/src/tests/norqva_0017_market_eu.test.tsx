import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CampaignBaseView } from '../features/intelligence/CampaignBaseView';
import { GlobalPeriodProvider } from '../lib/globalPeriod';

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

const niche = {
  id: 'n1', name: 'Finanças pessoais', search_terms: ['budget planner'], countries: ['DE', 'FR'], product_category: 'Finanças', is_active: true,
  stats: { ads_total: 120, active_ads: 80, advertisers: 25, long_runners: 30, total_reach: 2500000, new_ads_7d: 6, reach_growth_7d: 0 },
  score: 78, classification: 'VALIDADO', reason: '30 anúncio(s) ativos há 30+ dias, 25 anunciante(s).'
};

function setup(probe: any) {
  const apiFetch = vi.fn(async (url: string) => {
    if (url.startsWith('/intelligence/campaign-base')) return { level: 'campaign', rows: [], summary: { entities: 0, spend: 0, sales: 0, revenue: 0, roas: null, by_class: {} }, data: { ads_with_data: 0, latest_insight_date: null, unattributed_sales: 0 } };
    if (url === '/meta/backfill/status') return { running: false };
    if (url === '/market/eu/probe') return probe;
    if (url === '/market/eu/niches') return { niches: [niche], last_run: { started_at: '2026-09-29T03:00:00Z', status: 'DONE', ads_upserted: 120 }, collecting: false };
    if (url.startsWith('/market/eu/niches/n1/ads')) return { ads: [{ id: 'a1', ad_library_id: '777', page_name: 'Budget Co', is_active: true, days_running: 92, title: 'Plan your month', body: 'Take control', eu_total_reach: 120000, snapshot_url: 'x' }] };
    return {};
  });
  render(
    <GlobalPeriodProvider>
      <CampaignBaseView currentUser={{ id: 'u', role: 'ADMIN' }} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />
    </GlobalPeriodProvider>
  );
  return apiFetch;
}

describe('NORQVA-0017 — Mercado europeu', () => {
  it('lists validated niches and their long-running ads', async () => {
    setup({ status: 'AVAILABLE', message: 'Acesso à Biblioteca de Anúncios (UE) confirmado.' });
    fireEvent.click(screen.getByRole('radio', { name: 'Mercado europeu' }));
    await waitFor(() => expect(screen.getByTestId('market-eu-niche')).toHaveTextContent('Finanças pessoais'));
    expect(screen.getByTestId('market-eu-niche')).toHaveTextContent('Validado');
    expect(screen.getByText(/Acesso à Biblioteca de Anúncios \(UE\) confirmado/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Finanças pessoais'));
    await waitFor(() => expect(screen.getByTestId('market-eu-ad')).toHaveTextContent('92 dias'));
    expect(screen.getByRole('button', { name: /Coletar agora/ })).toBeInTheDocument();
  });

  it('explains how to unlock access when Meta blocks the Ad Library', async () => {
    setup({ status: 'BLOCKED', message: 'A Meta recusou o acesso', guidance: ['Confirme sua identidade', 'Aceite os termos', 'Gere um token'] });
    fireEvent.click(screen.getByRole('radio', { name: 'Mercado europeu' }));
    await waitFor(() => expect(screen.getByTestId('market-eu-blocked')).toHaveTextContent('Confirme sua identidade'));
  });
});
