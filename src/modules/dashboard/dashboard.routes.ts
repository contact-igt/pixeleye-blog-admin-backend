import { Router } from 'express';
import { authenticateAdmin } from '../../middlewares/auth/authenticate-admin.js';
import { createDashboardController } from './dashboard.controller.js';

export function createDashboardRouter(): Router {
  const router = Router();
  const controller = createDashboardController();

  router.get('/stats', authenticateAdmin, controller.getStats);

  return router;
}
