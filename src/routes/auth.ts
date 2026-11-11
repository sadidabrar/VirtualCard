import express, { Request, Response, NextFunction } from 'express';
import * as argon2 from '@node-rs/argon2';
import { db, sqliteDb } from '../db/index.js';
import { users, cards, validateUsername } from '../db/schema.js';
import { eq, or } from 'drizzle-orm';
import { verifyCsrf } from '../middleware/csrf.js';
import { signupRateLimiter, loginRateLimiter } from '../middleware/rateLimit.js';
import { avatarUpload, processAndSaveAvatar, deleteAvatarFile } from '../utils/avatar.js';
import {
  ACCENT_PRESETS,
  buildSocialsJson,
  isValidEmail,
  sanitizeHexColor,
  sanitizeHttpUrl,
  sanitizePhone,
  sanitizeText,
} from '../utils/sanitize.js';
import { config, getCanonicalTenantUrl, getClickableTenantHref } from '../config.js';
import { generateQrDataUrl } from '../utils/qr.js';

const router = express.Router();

function applyCrossSubdomainCookie(req: Request): void {
  const rawHost = ((req.headers['x-forwarded-host'] as string) || req.headers.host || req.hostname || '').toLowerCase();
  const hostNoPort = rawHost.split(':')[0];
  if (hostNoPort === config.baseDomain || hostNoPort.endsWith('.' + config.baseDomain)) {
    req.session.cookie.domain = config.baseDomain;
  }
}

// GET /signup
router.get('/signup', (req: Request, res: Response) => {
  const prefillUsername = typeof req.query.u === 'string'
    ? req.query.u.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    : '';

  res.render('signup', {
    errors: [],
    accentPresets: ACCENT_PRESETS,
    formData: {
      username: prefillUsername,
    },
  });
});

// POST /signup
router.post(
  '/signup',
  signupRateLimiter,
  (req: Request, res: Response, next: NextFunction) => {
    avatarUpload.single('avatar')(req, res, (err: unknown) => {
      if (err) {
        (req as Request & { multerError?: string }).multerError =
          err instanceof Error ? err.message : 'Invalid avatar file.';
      }
      next();
    });
  },
  verifyCsrf,
  async (req: Request, res: Response) => {
    const errors: string[] = [];
    const multerErr = (req as Request & { multerError?: string }).multerError;
    if (multerErr) {
      errors.push(multerErr);
    }

    const username = sanitizeText(req.body.username, 30).toLowerCase();
    const email = sanitizeText(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmPassword = typeof req.body.confirm_password === 'string' ? req.body.confirm_password : '';

    const fullName = sanitizeText(req.body.full_name, 100);
    const jobTitle = sanitizeText(req.body.job_title, 100);
    const company = sanitizeText(req.body.company, 100);
    const tagline = sanitizeText(req.body.tagline, 200);
    const phone = sanitizePhone(req.body.phone);
    const whatsapp = sanitizePhone(req.body.whatsapp);
    const publicEmail = sanitizeText(req.body.public_email, 254);
    const rawWebsite = sanitizeText(req.body.website, 300);
    const website = sanitizeHttpUrl(rawWebsite);
    const theme = sanitizeHexColor(req.body.theme, '#38bdf8');

    const formData = {
      username,
      email,
      full_name: fullName,
      job_title: jobTitle,
      company,
      tagline,
      phone,
      whatsapp,
      public_email: publicEmail,
      website: rawWebsite,
      theme,
      social_linkedin: sanitizeText(req.body.social_linkedin, 300),
      social_github: sanitizeText(req.body.social_github, 300),
      social_x: sanitizeText(req.body.social_x, 300),
      social_instagram: sanitizeText(req.body.social_instagram, 300),
      social_telegram: sanitizeText(req.body.social_telegram, 300),
      social_youtube: sanitizeText(req.body.social_youtube, 300),
    };

    // Account Validation
    const usernameCheck = validateUsername(username);
    if (!usernameCheck.valid && usernameCheck.error) {
      errors.push(usernameCheck.error);
    }
    if (!isValidEmail(email)) {
      errors.push('Please enter a valid email address.');
    }
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }
    if (password !== confirmPassword) {
      errors.push('Password and confirmation do not match.');
    }
    if (!fullName || fullName.length < 2) {
      errors.push('Full Name is required (at least 2 characters).');
    }
    if (rawWebsite && !website) {
      errors.push('Website URL must start with https:// or http://');
    }
    if (publicEmail && !isValidEmail(publicEmail)) {
      errors.push('Public email address is invalid.');
    }

    // Check uniqueness upfront for friendly error message
    if (errors.length === 0) {
      const existingUser = db
        .select({ username: users.username, email: users.email })
        .from(users)
        .where(or(eq(users.username, username), eq(users.email, email)))
        .get();

      if (existingUser) {
        if (existingUser.username === username) {
          errors.push(`Username "${username}" is already taken.`);
        }
        if (existingUser.email === email) {
          errors.push('An account with this email address already exists.');
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).render('signup', {
        errors,
        accentPresets: ACCENT_PRESETS,
        formData,
      });
      return;
    }

    // Process optional avatar upload
    let avatarUrl = '';
    if (req.file) {
      try {
        avatarUrl = await processAndSaveAvatar(req.file);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Failed to process avatar image.');
        res.status(400).render('signup', {
          errors,
          accentPresets: ACCENT_PRESETS,
          formData,
        });
        return;
      }
    }

    const socialsJson = buildSocialsJson({
      linkedin: formData.social_linkedin,
      github: formData.social_github,
      x: formData.social_x,
      instagram: formData.social_instagram,
      telegram: formData.social_telegram,
      youtube: formData.social_youtube,
    });

    try {
      const passwordHash = await argon2.hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      });

      const now = new Date().toISOString();

      // Atomic insert inside SQLite transaction
      const createAccountTx = sqliteDb.transaction(() => {
        const createdUser = db
          .insert(users)
          .values({
            username,
            email,
            password_hash: passwordHash,
            role: 'owner',
            status: 'active',
            created_at: now,
            updated_at: now,
          })
          .returning({ id: users.id })
          .get();

        db.insert(cards)
          .values({
            user_id: createdUser.id,
            full_name: fullName,
            job_title: jobTitle,
            company,
            tagline,
            phone,
            whatsapp,
            public_email: publicEmail,
            website,
            socials: socialsJson,
            avatar_url: avatarUrl,
            theme,
            is_published: true,
            created_at: now,
            updated_at: now,
          })
          .run();

        return createdUser.id;
      });

      const newUserId = createAccountTx();

      // Regenerate session to avoid fixation while preserving CSRF token
      const currentCsrf = req.session.csrfToken;
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('Session regenerate error:', regenErr);
          res.redirect('/login');
          return;
        }
        req.session.csrfToken = currentCsrf;
        req.session.userId = newUserId;
        req.session.username = username;
        req.session.role = 'owner';
        req.session.recentSignupUsername = username;
        applyCrossSubdomainCookie(req);

        req.session.save(() => {
          res.redirect('/signup/success');
        });
      });
    } catch (err: unknown) {
      // Remove orphaned avatar if DB transaction failed (e.g. race condition on UNIQUE constraint)
      if (avatarUrl) {
        await deleteAvatarFile(avatarUrl);
      }

      const message = err instanceof Error ? err.message : '';
      if (message.includes('UNIQUE constraint failed: users.username')) {
        errors.push(`Username "${username}" was just claimed by someone else. Please pick another.`);
      } else if (message.includes('UNIQUE constraint failed: users.email')) {
        errors.push('An account with this email address already exists.');
      } else {
        console.error('Signup transaction error:', err);
        errors.push('An unexpected error occurred while creating your card. Please try again.');
      }

      res.status(409).render('signup', {
        errors,
        accentPresets: ACCENT_PRESETS,
        formData,
      });
    }
  }
);

// GET /signup/success
router.get('/signup/success', async (req: Request, res: Response) => {
  const username = req.session.recentSignupUsername || req.currentUser?.username;
  if (!username) {
    res.redirect('/signup');
    return;
  }

  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) {
    res.redirect('/signup');
    return;
  }

  const card = db.select().from(cards).where(eq(cards.user_id, user.id)).get();
  const qrDataUrl = await generateQrDataUrl(username, 220);

  res.render('signup-success', {
    username,
    theme: card?.theme || '#38bdf8',
    canonicalUrl: getCanonicalTenantUrl(username),
    clickableCardHref: getClickableTenantHref(username, '/', req),
    clickableEditorHref: getClickableTenantHref(username, '/edit', req),
    qrPngHref: getClickableTenantHref(username, '/qr.png?size=2048', req),
    qrSvgHref: getClickableTenantHref(username, '/qr.svg', req),
    qrDataUrl,
  });
});

// GET /login
router.get('/login', (req: Request, res: Response) => {
  if (req.currentUser) {
    if (req.currentUser.role === 'master') {
      res.redirect('/master');
      return;
    }
    res.redirect(getClickableTenantHref(req.currentUser.username, '/edit', req));
    return;
  }

  res.render('login', {
    error: null,
    formData: { identifier: '' },
  });
});

// POST /login
router.post('/login', loginRateLimiter, verifyCsrf, async (req: Request, res: Response) => {
  const identifier = sanitizeText(req.body.identifier, 254).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!identifier || !password) {
    res.status(400).render('login', {
      error: 'Please enter both your username/email and password.',
      formData: { identifier },
    });
    return;
  }

  const user = db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .get();

  if (!user) {
    res.status(401).render('login', {
      error: 'Invalid credentials. Please check your username/email and password.',
      formData: { identifier },
    });
    return;
  }

  const validPassword = await argon2.verify(user.password_hash, password).catch(() => false);
  if (!validPassword) {
    res.status(401).render('login', {
      error: 'Invalid credentials. Please check your username/email and password.',
      formData: { identifier },
    });
    return;
  }

  if (user.status === 'suspended') {
    res.status(403).render('login', {
      error: 'This account has been suspended. Please contact support.',
      formData: { identifier },
    });
    return;
  }

  const currentCsrf = req.session.csrfToken;
  req.session.regenerate((err) => {
    if (err) {
      console.error('Login session regenerate error:', err);
      res.status(500).render('login', {
        error: 'Session initialization failed. Please try again.',
        formData: { identifier },
      });
      return;
    }

    req.session.csrfToken = currentCsrf;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    applyCrossSubdomainCookie(req);

    req.session.save(() => {
      if (user.role === 'master') {
        res.redirect('/master');
        return;
      }
      res.redirect(getClickableTenantHref(user.username, '/edit', req));
    });
  });
});

// POST /logout
router.post('/logout', verifyCsrf, (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie('vc_session');
    res.redirect('/');
  });
});

export default router;
