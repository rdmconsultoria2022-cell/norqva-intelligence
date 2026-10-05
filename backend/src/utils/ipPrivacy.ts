import { isIP } from 'net';

/**
 * H1.1 (privacidade): minimização do IP de compradores.
 *
 * `order_recovery_tokens.created_ip` e `order_customer_sessions.created_ip` não têm leitor nem
 * finalidade definida no código. Com o `trust proxy` corrigido, `req.ip` passa a ser o IP real do
 * comprador; para não criar uma coleta nova de dado pessoal, esses campos guardam só o prefixo de
 * rede anonimizado:
 *   - IPv4 → /24 (último octeto zerado), ex.: 177.39.125.33 → 177.39.125.0/24
 *   - IPv6 → /48 (três primeiros grupos), ex.: 2001:db8:abcd:12::1 → 2001:db8:abcd::/48
 * Valor ausente ou inválido → null. IPv4 mapeado em IPv6 (::ffff:a.b.c.d) é tratado como IPv4.
 */
export function anonymizeIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let ip = raw.trim();
  if (!ip) return null;
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);

  const version = isIP(ip);
  if (version === 4) {
    const [a, b, c] = ip.split('.');
    return `${a}.${b}.${c}.0/24`;
  }
  if (version === 6) {
    const groups = expandIpv6(ip);
    if (!groups) return null;
    const prefix = groups.slice(0, 3).map((g) => g.replace(/^0+(?=.)/, '').toLowerCase());
    return `${prefix.join(':')}::/48`;
  }
  return null;
}

function expandIpv6(ip: string): string[] | null {
  let s = ip.split('%')[0];
  // IPv4 embutido no fim (ex.: 64:ff9b::1.2.3.4) vira dois grupos hexadecimais
  const v4 = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    s = s.slice(0, -v4[0].length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array(missing).fill('0'), ...tail];
}
