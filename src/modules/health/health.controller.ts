import type { NextFunction, Request, Response } from 'express';
import type { ReturnTypeHealthService } from './health.types.js';
import { sendSuccess } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';

export function createHealthController(service: ReturnTypeHealthService) {
  return {
    live(_request: Request, response: Response) {
      return sendSuccess(response, 'Pixel Eye Blog API is running', service.liveness());
    },
    async ready(_request: Request, response: Response, next: NextFunction) {
      try {
        return sendSuccess(response, 'Pixel Eye Blog API is ready', await service.readiness());
      } catch (error) {
        next(new ApiError(503, 'Pixel Eye Blog API is not ready', undefined, error));
      }
    }
  };
}
