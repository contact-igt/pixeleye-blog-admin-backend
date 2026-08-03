import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type NewsletterWorkerRuntimeStatus = 'starting' | 'active' | 'degraded' | 'stopping' | 'stopped' | 'failed';
export type NewsletterWorkerClaimStatus = 'healthy' | 'idle' | 'processing' | 'claim_failed' | 'blocked' | 'unknown';

export class NewsletterWorkerHeartbeat extends Model<
  InferAttributes<NewsletterWorkerHeartbeat>,
  InferCreationAttributes<NewsletterWorkerHeartbeat>
> {
  declare workerInstanceId: string;
  declare processId: number;
  declare hostname: string;
  declare status: CreationOptional<NewsletterWorkerRuntimeStatus>;
  declare claimStatus: CreationOptional<NewsletterWorkerClaimStatus>;
  declare databaseReady: CreationOptional<boolean>;
  declare smtpReady: CreationOptional<boolean>;
  declare startedAt: Date;
  declare lastHeartbeatAt: Date;
  declare lastSuccessfulPollAt: Date | null;
  declare lastSuccessfulClaimAt: Date | null;
  declare lastSuccessfulSendAt: Date | null;
  declare lastErrorCode: string | null;
  declare lastErrorMessage: string | null;
  declare consecutivePollFailures: CreationOptional<number>;
  declare consecutiveClaimFailures: CreationOptional<number>;
  declare lastClaimErrorAt: Date | null;
  declare lastHeartbeatErrorAt: Date | null;
  declare lastRecoveryAt: Date | null;
  declare stoppedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type NewsletterWorkerHeartbeatAttributes = InferAttributes<NewsletterWorkerHeartbeat>;
export type NewsletterWorkerHeartbeatCreationAttributes = InferCreationAttributes<NewsletterWorkerHeartbeat>;
export type NewsletterWorkerHeartbeatInstance = NewsletterWorkerHeartbeat;
export type NewsletterWorkerHeartbeatStatic = typeof NewsletterWorkerHeartbeat;

export function initializeNewsletterWorkerHeartbeatTable(sequelize: Sequelize): typeof NewsletterWorkerHeartbeat {
  if (sequelize.models.NewsletterWorkerHeartbeat === NewsletterWorkerHeartbeat) return NewsletterWorkerHeartbeat;
  if (sequelize.models.NewsletterWorkerHeartbeat) {
    return sequelize.models.NewsletterWorkerHeartbeat as typeof NewsletterWorkerHeartbeat;
  }

  NewsletterWorkerHeartbeat.init(
    {
      workerInstanceId: {
        type: DataTypes.STRING(100),
        allowNull: false,
        primaryKey: true,
        field: 'worker_instance_id'
      },
      processId: { type: DataTypes.INTEGER, allowNull: false, field: 'process_id' },
      hostname: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'starting' },
      claimStatus: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unknown', field: 'claim_status' },
      databaseReady: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'database_ready' },
      smtpReady: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'smtp_ready' },
      startedAt: { type: DataTypes.DATE(3), allowNull: false, field: 'started_at' },
      lastHeartbeatAt: { type: DataTypes.DATE(3), allowNull: false, field: 'last_heartbeat_at' },
      lastSuccessfulPollAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_successful_poll_at' },
      lastSuccessfulClaimAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_successful_claim_at' },
      lastSuccessfulSendAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_successful_send_at' },
      lastErrorCode: { type: DataTypes.STRING(100), allowNull: true, field: 'last_error_code' },
      lastErrorMessage: { type: DataTypes.STRING(1000), allowNull: true, field: 'last_error_message' },
      consecutivePollFailures: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'consecutive_poll_failures' },
      consecutiveClaimFailures: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'consecutive_claim_failures' },
      lastClaimErrorAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_claim_error_at' },
      lastHeartbeatErrorAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_heartbeat_error_at' },
      lastRecoveryAt: { type: DataTypes.DATE(3), allowNull: true, field: 'last_recovery_at' },
      stoppedAt: { type: DataTypes.DATE(3), allowNull: true, field: 'stopped_at' },
      createdAt: { type: DataTypes.DATE(3), allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE(3), allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'NewsletterWorkerHeartbeat',
      tableName: tableNames.NEWSLETTER_WORKER_HEARTBEATS,
      underscored: true,
      timestamps: true,
      indexes: [{ name: 'idx_newsletter_worker_heartbeats_status_latest', fields: ['status', 'last_heartbeat_at'] }]
    }
  );

  return NewsletterWorkerHeartbeat;
}
