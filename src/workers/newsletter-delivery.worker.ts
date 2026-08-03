import { randomUUID } from 'node:crypto';
import { Op, QueryTypes } from 'sequelize';
import { authenticateDatabase, sequelize } from '../config/database.js';
import { env } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { NewsletterDelivery } from '../modules/newsletters/newsletter-delivery.model.js';
import { NewsletterSubscriber } from '../modules/newsletters/newsletter-subscriber.model.js';
import { NewsletterCampaign } from '../modules/newsletters/newsletter-campaign.model.js';
import { Blog } from '../modules/blogs/blog.model.js';
import { BlogVersion } from '../modules/blogs/blog-version.model.js';
import { MediaAsset } from '../modules/media/media.model.js';
import { classifySmtpError, createMailTransporter, isMailConfigured, verifyMailConnection } from '../services/integrations/mail.service.js';
import { generateCampaignEmail } from '../modules/newsletters/email-templates.js';
import { createUnsubscribeToken } from '../modules/newsletters/unsubscribe-token.service.js';
import { reconcileCampaignState, reconcileActiveCampaignsSweep } from '../modules/newsletters/newsletter-campaign.service.js';
import { ELIGIBLE_EMAIL_REGEXP } from '../modules/newsletters/newsletter-eligibility.js';
import { autoPauseActiveCampaignsForSmtp, autoPauseCampaignForDeliveryFailures, autoResumeDueRateLimitedCampaigns } from '../modules/newsletters/newsletter-auto-pause.service.js';
import {
  markWorkerDatabaseState,
  markWorkerSmtpState,
  recordWorkerClaimSuccess,
  recordWorkerPollFailure,
  recordWorkerPollSuccess,
  recordWorkerSendSuccess
} from '../modules/newsletters/newsletter-worker-health.js';

const BATCH_SIZE = env.NEWSLETTER_WORKER_BATCH_SIZE;
const WORKER_POLL_INTERVAL_MS = env.NEWSLETTER_WORKER_POLL_INTERVAL_MS;
const MAX_ATTEMPTS = env.NEWSLETTER_MAX_ATTEMPTS;
const RETRY_BASE_DELAY_SECONDS = env.NEWSLETTER_RETRY_BASE_DELAY_SECONDS;
const STALE_DELIVERY_MINUTES = parseInt(process.env.NEWSLETTER_STALE_DELIVERY_MINUTES || '30', 10);
const WORKER_CONCURRENCY = env.NEWSLETTER_WORKER_CONCURRENCY;
const RECONCILIATION_SWEEP_BATCH_SIZE = env.NEWSLETTER_WORKER_BATCH_SIZE;
const WORKER_INSTANCE_ID = `${process.pid}-${randomUUID()}`;

let workerTimer: NodeJS.Timeout | null = null;
let isRunning = false;
let shutdownRequested = false;
let lastSuccessfulClaim: Date | null = null;
let lastSuccessfulSend: Date | null = null;
let databaseReady = true;
let smtpReady = false;
let databaseRetryCount = 0;
let smtpRetryCount = 0;
let nextDatabaseRetryAt = 0;
let nextSmtpRetryAt = 0;
let startupReconciliationPending = true;
let fatalRuntimeErrorHandler: ((error: Error) => void) | null = null;

const MAX_DEPENDENCY_BACKOFF_MS = 60_000;

function boundedBackoffMs(failureCount: number): number {
  return Math.min(MAX_DEPENDENCY_BACKOFF_MS, 1_000 * Math.pow(2, Math.min(failureCount, 6)));
}

/**
 * Called once by src/index-newsletter-worker.ts after transporter.verify()
 * settles at startup, so the health file (and therefore the Admin UI) can
 * distinguish "never checked" from "checked and failed" from "checked and
 * ready" instead of collapsing everything into the `smtp_configured`
 * boolean.
 */
export function setInitialWorkerReadiness(ready: { database: boolean; smtp: boolean }): void {
  databaseReady = ready.database;
  smtpReady = ready.smtp;
}

export function setFatalRuntimeErrorHandler(handler: (error: Error) => void): void {
  fatalRuntimeErrorHandler = handler;
}

interface ClaimedDelivery {
  id: string;
  campaign_id: string;
  subscriber_id: string;
  attempt_count: number;
  next_attempt_at: string | null;
  processing_started_at: string | null;
  provider_message_id: string | null;
}

type DeliveryOutcome =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'cancelled'; reason: string }
  | { outcome: 'failed'; error: string; errorCode: string };

class ClaimIterationError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'CLAIM_FAILED';
  }
}

async function cancelIneligibleDeliveries(): Promise<string[]> {
  const rows = await sequelize.query<{ id: string; campaign_id: string }>(
    `SELECT d.id, d.campaign_id
       FROM newsletter_deliveries d
       JOIN newsletter_campaigns c ON c.id = d.campaign_id
       JOIN newsletter_subscribers s ON s.id = d.subscriber_id
      WHERE d.status IN ('pending', 'retry_pending')
        AND c.status IN ('queued', 'sending')
        AND c.deleted_at IS NULL
        AND NOT (
          s.status = 'subscribed'
          AND s.deleted_at IS NULL
          AND s.email REGEXP :emailRegexp
          AND s.normalized_email REGEXP :emailRegexp
          AND LOWER(TRIM(s.email)) = s.normalized_email
          AND LOWER(s.email) NOT LIKE 'deleted-subscriber-%'
        )`,
    { replacements: { emailRegexp: ELIGIBLE_EMAIL_REGEXP }, type: QueryTypes.SELECT }
  );
  if (rows.length === 0) return [];
  await NewsletterDelivery.update(
    { status: 'cancelled' as any, failureReason: 'Subscriber is no longer eligible' },
    { where: { id: { [Op.in]: rows.map((row) => row.id) } } }
  );
  return [...new Set(rows.map((row) => row.campaign_id))];
}

/**
 * MariaDB 10.4 (the target database) doesn't support SKIP LOCKED — it was
 * added in MariaDB 10.6 — so a literal `FOR UPDATE SKIP LOCKED` fails with
 * SQL error 1064 (syntax error) rather than a compatibility warning. Plain
 * `FOR UPDATE` is used instead: a concurrent claim transaction blocks on the
 * locked rows rather than skipping them, then — once the first transaction
 * commits and the lock is granted — InnoDB/XtraDB re-fetches the now-latest
 * committed row data before applying the WHERE filter (this is standard
 * locking-read behaviour, distinct from the snapshot read a plain SELECT
 * would use under REPEATABLE READ). Rows the first transaction already
 * flipped to 'processing' therefore no longer match `status = 'pending'`
 * and are silently excluded from the second transaction's result set, so no
 * delivery is ever claimed twice — the two workers just serialize instead of
 * running the claim step in parallel.
 */
async function claimDeliveries(): Promise<ClaimedDelivery[]> {
  const staleThreshold = new Date(Date.now() - STALE_DELIVERY_MINUTES * 60 * 1000);
  return sequelize.transaction(async (t) => {
    const deliveries = await sequelize.query<ClaimedDelivery>(
      `SELECT d.id, d.campaign_id, d.subscriber_id, d.attempt_count, d.next_attempt_at,
              d.processing_started_at, d.provider_message_id
         FROM newsletter_deliveries d
         JOIN newsletter_subscribers s ON s.id = d.subscriber_id
        WHERE (
          d.status = 'pending'
          OR (d.status = 'retry_pending' AND d.next_attempt_at <= NOW())
          OR (d.status = 'processing' AND d.processing_started_at < :staleThreshold
              AND (d.last_error_code IS NULL OR d.last_error_code <> 'DELIVERY_FINALIZATION_UNCERTAIN'))
        )
          AND s.status = 'subscribed'
          AND s.deleted_at IS NULL
          AND s.email REGEXP :emailRegexp
          AND s.normalized_email REGEXP :emailRegexp
          AND LOWER(TRIM(s.email)) = s.normalized_email
          AND LOWER(s.email) NOT LIKE 'deleted-subscriber-%'
          AND d.campaign_id IN (SELECT id FROM newsletter_campaigns WHERE status IN ('queued', 'sending') AND deleted_at IS NULL)
        ORDER BY d.created_at ASC
        LIMIT :batchSize
        FOR UPDATE`,
      { replacements: { staleThreshold, batchSize: BATCH_SIZE, emailRegexp: ELIGIBLE_EMAIL_REGEXP }, type: QueryTypes.SELECT, raw: true, transaction: t }
    );
    if (deliveries.length === 0) return [];
    await NewsletterDelivery.update(
      {
        status: 'processing' as any,
        processingStartedAt: new Date(),
        nextAttemptAt: null,
        failedAt: null,
        sentAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        failureReason: null
      },
      { where: { id: { [Op.in]: deliveries.map((delivery) => delivery.id) } }, transaction: t }
    );
    return deliveries;
  });
}

function stableMessageId(delivery: ClaimedDelivery): string {
  return delivery.provider_message_id || `<newsletter-${delivery.campaign_id}-${delivery.id}@${new URL(env.PUBLIC_WEBSITE_URL).hostname}>`;
}

function classifyError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (/invalid|malformed|no such mailbox|recipient|550|551|553|554/.test(lower)) return { code: 'DELIVERY_PERMANENT_FAILURE', message: message.slice(0, 1000) };
  if (/timeout|timed out|rate|429|4\d\d|temporary|network|connection|econn|enotfound|eai_again/.test(lower)) return { code: 'DELIVERY_TEMPORARY_FAILURE', message: message.slice(0, 1000) };
  return { code: 'DELIVERY_TEMPORARY_FAILURE', message: message.slice(0, 1000) };
}

async function sendDelivery(delivery: ClaimedDelivery): Promise<DeliveryOutcome> {
  const messageId = stableMessageId(delivery);
  try {
    const subscriber = await NewsletterSubscriber.findByPk(delivery.subscriber_id);
    if (!subscriber) return { outcome: 'cancelled', reason: 'Subscriber no longer exists' };
    const subscriberData = subscriber.get({ plain: true }) as any;
    if (subscriberData.deletedAt || subscriberData.status !== 'subscribed') return { outcome: 'cancelled', reason: 'Subscriber is no longer eligible' };

    const campaign = await NewsletterCampaign.findByPk(delivery.campaign_id, {
      include: [
        { model: Blog, as: 'blog', attributes: ['id', 'slug'] },
        { model: BlogVersion, as: 'blogVersion', include: [{ model: MediaAsset, as: 'featuredMedia' }] }
      ]
    });
    if (!campaign) return { outcome: 'cancelled', reason: 'Campaign no longer exists' };
    const campaignData = campaign.get({ plain: true }) as any;
    if (campaignData.status === 'cancelled') return { outcome: 'cancelled', reason: 'Campaign was cancelled' };
    const blogVersionData = campaignData.blogVersion;
    const blogSlug = campaignData.blog?.slug || '';
    const emailTemplate = generateCampaignEmail({
      campaignSubject: campaignData.subject,
      previewText: campaignData.previewText,
      blogTitle: blogVersionData?.title || '',
      blogExcerpt: blogVersionData?.excerpt || '',
      blogSlug,
      blogUrl: `${env.PUBLIC_WEBSITE_URL}/blog/${encodeURIComponent(blogSlug)}`,
      featuredImageUrl: blogVersionData?.featuredMedia?.originalUrl || undefined,
      unsubscribeUrl: `${env.PUBLIC_WEBSITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(subscriberData.id))}`,
      isTest: false
    });
    const result = await createMailTransporter().sendMail({
      from: env.MAIL_FROM_EMAIL,
      to: subscriberData.email,
      subject: emailTemplate.subject,
      html: emailTemplate.htmlBody,
      text: emailTemplate.textBody,
      messageId,
      headers: { 'X-Pixel-Eye-Delivery-ID': String(delivery.id) }
    });
    return { outcome: 'sent', providerMessageId: result.messageId || messageId };
  } catch (error) {
    const smtpFailure = classifySmtpError(error);
    if (smtpFailure.status === 'auth_failed' || /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ESOCKET/.test(smtpFailure.code)) {
      smtpReady = false;
      smtpRetryCount += 1;
      nextSmtpRetryAt = Date.now() + boundedBackoffMs(smtpRetryCount);
      await markWorkerSmtpState(
        WORKER_INSTANCE_ID,
        false,
        { code: `SMTP_${smtpFailure.code}`, message: smtpFailure.message }
      ).catch(() => undefined);
      if (smtpFailure.status === 'auth_failed') {
        await autoPauseActiveCampaignsForSmtp().catch(() => undefined);
        fatalRuntimeErrorHandler?.(Object.assign(new Error(smtpFailure.message), { code: `SMTP_${smtpFailure.code}` }));
      }
    }
    const classified = classifyError(error);
    if ([421, 429, 450, 451, 452].includes(smtpFailure.responseCode ?? 0)) {
      classified.code = `DELIVERY_PROVIDER_RATE_LIMIT_${smtpFailure.responseCode}`;
    }
    logger.error({ deliveryId: delivery.id, error: classified.message, code: classified.code }, 'Failed to send delivery');
    return { outcome: 'failed', error: classified.message, errorCode: classified.code };
  }
}

/**
 * Every outcome branch checks the Sequelize `[affectedCount]` the finalizing
 * `.update()` resolves with (Part 4: "Do not silently ignore a zero-row
 * update"). A `.update()` call doesn't throw just because its WHERE matched
 * nothing — it resolves with `[0]` — so without this check a delivery whose
 * row was concurrently altered (claimed away, cancelled, deleted) would
 * finish sendMail() successfully and then have its outcome silently
 * dropped, with nothing in the database or the logs to show it happened.
 */
async function processDeliveryBatch(deliveries: ClaimedDelivery[]): Promise<void> {
  await Promise.allSettled(deliveries.map(async (delivery) => {
    const messageId = stableMessageId(delivery);
    await NewsletterDelivery.update({ providerMessageId: messageId }, { where: { id: delivery.id } });
    const result = await sendDelivery({ ...delivery, provider_message_id: messageId });
    if (result.outcome === 'sent') {
      try {
        const [affected] = await NewsletterDelivery.update(
          {
            status: 'sent' as any,
            sentAt: new Date(),
            providerMessageId: result.providerMessageId,
            processingStartedAt: null,
            nextAttemptAt: null,
            failedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            failureReason: null
          },
          { where: { id: delivery.id } }
        );
        if (affected === 0) {
          // SMTP already accepted the message — there is no way to "un-send"
          // it, so this can't be treated as a normal failure/retry. Falls
          // through to the uncertain-status catch block below (Part 5).
          throw new Error(`Delivery ${delivery.id} finalize-to-'sent' update matched zero rows`);
        }
        lastSuccessfulSend = new Date();
        await recordWorkerSendSuccess(WORKER_INSTANCE_ID, lastSuccessfulSend).catch((error) => {
          logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Could not persist successful-send timestamp');
        });
      } catch (error) {
        let uncertainAffected = 0;
        try {
          const [affectedCount] = await NewsletterDelivery.update(
            {
              status: 'uncertain' as any,
              failureReason: 'SMTP accepted the message but delivery finalization failed',
              lastErrorCode: 'DELIVERY_FINALIZATION_UNCERTAIN',
              lastErrorMessage: 'Manual review required; automatic resend disabled',
              processingStartedAt: null,
              nextAttemptAt: null,
              failedAt: null
            },
            { where: { id: delivery.id } }
          );
          uncertainAffected = affectedCount;
        } catch (updateError) {
          logger.error({ deliveryId: delivery.id, error: updateError instanceof Error ? updateError.message : String(updateError) }, 'Uncertain-status update threw');
        }
        if (uncertainAffected === 0) {
          logger.error({ deliveryId: delivery.id }, 'Delivery finalization uncertain, and the uncertain-status update itself matched zero rows — row may have been deleted');
        }
        logger.error({ deliveryId: delivery.id, error: error instanceof Error ? error.message : String(error) }, 'Delivery finalization uncertain');
      }
      return;
    }
    if (result.outcome === 'cancelled') {
      const [affected] = await NewsletterDelivery.update(
        {
          status: 'cancelled' as any,
          failureReason: result.reason,
          processingStartedAt: null,
          nextAttemptAt: null,
          failedAt: null,
          sentAt: null,
          lastErrorCode: null,
          lastErrorMessage: null
        },
        { where: { id: delivery.id } }
      );
      if (affected === 0) logger.warn({ deliveryId: delivery.id }, 'Cancelled-outcome update matched zero rows');
      return;
    }
    const attemptCount = (delivery.attempt_count || 0) + 1;
    if (result.errorCode === 'DELIVERY_PERMANENT_FAILURE' || attemptCount >= MAX_ATTEMPTS) {
      const [affected] = await NewsletterDelivery.update(
        {
          status: 'failed' as any,
          attemptCount,
          failedAt: new Date(),
          sentAt: null,
          nextAttemptAt: null,
          lastErrorCode: result.errorCode,
          lastErrorMessage: result.error,
          failureReason: result.error,
          processingStartedAt: null
        },
        { where: { id: delivery.id } }
      );
      if (affected === 0) logger.warn({ deliveryId: delivery.id }, 'Failed-outcome update matched zero rows');
    } else {
      const [affected] = await NewsletterDelivery.update(
        {
          status: 'retry_pending' as any,
          attemptCount,
          nextAttemptAt: new Date(Date.now() + calculateRetryDelaySeconds(attemptCount) * 1000),
          failedAt: null,
          sentAt: null,
          lastErrorCode: result.errorCode,
          lastErrorMessage: result.error,
          failureReason: result.error,
          processingStartedAt: null
        },
        { where: { id: delivery.id } }
      );
      if (affected === 0) logger.warn({ deliveryId: delivery.id }, 'Retry-pending-outcome update matched zero rows');
    }
  }));
}

async function reconcileAffectedCampaigns(campaignIds: string[]): Promise<void> {
  const failures: string[] = [];
  for (const campaignId of [...new Set(campaignIds)]) {
    try { await reconcileCampaignState(campaignId); } catch (error) {
      failures.push(campaignId);
      logger.error({ campaignId, error: error instanceof Error ? error.message : String(error) }, 'Campaign reconciliation failed');
    }
  }
  if (failures.length > 0) throw new Error(`Campaign reconciliation failed for ${failures.length} campaign(s)`);
}

/**
 * Bounded periodic repair pass (Part 6): reconcileCampaignState() is
 * normally invoked only for campaigns a given tick actually touched (claimed
 * a delivery for, cancelled a delivery for). That misses campaigns whose
 * last-touching tick crashed mid-reconciliation, or that are left stuck
 * `queued`/`sending` with zero claimable deliveries left (e.g. every row
 * became `uncertain`, which claimDeliveries() deliberately never reclaims).
 * Running this every tick, capped at RECONCILIATION_SWEEP_BATCH_SIZE
 * campaigns, catches those without an unbounded full-table scan. Failures
 * are logged, never swallowed — the sweep's own error count is part of the
 * return value so a caller can act on persistent failures.
 */
async function runReconciliationSweep(): Promise<void> {
  const result = await reconcileActiveCampaignsSweep(RECONCILIATION_SWEEP_BATCH_SIZE);
  if (result.failed > 0) {
    throw new Error(`Reconciliation sweep completed with ${result.failed} failure(s)`);
  }
}

async function processDeliveries(): Promise<number> {
  if (!isMailConfigured()) throw Object.assign(new Error('SMTP is not configured'), { code: 'SMTP_NOT_CONFIGURED' });
  const cancelledCampaigns = await cancelIneligibleDeliveries();
  await reconcileAffectedCampaigns(cancelledCampaigns);
  let deliveries: ClaimedDelivery[];
  try {
    deliveries = await claimDeliveries();
  } catch (error) {
    throw new ClaimIterationError(error);
  }
  lastSuccessfulClaim = new Date();
  await recordWorkerClaimSuccess(WORKER_INSTANCE_ID, deliveries.length, lastSuccessfulClaim).catch((error) => {
    logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Could not persist successful-claim diagnostics');
  });
  if (deliveries.length === 0) {
    await runReconciliationSweep();
    return 0;
  }
  await reconcileAffectedCampaigns(deliveries.map((delivery) => delivery.campaign_id));
  for (let i = 0; i < deliveries.length && !shutdownRequested; i += WORKER_CONCURRENCY) {
    await processDeliveryBatch(deliveries.slice(i, i + WORKER_CONCURRENCY));
  }
  await reconcileAffectedCampaigns(deliveries.map((delivery) => delivery.campaign_id));
  for (const campaignId of [...new Set(deliveries.map((delivery) => delivery.campaign_id))]) {
    await autoPauseCampaignForDeliveryFailures(campaignId);
  }
  await runReconciliationSweep();
  return deliveries.length;
}

/**
 * Preconditions (SMTP configured and verified, database reachable) are
 * validated by the caller — src/index-newsletter-worker.ts — before this is
 * invoked; that's where the process exits non-zero on failure (Part 2/3).
 * The isMailConfigured() check here is only a defensive fallback so this
 * function is never observed to start a polling loop against an
 * unconfigured transporter if called directly (e.g. from a test).
 *
 * Signal handling deliberately lives entirely in
 * src/index-newsletter-worker.ts, not here: an earlier version registered a
 * second, independent SIGINT/SIGTERM handler in this module that raced the
 * entrypoint's own handler — the entrypoint's handler closed the database
 * and called process.exit() immediately, without waiting for isRunning to
 * clear, so a delivery batch in flight during shutdown could be cut off
 * mid-send. requestShutdown()/waitForActiveProcessingToFinish() below give
 * the entrypoint everything it needs to do this itself, as the single owner
 * of the shutdown sequence.
 */
export function startNewsletterWorker(): void {
  if (!isMailConfigured()) { logger.warn({ workerInstanceId: WORKER_INSTANCE_ID }, 'SMTP not configured, newsletter worker will not start'); return; }
  shutdownRequested = false;
  logger.info({ workerInstanceId: WORKER_INSTANCE_ID, intervalMs: WORKER_POLL_INTERVAL_MS }, 'Starting newsletter worker');
  void runPollingIteration();
  workerTimer = setInterval(() => void runPollingIteration(), WORKER_POLL_INTERVAL_MS);
  workerTimer.unref?.();
}

async function ensureRuntimeDependencies(now = Date.now()): Promise<boolean> {
  if (!databaseReady) {
    if (now < nextDatabaseRetryAt) return false;
    try {
      await authenticateDatabase();
      databaseReady = true;
      databaseRetryCount = 0;
      nextDatabaseRetryAt = 0;
      await markWorkerDatabaseState(WORKER_INSTANCE_ID, true).catch(() => undefined);
      logger.info('Newsletter Worker database connection recovered');
    } catch (error) {
      databaseRetryCount += 1;
      nextDatabaseRetryAt = now + boundedBackoffMs(databaseRetryCount);
      await markWorkerDatabaseState(WORKER_INSTANCE_ID, false, error).catch(() => undefined);
      logger.warn({ retryAt: new Date(nextDatabaseRetryAt).toISOString() }, 'Newsletter Worker database unavailable; retry scheduled');
      return false;
    }
  }

  if (!smtpReady) {
    if (now < nextSmtpRetryAt) return false;
    try {
      await verifyMailConnection();
      smtpReady = true;
      smtpRetryCount = 0;
      nextSmtpRetryAt = 0;
      await markWorkerSmtpState(WORKER_INSTANCE_ID, true).catch(() => undefined);
      logger.info('Newsletter Worker SMTP connection recovered');
    } catch (error) {
      const smtpError = classifySmtpError(error);
      await markWorkerSmtpState(WORKER_INSTANCE_ID, false, { code: `SMTP_${smtpError.code}`, message: smtpError.message }).catch(() => undefined);
      if (smtpError.status === 'auth_failed') {
        const fatal = Object.assign(new Error(smtpError.message), { code: `SMTP_${smtpError.code}` });
        fatalRuntimeErrorHandler?.(fatal);
        return false;
      }
      smtpRetryCount += 1;
      nextSmtpRetryAt = now + boundedBackoffMs(smtpRetryCount);
      logger.warn({ code: smtpError.code, retryAt: new Date(nextSmtpRetryAt).toISOString() }, 'Newsletter Worker SMTP unavailable; retry scheduled');
      return false;
    }
  }
  return true;
}

function isDatabaseConnectivityError(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = String(candidate?.code || candidate?.cause?.code || '').toUpperCase();
  return /ECONN|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND|EAI_AGAIN|ER_SERVER_SHUTDOWN/.test(code);
}

export async function runPollingIteration(
  processor: () => Promise<number> = processDeliveries,
  startupReconciler: () => Promise<void> = runReconciliationSweep
): Promise<'completed' | 'skipped' | 'blocked' | 'failed'> {
  if (shutdownRequested) return 'skipped';
  if (isRunning) {
    logger.warn({ workerInstanceId: WORKER_INSTANCE_ID }, 'poll_skipped_active_iteration');
    return 'skipped';
  }
  isRunning = true;
  try {
    if (!(await ensureRuntimeDependencies())) return 'blocked';
    await autoResumeDueRateLimitedCampaigns();
    if (startupReconciliationPending) {
      await startupReconciler();
      startupReconciliationPending = false;
      logger.info('Newsletter Worker startup reconciliation completed');
    }
    const claimedCount = await processor();
    await recordWorkerPollSuccess(WORKER_INSTANCE_ID, claimedCount).catch((error) => {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Could not persist successful-poll diagnostics');
    });
    return 'completed';
  } catch (error) {
    const claimFailed = error instanceof ClaimIterationError;
    if (isDatabaseConnectivityError(error)) {
      databaseReady = false;
      databaseRetryCount += 1;
      nextDatabaseRetryAt = Date.now() + boundedBackoffMs(databaseRetryCount);
      await markWorkerDatabaseState(WORKER_INSTANCE_ID, false, error).catch(() => undefined);
    }
    await recordWorkerPollFailure(WORKER_INSTANCE_ID, error, claimFailed).catch((healthError) => {
      logger.warn({ error: healthError instanceof Error ? healthError.message : String(healthError) }, 'Could not persist failed-poll diagnostics');
    });
    logger.error({ error: error instanceof Error ? error.message : String(error), claimFailed }, 'Newsletter Worker polling iteration failed; next poll remains scheduled');
    return 'failed';
  } finally {
    isRunning = false;
  }
}

export function stopNewsletterWorker(): void {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

/** Stops scheduling new ticks; an in-flight tick is left to finish on its own. */
export function requestShutdown(): void {
  shutdownRequested = true;
  stopNewsletterWorker();
}

/** Polls isRunning until the in-flight tick (if any) finishes or timeoutMs elapses. Returns false on timeout. */
export async function waitForActiveProcessingToFinish(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (isRunning && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !isRunning;
}

export function getWorkerHealth() {
  return {
    worker_instance_id: WORKER_INSTANCE_ID,
    status: workerTimer && !shutdownRequested ? 'running' : 'stopped',
    last_successful_claim: lastSuccessfulClaim?.toISOString() ?? null,
    last_successful_send: lastSuccessfulSend?.toISOString() ?? null,
    database_ready: databaseReady,
    smtp_ready: smtpReady
  };
}
export { WORKER_INSTANCE_ID };
export function calculateRetryDelaySeconds(attemptCount: number, baseDelaySeconds = RETRY_BASE_DELAY_SECONDS): number { return baseDelaySeconds * Math.pow(2, attemptCount - 1); }
export function isPermanentFailure(attemptCount: number, maximumAttempts = MAX_ATTEMPTS): boolean { return attemptCount >= maximumAttempts; }
export { claimDeliveries, sendDelivery, processDeliveryBatch, processDeliveries, reconcileAffectedCampaigns, runReconciliationSweep };
