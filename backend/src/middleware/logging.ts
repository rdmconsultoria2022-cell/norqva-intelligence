import { Request, Response, NextFunction } from 'express';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'jwt',
  'secret',
  'key',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'asaas_api_key',
  'asaas-access-token',
  'cpf',
  'cnpj',
  'cpf_cnpj',
  'cpf_cnpj_encrypted',
  'pix_copy_paste',
  'download_url',
  'signed_url',
  'signedurl',
  'checkout_token',
  'raw_token'
]);

export function sanitizePayload(data: any): any {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Check if looks like a Bearer token
    if (data.startsWith('Bearer ')) {
      return '[REDACTED_BEARER_TOKEN]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizePayload(item));
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizePayload(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return data;
}

export function structuredLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      // Don't log health/ready endpoints in test mode to reduce noise
      if ((req.path === '/health' || req.path === '/ready') && process.env.NODE_ENV === 'test') {
        return;
      }

      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
        requestId: req.id || 'unknown',
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs,
        ip: req.ip || req.socket.remoteAddress || 'unknown'
      };

      if (process.env.NODE_ENV !== 'test') {
        console.log(JSON.stringify(logEntry));
      }
    });

    next();
  };
}
