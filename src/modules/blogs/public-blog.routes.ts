import { Router } from 'express';
import { createPublicBlogController } from './public-blog.controller.js';

export function createPublicBlogRouter(): Router {
  const router = Router();
  const controller = createPublicBlogController();

  router.get('/', controller.list);
  router.get('/:slug', controller.detail);

  return router;
}
