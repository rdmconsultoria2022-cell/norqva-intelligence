import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };
const base = (over: any) => ({
  id: 'c1', human_id: 'BB-B01-H03-M1-C1', batch_code: 'BB-B01', hook_family: 'X', format: 'VIDEO', version: 1, hook: 'h', mechanism: 'm',
  headline: 't', primary_text: 'p', cta: 'c', file_url: null, approval_status: 'REVISION_REQUESTED', utm_content_key: 'BB-B01-H03-M1-C1',
  claims: [], claims_all_verified: true, reviews: [{ decision: 'REVISION_REQUESTED', notes: 'Adicionar música', created_at: '2026-09-28T21:00:00Z' }],
  metrics: null, recommendation: 'NOT_PUBLISHED', recommendation_reason: '', campaigns: [], ...over
});

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

function renderWith(creatives: any[], adjustments: any[]) {
  const apiFetch = vi.fn((url: string) => {
    if (url.startsWith('/creative-factory/creatives?')) {
      return Promise.resolve({ availableBatches: ['BB-B01'], importedBatches: ['BB-B01'], claims: [], rejectionReasons: ['OTHER'], producedAssets: {}, creatives });
    }
    if (url.startsWith('/creative-factory/adjustments?')) return Promise.resolve({ adjustments });
    return Promise.resolve({});
  });
  render(<CreativeFactoryView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
}

describe('NORQVA-0013 — adjustment tasks in the Factory', () => {
  it('shows Claude working with a link to the session', async () => {
    renderWith([base({})], [
      { id: 'a1', creative_id: 'c1', creative_human_id: 'BB-B01-H03-M1-C1', status: 'IN_PROGRESS', request_text: '[OTHER] Adicionar música', response: 'Compondo a trilha', session_url: 'https://claude.ai/code/session_x', created_at: '2026-09-28T21:00:00Z' }
    ]);
    expect(await screen.findByText('Claude trabalhando')).toBeInTheDocument();
    expect(screen.getByText(/Compondo a trilha/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o Claude trabalhando' })).toHaveAttribute('href', 'https://claude.ai/code/session_x');
  });

  it('a delivered version can be opened for review', async () => {
    renderWith(
      [base({ approval_status: 'SUPERSEDED' }), base({ id: 'c2', human_id: 'BB-B01-H03-M1-C1-V2', approval_status: 'DRAFT', reviews: [] })],
      [{ id: 'a1', creative_id: 'c1', creative_human_id: 'BB-B01-H03-M1-C1', status: 'DONE', request_text: 'Adicionar música', response: 'Trilha adicionada', result_creative_id: 'c2', result_human_id: 'BB-B01-H03-M1-C1-V2' }]
    );
    expect(await screen.findByText('Nova versão pronta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revisar nova versão BB-B01-H03-M1-C1-V2/ })).toBeInTheDocument();
  });

  it('legacy requests can be sent to Claude; failed ones retried', async () => {
    const apiFetch = renderWith(
      [base({}), base({ id: 'c3', human_id: 'BB-B01-H04-M1-C1' })],
      [{ id: 'a9', creative_id: 'c3', creative_human_id: 'BB-B01-H04-M1-C1', status: 'FAILED', request_text: 'x', response: 'HTTP 401' }]
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar ao Claude' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/creative-factory/creatives/c1/adjustments?mode=real', expect.objectContaining({ method: 'POST' })));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/creative-factory/adjustments/a9/retry?mode=real', expect.objectContaining({ method: 'POST' })));
  });
});
