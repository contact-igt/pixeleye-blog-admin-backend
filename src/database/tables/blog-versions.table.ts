import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type BlogVersionType = 'draft' | 'published';
export type BlogContentJson = unknown;
export type BlogBlocksJson = unknown;

export class BlogVersion extends Model<
  InferAttributes<BlogVersion, { omit: 'createdAt' }>,
  InferCreationAttributes<BlogVersion, { omit: 'createdAt' }>
> {
  declare id: CreationOptional<string>;
  declare blogId: string;
  declare versionNumber: number;
  declare versionType: BlogVersionType;
  declare title: string;
  declare excerpt: string | null;
  declare contentJson: BlogContentJson | null;
  declare contentHtml: string | null;
  declare seoTitle: string | null;
  declare seoDescription: string | null;
  declare canonicalUrl: string | null;
  declare featuredMediaId: string | null;
  declare templateKey: string;
  declare templateVersion: number;
  declare templateConfigJson: Record<string, unknown>;
  declare blocksJson: BlogBlocksJson | null;
  declare createdBy: string | null;
  declare createdAt: CreationOptional<Date>;
}

export type BlogVersionAttributes = InferAttributes<BlogVersion>;
export type BlogVersionCreationAttributes = InferCreationAttributes<BlogVersion, { omit: 'createdAt' }>;
export type BlogVersionInstance = BlogVersion;
export type BlogVersionStatic = typeof BlogVersion;

export function initializeBlogVersionTable(sequelize: Sequelize): typeof BlogVersion {
  if (sequelize.models.BlogVersion === BlogVersion) return BlogVersion;
  if (sequelize.models.BlogVersion) return sequelize.models.BlogVersion as typeof BlogVersion;

  BlogVersion.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blogId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'blog_id', references: { model: tableNames.BLOGS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      versionNumber: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'version_number' },
      versionType: { type: DataTypes.STRING(40), allowNull: false, field: 'version_type' },
      title: { type: DataTypes.STRING(180), allowNull: false },
      excerpt: { type: DataTypes.TEXT, allowNull: true },
      contentJson: { type: DataTypes.JSON, allowNull: true, field: 'content_json' },
      contentHtml: { type: DataTypes.TEXT('long'), allowNull: true, field: 'content_html' },
      seoTitle: { type: DataTypes.STRING(70), allowNull: true, field: 'seo_title' },
      seoDescription: { type: DataTypes.STRING(170), allowNull: true, field: 'seo_description' },
      canonicalUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'canonical_url' },
      featuredMediaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'featured_media_id', references: { model: tableNames.MEDIA_ASSETS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      templateKey: { type: DataTypes.STRING(80), allowNull: false, field: 'template_key' },
      templateVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'template_version' },
      templateConfigJson: { type: DataTypes.JSON, allowNull: false, field: 'template_config_json' },
      blocksJson: { type: DataTypes.JSON, allowNull: true, field: 'blocks_json' },
      createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'created_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' }
    },
    {
      sequelize,
      modelName: 'BlogVersion',
      tableName: tableNames.BLOG_VERSIONS,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [
        { name: 'idx_blog_versions_blog_id', fields: ['blog_id'] },
        { name: 'idx_blog_versions_template', fields: ['template_key', 'template_version'] },
        { name: 'idx_blog_versions_version_type', fields: ['version_type'] },
        { name: 'idx_blog_versions_version_number', fields: ['version_number'] },
        { name: 'idx_blog_versions_created_at', fields: ['created_at'] }
      ]
    }
  );

  return BlogVersion;
}
