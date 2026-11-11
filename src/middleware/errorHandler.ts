import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { AppError, NotFoundError } from '../types/errors.js';
import type { ApiErrorResponse } from '../types/domain.js';

function wantsJson(req: Request): boolean {
  if (req.path.startsWith('/api/') || req.path === '/healthz' || req.path === '/readyz') {
    return true;
  }
  const accept = req.headers.accept || '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

export function createErrorHandler(isProd: boolean): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let field: string | undefined;
    let ctaText = 'Go Home';
    let ctaLink = '/';

    if (err instanceof ZodError) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      const firstIssue = err.issues[0];
      message = firstIssue?.message || 'Invalid input parameters.';
      field = firstIssue?.path.join('.') || undefined;
    } else if (err instanceof multer.MulterError) {
      statusCode = 400;
      code = 'UPLOAD_ERROR';
      field = 'avatar';
      message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Avatar image exceeds the maximum allowed size of 5 MB.'
          : err.message;
    } else if (err instanceof AppError) {
      statusCode = err.statusCode;
      code = err.code;
      message = err.message;
      field = err.field;
      if (err instanceof NotFoundError) {
        ctaText = err.ctaText || ctaText;
        ctaLink = err.ctaLink || ctaLink;
      }
    } else if (err instanceof Error) {
      message = isProd ? 'Internal server error.' : err.message;
    }

    if (statusCode >= 500) {
      req.log?.error({ err, reqId: req.id }, 'Unhandled server error');
    } else {
      req.log?.warn({ code, statusCode, field, message, reqId: req.id }, 'Operational error');
    }

    if (res.headersSent) {
      return;
    }

    if (wantsJson(req)) {
      const payload: ApiErrorResponse = {
        error: {
          code,
          message,
          ...(field ? { field } : {}),
        },
      };
      res.status(statusCode).json(payload);
      return;
    }

    const accent =
      statusCode >= 500 || statusCode === 403
        ? '#f43f5e'
        : statusCode === 429
          ? '#f59e0b'
          : '#38bdf8';
    const badge = `${statusCode} • ${code.replace(/_/g, ' ')}`;

    res.status(statusCode).render('tenant-error', {
      title: statusCode === 404 ? 'Not Found' : 'Request Error',
      badge,
      heading:
        statusCode === 404
          ? 'Not Found'
          : statusCode === 429
            ? 'Rate Limit Exceeded'
            : 'Unable to Complete Request',
      message,
      ctaText,
      ctaLink,
      accent,
    });
  };
}
