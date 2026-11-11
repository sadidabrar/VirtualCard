import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserRepository } from '../repositories/userRepository.js';
import { AuthError, NotFoundError, TenantMismatchError } from '../types/errors.js';
import { getRootHref } from '../lib/url.js';
import { wantsJson } from '../lib/http.js';

export interface AuthMiddlewares {
  attachCurrentUser: RequestHandler;
  requireAuth: RequestHandler;
  requireTenantOwner: RequestHandler;
  requireMaster: RequestHandler;
}

export function createAuthMiddleware(
  userRepo: UserRepository,
  baseDomain: string,
  isProd: boolean
): AuthMiddlewares {
  const attachCurrentUser: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    res.locals.currentUser = null;
    res.locals.baseDomain = baseDomain;

    const userId = req.session?.userId;
    if (!userId) {
      return next();
    }

    try {
      const user = userRepo.findById(userId);
      if (!user || user.status === 'suspended') {
        req.session.destroy(() => {});
        return next();
      }

      const { password_hash: _ignored, ...safeUser } = user;
      req.currentUser = safeUser;
      res.locals.currentUser = safeUser;
      next();
    } catch (err) {
      next(err);
    }
  };

  const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      if (req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return next(new AuthError('Authentication required.', 401, 'UNAUTHENTICATED'));
      }
      res.redirect(getRootHref('/login', req, baseDomain, isProd));
      return;
    }
    next();
  };

  const requireTenantOwner: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      if (req.headers.accept?.includes('application/json')) {
        return next(new AuthError('Authentication required.', 401, 'UNAUTHENTICATED'));
      }
      res.redirect(getRootHref('/login', req, baseDomain, isProd));
      return;
    }

    if (!req.isTenantRequest || !req.tenantUser || !req.tenantCard) {
      return next(
        new NotFoundError('This editor can only be accessed on an active tenant subdomain.')
      );
    }

    const isOwnerMatch =
      req.currentUser.id === req.tenantCard.user_id && req.currentUser.username === req.tenant;

    if (!isOwnerMatch) {
      return next(
        new TenantMismatchError(
          'You can only edit your own digital business card on your own subdomain.'
        )
      );
    }

    next();
  };

  const requireMaster: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      if (wantsJson(req)) {
        return next(new AuthError('Authentication required.', 401, 'UNAUTHENTICATED'));
      }
      res.redirect(getRootHref('/login', req, baseDomain, isProd));
      return;
    }

    if (req.currentUser.role !== 'master') {
      return next(new AuthError('Master administrator access required.', 403, 'MASTER_ONLY'));
    }

    next();
  };

  return {
    attachCurrentUser,
    requireAuth,
    requireTenantOwner,
    requireMaster,
  };
}
