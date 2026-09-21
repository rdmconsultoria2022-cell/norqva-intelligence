import { describe, it, expect } from 'vitest';
import { resolveApiBase } from '../lib/api';

describe('Frontend API Base Routing Hardening', () => {
  it('preserves test mode fallback to /api', () => {
    expect(resolveApiBase(undefined, true)).toBe('/api');
    expect(resolveApiBase('', true)).toBe('/api');
  });

  it('accepts certified staging API URL without rejecting staging naming', () => {
    const certifiedUrl = 'https://norqva-staging-api.onrender.com/api';
    expect(resolveApiBase(certifiedUrl, false)).toBe(certifiedUrl);
    expect(resolveApiBase(certifiedUrl + '///', false)).toBe(certifiedUrl);
  });

  it('accepts production API URL in production mode', () => {
    const prodUrl = 'https://api.norqva.com/api';
    expect(resolveApiBase(prodUrl, false)).toBe(prodUrl);
  });

  it('fails closed and throws error when VITE_API_BASE_URL is missing in production mode', () => {
    expect(() => resolveApiBase(undefined, false)).toThrow(/API CONFIGURATION ERROR/);
    expect(() => resolveApiBase('', false)).toThrow(/API CONFIGURATION ERROR/);
    expect(() => resolveApiBase('   ', false)).toThrow(/API CONFIGURATION ERROR/);
  });
});
