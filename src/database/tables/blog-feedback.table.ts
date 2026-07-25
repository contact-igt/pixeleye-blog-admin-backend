import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type FeedbackResponse = 'yes' | 'no';

export class BlogFeedback extends Model<InferAttributes<BlogFeedback>, InferCreationAttributes<BlogFeedback>> {
  declare id: CreationOptional<string>;
  declare blogId: string;
  declare blogVersionId: string;
  declare response: FeedbackResponse;
  declare visitorKeyHash: string;
  declare userAgentHash: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type BlogFeedbackAttributes = InferAttributes<BlogFeedback>;
export type BlogFeedbackCreationAttributes = InferCreationAttributes<BlogFeedback>;
export type BlogFeedbackInstance = BlogFeedback;
export type BlogFeedbackStatic = typeof BlogFeedback;

export function initializeBlogFeedbackTable(sequelize: Sequelize): typeof BlogFeedback {
  if (sequelize.models.BlogFeedback === BlogFeedback) return BlogFeedback;
  if (sequelize.models.BlogFeedback) return sequelize.models.BlogFeedback as typeof BlogFeedback;

  BlogFeedback.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      blogId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'blog_id', references: { model: tableNames.BLOGS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      blogVersionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'blog_version_id', references: { model: tableNames.BLOG_VERSIONS, key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      response: { type: DataTypes.STRING(10), allowNull: false },
      visitorKeyHash: { type: DataTypes.STRING(255), allowNull: false, field: 'visitor_key_hash' },
      userAgentHash: { type: DataTypes.STRING(255), allowNull: true, field: 'user_agent_hash' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'BlogFeedback',
      tableName: tableNames.BLOG_FEEDBACK,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_blog_feedback_blog_id', fields: ['blog_id'] },
        { name: 'idx_blog_feedback_blog_version_id', fields: ['blog_version_id'] },
        { name: 'idx_blog_feedback_response', fields: ['response'] },
        { name: 'idx_blog_feedback_created_at', fields: ['created_at'] },
        { name: 'idx_blog_feedback_version_visitor_unique', fields: ['blog_version_id', 'visitor_key_hash'], unique: true }
      ]
    }
  );

  return BlogFeedback;
}
