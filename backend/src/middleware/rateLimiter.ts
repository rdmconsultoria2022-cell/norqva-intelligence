import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  name?: string;
  skip?: (req: Request) => boolean;
}

const stores = new Map<string, Map<string, number[]>>();

export function resetAllRateLimits(): void {
  stores.clear();
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    name = 'default',
    skip
  } = options;

  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip && skip(req)) {
      return next();
    }

    const now = Date.now();
    const clientKey = (req.ip || req.socket.remoteAddress || 'unknown_ip') + '_' + (req.headers['x-forwarded-for'] || '');

    const timestamps = store.get(clientKey) || [];
    const validTimestamps = timestamps.filter(t => now - t < windowMs);

    if (validTimestamps.length >= max) {
      const oldest = validTimestamps[0];
      const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);

      res.setHeader('Retry-After', String(retryAfterSec > 0 ? retryAfterSec : 1));
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', '0');

      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSec
      });
    }

    validTimestamps.push(now);
    store.set(clientKey, validTimestamps);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(max - validTimestamps.length));

    next();
  };
}

// Preset Limiters
export const generalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 500,
  name: 'general'
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again later.',
  name: 'auth'
});

export const checkoutRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: 'Too many checkout requests. Please try again later.',
  name: 'checkout'
});

export const deliveryRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: 'Too many download requests. Please try again later.',
  name: 'delivery'
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5000, // Safe high-throughput allowance for provider webhooks
  name: 'webhook'
});
