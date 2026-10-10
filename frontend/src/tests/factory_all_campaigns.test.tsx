import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

// Fábrica de Criativos: todas as campanhas, filtros Ativas/Pausadas e criativos não publicados.
const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' };

const creative = (over: any) => ({
  id: 'c1', human_id: 'BB-B01-H04-M1-C1-V2', batch_code: 'BB-B01', hook_family: 'ERRO_COMUM', format: 'VIDEO', version: 2,
  hook: 'h', mechanism: 'm', headline: 't', primary_text: 'p', cta: 'c', file_url: null, approval_status: 'APPROVED',
  utm_content_key: 'BB-B01-H04-M1-C1-V2', claims: [], claims_all_verified: true, reviews: [], metrics: null,
  recommendation: 'NOT_PUBLISHED', recommendation_reason: '', campaigns: [], ...over
});

const payload = {
  availableBatches: ['BB-B01'], importedBatches: ['BB-B01'], claims: [], rejectionReasons: ['OTHER'], producedAssets: {},
  creatives: [
    creative({ campaigns: [{ meta_campaign_id: 'BB', name: 'BB-B01 | Rodada 1', status: 'PAUSED', meta_ad_ids: ['A1'] }] }),
    creative({ id: 'c2', human_id: 'BB-B01-H01-M2-C1', campaigns: [] })
  ],
  campaigns: [
    { meta_campaign_id: 'BB', name: 'BB-B01 | Rodada 1', status: 'PAUSED', effective_status: 'PAUSED', ads: [
      { meta_ad_id: 'A1', name: 'BB-B01-H04-M1-C1-V2', status: 'PAUSED', factory_creative_id: 'c1', metrics: null }
    ] },
    { meta_campaign_id: 'CTRL', name: 'NORQVA_TRATTORIA_REVENUE_V1', status: 'ACTIVE', effective_status: 'ACTIVE', ads: [
      { meta_ad_id: 'A2', name: 'TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA', status: 'ACTIVE', adset_name: 'TRATTORIA_ABO_BROAD_BR_V1',
        creative_title: 'Trattoria em Casa — Edição Digital 2026', creative_body: 'Molho que separa…', creative_cta: 'SEE_DETAILS',
        thumbnail_url: 'https://cdn.test/thumb.jpg', factory_creative_id: null,
        metrics: { spend: 335.79, impressions: 3743, link_clicks: 108, offer_views: 0, checkout_modal_opened: 0, checkout_started: 0, paid_orders: 5, gross_revenue: 99.5 } }
    ] },
    { meta_campaign_id: 'E2E', name: 'NORQVA E2E META TESTE 01', status: 'PAUSED', effective_status: 'PAUSED', ads: [] }
  ]
};

const renderView = async () => {
  const apiFetch = vi.fn().mockResolvedValue(payload);
  render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  await screen.findByTestId('campaign-filters');
};
const groupNames = () => screen.getAllByTestId('campaign-group').map(g => g.querySelector('h2')?.textContent || '');

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('Fábrica — todas as campanhas', () => {
  it('lists every campaign (active first), external ads and the unpublished group', async () => {
    await renderView();
    const names = groupNames();
    expect(names).toHaveLength(4);
    expect(names[0]).toContain('NORQVA_TRATTORIA_REVENUE_V1');
    expect(names[0]).toContain('ativa');
    expect(names[1]).toContain('BB-B01 | Rodada 1');
    expect(names[2]).toContain('NORQVA E2E META TESTE 01');
    expect(names[3]).toContain('Criativos não publicados');

    const ad = screen.getByTestId('meta-ad-card');
    expect(ad).toHaveTextContent('TRATTORIA_V1_AD_C_HOOK_MASSA_CASEIRA');
    expect(ad).toHaveTextContent('sem criativo no NORQVA');
    expect(ad).toHaveTextContent('Conjunto: TRATTORIA_ABO_BROAD_BR_V1');
    expect(within(ad).getByTestId('meta-ad-status')).toHaveTextContent('rodando');
    expect(ad).toHaveTextContent('Vendas: 5');
    // anúncio que já é criativo da Fábrica não é duplicado como externo
    expect(screen.getAllByTestId('meta-ad-card')).toHaveLength(1);
    expect(screen.getByTestId('campaign-empty')).toBeInTheDocument();
  });

  it('filters active / paused campaigns and hides unpublished creatives', async () => {
    await renderView();
    expect(screen.getByText('Ativas (1)')).toBeInTheDocument();
    expect(screen.getByText('Pausadas (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ativas (1)'));
    expect(groupNames()).toHaveLength(2); // a campanha ativa + criativos não publicados
    expect(groupNames().some(n => n.includes('BB-B01 | Rodada 1'))).toBe(false);
    expect(groupNames().some(n => n.includes('NORQVA_TRATTORIA_REVENUE_V1'))).toBe(true);

    fireEvent.click(screen.getByText('Pausadas (2)'));
    expect(groupNames().some(n => n.includes('NORQVA_TRATTORIA_REVENUE_V1'))).toBe(false);
    expect(groupNames().some(n => n.includes('BB-B01 | Rodada 1'))).toBe(true);
    expect(groupNames().some(n => n.includes('NORQVA E2E META TESTE 01'))).toBe(true);

    fireEvent.click(screen.getByLabelText('Exibir criativos não publicados'));
    expect(groupNames().some(n => n.includes('Criativos não publicados'))).toBe(false);

    fireEvent.click(screen.getByText(/Todas as campanhas/));
    expect(groupNames()).toHaveLength(3);
  });
});
