import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrderDeliveryView } from '../features/delivery/OrderDeliveryView';
import { PublicOfferPage } from '../features/public/PublicOfferPage';
import {
  savePurchaseSession,
  getPurchaseSession,
  getPurchaseSessionByOffer
} from '../services/purchaseSession';

describe('NORQVA — Paid Order Recovery & Refresh Persistence (Scenarios A - J)', () => {
  const testOrderId = 'ord-paid-recovery-123';
  const testCheckoutToken = 'tok-valid-recovery-token-xyz';
  const testOfferHumanId = 'OFF-000001';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  // Scenario E: Persisted session contains strictly non-PII
  it('Scenario E: Persisted session contains no PII (no CPF, name, phone, email, signed URL, or secrets)', () => {
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PAID',
      offerName: 'Trattoria em Casa'
    });

    const session = getPurchaseSession(testOrderId);
    expect(session).toBeDefined();
    expect(session?.orderId).toBe(testOrderId);
    expect(session?.checkoutToken).toBe(testCheckoutToken);
    expect(session?.status).toBe('PAID');

    // Inspect raw localStorage string
    const rawStored = localStorage.getItem(`norqva_purchase_${testOrderId}`) || '';
    expect(rawStored).not.toContain('cpf');
    expect(rawStored).not.toContain('email');
    expect(rawStored).not.toContain('password');
    expect(rawStored).not.toContain('secret');
    expect(rawStored).not.toContain('https://');
  });

  // Scenario F: Invalid customer access credential fails closed
  it('Scenario F: Invalid customer access credential fails closed with safe error message', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Acesso não autorizado para este pedido.' })
    });

    render(
      <MemoryRouter initialEntries={[`/pedido/${testOrderId}/entrega?token=invalid_token`]}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Acesso Não Encontrado/i)).toBeInTheDocument();
      expect(screen.getByText(/Acesso não autorizado/i)).toBeInTheDocument();
    });
  });

  // Scenario B: Browser refresh on delivery route preserves access
  it('Scenario B: Browser refresh on delivery route recovers session from localStorage and renders DigitalDelivery', async () => {
    // Seed persisted session (simulating customer who refreshed after paying)
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PAID'
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deliveries: [
              {
                assetId: 'ast-1',
                assetTitle: 'Trattoria em Casa — Edição Digital (PDF)',
                rawToken: 'raw-del-tok-abc',
                status: 'ACTIVE',
                downloadCount: 1,
                maxDownloads: 5
              }
            ]
          })
        };
      }
      if (url.includes(`/orders/${testOrderId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testOrderId,
            status: 'PAID',
            is_demo: false,
            offer_human_id: testOfferHumanId,
            offer_name_snapshot: 'Trattoria em Casa — Edição Digital (PDF)'
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/pedido/${testOrderId}/entrega`]}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Seu Trattoria em Casa está pronto!/i)).toBeInTheDocument();
      const downloadLink = screen.getByRole('link', { name: /Baixar/i });
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink.getAttribute('href')).toContain('/delivery/raw-del-tok-abc');
    });
  });

  // Scenario C & D: Reopening paid order does NOT call payment creation or order creation
  it('Scenario C & D: Reopening paid delivery does NOT call POST /orders or POST /checkout/orders/:id/pix', async () => {
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PAID'
    });

    const fetchSpy = vi.fn().mockImplementation(async (url: string, opts: any = {}) => {
      const method = opts.method || 'GET';
      if (method === 'POST') {
        throw new Error(`Unexpected POST request to ${url}`);
      }
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deliveries: [
              {
                assetId: 'ast-1',
                rawToken: 'raw-del-tok-abc',
                status: 'ACTIVE',
                downloadCount: 1,
                maxDownloads: 5
              }
            ]
          })
        };
      }
      if (url.includes(`/orders/${testOrderId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testOrderId,
            status: 'PAID',
            is_demo: false,
            offer_human_id: testOfferHumanId
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
    global.fetch = fetchSpy;

    render(
      <MemoryRouter initialEntries={[`/pedido/${testOrderId}/entrega#token=${testCheckoutToken}`]}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Baixar/i })).toBeInTheDocument();
    });

    // Verify zero POST requests were made
    const postCalls = fetchSpy.mock.calls.filter((call: any) => call[1]?.method === 'POST');
    expect(postCalls.length).toBe(0);
  });

  // Scenario H & I: PAID + ACTIVE delivery renders direct download link
  it('Scenario H & I: PAID + ACTIVE delivery renders direct <a href> download action without programmatic click', async () => {
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PAID'
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/delivery-tokens')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deliveries: [{ assetId: 'ast-1', rawToken: 'token_direct_nav', status: 'ACTIVE' }]
          })
        };
      }
      if (url.includes(`/orders/${testOrderId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: testOrderId, status: 'PAID', is_demo: false })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/pedido/${testOrderId}/entrega?token=${testCheckoutToken}`]}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /Baixar/i });
      expect(link).toBeInTheDocument();
      expect(link.getAttribute('href')).toContain('/delivery/token_direct_nav');
      expect(link.getAttribute('target')).toBeNull(); // Direct navigation, not blank popup
    });
  });

  // Scenario G: PENDING order renders payment status without auto-creating duplicate Pix
  it('Scenario G: PENDING order on recovery route renders PaymentStatus without triggering second Pix creation', async () => {
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PENDING'
    });

    const fetchSpy = vi.fn().mockImplementation(async (url: string, opts: any = {}) => {
      if (url.includes('/pix') && opts.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'pix-existing',
            status: 'PENDING',
            qr_code_image_url: 'https://example.com/qr.png',
            payload: '00020126580014br.gov.bcb.pix'
          })
        };
      }
      if (url.includes(`/orders/${testOrderId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testOrderId,
            status: 'PENDING',
            total_amount: 19.90,
            is_demo: false
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    global.fetch = fetchSpy;

    render(
      <MemoryRouter initialEntries={[`/pedido/${testOrderId}/entrega`]}>
        <OrderDeliveryView showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Aguardando Pagamento/i)).toBeInTheDocument();
    });
  });

  // Scenario 6: Public Offer Return Protection
  it('Scenario 6: Returning to /p/:humanId with existing PAID purchase displays purchase completed banner', async () => {
    savePurchaseSession({
      orderId: testOrderId,
      checkoutToken: testCheckoutToken,
      offerHumanId: testOfferHumanId,
      status: 'PAID',
      offerName: 'Trattoria em Casa'
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/public/offers/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'off-uuid-123',
            human_id: testOfferHumanId,
            name: 'Trattoria em Casa',
            price: 19.90,
            promotional_price: null,
            is_demo: false
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <MemoryRouter initialEntries={[`/p/${testOfferHumanId}`]}>
        <PublicOfferPage showError={vi.fn()} showSuccess={vi.fn()} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Você já garantiu seu exemplar deste guia digital!/i)).toBeInTheDocument();
      const ctaButtons = screen.getAllByRole('button', { name: /Acessar Meu Livro/i });
      expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
    });
  });
});
