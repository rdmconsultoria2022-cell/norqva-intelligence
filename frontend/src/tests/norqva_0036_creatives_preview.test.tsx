// NORQVA-0036: tela Criativos com imagem da Meta, situação real do anúncio e prévia oficial.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';
import { adDelivery, MetaImage, AdPreviewButton } from '../components/AdLivePreview';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' };
const creative = (over: any) => ({
  id: 'c1', human_id: 'TR-V1-EMO', batch_code: 'META_EXTERNO', origin: 'META', hook_family: 'X', format: 'IMAGE', version: 1,
  hook: 'h', mechanism: 'm', headline: 't', primary_text: 'p', cta: 'c', file_url: null, approval_status: 'APPROVED',
  utm_content_key: 'TR-V1-EMO', claims: [], claims_all_verified: true, reviews: [], metrics: null,
  recommendation: 'OBSERVING', recommendation_reason: '', campaigns: [], linked_meta_ads: [], ...over
});
const payload = {
  availableBatches: [], importedBatches: [], claims: [], rejectionReasons: ['OTHER'], producedAssets: {},
  creatives: [creative({ campaigns: [{ meta_campaign_id: 'EXP', name: 'EXP02', status: 'ACTIVE', meta_ad_ids: ['1201'] }] })],
  campaigns: [
    { meta_campaign_id: 'EXP', name: 'EXP02', status: 'ACTIVE', effective_status: 'ACTIVE', ads: [
      { meta_ad_id: '1201', name: 'TR_V1_EMO', status: 'ACTIVE', effective_status: 'ACTIVE', adset_effective_status: 'ACTIVE', campaign_effective_status: 'ACTIVE',
        image_url: 'https://scontent.test/emo.jpg', factory_creative_id: 'c1', metrics: null },
      { meta_ad_id: '1202', name: 'TR_V1_RACIONAL', status: 'PAUSED', effective_status: 'PAUSED', image_url: null, thumbnail_url: null, factory_creative_id: null, metrics: null },
      { meta_ad_id: '1203', name: 'TR_V1_CAMP_OFF', status: 'ACTIVE', effective_status: 'CAMPAIGN_PAUSED', image_url: 'https://scontent.test/x.jpg', factory_creative_id: null, metrics: null }
    ] }
  ]
};

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

describe('NORQVA-0036 — situação real do anúncio', () => {
  it('rodando só com anúncio, conjunto e campanha ativos; motivos em português', () => {
    expect(adDelivery({ effective_status: 'ACTIVE', adset_effective_status: 'ACTIVE', campaign_effective_status: 'ACTIVE' }).key).toBe('RUNNING');
    expect(adDelivery({ effective_status: 'ACTIVE', campaign_effective_status: 'PAUSED' }).reason).toBe('a campanha não está ativa');
    expect(adDelivery({ effective_status: 'CAMPAIGN_PAUSED' }).reason).toBe('a campanha está pausada');
    expect(adDelivery({ effective_status: 'ADSET_PAUSED' }).reason).toBe('o conjunto está pausado');
    expect(adDelivery({ effective_status: 'PENDING_REVIEW' }).label).toBe('em análise');
    expect(adDelivery({ effective_status: 'DISAPPROVED' }).label).toBe('recusado');
  });
});

describe('NORQVA-0036 — tela Criativos', () => {
  const renderView = async () => {
    const apiFetch = vi.fn(async (url: string) => (String(url).startsWith('/meta/ads/') ? { src: 'https://www.facebook.com/ads/api/preview_iframe.php?d=x', manager_url: 'https://adsmanager.facebook.com/x' } : payload));
    render(<CreativeFactoryView currentUser={admin as any} isDemoView={false} apiFetch={apiFetch as any} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByTestId('campaign-filters');
    return apiFetch;
  };

  it('criativo trazido da Meta mostra a imagem do anúncio e a situação real', async () => {
    await renderView();
    const box = screen.getByTestId('creative-meta-ads');
    expect(box).toHaveTextContent('TR_V1_EMO');
    expect(within(box).getByTestId('ad-delivery')).toHaveTextContent('rodando');
    expect(document.querySelector('img[src="https://scontent.test/emo.jpg"]')).not.toBeNull();
  });

  it('"Só o que está rodando" esconde pausados e campanha pausada', async () => {
    await renderView();
    expect(screen.getAllByTestId('meta-ad-card')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('only-running'));
    expect(screen.queryAllByTestId('meta-ad-card')).toHaveLength(0);
    expect(screen.getAllByTestId('factory-card')).toHaveLength(1);
  });

  it('"Ver como aparece" busca a prévia oficial e mostra o iframe da Meta', async () => {
    const apiFetch = await renderView();
    fireEvent.click(within(screen.getByTestId('creative-meta-ads')).getByTestId('ad-preview-toggle'));
    const frame = await screen.findByTestId('ad-preview-iframe');
    expect(frame.getAttribute('src')).toContain('facebook.com/ads/api/preview_iframe.php');
    expect(apiFetch).toHaveBeenCalledWith('/meta/ads/1201/preview?format=INSTAGRAM_STANDARD');
    fireEvent.click(screen.getByRole('tab', { name: 'Instagram Stories' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/meta/ads/1201/preview?format=INSTAGRAM_STORY'));
    expect(screen.getByTestId('ad-manager-link')).toHaveAttribute('href', 'https://adsmanager.facebook.com/x');
  });
});

describe('NORQVA-0036 — componentes', () => {
  it('imagem com link vencido avisa em vez de quebrar', () => {
    render(<MetaImage url="https://scontent.test/vencida.jpg" alt="x" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('meta-image-expired')).toHaveTextContent('imagem expirada');
  });

  it('sem prévia da Meta mostra o aviso', async () => {
    const apiFetch = vi.fn(async () => ({ src: null, error: 'A Meta não gerou a prévia agora.' }));
    render(<AdPreviewButton metaAdId="1202" apiFetch={apiFetch as any} />);
    fireEvent.click(screen.getByTestId('ad-preview-toggle'));
    expect(await screen.findByTestId('ad-preview-error')).toHaveTextContent('não gerou a prévia');
  });
});
