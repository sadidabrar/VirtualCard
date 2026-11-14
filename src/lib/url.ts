import type { Request, Response } from 'express';

export function getRequestHost(req: Request): string {
  const raw = (
    (req.headers['x-forwarded-host'] as string) ||
    req.headers.host ||
    req.hostname ||
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase();
  return raw;
}

export function isBaseDomainRequest(req: Request, baseDomain: string): boolean {
  const hostNoPort = getRequestHost(req).split(':')[0];
  return hostNoPort === baseDomain || hostNoPort.endsWith('.' + baseDomain);
}

/**
 * Keeps vc_session consistently scoped to BASE_DOMAIN across root & subdomain
 * requests so host-only and domain-wide session cookies never collide.
 */
export function applySessionCookieDomain(req: Request, res: Response, baseDomain: string): void {
  if (!req.session || !isBaseDomainRequest(req, baseDomain)) {
    return;
  }

  req.session.cookie.domain = baseDomain;

  const cookieHeader = req.headers.cookie || '';
  const vcSessionCount = cookieHeader.match(/(?:^|;\s*)vc_session=/g)?.length ?? 0;

  if (
    vcSessionCount > 1 ||
    (vcSessionCount === 1 && req.session.domainBound !== baseDomain && !req.session.userId)
  ) {
    req.session.domainBound = baseDomain;
    if (!res.locals._clearedHostSessionCookie) {
      res.locals._clearedHostSessionCookie = true;
      res.clearCookie('vc_session', { path: '/' });
    }
  } else if (req.session.domainBound !== baseDomain) {
    req.session.domainBound = baseDomain;
  }
}

export function getCanonicalTenantUrl(username: string, baseDomain: string): string {
  return `https://${username.toLowerCase()}.${baseDomain}`;
}

export function getClickableTenantHref(
  username: string,
  path: string,
  req: Request,
  baseDomain: string,
  isProd: boolean
): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const rawHost = getRequestHost(req);

  if (isBaseDomainRequest(req, baseDomain)) {
    const proto = req.protocol || (isProd ? 'https' : 'http');
    const portSuffix = rawHost.includes(':') && !isProd ? `:${rawHost.split(':')[1]}` : '';
    return `${proto}://${username.toLowerCase()}.${baseDomain}${portSuffix}${cleanPath}`;
  }

  const separator = cleanPath.includes('?') ? '&' : '?';
  return `${cleanPath}${separator}__tenant=${encodeURIComponent(username.toLowerCase())}`;
}

export function getRootHref(
  path: string,
  req: Request,
  baseDomain: string,
  isProd: boolean
): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const rawHost = getRequestHost(req);

  if (isBaseDomainRequest(req, baseDomain)) {
    const proto = req.protocol || (isProd ? 'https' : 'http');
    const portSuffix = rawHost.includes(':') && !isProd ? `:${rawHost.split(':')[1]}` : '';
    return `${proto}://${baseDomain}${portSuffix}${cleanPath}`;
  }

  return cleanPath;
}

export const VAULT_SECRET_COOKIE = 'vc_vault_secret';

export function readCookieValue(cookieHeader: string | undefined, cookieName: string): string | undefined {
  if (!cookieHeader) return undefined;
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function setVaultSecretCookie(
  req: Request,
  res: Response,
  secretB64: string,
  _baseDomain?: string
): void {
  const isHttps = req.secure || req.protocol === 'https';
  res.cookie(VAULT_SECRET_COOKIE, secretB64, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 30 * 60 * 1000,
    // Host-only cookie: intentionally omit 'domain' so the secret is strictly
    // confined to this specific tenant subdomain and never leaks across other tenants.
  });
}

export function clearVaultSecretCookie(req: Request, res: Response, baseDomain: string): void {
  res.clearCookie(VAULT_SECRET_COOKIE, { path: '/' });
  if (isBaseDomainRequest(req, baseDomain)) {
    res.clearCookie(VAULT_SECRET_COOKIE, { domain: baseDomain, path: '/' });
  }
}

