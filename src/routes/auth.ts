import express, { type Router } from 'express';
import type { AuthController } from '../controllers/authController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { parseOptionalAvatar } from '../lib/avatar.js';

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
