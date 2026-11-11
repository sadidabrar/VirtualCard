import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users, cards, User, Card } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getRootHref } from '../config.js';

declare global {
  namespace Express {
    interface Request {
      tenant: string | null;
      tenantUser?: User;
      tenantCard?: Card;
      isTenantRequest?: boolean;
    }
  }
}

export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const baseDomain = (process.env.BASE_DOMAIN || 'virtualcard.duckdns.org').toLowerCase().trim();
  const isDev = process.env.NODE_ENV !== 'production';

  // Determine host without port
  const rawHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || req.hostname || '';
  const host = rawHost.split(':')[0].toLowerCase().trim();

  let tenantSubdomain: string | null = null;

  // 1. Dev override: ?__tenant=<username> or X-Debug-Tenant header
  if (isDev) {
    const queryTenant = req.query.__tenant as string | undefined;
    const headerTenant = req.headers['x-debug-tenant'] as string | undefined;
    if (queryTenant && typeof queryTenant === 'string') {
      tenantSubdomain = queryTenant.toLowerCase().trim();
    } else if (headerTenant && typeof headerTenant === 'string') {
      tenantSubdomain = headerTenant.toLowerCase().trim();
    }
  }

  // 2. Host-based subdomain extraction
  if (!tenantSubdomain) {
    if (host.endsWith('.' + baseDomain)) {
      tenantSubdomain = host.slice(0, -(baseDomain.length + 1));
    } else if (host.endsWith('.localhost')) {
      tenantSubdomain = host.slice(0, -('.localhost'.length));
    }
  }

  // Ignore 'www' or empty as root app
  if (tenantSubdomain === 'www' || tenantSubdomain === '' || tenantSubdomain === baseDomain) {
    tenantSubdomain = null;
  }

  req.tenant = tenantSubdomain;
  req.isTenantRequest = Boolean(tenantSubdomain);

  // If this is the root domain, continue to root routes
  if (!tenantSubdomain) {
    return next();
  }

  // If subdomain is present, look up the tenant user
  try {
    const tenantUser = db.select().from(users).where(eq(users.username, tenantSubdomain)).get();

    if (!tenantUser) {
      res.status(404).render('tenant-error', {
        title: 'Card Not Found',
        badge: '404 • Not Found',
        heading: 'Card Does Not Exist',
        message: `The virtual card for subdomain "${tenantSubdomain}" was not found. It may not be registered yet, or was removed.`,
        ctaText: 'Claim this username',
        ctaLink: getRootHref(`/signup?u=${encodeURIComponent(tenantSubdomain)}`, req),
        accent: '#38bdf8'
      });
      return;
    }

    // Check if user is suspended
    if (tenantUser.status === 'suspended') {
      res.status(403).render('tenant-error', {
        title: 'Card Unavailable',
        badge: 'Account Suspended',
        heading: 'Card Temporarily Unavailable',
        message: `This digital business card has been suspended by the administrator.`,
        ctaText: 'Contact Support',
        ctaLink: getRootHref('/', req),
        accent: '#f43f5e'
      });
      return;
    }

    const tenantCard = db.select().from(cards).where(eq(cards.user_id, tenantUser.id)).get();

    req.tenantUser = tenantUser;
    req.tenantCard = tenantCard;

    next();
  } catch (err) {
    console.error('Tenant resolution error:', err);
    res.status(500).send('Tenant resolution error');
  }
}
