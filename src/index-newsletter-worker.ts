import { authenticateDatabase, closeDatabase } from './config/database.js';
import { logger } from './config/logger.js';
import {
  requestShutdown,
  setFatalRuntimeErrorHandler,
  setInitialWorkerReadiness,
  startNewsletterWorker,
  waitForActiveProcessingToFinish,
  WORKER_INSTANCE_ID
} from './workers/newsletter-delivery.worker.js';
import { initializeNewsletterModels } from './database/models/index.js';
import { initializeNewsletterAssociations, initializeBlogAssociations } from './database/associations/index.js';
import { isMailConfigured, verifyMailConnection, classifySmtpError } from './services/integrations/mail.service.js';
import {
  createWorkerHeartbeat,
  markWorkerFailed,
  markWorkerSmtpState,
  markWorkerStopped,
  markWorkerStopping,
  startWorkerHeartbeatTimer,
  stopWorkerHeartbeatTimer
} from './modules/newsletters/newsletter-worker-health.js';
import { autoPauseActiveCampaignsForSmtp } from './modules/newsletters/newsletter-auto-pause.service.js';

const SHUTDOWN_TIMEOUT_MS = 30_000;
let heartbeatCreated = false;
let shuttingDown = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function authenticateDatabaseWithBackoff(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await authenticateDatabase();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        const delayMs = Math.min(10_000, 1_000 * Math.pow(2, attempt - 1));
        logger.warn({ attempt, delayMs }, 'Newsletter Worker database startup check failed; retrying');
        await wait(delayMs);
      }
    }
  }
  throw lastError;
}

async function shutdown(signal: string, exitCode = 0, fatalError?: Error): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Newsletter Worker shutting down');

  if (heartbeatCreated) {
    try {
      if (fatalError) await markWorkerFailed(WORKER_INSTANCE_ID, fatalError);
      else await markWorkerStopping(WORKER_INSTANCE_ID);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Newsletter Worker stopping status update failed');
    }
  }

  requestShutdown();
  stopWorkerHeartbeatTimer();
  const finishedCleanly = await waitForActiveProcessingToFinish(SHUTDOWN_TIMEOUT_MS);
  if (!finishedCleanly) logger.warn('Graceful shutdown timeout reached; a delivery batch may still be in flight');

  if (heartbeatCreated && !fatalError) {
    try {
      await markWorkerStopped(WORKER_INSTANCE_ID);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Newsletter Worker final status update failed');
    }
  }

  try {
    await closeDatabase();
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Newsletter Worker database cleanup failed');
    exitCode = 1;
  }
  logger.info({ finishedCleanly }, 'Newsletter Worker stopped');
  process.exit(finishedCleanly ? exitCode : 1);
}

async function start(): Promise<void> {
  try {
    logger.info({ workerInstanceId: WORKER_INSTANCE_ID }, 'Newsletter Worker starting');
    initializeNewsletterModels();
    initializeNewsletterAssociations();
    initializeBlogAssociations();

    await authenticateDatabaseWithBackoff();
    logger.info('Newsletter Worker database connected');
    await createWorkerHeartbeat(WORKER_INSTANCE_ID);
    heartbeatCreated = true;
    startWorkerHeartbeatTimer(WORKER_INSTANCE_ID);

    if (!isMailConfigured()) {
      const error = Object.assign(new Error('SMTP is not configured'), { code: 'SMTP_NOT_CONFIGURED' });
      await markWorkerFailed(WORKER_INSTANCE_ID, error);
      await autoPauseActiveCampaignsForSmtp();
      stopWorkerHeartbeatTimer();
      await closeDatabase();
      logger.fatal({ code: error.code }, 'Newsletter Worker startup configuration is invalid');
      process.exit(1);
    }

    let smtpReady = false;
    try {
      await verifyMailConnection();
      smtpReady = true;
      await markWorkerSmtpState(WORKER_INSTANCE_ID, true);
      logger.info('Newsletter Worker SMTP verification succeeded');
    } catch (error) {
      const classified = classifySmtpError(error);
      const safeError = Object.assign(new Error(classified.message), { code: `SMTP_${classified.code}` });
      await markWorkerSmtpState(WORKER_INSTANCE_ID, false, safeError);
      if (classified.status === 'auth_failed') {
        await autoPauseActiveCampaignsForSmtp();
        await markWorkerFailed(WORKER_INSTANCE_ID, safeError);
        stopWorkerHeartbeatTimer();
        await closeDatabase();
        logger.fatal({ code: classified.code, responseCode: classified.responseCode, command: classified.command }, 'Newsletter Worker SMTP authentication failed');
        process.exit(1);
      }
      logger.warn({ code: classified.code }, 'Newsletter Worker SMTP is temporarily unavailable; delivery claims are blocked until recovery');
    }

    setInitialWorkerReadiness({ database: true, smtp: smtpReady });
    setFatalRuntimeErrorHandler((error) => void shutdown('SMTP_FATAL', 1, error));
    startNewsletterWorker();

    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
    logger.info({ smtpReady }, 'Newsletter Worker lifecycle ready');
  } catch (error) {
    if (heartbeatCreated) {
      try { await markWorkerFailed(WORKER_INSTANCE_ID, error); } catch { /* database may be unavailable */ }
      stopWorkerHeartbeatTimer();
    }
    try { await closeDatabase(); } catch { /* startup cleanup is best effort */ }
    logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'Newsletter Worker startup failed');
    process.exit(1);
  }
}

void start();
