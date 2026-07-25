import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export type CustomTemplateStatus = 'draft' | 'active' | 'archived';

export class CustomTemplate extends Model<InferAttributes<CustomTemplate>, InferCreationAttributes<CustomTemplate>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string | null;
  declare status: CreationOptional<CustomTemplateStatus>;
  declare statusBeforeArchive: CustomTemplateStatus | null;
  declare ownerId: string;
  declare currentVersionId: string | null;
  declare lockVersion: CreationOptional<number>;
  declare createdBy: string | null;
  declare updatedBy: string | null;
  declare activatedAt: Date | null;
  declare activatedBy: string | null;
  declare archivedAt: Date | null;
  declare archivedBy: string | null;
  declare restoredAt: Date | null;
  declare restoredBy: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type CustomTemplateAttributes = InferAttributes<CustomTemplate>;
export type CustomTemplateCreationAttributes = InferCreationAttributes<CustomTemplate>;
export type CustomTemplateInstance = CustomTemplate;
export type CustomTemplateStatic = typeof CustomTemplate;

export function initializeCustomTemplateTable(sequelize: Sequelize): typeof CustomTemplate {
  if (sequelize.models.CustomTemplate === CustomTemplate) return CustomTemplate;
  if (sequelize.models.CustomTemplate) return sequelize.models.CustomTemplate as typeof CustomTemplate;

  CustomTemplate.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(191), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'draft' },
      statusBeforeArchive: { type: DataTypes.STRING(40), allowNull: true, field: 'status_before_archive' },
      ownerId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'owner_id', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      currentVersionId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'current_version_id' },
      lockVersion: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, field: 'lock_version' },
      createdBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'created_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      updatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'updated_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      activatedAt: { type: DataTypes.DATE, allowNull: true, field: 'activated_at' },
      activatedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'activated_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
      archivedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'archived_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      restoredAt: { type: DataTypes.DATE, allowNull: true, field: 'restored_at' },
      restoredBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'restored_by', references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' }
    },
    {
      sequelize,
      modelName: 'CustomTemplate',
      tableName: tableNames.CUSTOM_TEMPLATES,
      underscored: true,
      timestamps: true,
      indexes: [
        { name: 'idx_custom_templates_status', fields: ['status'] },
        { name: 'idx_custom_templates_owner_id', fields: ['owner_id'] },
        { name: 'idx_custom_templates_name', fields: ['name'] },
        { name: 'idx_custom_templates_current_version_id', fields: ['current_version_id'] }
      ]
    }
  );

  return CustomTemplate;
}
