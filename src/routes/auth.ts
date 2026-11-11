import express, { type Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthController } from '../controllers/authController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { avatarUpload } from '../lib/avatar.js';

function parseOptionalAvatar(req: Request, res: Response, next: NextFunction): void {
  avatarUpload.single('avatar')(req, res, (err: unknown) => {
    if (err) {
      req.multerError = err instanceof Error ? err.message : 'Invalid avatar upload.';
    }
    next();
  });
}

export function createAuthRouter(
  controller: AuthController,
  rateLimiters: AppRateLimiters
): Router {
  const router = express.Router();

  router.get('/signup', controller.showSignup);
  router.post(
    '/signup',
    rateLimiters.signup,
    parseOptionalAvatar,
    verifyCsrf,
    controller.submitSignup
  );
  router.get('/signup/success', controller.showSignupSuccess);

  router.get('/login', controller.showLogin);
  router.post('/login', rateLimiters.login, verifyCsrf, controller.submitLogin);
  router.post('/logout', verifyCsrf, controller.logout);

  return router;
}
