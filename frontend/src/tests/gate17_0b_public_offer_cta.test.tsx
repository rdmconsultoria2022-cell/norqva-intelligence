import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';
import * as attributionService from '../services/attribution';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    }
  }
}));

describe('NORQVA — GATE 17.0B: PUBLIC OFFER CTA & CHECKOUT_MODAL_OPENED TELEMETRY', () => {
  const humanId = 'OFF-BOLSO-01';
  const offerId = 'off-uuid-bb-01';

  const mockPublicOffer = {
    id: offerId,
    human_id: humanId,
    name: 'Método Bolso Blindado',
    description: 'Sistema prático de controle financeiro pessoal.',
    price: 47.00,
    promotional_price: 27.90,
    bonus: 'Guia Prático em PDF',
    is_demo: false
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T01: Initial page view triggers OFFER_VIEW but NOT CHECKOUT_MODAL_OPENED
  it('T01: page load emits OFFER_VIEW and does NOT emit CHECKOUT_MODAL_OPENED before user clicks CTA', async () => {
    const sendFunnelEventSpy = vi.spyOn(attributionService, 'sendFunnelEvent');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockPublicOffer
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/p/${humanId}`]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Organize seu dinheiro de forma simples e tenha clareza de onde ele está indo.')).toBeInTheDocument();

    // Verify OFFER_VIEW was emitted
    expect(sendFunnelEventSpy).toHaveBeenCalledWith(
      'OFFER_VIEW',
      humanId,
      { offer_name: 'Método Bolso Blindado' },
      false
    );

    // Verify CHECKOUT_MODAL_OPENED was NOT emitted yet
    const checkoutModalCalls = sendFunnelEventSpy.mock.calls.filter(call => call[0] === 'CHECKOUT_MODAL_OPENED');
    expect(checkoutModalCalls.length).toBe(0);
  });

  // T02: Clicking CTA emits CHECKOUT_MODAL_OPENED and opens CheckoutView modal
  it('T02: clicking CTA button emits CHECKOUT_MODAL_OPENED and reveals checkout modal', async () => {
    const sendFunnelEventSpy = vi.spyOn(attributionService, 'sendFunnelEvent');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockPublicOffer
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/p/${humanId}`]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Organize seu dinheiro de forma simples e tenha clareza de onde ele está indo.')).toBeInTheDocument();

    // Find and click the primary CTA button
    const ctaBtns = screen.getAllByRole('button', { name: /Quero acessar o Método Bolso Blindado/i });
    fireEvent.click(ctaBtns[0]);

    // Verify CHECKOUT_MODAL_OPENED was emitted with proper parameters
    expect(sendFunnelEventSpy).toHaveBeenCalledWith(
      'CHECKOUT_MODAL_OPENED',
      humanId,
      { offer_name: 'Método Bolso Blindado' },
      false
    );

    // Verify checkout modal is displayed
    expect(await screen.findByRole('heading', { name: /Checkout Seguro/i })).toBeInTheDocument();
  });

  // T03: Bottom CTA button also triggers CHECKOUT_MODAL_OPENED
  it('T03: clicking bottom CTA button triggers CHECKOUT_MODAL_OPENED and opens checkout', async () => {
    const sendFunnelEventSpy = vi.spyOn(attributionService, 'sendFunnelEvent');

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockPublicOffer
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/p/${humanId}`]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Assuma o Controle do Seu Dinheiro Hoje Mesmo')).toBeInTheDocument();

    const ctaBtns = screen.getAllByRole('button', { name: /Quero acessar o Método Bolso Blindado/i });
    fireEvent.click(ctaBtns[1]);

    expect(sendFunnelEventSpy).toHaveBeenCalledWith(
      'CHECKOUT_MODAL_OPENED',
      humanId,
      { offer_name: 'Método Bolso Blindado' },
      false
    );

    expect(await screen.findByRole('heading', { name: /Checkout Seguro/i })).toBeInTheDocument();
  });
});
