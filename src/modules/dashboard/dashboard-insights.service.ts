import { Op } from 'sequelize';
import { Blog } from '../blogs/blog.model.js';
import { BlogFeedback } from '../blogs/blog-feedback.model.js';
import { MediaAsset } from '../media/media.model.js';
import { NewsletterCampaign } from '../newsletters/newsletter-campaign.model.js';
import { NewsletterDelivery } from '../newsletters/newsletter-delivery.model.js';
import { NewsletterSubscriber } from '../newsletters/newsletter-subscriber.model.js';
import { readWorkerHealth } from '../newsletters/newsletter-worker-health.js';
import { AdminUser, AuditLog } from '../auth/index.js';
import { logger } from '../../config/logger.js';

export interface DashboardInsights {
  editorial: {
    unpublished: number;
    published_last_7_days: number;
    published_last_30_days: number;
    created_last_7_days: number;
    created_last_30_days: number;
  };
  media_quality: {
    failed_deletion_count: number;
    uploaded_last_7_days: number;
    missing_alt_assets: Array<{ id: string; original_file_name: string; purpose: string }>;
  };
  newsletter: {
    subscribers: { total: number; subscribed: number; pending: number; unsubscribed: number };
    campaigns: { total: number; draft: number; active: number; paused: number; completed: number; failed: number };
    deliveries: { pending: number; processing: number; sent: number; retry_pending: number; failed: number; uncertain: number };
    worker: Awaited<ReturnType<typeof readWorkerHealth>>;
  };
  feedback: { yes_count: number; no_count: number; total_count: number; helpful_percentage: number };
  recent_campaigns: Array<{
    id: string; subject: string; status: string; total_recipients: number; sent_count: number;
    failed_count: number; updated_at: string;
  }>;
  recent_activity: Array<{ id: string; action: string; entity_type: string | null; entity_id: string | null; actor_name: string | null; created_at: string }>;
}

export function createEmptyDashboardInsights(): DashboardInsights {
  return {
    editorial: {
      unpublished: 0,
      published_last_7_days: 0,
      published_last_30_days: 0,
      created_last_7_days: 0,
      created_last_30_days: 0
    },
    media_quality: { failed_deletion_count: 0, uploaded_last_7_days: 0, missing_alt_assets: [] },
    newsletter: {
      subscribers: { total: 0, subscribed: 0, pending: 0, unsubscribed: 0 },
      campaigns: { total: 0, draft: 0, active: 0, paused: 0, completed: 0, failed: 0 },
      deliveries: { pending: 0, processing: 0, sent: 0, retry_pending: 0, failed: 0, uncertain: 0 },
      worker: {
        worker_status: 'offline', claim_status: 'unknown', database_status: 'unknown', smtp_status: 'unknown',
        active_worker_count: 0, stale_worker_count: 0, latest_heartbeat_at: null, heartbeat_age_seconds: null,
        latest_worker: null, thresholds: { heartbeat_interval_seconds: 0, stale_after_seconds: 0 }
      }
    },
    feedback: { yes_count: 0, no_count: 0, total_count: 0, helpful_percentage: 0 },
    recent_campaigns: [],
    recent_activity: []
  };
}

export async function getDashboardInsights(): Promise<DashboardInsights> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const visibleCampaign = { deletedAt: null };

  const [
    unpublished,
    failedDeletionCount,
    subscribersTotal,
    subscribersSubscribed,
    subscribersPending,
    subscribersUnsubscribed,
    campaignsTotal,
    campaignsDraft,
    campaignsActive,
    campaignsCompleted,
    campaignsPaused,
    campaignsFailed,
    deliveriesPending,
    deliveriesProcessing,
    deliveriesSent,
    deliveriesRetryPending,
    deliveriesFailed,
    deliveriesUncertain,
    feedbackYes,
    feedbackNo,
    publishedLast7Days,
    publishedLast30Days,
    createdLast7Days,
    createdLast30Days,
    uploadedLast7Days,
    missingAltRows,
    recentCampaignRows,
    recentAuditRows
  ] = await Promise.all([
    Blog.count({ where: { status: 'unpublished' } }),
    MediaAsset.count({ where: { status: 'delete_failed' } }),
    NewsletterSubscriber.count(),
    NewsletterSubscriber.count({ where: { status: 'subscribed' } }),
    NewsletterSubscriber.count({ where: { status: 'pending' } }),
    NewsletterSubscriber.count({ where: { status: 'unsubscribed' } }),
    NewsletterCampaign.count({ where: visibleCampaign }),
    NewsletterCampaign.count({ where: { ...visibleCampaign, status: 'draft' } }),
    NewsletterCampaign.count({ where: { ...visibleCampaign, status: { [Op.in]: ['queued', 'sending'] } } }),
    NewsletterCampaign.count({ where: { ...visibleCampaign, status: 'completed' } }),
    NewsletterCampaign.count({ where: { ...visibleCampaign, status: 'paused' } }),
    NewsletterCampaign.count({ where: { ...visibleCampaign, status: { [Op.in]: ['failed', 'partially_failed'] } } }),
    NewsletterDelivery.count({ where: { status: 'pending' } }),
    NewsletterDelivery.count({ where: { status: 'processing' } }),
    NewsletterDelivery.count({ where: { status: 'sent' } }),
    NewsletterDelivery.count({ where: { status: 'retry_pending' } }),
    NewsletterDelivery.count({ where: { status: 'failed' } }),
    NewsletterDelivery.count({ where: { status: 'uncertain' } }),
    BlogFeedback.count({ where: { response: 'yes' } }),
    BlogFeedback.count({ where: { response: 'no' } }),
    Blog.count({ where: { status: 'published', publishedAt: { [Op.gte]: weekAgo } } }),
    Blog.count({ where: { status: 'published', publishedAt: { [Op.gte]: monthAgo } } }),
    Blog.count({ where: { createdAt: { [Op.gte]: weekAgo } } }),
    Blog.count({ where: { createdAt: { [Op.gte]: monthAgo } } }),
    MediaAsset.count({ where: { status: 'active', createdAt: { [Op.gte]: weekAgo } } }),
    MediaAsset.findAll({
      where: {
        status: 'active',
        [Op.or]: [{ altText: null }, { altText: '' }]
      },
      limit: 5,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'originalFileName', 'purpose']
    }),
    NewsletterCampaign.findAll({
      where: visibleCampaign,
      limit: 5,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'subject', 'status', 'totalRecipients', 'sentCount', 'failedCount', 'updatedAt']
    }),
    AuditLog.findAll({
      limit: 6,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'action', 'entityType', 'entityId', 'createdAt'],
      include: [{ model: AdminUser, as: 'adminUser', attributes: ['name'] }]
    }).catch((error) => {
      logger.warn({ err: error }, 'Dashboard audit activity is temporarily unavailable');
      return [];
    })
  ]);

  const worker = await readWorkerHealth();
  const feedbackTotal = feedbackYes + feedbackNo;

  return {
    editorial: {
      unpublished,
      published_last_7_days: publishedLast7Days,
      published_last_30_days: publishedLast30Days,
      created_last_7_days: createdLast7Days,
      created_last_30_days: createdLast30Days
    },
    media_quality: {
      failed_deletion_count: failedDeletionCount,
      uploaded_last_7_days: uploadedLast7Days,
      missing_alt_assets: missingAltRows.map((asset: any) => ({
        id: String(asset.id),
        original_file_name: asset.originalFileName,
        purpose: asset.purpose
      }))
    },
    newsletter: {
      subscribers: { total: subscribersTotal, subscribed: subscribersSubscribed, pending: subscribersPending, unsubscribed: subscribersUnsubscribed },
      campaigns: { total: campaignsTotal, draft: campaignsDraft, active: campaignsActive, paused: campaignsPaused, completed: campaignsCompleted, failed: campaignsFailed },
      deliveries: {
        pending: deliveriesPending,
        processing: deliveriesProcessing,
        sent: deliveriesSent,
        retry_pending: deliveriesRetryPending,
        failed: deliveriesFailed,
        uncertain: deliveriesUncertain
      },
      worker
    },
    feedback: {
      yes_count: feedbackYes,
      no_count: feedbackNo,
      total_count: feedbackTotal,
      helpful_percentage: feedbackTotal ? Math.round((feedbackYes / feedbackTotal) * 1000) / 10 : 0
    },
    recent_campaigns: recentCampaignRows.map((campaign: any) => ({
      id: String(campaign.id),
      subject: campaign.subject,
      status: campaign.status,
      total_recipients: Number(campaign.totalRecipients ?? 0),
      sent_count: Number(campaign.sentCount ?? 0),
      failed_count: Number(campaign.failedCount ?? 0),
      updated_at: new Date(campaign.updatedAt).toISOString()
    })),
    recent_activity: recentAuditRows.map((activity: any) => ({
      id: String(activity.id),
      action: activity.action,
      entity_type: activity.entityType ?? null,
      actor_name: activity.adminUser?.name ?? null,
      entity_id: activity.entityId ? String(activity.entityId) : null,
      created_at: new Date(activity.createdAt).toISOString()
    }))
  };
}
