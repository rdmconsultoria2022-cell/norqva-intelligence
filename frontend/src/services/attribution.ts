/**
 * NORQVA — First-Party Attribution & Funnel Telemetry Service
 * 
 * Manages anonymous visitor_id, session_id, URL attribution parameters (fbclid, UTMs),
 * and lightweight first-party funnel telemetry emission.
 * 
 * - Anonymous: Zero PII, random UUIDs only.
 * - Deduplicated: In-memory guards prevent duplicate emissions from React re-renders.
 * - Fail-Safe: Never interrupts UI, checkout, or navigation.
 */

import { API_BASE } from '../lib/api';

export interface AttributionContext {
  visitor_id: string;
  session_id: string;
  fbclid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
}

export type FunnelEventType = 'LANDING_PAGE_VIEW' | 'OFFER_VIEW' | 'CHECKOUT_STARTED';

const sentFunnelEvents = new Set<string>();

/**
 * Returns or creates an anonymous first-party visitor_id.
 */
export function getVisitorId(): string {
  if (typeof window === 'undefined') return 'server_render_visitor';
  try {
    let vid = localStorage.getItem('norqva_visitor_id');
    if (!vid) {
      vid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('norqva_visitor_id', vid);
    }
    return vid;
  } catch (_) {
    return 'ephemeral_visitor';
  }
}

/**
 * Returns or creates an anonymous first-party session_id.
 */
export function getSessionId(): string {
  if (typeof window === 'undefined') return 'server_render_session';
  try {
    let sid = sessionStorage.getItem('norqva_session_id');
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 's_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem('norqva_session_id', sid);
    }
    return sid;
  } catch (_) {
    return 'ephemeral_session';
  }
}

/**
 * Captures attribution query parameters from current URL and stores in session context.
 * Backward-compatible, fail-safe, and non-blocking.
 */
export function captureUrlAttribution(): Partial<AttributionContext> {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get('fbclid');
    const utm_source = params.get('utm_source');
    const utm_medium = params.get('utm_medium');
    const utm_campaign = params.get('utm_campaign');
    const utm_content = params.get('utm_content');
    const utm_term = params.get('utm_term');
    const campaign_id = params.get('campaign_id');
    const adset_id = params.get('adset_id');
    const ad_id = params.get('ad_id');
    const placement = params.get('placement');
    const site_source_name = params.get('site_source_name');

    const ctx: Record<string, string> = {};
    if (fbclid) ctx.fbclid = fbclid;
    if (utm_source) ctx.utm_source = utm_source;
    if (utm_medium) ctx.utm_medium = utm_medium;
    if (utm_campaign) ctx.utm_campaign = utm_campaign;
    if (utm_content) ctx.utm_content = utm_content;
    if (utm_term) ctx.utm_term = utm_term;
    if (campaign_id) ctx.campaign_id = campaign_id;
    if (adset_id) ctx.adset_id = adset_id;
    if (ad_id) ctx.ad_id = ad_id;
    if (placement) ctx.placement = placement;
    if (site_source_name) ctx.site_source_name = site_source_name;

    if (Object.keys(ctx).length > 0) {
      const existing = JSON.parse(sessionStorage.getItem('norqva_attribution_ctx') || '{}');
      sessionStorage.setItem('norqva_attribution_ctx', JSON.stringify({ ...existing, ...ctx }));
    }

    return ctx;
  } catch (_) {
    return {};
  }
}

/**
 * Retrieves the complete current attribution context (stored + live params).
 */
export function getAttributionContext(): AttributionContext {
  const visitor_id = getVisitorId();
  const session_id = getSessionId();

  let stored: Record<string, string> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem('norqva_attribution_ctx') || '{}');
  } catch (_) {}

  const live = captureUrlAttribution();
  const merged = { ...stored, ...live };

  return {
    visitor_id,
    session_id,
    fbclid: merged.fbclid || null,
    utm_source: merged.utm_source || null,
    utm_medium: merged.utm_medium || null,
    utm_campaign: merged.utm_campaign || null,
    utm_content: merged.utm_content || null,
    utm_term: merged.utm_term || null,
    campaign_id: merged.campaign_id || null,
    adset_id: merged.adset_id || null,
    ad_id: merged.ad_id || null,
    placement: merged.placement || null,
    site_source_name: merged.site_source_name || null
  };
}

/**
 * Emits a first-party funnel telemetry event with deduplication guard.
 */
export async function sendFunnelEvent(
  eventType: FunnelEventType,
  offerHumanId?: string | null,
  metadata?: Record<string, any>,
  isDemo: boolean = false
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const attr = getAttributionContext();
  const path = window.location.pathname + window.location.search;
  const dedupKey = `${eventType}:${attr.session_id}:${offerHumanId || 'general'}:${path}`;

  if (sentFunnelEvents.has(dedupKey)) {
    return false;
  }

  const event_id = `evt_${eventType.toLowerCase()}_${attr.visitor_id.slice(0, 8)}_${Date.now().toString(36)}`;

  try {
    sentFunnelEvents.add(dedupKey);

    const enrichedMetadata = {
      ...(attr.utm_term ? { utm_term: attr.utm_term } : {}),
      ...(attr.campaign_id ? { campaign_id: attr.campaign_id } : {}),
      ...(attr.adset_id ? { adset_id: attr.adset_id } : {}),
      ...(attr.ad_id ? { ad_id: attr.ad_id } : {}),
      ...(attr.placement ? { placement: attr.placement } : {}),
      ...(attr.site_source_name ? { site_source_name: attr.site_source_name } : {}),
      ...(metadata || {})
    };

    const payload = {
      event_id,
      event_type: eventType,
      visitor_id: attr.visitor_id,
      session_id: attr.session_id,
      offer_human_id: offerHumanId || null,
      path: path.slice(0, 500),
      fbclid: attr.fbclid,
      utm_source: attr.utm_source,
      utm_medium: attr.utm_medium,
      utm_campaign: attr.utm_campaign,
      utm_content: attr.utm_content,
      metadata: Object.keys(enrichedMetadata).length > 0 ? enrichedMetadata : null
    };

    const modeQuery = isDemo ? '?mode=demo' : '';
    await fetch(`${API_BASE}/public/telemetry/events${modeQuery}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return true;
  } catch (_) {
    // Fail-safe: telemetry failure must never degrade visitor experience
    return false;
  }
}
