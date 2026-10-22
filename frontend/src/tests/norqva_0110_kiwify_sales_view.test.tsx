// NORQVA-0110: venda da Kiwify na tela Vendas — etiqueta "Kiwify" e nenhuma ação do NORQVA.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SalesView } from '../features/sales/SalesView';

const admin = { id: 'u1', name: 'Admin', email: 'a@norqva.test', role: 'ADMIN' } as any;

const kiwifySale = {
  id: 'k1', source: 'KIWIFY', status: 'PAID', total_amount: 47, created_at: '2026-10-21T15:00:00Z', is_test: false,
  customer: { name: 'Ana Kiwify', email: 'ana@example.com', phone: null },
  offer_name: 'Desafio Seca Barriga', items: [], payment_status: 'CONFIRMED', download_count: 0, delivery_status: null,
  access_email_status: null, problem: false
};

describe('NORQVA-0110 — vendas da Kiwify na tela Vendas', () => {
  it('mostra a origem Kiwify, o produto e o valor, sem Reenviar acesso nem Copiar link', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ orders: [kiwifySale], summary: { total: 1, paid: 1, pending: 0, problem: 0, revenue: 47 } });
    render(<SalesView currentUser={admin} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('Ana Kiwify')).toBeInTheDocument();
    expect(screen.getByTestId('sales-source')).toHaveTextContent('Kiwify');
    expect(screen.getByTestId('sales-payment')).toHaveTextContent('Pago');
    fireEvent.click(screen.getByRole('button', { name: /Ana Kiwify/ }));
    expect(screen.getAllByText('Desafio Seca Barriga').length).toBeGreaterThan(0);
    expect(screen.getByText(/pagamento e entrega feitos pela Kiwify/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reenviar acesso/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conferir pagamento/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('sales-delivery')).not.toBeInTheDocument();
  });
});
