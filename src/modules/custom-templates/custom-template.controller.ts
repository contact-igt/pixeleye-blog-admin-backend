import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';
import { sendSuccess } from '../../utils/api-response.js';
import { createCustomTemplateService, type CustomTemplateService } from './custom-template.service.js';

function actor(request: Request) {
  if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
  return { id: request.authenticatedAdmin.id, role: request.authenticatedAdmin.role };
}

export function createCustomTemplateController(service: CustomTemplateService = createCustomTemplateService()) {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Templates fetched', await service.listCustomTemplates(request.query, actor(request))); } catch (error) { next(error); }
    },
    async create(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template created', await service.createCustomTemplate(request.body, actor(request)), 201); } catch (error) { next(error); }
    },
    async detail(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template fetched', await service.getCustomTemplateDetail(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); }
    },
    async update(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template updated', await service.updateCustomTemplateMetadata(String(request.params.id ?? ''), request.body, actor(request))); } catch (error) { next(error); }
    },
    async listVersions(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template versions fetched', await service.listVersions(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); }
    },
    async getVersion(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template version fetched', await service.getVersion(String(request.params.id ?? ''), String(request.params.versionId ?? ''), actor(request))); } catch (error) { next(error); }
    },
    async createVersion(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template version created', await service.saveCustomTemplateVersion(String(request.params.id ?? ''), request.body, actor(request)), 201); } catch (error) { next(error); }
    },
    async duplicate(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template duplicated', await service.duplicateCustomTemplate(String(request.params.id ?? ''), request.body, actor(request)), 201); } catch (error) { next(error); }
    },
    async activate(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template activated', await service.activateCustomTemplate(String(request.params.id ?? ''), request.body, actor(request))); } catch (error) { next(error); }
    },
    async archive(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template archived', await service.archiveCustomTemplate(String(request.params.id ?? ''), request.body, actor(request))); } catch (error) { next(error); }
    },
    async restore(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template restored', await service.restoreCustomTemplate(String(request.params.id ?? ''), request.body, actor(request))); } catch (error) { next(error); }
    },
    async permanentlyDelete(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Custom Template permanently deleted', await service.permanentlyDeleteCustomTemplate(String(request.params.id ?? ''), actor(request))); } catch (error) { next(error); }
    }
  };
}
