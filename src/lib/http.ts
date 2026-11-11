import type { Request } from 'express';

/**
 * Determines whether the caller explicitly prefers a JSON API response over HTML.
 */
export function wantsJson(req: Request): boolean {
  const accept = req.headers.accept || '';
  return accept.includes('application/json') && !accept.includes('text/html');
}
