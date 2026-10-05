import { Response } from 'express';
import { isIP } from 'net';
import { AuthenticatedRequest } from '../middleware/auth';

/**
 * H1.1 — DIAGNÓSTICO TEMPORÁRIO da cadeia de proxies (remover após a certificação do TRUST_PROXY).
 *
 * GET /api/diagnostics/proxy-chain (ADMIN). Somente leitura: não grava em banco nem em log.
 * Devolve só endereços IP e NOMES de cabeçalhos (nunca valores de Authorization, cookie ou outros).
 * Também calcula qual seria o req.ip para cada valor numérico de trust proxy, do mesmo jeito que o
 * Express (proxy-addr): lista = [socket, ...X-Forwarded-For do fim para o começo]; trust N => lista[N].
 */
const ipOrMarker = (v: string): string => {
  const s = v.trim().replace(/^\[|\]$/g, '');
  const bare = s.startsWith('::ffff:') ? s.slice(7) : s;
  return isIP(bare) ? bare : '[não-IP]';
};

const headerIp = (req: AuthenticatedRequest, name: string): string | null => {
  const v = req.header(name);
  return v ? v.split(',').map(ipOrMarker).join(', ') : null;
};

export async function getProxyChainDiagnostics(req: AuthenticatedRequest, res: Response) {
  const xffRaw = req.header('x-forwarded-for') || '';
  const xff = xffRaw ? xffRaw.split(',').map(ipOrMarker) : [];
  const socket = ipOrMarker(String(req.socket?.remoteAddress || ''));
  const addrs = [socket, ...[...xff].reverse()];
  const ipIfTrust: Record<string, string> = {};
  for (let n = 0; n <= Math.min(addrs.length, 6); n++) ipIfTrust[String(n)] = addrs[Math.min(n, addrs.length - 1)];

  return res.status(200).json({
    temporary: 'H1.1 — remover após a certificação',
    trust_proxy_env: process.env.TRUST_PROXY ?? null,
    trust_proxy_effective: String(req.app.get('trust proxy')),
    socket_remote_address: socket,
    req_ip: ipOrMarker(String(req.ip || '')),
    req_ips: (req.ips || []).map(ipOrMarker),
    x_forwarded_for: xff,
    x_forwarded_for_count: xff.length,
    x_real_ip: headerIp(req, 'x-real-ip'),
    cf_connecting_ip: headerIp(req, 'cf-connecting-ip'),
    true_client_ip: headerIp(req, 'true-client-ip'),
    x_forwarded_proto: req.header('x-forwarded-proto') || null,
    proxy_header_names: Object.keys(req.headers)
      .filter((h) => /^(x-forwarded-|x-real-ip|cf-|true-client-ip|via|forwarded|rndr-|render-|x-request-start|x-envoy-|fly-)/i.test(h))
      .sort(),
    req_ip_if_trust_proxy_n: ipIfTrust
  });
}
