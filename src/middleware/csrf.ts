import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AuthError } from '../types/errors.js';

export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    return next(new Error('Session middleware must be initialized before CSRF middleware.'));
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction): void {
  const sessionToken = req.session?.csrfToken;
  const submittedToken =
    (typeof req.body?._csrf === 'string' && req.body._csrf) ||
    (typeof req.headers['x-csrf-token'] === 'string' && req.headers['x-csrf-token']) ||
    '';

  if (!sessionToken || !submittedToken || sessionToken.length !== submittedToken.length) {
    return next(
      new AuthError(
        'Invalid or expired CSRF token. Please refresh the page and try again.',
        403,
        'CSRF_INVALID',
        '_csrf'
      )
    );
  }

  const a = Buffer.from(sessionToken, 'utf8');
  const b = Buffer.from(submittedToken, 'utf8');

  if (!crypto.timingSafeEqual(a, b)) {
    return next(
      new AuthError(
        'Invalid or expired CSRF token. Please refresh the page and try again.',
        403,
        'CSRF_INVALID',
        '_csrf'
      )
    );
  }

  next();
}
