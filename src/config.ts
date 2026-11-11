import { Request } from 'express';

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  baseDomain: (process.env.BASE_DOMAIN || 'virtualcard.duckdns.org').toLowerCase().trim(),
  sessionSecret: process.env.SESSION_SECRET || 'virtualcard_liquid_glass_super_secure_secret_2026',
  uploadDir: process.env.UPLOAD_DIR || 'data/uploads',
  maxAvatarBytes: 5 * 1024 * 1024, // 5 MB
};

/**
 * Canonical public URL for a tenant's card (used for QR codes, OG tags, and 301 redirects).
 */
export function getCanonicalTenantUrl(username: string): string {
  return `https://${username.toLowerCase()}.${config.baseDomain}`;
}

/**
 * Builds a clickable navigation URL to a tenant route (/ or /edit) that works both
 * in production/hosts-file mode (real subdomain) and local dev (localhost with ?__tenant=).
 */
export function getClickableTenantHref(username: string, path: string, req: Request): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const rawHost = ((req.headers['x-forwarded-host'] as string) || req.headers.host || req.hostname || '').toLowerCase();
  const hostNoPort = rawHost.split(':')[0];

  if (hostNoPort === config.baseDomain || hostNoPort.endsWith('.' + config.baseDomain)) {
    const proto = req.protocol || (config.isProd ? 'https' : 'http');
    const portSuffix = rawHost.includes(':') && !config.isProd ? `:${rawHost.split(':')[1]}` : '';
    return `${proto}://${username.toLowerCase()}.${config.baseDomain}${portSuffix}${cleanPath}`;
  }

  // Local dev fallback on localhost / 127.0.0.1 without real DNS
  const separator = cleanPath.includes('?') ? '&' : '?';
  return `${cleanPath}${separator}__tenant=${encodeURIComponent(username.toLowerCase())}`;
}

export function getRootHref(path: string, req: Request): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const rawHost = ((req.headers['x-forwarded-host'] as string) || req.headers.host || req.hostname || '').toLowerCase();
  const hostNoPort = rawHost.split(':')[0];

  if (hostNoPort === config.baseDomain || hostNoPort.endsWith('.' + config.baseDomain)) {
    const proto = req.protocol || (config.isProd ? 'https' : 'http');
    const portSuffix = rawHost.includes(':') && !config.isProd ? `:${rawHost.split(':')[1]}` : '';
    return `${proto}://${config.baseDomain}${portSuffix}${cleanPath}`;
  }

  return cleanPath;
}
