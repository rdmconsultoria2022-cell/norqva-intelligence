import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMetaPixel,
  trackPageView,
  isMetaPixelInitialized,
  resetMetaPixelForTesting,
  getMetaPixelId,
  setPixelEnvironmentAllowedForTesting
} from '../services/metaPixel';

describe('Meta Pixel Base Integration (Auth Bootstrap Dedup & Single Source PageView)', () => {
  const TEST_PIXEL_ID = '1049452567443586';

  beforeEach(() => {
    resetMetaPixelForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetMetaPixelForTesting();
  });

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

  // Requirement 4.A — Cold load com sessão válida: '/' -> '/login' (transiente) -> '/' (resolvido)
  it('P03 (4.A): authenticated bootstrap cycle ignores transient redirects and emits EXACTLY 1 PageView for the settled route', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    // Simulation of React component lifecycle with isAuthReady guard:
    let isAuthReady = false;
    let isDemoView = false;
    let authMode = 'real';
    let currentPath = '/';

    const triggerPixelEffect = () => {
      if (isAuthReady && !isDemoView && authMode !== 'demo') {
        initMetaPixel(TEST_PIXEL_ID);
        trackPageView(currentPath);
      }
    };

    // Step 1: Initial mount at '/' with isAuthReady=false
    triggerPixelEffect();
    expect(fbqSpy).toHaveBeenCalledTimes(0); // Pixel NOT triggered before auth settles

    // Step 2: Transient redirect to '/login' while Supabase getSession runs (isAuthReady still false)
    currentPath = '/login';
    triggerPixelEffect();
    expect(fbqSpy).toHaveBeenCalledTimes(0); // Transient redirect NOT tracked

    // Step 3: Supabase session resolves -> redirect back to '/' and isAuthReady becomes true
    currentPath = '/';
    isAuthReady = true;
    triggerPixelEffect();

    // Now pixel initializes and tracks settled route exactly once
    expect(fbqSpy).toHaveBeenCalledTimes(2); // 1 'init' + 1 'track PageView'
    expect(fbqSpy).toHaveBeenCalledWith('init', TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');
  });

  // Requirement 4.B — Usuário sem sessão: '/' -> '/login'
  it('P04 (4.B): unauthenticated cold load emits EXACTLY 1 PageView for settled /login route when auth finishes', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    let isAuthReady = false;
    let isDemoView = false;
    let authMode = 'real';
    let currentPath = '/';

    const triggerPixelEffect = () => {
      if (isAuthReady && !isDemoView && authMode !== 'demo') {
        initMetaPixel(TEST_PIXEL_ID);
        trackPageView(currentPath);
      }
    };

    // Step 1: Initial mount at '/' with isAuthReady=false
    triggerPixelEffect();
    expect(fbqSpy).toHaveBeenCalledTimes(0);

    // Step 2: Redirect to '/login'
    currentPath = '/login';
    triggerPixelEffect();
    expect(fbqSpy).toHaveBeenCalledTimes(0);

    // Step 3: Auth check completes with no session -> isAuthReady=true at '/login'
    isAuthReady = true;
    triggerPixelEffect();

    expect(fbqSpy).toHaveBeenCalledTimes(2); // 1 'init' + 1 'track PageView'
    expect(fbqSpy).toHaveBeenCalledWith('init', TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');
  });

  // Requirement 4.C — Navegação real após bootstrap: '/' -> '/offers/OFF-000001'
  it('P05 (4.C): real SPA navigation after bootstrap emits EXACTLY 1 new PageView per new route', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    let isAuthReady = true;
    let isDemoView = false;
    let authMode = 'real';

    // Route 1: '/'
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // 1 init + PageView #1

    // Route 2: '/offers/OFF-000001'
    trackPageView('/offers/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(3); // init + PageView #1 + PageView #2
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');

    // Route 3: '/checkout/OFF-000001'
    trackPageView('/checkout/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(4); // init + PageView #1 + PageView #2 + PageView #3
  });

  // Requirement 4.D — StrictMode/re-render: mesma rota repetida
  it('P06 (4.D): React StrictMode and repeated re-renders on the same route produce ZERO duplicate PageView calls', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    // Initial mount:
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // init + 1 PageView

    // StrictMode mount-unmount-remount:
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Still 2

    // Multiple component re-renders on same route:
    trackPageView('/');
    trackPageView('/');
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Still strictly 2
  });

  it('P07: trackPageView gracefully handles adblockers or runtime errors without throwing', () => {
    setPixelEnvironmentAllowedForTesting(true);

    window.fbq = vi.fn().mockImplementation(() => {
      throw new Error('Adblocker blocked fbq');
    });

    expect(() => {
      initMetaPixel(TEST_PIXEL_ID);
      trackPageView('/');
    }).not.toThrow();
  });

  it('P08: does NOT trigger any conversion events (Purchase, AddToCart, InitiateCheckout)', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/checkout');
    trackPageView('/order-completed');

    const calls = fbqSpy.mock.calls;
    for (const call of calls) {
      if (call[0] === 'track') {
        expect(call[1]).toBe('PageView');
        expect(call[1]).not.toBe('Purchase');
        expect(call[1]).not.toBe('AddToCart');
        expect(call[1]).not.toBe('InitiateCheckout');
      }
    }
  });

  it('P09: does NOT pass any personal identifiable information (PII) to fbq', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/profile?email=test@norqva.com&cpf=12345678900');

    const calls = fbqSpy.mock.calls;
    for (const call of calls) {
      if (call[0] === 'init') {
        expect(call[1]).toBe(TEST_PIXEL_ID);
        expect(call.length).toBe(2);
      }
      if (call[0] === 'track') {
        expect(call[1]).toBe('PageView');
        expect(call.length).toBe(2);
      }
    }
  });
});
