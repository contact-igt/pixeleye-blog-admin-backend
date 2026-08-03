import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';

export class NewsletterSubscriber extends Model<InferAttributes<NewsletterSubscriber>, InferCreationAttributes<NewsletterSubscriber>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare normalizedEmail: string;
  declare status: CreationOptional<SubscriberStatus>;
  declare verificationTokenHash: string | null;
  declare verificationExpiresAt: Date | null;
  declare unsubscribeTokenHash: string | null;
  declare verifiedAt: Date | null;
  declare unsubscribedAt: Date | null;
  declare source: string | null;
  declare consentText: string | null;
  declare consentVersion: string | null;
  declare consentAt: Date | null;
  declare verificationSentAt: Date | null;
  declare lastVerificationSentAt: Date | null;
  declare resubscriptionTokenHash: string | null;
  declare resubscriptionExpiresAt: Date | null;
  declare resubscriptionRequestedAt: Date | null;
  declare subscribedAt: Date | null;
  declare deletedAt: Date | null;
  declare deletedBy: string | null;
  declare deletionReason: string | null;
  declare anonymizedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type NewsletterSubscriberAttributes = InferAttributes<NewsletterSubscriber>;
export type NewsletterSubscriberCreationAttributes = InferCreationAttributes<NewsletterSubscriber>;
export type NewsletterSubscriberInstance = NewsletterSubscriber;
export type NewsletterSubscriberStatic = typeof NewsletterSubscriber;

export function initializeNewsletterSubscriberTable(sequelize: Sequelize): typeof NewsletterSubscriber {
  if (sequelize.models.NewsletterSubscriber === NewsletterSubscriber) return NewsletterSubscriber;
  if (sequelize.models.NewsletterSubscriber) return sequelize.models.NewsletterSubscriber as typeof NewsletterSubscriber;

  NewsletterSubscriber.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      email: { type: DataTypes.STRING(255), allowNull: false },
      normalizedEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'normalized_email', unique: true },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending' },
      verificationTokenHash: { type: DataTypes.STRING(255), allowNull: true, field: 'verification_token_hash' },
      verificationExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'verification_expires_at' },
      unsubscribeTokenHash: { type: DataTypes.STRING(255), allowNull: true, field: 'unsubscribe_token_hash' },
      verifiedAt: { type: DataTypes.DATE, allowNull: true, field: 'verified_at' },
      unsubscribedAt: { type: DataTypes.DATE, allowNull: true, field: 'unsubscribed_at' },
      source: { type: DataTypes.STRING(100), allowNull: true },
      consentText: { type: DataTypes.TEXT, allowNull: true, field: 'consent_text' },
      consentVersion: { type: DataTypes.STRING(40), allowNull: true, field: 'consent_version' },
      consentAt: { type: DataTypes.DATE, allowNull: true, field: 'consent_at' },
      verificationSentAt: { type: DataTypes.DATE, allowNull: true, field: 'verification_sent_at' },
      lastVerificationSentAt: { type: DataTypes.DATE, allowNull: true, field: 'last_verification_sent_at' },
      resubscriptionTokenHash: { type: DataTypes.STRING(255), allowNull: true, field: 'resubscription_token_hash' },
      resubscriptionExpiresAt: { type: DataTypes.DATE(3), allowNull: true, field: 'resubscription_expires_at' },
      resubscriptionRequestedAt: { type: DataTypes.DATE(3), allowNull: true, field: 'resubscription_requested_at' },
      subscribedAt: { type: DataTypes.DATE(3), allowNull: true, field: 'subscribed_at' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
      deletedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'deleted_by' },
      deletionReason: { type: DataTypes.STRING(255), allowNull: true, field: 'deletion_reason' },
      anonymizedAt: { type: DataTypes.DATE, allowNull: true, field: 'anonymized_at' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'NewsletterSubscriber',
      tableName: tableNames.NEWSLETTER_SUBSCRIBERS,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_newsletter_subscribers_normalized_email', fields: ['normalized_email'], unique: true },
        { name: 'idx_newsletter_subscribers_status', fields: ['status'] },
        { name: 'idx_newsletter_subscribers_created_at', fields: ['created_at'] },
        { name: 'idx_newsletter_subscribers_verified_at', fields: ['verified_at'] },
        { name: 'idx_newsletter_subscribers_unsubscribed_at', fields: ['unsubscribed_at'] },
        { name: 'idx_newsletter_subscribers_deleted_at', fields: ['deleted_at'] }
      ]
    }
  );

  return NewsletterSubscriber;
}
