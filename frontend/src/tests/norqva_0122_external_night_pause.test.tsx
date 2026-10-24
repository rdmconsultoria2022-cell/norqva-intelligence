// NORQVA-0122: pausa noturna das campanhas criadas fora do NORQVA (tela Campanhas, só ADMIN).
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExternalNightPause } from '../features/campaigns/ExternalNightPause';

const row = {
  id: 'e1',
  meta_campaign_id: '120250112900200097',
  name: 'NQ – Kit 5 livros – Teste – Vendas',
  enabled: true,
  start: '00:00',
  end: '06:00',
  meta: { status: 'ACTIVE', effective_status: 'ACTIVE' },
  runs: [{ id: 'r1', night_date: '2026-10-24', state: 'REACTIVATED', reason: null }],
  belongs_to_plan: false
};

function setup(campaigns: any[] = [row]) {
  const showSuccess = vi.fn();
  const showError = vi.fn();
  const apiFetch = vi.fn(async (url: string, o?: any) => {
    if (!o?.method) return { campaigns, master_enabled: true };
    if (o.method === 'POST') return { id: 'e2', name: 'Nova', meta_campaign_id: JSON.parse(o.body).meta_campaign_id };
    return {};
  });
  render(<ExternalNightPause apiFetch={apiFetch} showError={showError} showSuccess={showSuccess} />);
  return { apiFetch, showSuccess, showError };
}
const call = (apiFetch: any, method: string) => apiFetch.mock.calls.find((c: any[]) => c[1]?.method === method) as any;

describe('NORQVA-0122 — campanhas criadas fora do NORQVA', () => {
  it('lista com situação na Meta, chave, horários e últimas noites; salva com PATCH', async () => {
    const { apiFetch, showSuccess } = setup();
    expect(await screen.findByText('NQ – Kit 5 livros – Teste – Vendas')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Reativada de manhã')).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: /Pausa noturna de NQ – Kit 5 livros/ });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(screen.getByLabelText('Fim da pausa de 120250112900200097'), { target: { value: '23:30' } });
    expect(screen.getByText(/no máximo às 23:00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fim da pausa de 120250112900200097'), { target: { value: '05:30' } });
    fireEvent.click(sw);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(call(apiFetch, 'PATCH')[0]).toBe('/night-pause/external/e1?mode=real');
    expect(JSON.parse(call(apiFetch, 'PATCH')[1].body)).toEqual({ enabled: false, start: '00:00', end: '05:30' });
  });

  it('adicionar pelo ID valida números e manda POST; tirar pede confirmação e manda DELETE', async () => {
    const { apiFetch, showError, showSuccess } = setup();
    await screen.findByText('NQ – Kit 5 livros – Teste – Vendas');
    fireEvent.change(screen.getByLabelText('ID da campanha na Meta'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    expect(showError).toHaveBeenCalled();
    expect(call(apiFetch, 'POST')).toBeUndefined();
    fireEvent.change(screen.getByLabelText('ID da campanha na Meta'), { target: { value: '120250081197880097' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(JSON.parse(call(apiFetch, 'POST')[1].body)).toEqual({ meta_campaign_id: '120250081197880097' });

    fireEvent.click(screen.getByRole('button', { name: /Tirar NQ – Kit 5 livros/ }));
    expect(call(apiFetch, 'DELETE')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(call(apiFetch, 'DELETE')).toBeTruthy());
    expect(call(apiFetch, 'DELETE')[0]).toBe('/night-pause/external/e1?mode=real');
  });

  it('lista vazia', async () => {
    setup([]);
    expect(await screen.findByTestId('external-empty')).toBeInTheDocument();
  });
});
