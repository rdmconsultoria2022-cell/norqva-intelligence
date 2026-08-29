import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMetaPixel,
  trackPageView,
  isMetaPixelInitialized,
  resetMetaPixelForTesting,
  getMetaPixelId,
  setPixelEnvironmentAllowedForTesting
} from '../services/metaPixel';

describe('Meta Pixel Base Integration', () => {
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

  it('P03: initializes window.fbq and tracks initial PageView when environment is allowed', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    const success = initMetaPixel(TEST_PIXEL_ID);
    expect(success).toBe(true);
    expect(isMetaPixelInitialized()).toBe(true);
    expect(fbqSpy).toHaveBeenCalledWith('init', TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenCalledWith('track', 'PageView');
  });

  it('P04: initialization is idempotent and does not re-run if already initialized', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenCalledTimes(2); // init + initial track PageView

    // Second initialization call
    const secondCall = initMetaPixel(TEST_PIXEL_ID);
    expect(secondCall).toBe(true);
    expect(fbqSpy).toHaveBeenCalledTimes(2); // Still 2, not called again
  });

  it('P05: trackPageView fires PageView on route change when initialized', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    expect(fbqSpy).toHaveBeenCalledWith('track', 'PageView');

    // Navigate to another path
    trackPageView('/offers/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(3); // init, initial PageView, route PageView
    expect(fbqSpy).toHaveBeenLastCalledWith('track', 'PageView');
  });

  it('P06: trackPageView suppresses duplicate PageView calls on the exact same route', () => {
    setPixelEnvironmentAllowedForTesting(true);

    const fbqSpy = vi.fn();
    window.fbq = fbqSpy;

    initMetaPixel(TEST_PIXEL_ID);
    trackPageView('/dashboard');
    expect(fbqSpy).toHaveBeenCalledTimes(3);

    // Re-triggering trackPageView on same path '/dashboard'
    trackPageView('/dashboard');
    expect(fbqSpy).toHaveBeenCalledTimes(3); // Not incremented

    // Different route
    trackPageView('/checkout/OFF-000001');
    expect(fbqSpy).toHaveBeenCalledTimes(4); // Incremented
  });

  it('P07: trackPageView gracefully handles errors if fbq throws or is blocked', () => {
    setPixelEnvironmentAllowedForTesting(true);

    window.fbq = vi.fn().mockImplementation(() => {
      throw new Error('Adblocker blocked fbq');
    });

    // Should not throw
    expect(() => {
      initMetaPixel(TEST_PIXEL_ID);
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
    trackPageView('/profile?email=test@norqva.com');

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
