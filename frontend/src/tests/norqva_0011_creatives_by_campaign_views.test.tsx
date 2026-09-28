import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CreativeMediaView } from '../features/creative-media/CreativeMediaView';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';
import { groupByCampaign } from '../components/ViewModes';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' };
const running = { meta_campaign_id: 'MC1', name: 'BB-B01 | Rodada 1', status: 'ACTIVE', meta_ad_ids: ['A1'] };

const labCreative = (over: any) => ({
  id: 'x', human_id: 'X', hook: 'h', concept: 'c', copy: 'x', cta: 'Saiba mais', format: 'VIDEO', status: 'IDEIA',
  product_name: 'Método Bolso Blindado', file_url: null, campaigns: [], ...over
});

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('NORQVA-0011 — creatives by campaign, display modes, adjustment queue', () => {
  it('groups by campaign: active campaigns first, unpublished last', () => {
    const g = groupByCampaign([
      { id: '1', campaigns: [] },
      { id: '2', campaigns: [{ ...running, status: 'PAUSED', meta_campaign_id: 'MC0', name: 'Antiga' }] },
      { id: '3', campaigns: [running] }
    ] as any);
    expect(g.map(x => x.name)).toEqual(['BB-B01 | Rodada 1', 'Antiga', 'Sem campanha (não publicados)']);
  });

  it('Creative Lab: shows the campaign name per creative, grouped, with the list view by default and icon modes', () => {
    render(
      <CreativeMediaView
        creatives={[
          labCreative({ id: 'a', human_id: 'BB-B01-H01-M1-C1', file_url: 'https://cdn.test/h01.mp4', campaigns: [running] }),
          labCreative({ id: 'b', human_id: 'BB-B01-H02-M1-C1' })
        ]}
        products={[]}
        offers={[]}
        isDemoView={false}
        currentUser={admin as any}
        showError={vi.fn()}
        showSuccess={vi.fn()}
        refreshCreatives={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const groups = screen.getAllByTestId('campaign-group');
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText('BB-B01 | Rodada 1')).toBeInTheDocument();
    expect(within(groups[0]).getByTestId('creative-campaign')).toHaveTextContent('BB-B01 | Rodada 1');
    expect(within(groups[1]).getByTestId('creative-campaign')).toHaveTextContent('não publicado');
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('radio', { name: 'Ícones grandes' }));
    expect(screen.getAllByTestId('icon-tile')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('icon-tile')[0]);
    expect(screen.queryAllByTestId('icon-tile')).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'Lista' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Fábrica: lists adjustment requests with the note and shows the campaign line', async () => {
    const creative = (over: any) => ({
      id: 'c1', human_id: 'BB-B01-H03-M1-C1', batch_code: 'BB-B01', hook_family: 'ERRO_COMUM', format: 'VIDEO', version: 1,
      hook: 'h', mechanism: 'm', headline: 't', primary_text: 'p', cta: 'c', file_url: null, approval_status: 'APPROVED',
      utm_content_key: 'BB-B01-H03-M1-C1', claims: [], claims_all_verified: true, reviews: [], metrics: null,
      recommendation: 'NOT_PUBLISHED', recommendation_reason: '', campaigns: [], ...over
    });
    const payload = {
      availableBatches: ['BB-B01'], importedBatches: ['BB-B01'], claims: [], rejectionReasons: ['OTHER'], producedAssets: {},
      creatives: [
        creative({
          approval_status: 'REVISION_REQUESTED',
          campaigns: [running],
          reviews: [{ decision: 'REVISION_REQUESTED', reason_code: 'OTHER', notes: 'Quero adicionar áudio ao vídeo', reviewer_name: 'Admin User', created_at: '2026-09-28T21:00:00Z' }]
        }),
        creative({ id: 'c2', human_id: 'BB-B01-H01-M2-C1' })
      ]
    };
    const apiFetch = vi.fn().mockResolvedValue(payload);
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    const queue = await screen.findByTestId('revision-queue');
    expect(queue).toHaveTextContent('Ajustes pedidos (1)');
    expect(queue).toHaveTextContent('Quero adicionar áudio ao vídeo');
    const campaignLines = screen.getAllByTestId('creative-campaign');
    expect(campaignLines[0]).toHaveTextContent('BB-B01 | Rodada 1');
    expect(screen.getAllByTestId('campaign-group')).toHaveLength(2);
  });
});
