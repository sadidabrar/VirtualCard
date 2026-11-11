import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RateLimitError } from '../types/errors.js';

export interface AppRateLimiters {
  signup: RateLimitRequestHandler;
  login: RateLimitRequestHandler;
  usernameCheck: RateLimitRequestHandler;
  qr: RateLimitRequestHandler;
}

/**
 * Per-route class rate limiters backed by express-rate-limit (in-memory store;
 * for multi-instance horizontal scaling, swap in a shared SQLite or Redis store).
 */
export function createRateLimiters(): AppRateLimiters {
  return {
    signup: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      limit: 5, // strict: 5 attempts per minute per IP
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(
          new RateLimitError(
            'Too many signup attempts from this address. Please wait a minute and try again.',
            'SIGNUP_RATE_LIMIT'
          )
        );
      },
    }),

    login: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      limit: 5, // strict: 5 attempts per minute per IP
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(
          new RateLimitError(
            'Too many login attempts. Please wait a minute before trying again.',
            'LOGIN_RATE_LIMIT'
          )
        );
      },
    }),

    usernameCheck: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      limit: 30, // moderate: 30/min per IP
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(
          new RateLimitError(
            'Rate limit exceeded for username availability checks.',
            'USERNAME_CHECK_RATE_LIMIT'
          )
        );
      },
    }),

    qr: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      limit: 30, // moderate: 30/min per IP
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(
          new RateLimitError(
            'Too many QR generation requests. Please wait a moment.',
            'QR_RATE_LIMIT'
          )
        );
      },
    }),
  };
}
