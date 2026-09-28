import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' };

const claimPending = { id: 'cl1', human_id: 'BB-CL-02', text: 'Mostra o disponível', status: 'UNVERIFIED' };
const claimOk = { id: 'cl2', human_id: 'BB-CL-06', text: 'R$ 29,90', status: 'VERIFIED' };

const creative = (over: any = {}) => ({
  id: 'c1',
  human_id: 'BB-B01-H02-M1-C1',
  hook_family: 'DEMONSTRACAO',
  format: 'VIDEO',
  duration_seconds: 15,
  version: 1,
  hook: 'Olha como é registrar um gasto aqui: poucos toques e pronto.',
  mechanism: 'Disponível do mês',
  headline: 'Veja quanto ainda está disponível no mês',
  primary_text: 'Organize seu dinheiro…',
  cta: 'Toque em Saiba mais e comece hoje.',
  file_url: null,
  approval_status: 'DRAFT',
  utm_content_key: 'BB-B01-H02-M1-C1',
  claims: [claimPending, claimOk],
  claims_all_verified: false,
  reviews: [],
  metrics: null,
  cpa: null,
  link_ctr: null,
  breakeven_cpa: 26.12,
  recommendation: 'NOT_PUBLISHED',
  recommendation_reason: 'Nenhum anúncio da Meta ligado a este criativo.',
  ...over
});

const payload = (over: any = {}) => ({
  availableBatches: ['BB-B01'],
  importedBatches: ['BB-B01'],
  claims: [
    { id: 'cl1', human_id: 'BB-CL-02', claim_text: 'Mostra o disponível', status: 'UNVERIFIED' },
    { id: 'cl2', human_id: 'BB-CL-06', claim_text: 'R$ 29,90', status: 'VERIFIED' }
  ],
  creatives: [creative()],
  rejectionReasons: ['WEAK_HOOK', 'BAD_COPY', 'OTHER'],
  ...over
});

describe('NORQVA-0005 — Fábrica de Criativos (UI)', () => {
  it('loads with the global period and mode, shows cards and blocks approval while claims are pending', async () => {
    const apiFetch = vi.fn().mockResolvedValue(payload());
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);

    expect(await screen.findByText('BB-B01-H02-M1-C1')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/creative-factory/creatives?mode=real&period=30d');
    const approve = screen.getByRole('button', { name: /Aprovar/ });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/aguardando verificação/)).toBeInTheDocument();
  });

  it('verifying a claim sends PATCH; approving an eligible creative sends the review', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/creative-factory/creatives?')) {
        return Promise.resolve(payload({ creatives: [creative({ claims_all_verified: true, claims: [claimOk] })] }));
      }
      return Promise.resolve({});
    });
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('BB-B01-H02-M1-C1');

    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/creative-factory/claims/cl1?mode=real', expect.objectContaining({ method: 'PATCH' }))
    );

    fireEvent.click(screen.getByRole('button', { name: /Aprovar/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/creative-factory/creatives/c1/review?mode=real',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'APPROVED' }) })
      )
    );
  });

  it('rejecting asks for a reason before sending', async () => {
    const apiFetch = vi.fn().mockImplementation((url: string) =>
      url.startsWith('/creative-factory/creatives?') ? Promise.resolve(payload()) : Promise.resolve({})
    );
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    await screen.findByText('BB-B01-H02-M1-C1');

    fireEvent.click(screen.getByRole('button', { name: /Rejeitar/ }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'BAD_COPY' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar rejeição/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/creative-factory/creatives/c1/review?mode=real',
        expect.objectContaining({ body: JSON.stringify({ decision: 'REJECTED', reason_code: 'BAD_COPY', notes: null }) })
      )
    );
  });

  it('non-admin sees no approval or import controls; admin sees import when a batch is not imported', async () => {
    const apiFetch = vi.fn().mockResolvedValue(payload({ importedBatches: [], creatives: [] }));
    const { unmount } = render(<CreativeFactoryView currentUser={viewer} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('factory-empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
    unmount();

    render(<CreativeFactoryView currentUser={admin} isDemoView={true} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    const importBtn = await screen.findByRole('button', { name: /Importar BB-B01/ });
    fireEvent.click(importBtn);
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/creative-factory/batches/BB-B01/import?mode=demo', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('shows metrics and the recommendation when an ad is linked', async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      payload({
        creatives: [
          creative({
            metrics: { spend: 60, impressions: 2000, link_clicks: 20, offer_views: 18, checkout_modal_opened: 2, checkout_started: 1, paid_orders: 0, gross_revenue: 0 },
            link_ctr: 1,
            recommendation: 'PAUSE_RECOMMENDED',
            recommendation_reason: 'R$ 60,00 gastos (≥ 2× equilíbrio) sem venda.'
          })
        ]
      })
    );
    render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('Pausar')).toBeInTheDocument();
    expect(screen.getByText(/sem venda/)).toBeInTheDocument();
  });
});
