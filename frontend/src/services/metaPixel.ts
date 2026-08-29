/**
 * NORQVA — Meta Pixel Official Integration Service
 * 
 * Provides safe, isolated Meta Pixel initialization, PageView, InitiateCheckout, and Purchase tracking.
 * - Only active in REAL / production mode
 * - Disabled in DEMO mode and during automated testing
 * - Idempotent initialization: fbq('init', pixelId)
 * - Single source of truth for PageView tracking via trackPageView(path)
 * - Authoritative Purchase event emission triggered strictly upon confirmed PAID backend status
 * - Deduplicated InitiateCheckout & Purchase tracking with deterministic eventIDs for Conversions API
 * - Zero PII transmission
 * - Fail-safe (never interrupts payment, checkout, digital delivery, or app navigation)
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

export interface MetaInitiateCheckoutParams {
  orderId: string;
  value: number;
  currency?: 'BRL';
  contentIds: string[];
  numItems?: number;
}

export interface MetaPurchaseParams {
  orderId: string;
  value: number;
  currency?: 'BRL';
  contentIds: string[];
  numItems?: number;
}

let isInitialized = false;
let lastTrackedPath: string | null = null;
let environmentOverrideForTesting: boolean | null = null;

// In-memory deduplication sets for current browser session
const sentInitiateCheckouts = new Set<string>();
const sentPurchases = new Set<string>();

/**
 * Retrieves the configured Meta Pixel ID from environment variables.
 */
export function getMetaPixelId(): string | undefined {
  return (import.meta as any).env?.VITE_META_PIXEL_ID;
}

/**
 * Checks whether the Meta Pixel is allowed to run in the current environment.
 * Pixel is disabled during automated tests (MODE === 'test' or NODE_ENV === 'test').
 */
export function isPixelEnvironmentAllowed(): boolean {
  if (environmentOverrideForTesting !== null) {
    return environmentOverrideForTesting;
  }
  const isTest = (import.meta as any).env?.MODE === 'test' || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test');
  return !isTest;
}

/**
 * Explicitly override the environment gate in isolated unit tests.
 */
export function setPixelEnvironmentAllowedForTesting(allowed: boolean | null): void {
  environmentOverrideForTesting = allowed;
}

/**
 * Initializes the Meta Pixel base script and registers the Pixel ID.
 * Does NOT fire PageView directly — PageView tracking is handled exclusively by trackPageView().
 * 
 * @param customPixelId Optional pixel ID to override the env variable (e.g. for testing)
 * @returns boolean indicating whether initialization was executed
 */
export function initMetaPixel(customPixelId?: string): boolean {
  if (!isPixelEnvironmentAllowed()) {
    return false;
  }

  const pixelId = customPixelId || getMetaPixelId();
  if (!pixelId) {
    return false;
  }

  if (isInitialized) {
    return true;
  }

  try {
    if (typeof window !== 'undefined') {
      if (!window.fbq) {
        const fbq: any = function (...args: any[]) {
          if (fbq.callMethod) {
            fbq.callMethod.apply(fbq, args);
          } else {
            fbq.queue.push(args);
          }
        };
        if (!window._fbq) window._fbq = fbq;
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = '2.0';
        fbq.queue = [];
        window.fbq = fbq;

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://connect.facebook.net/en_US/fbevents.js';
        const firstScript = document.getElementsByTagName('script')[0];
        if (firstScript && firstScript.parentNode) {
          firstScript.parentNode.insertBefore(script, firstScript);
        } else {
          document.head.appendChild(script);
        }
      }

      window.fbq('init', pixelId);
      isInitialized = true;
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Meta Pixel]: Failed to initialize safely:', err);
    return false;
  }
}

/**
 * Tracks a PageView event on initial load and on SPA route changes.
 * Single source of truth for PageView events.
 * Strictly avoids duplicate events when invoked on the exact same path.
 * 
 * @param path The current route/path (e.g. location.pathname + location.search)
 */
export function trackPageView(path?: string): void {
  if (!isPixelEnvironmentAllowed() || !isInitialized) {
    return;
  }

  const currentPath = path || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '');

  // Strict deduplication guard
  if (currentPath && currentPath === lastTrackedPath) {
    return;
  }

  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
      lastTrackedPath = currentPath;
    }
  } catch (err) {
    console.error('[Meta Pixel]: Failed to track PageView safely:', err);
  }
}

/**
 * Tracks an InitiateCheckout event when a customer initiates real payment checkout.
 * Deduplicated by orderId with deterministic eventID for Conversions API matching.
 * 
 * @param params MetaInitiateCheckoutParams
 */
export function trackInitiateCheckout(params: MetaInitiateCheckoutParams): boolean {
  if (!isPixelEnvironmentAllowed()) {
    return false;
  }

  // Ensure Pixel is initialized
  if (!isInitialized) {
    initMetaPixel();
  }

  if (!params || !params.orderId) {
    return false;
  }

  // Deduplication check
  if (sentInitiateCheckouts.has(params.orderId)) {
    return false;
  }

  try {
    const rawVal = Number(params.value);
    const value = !isNaN(rawVal) && rawVal >= 0 ? Number(rawVal.toFixed(2)) : 0;
    const currency = params.currency || 'BRL';
    const contentIds = Array.isArray(params.contentIds) && params.contentIds.length > 0
      ? params.contentIds.map(String)
      : [String(params.orderId)];
    const numItems = Number.isInteger(params.numItems) && (params.numItems as number) > 0
      ? Number(params.numItems)
      : 1;

    const payload = {
      value,
      currency,
      content_type: 'product',
      content_ids: contentIds,
      num_items: numItems
    };

    const options = {
      eventID: `checkout_${params.orderId}`
    };

    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'InitiateCheckout', payload, options);
      sentInitiateCheckouts.add(params.orderId);
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Meta Pixel]: Failed to track InitiateCheckout safely:', err);
    return false;
  }
}

/**
 * Tracks a Purchase event strictly upon authoritative backend confirmation (order.status === 'PAID').
 * Deduplicated in memory and across page refreshes via sessionStorage with deterministic eventID.
 * 
 * @param params MetaPurchaseParams
 */
export function trackPurchase(params: MetaPurchaseParams): boolean {
  if (!isPixelEnvironmentAllowed()) {
    return false;
  }

  // Ensure Pixel is initialized
  if (!isInitialized) {
    initMetaPixel();
  }

  if (!params || !params.orderId) {
    return false;
  }

  const orderId = String(params.orderId);

  // 1. In-memory deduplication check
  if (sentPurchases.has(orderId)) {
    return false;
  }

  // 2. Storage-based deduplication check (survives page refresh)
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (window.sessionStorage.getItem(`meta_purchase_sent_${orderId}`)) {
        sentPurchases.add(orderId);
        return false;
      }
    }
  } catch (_) {
    // Ignore storage access errors
  }

  try {
    const rawVal = Number(params.value);
    const value = !isNaN(rawVal) && rawVal >= 0 ? Number(rawVal.toFixed(2)) : 0;
    const currency = params.currency || 'BRL';
    const contentIds = Array.isArray(params.contentIds) && params.contentIds.length > 0
      ? params.contentIds.map(String)
      : [orderId];
    const numItems = Number.isInteger(params.numItems) && (params.numItems as number) > 0
      ? Number(params.numItems)
      : 1;

    const payload = {
      value,
      currency,
      content_type: 'product',
      content_ids: contentIds,
      num_items: numItems
    };

    const options = {
      eventID: `purchase_${orderId}`
    };

    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'Purchase', payload, options);
      
      // Mark as sent in memory and sessionStorage
      sentPurchases.add(orderId);
      try {
        if (window.sessionStorage) {
          window.sessionStorage.setItem(`meta_purchase_sent_${orderId}`, 'true');
        }
      } catch (_) {}

      return true;
    }
    return false;
  } catch (err) {
    console.error('[Meta Pixel]: Failed to track Purchase safely:', err);
    return false;
  }
}

/**
 * Returns whether the Meta Pixel has been successfully initialized.
 */
export function isMetaPixelInitialized(): boolean {
  return isInitialized;
}

/**
 * Resets the in-memory sets while preserving sessionStorage (simulating page reload).
 */
export function clearInMemoryDeduplicationForTesting(): void {
  sentInitiateCheckouts.clear();
  sentPurchases.clear();
}

/**
 * Resets the entire initialization and deduplication state (used for isolated unit testing).
 */
export function resetMetaPixelForTesting(): void {
  isInitialized = false;
  lastTrackedPath = null;
  environmentOverrideForTesting = null;
  sentInitiateCheckouts.clear();
  sentPurchases.clear();
  if (typeof window !== 'undefined') {
    delete window.fbq;
    delete window._fbq;
    try {
      if (window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch (_) {}
  }
}
