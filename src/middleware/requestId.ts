import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';

export function createRequestLoggerMiddleware(logger: Logger): RequestHandler {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id =
        typeof existing === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)
          ? existing
          : crypto.randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        host: req.headers?.host,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    httpLogger(req, res, () => {
      req.id = String(req.id || res.getHeader('X-Request-Id') || '');
      next();
    });
  };
}
