import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { createDashboardService, type DashboardService } from './dashboard.service.js';

export function createDashboardController(service: DashboardService = createDashboardService()) {
  return {
    async getStats(request: Request, response: Response, next: NextFunction) {
      try {
        const stats = await service.getDashboardStats();
        return sendSuccess(response, 'Dashboard statistics fetched successfully', stats);
      } catch (error) {
        next(error);
      }
    }
  };
}
