import express, { type Router } from 'express';
import type { TenantController } from '../controllers/tenantController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';

export function createTenantRouter(
  controller: TenantController,
  rateLimiters: AppRateLimiters
): Router {
  const router = express.Router();

  router.get('/', controller.showPublicCard);
  router.get('/vcard', controller.downloadVCard);
  router.get('/qr.png', rateLimiters.qr, controller.downloadQrPng);
  router.get('/qr.svg', rateLimiters.qr, controller.downloadQrSvg);

  return router;
}
