import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';
import type { AdminUser } from './admin-users.table.js';

export class AuditLog extends Model<
  InferAttributes<AuditLog, { omit: 'createdAt' }>,
  InferCreationAttributes<AuditLog, { omit: 'createdAt' }>
> {
  declare id: CreationOptional<string>;
  declare adminUserId: ForeignKey<AdminUser['id']> | null;
  declare action: string;
  declare entityType: string | null;
  declare entityId: string | null;
  declare requestId: string | null;
  declare ipHash: string | null;
  declare userAgent: string | null;
  declare metadata: Record<string, unknown> | null;
  declare createdAt: CreationOptional<Date>;
  declare adminUser?: NonAttribute<AdminUser | null>;
}

export function initializeAuditLogTable(sequelize: Sequelize): typeof AuditLog {
  if (sequelize.models.AuditLog === AuditLog) return AuditLog;
  if (sequelize.models.AuditLog) return sequelize.models.AuditLog as typeof AuditLog;

  AuditLog.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      adminUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'admin_user_id' },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entityType: { type: DataTypes.STRING(100), allowNull: true, field: 'entity_type' },
      entityId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'entity_id' },
      requestId: { type: DataTypes.STRING(100), allowNull: true, field: 'request_id' },
      ipHash: { type: DataTypes.STRING(255), allowNull: true, field: 'ip_hash' },
      userAgent: { type: DataTypes.STRING(500), allowNull: true, field: 'user_agent' },
      metadata: { type: DataTypes.JSON, allowNull: true }
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: tableNames.AUDIT_LOGS,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [
        { name: 'idx_audit_logs_admin_user_id', fields: ['admin_user_id'] },
        { name: 'idx_audit_logs_action', fields: ['action'] },
        { name: 'idx_audit_logs_entity', fields: ['entity_type', 'entity_id'] },
        { name: 'idx_audit_logs_created_at', fields: ['created_at'] }
      ]
    }
  );

  return AuditLog;
}
