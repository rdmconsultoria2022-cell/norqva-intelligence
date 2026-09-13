import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureUrlAttribution,
  getAttributionContext,
  getVisitorId,
  getSessionId,
  sendFunnelEvent
} from '../services/attribution';

describe('NORQVA — Frontend Attribution Context Enrichment & Telemetry', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation
    });
  });

  it('captures all canonical and enriched URL parameters into sessionStorage', () => {
    delete (window as any).location;
    window.location = {
      search: '?utm_source=meta&utm_medium=cpc&utm_campaign=120249269452820001&utm_content=3495810001&utm_term=chef_pasta&fbclid=IwAR998877&campaign_id=120249269452820001&adset_id=2384910001&ad_id=3495810001&placement=Instagram_Feed&site_source_name=ig',
      pathname: '/p/OFF-000001'
    } as any;

    const captured = captureUrlAttribution();

    expect(captured.utm_source).toBe('meta');
    expect(captured.utm_medium).toBe('cpc');
    expect(captured.utm_campaign).toBe('120249269452820001');
    expect(captured.utm_content).toBe('3495810001');
    expect(captured.utm_term).toBe('chef_pasta');
    expect(captured.fbclid).toBe('IwAR998877');
    expect(captured.campaign_id).toBe('120249269452820001');
    expect(captured.adset_id).toBe('2384910001');
    expect(captured.ad_id).toBe('3495810001');
    expect(captured.placement).toBe('Instagram_Feed');
    expect(captured.site_source_name).toBe('ig');

    const fullCtx = getAttributionContext();
    expect(fullCtx.visitor_id).toBeDefined();
    expect(fullCtx.session_id).toBeDefined();
    expect(fullCtx.utm_term).toBe('chef_pasta');
    expect(fullCtx.ad_id).toBe('3495810001');
    expect(fullCtx.placement).toBe('Instagram_Feed');
  });

  it('preserves visitor_id across multiple page views in localStorage', () => {
    const vid1 = getVisitorId();
    const vid2 = getVisitorId();
    expect(vid1).toBe(vid2);
    expect(vid1.length).toBeGreaterThan(10);
  });

  it('preserves session_id in sessionStorage and generates unique session per tab', () => {
    const sid1 = getSessionId();
    const sid2 = getSessionId();
    expect(sid1).toBe(sid2);
  });

  it('fails open when no URL parameters are present', () => {
    delete (window as any).location;
    window.location = {
      search: '',
      pathname: '/p/OFF-000001'
    } as any;

    const captured = captureUrlAttribution();
    expect(captured).toEqual({});

    const fullCtx = getAttributionContext();
    expect(fullCtx.visitor_id).toBeDefined();
    expect(fullCtx.session_id).toBeDefined();
    expect(fullCtx.utm_source).toBeNull();
    expect(fullCtx.fbclid).toBeNull();
    expect(fullCtx.campaign_id).toBeNull();
  });

  it('sends funnel events with enriched metadata and deduplication guard', async () => {
    delete (window as any).location;
    window.location = {
      search: '?utm_source=meta&utm_term=culinaria&ad_id=3495810001',
      pathname: '/p/OFF-000001'
    } as any;

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as any);

    const firstEmit = await sendFunnelEvent('OFFER_VIEW', 'OFF-000001', { offer_name: 'Trattoria' });
    expect(firstEmit).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.event_type).toBe('OFFER_VIEW');
    expect(callBody.offer_human_id).toBe('OFF-000001');
    expect(callBody.utm_source).toBe('meta');
    expect(callBody.metadata.utm_term).toBe('culinaria');
    expect(callBody.metadata.ad_id).toBe('3495810001');
    expect(callBody.metadata.offer_name).toBe('Trattoria');

    // Deduplication prevents second emit for same path & session
    const secondEmit = await sendFunnelEvent('OFFER_VIEW', 'OFF-000001', { offer_name: 'Trattoria' });
    expect(secondEmit).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
