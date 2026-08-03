import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../../middlewares/auth/authenticate-admin.js';
import { createAdminSubscriberController } from './admin-subscriber.controller.js';
import { createAdminCampaignController } from './admin-campaign.controller.js';

export function createAdminNewsletterRouter(): Router {
  const router = Router();

  router.use(authenticateAdmin);
  router.use(requireRole('editor', 'super_admin'));

  const subscriberController = createAdminSubscriberController();
  const campaignController = createAdminCampaignController();

  // Subscriber endpoints
  router.get('/subscribers', subscriberController.list);
  router.get('/subscribers/stats', subscriberController.stats);
  router.get('/subscribers/export', subscriberController.exportCsv);
  router.post('/subscribers', subscriberController.create);
  router.get('/subscribers/:id', subscriberController.getDetail);
  router.post('/subscribers/:id/resend-verification', subscriberController.resendVerification);
  router.post('/subscribers/:id/send-resubscription', subscriberController.sendResubscription);
  router.delete('/subscribers/:id', subscriberController.delete);
  router.post('/test-email', requireRole('super_admin'), subscriberController.testSmtpEmail);

  // Campaign endpoints
  router.get('/worker-health', campaignController.workerHealth);
  router.get('/campaigns', campaignController.list);
  router.get('/campaigns/stats', campaignController.stats);
  router.post('/campaigns', campaignController.create);
  router.get('/campaigns/:id/queue-preview', campaignController.queuePreview);
  router.get('/campaigns/:id/delivery-diagnostics', campaignController.deliveryDiagnostics);
  router.get('/campaigns/:id', campaignController.getDetail);
  router.patch('/campaigns/:id', campaignController.update);
  router.post('/campaigns/:id/send-test', campaignController.sendTest);
  router.post('/campaigns/:id/queue', campaignController.queue);
  router.post('/campaigns/:id/pause', campaignController.pause);
  router.post('/campaigns/:id/resume', campaignController.resume);
  router.post('/campaigns/:id/retry-failed', campaignController.retryFailed);
  router.post('/campaigns/:id/cancel', campaignController.cancel);
  router.delete('/campaigns/:id', campaignController.delete);

  return router;
}
