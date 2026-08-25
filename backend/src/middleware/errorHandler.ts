import { Request, Response, NextFunction } from 'express';

export function errorHandler() {
  return (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const isProduction = process.env.NODE_ENV === 'production';

    // Mask internal error messages in production for 500s
    let clientMessage = err.message || 'Internal Server Error';
    if (status >= 500 && isProduction) {
      clientMessage = 'An unexpected internal server error occurred.';
    }

    if (process.env.NODE_ENV !== 'test') {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        requestId: req.id || 'unknown',
        method: req.method,
        path: req.originalUrl || req.url,
        status,
        error: isProduction ? 'Internal Server Error' : err.message,
        stack: isProduction ? undefined : err.stack
      }));
    }

    res.status(status).json({
      error: clientMessage,
      requestId: req.id
    });
  };
}
