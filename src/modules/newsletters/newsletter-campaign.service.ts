import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { Blog } from '../blogs/blog.model.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import { NewsletterCampaign } from './newsletter-campaign.model.js';
import { NewsletterSubscriber } from './newsletter-subscriber.model.js';
import { NewsletterDelivery } from './newsletter-delivery.model.js';

export interface CreateCampaignRequest {
  blog_id: string;
  subject: string;
  preview_text?: string;
  created_by: string;
}

export interface CampaignDetail {
  id: string;
  blog_id: string;
  blog_version_id: string;
  subject: string;
  preview_text: string | null;
  status: string;
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  cancelled_count: number;
  created_by: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createCampaign(
  request: CreateCampaignRequest,
  transaction?: Transaction
): Promise<CampaignDetail> {
  return sequelize.transaction({ transaction }, async (t) => {
    // Verify blog exists and is published
    const blog = await Blog.findByPk(request.blog_id, {
      include: [{ model: BlogVersion, as: 'currentPublishedVersion' }],
      transaction: t
    });

    if (!blog || blog.get('status') !== 'published') {
      throw new ApiError(404, 'Blog not found or not published');
    }

    const blogPlain = blog.get?.({ plain: true }) || blog;
    const publishedVersionData = (blogPlain as any).currentPublishedVersion;
    if (!publishedVersionData) {
      throw new ApiError(422, 'No published version found for this blog');
    }

    // Create campaign in draft status
    const campaign = await NewsletterCampaign.create({
      blogId: request.blog_id,
      blogVersionId: String(publishedVersionData.id),
      subject: request.subject,
      previewText: request.preview_text || null,
      status: 'draft',
      createdBy: request.created_by
    }, { transaction: t });

    return serializeCampaign(campaign);
  });
}

export async function queueCampaign(
  campaignId: string,
  transaction?: Transaction
): Promise<CampaignDetail> {
  return sequelize.transaction({ transaction }, async (t) => {
    const campaign = await NewsletterCampaign.findByPk(campaignId, {
      include: [
        { model: Blog, as: 'blog' },
        { model: BlogVersion, as: 'blogVersion' }
      ],
      transaction: t
    });

    if (!campaign) {
      throw new ApiError(404, 'Campaign not found');
    }

    const campaignPlain = campaign.get?.({ plain: true }) || campaign;
    const campaignData = campaignPlain as any;
    if (campaignData.status !== 'draft') {
      throw new ApiError(422, 'Only draft campaigns can be queued');
    }

    // Get subscribed subscribers
    const subscribers = await NewsletterSubscriber.findAll({
      where: { status: 'subscribed' },
      attributes: ['id'],
      transaction: t
    }) as any[];

    if (subscribers.length === 0) {
      throw new ApiError(422, 'No subscribed subscribers available');
    }

    // Create delivery rows
    const deliveries = subscribers.map((sub: any) => {
      const subData = sub.get?.({ plain: true }) || sub;
      return {
        campaign_id: campaignId,
        subscriber_id: String(subData.id),
        status: 'pending'
      };
    });

    await NewsletterDelivery.bulkCreate(deliveries as any, {
      transaction: t,
      ignoreDuplicates: true
    });

    // Update campaign
    await campaign.update({
      status: 'queued',
      totalRecipients: subscribers.length,
      queuedCount: subscribers.length,
      queuedAt: new Date()
    }, { transaction: t });

    return serializeCampaign(campaign);
  });
}

export async function getCampaign(
  campaignId: string,
  transaction?: Transaction
): Promise<CampaignDetail> {
  const campaign = await NewsletterCampaign.findByPk(campaignId, {
    transaction
  });

  if (!campaign) {
    throw new ApiError(404, 'Campaign not found');
  }

  return serializeCampaign(campaign);
}

export async function updateCampaignCounts(
  campaignId: string,
  counts: Partial<{
    sentCount: number;
    failedCount: number;
    queuedCount: number;
    cancelledCount: number;
    status: string;
  }>,
  transaction?: Transaction
): Promise<void> {
  await sequelize.transaction({ transaction }, async (t) => {
    const campaign = await NewsletterCampaign.findByPk(campaignId, { transaction: t });
    if (!campaign) return;

    const updates: any = { ...counts };

    // Determine final status if needed
    if (!updates.status) {
      const sentCount = counts.sentCount ?? campaign.get('sentCount') ?? 0;
      const failedCount = counts.failedCount ?? campaign.get('failedCount') ?? 0;
      const totalRecipients = campaign.get('totalRecipients') ?? 0;

      if (sentCount + failedCount >= totalRecipients) {
        if (failedCount === 0) {
          updates.status = 'completed';
          updates.completedAt = new Date();
        } else if (sentCount > 0) {
          updates.status = 'partially_failed';
          updates.completedAt = new Date();
        } else {
          updates.status = 'failed';
          updates.completedAt = new Date();
        }
      }
    }

    await campaign.update(updates, { transaction: t });
  });
}

function serializeCampaign(campaign: any): CampaignDetail {
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

export { NewsletterCampaign };
