import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { NewsletterCampaign } from './newsletter-campaign.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { Blog } from '../blogs/blog.model.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import { MediaAsset } from '../media/media.model.js';
import { createMailTransporter, isMailConfigured } from '../../services/integrations/mail.service.js';
import { generateCampaignEmail } from './email-templates.js';
import { reconcileCampaignState } from './newsletter-campaign.service.js';
import { sequelize } from '../../config/database.js';
import { z } from 'zod';
import { Op } from 'sequelize';
import { writeNewsletterAuditSafely } from './newsletter-audit.service.js';
import { newsletterError, newsletterErrorCodes } from './newsletter-errors.js';
import { eligibleSubscriberWhere, isEligibleSubscriber } from './newsletter-eligibility.js';
import { readWorkerHealth } from './newsletter-worker-health.js';

/**
 * Shared Sequelize `include` used everywhere a campaign response includes its
 * Blog/BlogVersion — keeps list/detail/create/update/queue/retry/cancel
 * returning the same shape (Part 11). Only the minimal fields the Admin UI
 * needs are selected — never content_html/blocks_json/template_config_json or
 * other internal/unpublished fields. Note Blog itself has no `title` column
 * (title lives on BlogVersion); requesting it here would throw a SQL error.
 */
const CAMPAIGN_INCLUDE = [
  {
    model: Blog,
    as: 'blog',
    attributes: ['id', 'slug', 'status', 'publishedAt', 'featuredMediaId'],
    include: [{ model: MediaAsset, as: 'featuredMedia', attributes: ['id', 'originalUrl', 'altText'], required: false }]
  },
  {
    model: BlogVersion,
    as: 'blogVersion',
    attributes: ['id', 'versionNumber', 'title', 'excerpt', 'templateKey', 'featuredMediaId'],
    include: [{ model: MediaAsset, as: 'featuredMedia', attributes: ['id', 'originalUrl', 'altText'], required: false }]
  }
];

const createCampaignSchema = z.object({
  blog_id: z.string().regex(/^\d+$/),
  subject: z.string().min(1).max(255),
  preview_text: z.string().max(255).optional()
}).strict();

const updateCampaignSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  preview_text: z.string().max(255).optional()
}).strict();

const sendTestSchema = z.object({
  recipient_email: z.string().email()
}).strict();

const pauseCampaignSchema = z.object({
  reason_code: z.enum(['manual_review', 'high_failure_rate', 'provider_rate_limited', 'other']).optional(),
  reason_message: z.string().trim().max(1000).optional()
}).strict();

const deleteCampaignSchema = z.object({ reason: z.string().trim().max(255).optional() }).strict();

function requireAuthenticatedAdmin(request: Request): NonNullable<Request['authenticatedAdmin']> {
  if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
  return request.authenticatedAdmin;
}

function mailFromAddress(): string {
  const email = process.env.MAIL_FROM_EMAIL ?? '';
  return process.env.MAIL_FROM_NAME ? `${process.env.MAIL_FROM_NAME} <${email}>` : email;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  sort: z.enum(['created_at', 'subject', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
}).strict();

/**
 * Serializes a NewsletterCampaign instance to the Admin API response shape.
 *
 * Fixed here: `campaign.get({ plain: true })` returns Sequelize's JS-side
 * attribute names (camelCase — e.g. `blogId`, `previewText`, `totalRecipients`),
 * not the underlying snake_case DB column names. The previous version of this
 * function read `data.blog_id`, `data.preview_text`, `data.total_recipients`,
 * etc., all of which are `undefined` on that object — `blog_id`/`blog_version_id`
 * serialized as the literal string `"undefined"`, every counter serialized as
 * `0`, and `created_at`/`updated_at` (`new Date(undefined).toISOString()`)
 * threw a RangeError, so every route that returns a campaign (list, detail,
 * create, update, queue, retry, cancel) failed before ever responding. This
 * was never caught by any existing test, since none of them exercise a
 * successful (non-403) response from these routes.
 *
 * Also fixed: `blog`/`blogVersion` are now included in the response when the
 * query fetched them via `CAMPAIGN_INCLUDE` — previously fetched and then
 * silently dropped.
 */
function serializeCampaign(campaign: any) {
  const data = typeof campaign.get === 'function' ? campaign.get({ plain: true }) : campaign;

  const blog = data.blog
    ? {
        id: String(data.blog.id),
        slug: data.blog.slug,
        title: data.blogVersion?.title ?? null,
        status: data.blog.status,
        published_at: data.blog.publishedAt ? new Date(data.blog.publishedAt).toISOString() : null,
        featured_media: data.blog.featuredMedia
          ? { url: data.blog.featuredMedia.originalUrl ?? null, alt_text: data.blog.featuredMedia.altText ?? null }
          : null
      }
    : null;

  const blogVersion = data.blogVersion
    ? {
        id: String(data.blogVersion.id),
        version_number: data.blogVersion.versionNumber,
        title: data.blogVersion.title,
        excerpt: data.blogVersion.excerpt ?? null,
        template_key: data.blogVersion.templateKey ?? null
      }
    : null;

  return {
    id: String(data.id),
    blog_id: String(data.blogId),
    blog_version_id: String(data.blogVersionId),
    subject: data.subject,
    preview_text: data.previewText || null,
    status: data.status,
    total_recipients: data.totalRecipients || 0,
    queued_count: data.queuedCount || 0,
    sent_count: data.sentCount || 0,
    failed_count: data.failedCount || 0,
    cancelled_count: data.cancelledCount || 0,
    paused_at: data.pausedAt ? new Date(data.pausedAt).toISOString() : null,
    paused_by: data.pausedBy ? String(data.pausedBy) : null,
    pause_reason_code: data.pauseReasonCode ?? null,
    pause_reason_message: data.pauseReasonMessage ?? null,
    auto_paused: Boolean(data.autoPaused),
    resume_at: data.resumeAt ? new Date(data.resumeAt).toISOString() : null,
    created_by: data.createdBy ? String(data.createdBy) : null,
    queued_at: data.queuedAt ? new Date(data.queuedAt).toISOString() : null,
    started_at: data.startedAt ? new Date(data.startedAt).toISOString() : null,
    completed_at: data.completedAt ? new Date(data.completedAt).toISOString() : null,
    created_at: new Date(data.createdAt).toISOString(),
    updated_at: new Date(data.updatedAt).toISOString(),
    blog,
    blog_version: blogVersion
  };
}

export function createAdminCampaignController() {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try {
        const query = listQuerySchema.parse(request.query);

        const where: any = { deletedAt: null };
        if (query.status) {
          where.status = query.status;
        }

        const sortField =
          query.sort === 'subject' ? 'subject' : query.sort === 'status' ? 'status' : 'createdAt';

        const result = await NewsletterCampaign.findAndCountAll({
          where,
          include: CAMPAIGN_INCLUDE,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
          order: [[sortField, query.order.toUpperCase()]],
          subQuery: false
        });

        const totalPages = Math.ceil(result.count / query.limit);

        return sendSuccess(response, 'Campaigns fetched', {
          items: result.rows.map((campaign) => serializeCampaign(campaign)),
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
        const visible = { deletedAt: null };
        const total = await NewsletterCampaign.count({ where: visible });
        const draft = await NewsletterCampaign.count({ where: { ...visible, status: 'draft' } });
        const active = await NewsletterCampaign.count({ where: { ...visible, status: { [Op.in]: ['queued', 'sending', 'paused'] } } });
        const completed = await NewsletterCampaign.count({ where: { ...visible, status: 'completed' } });
        const failed = await NewsletterCampaign.count({ where: { ...visible, status: { [Op.in]: ['failed', 'partially_failed'] } } });

        return sendSuccess(response, 'Campaign stats fetched', {
          total_campaigns: total,
          draft,
          active,
          completed,
          failed
        });
      } catch (error) {
        next(error);
      }
    },

    async create(request: Request, response: Response, next: NextFunction) {
      try {
        const payload = createCampaignSchema.parse(request.body);
        const actor = requireAuthenticatedAdmin(request);

        const campaign = await sequelize.transaction(async (t) => {
          // Verify blog exists and is published
          const blog = await Blog.findByPk(payload.blog_id, {
            include: [{ model: BlogVersion, as: 'currentPublishedVersion' }],
            transaction: t
          });

          if (!blog || blog.get('status') !== 'published') {
            throw new ApiError(404, 'Blog not found or not published');
          }

          const publishedVersion = (blog.get() as any).currentPublishedVersion;
          if (!publishedVersion) {
            throw new ApiError(422, 'No published version found');
          }

          const newCampaign = await NewsletterCampaign.create({
            blogId: payload.blog_id,
            blogVersionId: String(publishedVersion.id),
            subject: payload.subject,
            previewText: payload.preview_text || null,
            status: 'draft',
            createdBy: actor.id
          }, { transaction: t });

          await writeNewsletterAuditSafely({
            action: 'CAMPAIGN_CREATED',
            adminUserId: actor.id,
            metadata: { campaign_id: newCampaign.id, subject: payload.subject }
          }, t);

          return NewsletterCampaign.findByPk(newCampaign.id, { include: CAMPAIGN_INCLUDE, transaction: t });
        });

        return sendSuccess(response, 'Campaign created', serializeCampaign(campaign!), 201);
      } catch (error) {
        next(error);
      }
    },

    async getDetail(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await NewsletterCampaign.findByPk(campaignId, {
          include: CAMPAIGN_INCLUDE
        });

        if (!campaign) {
          throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
        }

        return sendSuccess(response, 'Campaign fetched', serializeCampaign(campaign));
      } catch (error) {
        next(error);
      }
    },

    async update(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const payload = updateCampaignSchema.parse(request.body);
        const actor = requireAuthenticatedAdmin(request);

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!existing) {
            throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          }

          if (existing.get('status') !== 'draft') {
            throw newsletterError(409, 'Only draft campaigns can be updated', newsletterErrorCodes.CAMPAIGN_INVALID_STATUS);
          }

          const updates: any = {};
          if (payload.subject) updates.subject = payload.subject;
          if (payload.preview_text !== undefined) updates.previewText = payload.preview_text;

          await existing.update(updates, { transaction: t });

          await writeNewsletterAuditSafely({
            action: 'CAMPAIGN_UPDATED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, changed_fields: Object.keys(payload) }
          }, t);

          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });

        return sendSuccess(response, 'Campaign updated', serializeCampaign(campaign!));
      } catch (error) {
        next(error);
      }
    },

    async sendTest(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const payload = sendTestSchema.parse(request.body);
        const actor = requireAuthenticatedAdmin(request);

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        if (!isMailConfigured()) {
          throw newsletterError(503, 'Email service not configured', newsletterErrorCodes.CAMPAIGN_EMAIL_SEND_FAILED);
        }

        const campaign = await NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE });

        if (!campaign) {
          throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
        }

        const campaignData = (campaign.get({ plain: true }) as any);
        const blogVersionData = campaignData.blogVersion;
        const blogSlug = campaignData.blog?.slug || '';

        const emailTemplate = generateCampaignEmail({
          campaignSubject: campaignData.subject,
          previewText: campaignData.previewText,
          blogTitle: blogVersionData.title,
          blogExcerpt: blogVersionData.excerpt || '',
          blogSlug,
          blogUrl: `${process.env.PUBLIC_WEBSITE_URL}/blog/${encodeURIComponent(blogSlug)}`,
          featuredImageUrl: blogVersionData.featuredMedia?.originalUrl ?? campaignData.blog?.featuredMedia?.originalUrl,
          unsubscribeUrl: '#',
          isTest: true
        });

        const transporter = createMailTransporter();
        try {
          await transporter.sendMail({
            from: mailFromAddress(),
            to: payload.recipient_email,
            subject: emailTemplate.subject,
            html: emailTemplate.htmlBody,
            text: emailTemplate.textBody
          });
        } catch {
          throw newsletterError(503, 'Failed to send campaign test email', newsletterErrorCodes.CAMPAIGN_EMAIL_SEND_FAILED);
        }

        const auditLogged = await writeNewsletterAuditSafely({
          action: 'CAMPAIGN_TEST_EMAIL_SENT',
          adminUserId: actor.id,
          metadata: { campaign_id: campaignId, recipient: payload.recipient_email }
        });

        return sendSuccess(response, 'Test email sent', { success: true, audit_logged: auditLogged });
      } catch (error) {
        next(error);
      }
    },



    async workerHealth(request: Request, response: Response, next: NextFunction) {
      try {
        const health = await readWorkerHealth();
        response.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.set('Pragma', 'no-cache');
        response.set('Expires', '0');
        return sendSuccess(response, 'Newsletter worker health fetched', health);
      } catch (error) { next(error); }
    },
    /**
     * Compact per-status delivery breakdown plus worker/retry timing for the
     * Campaign detail page's diagnostics section (Part 10). Deliberately
     * separate from getDetail(): the campaign row's own counters
     * (queued_count/sent_count/etc, see reconcileCampaignState) only carry
     * enough resolution for the summary cards — they collapse
     * pending/processing/retry_pending into one number and uncertain into
     * failed_count. This reads the delivery rows directly for the finer
     * "Needs Review" / "Processing" / "Retry Pending" split the UI needs,
     * without changing what the campaign counters themselves mean.
     */
    async deliveryDiagnostics(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        if (!campaignId || !/^\d+$/.test(campaignId)) throw new ApiError(400, 'Invalid campaign ID');

        const campaign = await NewsletterCampaign.findByPk(campaignId, { attributes: ['id'] });
        if (!campaign) throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);

        const rows = await NewsletterDelivery.findAll({
          where: { campaignId },
          attributes: ['status', 'processingStartedAt', 'nextAttemptAt', 'lastErrorCode', 'lastErrorMessage', 'updatedAt'],
          raw: true
        }) as any[];

        const counts = { pending: 0, processing: 0, retry_pending: 0, sent: 0, failed: 0, cancelled: 0, uncertain: 0 };
        let lastProcessingAttempt: Date | null = null;
        let nextRetryAt: Date | null = null;
        let latestError: { code: string; message: string; at: string } | null = null;

        for (const row of rows) {
          if (row.status in counts) counts[row.status as keyof typeof counts] += 1;

          if (row.processingStartedAt) {
            const attemptedAt = new Date(row.processingStartedAt);
            if (!lastProcessingAttempt || attemptedAt > lastProcessingAttempt) lastProcessingAttempt = attemptedAt;
          }

          if (row.status === 'retry_pending' && row.nextAttemptAt) {
            const retryAt = new Date(row.nextAttemptAt);
            if (!nextRetryAt || retryAt < nextRetryAt) nextRetryAt = retryAt;
          }

          if (row.lastErrorMessage) {
            const seenAt = new Date(row.updatedAt);
            if (!latestError || seenAt > new Date(latestError.at)) {
              latestError = {
                code: row.lastErrorCode || 'UNKNOWN',
                message: row.lastErrorMessage,
                at: seenAt.toISOString()
              };
            }
          }
        }

        const workerHealth = await readWorkerHealth();

        return sendSuccess(response, 'Delivery diagnostics fetched', {
          counts,
          last_worker_heartbeat: workerHealth.latest_heartbeat_at,
          last_processing_attempt: lastProcessingAttempt ? lastProcessingAttempt.toISOString() : null,
          next_retry_at: nextRetryAt ? nextRetryAt.toISOString() : null,
          latest_error: latestError
        });
      } catch (error) { next(error); }
    },
    async queuePreview(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        if (!campaignId || !/^\d+$/.test(campaignId)) throw new ApiError(400, 'Invalid campaign ID');
        const campaign = await NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE });
        if (!campaign) throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
        const status = campaign.get('status');
        if (status !== 'draft') throw newsletterError(409, 'Only draft campaigns can be previewed for queueing', newsletterErrorCodes.CAMPAIGN_INVALID_STATUS);
        const subscribers = await NewsletterSubscriber.findAll({
          attributes: ['status', 'deletedAt', 'email', 'normalizedEmail'],
          raw: true
        }) as any[];
        const eligible = subscribers.filter((subscriber) => isEligibleSubscriber(subscriber));
        const excluded = { pending: 0, unsubscribed: 0, deleted: 0, invalid_email: 0 };
        for (const subscriber of subscribers) {
          if (subscriber.deletedAt) excluded.deleted += 1;
          else if (subscriber.status === 'pending') excluded.pending += 1;
          else if (subscriber.status === 'unsubscribed') excluded.unsubscribed += 1;
          else if (!isEligibleSubscriber(subscriber)) excluded.invalid_email += 1;
        }
        const data = campaign.get({ plain: true }) as any;
        return sendSuccess(response, 'Queue preview fetched', {
          campaign_id: campaignId,
          campaign_status: status,
          subject: data.subject,
          blog: data.blog ? { id: String(data.blog.id), title: data.blogVersion?.title ?? null, slug: data.blog.slug } : null,
          blog_version: data.blogVersion ? { id: String(data.blogVersion.id), version_number: data.blogVersion.versionNumber } : null,
          eligible_recipient_count: eligible.length,
          excluded_counts: excluded,
          can_queue: eligible.length > 0,
          blocking_reason: eligible.length > 0 ? null : 'No eligible subscribers available'
        });
      } catch (error) { next(error); }
    },
    async queue(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = requireAuthenticatedAdmin(request);

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, {
            transaction: t,
            lock: t.LOCK.UPDATE
          });
          if (!existing) {
            throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          }

          if (existing.get('status') !== 'draft') {
            throw newsletterError(409, 'Campaign has already left draft status', newsletterErrorCodes.CAMPAIGN_ALREADY_QUEUED);
          }

          const existingDeliveryCount = await NewsletterDelivery.count({
            where: { campaignId },
            transaction: t
          });
          if (existingDeliveryCount > 0) {
            throw newsletterError(409, 'Campaign has already been queued', newsletterErrorCodes.CAMPAIGN_ALREADY_QUEUED);
          }

          // Get subscribed subscribers
          const subscribers = await NewsletterSubscriber.findAll({
            where: eligibleSubscriberWhere,
            attributes: ['id', 'status', 'deletedAt', 'email', 'normalizedEmail'],
            transaction: t,
            raw: true
          }) as any[];
          const eligibleSubscribers = subscribers.filter((subscriber) => isEligibleSubscriber(subscriber));

          if (eligibleSubscribers.length === 0) {
            throw newsletterError(422, 'No subscribed subscribers available', newsletterErrorCodes.CAMPAIGN_NO_RECIPIENTS);
          }

          // Create delivery rows
          const deliveries = eligibleSubscribers.map((sub: any) => ({
            campaignId: campaignId,
            subscriberId: String(sub.id),
            status: 'pending'
          })) as any[];

          await NewsletterDelivery.bulkCreate(deliveries, {
            transaction: t,
            ignoreDuplicates: false
          });

          // draft -> queued is an explicit action; reconcileCampaignState()
          // never promotes a campaign out of draft on its own (see Part 3).
          await existing.update({ status: 'queued', queuedAt: new Date() }, { transaction: t });

          await writeNewsletterAuditSafely({
            action: 'CAMPAIGN_QUEUED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, recipient_count: eligibleSubscribers.length }
          }, t);

          // Authoritative counters (totalRecipients/queuedCount) computed from
          // the delivery rows just created, rather than duplicating
          // subscribers.length in two places.
          await reconcileCampaignState(campaignId, { transaction: t, lock: false });

          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });

        return sendSuccess(response, 'Campaign queued', serializeCampaign(campaign!));
      } catch (error) {
        next(error);
      }
    },

    async pause(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const payload = pauseCampaignSchema.parse(request.body ?? {});
        const actor = requireAuthenticatedAdmin(request);
        if (!/^\d+$/.test(campaignId)) throw new ApiError(400, 'Invalid campaign ID');

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t, lock: t.LOCK.UPDATE });
          if (!existing) throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          if (!['queued', 'sending'].includes(existing.get('status'))) {
            throw newsletterError(409, 'Only queued or sending Campaigns can be paused.', newsletterErrorCodes.CAMPAIGN_INVALID_PAUSE_STATUS);
          }
          await existing.update({
            status: 'paused', pausedAt: new Date(), pausedBy: actor.id,
            pauseReasonCode: payload.reason_code ?? 'manual_review',
            pauseReasonMessage: payload.reason_message ?? null,
            autoPaused: false, resumeAt: null
          }, { transaction: t });
          await writeNewsletterAuditSafely({ action: 'CAMPAIGN_PAUSED', adminUserId: actor.id, metadata: { campaign_id: campaignId, reason_code: payload.reason_code ?? 'manual_review' } }, t);
          await reconcileCampaignState(campaignId, { transaction: t, lock: false });
          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });
        return sendSuccess(response, 'Campaign paused', serializeCampaign(campaign!));
      } catch (error) { next(error); }
    },

    async resume(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = requireAuthenticatedAdmin(request);
        if (!/^\d+$/.test(campaignId)) throw new ApiError(400, 'Invalid campaign ID');
        const health = await readWorkerHealth();
        if (health.worker_status !== 'active' || health.database_status !== 'ready') {
          throw newsletterError(503, 'Newsletter Worker is unavailable.', newsletterErrorCodes.CAMPAIGN_WORKER_UNAVAILABLE);
        }
        if (health.smtp_status !== 'ready') {
          throw newsletterError(503, 'Newsletter SMTP is unavailable.', newsletterErrorCodes.CAMPAIGN_SMTP_UNAVAILABLE);
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t, lock: t.LOCK.UPDATE });
          if (!existing) throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          if (existing.get('status') !== 'paused') {
            throw newsletterError(409, 'Only paused Campaigns can be resumed.', newsletterErrorCodes.CAMPAIGN_INVALID_RESUME_STATUS);
          }
          const pendingCount = await NewsletterDelivery.count({ where: { campaignId, status: { [Op.in]: ['pending', 'retry_pending'] } }, transaction: t });
          if (pendingCount === 0) {
            throw newsletterError(409, 'Campaign has no pending or retryable deliveries.', newsletterErrorCodes.CAMPAIGN_INVALID_RESUME_STATUS);
          }
          const priorOutcomeCount = await NewsletterDelivery.count({ where: { campaignId, status: { [Op.in]: ['sent', 'failed', 'uncertain'] } }, transaction: t });
          const resumedStatus = existing.get('startedAt') || priorOutcomeCount > 0 ? 'sending' : 'queued';
          await existing.update({
            status: resumedStatus, pausedAt: null, pausedBy: null, pauseReasonCode: null,
            pauseReasonMessage: null, autoPaused: false, resumeAt: null, completedAt: null
          }, { transaction: t });
          await writeNewsletterAuditSafely({ action: 'CAMPAIGN_RESUMED', adminUserId: actor.id, metadata: { campaign_id: campaignId, resumed_status: resumedStatus } }, t);
          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });
        return sendSuccess(response, 'Campaign resumed', serializeCampaign(campaign!));
      } catch (error) { next(error); }
    },

    async delete(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const payload = deleteCampaignSchema.parse(request.body ?? {});
        const actor = requireAuthenticatedAdmin(request);
        if (!/^\d+$/.test(campaignId)) throw new ApiError(400, 'Invalid campaign ID');
        const result = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t, lock: t.LOCK.UPDATE });
          if (!existing) throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          const status = existing.get('status');
          if (['queued', 'sending', 'paused'].includes(status)) {
            throw newsletterError(409, 'Active Campaigns cannot be deleted. Pause and cancel the Campaign first.', newsletterErrorCodes.CAMPAIGN_ACTIVE_DELETE_FORBIDDEN);
          }
          if (status === 'draft') {
            const deliveryCount = await NewsletterDelivery.count({ where: { campaignId }, transaction: t });
            if (deliveryCount > 0) throw newsletterError(409, 'Draft Campaign with delivery history cannot be deleted.', newsletterErrorCodes.CAMPAIGN_ACTIVE_DELETE_FORBIDDEN);
            await existing.destroy({ transaction: t });
            await writeNewsletterAuditSafely({ action: 'CAMPAIGN_DELETED', adminUserId: actor.id, metadata: { campaign_id: campaignId, deletion_mode: 'hard_delete' } }, t);
            return { success: true, deletion_mode: 'hard_delete' };
          }
          if (!['completed', 'partially_failed', 'failed', 'cancelled'].includes(status)) {
            throw newsletterError(409, 'Campaign cannot be deleted in its current status.', newsletterErrorCodes.CAMPAIGN_ACTIVE_DELETE_FORBIDDEN);
          }
          await existing.update({ deletedAt: new Date(), deletedBy: actor.id, deleteReason: payload.reason ?? 'admin_delete' }, { transaction: t });
          await writeNewsletterAuditSafely({ action: 'CAMPAIGN_ARCHIVED', adminUserId: actor.id, metadata: { campaign_id: campaignId, status } }, t);
          return { success: true, deletion_mode: 'soft_delete' };
        });
        return sendSuccess(response, 'Campaign deleted', result);
      } catch (error) { next(error); }
    },

    async retryFailed(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = requireAuthenticatedAdmin(request);

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          // Row-locked so two concurrent Retry clicks can't both pass the
          // status check before either commits — the second waits for the
          // first, then sees the post-reconciliation status and is rejected.
          const existing = await NewsletterCampaign.findByPk(campaignId, {
            transaction: t,
            lock: t.LOCK.UPDATE
          });
          if (!existing) {
            throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          }

          const campaignStatus = existing.get('status');
          // 'completed' has failed_count === 0 by definition — nothing to
          // retry. Only a campaign that actually finished with failures can
          // be retried.
          if (!['failed', 'partially_failed'].includes(campaignStatus)) {
            throw newsletterError(409, 'Campaign must be failed or partially failed to retry', newsletterErrorCodes.CAMPAIGN_INVALID_STATUS);
          }

          // Manual retry policy (Option A — attempt_count preserved, not
          // reset): a manual Retry grants exactly one additional attempt on
          // top of the automatic backoff cycle already spent (a delivery
          // only reaches 'failed' once attempt_count >= NEWSLETTER_MAX_ATTEMPTS),
          // rather than restarting a fresh multi-attempt cycle. next_attempt_at
          // is set to "now" since this is an explicit, admin-requested retry,
          // not a backoff-scheduled one. Sent and cancelled deliveries are
          // never touched — only rows currently 'failed' are selected.
          const [retryCount] = await NewsletterDelivery.update(
            {
              status: 'retry_pending' as any,
              nextAttemptAt: new Date(),
              processingStartedAt: null,
              failedAt: null,
              sentAt: null,
              lastErrorCode: null,
              lastErrorMessage: null,
              failureReason: null
            },
            {
              where: {
                campaignId: campaignId,
                status: 'failed'
              },
              transaction: t
            }
          );

          await writeNewsletterAuditSafely({
            action: 'CAMPAIGN_RETRY_FAILED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, retry_count: Number(retryCount) }
          }, t);

          await reconcileCampaignState(campaignId, { transaction: t, lock: false });

          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });

        return sendSuccess(response, 'Failed deliveries marked for retry', serializeCampaign(campaign!));
      } catch (error) {
        next(error);
      }
    },

    async cancel(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = requireAuthenticatedAdmin(request);

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!existing) {
            throw newsletterError(404, 'Campaign not found', newsletterErrorCodes.CAMPAIGN_NOT_FOUND);
          }

          const status = existing.get('status');
          if (!['queued', 'paused'].includes(status)) {
            throw newsletterError(409, 'Only queued or paused Campaigns can be cancelled', newsletterErrorCodes.CAMPAIGN_INVALID_STATUS);
          }

          // Mark pending/retry_pending deliveries as cancelled — processing/sent
          // deliveries are left untouched; cancellation is best-effort and
          // cannot recall an email already in flight or sent.
          const [cancelCount] = await NewsletterDelivery.update(
            {
              status: 'cancelled' as any
            },
            {
              where: {
                campaignId: campaignId,
                status: { [Op.in]: ['pending', 'retry_pending'] }
              },
              transaction: t
            }
          );

          await existing.update({ status: 'cancelled', cancelledAt: new Date() }, { transaction: t });

          await writeNewsletterAuditSafely({
            action: 'CAMPAIGN_CANCELLED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, cancelled_delivery_count: Number(cancelCount) }
          }, t);

          // Recomputes cancelled_count/sent_count/etc. from the actual
          // delivery rows; reconcileCampaignState() never moves status away
          // from 'cancelled' once it's set.
          await reconcileCampaignState(campaignId, { transaction: t, lock: false });

          return NewsletterCampaign.findByPk(campaignId, { include: CAMPAIGN_INCLUDE, transaction: t });
        });

        return sendSuccess(response, 'Campaign cancelled', serializeCampaign(campaign!));
      } catch (error) {
        next(error);
      }
    }
  };
}
