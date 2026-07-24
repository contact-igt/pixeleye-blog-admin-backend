import { Router } from 'express';
import { authenticateAdmin } from '../../middlewares/auth/authenticate-admin.js';
import { createTemplateController } from './template.controller.js';

export function createTemplateRouter(): Router {
  const router = Router();
  const controller = createTemplateController();
  router.use(authenticateAdmin);
  router.get('/', controller.list);
  router.get('/:templateKey', controller.detail);
  return router;
}

