import express, { Request, Response } from 'express';
import QRCode from 'qrcode';
import { db } from '../db/index.js';
import { users, validateUsername } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { usernameCheckRateLimiter } from '../middleware/rateLimit.js';
import { getCanonicalTenantUrl } from '../config.js';

const router = express.Router();

// Landing page
router.get('/', (_req: Request, res: Response) => {
  res.render('landing');
});

// Phase 2 Design System Demo
router.get('/demo', async (_req: Request, res: Response) => {
  try {
    const sampleTenantUrl = getCanonicalTenantUrl('mahbubkhan');
    const qrDataUrl = await QRCode.toDataURL(sampleTenantUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 160,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    const demoData = {
      name: 'Mahbub Khan',
      role: 'Founder & Principal Architect',
      company: 'Apex Cloud Systems',
      tagline: 'Scaling distributed cloud systems with elegant interfaces',
    };

    res.render('demo', {
      demoData,
      qrDataUrl,
    });
  } catch (err) {
    console.error('Error rendering demo:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Debounced AJAX username availability check
router.get('/api/username-available', usernameCheckRateLimiter, (req: Request, res: Response) => {
  const raw = typeof req.query.u === 'string' ? req.query.u : '';
  const normalized = raw.trim().toLowerCase();

  const validation = validateUsername(normalized);
  if (!validation.valid) {
    res.json({
      available: false,
      username: normalized,
      reason: validation.error,
    });
    return;
  }

  const existing = db.select({ id: users.id }).from(users).where(eq(users.username, normalized)).get();
  if (existing) {
    res.json({
      available: false,
      username: normalized,
      reason: 'This username is already taken.',
    });
    return;
  }

  res.json({
    available: true,
    username: normalized,
  });
});

// 301 redirect from /u/:username to https://<username>.virtualcard.duckdns.org
router.get('/u/:username', (req: Request, res: Response) => {
  const rawUsername = Array.isArray(req.params.username) ? req.params.username[0] : req.params.username;
  const username = (rawUsername || '').trim().toLowerCase();
  const validation = validateUsername(username);
  if (!validation.valid) {
    res.status(404).render('tenant-error', {
      title: 'Invalid Username',
      badge: '404 • Not Found',
      heading: 'Card Not Found',
      message: 'The requested username format is invalid.',
      ctaText: 'Go Home',
      ctaLink: '/',
      accent: '#38bdf8',
    });
    return;
  }

  res.redirect(301, getCanonicalTenantUrl(username));
});

export default router;
