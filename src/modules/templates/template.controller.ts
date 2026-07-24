import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { createTemplateService, type TemplateService } from './template.service.js';

export function createTemplateController(service: TemplateService = createTemplateService()) {
  return {
    async list(_request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Templates fetched successfully', await service.listTemplates()); } catch (error) { next(error); }
    },
    async detail(request: Request, response: Response, next: NextFunction) {
      try { return sendSuccess(response, 'Template fetched successfully', await service.getTemplate(String(request.params.templateKey ?? ''))); } catch (error) { next(error); }
    }
  };
}

