import { describe, it, expect } from 'vitest';
import { anonymizeIp } from '../utils/ipPrivacy';

// H1.1 (privacidade): created_ip de compradores guarda só o prefixo anonimizado.
describe('H1.1 — anonymizeIp', () => {
  it('IPv4 keeps only the /24 prefix', () => {
    expect(anonymizeIp('177.39.125.33')).toBe('177.39.125.0/24');
    expect(anonymizeIp('::ffff:177.39.125.33')).toBe('177.39.125.0/24');
    expect(anonymizeIp(' 10.25.164.241 ')).toBe('10.25.164.0/24');
  });

  it('IPv6 keeps only the /48 prefix', () => {
    expect(anonymizeIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
    expect(anonymizeIp('2001:0db8:00ab:0012:0000:0000:0000:0001')).toBe('2001:db8:ab::/48');
    expect(anonymizeIp('2001:db8::1')).toBe('2001:db8:0::/48');
    expect(anonymizeIp('fe80::1%eth0')).toBe('fe80:0:0::/48');
  });

  it('never returns the full address', () => {
    for (const ip of ['177.39.125.33', '2001:db8:abcd:12::1', '::ffff:177.39.125.33']) {
      const out = anonymizeIp(ip) || '';
      expect(out).not.toContain('.33');
      expect(out).not.toContain(':12:');
    }
  });

  it('invalid or missing input becomes null', () => {
    for (const bad of [undefined, null, '', 'unknown_ip', '999.1.1.1', 'not-an-ip', 42, '1.2.3']) {
      expect(anonymizeIp(bad as any)).toBeNull();
    }
  });
});
