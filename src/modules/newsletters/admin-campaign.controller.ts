import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { NewsletterCampaign } from './newsletter-campaign.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { Blog } from '../blogs/blog.model.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import { createMailTransporter, isMailConfigured } from '../../services/integrations/mail.service.js';
import { generateCampaignEmail } from './email-templates.js';
import { sequelize } from '../../config/database.js';
import { z } from 'zod';
import { Op } from 'sequelize';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';

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

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  sort: z.enum(['created_at', 'subject', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
}).strict();

function serializeCampaign(campaign: any) {
  const data = typeof campaign.get === 'function' ? campaign.get({ plain: true }) : campaign;
  return {
    id: String(data.id),
    blog_id: String(data.blog_id),
    blog_version_id: String(data.blog_version_id),
    subject: data.subject,
    preview_text: data.preview_text || null,
    status: data.status,
    total_recipients: data.total_recipients || 0,
    queued_count: data.queued_count || 0,
    sent_count: data.sent_count || 0,
    failed_count: data.failed_count || 0,
    cancelled_count: data.cancelled_count || 0,
    created_by: data.created_by ? String(data.created_by) : null,
    queued_at: data.queued_at ? new Date(data.queued_at).toISOString() : null,
    started_at: data.started_at ? new Date(data.started_at).toISOString() : null,
    completed_at: data.completed_at ? new Date(data.completed_at).toISOString() : null,
    created_at: new Date(data.created_at).toISOString(),
    updated_at: new Date(data.updated_at).toISOString()
  };
}

export function createAdminCampaignController() {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try {
        const query = listQuerySchema.parse(request.query);

        const where: any = {};
        if (query.status) {
          where.status = query.status;
        }

        const sortField =
          query.sort === 'subject' ? 'subject' : query.sort === 'status' ? 'status' : 'createdAt';

        const result = await NewsletterCampaign.findAndCountAll({
          where,
          include: [
            { model: Blog, as: 'blog', attributes: ['id', 'slug'] },
            { model: BlogVersion, as: 'blogVersion', attributes: ['id', 'versionNumber', 'title'] }
          ],
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
        const total = await NewsletterCampaign.count();
        const draft = await NewsletterCampaign.count({ where: { status: 'draft' } });
        const active = await NewsletterCampaign.count({ where: { status: { [Op.in]: ['queued', 'sending'] } } });
        const completed = await NewsletterCampaign.count({ where: { status: 'completed' } });
        const failed = await NewsletterCampaign.count({ where: { status: { [Op.in]: ['failed', 'partially_failed'] } } });

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
        const actor = (request as any).user;

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

          await writeAuthAuditLog({
            action: 'CAMPAIGN_CREATED',
            adminUserId: actor.id,
            metadata: { campaign_id: newCampaign.id, subject: payload.subject }
          }, t);

          return newCampaign;
        });

        return sendSuccess(response, 'Campaign created', serializeCampaign(campaign), 201);
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
          include: [
            { model: Blog, as: 'blog', attributes: ['id', 'slug', 'title'] },
            { model: BlogVersion, as: 'blogVersion', attributes: ['id', 'versionNumber', 'title', 'excerpt'] }
          ]
        });

        if (!campaign) {
          throw new ApiError(404, 'Campaign not found');
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
        const actor = (request as any).user;

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!existing) {
            throw new ApiError(404, 'Campaign not found');
          }

          if (existing.get('status') !== 'draft') {
            throw new ApiError(422, 'Only draft campaigns can be updated');
          }

          const updates: any = {};
          if (payload.subject) updates.subject = payload.subject;
          if (payload.preview_text !== undefined) updates.previewText = payload.preview_text;

          await existing.update(updates, { transaction: t });

          await writeAuthAuditLog({
            action: 'CAMPAIGN_UPDATED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, changed_fields: Object.keys(payload) }
          }, t);

          return existing;
        });

        return sendSuccess(response, 'Campaign updated', serializeCampaign(campaign));
      } catch (error) {
        next(error);
      }
    },

    async sendTest(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const payload = sendTestSchema.parse(request.body);
        const actor = (request as any).user;

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        if (!isMailConfigured()) {
          throw new ApiError(503, 'Email service not configured');
        }

        const campaign = await NewsletterCampaign.findByPk(campaignId, {
          include: [{ model: BlogVersion, as: 'blogVersion' }]
        });

        if (!campaign) {
          throw new ApiError(404, 'Campaign not found');
        }

        const campaignData = (campaign.get() as any);
        const blogVersionData = campaignData.blogVersion;

        const emailTemplate = generateCampaignEmail({
          blogTitle: blogVersionData.title,
          blogExcerpt: blogVersionData.excerpt || '',
          blogSlug: campaignData.blog?.slug || '',
          blogUrl: `${process.env.PUBLIC_WEBSITE_URL}/blog/${campaignData.blog?.slug || ''}`,
          featuredImageUrl: undefined, // TODO: add featured image
          unsubscribeUrl: '#', // Test emails don't have working unsubscribe
          isTest: true
        });

        const transporter = createMailTransporter();
        await transporter.sendMail({
          from: process.env.MAIL_FROM_EMAIL,
          to: payload.recipient_email,
          subject: emailTemplate.subject,
          html: emailTemplate.htmlBody,
          text: emailTemplate.textBody
        });

        await writeAuthAuditLog({
          action: 'CAMPAIGN_TEST_EMAIL_SENT',
          adminUserId: actor.id,
          metadata: { campaign_id: campaignId, recipient: payload.recipient_email }
        });

        return sendSuccess(response, 'Test email sent', { success: true });
      } catch (error) {
        next(error);
      }
    },

    async queue(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = (request as any).user;

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!existing) {
            throw new ApiError(404, 'Campaign not found');
          }

          if (existing.get('status') !== 'draft') {
            throw new ApiError(422, 'Only draft campaigns can be queued');
          }

          // Get subscribed subscribers
          const subscribers = await NewsletterSubscriber.findAll({
            where: { status: 'subscribed' },
            attributes: ['id'],
            transaction: t,
            raw: true
          });

          if (subscribers.length === 0) {
            throw new ApiError(422, 'No subscribed subscribers available');
          }

          // Create delivery rows
          const deliveries = subscribers.map((sub: any) => ({
            campaignId: campaignId,
            subscriberId: String(sub.id),
            status: 'pending'
          })) as any[];

          await NewsletterDelivery.bulkCreate(deliveries, {
            transaction: t,
            ignoreDuplicates: true
          });

          // Update campaign
          await existing.update({
            status: 'queued',
            totalRecipients: subscribers.length,
            queuedCount: subscribers.length,
            queuedAt: new Date()
          }, { transaction: t });

          await writeAuthAuditLog({
            action: 'CAMPAIGN_QUEUED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, recipient_count: subscribers.length }
          }, t);

          return existing;
        });

        return sendSuccess(response, 'Campaign queued', serializeCampaign(campaign));
      } catch (error) {
        next(error);
      }
    },

    async retryFailed(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = (request as any).user;

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        await sequelize.transaction(async (t) => {
          const campaign = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!campaign) {
            throw new ApiError(404, 'Campaign not found');
          }

          const campaignStatus = campaign.get('status');
          if (!['completed', 'partially_failed'].includes(campaignStatus)) {
            throw new ApiError(422, 'Campaign must be completed or partially failed to retry');
          }

          // Mark failed deliveries as retry_pending
          const [retryCount] = await NewsletterDelivery.update(
            {
              status: 'retry_pending' as any,
              nextAttemptAt: new Date()
            },
            {
              where: {
                campaignId: campaignId,
                status: 'failed'
              },
              transaction: t
            }
          );

          await writeAuthAuditLog({
            action: 'CAMPAIGN_RETRY_FAILED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, retry_count: Number(retryCount) }
          }, t);
        });

        const campaign = await NewsletterCampaign.findByPk(campaignId);
        return sendSuccess(response, 'Failed deliveries marked for retry', serializeCampaign(campaign!));
      } catch (error) {
        next(error);
      }
    },

    async cancel(request: Request, response: Response, next: NextFunction) {
      try {
        const campaignId = String(request.params.id ?? '').trim();
        const actor = (request as any).user;

        if (!campaignId || !/^\d+$/.test(campaignId)) {
          throw new ApiError(400, 'Invalid campaign ID');
        }

        const campaign = await sequelize.transaction(async (t) => {
          const existing = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
          if (!existing) {
            throw new ApiError(404, 'Campaign not found');
          }

          const status = existing.get('status');
          if (!['draft', 'queued'].includes(status)) {
            throw new ApiError(422, 'Only draft or queued campaigns can be cancelled');
          }

          // Mark pending/retry_pending deliveries as cancelled
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

          // Update campaign
          await existing.update({
            status: 'cancelled',
            cancelledCount: (existing.get('cancelledCount') || 0) + Number(cancelCount),
            cancelledAt: new Date()
          }, { transaction: t });

          await writeAuthAuditLog({
            action: 'CAMPAIGN_CANCELLED',
            adminUserId: actor.id,
            metadata: { campaign_id: campaignId, cancelled_delivery_count: Number(cancelCount) }
          }, t);

          return existing;
        });

        return sendSuccess(response, 'Campaign cancelled', serializeCampaign(campaign));
      } catch (error) {
        next(error);
      }
    }
  };
}
