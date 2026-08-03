import './index.js';
import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../../middlewares/auth/authenticate-admin.js';
import { createBlogController } from './blog.controller.js';
import { createPublicBlogController } from './public-blog.controller.js';
import { createAdminFeedbackController } from './admin-feedback.controller.js';

export function createBlogRouter(): Router {
  const router = Router();
  const controller = createBlogController();
  const publicController = createPublicBlogController();
  const feedbackController = createAdminFeedbackController();

  router.get('/public', publicController.list);
  router.get('/public/:slug', publicController.detail);

  router.use(authenticateAdmin);

  router.get('/templates', controller.templates);
  router.get('/trash', controller.trashList);
  router.post('/', requireRole('super_admin', 'editor', 'author'), controller.create);
  router.get('/', controller.list);
  router.get('/:id/publish-checklist', controller.checklist);
  router.post('/:id/upgrade-custom-template', requireRole('super_admin', 'editor', 'author'), controller.upgradeCustomTemplate);
  router.post('/:id/publish', requireRole('super_admin', 'editor'), controller.publish);
  router.post('/:id/unpublish', requireRole('super_admin', 'editor'), controller.unpublish);
  router.post('/:id/restore', requireRole('super_admin', 'editor'), controller.restore);
  router.get('/:blogId/feedback-summary', requireRole('editor', 'super_admin'), feedbackController.getSummary);
  router.get('/:id', controller.detail);
  router.patch('/:id', requireRole('super_admin', 'editor', 'author'), controller.update);
  router.delete('/:id', requireRole('super_admin', 'editor', 'author'), controller.trash);

  return router;
}
