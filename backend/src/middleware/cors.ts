import { Request, Response, NextFunction } from 'express';

export function configureCors() {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    // Server-to-server / non-browser requests (no Origin header) are always permitted
    if (!origin) {
      return next();
    }

    const envOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
      : [];

    const defaultDevOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];

    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? envOrigins
      : Array.from(new Set([...envOrigins, ...defaultDevOrigins]));

    const normalizedOrigin = origin.toLowerCase();
    const isAllowed = allowedOrigins.includes(normalizedOrigin);

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, x-checkout-token, x-request-id, x-correlation-id, x-user-id, x-user-role, asaas-access-token'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }

      return next();
    }

    if (req.method === 'OPTIONS') {
      return res.status(403).json({ error: 'CORS origin not allowed for preflight.' });
    }

    return res.status(403).json({ error: 'CORS origin not allowed.' });
  };
}
