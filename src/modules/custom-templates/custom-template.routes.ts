import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../../middlewares/auth/authenticate-admin.js';
import { createCustomTemplateController } from './custom-template.controller.js';

export function createCustomTemplateRouter(): Router {
  const router = Router();
  const controller = createCustomTemplateController();
  router.use(authenticateAdmin);

  router.get('/', controller.list);
  router.post('/', requireRole('super_admin', 'editor', 'author'), controller.create);
  router.get('/:id', controller.detail);
  router.patch('/:id', requireRole('super_admin', 'editor', 'author'), controller.update);
  router.get('/:id/versions', controller.listVersions);
  router.get('/:id/versions/:versionId', controller.getVersion);
  router.post('/:id/versions', requireRole('super_admin', 'editor', 'author'), controller.createVersion);
  router.post('/:id/duplicate', requireRole('super_admin', 'editor', 'author', 'viewer'), controller.duplicate);
  router.post('/:id/activate', requireRole('super_admin', 'editor', 'author'), controller.activate);
  router.post('/:id/archive', requireRole('super_admin', 'editor', 'author'), controller.archive);
  router.post('/:id/restore', requireRole('super_admin', 'editor', 'author'), controller.restore);
  router.delete('/:id', requireRole('super_admin'), controller.permanentlyDelete);

  return router;
}
