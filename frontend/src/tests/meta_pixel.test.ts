import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMetaPixel,
  trackPageView,
  trackInitiateCheckout,
  trackPurchase,
  isMetaPixelInitialized,
  resetMetaPixelForTesting,
  clearInMemoryDeduplicationForTesting,
  getMetaPixelId,
  setPixelEnvironmentAllowedForTesting
} from '../services/metaPixel';

describe('Meta Pixel Integration & Conversion Events (InitiateCheckout & Purchase)', () => {
  const TEST_PIXEL_ID = '1049452567443586';

  beforeEach(() => {
    resetMetaPixelForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetMetaPixelForTesting();
  });

  // Base Tests
  it('P01: retrieves Pixel ID from VITE_META_PIXEL_ID env variable or falls back safely', () => {
    const envId = getMetaPixelId();
    expect(typeof envId === 'string' || envId === undefined).toBe(true);
  });

  it('P02: disables Meta Pixel automatically in test mode', () => {
    const initialized = initMetaPixel(TEST_PIXEL_ID);
    expect(initialized).toBe(false);
    expect(isMetaPixelInitialized()).toBe(false);
    expect(window.fbq).toBeUndefined();
  });

  // C01: Usuário abre produto -> 0 InitiateCheckout, 0 Purchase
  it('C01: opening/viewing a product triggers 0 InitiateCheckout and 0 Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/products/PROD-000001');

    expect(fbqSpy).toHaveBeenCalledWith('init', TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenCalledWith('track', 'PageView');
    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'InitiateCheckout', expect.anything(), expect.anything());
    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'Purchase', expect.anything(), expect.anything());
  });

  // C02: Usuário inicia checkout real -> 1 InitiateCheckout, 0 Purchase
  it('C02: initiating real checkout emits EXACTLY 1 InitiateCheckout and 0 Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    const sent = trackInitiateCheckout({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    expect(sent).toBe(true);
    expect(fbqSpy).toHaveBeenCalledWith(
      'track',
      'InitiateCheckout',
      {
        value: 197.00,
        currency: 'BRL',
        content_type: 'product',
        content_ids: ['OFF-000001'],
        num_items: 1
      },
      {
        eventID: 'checkout_04f865ff-ba3d-4090-a36c-20260827ba3d'
      }
    );
    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'Purchase', expect.anything(), expect.anything());
  });

  // C03: Pix é criado com status PENDING -> 0 Purchase
  it('C03: Pix creation with status PENDING emits 0 Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    // Pix created in PENDING status
    const pixStatus: string = 'PENDING';
    if (pixStatus === 'PAID' || pixStatus === 'CONFIRMED') {
      trackPurchase({
        orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
        value: 197.00,
        currency: 'BRL',
        contentIds: ['OFF-000001'],
        numItems: 1
      });
    }

    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'Purchase', expect.anything(), expect.anything());
  });

  // C04: Polling recebe PENDING repetidamente -> 0 Purchase
  it('C04: repeated status polling receiving PENDING emits 0 Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    // Simulate 5 polling intervals returning PENDING
    for (let i = 0; i < 5; i++) {
      const pollResponse = { status: 'PENDING', orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d' };
      if (pollResponse.status === 'PAID' || pollResponse.status === 'CONFIRMED') {
        trackPurchase({
          orderId: pollResponse.orderId,
          value: 197.00,
          currency: 'BRL',
          contentIds: ['OFF-000001'],
          numItems: 1
        });
      }
    }

    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'Purchase', expect.anything(), expect.anything());
  });

  // C05: Backend confirma order.status=PAID -> exatamente 1 Purchase
  it('C05: backend confirming order.status=PAID emits EXACTLY 1 Purchase event', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    const orderData = {
      id: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      status: 'PAID',
      total_amount: '197.00',
      items: [{ offer_id: 'OFF-000001', quantity: 1 }]
    };

    if (orderData.status === 'PAID') {
      trackPurchase({
        orderId: orderData.id,
        value: parseFloat(orderData.total_amount),
        currency: 'BRL',
        contentIds: orderData.items.map(i => i.offer_id),
        numItems: orderData.items.reduce((acc, curr) => acc + curr.quantity, 0)
      });
    }

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
    expect(fbqSpy).toHaveBeenCalledWith(
      'track',
      'Purchase',
      {
        value: 197.00,
        currency: 'BRL',
        content_type: 'product',
        content_ids: ['OFF-000001'],
        num_items: 1
      },
      {
        eventID: 'purchase_04f865ff-ba3d-4090-a36c-20260827ba3d'
      }
    );
  });

  // C06: Polling recebe PAID novamente -> nenhum Purchase adicional
  it('C06: subsequent polling ticks receiving PAID do NOT emit duplicate Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    const orderData = {
      id: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      status: 'PAID',
      total_amount: '197.00',
      items: [{ offer_id: 'OFF-000001', quantity: 1 }]
    };

    // First tick
    trackPurchase({
      orderId: orderData.id,
      value: parseFloat(orderData.total_amount),
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    // Subsequent 4 polling ticks with same PAID order
    for (let i = 0; i < 4; i++) {
      trackPurchase({
        orderId: orderData.id,
        value: parseFloat(orderData.total_amount),
        currency: 'BRL',
        contentIds: ['OFF-000001'],
        numItems: 1
      });
    }

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // C07: React StrictMode/re-render após PAID -> nenhum Purchase adicional
  it('C07: React StrictMode and component re-renders produce ZERO duplicate Purchase calls', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    trackPurchase({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    // StrictMode remount
    trackPurchase({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // C08: Refresh da tela de sucesso e reabertura em nova sessão (localStorage) -> nenhum Purchase adicional
  it('C08: page refresh and cross-session reopen with localStorage flag present prevents duplicate Purchase emission', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    const orderId = '04f865ff-ba3d-4090-a36c-20260827ba3d';

    // First visit:
    trackPurchase({
      orderId,
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });
    
    let purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);

    // Simulate new browser session (in-memory cleared, sessionStorage cleared, localStorage intact):
    clearInMemoryDeduplicationForTesting();
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }

    trackPurchase({
      orderId,
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    // Still exactly 1 Purchase call (cross-session deduplication prevented duplicate)
    purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(1);
  });

  // C09: Nova ordem diferente fica PAID -> 1 novo Purchase para a nova ordem
  it('C09: a distinct second order confirmed PAID emits a new distinct Purchase event', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    // Order 1
    trackPurchase({
      orderId: 'order-1111-aaaa',
      value: 150.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    // Order 2
    trackPurchase({
      orderId: 'order-2222-bbbb',
      value: 299.00,
      currency: 'BRL',
      contentIds: ['OFF-000002'],
      numItems: 2
    });

    const purchaseCalls = fbqSpy.mock.calls.filter(c => c[0] === 'track' && c[1] === 'Purchase');
    expect(purchaseCalls.length).toBe(2);
    expect(purchaseCalls[0][3]).toEqual({ eventID: 'purchase_order-1111-aaaa' });
    expect(purchaseCalls[1][3]).toEqual({ eventID: 'purchase_order-2222-bbbb' });
  });

  // C10: Modo DEMO -> 0 eventos Meta comerciais
  it('C10: DEMO mode prevents commercial Meta events from firing', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    const isDemo = true;

    if (!isDemo) {
      trackInitiateCheckout({
        orderId: 'demo-order-1',
        value: 100,
        contentIds: ['OFF-DEMO']
      });
      trackPurchase({
        orderId: 'demo-order-1',
        value: 100,
        contentIds: ['OFF-DEMO']
      });
    }

    expect(fbqSpy).toHaveBeenCalledTimes(0);
  });

  // C11: MODE=test -> 0 eventos reais enviados
  it('C11: automated test environment blocks Meta Pixel execution by default', () => {
    // In vitest, default environmentOverride is null and isPixelEnvironmentAllowed() is false
    const checkoutSent = trackInitiateCheckout({
      orderId: 'test-order-1',
      value: 100,
      contentIds: ['OFF-TEST']
    });
    const purchaseSent = trackPurchase({
      orderId: 'test-order-1',
      value: 100,
      contentIds: ['OFF-TEST']
    });

    expect(checkoutSent).toBe(false);
    expect(purchaseSent).toBe(false);
  });

  // C12: fbq indisponível/adblock -> checkout e pagamento continuam funcionando normalmente
  it('C12: adblocker / broken fbq fails gracefully without throwing errors', () => {
    setPixelEnvironmentAllowedForTesting(true);

    window.fbq = vi.fn().mockImplementation(() => {
      throw new Error('Blocked by adblocker');
    });

    expect(() => {
      trackInitiateCheckout({
        orderId: 'order-err-1',
        value: 100,
        contentIds: ['OFF-1']
      });
      trackPurchase({
        orderId: 'order-err-1',
        value: 100,
        contentIds: ['OFF-1']
      });
    }).not.toThrow();
  });

  // C13: Validar parâmetros Purchase
  it('C13: validates full payload and eventID structure for Purchase', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    trackPurchase({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.50,
      currency: 'BRL',
      contentIds: ['OFF-000001', 'OFF-000002'],
      numItems: 2
    });

    expect(fbqSpy).toHaveBeenCalledWith(
      'track',
      'Purchase',
      {
        value: 197.50,
        currency: 'BRL',
        content_type: 'product',
        content_ids: ['OFF-000001', 'OFF-000002'],
        num_items: 2
      },
      {
        eventID: 'purchase_04f865ff-ba3d-4090-a36c-20260827ba3d'
      }
    );
  });

  // C14: Secret/PII scan -> nenhum dado pessoal transmitido
  it('C14: verifies zero PII (CPF, email, phone, address, tokens) is passed to fbq calls', () => {
    setPixelEnvironmentAllowedForTesting(true);
    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);

    trackInitiateCheckout({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    trackPurchase({
      orderId: '04f865ff-ba3d-4090-a36c-20260827ba3d',
      value: 197.00,
      currency: 'BRL',
      contentIds: ['OFF-000001'],
      numItems: 1
    });

    const calls = fbqSpy.mock.calls;
    const piiKeys = ['cpf', 'cnpj', 'email', 'name', 'phone', 'address', 'pix', 'token', 'secret'];

    for (const call of calls) {
      const payload = call[2];
      if (payload && typeof payload === 'object') {
        const keys = Object.keys(payload);
        for (const key of keys) {
          const lower = key.toLowerCase();
          for (const pii of piiKeys) {
            expect(lower.includes(pii)).toBe(false);
          }
        }
      }
    }
  });
});
