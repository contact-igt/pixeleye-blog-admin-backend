import { Router } from 'express';
import type { DatabaseCheck } from '../modules/health/health.service.js';
import { createAdminAuthRouter } from '../modules/admin/auth/auth.routes.js';
import { createHealthRouter } from '../modules/health/health.routes.js';
import { createMediaRouter } from '../modules/media/media.routes.js';
import { createBlogRouter } from '../modules/blogs/blog.routes.js';
import { createPublicBlogRouter } from '../modules/blogs/public-blog.routes.js';
import { createTemplateRouter } from '../modules/templates/template.routes.js';
import { createPublicTemplateRouter } from '../modules/templates/public-template.routes.js';

export function createApiRouter(databaseCheck: DatabaseCheck): Router {
  const router = Router();
  router.use('/health', createHealthRouter(databaseCheck));
  router.use('/auth', createAdminAuthRouter());
  router.use('/admin/auth', createAdminAuthRouter());
  router.use('/media', createMediaRouter());
  router.use('/blogs', createBlogRouter());
  router.use('/templates', createTemplateRouter());
  router.use('/public/blogs', createPublicBlogRouter());
  router.use('/public/templates', createPublicTemplateRouter());
  return router;
}




