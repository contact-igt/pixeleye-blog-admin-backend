import { createHash } from 'node:crypto';
import type { Transaction } from 'sequelize';
import { AuditLog } from '../../auth/index.js';

export const authAuditActions = [
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILED',
  'AUTH_REFRESH_SUCCESS',
  'AUTH_REFRESH_REJECTED',
  'AUTH_LOGOUT',
  'AUTH_PASSWORD_CHANGED',
  'AUTH_ACCOUNT_LOCKED',
  'MEDIA_ASSET_UPLOADED',
  'MEDIA_ASSET_UPDATED',
  'MEDIA_MOVED_TO_TRASH',
  'MEDIA_RESTORED',
  'MEDIA_PERMANENT_DELETE_STARTED',
  'MEDIA_PERMANENTLY_DELETED',
  'MEDIA_PERMANENT_DELETE_FAILED',
  'MEDIA_AUTO_PURGED',
  'BLOG_CREATED',
  'BLOG_UPDATED',
  'BLOG_TEMPLATE_CHANGED',
  'BLOG_PUBLISHED',
  'BLOG_REPUBLISHED',
  'BLOG_UNPUBLISHED',
  'BLOG_MOVED_TO_TRASH',
  'BLOG_RESTORED',
  'MEDIA_ASSET_DELETE_FAILED',
  'MEDIA_ASSET_DELETED',
  'CUSTOM_TEMPLATE_CREATED',
  'CUSTOM_TEMPLATE_METADATA_UPDATED',
  'CUSTOM_TEMPLATE_VERSION_CREATED',
  'CUSTOM_TEMPLATE_ACTIVATED',
  'CUSTOM_TEMPLATE_ARCHIVED',
  'CUSTOM_TEMPLATE_RESTORED',
  'CUSTOM_TEMPLATE_DUPLICATED',
  'CUSTOM_TEMPLATE_PERMANENTLY_DELETED',
  'CAMPAIGN_CREATED',
  'CAMPAIGN_UPDATED',
  'CAMPAIGN_QUEUED',
  'CAMPAIGN_TEST_EMAIL_SENT',
  'CAMPAIGN_RETRY_FAILED',
  'CAMPAIGN_CANCELLED',
  'SUBSCRIBER_CSV_EXPORTED',
  'NEWSLETTER_SUBSCRIBER_CREATED',
  'NEWSLETTER_SUBSCRIBER_VERIFICATION_RESENT',
  'NEWSLETTER_SUBSCRIBER_DELETED',
  'NEWSLETTER_SUBSCRIBER_ANONYMIZED'
] as const;

export type AuthAuditAction = (typeof authAuditActions)[number];

export interface AuditContext {
  adminUserId?: string | null;
  action: AuthAuditAction;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function hashRequestValue(value?: string | null): string | null {
  if (!value) return null;
  return createHash('sha256').update(value).digest('hex');
}

function getAuditEntityId(context: AuditContext): string | null {
  const mediaAssetId = context.metadata?.media_asset_id;
  const blogId = context.metadata?.blog_id;
  const customTemplateId = context.metadata?.custom_template_id ?? context.metadata?.new_custom_template_id;
  const subscriberId = context.metadata?.subscriber_id;
  if (context.action.startsWith('BLOG_') && (typeof blogId === 'string' || typeof blogId === 'number')) return String(blogId);
  if (context.action.startsWith('MEDIA_') && (typeof mediaAssetId === 'string' || typeof mediaAssetId === 'number')) {
    return String(mediaAssetId);
  }
  if (context.action.startsWith('CUSTOM_TEMPLATE_') && (typeof customTemplateId === 'string' || typeof customTemplateId === 'number')) {
    return String(customTemplateId);
  }
  if (context.action.startsWith('NEWSLETTER_SUBSCRIBER_') && (typeof subscriberId === 'string' || typeof subscriberId === 'number')) {
    return String(subscriberId);
  }
  return context.adminUserId ?? null;
}

export async function writeAuthAuditLog(context: AuditContext, transaction?: Transaction): Promise<void> {
  const payload = {
    adminUserId: context.adminUserId ?? null,
    action: context.action,
    entityType: context.action.startsWith('MEDIA_')
      ? 'media_asset'
      : context.action.startsWith('BLOG_')
        ? 'blog'
        : context.action.startsWith('CUSTOM_TEMPLATE_')
          ? 'custom_template'
          : context.action.startsWith('NEWSLETTER_SUBSCRIBER_')
            ? 'newsletter_subscriber'
            : 'admin_auth',
    entityId: getAuditEntityId(context),
    requestId: context.requestId ?? null,
    ipHash: hashRequestValue(context.ip),
    userAgent: context.userAgent?.slice(0, 500) ?? null,
    metadata: context.metadata ?? null
  } as any;
  if (transaction) {
    await AuditLog.create(payload, { transaction });
  } else {
    await AuditLog.create(payload);
  }
}
