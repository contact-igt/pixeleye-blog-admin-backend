import { Router } from 'express';
import { createPublicBlogController } from './public-blog.controller.js';
import { createPublicFeedbackController } from './public-feedback.controller.js';

export function createPublicBlogRouter(): Router {
  const router = Router();
  const controller = createPublicBlogController();
  const feedbackController = createPublicFeedbackController();

  router.get('/', controller.list);
  router.get('/:slug', controller.detail);
  router.post('/:slug/feedback', feedbackController.submit);
  router.get('/:slug/feedback-summary', feedbackController.getSummary);

  return router;
}
