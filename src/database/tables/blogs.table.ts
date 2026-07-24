import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type BlogStatus = 'draft' | 'published' | 'unpublished' | 'trashed';

export class Blog extends Model<InferAttributes<Blog>, InferCreationAttributes<Blog>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare status: CreationOptional<BlogStatus>;
  declare statusBeforeTrash: BlogStatus | null;
  declare authorId: string | null;
  declare featuredMediaId: string | null;
  declare currentDraftVersionId: string | null;
  declare currentPublishedVersionId: string | null;
  declare publishedAt: Date | null;
  declare unpublishedAt: Date | null;
  declare trashedAt: Date | null;
  declare trashedBy: string | null;
  declare restoredAt: Date | null;
  declare restoredBy: string | null;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type BlogAttributes = InferAttributes<Blog>;
export type BlogCreationAttributes = InferCreationAttributes<Blog>;
export type BlogInstance = Blog;
export type BlogStatic = typeof Blog;

export function initializeBlogTable(sequelize: Sequelize): typeof Blog {
  if (sequelize.models.Blog === Blog) return Blog;
  if (sequelize.models.Blog) return sequelize.models.Blog as typeof Blog;

  Blog.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      slug: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'draft' },
      statusBeforeTrash: { type: DataTypes.STRING(40), allowNull: true, field: 'status_before_trash' },
      authorId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'author_id', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      featuredMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'featured_media_id', references: { model: tableNames.MEDIA_ASSETS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      currentDraftVersionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'current_draft_version_id', references: { model: tableNames.BLOG_VERSIONS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      currentPublishedVersionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'current_published_version_id', references: { model: tableNames.BLOG_VERSIONS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' },
      unpublishedAt: { type: DataTypes.DATE, allowNull: true, field: 'unpublished_at' },
      trashedAt: { type: DataTypes.DATE, allowNull: true, field: 'trashed_at' },
      trashedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'trashed_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      restoredAt: { type: DataTypes.DATE, allowNull: true, field: 'restored_at' },
      restoredBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'restored_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'created_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'updated_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'Blog',
      tableName: tableNames.BLOGS,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_blogs_slug', fields: ['slug'], unique: true },
        { name: 'idx_blogs_status', fields: ['status'] },
        { name: 'idx_blogs_author_id', fields: ['author_id'] },
        { name: 'idx_blogs_featured_media_id', fields: ['featured_media_id'] },
        { name: 'idx_blogs_published_at', fields: ['published_at'] },
        { name: 'idx_blogs_trashed_at', fields: ['trashed_at'] },
        { name: 'idx_blogs_created_at', fields: ['created_at'] }
      ]
    }
  );

  return Blog;
}
