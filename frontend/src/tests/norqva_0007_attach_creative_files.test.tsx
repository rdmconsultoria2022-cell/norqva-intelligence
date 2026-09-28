import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };

const creative = (over: any = {}) => ({
  id: 'c1',
  human_id: 'BB-B01-H01-M1-C1',
  batch_code: 'BB-B01',
  hook_family: 'PROBLEMA',
  format: 'VIDEO',
  version: 1,
  hook: 'Quando o salário some…',
  mechanism: 'Disponível do mês',
  headline: 'Veja quanto ainda está disponível no mês',
  primary_text: 'Organize seu dinheiro…',
  cta: 'Toque em Saiba mais e comece hoje.',
  file_url: null,
  approval_status: 'APPROVED',
  utm_content_key: 'BB-B01-H01-M1-C1',
  claims: [],
  claims_all_verified: true,
  reviews: [],
  metrics: null,
  recommendation: 'NOT_PUBLISHED',
  recommendation_reason: '',
  ...over
});

const payload = (creatives: any[]) => ({
  availableBatches: ['BB-B01'],
  importedBatches: ['BB-B01'],
  claims: [],
  creatives,
  rejectionReasons: ['OTHER'],
  producedAssets: { 'BB-B01': ['BB-B01-H01-M1-C1', 'BB-B01-H03-M1-C1'] }
});

const renderView = (apiFetch: any) =>
  render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);

describe('NORQVA-0007 — attach produced files (UI)', () => {
  it('shows the bulk attach banner and calls the batch endpoint', async () => {
    const apiFetch = vi.fn((url: string) =>
      Promise.resolve(url.startsWith('/creative-factory/creatives?') ? payload([creative(), creative({ id: 'c2', human_id: 'BB-B01-H03-M1-C1' })]) : {})
    );
    renderView(apiFetch);
    expect(await screen.findByTestId('pending-assets')).toHaveTextContent('2 criativo(s) do BB-B01');
    fireEvent.click(screen.getByRole('button', { name: /Anexar arquivos produzidos/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/creative-factory/batches/BB-B01/attach-assets?mode=real', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('hides the banner when the produced files are already attached', async () => {
    const apiFetch = vi.fn(() =>
      Promise.resolve(payload([creative({ file_url: 'https://cdn.test/h01.mp4' }), creative({ id: 'c2', human_id: 'BB-B01-H03-M1-C1', file_url: 'https://cdn.test/h03.mp4' })]))
    );
    renderView(apiFetch);
    expect((await screen.findAllByTestId('creative-preview-video')).length).toBe(2);
    expect(screen.queryByTestId('pending-assets')).toBeNull();
  });

  it('per-card "Anexar arquivo" posts to the file endpoint and only accepts http(s)', async () => {
    const apiFetch = vi.fn((url: string) => Promise.resolve(url.startsWith('/creative-factory/creatives?') ? payload([creative()]) : {}));
    renderView(apiFetch);
    fireEvent.click(await screen.findByRole('button', { name: 'Anexar arquivo' }));
    const input = screen.getByLabelText('Link do arquivo produzido');
    fireEvent.change(input, { target: { value: 'arquivo.mp4' } });
    expect(screen.getByRole('button', { name: 'Anexar' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'https://cdn.test/novo.mp4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anexar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/creative-factory/creatives/c1/file?mode=real',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ file_url: 'https://cdn.test/novo.mp4' }) })
      )
    );
  });
});
