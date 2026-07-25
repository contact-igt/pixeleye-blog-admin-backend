import { Router } from 'express';
import { createTemplateController } from './template.controller.js';

export function createPublicTemplateRouter(): Router {
  const router = Router();
  const controller = createTemplateController();

  router.get('/', controller.list);
  router.get('/:templateKey', controller.detail);

  return router;
}
