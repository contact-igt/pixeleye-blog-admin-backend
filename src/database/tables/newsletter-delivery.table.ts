import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type DeliveryStatus = 'pending' | 'processing' | 'sent' | 'retry_pending' | 'failed' | 'cancelled' | 'uncertain';

export class NewsletterDelivery extends Model<InferAttributes<NewsletterDelivery>, InferCreationAttributes<NewsletterDelivery>> {
  declare id: CreationOptional<string>;
  declare campaignId: string;
  declare subscriberId: string;
  declare status: CreationOptional<DeliveryStatus>;
  declare attemptCount: CreationOptional<number>;
  declare nextAttemptAt: Date | null;
  declare providerMessageId: string | null;
  declare lastErrorCode: string | null;
  declare lastErrorMessage: string | null;
  declare sentAt: Date | null;
  declare failedAt: Date | null;
  declare processingStartedAt: Date | null;
  declare failureReason: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type NewsletterDeliveryAttributes = InferAttributes<NewsletterDelivery>;
export type NewsletterDeliveryCreationAttributes = InferCreationAttributes<NewsletterDelivery>;
export type NewsletterDeliveryInstance = NewsletterDelivery;
export type NewsletterDeliveryStatic = typeof NewsletterDelivery;

export function initializeNewsletterDeliveryTable(sequelize: Sequelize): typeof NewsletterDelivery {
  if (sequelize.models.NewsletterDelivery === NewsletterDelivery) return NewsletterDelivery;
  if (sequelize.models.NewsletterDelivery) return sequelize.models.NewsletterDelivery as typeof NewsletterDelivery;

  NewsletterDelivery.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      campaignId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'campaign_id', references: { model: tableNames.NEWSLETTER_CAMPAIGNS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      subscriberId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'subscriber_id', references: { model: tableNames.NEWSLETTER_SUBSCRIBERS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending' },
      attemptCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'attempt_count' },
      nextAttemptAt: { type: DataTypes.DATE, allowNull: true, field: 'next_attempt_at' },
      providerMessageId: { type: DataTypes.STRING(255), allowNull: true, field: 'provider_message_id' },
      lastErrorCode: { type: DataTypes.STRING(100), allowNull: true, field: 'last_error_code' },
      lastErrorMessage: { type: DataTypes.TEXT, allowNull: true, field: 'last_error_message' },
      sentAt: { type: DataTypes.DATE, allowNull: true, field: 'sent_at' },
      failedAt: { type: DataTypes.DATE, allowNull: true, field: 'failed_at' },
      processingStartedAt: { type: DataTypes.DATE, allowNull: true, field: 'processing_started_at' },
      failureReason: { type: DataTypes.TEXT, allowNull: true, field: 'failure_reason' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'NewsletterDelivery',
      tableName: tableNames.NEWSLETTER_DELIVERIES,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_newsletter_deliveries_campaign_id', fields: ['campaign_id'] },
        { name: 'idx_newsletter_deliveries_subscriber_id', fields: ['subscriber_id'] },
        { name: 'idx_newsletter_deliveries_status', fields: ['status'] },
        { name: 'idx_newsletter_deliveries_next_attempt_at', fields: ['next_attempt_at'] },
        { name: 'idx_newsletter_deliveries_campaign_subscriber_unique', fields: ['campaign_id', 'subscriber_id'], unique: true }
      ]
    }
  );

  return NewsletterDelivery;
}
