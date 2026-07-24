import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { authenticateDatabase } from './config/database.js';
import { corsOptions } from './config/cors.js';
import { initializeAuthAssociations, initializeBlogAssociations, initializeMediaAssociations } from './database/associations/index.js';
import { initializeAuthModels, initializeBlogModels, initializeMediaModels } from './database/models/index.js';
import { env } from './config/environment.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { requestId } from './middlewares/request-id.js';
import { requestLogger } from './middlewares/request-logger.js';
import { createRateLimiter } from './middlewares/rate-limit.js';
import { createApiRouter } from './routes/index.js';
import type { DatabaseCheck } from './modules/health/health.service.js';

export function createApp(
  databaseCheck: DatabaseCheck = authenticateDatabase,
  rateLimitMax = env.RATE_LIMIT_MAX
): Express {
  initializeAuthModels();
  initializeMediaModels();
  initializeBlogModels();
  initializeAuthAssociations();
  initializeMediaAssociations();
  initializeBlogAssociations();

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(createRateLimiter(rateLimitMax));
  app.use(env.API_PREFIX, createApiRouter(databaseCheck));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
