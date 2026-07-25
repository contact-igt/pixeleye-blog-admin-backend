import type { CorsOptions } from 'cors';
import { env } from './environment.js';
import { ApiError } from '../utils/api-error.js';

export const corsOptions: CorsOptions = {
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  origin(origin, callback) {
    // if (!origin || env.corsOrigins.includes(origin)) {
    callback(null, true);
    // return;
    // }
    // callback(new ApiError(403, 'Origin is not allowed by CORS policy'));
  }
};

