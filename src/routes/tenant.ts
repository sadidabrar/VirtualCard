import express, { type Router, type RequestHandler } from 'express';
import type { TenantController } from '../controllers/tenantController.js';
import type { VaultController } from '../controllers/vaultController.js';
import type { AppRateLimiters } from '../middleware/rateLimit.js';
import { verifyCsrf } from '../middleware/csrf.js';
import { parseOptionalAvatar } from '../lib/avatar.js';
import { parseVaultDocumentUpload } from '../lib/documentProcessor.js';

export function createTenantRouter(
  controller: TenantController,
  vaultController: VaultController,
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

  // Private Zero-Knowledge Personal Vault (strictly owner-only, never exposed publicly or to master)
  router.get('/vault', requireTenantOwner, vaultController.showVault);
  router.post(
    '/vault/setup',
    requireTenantOwner,
    rateLimiters.vaultUnlock,
    verifyCsrf,
    vaultController.setupVault
  );
  router.post(
    '/vault/unlock',
    requireTenantOwner,
    rateLimiters.vaultUnlock,
    verifyCsrf,
    vaultController.unlockVault
  );
  router.post('/vault/lock', requireTenantOwner, verifyCsrf, vaultController.lockVault);
  router.post(
    '/vault/passcode',
    requireTenantOwner,
    rateLimiters.vaultUnlock,
    verifyCsrf,
    vaultController.changePasscode
  );
  router.post('/vault/profile', requireTenantOwner, verifyCsrf, vaultController.saveProfile);
  router.get('/vault/search', requireTenantOwner, vaultController.searchVault);
  router.post(
    '/vault/documents',
    requireTenantOwner,
    rateLimiters.vaultUpload,
    parseVaultDocumentUpload,
    verifyCsrf,
    vaultController.uploadDocument
  );
  router.get('/vault/documents/:docId/file', requireTenantOwner, vaultController.serveDocumentFile);
  router.post('/vault/documents/:docId', requireTenantOwner, verifyCsrf, vaultController.updateDocument);
  router.post(
    '/vault/documents/:docId/ocr',
    requireTenantOwner,
    rateLimiters.vaultOcr,
    verifyCsrf,
    vaultController.rerunDocumentOcr
  );
  router.post(
    '/vault/documents/:docId/delete',
    requireTenantOwner,
    verifyCsrf,
    vaultController.deleteDocument
  );

  router.post('/logout', verifyCsrf, logoutHandler);

  return router;
}
