import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { createBlogService, type BlogService } from './blog.service.js';

export function createPublicBlogController(service: BlogService = createBlogService()) {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try {
        const result = await service.listPublicBlogs(request.query);
        return sendSuccess(response, 'Published blogs fetched', result);
      } catch (error) {
        next(error);
      }
    },
    async detail(request: Request, response: Response, next: NextFunction) {
      try {
        const slug = String(request.params.slug ?? '');
        const blog = await service.getPublicBlogBySlug(slug);
        return sendSuccess(response, 'Published blog fetched', blog);
      } catch (error) {
        next(error);
      }
    }
  };
}
