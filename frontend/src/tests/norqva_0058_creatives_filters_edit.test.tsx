// NORQVA-0058: claims recolhíveis, filtro pelo nome da campanha, edição de todo o conteúdo e lixeira.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }));

const admin = { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@norqva.test' } as any;

const creative = (over: any) => ({
  id: 'c1', human_id: 'TR-V1-EMO', batch_code: null, hook_family: 'EMO', format: 'VIDEO', version: 1,
  hook: 'Gancho antigo', mechanism: 'Mecanismo', headline: 'Título', primary_text: 'Texto', cta: 'Ver detalhes', script: 'Roteiro',
  file_url: null, approval_status: 'DRAFT', utm_content_key: 'TR-V1-EMO', claims: [], claims_all_verified: true, reviews: [],
  metrics: null, recommendation: 'NOT_PUBLISHED', recommendation_reason: '', campaigns: [], ...over
});

const payload = {
  availableBatches: [], importedBatches: [], rejectionReasons: ['OTHER'], producedAssets: {},
  claims: [{ id: 'cl1', human_id: 'CLM-1', claim_text: 'Foto de cada prato', status: 'VERIFIED' }],
  creatives: [
    creative({ campaigns: [{ meta_campaign_id: 'EXP', name: 'NORQVA_TRATTORIA_EXP02', status: 'ACTIVE', meta_ad_ids: [] }] }),
    creative({ id: 'c2', human_id: 'KIT-V1', campaigns: [{ meta_campaign_id: 'KIT', name: 'NORQVA_KIT_01', status: 'PAUSED', meta_ad_ids: [] }] })
  ],
  campaigns: [
    { meta_campaign_id: 'EXP', name: 'NORQVA_TRATTORIA_EXP02', status: 'ACTIVE', effective_status: 'ACTIVE', ads: [] },
    { meta_campaign_id: 'KIT', name: 'NORQVA_KIT_01', status: 'PAUSED', effective_status: 'PAUSED', ads: [] }
  ]
};

const setup = () => {
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/creative-factory/creatives?')) return Promise.resolve(payload);
    if (url === '/creative-factory/trash') return Promise.resolve({ creatives: [] });
    return Promise.resolve({});
  });
  render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
};

describe('NORQVA-0058 — tela Criativos', () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it('claims começam ocultas e abrem no clique', async () => {
    setup();
    await screen.findAllByText('TR-V1-EMO');
    expect(screen.queryByText('Foto de cada prato')).toBeNull();
    fireEvent.click(screen.getByTestId('toggle-factory-claims'));
    expect(screen.getByText('Foto de cada prato')).toBeInTheDocument();
  });

  it('filtra pelo nome da campanha', async () => {
    setup();
    await screen.findAllByText('TR-V1-EMO');
    expect(screen.getAllByTestId('campaign-group').length).toBe(2);
    fireEvent.change(screen.getByTestId('campaign-name-filter'), { target: { value: 'KIT' } });
    const groups = screen.getAllByTestId('campaign-group');
    expect(groups.length).toBe(1);
    expect(groups[0]).toHaveTextContent('NORQVA_KIT_01');
  });

  it('edita todo o conteúdo do criativo', async () => {
    const apiFetch = setup();
    await screen.findAllByText('TR-V1-EMO');
    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    fireEvent.change(screen.getByLabelText('Gancho'), { target: { value: 'Gancho novo' } });
    fireEvent.change(screen.getByLabelText('Mecanismo'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('CTA'), { target: { value: 'Saiba mais' } });
    fireEvent.change(screen.getByLabelText('Roteiro'), { target: { value: 'Cena 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(c => String(c[0]).includes('/revise'));
      expect(call).toBeTruthy();
      expect(JSON.parse((call![1] as any).body)).toEqual({
        hook: 'Gancho novo',
        mechanism: null,
        headline: 'Título',
        primary_text: 'Texto',
        cta: 'Saiba mais',
        script: 'Cena 1',
        file_url: null
      });
    });
  });

  it('excluir pede o código e vai para a lixeira', async () => {
    const apiFetch = setup();
    await screen.findAllByText('TR-V1-EMO');
    fireEvent.click(screen.getByTestId('delete-creative-TR-V1-EMO'));
    fireEvent.change(screen.getByLabelText('Código para excluir criativo TR-V1-EMO'), { target: { value: 'TR-V1-EMO' } });
    fireEvent.click(screen.getByTestId('delete-creative-TR-V1-EMO-go'));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/creative-factory/creatives/c1/delete?mode=real', expect.objectContaining({ method: 'POST' }))
    );
  });
});
