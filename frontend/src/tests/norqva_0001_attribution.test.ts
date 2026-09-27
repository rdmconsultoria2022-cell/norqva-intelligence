import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureUrlAttribution,
  getAttributionContext,
  getCookie
} from '../services/attribution';

describe('NORQVA-0001 — Frontend Attribution fbc/fbp Context', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = '_fbc=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = '_fbp=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation
    });
  });

  it('reads _fbc cookie directly if present', () => {
    document.cookie = '_fbc=fb.1.1710000000000.IwAR_testCookie123; path=/';
    delete (window as any).location;
    window.location = {
      search: '',
      pathname: '/p/OFF-000001'
    } as any;

    const ctx = getAttributionContext();
    expect(ctx.fbc).toBe('fb.1.1710000000000.IwAR_testCookie123');
  });

  it('builds fbc from fbclid when _fbc cookie is absent, preserving casing and timestamp', () => {
    const fixedNow = 1711234567890;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    delete (window as any).location;
    window.location = {
      search: '?fbclid=IwAR123AbCdEfGhIjKlMnOpQrStUvWxYz',
      pathname: '/p/OFF-000001'
    } as any;

    captureUrlAttribution();
    const ctx = getAttributionContext();

    expect(ctx.fbclid).toBe('IwAR123AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(ctx.fbc).toBe(`fb.1.${fixedNow}.IwAR123AbCdEfGhIjKlMnOpQrStUvWxYz`);
  });

  it('returns fbc as null when neither _fbc cookie nor fbclid is present', () => {
    delete (window as any).location;
    window.location = {
      search: '?utm_source=google',
      pathname: '/p/OFF-000001'
    } as any;

    captureUrlAttribution();
    const ctx = getAttributionContext();

    expect(ctx.fbclid).toBeNull();
    expect(ctx.fbc).toBeNull();
  });

  it('reads _fbp cookie when present and returns null when absent', () => {
    // 1. Absent
    delete (window as any).location;
    window.location = {
      search: '',
      pathname: '/p/OFF-000001'
    } as any;

    let ctx = getAttributionContext();
    expect(ctx.fbp).toBeNull();

    // 2. Present
    document.cookie = '_fbp=fb.1.1710000000000.9876543210; path=/';
    ctx = getAttributionContext();
    expect(ctx.fbp).toBe('fb.1.1710000000000.9876543210');
  });

  it('getCookie parses cookies correctly including encoded values', () => {
    document.cookie = 'custom_key=custom%20value; path=/';
    expect(getCookie('custom_key')).toBe('custom value');
    expect(getCookie('nonexistent_key')).toBeNull();
  });
});
