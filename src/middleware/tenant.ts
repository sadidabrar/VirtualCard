import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { extractTenantFromHost, type TenantService } from '../services/tenantService.js';
import { getRootHref } from '../lib/url.js';
import { NotFoundError } from '../types/errors.js';

export function createTenantMiddleware(
  tenantService: TenantService,
  baseDomain: string,
  isDev: boolean,
  isProd: boolean
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawHost =
      (req.headers['x-forwarded-host'] as string) || req.headers.host || req.hostname || '';

    const tenantSubdomain = extractTenantFromHost({
      rawHost,
      baseDomain,
      isDev,
      queryTenant: req.query.__tenant,
      headerTenant: req.headers['x-debug-tenant'],
    });

    req.tenant = tenantSubdomain;
    req.isTenantRequest = Boolean(tenantSubdomain);

    if (!tenantSubdomain) {
      return next();
    }

    try {
      const { user, card } = tenantService.resolveTenant(tenantSubdomain);
      req.tenantUser = user;
      req.tenantCard = card;
      next();
    } catch (err) {
      if (err instanceof NotFoundError && err.code === 'TENANT_NOT_FOUND') {
        const claimHref = getRootHref(
          `/signup?u=${encodeURIComponent(tenantSubdomain)}`,
          req,
          baseDomain,
          isProd
        );
        return next(new NotFoundError(err.message, err.code, 'Claim this username', claimHref));
      }
      next(err);
    }
  };
}
