import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = performance.now();
  response.on('finish', () => {
    logger.info(
      {
        request_id: request.requestId,
        method: request.method,
        route: request.originalUrl,
        status: response.statusCode,
        duration_ms: Math.round((performance.now() - startedAt) * 100) / 100
      },
      'Request completed'
    );
  });
  next();
}

