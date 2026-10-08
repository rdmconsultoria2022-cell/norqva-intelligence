// NORQVA-0026: tela Vendas — lista, filtros e ações por pedido.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { SalesView } from '../features/sales/SalesView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' } as any;
const viewer = { id: 'u2', name: 'Perf', email: 'p@norqva.test', role: 'PERFORMANCE' } as any;

const paidProblem = {
  id: 'o1', status: 'PAID', total_amount: 19.9, created_at: '2026-10-07T12:00:00Z', is_test: false,
  customer: { name: 'Maria', email: 'maria@example.com', phone: '11999990000' },
  offer_name: 'Trattoria em Casa', payment_status: 'CONFIRMED', download_count: 0, delivery_status: 'EXPIRED',
  access_email_status: 'FAILED', problem: true
};
const pending = {
  id: 'o2', status: 'PENDING', total_amount: 19.9, created_at: '2026-10-08T12:00:00Z', is_test: false,
  customer: { name: 'João', email: 'joao@example.com', phone: null },
  offer_name: 'Trattoria em Casa', payment_status: 'PENDING', download_count: 0, delivery_status: null,
  access_email_status: null, problem: false
};

const setup = (user = admin) => {
  const apiFetch = vi.fn().mockImplementation((url: string) => {
    if (url.startsWith('/sales/orders?')) {
      return Promise.resolve({ orders: [paidProblem, pending], summary: { total: 2, paid: 1, pending: 1, problem: 1, revenue: 19.9 } });
    }
    if (url.includes('/access-link')) return Promise.resolve({ url: 'https://app.test/acesso/abc', expires_at: '2026-10-15' });
    if (url.includes('/check-payment')) return Promise.resolve({ status: 'PAID', changed: true });
    return Promise.resolve({ status: 'SENT' });
  });
  render(<SalesView currentUser={user} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
  return apiFetch;
};

describe('NORQVA-0026 — tela Vendas', () => {
  it('lista os pedidos com pagamento, entrega e resumo', async () => {
    const apiFetch = setup();
    expect(await screen.findByText('Maria')).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toContain('/sales/orders?mode=real');
    expect(apiFetch.mock.calls[0][0]).toContain('filter=ALL');
    expect(screen.getAllByTestId('sales-row')).toHaveLength(2);
    expect(screen.getByTestId('sales-delivery')).toHaveTextContent('VENCIDA');
    expect(screen.getByText('E-MAIL FALHOU')).toBeInTheDocument();
    expect(screen.getByTestId('sales-summary')).toHaveTextContent('Com problema');
  });

  it('o filtro "Com problema" recarrega com filter=PROBLEM', async () => {
    const apiFetch = setup();
    await screen.findByText('Maria');
    fireEvent.click(screen.getByRole('button', { name: 'Com problema' }));
    await waitFor(() => expect(apiFetch.mock.calls.some(c => String(c[0]).includes('filter=PROBLEM'))).toBe(true));
  });

  it('pedido pago: reenviar acesso e copiar link; pedido pendente: conferir pagamento', async () => {
    const apiFetch = setup();
    await screen.findByText('Maria');
    expect(screen.getAllByRole('button', { name: /Reenviar acesso/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Conferir pagamento/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }));
    expect(await screen.findByTestId('sales-link')).toHaveTextContent('https://app.test/acesso/abc');
    expect(apiFetch).toHaveBeenCalledWith('/sales/orders/o1/access-link?mode=real', expect.objectContaining({ method: 'POST' }));

    fireEvent.click(screen.getByRole('button', { name: /Conferir pagamento/ }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith('/sales/orders/o2/check-payment?mode=real', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('perfil sem ADMIN não vê botões de ação', async () => {
    setup(viewer);
    await screen.findByText('Maria');
    expect(screen.queryByRole('button', { name: /Reenviar acesso/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conferir pagamento/ })).not.toBeInTheDocument();
  });
});
