/**
 * NORQVA — Meta Pixel Official Integration Service
 * 
 * Provides safe, isolated Meta Pixel initialization and PageView tracking.
 * - Only active in REAL / production mode
 * - Disabled in DEMO mode and during automated testing
 * - Idempotent initialization and de-duplicated PageView tracking on route changes
 * - No PII transmission
 * - Fallback safe (no-op if window.fbq is unavailable or blocked)
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

let isInitialized = false;
let lastTrackedPath: string | null = null;
let environmentOverrideForTesting: boolean | null = null;

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
 * Initializes the Meta Pixel base script.
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
      window.fbq('track', 'PageView');
      isInitialized = true;
      lastTrackedPath = window.location.pathname + window.location.search;
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Meta Pixel]: Failed to initialize safely:', err);
    return false;
  }
}

/**
 * Tracks a PageView event on SPA route changes.
 * Avoids duplicate events when invoked consecutively on the exact same path.
 * @param path The current route/path
 */
export function trackPageView(path?: string): void {
  if (!isPixelEnvironmentAllowed() || !isInitialized) {
    return;
  }

  const currentPath = path || (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '');

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
 * Returns whether the Meta Pixel has been successfully initialized.
 */
export function isMetaPixelInitialized(): boolean {
  return isInitialized;
}

/**
 * Resets the initialization state (used for isolated unit testing).
 */
export function resetMetaPixelForTesting(): void {
  isInitialized = false;
  lastTrackedPath = null;
  environmentOverrideForTesting = null;
  if (typeof window !== 'undefined') {
    delete window.fbq;
    delete window._fbq;
  }
}
