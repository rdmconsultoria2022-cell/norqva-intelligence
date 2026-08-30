import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import * as metaPixelService from '../services/metaPixel';

describe('NORQVA — Meta Commerce Payload Semantics & Funnel Consistency (S01 - S14)', () => {
  const TEST_PIXEL_ID = '1049452567443586';
  const orderId = '04f865ff-ba3d-4090-a36c-20260827ba3d';
  const checkoutToken = 'tok_valid_test_token_123';
  const canonicalOfferHumanId = 'OFF-000001';
  const canonicalOfferId = 'off-uuid-123';

  beforeEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    metaPixelService.setPixelEnvironmentAllowedForTesting(true);
  });

  afterEach(() => {
    metaPixelService.resetMetaPixelForTesting();
    vi.restoreAllMocks();
  });

  // S01: InitiateCheckout usa OFF-000001
  it('S01: InitiateCheckout sends canonical offer_human_id', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackInitiateCheckout({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    const initCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'InitiateCheckout');
    expect(initCalls.length).toBe(1);
    expect(initCalls[0][2].content_ids).toEqual([canonicalOfferHumanId]);
    expect(initCalls[0][2].num_items).toBe(1);
  });

  // S02: PaymentStatus Purchase usa OFF-000001
  it('S02: PaymentStatus Purchase sends canonical offer_human_id', async () => {
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
            offer_human_id: canonicalOfferHumanId,
            offer_id: canonicalOfferId,
            quantity: 1
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
    expect(purchaseCalls[0][2].content_ids).toEqual([canonicalOfferHumanId]);
    expect(purchaseCalls[0][2].num_items).toBe(1);
  });

  // S03: DigitalDelivery Purchase usa OFF-000001
  it('S03: DigitalDelivery Purchase sends canonical offer_human_id', async () => {
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
            deliveries: [
              { assetId: 'AST-FILE-01', assetTitle: 'Guia PDF', rawToken: 'tok-1' },
              { assetId: 'AST-FILE-02', assetTitle: 'Planilha XLS', rawToken: 'tok-2' },
              { assetId: 'AST-FILE-03', assetTitle: 'Template', rawToken: 'tok-3' }
            ]
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
            offer_human_id: canonicalOfferHumanId,
            offer_id: canonicalOfferId,
            quantity: 1
          })
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
      expect(screen.getByText(/Guia PDF/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
    expect(purchaseCalls[0][2].content_ids).toEqual([canonicalOfferHumanId]);
    expect(purchaseCalls[0][2].num_items).toBe(1);
  });

  // S04: Os três content_ids são idênticos
  it('S04: all three funnel events share identical content_ids', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // 1. InitiateCheckout
    metaPixelService.trackInitiateCheckout({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    // 2. Purchase (PaymentStatus)
    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    const initCall = fbqSpy.mock.calls.find(c => c[0] === 'track' && c[1] === 'InitiateCheckout');
    const purchaseCall = fbqSpy.mock.calls.find(c => c[0] === 'track' && c[1] === 'Purchase');

    expect(initCall[2].content_ids).toEqual([canonicalOfferHumanId]);
    expect(purchaseCall[2].content_ids).toEqual([canonicalOfferHumanId]);
    expect(initCall[2].content_ids).toEqual(purchaseCall[2].content_ids);
  });

  // S05: Oferta com 1 unidade e 3 arquivos: num_items = 1 em todos os eventos
  it('S05: offer delivering 3 files maintains num_items = 1', async () => {
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
            deliveries: [
              { assetId: 'AST-1', assetTitle: 'File 1', rawToken: 'tok-1' },
              { assetId: 'AST-2', assetTitle: 'File 2', rawToken: 'tok-2' },
              { assetId: 'AST-3', assetTitle: 'File 3', rawToken: 'tok-3' }
            ]
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
            offer_human_id: canonicalOfferHumanId,
            quantity: 1
          })
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
      expect(screen.getByText(/File 1/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].num_items).toBe(1);
  });

  // S06: Oferta com quantity = 2 -> num_items = 2
  it('S06: order with commercial quantity = 2 produces num_items = 2', async () => {
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
            deliveries: [{ assetId: 'AST-1', assetTitle: 'File 1', rawToken: 'tok-1' }]
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
            total_amount: 35.80,
            offer_human_id: canonicalOfferHumanId,
            quantity: 2
          })
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
      expect(screen.getByText(/File 1/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].num_items).toBe(2);
    expect(purchaseCalls[0][2].value).toBe(35.80);
  });

  // S07: offer_human_id ausente -> fallback para offer_id
  it('S07: missing offer_human_id falls back cleanly to offer_id', async () => {
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
            deliveries: [{ assetId: 'AST-1', assetTitle: 'File 1', rawToken: 'tok-1' }]
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
            offer_human_id: null,
            offer_id: canonicalOfferId,
            quantity: 1
          })
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
      expect(screen.getByText(/File 1/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].content_ids).toEqual([canonicalOfferId]);
  });

  // S08: offer_human_id e offer_id ausentes -> fallback para orderId
  it('S08: missing both offer_human_id and offer_id falls back to orderId', async () => {
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
            deliveries: [{ assetId: 'AST-1', assetTitle: 'File 1', rawToken: 'tok-1' }]
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
            offer_human_id: null,
            offer_id: null,
            quantity: 1
          })
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
      expect(screen.getByText(/File 1/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].content_ids).toEqual([orderId]);
  });

  // S09: Nenhum assetId aparece em Purchase.content_ids
  it('S09: physical file assetId never appears in Purchase content_ids', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    const assetId = 'secret-asset-uuid-999';

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            orderId,
            deliveries: [{ assetId, assetTitle: 'File', rawToken: 'tok-1' }]
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
            offer_human_id: canonicalOfferHumanId,
            quantity: 1
          })
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
      expect(screen.getByText(/File/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].content_ids).not.toContain(assetId);
  });

  // S10: Nenhum delivery count influencia num_items
  it('S10: delivery count never inflates num_items', async () => {
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
            deliveries: [
              { assetId: 'A1', assetTitle: 'F1', rawToken: 't1' },
              { assetId: 'A2', assetTitle: 'F2', rawToken: 't2' },
              { assetId: 'A3', assetTitle: 'F3', rawToken: 't3' },
              { assetId: 'A4', assetTitle: 'F4', rawToken: 't4' },
              { assetId: 'A5', assetTitle: 'F5', rawToken: 't5' }
            ]
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
            offer_human_id: canonicalOfferHumanId,
            quantity: 1
          })
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
      expect(screen.getByText(/F1/i)).toBeInTheDocument();
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls[0][2].num_items).toBe(1);
  });

  // S11: Zero PII no payload Meta
  it('S11: confirms zero PII in Meta conversion payload', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    const callPayload = JSON.stringify(fbqSpy.mock.calls);
    const piiKeywords = ['cpf', 'cnpj', 'email', 'phone', 'address', 'password', 'token', 'bearer', 'secret'];
    for (const kw of piiKeywords) {
      expect(callPayload.toLowerCase()).not.toContain(`"${kw}"`);
    }
  });

  // S12: Deduplicação permanece 1 Purchase por Order
  it('S12: deduplication enforces exactly 1 Purchase across multiple components', async () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    // Call 1
    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    // Call 2
    metaPixelService.trackPurchase({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // S13: PageView permanece 1:1
  it('S13: PageView tracking is 1:1 and deduplicated', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackPageView('/checkout');
    metaPixelService.trackPageView('/checkout');
    const pageViewCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'PageView');
    expect(pageViewCalls.length).toBe(1);
  });

  // S14: InitiateCheckout permanece funcional
  it('S14: InitiateCheckout correctly tracks canonical payload', () => {
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;
    metaPixelService.initMetaPixel(TEST_PIXEL_ID);

    metaPixelService.trackInitiateCheckout({
      orderId,
      value: 17.90,
      currency: 'BRL',
      contentIds: [canonicalOfferHumanId],
      numItems: 1
    });

    const initCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'InitiateCheckout');
    expect(initCalls.length).toBe(1);
    expect(initCalls[0][2]).toEqual({
      value: 17.90,
      currency: 'BRL',
      content_type: 'product',
      content_ids: [canonicalOfferHumanId],
      num_items: 1
    });
    expect(initCalls[0][3]).toEqual({ eventID: `checkout_${orderId}` });
  });
});
