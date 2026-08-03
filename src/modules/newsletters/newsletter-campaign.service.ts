import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/api-error.js';
import { Blog } from '../blogs/blog.model.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import { NewsletterCampaign, type CampaignStatus } from './newsletter-campaign.model.js';

import { NewsletterDelivery, type DeliveryStatus } from './newsletter-delivery.model.js';

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
  paused_at: string | null;
  paused_by: string | null;
  pause_reason_code: string | null;
  pause_reason_message: string | null;
  auto_paused: boolean;
  resume_at: string | null;
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

export interface ReconcileCampaignStateOptions {
  /** Join an existing transaction instead of opening a new one. */
  transaction?: Transaction;
  /**
   * Row-lock the campaign for the duration of reconciliation (default true).
   * Safe to disable when the caller already holds a lock on this row within
   * the same transaction.
   */
  lock?: boolean;
}

export interface DeliveryCountBreakdown {
  total: number;
  pending: number;
  processing: number;
  retryPending: number;
  sent: number;
  failed: number;
  cancelled: number;
  uncertain: number;
}

const TERMINAL_CAMPAIGN_STATUSES: CampaignStatus[] = ['completed', 'partially_failed', 'failed'];

export function deriveCampaignStatus(
  currentStatus: CampaignStatus,
  counts: DeliveryCountBreakdown
): CampaignStatus {
  if (currentStatus === 'draft' || currentStatus === 'cancelled') return currentStatus;

  const inFlight = counts.pending + counts.processing + counts.retryPending;
  const terminalFailures = counts.failed + counts.uncertain;
  if (currentStatus === 'paused' && inFlight > 0) return 'paused';
  if (inFlight > 0) {
    return counts.processing > 0 || counts.sent > 0 || counts.failed > 0 || counts.cancelled > 0
      ? 'sending'
      : 'queued';
  }
  if (counts.total === 0) return currentStatus;
  if (counts.cancelled === counts.total && counts.sent === 0 && terminalFailures === 0) return 'cancelled';
  if (counts.sent > 0 && terminalFailures === 0) return 'completed';
  if (counts.sent > 0 && terminalFailures > 0) return 'partially_failed';
  if (counts.sent === 0 && terminalFailures > 0) return 'failed';
  return currentStatus;
}

/**
 * The single authoritative place campaign.status and the campaign counter
 * columns are derived. Call this after any operation that changes delivery
 * rows or campaign membership (queue, worker claim, delivery outcome, retry,
 * cancel, stale recovery) instead of hand-rolling counter increments or status
 * writes elsewhere — direct increments race under concurrency and drift from
 * what the delivery rows actually say.
 *
 * Column semantics (fixed by the original migration/schema, not redefined
 * here — see backend/src/database/migrations/20260725000600-create-newsletter-campaigns.cjs):
 * - total_recipients: total delivery rows that exist for the campaign.
 * - queued_count: deliveries still awaiting a terminal outcome — the sum of
 *   pending + processing + retry_pending. This is what the Admin UI's
 *   "Pending" figure is computed from (`total_recipients - sent_count -
 *   failed_count - cancelled_count`, which is algebraically the same value),
 *   kept as an explicit column so list/detail reads don't need a delivery
 *   join just to show it.
 * - sent_count / failed_count / cancelled_count: terminal delivery outcomes.
 *
 * Status rules (see the audit's Part 3 for the full state table):
 * - draft: untouched here — a campaign has no deliveries before it is queued,
 *   and the draft -> queued transition is an explicit action, not something
 *   inferred from delivery rows.
 * - cancelled: explicit and terminal. Counters are still recalculated (so
 *   sent/failed reflect exactly what happened before cancellation), but
 *   status/startedAt/completedAt are never touched.
 * - queued -> sending: as soon as any delivery has started processing, or has
 *   already resolved (sent/failed), while eligible deliveries remain.
 * - sending/queued -> completed | partially_failed | failed: once nothing is
 *   left pending/processing/retry_pending.
 */
export async function reconcileCampaignState(
  campaignId: string,
  options: ReconcileCampaignStateOptions = {}
): Promise<InstanceType<typeof NewsletterCampaign> | null> {
  const { transaction, lock = true } = options;

  return sequelize.transaction({ transaction }, async (t) => {
    const campaign = await NewsletterCampaign.findByPk(campaignId, {
      transaction: t,
      lock: lock ? t.LOCK.UPDATE : undefined
    });
    if (!campaign) return null;

    const currentStatus = campaign.get('status') as CampaignStatus;

    // Nothing to reconcile yet — deliveries don't exist until the campaign is
    // queued, and queueing is an explicit action, not a delivery-driven one.
    if (currentStatus === 'draft') {
      return campaign;
    }

    const rows = (await NewsletterDelivery.findAll({
      where: { campaignId },
      attributes: ['status'],
      raw: true,
      transaction: t
    })) as unknown as Array<{ status: DeliveryStatus }>;

    const counts: DeliveryCountBreakdown = {
      total: rows.length,
      pending: 0,
      processing: 0,
      retryPending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      uncertain: 0
    };

    for (const row of rows) {
      switch (row.status) {
        case 'pending': counts.pending += 1; break;
        case 'processing': counts.processing += 1; break;
        case 'retry_pending': counts.retryPending += 1; break;
        case 'sent': counts.sent += 1; break;
        case 'failed': counts.failed += 1; break;
        case 'cancelled': counts.cancelled += 1; break;
        case 'uncertain': counts.uncertain += 1; break;
        default: break;
      }
    }

    const inFlight = counts.pending + counts.processing + counts.retryPending;
    const counterUpdates = {
      totalRecipients: counts.total,
      queuedCount: inFlight,
      sentCount: counts.sent,
      failedCount: counts.failed + counts.uncertain,
      cancelledCount: counts.cancelled
    };

    if (currentStatus === 'cancelled') {
      // Explicit, admin-initiated terminal state — recompute counters so they
      // reflect exactly what happened, but never move status away from
      // 'cancelled' or touch its timestamps.
      await campaign.update(counterUpdates, { transaction: t });
      return campaign;
    }

    const nextStatus = deriveCampaignStatus(currentStatus, counts);

    const updates: Record<string, unknown> = { ...counterUpdates };
    if (nextStatus !== currentStatus) {
      updates.status = nextStatus;

      if (nextStatus === 'sending' && !campaign.get('startedAt')) {
        // Set once — never replaced by a later reconciliation or a retry.
        updates.startedAt = new Date();
      }

      if (TERMINAL_CAMPAIGN_STATUSES.includes(nextStatus)) {
        updates.completedAt = new Date();
      } else if (nextStatus === 'cancelled') {
        updates.cancelledAt = campaign.get('cancelledAt') ?? new Date();
        updates.completedAt = null;
      } else {
        // Moving back to queued/sending — most notably when Retry Failed
        // reopens a terminal campaign. Clear a stale completedAt from the
        // previous run so the campaign doesn't read as both "done" and
        // "active" at once; a fresh completedAt is set again once it
        // re-reaches a terminal state.
        updates.completedAt = null;
      }
    }

    await campaign.update(updates, { transaction: t });
    return campaign;
  });
}

export interface ReconciliationSweepResult {
  reconciled: number;
  failed: number;
}

/**
 * Bounded repair sweep over every campaign still marked 'queued'/'sending',
 * used by the Worker's periodic reconciliation pass (Part 6). Complements
 * the targeted reconcileCampaignState() calls the Worker already makes for
 * campaigns it just touched — this catches the cases nothing else touches:
 * a campaign left 'queued'/'sending' with no claimable delivery left (e.g.
 * every row resolved to 'uncertain', which the claim query never reclaims),
 * stale counters from a reconciliation call that threw before committing, or
 * a campaign whose last-touching tick crashed entirely. Ordered by
 * updated_at ASC and capped at `batchSize` so a large backlog is repaired
 * gradually across ticks instead of in one unbounded scan. Per-campaign
 * failures are logged and counted, never swallowed.
 */
export async function reconcileActiveCampaignsSweep(batchSize: number): Promise<ReconciliationSweepResult> {
  const activeCampaigns = await NewsletterCampaign.findAll({
    where: { status: { [Op.in]: ['queued', 'sending', 'paused'] as CampaignStatus[] }, deletedAt: null },
    attributes: ['id'],
    order: [['updatedAt', 'ASC']],
    limit: batchSize,
    raw: true
  });

  let reconciled = 0;
  let failed = 0;
  for (const campaign of activeCampaigns as unknown as Array<{ id: string }>) {
    try {
      await reconcileCampaignState(campaign.id);
      reconciled += 1;
    } catch (error) {
      failed += 1;
      logger.error(
        { campaignId: campaign.id, error: error instanceof Error ? error.message : String(error) },
        'Reconciliation sweep failed for campaign'
      );
    }
  }
  return { reconciled, failed };
}

function serializeCampaign(campaign: any): CampaignDetail {
  const data = typeof campaign.get === 'function' ? campaign.get({ plain: true }) : campaign;
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
    updated_at: new Date(data.updatedAt).toISOString()
  };
}

export { NewsletterCampaign };
