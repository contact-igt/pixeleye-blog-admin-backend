import type { Sequelize } from 'sequelize';
import { sequelize as defaultSequelize } from '../../config/database.js';
import { AdminSession, initializeAdminSessionTable } from '../tables/admin-sessions.table.js';
import { AdminUser, initializeAdminUserTable } from '../tables/admin-users.table.js';
import { AuditLog, initializeAuditLogTable } from '../tables/audit-logs.table.js';
import { BlogVersion, initializeBlogVersionTable } from '../tables/blog-versions.table.js';
import { Blog, initializeBlogTable } from '../tables/blogs.table.js';
import { MediaAsset, initializeMediaAssetTable } from '../tables/media-assets.table.js';

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
}

const initializedAuthSequelizeInstances = new WeakSet<Sequelize>();
const initializedMediaSequelizeInstances = new WeakSet<Sequelize>();
const initializedBlogSequelizeInstances = new WeakSet<Sequelize>();

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
    initializedBlogSequelizeInstances.add(sequelize);
  }

  return {
    Blog: sequelize.models.Blog as typeof Blog,
    BlogVersion: sequelize.models.BlogVersion as typeof BlogVersion
  };
}
