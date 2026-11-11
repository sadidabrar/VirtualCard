import express, { type Router } from 'express';
import type { MediaController } from '../controllers/mediaController.js';

export function createMediaRouter(controller: MediaController): Router {
  const router = express.Router();

  router.get('/avatars/:filename', controller.serveAvatar);

  return router;
}
