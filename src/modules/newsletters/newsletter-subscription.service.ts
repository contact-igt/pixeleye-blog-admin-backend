import { createHash, randomBytes } from 'crypto';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { createMailTransporter, isMailConfigured } from '../../services/integrations/mail.service.js';
import { generateVerificationEmail } from './email-templates.js';
import { logger } from '../../config/logger.js';

const NEWSLETTER_VERIFICATION_TTL_HOURS = parseInt(process.env.NEWSLETTER_VERIFICATION_TOKEN_TTL_HOURS || '24', 10);
const NEWSLETTER_RESEND_COOLDOWN_MINUTES = parseInt(process.env.NEWSLETTER_VERIFICATION_RESEND_COOLDOWN_MINUTES || '5', 10);
const NEWSLETTER_HASH_SECRET = process.env.NEWSLETTER_HASH_SECRET || 'default-newsletter-secret-change-in-prod';
const PUBLIC_WEBSITE_URL = process.env.PUBLIC_WEBSITE_URL || 'https://pixeleye.in';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256')
    .update(token + NEWSLETTER_HASH_SECRET)
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
        const verificationToken = generateToken();
        const verificationTokenHash = hashToken(verificationToken);
        const unsubscribeToken = generateToken();
        const unsubscribeTokenHash = hashToken(unsubscribeToken);
        const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

        await subscriber.update({
          status: 'pending',
          verificationTokenHash,
          verificationExpiresAt: expiresAt,
          unsubscribeTokenHash,
          unsubscribedAt: null,
          consentText: request.consent_text || null,
          consentVersion: request.consent_version || 'v1',
          consentAt: new Date(),
          verificationSentAt: new Date(),
          lastVerificationSentAt: new Date()
        }, { transaction: t });

        // Send verification email
        await sendVerificationEmail(subscriber, verificationToken);

        return {
          success: true,
          message: 'Check your inbox to confirm your subscription.'
        };
      }
    }

    // Create new subscriber
    const verificationToken = generateToken();
    const verificationTokenHash = hashToken(verificationToken);
    const unsubscribeToken = generateToken();
    const unsubscribeTokenHash = hashToken(unsubscribeToken);
    const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

    subscriber = await NewsletterSubscriber.create({
      email,
      normalizedEmail,
      status: 'pending',
      verificationTokenHash,
      verificationExpiresAt: expiresAt,
      unsubscribeTokenHash,
      source: request.source || 'website',
      consentText: request.consent_text || null,
      consentVersion: request.consent_version || 'v1',
      consentAt: new Date(),
      verificationSentAt: new Date(),
      lastVerificationSentAt: new Date()
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

export async function unsubscribeEmailAddress(
  token: string,
  transaction?: Transaction
): Promise<{ success: boolean; message: string }> {
  if (!token) {
    throw new ApiError(422, 'Unsubscribe token is required');
  }

  return sequelize.transaction({ transaction }, async (t) => {
    const tokenHash = hashToken(token);

    const subscriber = await NewsletterSubscriber.findOne({
      where: { unsubscribeTokenHash: tokenHash },
      transaction: t
    });

    if (!subscriber) {
      throw new ApiError(404, 'Unsubscribe link is invalid');
    }

    await subscriber.update({
      status: 'unsubscribed',
      unsubscribedAt: new Date()
    }, { transaction: t });

    return {
      success: true,
      message: 'You have been unsubscribed from our newsletter.'
    };
  });
}

export { NewsletterSubscriber, hashToken, generateToken, normalizeEmail };
