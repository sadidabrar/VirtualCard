import express, { type Router } from 'express';
import type { RootController } from '../controllers/rootController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';

export function createRootRouter(
  controller: RootController,
  rateLimiters: AppRateLimiters
): Router {
  const router = express.Router();

  router.get('/', controller.landing);
  router.get('/demo', controller.demo);
  router.get(
    '/api/username-available',
    rateLimiters.usernameCheck,
    controller.checkUsernameAvailable
  );
  router.get('/u/:username', controller.redirectSubdomain);
  router.get('/security.txt', (_req, res) => res.redirect(301, '/.well-known/security.txt'));

  return router;
}
