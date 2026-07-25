import { Router } from 'express';
import { createPublicNewsletterController } from './public-newsletter.controller.js';

export function createPublicNewsletterRouter(): Router {
  const router = Router();
  const controller = createPublicNewsletterController();

  router.post('/subscribe', controller.subscribe);
  router.post('/verify', controller.verify);
  router.post('/unsubscribe', controller.unsubscribe);

  return router;
}
