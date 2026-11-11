import type { Request } from 'express';

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
  const rawHost = (
    (req.headers['x-forwarded-host'] as string) ||
    req.headers.host ||
    req.hostname ||
    ''
  ).toLowerCase();
  const hostNoPort = rawHost.split(':')[0];

  if (hostNoPort === baseDomain || hostNoPort.endsWith('.' + baseDomain)) {
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
  const rawHost = (
    (req.headers['x-forwarded-host'] as string) ||
    req.headers.host ||
    req.hostname ||
    ''
  ).toLowerCase();
  const hostNoPort = rawHost.split(':')[0];

  if (hostNoPort === baseDomain || hostNoPort.endsWith('.' + baseDomain)) {
    const proto = req.protocol || (isProd ? 'https' : 'http');
    const portSuffix = rawHost.includes(':') && !isProd ? `:${rawHost.split(':')[1]}` : '';
    return `${proto}://${baseDomain}${portSuffix}${cleanPath}`;
  }

  return cleanPath;
}
