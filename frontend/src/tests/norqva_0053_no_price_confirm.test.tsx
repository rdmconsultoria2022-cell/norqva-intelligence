// NORQVA-0053: com arquivo anexado, aprovar pede a confirmação de que o vídeo não mostra nem fala preço.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };

const creative = {
  id: 'c9',
  human_id: 'TR-B01-C01',
  hook_family: 'DEMONSTRACAO',
  format: 'VIDEO',
  duration_seconds: 20,
  version: 1,
  hook: 'A lasanha que parece de cantina',
  mechanism: 'Receita passo a passo',
  headline: 'Trattoria em Casa',
  primary_text: '28 receitas italianas com foto',
  cta: 'Saiba mais',
  file_url: 'https://cdn.test/tr.mp4',
  approval_status: 'DRAFT',
  utm_content_key: 'TR-B01-C01',
  claims: [{ id: 'cl1', human_id: 'TR-CL-01', text: '28 receitas', status: 'VERIFIED' }],
  claims_all_verified: true,
  reviews: [],
  metrics: null,
  cpa: null,
  link_ctr: null,
  breakeven_cpa: 20,
  recommendation: 'NOT_PUBLISHED',
  recommendation_reason: '—'
};

describe('NORQVA-0053 — aprovar criativo com arquivo', () => {
  it('pede a confirmação "sem preço" antes de mandar a aprovação', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string) =>
      url.startsWith('/creative-factory/creatives?')
        ? Promise.resolve({ availableBatches: [], importedBatches: [], claims: [], creatives: [creative], rejectionReasons: ['OTHER'] })
        : Promise.resolve({})
    );
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('TR-B01-C01');
    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    expect(screen.getByTestId('confirm-no-price')).toHaveTextContent('não mostra nem fala preço');
    expect(apiFetch).not.toHaveBeenCalledWith('/creative-factory/creatives/c9/review?mode=real', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmo, sem preço' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/creative-factory/creatives/c9/review?mode=real',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })
      )
    );
  });
});
