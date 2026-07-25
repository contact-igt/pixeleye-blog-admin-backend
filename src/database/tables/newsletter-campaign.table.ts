import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type CampaignStatus = 'draft' | 'queued' | 'sending' | 'completed' | 'partially_failed' | 'failed' | 'cancelled';

export class NewsletterCampaign extends Model<InferAttributes<NewsletterCampaign>, InferCreationAttributes<NewsletterCampaign>> {
  declare id: CreationOptional<string>;
  declare blogId: string;
  declare blogVersionId: string;
  declare subject: string;
  declare previewText: string | null;
  declare status: CreationOptional<CampaignStatus>;
  declare totalRecipients: CreationOptional<number>;
  declare queuedCount: CreationOptional<number>;
  declare sentCount: CreationOptional<number>;
  declare failedCount: CreationOptional<number>;
  declare cancelledCount: CreationOptional<number>;
  declare createdBy: string | null;
  declare scheduledAt: Date | null;
  declare queuedAt: Date | null;
  declare startedAt: Date | null;
  declare completedAt: Date | null;
  declare cancelledAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type NewsletterCampaignAttributes = InferAttributes<NewsletterCampaign>;
export type NewsletterCampaignCreationAttributes = InferCreationAttributes<NewsletterCampaign>;
export type NewsletterCampaignInstance = NewsletterCampaign;
export type NewsletterCampaignStatic = typeof NewsletterCampaign;

export function initializeNewsletterCampaignTable(sequelize: Sequelize): typeof NewsletterCampaign {
  if (sequelize.models.NewsletterCampaign === NewsletterCampaign) return NewsletterCampaign;
  if (sequelize.models.NewsletterCampaign) return sequelize.models.NewsletterCampaign as typeof NewsletterCampaign;

  NewsletterCampaign.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blogId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'blog_id', references: { model: tableNames.BLOGS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      blogVersionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'blog_version_id', references: { model: tableNames.BLOG_VERSIONS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      previewText: { type: DataTypes.STRING(255), allowNull: true, field: 'preview_text' },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'draft' },
      totalRecipients: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'total_recipients' },
      queuedCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'queued_count' },
      sentCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'sent_count' },
      failedCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'failed_count' },
      cancelledCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'cancelled_count' },
      createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'created_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      scheduledAt: { type: DataTypes.DATE, allowNull: true, field: 'scheduled_at' },
      queuedAt: { type: DataTypes.DATE, allowNull: true, field: 'queued_at' },
      startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
      completedAt: { type: DataTypes.DATE, allowNull: true, field: 'completed_at' },
      cancelledAt: { type: DataTypes.DATE, allowNull: true, field: 'cancelled_at' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'NewsletterCampaign',
      tableName: tableNames.NEWSLETTER_CAMPAIGNS,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_newsletter_campaigns_blog_id', fields: ['blog_id'] },
        { name: 'idx_newsletter_campaigns_blog_version_id', fields: ['blog_version_id'] },
        { name: 'idx_newsletter_campaigns_status', fields: ['status'] },
        { name: 'idx_newsletter_campaigns_created_at', fields: ['created_at'] }
      ]
    }
  );

  return NewsletterCampaign;
}
