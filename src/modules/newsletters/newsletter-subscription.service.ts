import { createHash, randomBytes } from 'crypto';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { ApiError } from '../../utils/api-error.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';
import { reconcileCampaignState } from './newsletter-campaign.service.js';
import { createMailTransporter, isMailConfigured } from '../../services/integrations/mail.service.js';
import { generateResubscriptionEmail, generateVerificationEmail } from './email-templates.js';
import { writeNewsletterAuditSafely } from './newsletter-audit.service.js';
import { newsletterError, newsletterErrorCodes } from './newsletter-errors.js';
import { logger } from '../../config/logger.js';
import { createUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.service.js';

const NEWSLETTER_VERIFICATION_TTL_HOURS = parseInt(process.env.NEWSLETTER_VERIFICATION_TOKEN_TTL_HOURS || '24', 10);
const NEWSLETTER_RESEND_COOLDOWN_MINUTES = parseInt(process.env.NEWSLETTER_VERIFICATION_RESEND_COOLDOWN_MINUTES || '5', 10);
const PUBLIC_WEBSITE_URL = process.env.PUBLIC_WEBSITE_URL || 'https://pixeleye.in';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  // Uses the same validated env.NEWSLETTER_HASH_SECRET as
  // unsubscribe-token.service.ts (no separate hardcoded fallback) so the API
  // and the Worker are always signing/verifying with one shared secret.
  return createHash('sha256')
    .update(token + env.NEWSLETTER_HASH_SECRET)
    .digest('hex');
}

async function sendVerificationEmail(subscriber: any, verificationToken: string): Promise<void> {
  if (!isMailConfigured()) {
    logger.warn('SMTP not configured, cannot send verification email');
    throw new ApiError(503, 'Email service is temporarily unavailable');
  }

  const email = subscriber.get('email');
  const verificationUrl = `${PUBLIC_WEBSITE_URL}/newsletter/verify?token=${encodeURIComponent(verificationToken)}`;
  const emailTemplate = generateVerificationEmail(verificationUrl, email);

  const transporter = createMailTransporter();

  try {
    const result = await transporter.sendMail({
      from: process.env.MAIL_FROM_EMAIL,
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.htmlBody,
      text: emailTemplate.textBody
    });

    logger.info({ messageId: result.messageId, email }, 'Verification email sent');
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), email },
      'Failed to send verification email'
    );
    throw new ApiError(503, 'Failed to send verification email');
  }
}

async function sendResubscriptionEmail(subscriber: any, token: string): Promise<void> {
  if (!isMailConfigured()) throw new ApiError(503, 'Email service is temporarily unavailable');
  const email = subscriber.get('email');
  const url = `${PUBLIC_WEBSITE_URL}/newsletter/resubscribe?token=${encodeURIComponent(token)}`;
  const template = generateResubscriptionEmail(url, email);
  await createMailTransporter().sendMail({ from: process.env.MAIL_FROM_EMAIL, to: email, subject: template.subject, html: template.htmlBody, text: template.textBody });
}

export interface SubscribeRequest {
  email: string;
  source?: string;
  consent: boolean;
  consent_version?: string;
  consent_text?: string;
}

export interface SubscribeResponse {
  success: boolean;
  message: string;
}

export async function subscribeEmailWithEmailDelivery(
  request: SubscribeRequest,
  transaction?: Transaction
): Promise<SubscribeResponse> {
  if (!request.consent) {
    throw new ApiError(422, 'Consent is required');
  }

  const email = request.email?.trim();
  if (!email) {
    throw new ApiError(422, 'Email is required');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(422, 'Invalid email format');
  }

  const normalizedEmail = normalizeEmail(email);

  return sequelize.transaction({ transaction }, async (t) => {
    // Find or create subscriber
    let subscriber = await NewsletterSubscriber.findOne({
      where: { normalizedEmail },
      transaction: t
    });

    if (subscriber) {
      const subscriberData = subscriber.get({ plain: true }) as any;

      // If already subscribed, return success without sending verification
      if (subscriberData.status === 'subscribed') {
        return {
          success: true,
          message: 'Check your inbox to confirm your subscription.'
        };
      }

      // If pending, check cooldown for resending verification
      if (subscriberData.status === 'pending') {
        const lastSent = subscriberData.lastVerificationSentAt;
        if (lastSent) {
          const minutesSinceLastSent = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60);
          if (minutesSinceLastSent < NEWSLETTER_RESEND_COOLDOWN_MINUTES) {
            return {
              success: true,
              message: 'Check your inbox to confirm your subscription.'
            };
          }
        }

        // Generate new token and update subscriber
        const verificationToken = generateToken();
        const verificationTokenHash = hashToken(verificationToken);
        const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

        await subscriber.update({
          verificationTokenHash,
          verificationExpiresAt: expiresAt,
          lastVerificationSentAt: new Date()
        }, { transaction: t });

        // Send verification email
        await sendVerificationEmail(subscriber, verificationToken);

        return {
          success: true,
          message: 'Check your inbox to confirm your subscription.'
        };
      }

      // If unsubscribed, allow re-subscription
      if (subscriberData.status === 'unsubscribed') {
        const lastRequest = subscriberData.resubscriptionRequestedAt;
        if (lastRequest && Date.now() - new Date(lastRequest).getTime() < NEWSLETTER_RESEND_COOLDOWN_MINUTES * 60_000) {
          return { success: true, message: 'Check your inbox to confirm your subscription request.' };
        }
        const verificationToken = generateToken();
        const verificationTokenHash = hashToken(verificationToken);
        const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

        await subscriber.update({
          resubscriptionTokenHash: verificationTokenHash,
          resubscriptionExpiresAt: expiresAt,
          resubscriptionRequestedAt: new Date()
        }, { transaction: t });

        await sendResubscriptionEmail(subscriber, verificationToken);

        return {
          success: true,
          message: 'Check your inbox to confirm your subscription.'
        };
      }
    }

    // Create new subscriber
    const verificationToken = generateToken();
    const verificationTokenHash = hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

    subscriber = await NewsletterSubscriber.create({
      email,
      normalizedEmail,
      status: 'pending',
      verificationTokenHash,
      verificationExpiresAt: expiresAt,
      source: request.source || 'website',
      consentText: request.consent_text || null,
      consentVersion: request.consent_version || 'v1',
      consentAt: new Date(),
      verificationSentAt: new Date(),
      lastVerificationSentAt: new Date()
    }, { transaction: t });

    // The unsubscribe token is a deterministic function of the subscriber's own ID, so it
    // can only be derived once the row (and its auto-increment ID) exists.
    await subscriber.update({
      unsubscribeTokenHash: hashToken(createUnsubscribeToken(subscriber.id))
    }, { transaction: t });

    // Send verification email
    await sendVerificationEmail(subscriber, verificationToken);

    return {
      success: true,
      message: 'Check your inbox to confirm your subscription.'
    };
  });
}

export async function verifyEmailAddress(
  token: string,
  transaction?: Transaction
): Promise<{ success: boolean; message: string; email?: string }> {
  if (!token) {
    throw new ApiError(422, 'Verification token is required');
  }

  return sequelize.transaction({ transaction }, async (t) => {
    const tokenHash = hashToken(token);

    const subscriber = await NewsletterSubscriber.findOne({
      where: {
        status: 'pending',
        verificationTokenHash: tokenHash,
        verificationExpiresAt: { [Op.gt]: new Date() }
      },
      transaction: t
    });

    if (!subscriber) {
      throw new ApiError(404, 'Verification link is invalid or expired');
    }

    await subscriber.update({
      status: 'subscribed',
      verifiedAt: new Date(),
      subscribedAt: new Date(),
      verificationTokenHash: null,
      verificationExpiresAt: null
    }, { transaction: t });

    return {
      success: true,
      message: 'Thank you! You are now subscribed to our newsletter.',
      email: subscriber.get('email')
    };
  });
}

export async function requestSubscriberResubscription(
  subscriberId: string,
  adminUserId?: string | null,
  transaction?: Transaction
): Promise<{ subscriber: NewsletterSubscriber; emailSent: boolean }> {
  let subscriber!: NewsletterSubscriber;
  let token = '';
  await sequelize.transaction({ transaction }, async (t) => {
    const foundSubscriber = await NewsletterSubscriber.findByPk(subscriberId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!foundSubscriber) throw newsletterError(404, 'Subscriber not found', newsletterErrorCodes.SUBSCRIBER_NOT_FOUND);
    subscriber = foundSubscriber;
    if (subscriber.get('status') !== 'unsubscribed' || subscriber.get('deletedAt')) {
      throw newsletterError(409, 'Only unsubscribed subscribers can receive a resubscription request.', newsletterErrorCodes.SUBSCRIBER_INVALID_STATUS);
    }
    const lastRequest = subscriber.get('resubscriptionRequestedAt');
    if (lastRequest && Date.now() - new Date(lastRequest).getTime() < NEWSLETTER_RESEND_COOLDOWN_MINUTES * 60_000) {
      throw newsletterError(429, 'Please wait before sending another resubscription request.', newsletterErrorCodes.SUBSCRIBER_RESUBSCRIPTION_COOLDOWN);
    }
    token = generateToken();
    await subscriber.update({
      resubscriptionTokenHash: hashToken(token),
      resubscriptionExpiresAt: new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 3_600_000),
      resubscriptionRequestedAt: new Date()
    }, { transaction: t });
    await writeNewsletterAuditSafely({ action: 'NEWSLETTER_RESUBSCRIPTION_REQUESTED', adminUserId: adminUserId ?? null, metadata: { subscriber_id: subscriberId } }, t);
  });
  await sendResubscriptionEmail(subscriber, token);
  return { subscriber, emailSent: true };
}

export async function confirmSubscriberResubscription(token: string, transaction?: Transaction): Promise<{ success: boolean; message: string; email: string }> {
  if (!token) throw new ApiError(422, 'Resubscription token is required');
  return sequelize.transaction({ transaction }, async (t) => {
    const subscriber = await NewsletterSubscriber.findOne({
      where: { status: 'unsubscribed', deletedAt: null, resubscriptionTokenHash: hashToken(token), resubscriptionExpiresAt: { [Op.gt]: new Date() } },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!subscriber) throw new ApiError(404, 'Resubscription link is invalid, expired, or already used');
    const now = new Date();
    await subscriber.update({
      status: 'subscribed', subscribedAt: now, verifiedAt: now, unsubscribedAt: null,
      resubscriptionTokenHash: null, resubscriptionExpiresAt: null,
      consentAt: now, consentVersion: 'resubscription-v1'
    }, { transaction: t });
    await writeNewsletterAuditSafely({ action: 'NEWSLETTER_RESUBSCRIPTION_CONFIRMED', adminUserId: null, metadata: { subscriber_id: String(subscriber.id) } }, t);
    return { success: true, message: 'Your new newsletter subscription is confirmed.', email: subscriber.get('email') };
  });
}

export async function unsubscribeEmailAddress(
  token: string,
  transaction?: Transaction
): Promise<{ success: boolean; message: string }> {
  if (!token) {
    throw new ApiError(422, 'Unsubscribe token is required');
  }

  const { subscriberId } = verifyUnsubscribeToken(token);

  return sequelize.transaction({ transaction }, async (t) => {
    const subscriber = await NewsletterSubscriber.findOne({
      where: { id: subscriberId, deletedAt: null },
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!subscriber) {
      throw new ApiError(404, 'Unsubscribe link is invalid');
    }

    await subscriber.update({
      status: 'unsubscribed',
      unsubscribedAt: subscriber.get('unsubscribedAt') ?? new Date()
    }, { transaction: t });

    const cancellableDeliveries = await NewsletterDelivery.findAll({
      where: {
        subscriberId,
        status: { [Op.in]: ['pending', 'retry_pending'] }
      },
      attributes: ['campaignId'],
      raw: true,
      transaction: t
    }) as unknown as Array<{ campaignId: string }>;

    if (cancellableDeliveries.length > 0) {
      await NewsletterDelivery.update(
        {
          status: 'cancelled',
          failureReason: 'Subscriber unsubscribed before delivery'
        },
        {
          where: {
            subscriberId,
            status: { [Op.in]: ['pending', 'retry_pending'] }
          },
          transaction: t
        }
      );

      const campaignIds = [...new Set(cancellableDeliveries.map((delivery) => String(delivery.campaignId)))].sort();
      for (const campaignId of campaignIds) {
        await reconcileCampaignState(campaignId, { transaction: t });
      }
    }

    return {
      success: true,
      message: 'You have been unsubscribed from our newsletter.'
    };
  });
}

export { NewsletterSubscriber, hashToken, generateToken, normalizeEmail };
export { createUnsubscribeToken } from './unsubscribe-token.service.js';
