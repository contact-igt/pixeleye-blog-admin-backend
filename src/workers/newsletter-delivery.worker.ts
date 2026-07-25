import { CronJob } from 'cron';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { logger } from '../config/logger.js';
import { NewsletterDelivery } from '../modules/newsletters/newsletter-delivery.model.js';
import { NewsletterSubscriber } from '../modules/newsletters/newsletter-subscriber.model.js';
import { NewsletterCampaign } from '../modules/newsletters/newsletter-campaign.model.js';
import { BlogVersion } from '../modules/blogs/blog-version.model.js';
import { createMailTransporter, isMailConfigured } from '../services/integrations/mail.service.js';
import { generateCampaignEmail } from '../modules/newsletters/email-templates.js';

const BATCH_SIZE = parseInt(process.env.NEWSLETTER_WORKER_BATCH_SIZE || '50', 10);
const WORKER_INTERVAL_SECONDS = parseInt(process.env.NEWSLETTER_WORKER_INTERVAL_SECONDS || '10', 10);
const MAX_RETRIES = parseInt(process.env.NEWSLETTER_MAX_RETRIES || '3', 10);
const RETRY_BASE_DELAY_SECONDS = parseInt(process.env.NEWSLETTER_RETRY_BASE_DELAY_SECONDS || '300', 10); // 5 minutes
const STALE_DELIVERY_MINUTES = parseInt(process.env.NEWSLETTER_STALE_DELIVERY_MINUTES || '30', 10);
const WORKER_CONCURRENCY = parseInt(process.env.NEWSLETTER_WORKER_CONCURRENCY || '5', 10);

let workerJob: CronJob | null = null;
let isRunning = false;
let shutdownRequested = false;

async function claimDeliveries(): Promise<any[]> {
  const staleThreshold = new Date(Date.now() - STALE_DELIVERY_MINUTES * 60 * 1000);

  const deliveries = await sequelize.query(
    `SELECT id, campaign_id, subscriber_id, attempt_count, next_attempt_at, processing_started_at
     FROM newsletter_deliveries
     WHERE status = 'pending'
       OR (status = 'retry_pending' AND next_attempt_at <= NOW())
       OR (status = 'processing' AND processing_started_at < :staleThreshold)
     ORDER BY created_at ASC
     LIMIT :batchSize
     FOR UPDATE SKIP LOCKED`,
    {
      replacements: { staleThreshold, batchSize: BATCH_SIZE },
      type: QueryTypes.SELECT,
      raw: true
    }
  );

  if (deliveries.length === 0) return [];

  // Mark as processing
  const deliveryIds = (deliveries as any[]).map((d) => d.id);
  await NewsletterDelivery.update(
    {
      status: 'processing' as any,
      processingStartedAt: new Date()
    },
    {
      where: { id: { [Op.in]: deliveryIds } }
    }
  );

  return deliveries;
}

async function sendDelivery(delivery: any): Promise<{ success: boolean; error?: string }> {
  try {
    const subscriber = await NewsletterSubscriber.findByPk(delivery.subscriber_id);
    if (!subscriber) {
      return { success: false, error: 'Subscriber not found' };
    }

    const subscriberStatus = subscriber.get('status');
    if (subscriberStatus !== 'subscribed') {
      return { success: false, error: `Subscriber status is ${subscriberStatus}` };
    }

    const campaign = await NewsletterCampaign.findByPk(delivery.campaign_id, {
      include: [{ model: BlogVersion, as: 'blogVersion' }]
    });

    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    const campaignData = (campaign.get() as any);
    const blogVersionData = campaignData.blogVersion;

    const unsubscribeToken = subscriber.get('unsubscribeTokenHash');
    const unsubscribeUrl = unsubscribeToken
      ? `${process.env.PUBLIC_WEBSITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
      : '#';

    const emailTemplate = generateCampaignEmail({
      blogTitle: blogVersionData.title,
      blogExcerpt: blogVersionData.excerpt || '',
      blogSlug: campaignData.blog?.slug || '',
      blogUrl: `${process.env.PUBLIC_WEBSITE_URL}/blog/${campaignData.blog?.slug || ''}`,
      featuredImageUrl: undefined,
      unsubscribeUrl,
      isTest: false
    });

    const transporter = createMailTransporter();
    await transporter.sendMail({
      from: process.env.MAIL_FROM_EMAIL,
      to: subscriber.get('email'),
      subject: emailTemplate.subject,
      html: emailTemplate.htmlBody,
      text: emailTemplate.textBody
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ deliveryId: delivery.id, error: message }, 'Failed to send delivery');
    return { success: false, error: message };
  }
}

async function processDeliveryBatch(deliveries: any[]): Promise<void> {
  const results = await Promise.allSettled(
    deliveries.map(async (delivery) => {
      if (shutdownRequested) return;

      const result = await sendDelivery(delivery);

      if (result.success) {
        await NewsletterDelivery.update(
          {
            status: 'sent' as any,
            sentAt: new Date(),
            processingStartedAt: null
          },
          { where: { id: delivery.id } }
        );

        // Update campaign sent count
        await sequelize.query(
          `UPDATE newsletter_campaigns
           SET sent_count = sent_count + 1
           WHERE id = :campaignId`,
          { replacements: { campaignId: delivery.campaign_id }, type: QueryTypes.UPDATE }
        );
      } else {
        const attemptCount = (delivery.attempt_count || 0) + 1;

        if (attemptCount >= MAX_RETRIES) {
          await NewsletterDelivery.update(
            {
              status: 'failed' as any,
              attemptCount,
              failureReason: result.error,
              processingStartedAt: null
            },
            { where: { id: delivery.id } }
          );

          // Update campaign failed count
          await sequelize.query(
            `UPDATE newsletter_campaigns
             SET failed_count = failed_count + 1
             WHERE id = :campaignId`,
            { replacements: { campaignId: delivery.campaign_id }, type: QueryTypes.UPDATE }
          );
        } else {
          // Exponential backoff: delay = base * 2^(attempt_count - 1)
          const delaySeconds = RETRY_BASE_DELAY_SECONDS * Math.pow(2, attemptCount - 1);
          const nextAttempt = new Date(Date.now() + delaySeconds * 1000);

          await NewsletterDelivery.update(
            {
              status: 'retry_pending' as any,
              attemptCount,
              nextAttemptAt: nextAttempt,
              failureReason: result.error,
              processingStartedAt: null
            },
            { where: { id: delivery.id } }
          );
        }
      }
    })
  );

  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      logger.error(
        { error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
        `Delivery processing failed at index ${idx}`
      );
    }
  });
}

async function processDeliveries(): Promise<void> {
  if (!isMailConfigured()) {
    logger.warn('SMTP not configured, skipping delivery processing');
    return;
  }

  try {
    const deliveries = await claimDeliveries();

    if (deliveries.length === 0) return;

    // Process in bounded concurrency batches
    for (let i = 0; i < deliveries.length; i += WORKER_CONCURRENCY) {
      if (shutdownRequested) break;

      const batch = deliveries.slice(i, i + WORKER_CONCURRENCY);
      await processDeliveryBatch(batch);
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Worker processing failed'
    );
  }
}

function handleShutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received');
  shutdownRequested = true;

  const timeout = setTimeout(() => {
    logger.warn('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000);

  const checkExit = setInterval(() => {
    if (!isRunning) {
      clearTimeout(timeout);
      clearInterval(checkExit);
      logger.info('Newsletter worker stopped');
      process.exit(0);
    }
  }, 100);
}

export function startNewsletterWorker(): void {
  if (!isMailConfigured()) {
    logger.warn('SMTP not configured, newsletter worker will not start');
    return;
  }

  logger.info({ interval: WORKER_INTERVAL_SECONDS }, 'Starting newsletter worker');

  workerJob = new CronJob(
    `*/${WORKER_INTERVAL_SECONDS} * * * * *`,
    async () => {
      if (isRunning || shutdownRequested) return;

      isRunning = true;
      try {
        await processDeliveries();
      } finally {
        isRunning = false;

        if (shutdownRequested) {
          workerJob?.stop();
          handleShutdown('manual');
        }
      }
    }
  );

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  workerJob.start();
}

export function stopNewsletterWorker(): void {
  if (workerJob) {
    workerJob.stop();
    workerJob = null;
  }
}
