import express, { type Router } from 'express';
import type { HealthController } from '../controllers/healthController.js';

export function createHealthRouter(controller: HealthController): Router {
  const router = express.Router();

  router.get('/healthz', controller.liveness);
  router.get('/readyz', controller.readiness);

  return router;
}
