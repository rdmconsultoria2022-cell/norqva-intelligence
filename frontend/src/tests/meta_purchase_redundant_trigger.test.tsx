import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import * as metaPixelService from '../services/metaPixel';

describe('NORQVA — Meta Purchase Redundant Observational Trigger & Deduplication (M01 - M12)', () => {
  const TEST_PIXEL_ID = '1049452567443586';
  const orderId = '04f865ff-ba3d-4090-a36c-20260827ba3d';
  const checkoutToken = 'tok_valid_test_token_123';

  beforeEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    metaPixelService.setPixelEnvironmentAllowedForTesting(true);
  });

  afterEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    vi.restoreAllMocks();
  });

  // M01: Order PENDING tenta acessar delivery -> Purchase = 0
  it('M01: PENDING order accessing delivery does not trigger Purchase', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // Delivery endpoint returns 403 Forbidden because order is not paid
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Forbidden: Order is not paid yet.' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível preparar o download/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(0);
  });

  // M02: Delivery endpoint rejeita acesso -> Purchase = 0
  it('M02: delivery endpoint rejecting request produces 0 Purchase events', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized checkout token' })
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken="invalid-token"
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível preparar o download/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(0);
  });

  // M03: Order PAID + PaymentStatus ativo -> PaymentStatus envia 1 Purchase
  it('M03: PaymentStatus sends exactly 1 Purchase when polling receives PAID', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: orderId,
            status: 'PAID',
            total_amount: 17.90,
            items: [{ offer_id: 'OFF-0001', quantity: 1 }]
          })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <PaymentStatus
        orderId={orderId}
        checkoutToken={checkoutToken}
        amount={17.90}
        initialPayment={{
          human_id: 'PG-001',
          status: 'PENDING',
          amount: 17.90,
          pix_copy_paste: 'pix-code'
        }}
        showError={vi.fn()}
        isDemo={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Transação Conciliada!/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // M04: Depois de M03, DigitalDelivery abre -> Purchase adicional = 0 (deduplicado)
  it('M04: DigitalDelivery opening after PaymentStatus already tracked Purchase emits ZERO additional events', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // Pre-condition: PaymentStatus already sent purchase for orderId
    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: ['OFF-0001'],
      numItems: 1
    });

    let purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);

    // Now user navigates to DigitalDelivery:
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-001', assetTitle: 'Planilha Inteligente', rawToken: 'tok-raw-123' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: orderId, status: 'PAID', total_amount: 17.90 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
    });

    // Still exactly 1 purchase call overall
    purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // M05: Order PAID sem Purchase anterior (ex: PaymentStatus fechado) -> DigitalDelivery abre -> Purchase = exatamente 1
  it('M05: DigitalDelivery opening for PAID order without prior Purchase event fires EXACTLY 1 Purchase event', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-001', assetTitle: 'Planilha Inteligente', rawToken: 'tok-raw-123' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: orderId, status: 'PAID', total_amount: 17.90, offer_human_id: 'OFF-000001' })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
    expect(purchaseCalls[0][2]).toEqual({
      value: 17.90,
      currency: 'BRL',
      content_type: 'product',
      content_ids: ['OFF-000001'],
      num_items: 1
    });
    expect(purchaseCalls[0][3]).toEqual({
      eventID: `purchase_${orderId}`
    });
  });

  // M06: Refresh/reabertura de DigitalDelivery -> Purchase adicional = 0
  it('M06: refresh or re-opening of DigitalDelivery emits 0 duplicate Purchase', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-001', assetTitle: 'Planilha Inteligente', rawToken: 'tok-raw-123' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: orderId, status: 'PAID', total_amount: 17.90 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { unmount } = render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
    });

    let purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);

    // Unmount and re-render (simulate component remount / refresh)
    unmount();

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
    });

    // Still exactly 1
    purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // M07: Nova sessão com localStorage preservado -> Purchase adicional = 0
  it('M07: new session with localStorage preserved prevents duplicate Purchase on DigitalDelivery', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // Simulate prior session recorded in localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`meta_purchase_sent_${orderId}`, 'true');
    }

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-001', assetTitle: 'Planilha Inteligente', rawToken: 'tok-raw-123' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: orderId, status: 'PAID', total_amount: 17.90 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(0);
  });

  // M08: Nova Order PAID diferente -> Purchase = 1 para a nova Order
  it('M08: a distinct new PAID order emits a new Purchase event', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // Order 1 was already tracked
    metaPixelService.trackPurchase({
      orderId: 'order-1',
      value: 17.90,
      currency: 'BRL',
      contentIds: ['AST-001'],
      numItems: 1
    });

    const newOrderId = 'order-2';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId: newOrderId,
            deliveries: [{ assetId: 'AST-002', assetTitle: 'Relatório Exclusivo', rawToken: 'tok-raw-456' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: newOrderId, status: 'PAID', total_amount: 49.90 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={newOrderId}
        checkoutToken="tok-new"
        isDemo={false}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Relatório Exclusivo/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(2);
    expect(purchaseCalls[1][2].value).toBe(49.90);
    expect(purchaseCalls[1][3].eventID).toBe('purchase_order-2');
  });

  // M09: Meta/adblock/fbq indisponível -> Digital Delivery continua funcionando
  it('M09: adblocker or fbq exception does not interrupt digital delivery', async () => {
    window.fbq = () => {
      throw new Error('Blocked by adblocker');
    };
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId: 'AST-001', assetTitle: 'Planilha Inteligente', rawToken: 'tok-raw-123' }]
          })
        };
      }
      if (url.includes('/orders/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: orderId, status: 'PAID', total_amount: 17.90 })
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <DigitalDelivery
        orderId={orderId}
        checkoutToken={checkoutToken}
        isDemo={false}
        showError={vi.fn()}
      />
    );

    // Delivery UI successfully renders despite fbq exception
    await waitFor(() => {
      expect(screen.getByText(/Planilha Inteligente/i)).toBeInTheDocument();
      expect(screen.getByText(/Baixar Arquivo/i)).toBeInTheDocument();
    });
  });

  // M10: Validar parâmetros Purchase
  it('M10: validates full payload, currency, content_ids, and eventID on Purchase', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackPurchase({
      orderId: 'ord-m10',
      value: 17.90,
      currency: 'BRL',
      contentIds: ['AST-PRO-01', 'AST-PRO-02'],
      numItems: 2
    });

    expect(fbqSpy).toHaveBeenCalledWith(
      'track',
      'Purchase',
      {
        value: 17.90,
        currency: 'BRL',
        content_type: 'product',
        content_ids: ['AST-PRO-01', 'AST-PRO-02'],
        num_items: 2
      },
      {
        eventID: 'purchase_ord-m10'
      }
    );
  });

  // M11: Zero PII no payload do Meta Pixel
  it('M11: confirms zero PII transmission to fbq', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: ['AST-001'],
      numItems: 1
    });

    const callPayload = JSON.stringify(fbqSpy.mock.calls);
    const piiKeywords = ['cpf', 'cnpj', 'email', 'phone', 'address', 'password', 'token', 'bearer', 'secret'];
    for (const kw of piiKeywords) {
      expect(callPayload.toLowerCase()).not.toContain(`"${kw}"`);
    }
  });

  // M12: PageView permanece 1:1 e InitiateCheckout permanece inalterado
  it('M12: PageView deduplication and InitiateCheckout remain 1:1 and unaffected', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // PageView
    metaPixelService.trackPageView('/delivery');
    metaPixelService.trackPageView('/delivery'); // Duplicate suppressed
    const pageViewCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'PageView');
    expect(pageViewCalls.length).toBe(1);

    // InitiateCheckout
    metaPixelService.trackInitiateCheckout({
      orderId: 'ord-init',
      value: 17.90,
      currency: 'BRL',
      contentIds: ['OFF-001'],
      numItems: 1
    });
    metaPixelService.trackInitiateCheckout({
      orderId: 'ord-init',
      value: 17.90,
      currency: 'BRL',
      contentIds: ['OFF-001'],
      numItems: 1
    }); // Duplicate suppressed
    const initCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'InitiateCheckout');
    expect(initCalls.length).toBe(1);
    expect(initCalls[0][3]).toEqual({ eventID: 'checkout_ord-init' });
  });
});
