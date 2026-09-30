import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initMetaPixel,
  trackViewContent,
  trackInitiateCheckout,
  trackPurchase,
  resetMetaPixelForTesting,
  setPixelEnvironmentAllowedForTesting
} from '../services/metaPixel';

// NORQVA-0018 (fase B): eventos vão só ao pixel da marca (trackSingle), com o mesmo eventID do CAPI.

describe('NORQVA-0018 — pixel da marca no navegador', () => {
  const DEFAULT_PIXEL = '1049452567443586';
  const BRAND_PIXEL = '2233445566778899';
  let fbq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMetaPixelForTesting();
    setPixelEnvironmentAllowedForTesting(true);
    fbq = vi.fn();
    window.fbq = fbq;
    initMetaPixel(DEFAULT_PIXEL);
  });

  afterEach(() => resetMetaPixelForTesting());

  it('Purchase e InitiateCheckout vão só ao pixel da marca, com eventID de deduplicação', () => {
    trackInitiateCheckout({ orderId: 'ord-1', value: 19.9, currency: 'BRL', contentIds: ['OFF-000001'], numItems: 1, pixelId: BRAND_PIXEL });
    trackPurchase({ orderId: 'ord-1', value: 19.9, currency: 'BRL', contentIds: ['OFF-000001'], numItems: 1, pixelId: BRAND_PIXEL });

    expect(fbq).toHaveBeenCalledWith('init', BRAND_PIXEL);
    expect(fbq.mock.calls.filter(c => c[0] === 'init' && c[1] === BRAND_PIXEL)).toHaveLength(1);
    expect(fbq).toHaveBeenCalledWith('trackSingle', BRAND_PIXEL, 'InitiateCheckout', expect.any(Object), { eventID: 'checkout_ord-1' });
    expect(fbq).toHaveBeenCalledWith('trackSingle', BRAND_PIXEL, 'Purchase', expect.any(Object), { eventID: 'purchase_ord-1' });
    expect(fbq.mock.calls.some(c => c[0] === 'track' && (c[1] === 'Purchase' || c[1] === 'InitiateCheckout'))).toBe(false);
  });

  it('sem pixel de marca (ou valor inválido) mantém o comportamento anterior', () => {
    trackViewContent({ contentName: 'Trattoria em Casa', contentIds: ['OFF-000001'], pixelId: null });
    trackPurchase({ orderId: 'ord-2', value: 19.9, currency: 'BRL', contentIds: ['OFF-000001'], numItems: 1, pixelId: 'abc' });

    expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', expect.any(Object));
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', expect.any(Object), { eventID: 'purchase_ord-2' });
    expect(fbq.mock.calls.some(c => c[0] === 'trackSingle')).toBe(false);
  });
});
