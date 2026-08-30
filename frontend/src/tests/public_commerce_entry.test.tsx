import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { supabase } from '../supabase';
import * as metaPixelService from '../services/metaPixel';

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

describe('NORQVA — Public Commerce Entry V1 (/p/:humanId)', () => {
  const TEST_PIXEL_ID = '1049452567443586';
  const humanId = 'OFF-000001';
  const offerId = 'off-uuid-001';
  const orderId = 'ord-uuid-001';
  const checkoutToken = 'tok-checkout-valid';

  const mockPublicOffer = {
    id: offerId,
    human_id: humanId,
    name: 'Planilha Inteligente de Performance',
    description: 'Sistema completo de análise preditiva e otimização.',
    price: 97.00,
    promotional_price: 17.90,
    bonus: 'Acesso vitalício à comunidade VIP',
    is_demo: false
  };

  beforeEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    metaPixelService.setPixelEnvironmentAllowedForTesting(true);
    (supabase.auth.getSession as any).mockResolvedValue({ data: { session: null }, error: null });
    (supabase.auth.onAuthStateChange as any).mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  afterEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    vi.restoreAllMocks();
  });

  // P01: Cold load de /p/OFF-000001 sem sessão -> renderiza oferta pública SEM ir para /login
  it('P01: anonymous user accessing /p/OFF-000001 loads public offer page without redirecting to /login', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

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

    expect(await screen.findByText('Planilha Inteligente de Performance')).toBeInTheDocument();
    expect(screen.getByText(/Acesso vitalício à comunidade VIP/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 17,90/i)).toBeInTheDocument();
    expect(screen.getByText('Comprar com Pix')).toBeInTheDocument();

    // Verify user is NOT on login page
    expect(screen.queryByText('CENTRO OPERACIONAL E ANALÍTICO')).not.toBeInTheDocument();
  });

  // P02: Acesso anônimo à raiz / sem login -> continua sendo redirecionado para /login
  it('P02: unauthenticated access to root / still redirects strictly to /login', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ users: [] })
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('INTELLIGENCE & PERFORMANCE')).toBeInTheDocument();
  });

  // P03: Oferta inválida em /p/INVALIDO -> renderiza tela de erro público controlado
  it('P03: invalid offer /p/INVALID-OFFER shows friendly public error card', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: 'Oferta não encontrada ou indisponível.' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={['/p/INVALID-OFFER']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Oferta Indisponível')).toBeInTheDocument();
    expect(screen.getByText(/Oferta não encontrada ou indisponível/i)).toBeInTheDocument();
  });

  // P04: Fluxo completo anônimo: Oferta pública -> Checkout -> Pix -> Confirmação -> Delivery -> Meta Pixel
  it('P04: complete end-to-end anonymous conversion flow works smoothly with Meta Pixel events', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockImplementation(async (url: string, opts?: any) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockPublicOffer
        };
      }
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-01', assetTitle: 'Planilha Inteligente', rawToken: 'raw-tok-1' }]
          })
        };
      }
      if (url.includes('/pix')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            human_id: 'PG-001',
            status: 'CONFIRMED',
            amount: 17.90,
            pix_copy_paste: '00020126580014br.gov.bcb.pix0136mockpixcode'
          })
        };
      }
      if (url.includes('/customers')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'cust-uuid-1', name: 'Comprador Anonimo', email: 'anon@teste.com' })
        };
      }
      if (url.endsWith('/checkout')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: orderId,
            total_amount: 17.90,
            status: 'PENDING',
            checkout_token: checkoutToken,
            items: [{ offer_id: offerId, quantity: 1 }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: orderId,
            status: 'PAID',
            total_amount: 17.90,
            offer_human_id: humanId,
            offer_id: offerId,
            quantity: 1
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/p/${humanId}`]}>
        <App />
      </MemoryRouter>
    );

    // 1. PageView tracked on public landing
    expect(await screen.findByText('Planilha Inteligente de Performance')).toBeInTheDocument();
    
    // 2. Open Checkout
    const buyButton = screen.getByText('Comprar com Pix');
    fireEvent.click(buyButton);

    expect(await screen.findByRole('heading', { name: /Checkout Seguro/i })).toBeInTheDocument();

    // 3. Fill Customer form
    const nameInput = screen.getByPlaceholderText('Ex: João da Silva');
    const emailInput = screen.getByPlaceholderText('seuemail@empresa.com');
    fireEvent.change(nameInput, { target: { value: 'Comprador Anonimo' } });
    fireEvent.change(emailInput, { target: { value: 'anon@teste.com' } });

    // 4. Submit Checkout
    const submitBtn = screen.getByRole('button', { name: /Gerar Pedido & Pagamento/i });
    fireEvent.click(submitBtn);

    // 5. Verify InitiateCheckout event fired
    await waitFor(() => {
      const initCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'InitiateCheckout');
      expect(initCalls.length).toBe(1);
      expect(initCalls[0][2].content_ids).toEqual([humanId]);
      expect(initCalls[0][2].value).toBe(17.90);
    });

    // 6. PaymentStatus modal detects PAID and automatically transitions to DigitalDelivery
    expect(await screen.findByText(/Baixar Arquivo/i, {}, { timeout: 6000 })).toBeInTheDocument();

    // 7. Verify Purchase event fired
    await waitFor(() => {
      const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
      expect(purchaseCalls.length).toBe(1);
      expect(purchaseCalls[0][2].content_ids).toEqual([humanId]);
      expect(purchaseCalls[0][2].value).toBe(17.90);
      expect(purchaseCalls[0][3]).toEqual({ eventID: `purchase_${orderId}` });
    }, { timeout: 6000 });
  }, 12000);
});
