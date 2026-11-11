import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users, User } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

export type SafeUser = Omit<User, 'password_hash'>;

declare global {
  namespace Express {
    interface Request {
      currentUser?: SafeUser;
    }
  }
}

export function attachCurrentUser(req: Request, res: Response, next: NextFunction): void {
  res.locals.currentUser = null;
  res.locals.baseDomain = config.baseDomain;

  const userId = req.session?.userId;
  if (!userId) {
    return next();
  }

  try {
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || user.status === 'suspended') {
      req.session.destroy(() => {});
      return next();
    }

    const { password_hash: _ignored, ...safeUser } = user;
    req.currentUser = safeUser;
    res.locals.currentUser = safeUser;
    next();
  } catch (err) {
    console.error('Error loading session user:', err);
    next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    if (req.isTenantRequest) {
      const rootLoginUrl = config.isProd
        ? `https://${config.baseDomain}/login`
        : '/login';
      res.redirect(rootLoginUrl);
      return;
    }
    res.redirect('/login');
    return;
  }
  next();
}

export function requireTenantOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.redirect('/login');
    return;
  }

  if (!req.isTenantRequest || !req.tenantUser || !req.tenantCard) {
    res.status(404).render('tenant-error', {
      title: 'Tenant Not Found',
      badge: '404 • Not Found',
      heading: 'Subdomain Not Found',
      message: 'This editor can only be accessed from an active tenant subdomain.',
      ctaText: 'Go Home',
      ctaLink: '/',
      accent: '#38bdf8',
    });
    return;
  }

  // Strictly enforce session.user.id === card.user_id and subdomain match
  const isOwnerMatch =
    req.currentUser.id === req.tenantCard.user_id &&
    req.currentUser.username === req.tenant;

  if (!isOwnerMatch) {
    res.status(403).render('tenant-error', {
      title: 'Access Denied',
      badge: '403 • Forbidden',
      heading: 'Unauthorized Editor Access',
      message: 'You can only edit your own digital business card on your own subdomain.',
      ctaText: 'Go to Public Card',
      ctaLink: '/',
      accent: '#f43f5e',
    });
    return;
  }

  next();
}

export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.redirect('/login');
    return;
  }

  if (req.currentUser.role !== 'master') {
    res.status(403).render('tenant-error', {
      title: 'Access Denied',
      badge: '403 • Master Only',
      heading: 'Master Administrator Access Required',
      message: 'This section is restricted to platform administrators.',
      ctaText: 'Return Home',
      ctaLink: '/',
      accent: '#f43f5e',
    });
    return;
  }

  next();
}
