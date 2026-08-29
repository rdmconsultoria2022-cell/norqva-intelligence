import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMetaPixel,
  trackPageView,
  isMetaPixelInitialized,
  resetMetaPixelForTesting,
  getMetaPixelId,
  setPixelEnvironmentAllowedForTesting
} from '../services/metaPixel';

describe('Meta Pixel Base Integration (Strict Deduplication & Single Source PageView)', () => {
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
    // By default in vitest, isPixelEnvironmentAllowed() is false
    const initialized = initMetaPixel(TEST_PIXEL_ID);
    expect(initialized).toBe(false);
    expect(isMetaPixelInitialized()).toBe(false);
    expect(window.fbq).toBeUndefined();
  });

  it('P03: initial load with initMetaPixel + trackPageView sends EXACTLY 1 PageView', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    // Simulate initial mount on '/'
    const initialized = initMetaPixel(TEST_PIXEL_ID);
    expect(initialized).toBe(true);
    expect(fbqSpy).toHaveBeenCalledWith('init', TEST_PIXEL_ID);
    expect(fbqSpy).not.toHaveBeenCalledWith('track', 'PageView'); // init does NOT fire PageView

    // Initial trackPageView
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // 1 'init' + 1 'track PageView'
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');
  });

  it('P04: React StrictMode / re-renders on the same route produce ZERO duplicate PageView calls', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    // Initial mount:
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // init + 1 PageView

    // StrictMode mount-unmount-remount simulation:
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // No additional PageView

    // Component re-render simulation:
    trackPageView('/');
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Still strictly 2 calls (1 init + 1 PageView)
  });

  it('P05: state updates (authMode / isDemoView toggle) on the same route produce ZERO additional PageView calls', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/dashboard');
    expect(fbqSpy).toHaveBeenCalledTimes(2);

    // Repeated execution of unified effect on same route:
    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/dashboard');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Not incremented
  });

  it('P06: real SPA route change sends EXACTLY 1 new PageView', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // init + PageView #1

    // Navigate to /offers/OFF-000001:
    trackPageView('/offers/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(3); // init + PageView #1 + PageView #2
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');
  });

  it('P07: duplicate triggers on the new route are suppressed', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/offers/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(2);

    // Re-trigger on same route:
    trackPageView('/offers/OFF-000001');
    trackPageView('/offers/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Still strictly 2
  });

  it('P08: navigating back to previous route sends EXACTLY 1 new PageView', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(2); // PageView #1

    trackPageView('/checkout/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(3); // PageView #2

    trackPageView('/');
    expect(fbqSpy).toHaveBeenCalledTimes(4); // PageView #3
  });

  it('P09: trackPageView gracefully handles adblockers or runtime errors without throwing', () => {
    setPixelEnvironmentAllowedForTesting(true);

    window.fbq = vi.fn().mockImplementation(() => {
      throw new Error('Adblocker blocked fbq');
    });

    expect(() => {
      initMetaPixel(TEST_PIXEL_ID);
      trackPageView('/');
    }).not.toThrow();
  });

  it('P10: does NOT trigger any conversion events (Purchase, AddToCart, InitiateCheckout)', () => {
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

  it('P11: does NOT pass any personal identifiable information (PII) to fbq', () => {
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
