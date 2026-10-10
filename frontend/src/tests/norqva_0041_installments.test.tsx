// NORQVA-0041: o comprador escolhe as parcelas (até 4x sem juros; 5x e 6x com 2,99% ao mês)
// e a tela de pagamento usa o visual do produto.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import { installmentOptions } from '../lib/cardInstallments';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const plan = { max: 12, free: 4, rate: 2.99 };
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
  card: { max_installments: 4, total: 27.96, installment_value: 6.99, interest_monthly: 2.99, plan, options: [] }
};

describe('NORQVA-0041 — parcelas escolhidas pelo comprador', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('a conta das parcelas bate com o servidor (R$ 27,96)', () => {
    const opts = installmentOptions(2796, plan).map(o => [o.n, o.valueCents, o.totalCents, o.interest]);
    expect(opts).toEqual([
      [1, 2796, 2796, false],
      [2, 1398, 2796, false],
      [3, 932, 2796, false],
      [4, 699, 2796, false],
      [5, 611, 3055, true],
      [6, 516, 3096, true]
    ]);
  });

  it('o checkout mostra a lista de parcelas e avisa dos juros acima de 4x', () => {
    render(<CheckoutView offer={kit as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    expect(screen.getByTestId('checkout-card-label')).toHaveTextContent('4x de R$ 6,99 sem juros');
    fireEvent.click(screen.getByDisplayValue('CREDIT_CARD'));
    const select = screen.getByTestId('checkout-installments') as HTMLSelectElement;
    expect(select.value).toBe('4');
    expect(Array.from(select.options).map(o => o.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(screen.queryByTestId('checkout-interest')).toBeNull();
    fireEvent.change(select, { target: { value: '6' } });
    expect(screen.getByTestId('checkout-interest')).toHaveTextContent('2,99% ao mês');
    expect(screen.getByTestId('checkout-total')).toHaveTextContent('R$ 30,96');
  });

  it('a tela de pagamento envia as parcelas escolhidas e mostra "com juros" no visual do produto', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/card')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ human_id: 'PAY-1', status: 'PENDING', amount: 30.96, payment_method: 'CREDIT_CARD', invoice_url: 'https://asaas/x', installments: 6, installment_value: 5.16, interest: true })
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'PENDING' }) });
    });
    global.fetch = fetchMock as any;
    render(
      <PaymentStatus orderId="order-123456789" checkoutToken="tok" amount={27.96} isDemo={false} paymentMethod="CREDIT_CARD" installments={6} look="light" showError={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByTestId('card-terms')).toHaveTextContent('com juros · total R$ 30,96'));
    expect(screen.getByTestId('payment-look-light')).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.installments).toBe(6);
    expect(screen.getByTestId('card-invoice-link')).toHaveAttribute('href', 'https://asaas/x');
  });
});
