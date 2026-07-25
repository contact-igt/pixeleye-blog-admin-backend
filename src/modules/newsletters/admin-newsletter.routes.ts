import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../../middlewares/auth/authenticate-admin.js';
import { createAdminSubscriberController } from './admin-subscriber.controller.js';
import { createAdminCampaignController } from './admin-campaign.controller.js';

export function createAdminNewsletterRouter(): Router {
  const router = Router();

  router.use(authenticateAdmin);

  const subscriberController = createAdminSubscriberController();
  const campaignController = createAdminCampaignController();

  // Subscriber endpoints
  router.get('/subscribers', subscriberController.list);
  router.get('/subscribers/stats', subscriberController.stats);
  router.get('/subscribers/export', subscriberController.exportCsv);
  router.post('/subscribers', requireRole('editor', 'super_admin'), subscriberController.create);
  router.get('/subscribers/:id', subscriberController.getDetail);
  router.post('/subscribers/:id/resend-verification', requireRole('editor', 'super_admin'), subscriberController.resendVerification);
  router.delete('/subscribers/:id', requireRole('editor', 'super_admin'), subscriberController.delete);
  router.post('/test-email', requireRole('super_admin'), subscriberController.testSmtpEmail);

  // Campaign endpoints
  router.get('/campaigns', campaignController.list);
  router.get('/campaigns/stats', campaignController.stats);
  router.post('/campaigns', campaignController.create);
  router.get('/campaigns/:id', campaignController.getDetail);
  router.patch('/campaigns/:id', campaignController.update);
  router.post('/campaigns/:id/send-test', campaignController.sendTest);
  router.post('/campaigns/:id/queue', campaignController.queue);
  router.post('/campaigns/:id/retry-failed', campaignController.retryFailed);
  router.post('/campaigns/:id/cancel', campaignController.cancel);

  return router;
}
