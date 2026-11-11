import express, { type Router, type RequestHandler } from 'express';
import type { MasterController } from '../controllers/masterController.js';
import { verifyCsrf } from '../middleware/csrf.js';

export function createMasterRouter(
  controller: MasterController,
  requireMaster: RequestHandler
): Router {
  const router = express.Router();

  router.use(requireMaster);

  router.get('/', controller.showDashboard);
  router.get('/export.csv', controller.exportCsv);
  router.get('/export.json', controller.exportJson);

  router.get('/users/:id', controller.showUserDetail);
  router.post('/users/:id', verifyCsrf, controller.updateUserAndCard);
  router.post('/users/:id/status', verifyCsrf, controller.updateUserStatus);
  router.post('/users/:id/reset-password', verifyCsrf, controller.resetUserPassword);

  // Supports both native HTTP DELETE (API / JS modal) and POST fallback for no-JS forms
  router.post('/users/:id/delete', verifyCsrf, controller.deleteUser);
  router.delete('/users/:id', verifyCsrf, controller.deleteUser);

  return router;
}
