import { Router } from 'express';
import type { DatabaseCheck } from './health.service.js';
import { createHealthService } from './health.service.js';
import { createHealthController } from './health.controller.js';

export function createHealthRouter(databaseCheck: DatabaseCheck): Router {
  const router = Router();
  const controller = createHealthController(createHealthService(databaseCheck));

  router.get('/', controller.ready);
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}

