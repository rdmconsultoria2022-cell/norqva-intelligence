// NORQVA-0025: tela única Criativos — selo de origem, novo criativo e registro de promessa.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import { CreativeFactoryView } from '../features/creative-factory/CreativeFactoryView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' };
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' };

const manual = {
  id: 'm1',
  human_id: 'CR-0042',
  origin: 'MANUAL',
  product_id: 'p1',
  product_name: 'Trattoria em Casa',
  format: 'VIDEO',
  version: 1,
  hook: 'A lasanha de cantina',
  concept: 'Mesa de madeira',
  copy: '28 receitas italianas',
  primary_text: '28 receitas italianas',
  cta: 'Saiba mais',
  file_url: null,
  batch_code: null,
  approval_status: 'DRAFT',
  utm_content_key: 'CR-0042',
  claims: [],
  claims_all_verified: false,
  reviews: [],
  metrics: null,
  recommendation: 'NOT_PUBLISHED',
  recommendation_reason: 'Nenhum anúncio ligado.'
};

const payload = {
  availableBatches: [],
  importedBatches: [],
  claims: [{ id: 'cl9', human_id: 'TR-CL-01', product_id: 'p1', claim_text: '28 receitas', status: 'VERIFIED' }],
  creatives: [manual],
  rejectionReasons: ['OTHER']
};

const setup = (user: any = admin) => {
  const apiFetch = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(url.startsWith('/creative-factory/creatives?') ? payload : {})
  );
  render(
    <CreativeFactoryView
      currentUser={user}
      isDemoView={false}
      apiFetch={apiFetch}
      showError={vi.fn()}
      showSuccess={vi.fn()}
      products={[{ id: 'p1', human_id: 'PRD-1', name: 'Trattoria em Casa' }]}
      offers={[]}
    />
  );
  return apiFetch;
};

describe('NORQVA-0025 — tela Criativos', () => {
  it('mostra o título novo, o criativo manual e o selo de origem', async () => {
    setup();
    expect(await screen.findByText('CR-0042')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Criativos/ })).toBeInTheDocument();
    expect(screen.getByTestId('creative-origin')).toHaveTextContent('Manual');
    expect(screen.getByText(/sem promessas registradas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprovar/ })).toBeDisabled();
  });

  it('novo criativo envia o cadastro com o arquivo opcional', async () => {
    const apiFetch = setup();
    await screen.findByText('CR-0042');
    fireEvent.click(screen.getByTestId('new-creative'));
    const form = screen.getByTestId('new-creative-form');
    fireEvent.change(within(form).getByLabelText('Produto'), { target: { value: 'p1' } });
    fireEvent.change(within(form).getByLabelText('CTA (botão)'), { target: { value: 'Saiba mais' } });
    fireEvent.change(within(form).getByLabelText('Gancho (primeiros segundos)'), { target: { value: 'Gancho' } });
    fireEvent.change(within(form).getByLabelText('Conceito visual'), { target: { value: 'Conceito' } });
    fireEvent.change(within(form).getByLabelText('Texto do anúncio'), { target: { value: 'Texto' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cadastrar' }));
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(c => String(c[0]).startsWith('/creatives?mode=real'));
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as any).body);
      expect(body.product_id).toBe('p1');
      expect(body.file_url).toBeNull();
    });
  });

  it('registra uma promessa já existente do mesmo produto', async () => {
    const apiFetch = setup();
    await screen.findByText('CR-0042');
    fireEvent.click(screen.getByTestId('add-claim'));
    const form = screen.getByTestId('claim-form');
    fireEvent.change(within(form).getByLabelText('Promessa já registrada'), { target: { value: 'cl9' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        '/creative-factory/creatives/m1/claims?mode=real',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ claim_id: 'cl9' }) })
      )
    );
  });

  it('perfil só de leitura não cria criativo nem registra promessa', async () => {
    setup(viewer);
    await screen.findByText('CR-0042');
    expect(screen.queryByTestId('new-creative')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-claim')).not.toBeInTheDocument();
  });
});
