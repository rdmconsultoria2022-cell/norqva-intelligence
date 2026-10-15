// NORQVA-0069: ofertas de saída no botão Voltar do pagamento do kit (R$ 49,90 e depois R$ 39,90). Valores sempre do servidor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { CheckoutView } from '../features/checkout/CheckoutView';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const base = { description: 'x', bonus: null, is_demo: false, bump: null, card: null, delivery_files: 5 };
const kit = { ...base, id: 'u-kit', human_id: 'OFF-000010', name: 'KIT', price: 94.5, promotional_price: 79.92, exit_offer: { human_id: 'OFF-000030' } };
const exit1 = { ...base, id: 'u-e1', human_id: 'OFF-000030', name: 'KIT saída 49,90', price: 49.9, promotional_price: null, exit_offer: { human_id: 'OFF-000031' } };
const exit2 = { ...base, id: 'u-e2', human_id: 'OFF-000031', name: 'KIT saída 39,90', price: 39.9, promotional_price: null, exit_offer: null };

const mockFetch = () =>
  vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (u.endsWith('/public/offers/OFF-000030')) return Promise.resolve({ ok: true, json: async () => exit1 });
    if (u.endsWith('/public/offers/OFF-000031')) return Promise.resolve({ ok: true, json: async () => exit2 });
    return Promise.resolve({ ok: true, json: async () => ({ books: [] }) });
  }) as any;

const renderIt = (onCancel = vi.fn(), offer: any = kit) =>
  render(<CheckoutView offer={offer} isDemo={false} collectionBooks={[]} onOrderCreated={vi.fn()} onCancel={onCancel} showError={vi.fn()} />);

describe('NORQVA-0069 — ofertas de saída no Voltar', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = mockFetch();
  });

  it('Voltar mostra R$ 49,90, Voltar de novo mostra R$ 39,90 e o terceiro Voltar fecha', async () => {
    const onCancel = vi.fn();
    renderIt(onCancel);
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => expect(screen.getByTestId('exit-offer')).toBeInTheDocument());
    expect(screen.getByTestId('exit-offer-title')).toHaveTextContent('Você desbloqueou uma oferta especial');
    expect(screen.getByTestId('exit-offer-price')).toHaveTextContent('R$ 49,90');
    fireEvent.click(screen.getByTestId('exit-offer-back'));
    await waitFor(() => expect(screen.getByTestId('exit-offer-price')).toHaveTextContent('R$ 39,90'));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('exit-offer-back'));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it('aceitar a proposta abre o pagamento com a oferta de saída (total do servidor, sem livros avulsos)', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => screen.getByTestId('exit-offer-accept'));
    fireEvent.click(screen.getByTestId('exit-offer-accept'));
    await waitFor(() => expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 49,90'));
    expect(screen.queryByTestId('choice-books')).toBeNull();
  });

  it('as propostas aparecem uma vez por navegador: na visita seguinte o Voltar fecha direto', async () => {
    const first = renderIt();
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => screen.getByTestId('exit-offer'));
    first.unmount();
    const onCancel = vi.fn();
    renderIt(onCancel);
    fireEvent.click(screen.getByText('Voltar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('exit-offer')).toBeNull();
  });

  it('sem oferta de saída, o Voltar fecha na hora', () => {
    const onCancel = vi.fn();
    renderIt(onCancel, { ...kit, exit_offer: null });
    fireEvent.click(screen.getByText('Voltar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('se a oferta de saída não for mais barata (ou falhar), não mostra proposta', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...exit1, price: 99 }) }) as any;
    const onCancel = vi.fn();
    renderIt(onCancel);
    fireEvent.click(screen.getByText('Voltar'));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('exit-offer')).toBeNull();
  });
});
