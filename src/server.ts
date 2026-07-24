import { createServer } from 'node:http';
import { createApp } from './app.js';
import { authenticateDatabase, closeDatabase } from './config/database.js';
import { env } from './config/environment.js';
import { logger } from './config/logger.js';

async function start(): Promise<void> {
  try {
    await authenticateDatabase();
    logger.info(
      { stage: env.APP_STAGE, database: env.DB_NAME, host: env.DB_HOST, port: env.DB_PORT },
      'Database connection established'
    );
    const server = createServer(createApp());
    server.listen(env.PORT, () =>
      logger.info(
        { url: 'http://localhost:' + env.PORT, environment: env.NODE_ENV },
        'API server started; watching for saved file changes'
      )
    );

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info({ signal }, 'Graceful shutdown started');
      const forceShutdown = setTimeout(() => {
        logger.fatal('Graceful shutdown timed out');
        logger.flush();
        process.exit(1);
      }, 10_000);
      forceShutdown.unref();

      server.close(async (serverError) => {
        try {
          if (serverError) throw serverError;
          await closeDatabase();
          clearTimeout(forceShutdown);
          logger.info('Graceful shutdown completed');
          logger.flush();
          process.exit(0);
        } catch (error) {
          clearTimeout(forceShutdown);
          logger.error({ err: error }, 'Graceful shutdown failed');
          logger.flush();
          process.exit(1);
        }
      });
      server.closeIdleConnections();
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.fatal({ err: error }, 'Application startup failed');
    await closeDatabase().catch((closeError) => logger.error({ err: closeError }, 'Database cleanup failed'));
    logger.flush();
    process.exitCode = 1;
  }
}

void start();
