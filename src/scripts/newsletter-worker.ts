import { createApp } from '../app.js';
import { authenticateDatabase } from '../config/database.js';
import { sequelize } from '../config/database.js';
import { NewsletterDelivery } from '../modules/newsletters/newsletter-delivery.model.js';
import { NewsletterCampaign } from '../modules/newsletters/newsletter-campaign.model.js';
import { NewsletterSubscriber } from '../modules/newsletters/newsletter-subscriber.model.js';
import { createMailTransporter, isMailConfigured } from '../services/integrations/mail.service.js';
import { BlogVersion } from '../modules/blogs/blog-version.model.js';
import { Op } from 'sequelize';
import { logger } from '../config/logger.js';

const BATCH_SIZE = parseInt(process.env.NEWSLETTER_WORKER_BATCH_SIZE || '50', 10);
const CONCURRENCY = parseInt(process.env.NEWSLETTER_WORKER_CONCURRENCY || '5', 10);
const MAX_ATTEMPTS = parseInt(process.env.NEWSLETTER_MAX_ATTEMPTS || '3', 10);
const RETRY_BASE_DELAY = parseInt(process.env.NEWSLETTER_RETRY_BASE_DELAY_SECONDS || '60', 10);

async function sendEmail(delivery: any, subscriber: any, campaign: any, version: any): Promise<boolean> {
  try {
    if (!isMailConfigured()) {
      throw new Error('Mail not configured');
    }

    const transporter = createMailTransporter();
    const campaignData = campaign.get?.({ plain: true }) || campaign;
    const versionData = version.get?.({ plain: true }) || version;
    const subscriberData = subscriber.get?.({ plain: true }) || subscriber;

    const subject = campaignData.subject || campaign.subject;
    const blogTitle = versionData.title || version.title;
    const unsubscribeToken = subscriberData.unsubscribeTokenHash || subscriber.unsubscribeTokenHash || 'test-token';
    const recipientEmail = subscriberData.email || subscriber.email;

    // Generate email content
    const htmlContent = `
      <h2>${blogTitle}</h2>
      <p>${version.get('excerpt') || ''}</p>
      <p><a href="${process.env.PUBLIC_WEBSITE_URL}/blog/${campaign.get('blogSlug')}">Read the full article</a></p>
      <hr />
      <p><a href="${process.env.PUBLIC_WEBSITE_URL}/newsletter/unsubscribe?token=${unsubscribeToken}">Unsubscribe</a></p>
    `;

    const textContent = `
${blogTitle}
${version.get('excerpt') || ''}
Read: ${process.env.PUBLIC_WEBSITE_URL}/blog/${campaign.get('blogSlug')}
Unsubscribe: ${process.env.PUBLIC_WEBSITE_URL}/newsletter/unsubscribe?token=${unsubscribeToken}
    `.trim();

    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM_EMAIL,
      to: recipientEmail,
      subject,
      html: htmlContent,
      text: textContent
    });

    logger.info({ messageId: result.messageId, email: recipientEmail }, 'Email sent');
    return true;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), email: subscriber.get('email') },
      'Email send failed'
    );
    return false;
  }
}

async function processDeliveries(): Promise<void> {
  try {
    // Initialize app to setup models and associations
    createApp();
    await authenticateDatabase();

    logger.info('Newsletter worker started');

    // Get pending deliveries
    const deliveries = (await NewsletterDelivery.findAll({
      where: {
        status: { [Op.in]: ['pending', 'retry_pending'] },
        [Op.or]: [
          { nextAttemptAt: null },
          { nextAttemptAt: { [Op.lte]: new Date() } }
        ]
      },
      limit: BATCH_SIZE,
      include: [
        { model: NewsletterCampaign, as: 'campaign' },
        { model: NewsletterSubscriber, as: 'subscriber' }
      ]
    })) as any[];

    if (deliveries.length === 0) {
      logger.debug('No deliveries to process');
      return;
    }

    logger.info({ count: deliveries.length }, `Processing ${deliveries.length} deliveries`);

    // Process with concurrency limit
    for (let i = 0; i < deliveries.length; i += CONCURRENCY) {
      const batch = deliveries.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (delivery) => {
          const campaign = delivery.get('campaign');
          const subscriber = delivery.get('subscriber');

          if (!campaign || !subscriber) {
            throw new Error('Missing campaign or subscriber');
          }

          const blogVersion = await BlogVersion.findByPk(campaign.get('blogVersionId'));
          if (!blogVersion) {
            throw new Error('Blog version not found');
          }

          // Try to send
          const success = await sendEmail(delivery, subscriber, campaign, blogVersion);

          if (success) {
            const deliveryData = delivery.get?.({ plain: true }) || delivery;
            await delivery.update({
              status: 'sent',
              sentAt: new Date(),
              attemptCount: (deliveryData.attemptCount || 0) + 1
            });

            // Update campaign counts
            const campaignData = campaign.get?.({ plain: true }) || campaign;
            const currentSent = campaignData.sentCount || 0;
            await campaign.update({
              sentCount: currentSent + 1
            });
          } else {
            const deliveryData = delivery.get?.({ plain: true }) || delivery;
            const attemptCount = (deliveryData.attemptCount || 0) + 1;

            if (attemptCount >= MAX_ATTEMPTS) {
              await delivery.update({
                status: 'failed',
                failedAt: new Date(),
                attemptCount,
                lastErrorMessage: 'Max retries reached'
              });

              const campaignData = campaign.get?.({ plain: true }) || campaign;
              const currentFailed = campaignData.failedCount || 0;
              await campaign.update({
                failedCount: currentFailed + 1
              });
            } else {
              const nextAttempt = new Date(Date.now() + RETRY_BASE_DELAY * 1000 * Math.pow(2, attemptCount));
              await delivery.update({
                status: 'retry_pending',
                attemptCount,
                nextAttemptAt: nextAttempt,
                lastErrorMessage: 'Retry scheduled'
              });
            }
          }
        })
      );

      // Log any errors
      results.forEach((result, idx) => {
        if (result.status === 'rejected') {
          logger.error(
            { error: result.reason instanceof Error ? result.reason.message : String(result.reason) },
            `Delivery processing failed at index ${i + idx}`
          );
        }
      });
    }

    logger.info('Newsletter worker batch complete');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Newsletter worker error'
    );
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

processDeliveries().catch((error) => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'Unhandled worker error');
  process.exit(1);
});
