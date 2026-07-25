import type { Sequelize } from 'sequelize';
import { sequelize as defaultSequelize } from '../../config/database.js';
import { initializeAuthModels, initializeBlogModels, initializeCustomTemplateModels, initializeMediaModels } from '../models/index.js';

const authAssociationsBySequelize = new WeakSet<Sequelize>();
const mediaAssociationsBySequelize = new WeakSet<Sequelize>();
const blogAssociationsBySequelize = new WeakSet<Sequelize>();
const customTemplateAssociationsBySequelize = new WeakSet<Sequelize>();

export function initializeAuthAssociations(sequelize: Sequelize = defaultSequelize) {
  if (authAssociationsBySequelize.has(sequelize)) {
    return initializeAuthModels(sequelize);
  }

  const { AdminUser, AdminSession, AuditLog } = initializeAuthModels(sequelize);

  AdminUser.hasMany(AdminSession, {
    foreignKey: 'adminUserId',
    sourceKey: 'id',
    as: 'sessions',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });
  AdminSession.belongsTo(AdminUser, {
    foreignKey: 'adminUserId',
    targetKey: 'id',
    as: 'adminUser',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });

  AdminUser.hasMany(AuditLog, {
    foreignKey: 'adminUserId',
    sourceKey: 'id',
    as: 'auditLogs',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  AuditLog.belongsTo(AdminUser, {
    foreignKey: 'adminUserId',
    targetKey: 'id',
    as: 'adminUser',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });

  AdminSession.belongsTo(AdminSession, {
    foreignKey: 'replacedBySessionId',
    targetKey: 'id',
    as: 'replacedBySession',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  AdminSession.hasMany(AdminSession, {
    foreignKey: 'replacedBySessionId',
    sourceKey: 'id',
    as: 'replacementSessions',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  AdminSession.belongsTo(AdminSession, {
    foreignKey: 'parentSessionId',
    targetKey: 'id',
    as: 'parentSession',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  AdminSession.hasMany(AdminSession, {
    foreignKey: 'parentSessionId',
    sourceKey: 'id',
    as: 'childSessions',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });

  authAssociationsBySequelize.add(sequelize);

  return { AdminUser, AdminSession, AuditLog };
}
export function initializeMediaAssociations(sequelize: Sequelize = defaultSequelize) {
  if (mediaAssociationsBySequelize.has(sequelize)) {
    return { ...initializeAuthModels(sequelize), ...initializeMediaModels(sequelize) };
  }

  const { AdminUser } = initializeAuthModels(sequelize);
  const { MediaAsset } = initializeMediaModels(sequelize);

  MediaAsset.belongsTo(AdminUser, { foreignKey: 'uploadedBy', as: 'uploadedByAdmin', constraints: false });
  MediaAsset.belongsTo(AdminUser, { foreignKey: 'trashedBy', as: 'trashedByAdmin', constraints: false });
  MediaAsset.belongsTo(AdminUser, { foreignKey: 'restoredBy', as: 'restoredByAdmin', constraints: false });
  MediaAsset.belongsTo(AdminUser, { foreignKey: 'deletedBy', as: 'deletedByAdmin', constraints: false });
  AdminUser.hasMany(MediaAsset, { foreignKey: 'uploadedBy', as: 'mediaAssets', constraints: false });

  mediaAssociationsBySequelize.add(sequelize);

  return { AdminUser, MediaAsset };
}

export function initializeBlogAssociations(sequelize: Sequelize = defaultSequelize) {
  if (blogAssociationsBySequelize.has(sequelize)) {
    return { ...initializeAuthModels(sequelize), ...initializeMediaModels(sequelize), ...initializeBlogModels(sequelize) };
  }

  const { AdminUser } = initializeAuthModels(sequelize);
  const { MediaAsset } = initializeMediaModels(sequelize);
  const { Blog, BlogVersion } = initializeBlogModels(sequelize);

  Blog.belongsTo(AdminUser, { foreignKey: 'authorId', as: 'author', constraints: false });
  Blog.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator', constraints: false });
  Blog.belongsTo(AdminUser, { foreignKey: 'updatedBy', as: 'updater', constraints: false });
  Blog.belongsTo(AdminUser, { foreignKey: 'trashedBy', as: 'trashedByAdmin', constraints: false });
  Blog.belongsTo(AdminUser, { foreignKey: 'restoredBy', as: 'restoredByAdmin', constraints: false });
  Blog.belongsTo(MediaAsset, { foreignKey: 'featuredMediaId', as: 'featuredMedia', constraints: false });
  Blog.hasMany(BlogVersion, { foreignKey: 'blogId', as: 'versions', constraints: false });
  Blog.belongsTo(BlogVersion, { foreignKey: 'currentDraftVersionId', as: 'currentDraftVersion', constraints: false });
  Blog.belongsTo(BlogVersion, { foreignKey: 'currentPublishedVersionId', as: 'currentPublishedVersion', constraints: false });
  BlogVersion.belongsTo(Blog, { foreignKey: 'blogId', as: 'blog', constraints: false });
  BlogVersion.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator', constraints: false });
  BlogVersion.belongsTo(MediaAsset, { foreignKey: 'featuredMediaId', as: 'featuredMedia', constraints: false });

  blogAssociationsBySequelize.add(sequelize);
  return { AdminUser, MediaAsset, Blog, BlogVersion };
}

export function initializeCustomTemplateAssociations(sequelize: Sequelize = defaultSequelize) {
  if (customTemplateAssociationsBySequelize.has(sequelize)) {
    return {
      ...initializeAuthModels(sequelize),
      ...initializeBlogModels(sequelize),
      ...initializeCustomTemplateModels(sequelize)
    };
  }

  const { AdminUser } = initializeAuthModels(sequelize);
  const { BlogVersion } = initializeBlogModels(sequelize);
  const { CustomTemplate, CustomTemplateVersion } = initializeCustomTemplateModels(sequelize);

  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'ownerId', as: 'owner', constraints: false });
  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'creator', constraints: false });
  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'updatedBy', as: 'updater', constraints: false });
  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'activatedBy', as: 'activatedByAdmin', constraints: false });
  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'archivedBy', as: 'archivedByAdmin', constraints: false });
  CustomTemplate.belongsTo(AdminUser, { foreignKey: 'restoredBy', as: 'restoredByAdmin', constraints: false });
  CustomTemplate.belongsTo(CustomTemplateVersion, { foreignKey: 'currentVersionId', as: 'currentVersion', constraints: false });
  CustomTemplate.hasMany(CustomTemplateVersion, { foreignKey: 'customTemplateId', as: 'versions', constraints: false });

  CustomTemplateVersion.belongsTo(CustomTemplate, { foreignKey: 'customTemplateId', as: 'template', constraints: false });
  CustomTemplateVersion.belongsTo(AdminUser, { foreignKey: 'createdBy', as: 'createdByAdmin', constraints: false });

  BlogVersion.belongsTo(CustomTemplate, { foreignKey: 'customTemplateId', as: 'customTemplate', constraints: false });
  BlogVersion.belongsTo(CustomTemplateVersion, { foreignKey: 'customTemplateVersionId', as: 'customTemplateVersion', constraints: false });

  customTemplateAssociationsBySequelize.add(sequelize);
  return { AdminUser, BlogVersion, CustomTemplate, CustomTemplateVersion };
}
