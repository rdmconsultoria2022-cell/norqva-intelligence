// NORQVA-0148: e-mail com acento avisado no formulário; Vendas mostra motivo da recusa e pedido substituído.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { emailProblem, validateEmail } from '../features/checkout/checkoutValidation';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { SalesView, failureReasonLabel } from '../features/sales/SalesView';

vi.mock('../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const offer = {
  id: 'off-1', human_id: 'OFF-000001', name: 'Trattoria em Casa', description: 'Livro', price: 19.9,
  promotional_price: null, bonus: null, is_demo: false, bump: null, card: null, delivery_files: 1
};

describe('NORQVA-0148 — e-mail no pagamento', () => {
  it('acento, ç e espaço: motivo próprio; e-mail comum passa', () => {
    expect(emailProblem('lídia.souza@gmail.com')).toBe('Confira o e-mail: ele não pode ter acento nem ç.');
    expect(emailProblem('ana souza@gmail.com')).toBe('Confira o e-mail: ele não pode ter espaço.');
    expect(emailProblem('maria@')).toBe('Informe um e-mail válido.');
    expect(validateEmail('lidia.souza1605@gmail.com')).toBe(true);
    expect(validateEmail('lídia.souza1605@gmail.com')).toBe(false);
  });

  it('o formulário mostra o motivo embaixo do campo', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
    render(<CheckoutView offer={offer as any} isDemo={false} onOrderCreated={vi.fn()} onCancel={vi.fn()} showError={vi.fn()} />);
    const input = screen.getByPlaceholderText('seuemail@empresa.com');
    fireEvent.change(input, { target: { value: 'lídia.souza@gmail.com' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('email-issue')).toHaveTextContent('Confira o e-mail: ele não pode ter acento nem ç.');
  });
});

describe('NORQVA-0148 — Vendas', () => {
  it('rótulo do motivo guardado', () => {
    expect(failureReasonLabel('ASAAS_400:invalid_email:email')).toBe('e-mail recusado pelo Asaas');
    expect(failureReasonLabel('ASAAS_400:sem_codigo:outro')).toBe('recusado pelo Asaas');
    expect(failureReasonLabel('CPF_INVALIDO')).toBe('CPF inválido');
    expect(failureReasonLabel(null)).toBeNull();
  });

  it('mostra "Substituído" e o motivo da falha no detalhe', async () => {
    const base = { total_amount: 29.9, is_test: false, offer_name: 'Kit', download_count: 0, delivery_status: null, access_email_status: null, problem: false };
    const orders = [
      { ...base, id: 's1', status: 'PENDING', created_at: '2026-10-29T12:41:00Z', customer: { name: 'Lídia', email: null, phone: null }, payment_status: 'PENDING', superseded: true },
      { ...base, id: 'f1', status: 'PENDING', created_at: '2026-10-29T12:40:00Z', customer: { name: 'Bruna', email: null, phone: null }, payment_status: 'FAILED', payment_failure_reason: 'ASAAS_400:invalid_email:email', superseded: false }
    ];
    const apiFetch = vi.fn().mockResolvedValue({ orders, summary: { total: 2, paid: 0, pending: 1, superseded: 1, problem: 0, revenue: 0 } });
    render(<SalesView currentUser={{ id: 'u1', name: 'Admin', email: 'a@x.test', role: 'ADMIN' } as any} isDemoView={false} apiFetch={apiFetch} showError={vi.fn()} showSuccess={vi.fn()} />);
    expect(await screen.findByText('Lídia')).toBeInTheDocument();
    const pills = screen.getAllByTestId('sales-payment').map(p => p.textContent);
    expect(pills).toContain('Substituído');
    expect(pills).toContain('Falhou');
    fireEvent.click(screen.getByRole('button', { name: /Lídia/ }));
    expect(screen.getByTestId('sales-superseded')).toHaveTextContent('pagou outro pedido');
    fireEvent.click(screen.getByRole('button', { name: /Bruna/ }));
    expect(screen.getByTestId('sales-failure')).toHaveTextContent('E-mail recusado pelo Asaas');
  });
});
