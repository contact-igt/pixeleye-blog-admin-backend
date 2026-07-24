import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';
import type { AdminSession } from './admin-sessions.table.js';
import type { AuditLog } from './audit-logs.table.js';

export const adminUserRoles = ['super_admin', 'editor', 'author', 'viewer'] as const;
export const adminUserStatuses = ['active', 'inactive', 'blocked'] as const;

export type AdminUserRole = (typeof adminUserRoles)[number];
export type AdminUserStatus = (typeof adminUserStatuses)[number];

export class AdminUser extends Model<InferAttributes<AdminUser>, InferCreationAttributes<AdminUser>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare passwordHash: string;
  declare role: CreationOptional<AdminUserRole>;
  declare status: CreationOptional<AdminUserStatus>;
  declare failedLoginAttempts: CreationOptional<number>;
  declare lockedUntil: Date | null;
  declare lastLoginAt: Date | null;
  declare passwordChangedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
  declare sessions?: NonAttribute<AdminSession[]>;
  declare auditLogs?: NonAttribute<AuditLog[]>;
}

export function initializeAdminUserTable(sequelize: Sequelize): typeof AdminUser {
  if (sequelize.models.AdminUser === AdminUser) return AdminUser;
  if (sequelize.models.AdminUser) return sequelize.models.AdminUser as typeof AdminUser;

  AdminUser.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      email: { type: DataTypes.STRING(191), allowNull: false, unique: true, validate: { isEmail: true } },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
      role: { type: DataTypes.ENUM(...adminUserRoles), allowNull: false, defaultValue: 'viewer' },
      status: { type: DataTypes.ENUM(...adminUserStatuses), allowNull: false, defaultValue: 'active' },
      failedLoginAttempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, field: 'failed_login_attempts' },
      lockedUntil: { type: DataTypes.DATE, allowNull: true, field: 'locked_until' },
      lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'last_login_at' },
      passwordChangedAt: { type: DataTypes.DATE, allowNull: true, field: 'password_changed_at' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' }
    },
    {
      sequelize,
      modelName: 'AdminUser',
      tableName: tableNames.ADMIN_USERS,
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
      indexes: [
        { name: 'idx_admin_users_email', unique: true, fields: ['email'] },
        { name: 'idx_admin_users_role', fields: ['role'] },
        { name: 'idx_admin_users_status', fields: ['status'] }
      ]
    }
  );

  return AdminUser;
}
