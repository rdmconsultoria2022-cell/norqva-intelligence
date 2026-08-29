import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { PaymentStatus } from '../features/payment/PaymentStatus';
import * as metaPixelService from '../services/metaPixel';

describe('Gate 2.5E: Checkout Polling Rate Limit Resilience & Observability (R03 - R09)', () => {
  const defaultProps = {
    orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
    checkoutToken: 'tok_valid_test_token_123',
    amount: 17.90,
    initialPayment: {
      id: 'pay_04f865ff',
      human_id: 'PG-20260829-DB6F42',
      order_id: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      provider: 'ASAAS',
      status: 'PENDING' as const,
      amount: 17.90,
      pix_copy_paste: '00020101021226820014br.gov.bcb.pix2560pix-h.asaas.com',
      is_demo: false,
      provider_environment: 'SANDBOX' as const,
      external_reference: 'd6f09425-f69c-4d1d-88eb-23eb574fd7f8',
      created_at: new Date().toISOString()
    },
    isDemo: false,
    onClose: vi.fn(),
    onPaymentConfirmed: vi.fn(),
    showError: vi.fn(),
    showSuccess: vi.fn()
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(metaPixelService, 'trackPurchase').mockReturnValue(true);
    metaPixelService.resetMetaPixelForTesting();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // R03: Polling schedule employs adaptive backoff without excessive frequency
  it('R03: polling runs initially at reasonable interval without excessive query frequency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: defaultProps.orderId, status: 'PENDING' })
    });
    global.fetch = fetchMock;

    render(<PaymentStatus {...defaultProps} />);

    // Fast-forward 2.5s -> 0 polling calls yet
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Advance to 3s -> exactly 1 polling call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // R04: Simulated HTTP 429 during polling maintains PENDENTE status and does NOT show failure
  it('R04: HTTP 429 on status polling does not transition to FAILED and shows non-destructive notice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many order status requests. Please try again later.' })
    });
    global.fetch = fetchMock;

    render(<PaymentStatus {...defaultProps} />);

    // Trigger polling call at 3s which returns 429
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    // Expect status to still be PENDENTE (not FAILED)
    expect(screen.getByText(/Status: PENDENTE/i)).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível gerar o pagamento Pix/i)).not.toBeInTheDocument();

    // Expect non-destructive notice to be presented
    expect(screen.getByText(/Atualização temporariamente limitada. Continuaremos verificando o pagamento./i)).toBeInTheDocument();
  });

  // R05: HTTP 429 does not recreate Order or Payment
  it('R05: HTTP 429 on status polling never calls order or pix creation endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many checkout requests.' })
    });
    global.fetch = fetchMock;

    render(<PaymentStatus {...defaultProps} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
      await vi.advanceTimersByTimeAsync(15500);
    });

    // Verify all calls were GET /orders/:id and no POST calls were made
    const postCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'POST');
    expect(postCalls.length).toBe(0);
  });

  // R06: Polling cleanup: unmount clears active timer and leaves 0 orphan loops
  it('R06: component unmount cleanly cancels polling timer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: defaultProps.orderId, status: 'PENDING' })
    });
    global.fetch = fetchMock;

    const { unmount } = render(<PaymentStatus {...defaultProps} />);

    // Unmount before first poll fires
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    // 0 fetch calls because timer was destroyed
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  // R07: Transition PENDING -> PAID concludes polling and invokes onPaymentConfirmed
  it('R07: transition to PAID terminates polling and invokes callbacks', async () => {
    const onPaymentConfirmed = vi.fn();
    const showSuccess = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: defaultProps.orderId,
        status: 'PAID',
        total_amount: 17.90,
        items: [{ offer_id: 'OFF-0001', quantity: 1 }]
      })
    });
    global.fetch = fetchMock;

    render(
      <PaymentStatus
        {...defaultProps}
        onPaymentConfirmed={onPaymentConfirmed}
        showSuccess={showSuccess}
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(onPaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(showSuccess).toHaveBeenCalledWith('Pagamento confirmado com sucesso!');
    expect(metaPixelService.trackPurchase).toHaveBeenCalledTimes(1);

    // Advance more time -> no further polling calls
    fetchMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  // R08: Delayed webhook keeps modal functional across multiple PENDING polls
  it('R08: multiple PENDING polling cycles keep modal active and Pix copy-paste interactive', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: defaultProps.orderId, status: 'PENDING' })
    });
    global.fetch = fetchMock;

    render(<PaymentStatus {...defaultProps} />);

    // Simulate 3 polling cycles (3s initial, then 5s, then 5s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Status: PENDENTE/i)).toBeInTheDocument();
    expect(screen.getByText(/Copiar Código Pix/i)).toBeInTheDocument();
  });

  // R09: Meta Purchase remains strictly dependent on order.status === PAID
  it('R09: Meta trackPurchase is strictly gated to order.status === PAID', async () => {
    let currentStatus = 'PENDING';
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: defaultProps.orderId,
        status: currentStatus,
        total_amount: 17.90
      })
    }));
    global.fetch = fetchMock;

    render(<PaymentStatus {...defaultProps} />);

    // Cycle 1: PENDING
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(metaPixelService.trackPurchase).toHaveBeenCalledTimes(0);

    // Cycle 2: PAID
    currentStatus = 'PAID';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5500);
    });
    expect(metaPixelService.trackPurchase).toHaveBeenCalledTimes(1);
  });
});
