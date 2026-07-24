import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../../config/environment.js';
import { authenticateAdmin, optionalAuthenticateAdmin } from '../../../middlewares/auth/authenticate-admin.js';
import { createAuthController } from './auth.controller.js';

export function createAdminAuthRouter(): Router {
  const router = Router();
  const controller = createAuthController();
  const loginRateLimiter = rateLimit({
    windowMs: env.AUTH_LOCK_MINUTES * 60 * 1000,
    limit: env.AUTH_MAX_FAILED_ATTEMPTS * 4,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });

  router.post('/login', loginRateLimiter, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', optionalAuthenticateAdmin, controller.logout);
  router.get('/me', authenticateAdmin, controller.me);
  router.patch('/change-password', authenticateAdmin, controller.changePassword);

  return router;
}


