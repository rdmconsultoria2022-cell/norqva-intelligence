// NORQVA-0075: oferta depois da compra na tela de entrega.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { bookCard } from '../features/delivery/PostPurchaseOffer';

const upsell = {
  human_id: 'OFF-000013',
  name: 'COMPLETE A COLEÇÃO — +4 LIVROS',
  price: 27.9,
  books: ['Antipasti & Aperitivo', 'Dolci della Nonna', 'Pães & Fermentação Natural', 'Risotos & Polentas']
};

function mockFetch(order: any, offer: any = null) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/delivery-tokens')) {
      return Promise.resolve({ ok: true, json: async () => ({ deliveries: [{ assetId: 'a1', assetTitle: 'Trattoria em Casa', rawToken: 'tok', status: 'ACTIVE' }], accessEmailSent: true }) });
    }
    if (url.includes('/public/offers/')) {
      return Promise.resolve({ ok: Boolean(offer), json: async () => offer || { error: 'x' } });
    }
    if (url.includes('/orders/')) {
      return Promise.resolve({ ok: true, json: async () => order });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }) as any;
}

describe('NORQVA-0075: oferta depois da compra', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('mostra o cartão quando o servidor manda a oferta', async () => {
    mockFetch({ id: 'o1', status: 'PAID', total_amount: 19.9, offer_human_id: 'OFF-000001', post_purchase_offer: upsell });
    render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByTestId('post-purchase-offer')).toBeInTheDocument();
    expect(screen.getByText(/Complete a coleção: mais 4 livros por R\$ 27,90/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quero os 4 livros por R\$ 27,90/ })).toBeInTheDocument();
    expect(screen.getByAltText('Capa do livro Pães & Fermentação Natural')).toBeInTheDocument();
  });

  it('não mostra nada sem a oferta', async () => {
    mockFetch({ id: 'o1', status: 'PAID', total_amount: 19.9, offer_human_id: 'OFF-000001', post_purchase_offer: null });
    render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={vi.fn()} showSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/BAIXAR MEU LIVRO/)).toBeInTheDocument());
    expect(screen.queryByTestId('post-purchase-offer')).not.toBeInTheDocument();
  });

  it('erro ao abrir a oferta avisa e não quebra a tela', async () => {
    mockFetch({ id: 'o1', status: 'PAID', total_amount: 19.9, offer_human_id: 'OFF-000001', post_purchase_offer: upsell }, null);
    const showError = vi.fn();
    render(<DigitalDelivery orderId="o1" checkoutToken="t" isDemo={false} showError={showError} showSuccess={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Quero os 4 livros/ }));
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(screen.getByTestId('post-purchase-offer')).toBeInTheDocument();
  });

  it('capas e nomes dos livros', () => {
    expect(bookCard('Dolci della Nonna').cover).toBe('/images/kit/capa_dolci.jpg');
    expect(bookCard('PAES_E_FERMENTACAO').title).toBe('Pães & Fermentação Natural');
    expect(bookCard('Risotos & Polentas').cover).toBe('/images/livros/risotos/capa.jpg');
  });
});
