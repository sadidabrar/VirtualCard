import express, { type Router, type RequestHandler } from 'express';
import type { TenantController } from '../controllers/tenantController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { parseOptionalAvatar } from '../lib/avatar.js';

export function createTenantRouter(
  controller: TenantController,
  rateLimiters: AppRateLimiters,
  requireTenantOwner: RequestHandler,
  logoutHandler: RequestHandler
): Router {
  const router = express.Router();

  router.get('/', controller.showPublicCard);
  router.get('/vcard', controller.downloadVCard);
  router.get('/qr.png', rateLimiters.qr, controller.downloadQrPng);
  router.get('/qr.svg', rateLimiters.qr, controller.downloadQrSvg);

  router.get('/edit', requireTenantOwner, controller.showEditor);
  router.post('/edit', requireTenantOwner, verifyCsrf, controller.updateCard);
  router.post(
    '/edit/avatar',
    requireTenantOwner,
    parseOptionalAvatar,
    verifyCsrf,
    controller.updateAvatar
  );

  router.post('/logout', verifyCsrf, logoutHandler);

  return router;
}
