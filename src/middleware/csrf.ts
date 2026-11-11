import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    userId?: number;
    username?: string;
    role?: 'owner' | 'master';
    recentSignupUsername?: string;
  }
}

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

export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = req.session?.csrfToken;
  const submittedToken =
    (typeof req.body?._csrf === 'string' && req.body._csrf) ||
    (typeof req.headers['x-csrf-token'] === 'string' && req.headers['x-csrf-token']) ||
    '';

  if (!sessionToken || !submittedToken || sessionToken.length !== submittedToken.length) {
    return renderCsrfFailure(req, res);
  }

  const a = Buffer.from(sessionToken, 'utf8');
  const b = Buffer.from(submittedToken, 'utf8');

  if (!crypto.timingSafeEqual(a, b)) {
    return renderCsrfFailure(req, res);
  }

  next();
}

function renderCsrfFailure(req: Request, res: Response): void {
  if (req.accepts(['html', 'json']) === 'json' && !req.accepts('html')) {
    res.status(403).json({ error: 'Invalid or expired CSRF token. Please refresh and try again.' });
    return;
  }
  res.status(403).render('tenant-error', {
    title: 'Security Verification Failed',
    badge: '403 • CSRF Protection',
    heading: 'Session Verification Expired',
    message: 'Your form security token expired or was invalid. Please go back, refresh the page, and submit again.',
    ctaText: 'Go Back Home',
    ctaLink: '/',
    accent: '#f43f5e',
  });
}
