import type { Sequelize } from 'sequelize';
import { sequelize as defaultSequelize } from '../../config/database.js';
import { AdminSession, initializeAdminSessionTable } from '../tables/admin-sessions.table.js';
import { AdminUser, initializeAdminUserTable } from '../tables/admin-users.table.js';
import { AuditLog, initializeAuditLogTable } from '../tables/audit-logs.table.js';
import { BlogFeedback, initializeBlogFeedbackTable } from '../tables/blog-feedback.table.js';
import { BlogVersion, initializeBlogVersionTable } from '../tables/blog-versions.table.js';
import { Blog, initializeBlogTable } from '../tables/blogs.table.js';
import { CustomTemplateVersion, initializeCustomTemplateVersionTable } from '../tables/custom-template-versions.table.js';
import { CustomTemplate, initializeCustomTemplateTable } from '../tables/custom-templates.table.js';
import { MediaAsset, initializeMediaAssetTable } from '../tables/media-assets.table.js';
import { NewsletterCampaign, initializeNewsletterCampaignTable } from '../tables/newsletter-campaign.table.js';
import { NewsletterDelivery, initializeNewsletterDeliveryTable } from '../tables/newsletter-delivery.table.js';
import { NewsletterSubscriber, initializeNewsletterSubscriberTable } from '../tables/newsletter-subscriber.table.js';
import { NewsletterWorkerHeartbeat, initializeNewsletterWorkerHeartbeatTable } from '../tables/newsletter-worker-heartbeat.table.js';

export interface AuthModels {
  AdminUser: typeof AdminUser;
  AdminSession: typeof AdminSession;
  AuditLog: typeof AuditLog;
}

export interface MediaModels {
  MediaAsset: typeof MediaAsset;
}

export interface BlogModels {
  Blog: typeof Blog;
  BlogVersion: typeof BlogVersion;
  BlogFeedback: typeof BlogFeedback;
}

export interface CustomTemplateModels {
  CustomTemplate: typeof CustomTemplate;
  CustomTemplateVersion: typeof CustomTemplateVersion;
}

export interface NewsletterModels {
  NewsletterSubscriber: typeof NewsletterSubscriber;
  NewsletterCampaign: typeof NewsletterCampaign;
  NewsletterDelivery: typeof NewsletterDelivery;
  NewsletterWorkerHeartbeat: typeof NewsletterWorkerHeartbeat;
}

const initializedAuthSequelizeInstances = new WeakSet<Sequelize>();
const initializedMediaSequelizeInstances = new WeakSet<Sequelize>();
const initializedBlogSequelizeInstances = new WeakSet<Sequelize>();
const initializedCustomTemplateSequelizeInstances = new WeakSet<Sequelize>();
const initializedNewsletterSequelizeInstances = new WeakSet<Sequelize>();

export function initializeAuthModels(sequelize: Sequelize = defaultSequelize): AuthModels {
  if (!initializedAuthSequelizeInstances.has(sequelize)) {
    initializeAdminUserTable(sequelize);
    initializeAdminSessionTable(sequelize);
    initializeAuditLogTable(sequelize);
    initializedAuthSequelizeInstances.add(sequelize);
  }

  return {
    AdminUser: sequelize.models.AdminUser as typeof AdminUser,
    AdminSession: sequelize.models.AdminSession as typeof AdminSession,
    AuditLog: sequelize.models.AuditLog as typeof AuditLog
  };
}
export function initializeMediaModels(sequelize: Sequelize = defaultSequelize): MediaModels {
  if (!initializedMediaSequelizeInstances.has(sequelize)) {
    initializeMediaAssetTable(sequelize);
    initializedMediaSequelizeInstances.add(sequelize);
  }

  return {
    MediaAsset: sequelize.models.MediaAsset as typeof MediaAsset
  };
}

export function initializeBlogModels(sequelize: Sequelize = defaultSequelize): BlogModels {
  if (!initializedBlogSequelizeInstances.has(sequelize)) {
    initializeBlogTable(sequelize);
    initializeBlogVersionTable(sequelize);
    initializeBlogFeedbackTable(sequelize);
    initializedBlogSequelizeInstances.add(sequelize);
  }

  return {
    Blog: sequelize.models.Blog as typeof Blog,
    BlogVersion: sequelize.models.BlogVersion as typeof BlogVersion,
    BlogFeedback: sequelize.models.BlogFeedback as typeof BlogFeedback
  };
}

export function initializeCustomTemplateModels(sequelize: Sequelize = defaultSequelize): CustomTemplateModels {
  if (!initializedCustomTemplateSequelizeInstances.has(sequelize)) {
    initializeCustomTemplateTable(sequelize);
    initializeCustomTemplateVersionTable(sequelize);
    initializedCustomTemplateSequelizeInstances.add(sequelize);
  }

  return {
    CustomTemplate: sequelize.models.CustomTemplate as typeof CustomTemplate,
    CustomTemplateVersion: sequelize.models.CustomTemplateVersion as typeof CustomTemplateVersion
  };
}

export function initializeNewsletterModels(sequelize: Sequelize = defaultSequelize): NewsletterModels {
  if (!initializedNewsletterSequelizeInstances.has(sequelize)) {
    initializeNewsletterSubscriberTable(sequelize);
    initializeNewsletterCampaignTable(sequelize);
    initializeNewsletterDeliveryTable(sequelize);
    initializeNewsletterWorkerHeartbeatTable(sequelize);
    initializedNewsletterSequelizeInstances.add(sequelize);
  }

  return {
    NewsletterSubscriber: sequelize.models.NewsletterSubscriber as typeof NewsletterSubscriber,
    NewsletterCampaign: sequelize.models.NewsletterCampaign as typeof NewsletterCampaign,
    NewsletterDelivery: sequelize.models.NewsletterDelivery as typeof NewsletterDelivery,
    NewsletterWorkerHeartbeat: sequelize.models.NewsletterWorkerHeartbeat as typeof NewsletterWorkerHeartbeat
  };
}
