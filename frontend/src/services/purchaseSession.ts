export interface PurchaseSession {
  orderId: string;
  checkoutToken: string;
  offerHumanId: string;
  status: 'PENDING' | 'PAID';
  offerName?: string;
  savedAt: string;
}

const STORAGE_PREFIX = 'norqva_purchase_';
const LAST_OFFER_PREFIX = 'norqva_last_order_offer_';

/**
 * Save minimal non-PII purchase session to localStorage
 */
export function savePurchaseSession(session: {
  orderId: string;
  checkoutToken: string;
  offerHumanId: string;
  status: 'PENDING' | 'PAID';
  offerName?: string;
}): void {
  try {
    const payload: PurchaseSession = {
      orderId: session.orderId,
      checkoutToken: session.checkoutToken,
      offerHumanId: session.offerHumanId,
      status: session.status,
      offerName: session.offerName,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(`${STORAGE_PREFIX}${session.orderId}`, JSON.stringify(payload));
    localStorage.setItem(`${LAST_OFFER_PREFIX}${session.offerHumanId}`, session.orderId);
  } catch (err) {
    console.warn('[PurchaseSession]: Unable to save purchase session to localStorage:', err);
  }
}

/**
 * Retrieve purchase session by orderId
 */
export function getPurchaseSession(orderId: string): PurchaseSession | null {
  try {
    const data = localStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
    if (!data) return null;
    return JSON.parse(data) as PurchaseSession;
  } catch (err) {
    return null;
  }
}

/**
 * Retrieve the latest purchase session for a specific offer human_id
 */
export function getPurchaseSessionByOffer(offerHumanId: string): PurchaseSession | null {
  try {
    const orderId = localStorage.getItem(`${LAST_OFFER_PREFIX}${offerHumanId}`);
    if (!orderId) return null;
    return getPurchaseSession(orderId);
  } catch (err) {
    return null;
  }
}

/**
 * Update purchase session status (e.g. from PENDING to PAID)
 */
export function updatePurchaseSessionStatus(orderId: string, status: 'PENDING' | 'PAID'): void {
  try {
    const existing = getPurchaseSession(orderId);
    if (existing) {
      existing.status = status;
      existing.savedAt = new Date().toISOString();
      localStorage.setItem(`${STORAGE_PREFIX}${orderId}`, JSON.stringify(existing));
    }
  } catch (err) {
    console.warn('[PurchaseSession]: Unable to update purchase session:', err);
  }
}

/**
 * Clear purchase session
 */
export function clearPurchaseSession(orderId: string, offerHumanId?: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${orderId}`);
    if (offerHumanId) {
      localStorage.removeItem(`${LAST_OFFER_PREFIX}${offerHumanId}`);
    }
  } catch (_) {}
}
