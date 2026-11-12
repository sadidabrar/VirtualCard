import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../services/authService.js';
import type { QrService } from '../services/qrService.js';
import type { CardRepository } from '../repositories/cardRepository.js';
import { loginBodySchema, signupBodySchema } from '../validators/auth.js';
import { ACCENT_PRESETS, sanitizeText } from '../lib/sanitize.js';
import {
  applySessionCookieDomain,
  getCanonicalTenantUrl,
  getClickableTenantHref,
  isBaseDomainRequest,
} from '../lib/url.js';
import { wantsJson } from '../lib/http.js';
import { AppError } from '../types/errors.js';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly qrService: QrService,
    private readonly cardRepo: CardRepository,
    private readonly baseDomain: string,
    private readonly isProd: boolean
  ) {}

  showSignup = (req: Request, res: Response): void => {
    const prefillUsername =
      typeof req.query.u === 'string'
        ? req.query.u
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '')
            .slice(0, 30)
        : '';

    res.render('signup', {
      errors: [],
      accentPresets: ACCENT_PRESETS,
      formData: { username: prefillUsername },
    });
  };

  submitSignup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const formData = {
      username: sanitizeText(req.body?.username, 30).toLowerCase(),
      email: sanitizeText(req.body?.email, 254).toLowerCase(),
      full_name: sanitizeText(req.body?.full_name, 100),
      job_title: sanitizeText(req.body?.job_title, 100),
      company: sanitizeText(req.body?.company, 100),
      tagline: sanitizeText(req.body?.tagline, 200),
      phone: sanitizeText(req.body?.phone, 32),
      whatsapp: sanitizeText(req.body?.whatsapp, 32),
      public_email: sanitizeText(req.body?.public_email, 254),
      website: sanitizeText(req.body?.website, 300),
      theme: sanitizeText(req.body?.theme, 7) || '#38bdf8',
      social_linkedin: sanitizeText(req.body?.social_linkedin, 300),
      social_github: sanitizeText(req.body?.social_github, 300),
      social_x: sanitizeText(req.body?.social_x, 300),
      social_instagram: sanitizeText(req.body?.social_instagram, 300),
      social_facebook: sanitizeText(req.body?.social_facebook, 300),
      social_telegram: sanitizeText(req.body?.social_telegram, 300),
      social_youtube: sanitizeText(req.body?.social_youtube, 300),
    };

    if (req.multerError) {
      if (wantsJson(req)) {
        res
          .status(400)
          .json({ error: { code: 'UPLOAD_ERROR', message: req.multerError, field: 'avatar' } });
        return;
      }
      res.status(400).render('signup', {
        errors: [req.multerError],
        accentPresets: ACCENT_PRESETS,
        formData,
      });
      return;
    }

    const parsed = signupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      if (wantsJson(req)) {
        return next(parsed.error);
      }
      const errors = parsed.error.issues.map((i) => i.message);
      res.status(400).render('signup', {
        errors,
        accentPresets: ACCENT_PRESETS,
        formData,
      });
      return;
    }

    try {
      const { userId, username } = await this.authService.signup(parsed.data, req.file);
      const currentCsrf = req.session.csrfToken;

      req.session.regenerate((regenErr) => {
        if (regenErr) {
          return next(regenErr);
        }
        req.session.csrfToken = currentCsrf;
        req.session.userId = userId;
        req.session.username = username;
        req.session.role = 'owner';
        req.session.recentSignupUsername = username;
        applySessionCookieDomain(req, res, this.baseDomain);

        req.session.save(() => {
          if (wantsJson(req)) {
            res.status(201).json({
              ok: true,
              data: {
                username,
                url: getCanonicalTenantUrl(username, this.baseDomain),
              },
            });
            return;
          }
          res.redirect('/signup/success');
        });
      });
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }
      res.status(err.statusCode).render('signup', {
        errors: [err.message],
        accentPresets: ACCENT_PRESETS,
        formData,
      });
    }
  };

  showSignupSuccess = async (req: Request, res: Response): Promise<void> => {
    const username = req.session.recentSignupUsername || req.currentUser?.username;
    if (!username) {
      res.redirect('/signup');
      return;
    }

    const userId = req.session.userId || req.currentUser?.id;
    const card = userId ? this.cardRepo.findByUserId(userId) : undefined;
    const qrDataUrl = await this.qrService.getQrDataUrl(username, 220);

    res.render('signup-success', {
      username,
      theme: card?.theme || '#38bdf8',
      canonicalUrl: getCanonicalTenantUrl(username, this.baseDomain),
      clickableCardHref: getClickableTenantHref(username, '/', req, this.baseDomain, this.isProd),
      clickableEditorHref: getClickableTenantHref(
        username,
        '/edit',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrPngHref: getClickableTenantHref(
        username,
        '/qr.png?size=2048',
        req,
        this.baseDomain,
        this.isProd
      ),
      qrSvgHref: getClickableTenantHref(username, '/qr.svg', req, this.baseDomain, this.isProd),
      qrDataUrl,
    });
  };

  showLogin = (req: Request, res: Response): void => {
    if (req.currentUser) {
      if (req.currentUser.role === 'master') {
        res.redirect('/master');
        return;
      }
      res.redirect(
        getClickableTenantHref(req.currentUser.username, '/edit', req, this.baseDomain, this.isProd)
      );
      return;
    }

    res.render('login', {
      error: null,
      formData: { identifier: '' },
    });
  };

  submitLogin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifierRaw = sanitizeText(req.body?.identifier, 254).toLowerCase();
    const parsed = loginBodySchema.safeParse(req.body);

    if (!parsed.success) {
      if (wantsJson(req)) {
        return next(parsed.error);
      }
      res.status(400).render('login', {
        error: parsed.error.issues[0]?.message || 'Please enter valid credentials.',
        formData: { identifier: identifierRaw },
      });
      return;
    }

    try {
      const user = await this.authService.login(parsed.data.identifier, parsed.data.password);
      const currentCsrf = req.session.csrfToken;

      req.session.regenerate((err) => {
        if (err) return next(err);

        req.session.csrfToken = currentCsrf;
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.role = user.role;
        applySessionCookieDomain(req, res, this.baseDomain);

        req.session.save(() => {
          if (wantsJson(req)) {
            res.json({ ok: true, data: { user } });
            return;
          }
          if (user.role === 'master') {
            res.redirect('/master');
            return;
          }
          res.redirect(
            getClickableTenantHref(user.username, '/edit', req, this.baseDomain, this.isProd)
          );
        });
      });
    } catch (err) {
      if (wantsJson(req) || !(err instanceof AppError)) {
        return next(err);
      }
      res.status(err.statusCode).render('login', {
        error: err.message,
        formData: { identifier: identifierRaw },
      });
    }
  };

  logout = (req: Request, res: Response): void => {
    req.session.destroy(() => {
      res.clearCookie('vc_session', { path: '/' });
      if (isBaseDomainRequest(req, this.baseDomain)) {
        res.clearCookie('vc_session', { domain: this.baseDomain, path: '/' });
      }
      if (wantsJson(req)) {
        res.json({ ok: true, data: { loggedOut: true } });
        return;
      }
      res.redirect('/');
    });
  };
}
