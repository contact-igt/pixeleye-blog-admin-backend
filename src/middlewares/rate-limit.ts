import rateLimit from 'express-rate-limit';
import { env } from '../config/environment.js';

export function createRateLimiter(limit = env.RATE_LIMIT_MAX) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        request_id: request.requestId
      });
    }
  });
}

