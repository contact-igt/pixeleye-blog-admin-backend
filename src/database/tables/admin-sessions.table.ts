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

export class AdminSession extends Model<InferAttributes<AdminSession>, InferCreationAttributes<AdminSession>> {
  declare id: CreationOptional<string>;
  declare adminUserId: ForeignKey<AdminUser['id']>;
  declare refreshTokenHash: string;
  declare sessionFamilyId: string | null;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare replacedBySessionId: ForeignKey<AdminSession['id']> | null;
  declare parentSessionId: ForeignKey<AdminSession['id']> | null;
  declare ipHash: string | null;
  declare userAgent: string | null;
  declare lastUsedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare adminUser?: NonAttribute<AdminUser>;
  declare replacedBySession?: NonAttribute<AdminSession | null>;
  declare parentSession?: NonAttribute<AdminSession | null>;
  declare replacementSessions?: NonAttribute<AdminSession[]>;
  declare childSessions?: NonAttribute<AdminSession[]>;
}

export function initializeAdminSessionTable(sequelize: Sequelize): typeof AdminSession {
  if (sequelize.models.AdminSession === AdminSession) return AdminSession;
  if (sequelize.models.AdminSession) return sequelize.models.AdminSession as typeof AdminSession;

  AdminSession.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      adminUserId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'admin_user_id' },
      refreshTokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true, field: 'refresh_token_hash' },
      sessionFamilyId: { type: DataTypes.STRING(36), allowNull: true, field: 'session_family_id' },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
      replacedBySessionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'replaced_by_session_id' },
      parentSessionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'parent_session_id' },
      ipHash: { type: DataTypes.STRING(255), allowNull: true, field: 'ip_hash' },
      userAgent: { type: DataTypes.STRING(500), allowNull: true, field: 'user_agent' },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true, field: 'last_used_at' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'AdminSession',
      tableName: tableNames.ADMIN_SESSIONS,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_admin_sessions_admin_user_id', fields: ['admin_user_id'] },
        { name: 'idx_admin_sessions_refresh_token_hash', unique: true, fields: ['refresh_token_hash'] },
        { name: 'idx_admin_sessions_expires_at', fields: ['expires_at'] },
        { name: 'idx_admin_sessions_revoked_at', fields: ['revoked_at'] },
        { name: 'idx_admin_sessions_replaced_by_session_id', fields: ['replaced_by_session_id'] },
        { name: 'idx_admin_sessions_session_family_id', fields: ['session_family_id'] },
        { name: 'idx_admin_sessions_parent_session_id', fields: ['parent_session_id'] },
        { name: 'idx_admin_sessions_user_family', fields: ['admin_user_id', 'session_family_id'] }
      ]
    }
  );

  return AdminSession;
}
