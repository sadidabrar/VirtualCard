import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

export const signupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: config.isProd ? 10 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('tenant-error', {
      title: 'Too Many Requests',
      badge: '429 • Rate Limit',
      heading: 'Slow Down a Moment',
      message: 'Too many signup attempts from this address. Please try again in 15 minutes.',
      ctaText: 'Back to Home',
      ctaLink: '/',
      accent: '#f59e0b',
    });
  },
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: config.isProd ? 15 : 80,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).render('tenant-error', {
      title: 'Too Many Login Attempts',
      badge: '429 • Rate Limit',
      heading: 'Too Many Login Attempts',
      message: 'Please wait 15 minutes before attempting to sign in again.',
      ctaText: 'Back to Login',
      ctaLink: '/login',
      accent: '#f59e0b',
    });
  },
});

export const usernameCheckRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: config.isProd ? 60 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      available: false,
      error: 'Rate limit exceeded. Please wait a moment before checking again.',
    });
  },
});

export const qrRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: config.isProd ? 40 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).send('Too many QR code generation requests. Please try again shortly.');
  },
});
