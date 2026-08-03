import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';
import { reconcileCampaignState } from './newsletter-campaign.service.js';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';
import { generateToken, hashToken, normalizeEmail, requestSubscriberResubscription } from './newsletter-subscription.service.js';
import { createUnsubscribeToken } from './unsubscribe-token.service.js';
import { createMailTransporter, isMailConfigured } from '../../services/integrations/mail.service.js';
import { generateSmtpDiagnosticEmail, generateVerificationEmail } from './email-templates.js';
import { logger } from '../../config/logger.js';
import { sequelize } from '../../config/database.js';
import { z } from 'zod';
import { Op } from 'sequelize';
import { newsletterError, newsletterErrorCodes } from './newsletter-errors.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['pending', 'subscribed', 'unsubscribed']).optional(),
  source: z.string().optional(),
  sort: z.enum(['email', 'status', 'created_at', 'verified_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
}).strict();

const createSubscriberSchema = z.object({
  email: z.string().email('Invalid email format'),
  source: z.string().max(100).default('admin_manual'),
  consent_note: z.string().max(500).optional()
}).strict();

const NEWSLETTER_VERIFICATION_TTL_HOURS = parseInt(process.env.NEWSLETTER_VERIFICATION_TOKEN_TTL_HOURS || '24', 10);
const NEWSLETTER_RESEND_COOLDOWN_MINUTES = parseInt(process.env.NEWSLETTER_VERIFICATION_RESEND_COOLDOWN_MINUTES || '5', 10);
const PUBLIC_WEBSITE_URL = process.env.PUBLIC_WEBSITE_URL || 'https://pixeleye.in';
type SubscriberListQuery = z.infer<typeof listQuerySchema>;
type CsvCellValue = string | number | boolean | Date | null | undefined;
type SubscriberExportRecord = {
  email: string;
  status: string;
  source: string | null;
  consentVersion: string | null;
  consentAt: string | Date | null;
  verificationSentAt: string | Date | null;
  verifiedAt: string | Date | null;
  unsubscribedAt: string | Date | null;
  createdAt: string | Date;
};

function requireAuthenticatedAdmin(request: Request): NonNullable<Request['authenticatedAdmin']> {
  if (!request.authenticatedAdmin) {
    throw new ApiError(401, 'Authentication is required');
  }

  return request.authenticatedAdmin;
}

function buildSubscriberFilters(query: SubscriberListQuery): Record<string, unknown> {
  const where: Record<string, unknown> = { deletedAt: null };
  const search = query.search?.trim();
  const source = query.source?.trim();

  if (search) {
    const escapedSearch = search.replace(/[\\%_]/g, (character) => '\\' + character);
    where.email = {
      [Op.like]: '%' + escapedSearch + '%'
    };
  }
  if (query.status) {
    where.status = query.status;
  }
  if (source) {
    where.source = source;
  }

  return where;
}

function buildSubscriberExportFilename(date = new Date()): string {
  return 'subscribers_' + date.toISOString().split('T')[0] + '.csv';
}

function encodeCsvCell(value: CsvCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  let normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'string'
        ? value
        : String(value);

  if (typeof value === 'string' && /^[=+@\t\r-]/.test(normalized)) {
    normalized = "'" + normalized;
  }

  if (/[",\n\r]/.test(normalized)) {
    return '"' + normalized.replace(/"/g, '""') + '"';
  }

  return normalized;
}

function serializeSubscriber(subscriber: any) {
  const data = typeof subscriber.get === 'function' ? subscriber.get({ plain: true }) : subscriber;
  return {
    id: String(data.id),
    email: data.email,
    status: data.status,
    source: data.source || null,
    consent_text: data.consentText || null,
    consent_version: data.consentVersion || null,
    consent_at: data.consentAt ? new Date(data.consentAt).toISOString() : null,
    verification_sent_at: data.verificationSentAt ? new Date(data.verificationSentAt).toISOString() : null,
    verified_at: data.verifiedAt ? new Date(data.verifiedAt).toISOString() : null,
    unsubscribed_at: data.unsubscribedAt ? new Date(data.unsubscribedAt).toISOString() : null,
    resubscription_requested_at: data.resubscriptionRequestedAt ? new Date(data.resubscriptionRequestedAt).toISOString() : null,
    created_at: new Date(data.createdAt).toISOString(),
    updated_at: new Date(data.updatedAt).toISOString()
  };
}

async function sendVerificationEmailToSubscriber(subscriber: any, verificationToken: string): Promise<void> {
  if (!isMailConfigured()) {
    logger.warn('SMTP not configured, cannot send verification email');
    throw new ApiError(503, 'Email service is temporarily unavailable');
  }

  const email = subscriber.get('email');
  const verificationUrl = `${PUBLIC_WEBSITE_URL}/newsletter/verify?token=${encodeURIComponent(verificationToken)}`;
  const emailTemplate = generateVerificationEmail(verificationUrl, email);

  const transporter = createMailTransporter();

  try {
    const fromAddress = process.env.MAIL_FROM_NAME && process.env.MAIL_FROM_NAME !== 'Pixel Eye Hospitals'
      ? `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_EMAIL}>`
      : `Pixel Eye Blog <${process.env.MAIL_FROM_EMAIL}>`;

    const result = await transporter.sendMail({
      from: fromAddress,
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

export function createAdminSubscriberController() {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try {
        const query = listQuerySchema.parse(request.query);

        const where = buildSubscriberFilters(query);

        const sortField =
          query.sort === 'email'
            ? 'email'
            : query.sort === 'status'
              ? 'status'
              : query.sort === 'verified_at'
                ? 'verifiedAt'
                : 'createdAt';

        const result = await NewsletterSubscriber.findAndCountAll({
          where,
          attributes: [
            'id',
            'email',
            'status',
            'source',
            'consentText',
            'consentVersion',
            'consentAt',
            'verificationSentAt',
            'verifiedAt',
            'unsubscribedAt',
            'createdAt',
            'updatedAt'
          ],
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
          order: [[sortField, query.order.toUpperCase()]],
          subQuery: false
        });

        const totalPages = Math.ceil(result.count / query.limit);

        return sendSuccess(response, 'Subscribers fetched', {
          items: result.rows.map((sub) => serializeSubscriber(sub)),
          pagination: {
            page: query.page,
            limit: query.limit,
            total_items: result.count,
            total_pages: totalPages,
            has_next_page: query.page < totalPages,
            has_previous_page: query.page > 1
          }
        });
      } catch (error) {
        next(error);
      }
    },

    async stats(request: Request, response: Response, next: NextFunction) {
      try {
        const total = await NewsletterSubscriber.count();
        const subscribed = await NewsletterSubscriber.count({ where: { status: 'subscribed' } });
        const pending = await NewsletterSubscriber.count({ where: { status: 'pending' } });
        const unsubscribed = await NewsletterSubscriber.count({ where: { status: 'unsubscribed' } });

        return sendSuccess(response, 'Subscriber stats fetched', {
          total_subscribers: total,
          subscribed,
          pending,
          unsubscribed
        });
      } catch (error) {
        next(error);
      }
    },

    async getDetail(request: Request, response: Response, next: NextFunction) {
      try {
        const subscriberId = String(request.params.id ?? '').trim();
        if (!subscriberId || !/^\d+$/.test(subscriberId)) {
          throw new ApiError(400, 'Invalid subscriber ID');
        }

        const subscriber = await NewsletterSubscriber.findByPk(subscriberId, {
          attributes: [
            'id',
            'email',
            'status',
            'source',
            'consentText',
            'consentVersion',
            'consentAt',
            'verificationSentAt',
            'verifiedAt',
            'unsubscribedAt',
            'createdAt',
            'updatedAt'
          ]
        });

        if (!subscriber) {
          throw new ApiError(404, 'Subscriber not found');
        }

        return sendSuccess(response, 'Subscriber fetched', serializeSubscriber(subscriber));
      } catch (error) {
        next(error);
      }
    },

    async exportCsv(request: Request, response: Response, next: NextFunction) {
      try {
        const query = listQuerySchema.parse(request.query);
        const actor = requireAuthenticatedAdmin(request);
        const where = buildSubscriberFilters(query);

        const subscribers = await NewsletterSubscriber.findAll({
          where,
          attributes: [
            'email',
            'status',
            'source',
            'consentVersion',
            'consentAt',
            'verificationSentAt',
            'verifiedAt',
            'unsubscribedAt',
            'createdAt'
          ],
          order: [['createdAt', 'DESC']],
          raw: true
        }) as SubscriberExportRecord[];

        await writeAuthAuditLog({
          action: 'SUBSCRIBER_CSV_EXPORTED',
          adminUserId: actor.id,
          metadata: {
            subscriber_count: subscribers.length,
            filters: {
              search: query.search?.trim() || null,
              status: query.status || null,
              source: query.source?.trim() || null
            }
          }
        });

        const headers = [
          'Email',
          'Status',
          'Source',
          'Consent Version',
          'Consent Date',
          'Verification Sent',
          'Verified Date',
          'Unsubscribed Date',
          'Created Date'
        ];

        const rows = subscribers.map((subscriber) => [
          subscriber.email,
          subscriber.status,
          subscriber.source,
          subscriber.consentVersion,
          subscriber.consentAt,
          subscriber.verificationSentAt,
          subscriber.verifiedAt,
          subscriber.unsubscribedAt,
          subscriber.createdAt
        ]);

        const csv = [headers, ...rows]
          .map((row) => row.map((value) => encodeCsvCell(value)).join(','))
          .join('\r\n');

        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader(
          'Content-Disposition',
          'attachment; filename="' + buildSubscriberExportFilename() + '"'
        );
        response.send(csv);
      } catch (error) {
        next(error);
      }
    },

    async create(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = (request as any).authenticatedAdmin;
        if (!actor) {
          throw new ApiError(401, 'Authentication is required');
        }

        const payload = createSubscriberSchema.parse(request.body);
        const email = payload.email.trim();
        const normalEmail = normalizeEmail(email);

        let subscriber: any;
        let verificationToken: string = '';
        let wasNew = false;

        // TRANSACTION: Save subscriber record only
        await sequelize.transaction(async (transaction) => {
          const existingSubscriber = await NewsletterSubscriber.findOne({
            where: { normalizedEmail: normalEmail },
            transaction
          });

          if (existingSubscriber) {
            const subscriberData = existingSubscriber.get({ plain: true }) as any;

            if (subscriberData.status === 'subscribed') {
              throw new ApiError(409, 'This email is already subscribed.');
            }

            if (subscriberData.status === 'pending') {
              const lastSent = subscriberData.lastVerificationSentAt;
              if (lastSent) {
                const minutesSinceLastSent = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60);
                if (minutesSinceLastSent < NEWSLETTER_RESEND_COOLDOWN_MINUTES) {
                  throw new ApiError(429, `Please wait ${Math.ceil(NEWSLETTER_RESEND_COOLDOWN_MINUTES - minutesSinceLastSent)} minutes before resending.`);
                }
              }

              verificationToken = generateToken();
              const verificationTokenHash = hashToken(verificationToken);
              const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

              await existingSubscriber.update({
                verificationTokenHash,
                verificationExpiresAt: expiresAt,
                lastVerificationSentAt: new Date(),
                source: payload.source
              }, { transaction });

              subscriber = existingSubscriber;
            } else if (subscriberData.status === 'unsubscribed') {
              throw newsletterError(409, 'Subscriber previously unsubscribed. Use Send Resubscription Request.', newsletterErrorCodes.SUBSCRIBER_INVALID_STATUS);
            }
          } else {
            // Create new subscriber
            verificationToken = generateToken();
            const verificationTokenHash = hashToken(verificationToken);
            const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

            subscriber = await NewsletterSubscriber.create({
              email,
              normalizedEmail: normalEmail,
              status: 'pending',
              verificationTokenHash,
              verificationExpiresAt: expiresAt,
              source: payload.source,
              consentVersion: 'v1',
              consentAt: new Date(),
              lastVerificationSentAt: new Date()
            }, { transaction });

            // Deterministic function of the subscriber's own ID, so it can only be derived
            // once the row (and its auto-increment ID) exists.
            await subscriber.update({
              unsubscribeTokenHash: hashToken(createUnsubscribeToken(subscriber.id))
            }, { transaction });

            wasNew = true;
          }
        });

        // Send email AFTER transaction commits (outside transaction)
        try {
          await sendVerificationEmailToSubscriber(subscriber, verificationToken);

          // Update verification_sent_at only after email succeeds
          await subscriber.update({
            verificationSentAt: new Date()
          });

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_CREATED',
            adminUserId: actor.id,
            metadata: {
              subscriber_id: String(subscriber.id),
              email: email,
              status: 'pending',
              source: payload.source,
              consent_note: payload.consent_note || null,
              was_new: wasNew,
              email_sent: true
            }
          });

          return sendSuccess(response, 'Verification email sent', { ...serializeSubscriber(subscriber), email_sent: true }, 201);
        } catch (emailError) {
          logger.warn({ subscriberId: subscriber.id, email }, 'Email send failed, but subscriber was saved');

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_CREATED',
            adminUserId: actor.id,
            metadata: {
              subscriber_id: String(subscriber.id),
              email: email,
              status: 'pending',
              source: payload.source,
              consent_note: payload.consent_note || null,
              was_new: wasNew,
              email_sent: false,
              error: emailError instanceof Error ? emailError.message : String(emailError)
            }
          });

          // 207: subscriber row was saved (pending), but the verification email failed to
          // send. A controlled partial-failure status/field, not a plain 201 success, so
          // callers can distinguish "saved" from "saved and emailed".
          return sendSuccess(
            response,
            'Subscriber saved as pending, but the verification email could not be sent. Check SMTP configuration and use Resend Verification.',
            { ...serializeSubscriber(subscriber), email_sent: false },
            207
          );
        }
      } catch (error) {
        next(error);
      }
    },

    async resendVerification(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = (request as any).authenticatedAdmin;
        if (!actor) {
          throw new ApiError(401, 'Authentication is required');
        }

        const subscriberId = String(request.params.id ?? '').trim();
        if (!subscriberId || !/^\d+$/.test(subscriberId)) {
          throw new ApiError(400, 'Invalid subscriber ID');
        }

        let subscriber: any;
        let verificationToken: string = '';

        // TRANSACTION: Update subscriber token only
        await sequelize.transaction(async (transaction) => {
          subscriber = await NewsletterSubscriber.findByPk(subscriberId, {
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (!subscriber) {
            throw new ApiError(404, 'Subscriber not found');
          }

          const subscriberData = subscriber.get({ plain: true }) as any;

          if (subscriberData.status !== 'pending') {
            throw newsletterError(409, 'Only pending subscribers can receive verification emails', newsletterErrorCodes.SUBSCRIBER_INVALID_STATUS);
          }

          const lastSent = subscriberData.lastVerificationSentAt;
          if (lastSent) {
            const minutesSinceLastSent = (Date.now() - new Date(lastSent).getTime()) / (1000 * 60);
            if (minutesSinceLastSent < NEWSLETTER_RESEND_COOLDOWN_MINUTES) {
              throw newsletterError(429, `Please wait ${Math.ceil(NEWSLETTER_RESEND_COOLDOWN_MINUTES - minutesSinceLastSent)} minutes before resending.`, newsletterErrorCodes.SUBSCRIBER_VERIFICATION_COOLDOWN);
            }
          }

          verificationToken = generateToken();
          const verificationTokenHash = hashToken(verificationToken);
          const expiresAt = new Date(Date.now() + NEWSLETTER_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

          await subscriber.update({
            verificationTokenHash,
            verificationExpiresAt: expiresAt,
            lastVerificationSentAt: new Date()
          }, { transaction });
        });

        // Send email AFTER transaction commits (outside transaction)
        try {
          await sendVerificationEmailToSubscriber(subscriber, verificationToken);

          // Update verification_sent_at only after email succeeds
          await subscriber.update({
            verificationSentAt: new Date()
          });

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_VERIFICATION_RESENT',
            adminUserId: actor.id,
            metadata: {
              subscriber_id: subscriberId,
              email: subscriber.get('email'),
              email_sent: true
            }
          });

          return sendSuccess(response, 'Verification email resent', { ...serializeSubscriber(subscriber), email_sent: true });
        } catch (emailError) {
          logger.warn({ subscriberId, email: subscriber.get('email') }, 'Resend email send failed, but token was updated');

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_VERIFICATION_RESENT',
            adminUserId: actor.id,
            metadata: {
              subscriber_id: subscriberId,
              email: subscriber.get('email'),
              email_sent: false,
              error: emailError instanceof Error ? emailError.message : String(emailError)
            }
          });

          // 207: token was updated (subscriber still pending), but the email failed to
          // send. A controlled partial-failure status/field, not a plain 200 success.
          return sendSuccess(
            response,
            'Subscriber saved as pending, but the verification email could not be sent. Check SMTP configuration and use Resend Verification.',
            { ...serializeSubscriber(subscriber), email_sent: false },
            207
          );
        }
      } catch (error) {
        next(error);
      }
    },

    async sendResubscription(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = (request as any).authenticatedAdmin;
        if (!actor) throw new ApiError(401, 'Authentication is required');
        const subscriberId = String(request.params.id ?? '').trim();
        if (!/^\d+$/.test(subscriberId)) throw new ApiError(400, 'Invalid subscriber ID');
        const result = await requestSubscriberResubscription(subscriberId, actor.id);
        return sendSuccess(response, 'Resubscription request sent', { ...serializeSubscriber(result.subscriber), email_sent: result.emailSent });
      } catch (error) { next(error); }
    },

    async delete(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = (request as any).authenticatedAdmin;
        if (!actor) {
          throw new ApiError(401, 'Authentication is required');
        }

        const subscriberId = String(request.params.id ?? '').trim();
        if (!subscriberId || !/^\d+$/.test(subscriberId)) {
          throw new ApiError(400, 'Invalid subscriber ID');
        }

        const reason = (request.body?.reason || 'admin_deletion').substring(0, 255);

        let affectedCampaignIds: string[] = [];
        const result = await sequelize.transaction(async (transaction) => {
          const subscriber = await NewsletterSubscriber.findByPk(subscriberId, {
            transaction,
            lock: transaction.LOCK.UPDATE
          });

          if (!subscriber) {
            throw new ApiError(404, 'Subscriber not found');
          }

          const processingCount = await NewsletterDelivery.count({
            where: { subscriberId, status: 'processing' },
            transaction
          });
          if (processingCount > 0) {
            throw newsletterError(409, 'This subscriber currently has an email delivery in progress. Try again after it completes.', newsletterErrorCodes.SUBSCRIBER_PROCESSING_DELIVERY);
          }

          const cancellable = await NewsletterDelivery.findAll({
            where: { subscriberId, status: { [Op.in]: ['pending', 'retry_pending'] } },
            attributes: ['campaignId'],
            raw: true,
            transaction
          }) as unknown as Array<{ campaignId: string }>;
          affectedCampaignIds = [...new Set(cancellable.map((delivery) => String(delivery.campaignId)))];
          if (affectedCampaignIds.length > 0) {
            await NewsletterDelivery.update(
              { status: 'cancelled', failureReason: 'Subscriber deleted before delivery' },
              { where: { subscriberId, status: { [Op.in]: ['pending', 'retry_pending'] } }, transaction }
            );
          }

          const deliveryCount = await NewsletterDelivery.count({
            where: { subscriberId },
            transaction
          });
          if (deliveryCount === 0) {
            await subscriber.destroy({ transaction });

            await writeAuthAuditLog({
              action: 'NEWSLETTER_SUBSCRIBER_DELETED',
              adminUserId: actor.id,
              metadata: {
                subscriber_id: subscriberId,
                email: subscriber.get('email'),
                deletion_mode: 'hard_delete',
                deletion_reason: reason
              }
            }, transaction);

            return { success: true, deletion_mode: 'hard_delete' };
          }

          const anonymizedEmail = `deleted-subscriber-${subscriberId}@invalid.local`;
          const anonymizedNormalEmail = normalizeEmail(anonymizedEmail);

          await subscriber.update({
            email: anonymizedEmail,
            normalizedEmail: anonymizedNormalEmail,
            status: 'unsubscribed',
            verificationTokenHash: null,
            verificationExpiresAt: null,
            unsubscribeTokenHash: null,
            deletedAt: new Date(),
            deletedBy: actor.id,
            deletionReason: reason,
            anonymizedAt: new Date()
          }, { transaction });

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_ANONYMIZED',
            adminUserId: actor.id,
            metadata: {
              subscriber_id: subscriberId,
              email: subscriber.get('email'),
              deletion_mode: 'anonymized',
              deletion_reason: reason,
              delivery_history_count: deliveryCount
            }
          }, transaction);

          return { success: true, deletion_mode: 'anonymized' };
        });

        for (const campaignId of affectedCampaignIds) {
          await reconcileCampaignState(campaignId);
        }
        return sendSuccess(response, 'Subscriber deleted', result);
      } catch (error) {
        next(error);
      }
    },

    async testSmtpEmail(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = (request as any).authenticatedAdmin;
        if (!actor) {
          throw new ApiError(401, 'Authentication is required');
        }

        const payload = z.object({ email: z.string().email() }).parse(request.body);

        if (!isMailConfigured()) {
          throw new ApiError(503, 'SMTP is not configured');
        }

        const transporter = createMailTransporter();
        const emailTemplate = generateSmtpDiagnosticEmail();

        try {
          const fromAddress = process.env.MAIL_FROM_NAME && process.env.MAIL_FROM_NAME !== 'Pixel Eye Hospitals'
            ? `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_EMAIL}>`
            : `Pixel Eye Blog <${process.env.MAIL_FROM_EMAIL}>`;

          const result = await transporter.sendMail({
            from: fromAddress,
            to: payload.email,
            subject: emailTemplate.subject,
            html: emailTemplate.htmlBody,
            text: emailTemplate.textBody
          });

          logger.info({ messageId: result.messageId, testEmail: payload.email }, 'SMTP test email sent');

          await writeAuthAuditLog({
            action: 'NEWSLETTER_SUBSCRIBER_CREATED',
            adminUserId: actor.id,
            metadata: {
              action_type: 'smtp_test_email',
              test_email: payload.email,
              message_id: result.messageId
            }
          });

          return sendSuccess(response, 'Test email sent successfully', {
            message_id: result.messageId,
            recipient: payload.email,
            sent_at: new Date().toISOString()
          });
        } catch (smtpError) {
          logger.error(
            { error: smtpError instanceof Error ? smtpError.message : String(smtpError), email: payload.email },
            'SMTP test email failed'
          );
          throw new ApiError(503, 'Failed to send test email. Check SMTP configuration.');
        }
      } catch (error) {
        next(error);
      }
    }
  };
}

