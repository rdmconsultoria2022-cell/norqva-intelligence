import { Request, Response, NextFunction } from 'express';

export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // 1. Prevent MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 2. Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // 3. Disable legacy XSS filter (modern browsers prefer CSP)
    res.setHeader('X-XSS-Protection', '0');

    // 4. Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 5. Cross-Origin policies (allow embedding/downloading signed assets)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // 6. HSTS (in production environments)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // 7. Remove sensitive server header
    res.removeHeader('X-Powered-By');

    next();
  };
}
