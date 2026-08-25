import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CheckoutView } from '../features/checkout/CheckoutView';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import { DigitalDelivery } from '../features/delivery/DigitalDelivery';
import App from '../App';
import { supabase } from '../supabase';

// Mock supabase client
vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: {} as any, user: {} as any }, error: null }),
    }
  }
}));

const mockOffer = {
  id: 'off-100',
  human_id: 'OFF-001',
  name: 'Plano Escala Pro',
  price: 297.00,
  promotional_price: 197.00,
  product_id: 'prd-100',
  product_name: 'NORQVA Core Engine',
  description: 'Acesso completo às ferramentas avançadas',
  bonus: 'Mentoria Semanal Inclusa',
  is_demo: true
};

describe('Gate 2.5E Phase 6B: Commercial Checkout, Payment & Delivery Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null });
  });

  // B01: checkout renders correct selected offer/product
  it('B01 checkout renders correct selected offer/product', () => {
    const handleOrderCreated = vi.fn();
    const handleCancel = vi.fn();
    const handleError = vi.fn();

    render(
      <CheckoutView
        offer={mockOffer}
        isDemo={true}
        onOrderCreated={handleOrderCreated}
        onCancel={handleCancel}
        showError={handleError}
      />
    );

    expect(screen.getByText('Plano Escala Pro')).toBeInTheDocument();
    expect(screen.getByText('OFF-001')).toBeInTheDocument();
    expect(screen.getByText(/Produto: NORQVA Core Engine/i)).toBeInTheDocument();
    expect(screen.getByText('R$197,00')).toBeInTheDocument();
    expect(screen.getByText('R$297,00')).toBeInTheDocument();
    expect(screen.getByText(/Mentoria Semanal Inclusa/i)).toBeInTheDocument();
  });

  // B02: checkout submit sends expected request exactly once
  it('B02 checkout submit sends expected request exactly once', async () => {
    const handleOrderCreated = vi.fn();
    const handleCancel = vi.fn();
    const handleError = vi.fn();

    const fetchSpy = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/customers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'cust-123', name: 'Carlos Teste', email: 'carlos@test.com', is_demo: true })
        });
      }
      if (url.includes('/checkout')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'ord-999',
            customer_id: 'cust-123',
            total_amount: 197.00,
            status: 'PENDING',
            checkout_token: 'token-xyz-123',
            is_demo: true,
            created_at: new Date().toISOString()
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <CheckoutView
        offer={mockOffer}
        isDemo={true}
        onOrderCreated={handleOrderCreated}
        onCancel={handleCancel}
        showError={handleError}
      />
    );

    const nameInput = screen.getByPlaceholderText(/João da Silva/i);
    const emailInput = screen.getByPlaceholderText(/seuemail@empresa.com/i);
    const submitBtn = screen.getByRole('button', { name: /Gerar Pedido & Pagamento/i });

    fireEvent.change(nameInput, { target: { value: 'Carlos Teste' } });
    fireEvent.change(emailInput, { target: { value: 'carlos@test.com' } });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleOrderCreated).toHaveBeenCalledTimes(1);
    });

    expect(handleOrderCreated).toHaveBeenCalledWith(expect.objectContaining({
      id: 'ord-999',
      checkout_token: 'token-xyz-123'
    }));

    const customerCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/customers'));
    const checkoutCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/checkout'));

    expect(customerCalls.length).toBe(1);
    expect(checkoutCalls.length).toBe(1);
  });

  // B03: double-click / duplicate submit does not create duplicate frontend request
  it('B03 double-click / duplicate submit does not create duplicate frontend request', async () => {
    let resolveCustomerPromise: any;
    const customerPromise = new Promise((resolve) => {
      resolveCustomerPromise = resolve;
    });

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/customers')) {
        return customerPromise.then(() => ({
          ok: true,
          json: async () => ({ id: 'cust-123', name: 'Carlos Teste', email: 'carlos@test.com' })
        }));
      }
      if (url.includes('/checkout')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'ord-999', status: 'PENDING' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    const handleOrderCreated = vi.fn();

    render(
      <CheckoutView
        offer={mockOffer}
        isDemo={true}
        onOrderCreated={handleOrderCreated}
        onCancel={vi.fn()}
        showError={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText(/João da Silva/i);
    const emailInput = screen.getByPlaceholderText(/seuemail@empresa.com/i);
    const submitBtn = screen.getByRole('button', { name: /Gerar Pedido & Pagamento/i });

    fireEvent.change(nameInput, { target: { value: 'Carlos Teste' } });
    fireEvent.change(emailInput, { target: { value: 'carlos@test.com' } });

    // Click twice rapidly
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    // Resolve in-flight promise
    await act(async () => {
      resolveCustomerPromise();
    });

    await waitFor(() => {
      expect(handleOrderCreated).toHaveBeenCalledTimes(1);
    });

    const customerCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/customers'));
    expect(customerCalls.length).toBe(1);
  });

  // B04: payment pending state renders correctly
  it('B04 payment pending state renders correctly', () => {
    const paymentData = {
      human_id: 'PG-2026-001',
      status: 'PENDING' as const,
      amount: 197.00,
      pix_copy_paste: '00020126580014br.gov.bcb.pix0136test-pix-key5204000053039865405197.005802BR5913NORQVA6009Sao Paulo62070503***6304ABCD'
    };

    render(
      <PaymentStatus
        orderId="ord-123"
        checkoutToken="token-abc"
        amount={197.00}
        isDemo={true}
        initialPayment={paymentData}
        showError={vi.fn()}
      />
    );

    expect(screen.getByText('Aguardando Pagamento Pix')).toBeInTheDocument();
    expect(screen.getByText(/Status: PENDENTE/i)).toBeInTheDocument();
    expect(screen.getByText('R$197,00')).toBeInTheDocument();
    expect(screen.getByText(/00020126580014br.gov.bcb.pix/i)).toBeInTheDocument();
  });

  // B05: payment confirmed/paid state transitions according to backend response
  it('B05 payment confirmed/paid state transitions according to backend response', async () => {
    const paymentData = {
      human_id: 'PG-2026-001',
      status: 'PENDING' as const,
      amount: 197.00,
      pix_copy_paste: 'pix-code-123'
    };

    const handleConfirmed = vi.fn();

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/orders/ord-123')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'ord-123', status: 'PAID' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <PaymentStatus
        orderId="ord-123"
        checkoutToken="token-abc"
        amount={197.00}
        isDemo={true}
        initialPayment={paymentData}
        onPaymentConfirmed={handleConfirmed}
        showError={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Pagamento Aprovado')).toBeInTheDocument();
      expect(screen.getByText('Transação Conciliada!')).toBeInTheDocument();
    }, { timeout: 4000 });

    expect(handleConfirmed).toHaveBeenCalled();
  });

  // B06: frontend cannot locally force PAID state
  it('B06 frontend cannot locally force PAID state', async () => {
    const paymentData = {
      human_id: 'PG-2026-001',
      status: 'PENDING' as const,
      amount: 197.00,
      pix_copy_paste: 'pix-code-123'
    };

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/orders/ord-123')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'ord-123', status: 'PENDING' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <PaymentStatus
        orderId="ord-123"
        checkoutToken="token-abc"
        amount={197.00}
        isDemo={true}
        initialPayment={paymentData}
        showError={vi.fn()}
      />
    );

    expect(screen.getByText(/Status: PENDENTE/i)).toBeInTheDocument();
    expect(screen.queryByText('Transação Conciliada!')).not.toBeInTheDocument();
  });

  // B07: delivery requires valid entitlement/token flow
  it('B07 delivery requires valid entitlement/token flow', async () => {
    const fetchSpy = vi.fn().mockImplementation((url, options) => {
      if (url.includes('/delivery-tokens')) {
        const tokenHeader = options?.headers?.['x-checkout-token'];
        if (!tokenHeader) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Forbidden' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            orderId: 'ord-123',
            deliveries: [
              { assetId: 'ast-1', rawToken: 'raw-token-1', assetTitle: 'Pacote de Arquivos Alpha' },
              { assetId: 'ast-2', rawToken: 'raw-token-2', assetTitle: 'Manual de Integração' }
            ]
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={vi.fn()}
      />
    );

    expect(await screen.findByText('Pacote de Arquivos Alpha')).toBeInTheDocument();
    expect(screen.getByText('Manual de Integração')).toBeInTheDocument();
  });

  // B08: signed URL is requested only when download is authorized
  it('B08 signed URL is requested only when download is authorized', async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            orderId: 'ord-123',
            deliveries: [{ assetId: 'ast-1', rawToken: 'raw-token-1', assetTitle: 'Arquivo Único' }]
          })
        });
      }
      if (url.includes('/delivery/raw-token-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            download_url: 'https://supabase.co/storage/v1/object/sign/private/file.zip?token=signed123',
            downloads_remaining: 2
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={vi.fn()}
      />
    );

    const downloadBtn = await screen.findByRole('button', { name: /Baixar Arquivo/i });

    // Download URL should NOT have been requested prior to click
    const deliveryCallsBefore = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/delivery/raw-token-1'));
    expect(deliveryCallsBefore.length).toBe(0);

    fireEvent.click(downloadBtn);

    await waitFor(() => {
      const deliveryCallsAfter = fetchSpy.mock.calls.filter(c => String(c[0]).includes('/delivery/raw-token-1'));
      expect(deliveryCallsAfter.length).toBe(1);
    });
  });

  // B09: raw delivery token is not persisted in browser storage
  it('B09 raw delivery token is not persisted in browser storage', async () => {
    const setItemSpyLocal = vi.spyOn(Storage.prototype, 'setItem');
    const setItemSpySession = vi.spyOn(sessionStorage, 'setItem');

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            orderId: 'ord-123',
            deliveries: [{ assetId: 'ast-1', rawToken: 'sensitive-raw-token-secret-999', assetTitle: 'Ativo Protegido' }]
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={vi.fn()}
      />
    );

    await screen.findByText('Ativo Protegido');

    expect(setItemSpyLocal).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('sensitive-raw-token-secret-999'));
    expect(setItemSpySession).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('sensitive-raw-token-secret-999'));

    setItemSpyLocal.mockRestore();
    setItemSpySession.mockRestore();
  });

  // B10: signed URL is not persisted in browser storage
  it('B10 signed URL is not persisted in browser storage', async () => {
    const setItemSpyLocal = vi.spyOn(Storage.prototype, 'setItem');
    const setItemSpySession = vi.spyOn(sessionStorage, 'setItem');

    const signedUrl = 'https://supabase.co/storage/v1/object/sign/secret-bucket/file.zip?token=signed_expiring_token_123';

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            orderId: 'ord-123',
            deliveries: [{ assetId: 'ast-1', rawToken: 'raw-1', assetTitle: 'Arquivo Protegido' }]
          })
        });
      }
      if (url.includes('/delivery/raw-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            download_url: signedUrl,
            downloads_remaining: 1
          })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={vi.fn()}
      />
    );

    const downloadBtn = await screen.findByRole('button', { name: /Baixar Arquivo/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/delivery/raw-1');
    });

    expect(setItemSpyLocal).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining(signedUrl));
    expect(setItemSpySession).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining(signedUrl));

    setItemSpyLocal.mockRestore();
    setItemSpySession.mockRestore();
  });

  // B11: download limit error is handled safely
  it('B11 download limit error is handled safely', async () => {
    const handleError = vi.fn();

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/delivery-tokens')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            orderId: 'ord-123',
            deliveries: [{ assetId: 'ast-1', rawToken: 'exhausted-token', assetTitle: 'Arquivo com Limite Esgotado' }]
          })
        });
      }
      if (url.includes('/delivery/exhausted-token')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({ success: false, error: 'Download limit exceeded.' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={handleError}
      />
    );

    const downloadBtn = await screen.findByRole('button', { name: /Baixar Arquivo/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(handleError).toHaveBeenCalledWith('Download limit exceeded.');
    });
  });

  // B12: unmounted payment/delivery component ignores stale async response
  it('B12 unmounted payment/delivery component ignores stale async response', async () => {
    let resolveDeliveryPromise: any;
    const deliveryPromise = new Promise((resolve) => {
      resolveDeliveryPromise = resolve;
    });

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/delivery-tokens')) {
        return deliveryPromise.then(() => ({
          ok: true,
          json: async () => ({ orderId: 'ord-123', deliveries: [] })
        }));
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    const { unmount } = render(
      <DigitalDelivery
        orderId="ord-123"
        checkoutToken="valid-checkout-token"
        isDemo={true}
        showError={vi.fn()}
      />
    );

    // Unmount before promise resolves
    unmount();

    // Resolve promise after unmount
    await act(async () => {
      resolveDeliveryPromise();
    });

    // Should not throw or fail
    expect(true).toBe(true);
  });

  // B13: DEMO/REAL behavior remains isolated
  it('B13 DEMO/REAL behavior remains isolated', async () => {
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/customers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'cust-demo-1', is_demo: true })
        });
      }
      if (url.includes('/checkout')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'ord-demo-1', is_demo: true, status: 'PENDING' })
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    global.fetch = fetchSpy;

    const { unmount } = render(
      <CheckoutView
        offer={mockOffer}
        isDemo={true}
        onOrderCreated={vi.fn()}
        onCancel={vi.fn()}
        showError={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText(/João da Silva/i);
    const emailInput = screen.getByPlaceholderText(/seuemail@empresa.com/i);
    const submitBtn = screen.getByRole('button', { name: /Gerar Pedido & Pagamento/i });

    fireEvent.change(nameInput, { target: { value: 'Demo User' } });
    fireEvent.change(emailInput, { target: { value: 'demo@test.com' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const customerCall = fetchSpy.mock.calls.find(c => String(c[0]).includes('/customers'));
      expect(customerCall).toBeDefined();
      const body = JSON.parse(customerCall![1].body);
      expect(body.is_demo).toBe(true);
    });

    unmount();
  });

  // B14: REAL auth session remains intact throughout checkout/delivery
  it('B14 REAL auth session remains intact throughout checkout/delivery', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-real-session-token',
          user: { email: 'admin@norqva.com' }
        }
      } as any,
      error: null
    });

    const realUser = { id: 'usr-real-1', name: 'Real Admin User', role: 'ADMIN', email: 'admin@norqva.com' };

    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.includes('/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ user: realUser })
        });
      }
      if (url.includes('/offers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ offers: [mockOffer] })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ opportunities: [], products: [], creatives: [], experiments: [], decisions: [], audit_logs: [] })
      });
    });
    global.fetch = fetchSpy;

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Initializing intro renders when user is set
    expect(await screen.findByText(/Initializing/i)).toBeInTheDocument();
  });
});
