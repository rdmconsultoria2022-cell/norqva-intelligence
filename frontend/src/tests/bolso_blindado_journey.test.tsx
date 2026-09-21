import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PublicOfferPage } from '../features/public/PublicOfferPage';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { OrderDeliveryView } from '../features/delivery/OrderDeliveryView';
import { savePurchaseSession } from '../services/purchaseSession';

vi.mock('../../lib/api', () => ({
  API_BASE: 'https://norqva-staging-api.onrender.com/api',
  apiFetch: vi.fn()
}));

const mockBolsoOffer = {
  id: 'off-bolso-uuid',
  human_id: 'OFF-BOLSO-BLINDADO-2990',
  name: 'Método Bolso Blindado',
  description: 'Aplicativo e método de organização financeira pessoal',
  price: 29.90,
  promotional_price: null,
  bonus: null,
  is_demo: false
};

describe('NORQVA — Bolso Blindado Commercial Customer Journey', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('BB01: PublicOfferPage renders Bolso Blindado offer with financial headline, benefits, and zero culinary text', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/public/offers/OFF-BOLSO-BLINDADO-2990')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockBolsoOffer
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <MemoryRouter initialEntries={['/p/OFF-BOLSO-BLINDADO-2990']}>
        <Routes>
          <Route
            path="/p/:humanId"
            element={<PublicOfferPage showError={vi.fn()} showSuccess={vi.fn()} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Organize seu dinheiro de forma simples e tenha clareza de onde ele está indo.')).toBeInTheDocument();
    });

    expect(screen.getByText(/O Método Bolso Blindado é um aplicativo simples e direto ao ponto/i)).toBeInTheDocument();
    expect(screen.getAllByText(/29,90/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Quero acessar o Método Bolso Blindado/i }).length).toBeGreaterThan(0);

    expect(screen.getByText('Entradas e Saídas Descomplicadas')).toBeInTheDocument();
    expect(screen.getByText('Visão do Disponível em Tempo Real')).toBeInTheDocument();
    expect(screen.getByText('Categorização Inteligente')).toBeInTheDocument();
    expect(screen.getByText('Método dos 4 Pilares (50/30/20)')).toBeInTheDocument();
    expect(screen.getByText('Acesso Direto por Conta Própria')).toBeInTheDocument();

    expect(screen.queryByText(/TRATTORIA EM CASA/i)).toBeNull();
    expect(screen.queryByText(/massas artesanais/i)).toBeNull();
    expect(screen.queryByText(/pomodoro/i)).toBeNull();
  });

  it('BB02: CheckoutView renders Bolso Blindado product card with R$ 29,90 and correct badges', () => {
    render(
      <CheckoutView
        offer={mockBolsoOffer as any}
        isDemo={false}
        onOrderCreated={vi.fn()}
        onCancel={vi.fn()}
        showError={vi.fn()}
      />
    );

    expect(screen.getByText('Método Bolso Blindado')).toBeInTheDocument();
    expect(screen.getByText('Método & Aplicativo Web')).toBeInTheDocument();
    expect(screen.getByText('Acesso ao Web App + Planilha + Guia Prático')).toBeInTheDocument();
    expect(screen.getByText(/R\$29,90/)).toBeInTheDocument();
    expect(screen.getByText('Você receberá os links e dados de acesso neste e-mail.')).toBeInTheDocument();
  });

  it('BB03: DigitalDelivery renders Bolso Blindado delivery view with Web App CTA and onboarding steps', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            deliveries: [
              {
                assetId: 'asset-1',
                assetTitle: 'Planilha de Gestão Financeira 2026',
                rawToken: 'tok-planilha-123',
                status: 'ACTIVE'
              }
            ]
          })
        });
      }
      if (url.includes('/orders/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'ord-bb-123',
            offer_human_id: 'OFF-BOLSO-BLINDADO-2990',
            offer_name_snapshot: 'Método Bolso Blindado',
            status: 'PAID',
            customer_email: 'cliente@norqva.com',
            total_amount: 29.90
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <DigitalDelivery
        orderId="ord-bb-123"
        checkoutToken="tok-xyz"
        isDemo={false}
        showError={vi.fn()}
        showSuccess={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Seu acesso ao Método Bolso Blindado está pronto!')).toBeInTheDocument();
    });

    const appButton = screen.getByRole('link', { name: /ACESSAR BOLSO BLINDADO/i });
    expect(appButton).toBeInTheDocument();
    expect(appButton).toHaveAttribute('href', '/app/bolso-blindado/');

    expect(screen.getByText(/Como acessar sua conta:/i)).toBeInTheDocument();
    expect(screen.getByText('Planilha de Gestão Financeira 2026')).toBeInTheDocument();
  });

  it('BB04: OrderDeliveryView loads paid Bolso Blindado order and embeds DigitalDelivery', async () => {
    savePurchaseSession({
      orderId: 'ord-paid-bb',
      checkoutToken: 'tok-bb-abc',
      offerHumanId: 'OFF-BOLSO-BLINDADO-2990',
      status: 'PAID'
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/orders/ord-paid-bb')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'ord-paid-bb',
            offer_human_id: 'OFF-BOLSO-BLINDADO-2990',
            offer_name_snapshot: 'Método Bolso Blindado',
            status: 'PAID',
            customer_email: 'pago@norqva.com',
            total_amount: 29.90
          })
        });
      }
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            deliveries: [
              {
                assetId: 'asset-planilha',
                assetTitle: 'Planilha Bolso Blindado',
                rawToken: 'tok-raw-123',
                status: 'ACTIVE'
              }
            ]
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <MemoryRouter initialEntries={['/pedido/ord-paid-bb/entrega?token=tok-bb-abc']}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pedido Confirmado e Pago')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ACESSAR BOLSO BLINDADO/i })).toBeInTheDocument();
    });
  });
});
