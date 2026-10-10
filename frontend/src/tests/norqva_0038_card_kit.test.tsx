// NORQVA-0038: página do kit e escolha Pix/cartão no checkout. Valores sempre vindos da oferta.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { KitLandingPage } from '../features/public/KitLandingPage';
import { CheckoutView } from '../features/checkout/CheckoutView';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const kit = {
  id: 'off-kit-uuid',
  human_id: 'OFF-KIT',
  name: 'Kit Cozinha Italiana',
  description: 'Os dois livros',
  price: 34.8,
  promotional_price: 27.9,
  bonus: null,
  is_demo: false,
  bump: null,
  card: { max_installments: 4, total: 27.96, installment_value: 6.99 }
};

describe('NORQVA-0038 — kit e cartão', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a página do kit mostra de/por, parcelas e Pix vindos da oferta', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => (String(url).includes('/public/offers/OFF-KIT') ? kit : {}) })
    ) as any;
    render(
      <MemoryRouter initialEntries={['/kit/OFF-KIT']}>
        <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('kit-installment')).toHaveTextContent('R$ 6,99'));
    expect(screen.getByTestId('kit-offer-card')).toHaveTextContent('R$ 34,80');
    expect(screen.getByTestId('kit-offer-card')).toHaveTextContent('total R$ 27,96');
    expect(screen.getByTestId('kit-pix')).toHaveTextContent('R$ 27,90 à vista no Pix');
    expect(screen.queryByText(/O que dizem os leitores/)).toBeNull();
  });

  it('sem cartão na oferta, a página mostra só o preço no Pix', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ ...kit, card: null }) })) as any;
    render(
      <MemoryRouter initialEntries={['/kit/OFF-KIT']}>
        <KitLandingPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('kit-pix')).toHaveTextContent('R$ 27,90'));
    expect(screen.queryByTestId('kit-installment')).toBeNull();
  });

  it('o checkout oferece Pix e cartão com o parcelamento exato', () => {
    render(<CheckoutView offer={kit as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(screen.getByTestId('checkout-card-label')).toHaveTextContent('4x de R$ 6,99 sem juros');
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 27,90');
    fireEvent.click(screen.getByDisplayValue('CREDIT_CARD'));
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 27,96');
    expect(screen.getByText('Continuar para o cartão')).toBeInTheDocument();
  });

  it('oferta sem cartão: checkout continua só com Pix', () => {
    render(<CheckoutView offer={{ ...kit, card: null } as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(screen.queryByTestId('checkout-method')).toBeNull();
    expect(screen.getByText('Pagar R$ 27,90 com Pix')).toBeInTheDocument();
  });
});
