import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';
import { sendSuccess } from '../../utils/api-response.js';
import { createBlogService, type BlogService } from './blog.service.js';

function actor(request: Request) {
  if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
  return { id: request.authenticatedAdmin.id, role: request.authenticatedAdmin.role };
}

export function createBlogController(service: BlogService = createBlogService()) {
  return {
    async templates(_request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog templates fetched', service.listTemplates()); } catch (error) { next(error); } },
    async create(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog draft created', await service.createBlog(request.body, actor(request)), 201); } catch (error) { next(error); } },
    async list(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blogs fetched', await service.listBlogs(request.query, actor(request))); } catch (error) { next(error); } },
    async trashList(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog trash fetched', await service.listTrashedBlogs(request.query, actor(request))); } catch (error) { next(error); } },
    async detail(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog fetched', await service.getBlog(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } },
    async checklist(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Publish checklist fetched', await service.getPublishChecklist(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } },
    async update(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog updated', await service.updateBlog(String(request.params.id ?? ''), request.body, actor(request))); } catch (error) { next(error); } },
    async publish(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog published', await service.publishBlog(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } },
    async unpublish(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog unpublished', await service.unpublishBlog(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } },
    async trash(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog moved to trash', await service.moveBlogToTrash(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } },
    async restore(request: Request, response: Response, next: NextFunction) { try { return sendSuccess(response, 'Blog restored', await service.restoreBlog(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); } }
  };
}
