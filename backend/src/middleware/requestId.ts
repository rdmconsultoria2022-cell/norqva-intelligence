import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

const VALID_ID_REGEX = /^[a-zA-Z0-9\-_]{8,64}$/;

export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incomingId = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;

    let requestId: string;

    if (incomingId && typeof incomingId === 'string' && VALID_ID_REGEX.test(incomingId)) {
      requestId = incomingId;
    } else {
      requestId = crypto.randomUUID();
    }

    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);

    next();
  };
}
