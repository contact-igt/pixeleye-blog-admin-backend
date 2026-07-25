import { authenticateDatabase, closeDatabase } from './config/database.js';
import { logger } from './config/logger.js';
import { startNewsletterWorker, stopNewsletterWorker } from './workers/newsletter-delivery.worker.js';
import { initializeNewsletterModels } from './database/models/index.js';
import { initializeNewsletterAssociations } from './database/associations/index.js';

async function start(): Promise<void> {
  try {
    logger.info('Newsletter Worker starting...');

    // Initialize models and associations
    initializeNewsletterModels();
    initializeNewsletterAssociations();

    // Connect to database
    await authenticateDatabase();
    logger.info('Database connected');

    // Start worker
    startNewsletterWorker();

    // Graceful shutdown handlers
    const handleShutdown = (signal: string) => {
      logger.info({ signal }, 'Newsletter worker shutting down');
      stopNewsletterWorker();

      const timeout = setTimeout(() => {
        logger.error('Newsletter worker shutdown timeout');
        process.exit(1);
      }, 30_000);
      timeout.unref();

      closeDatabase()
        .then(() => {
          clearTimeout(timeout);
          logger.info('Newsletter worker stopped');
          process.exit(0);
        })
        .catch((error) => {
          clearTimeout(timeout);
          logger.error({ error }, 'Database cleanup failed');
          process.exit(1);
        });
    };

    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));

    logger.info('Newsletter Worker ready');
  } catch (error) {
    logger.fatal({ error }, 'Newsletter Worker startup failed');
    process.exit(1);
  }
}

void start();
