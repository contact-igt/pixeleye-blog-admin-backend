import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize
} from 'sequelize';
import { tableNames } from '../table-names.js';

export class CustomTemplateVersion extends Model<
  InferAttributes<CustomTemplateVersion, { omit: 'createdAt' }>,
  InferCreationAttributes<CustomTemplateVersion, { omit: 'createdAt' }>
> {
  declare id: CreationOptional<string>;
  declare customTemplateId: string;
  declare versionNumber: number;
  declare schemaVersion: number;
  declare layoutConfigJson: Record<string, unknown>;
  declare changeSummary: string | null;
  declare createdBy: string | null;
  declare createdAt: CreationOptional<Date>;
}

export type CustomTemplateVersionAttributes = InferAttributes<CustomTemplateVersion>;
export type CustomTemplateVersionCreationAttributes = InferCreationAttributes<CustomTemplateVersion, { omit: 'createdAt' }>;
export type CustomTemplateVersionInstance = CustomTemplateVersion;
export type CustomTemplateVersionStatic = typeof CustomTemplateVersion;

export function initializeCustomTemplateVersionTable(sequelize: Sequelize): typeof CustomTemplateVersion {
  if (sequelize.models.CustomTemplateVersion === CustomTemplateVersion) return CustomTemplateVersion;
  if (sequelize.models.CustomTemplateVersion) return sequelize.models.CustomTemplateVersion as typeof CustomTemplateVersion;

  CustomTemplateVersion.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      customTemplateId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        field: 'custom_template_id',
        references: { model: tableNames.CUSTOM_TEMPLATES, key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      },
      versionNumber: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'version_number' },
      schemaVersion: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: false, field: 'schema_version' },
      layoutConfigJson: {
        type: DataTypes.JSON,
        allowNull: false,
        field: 'layout_config_json',
        get(this: CustomTemplateVersion) {
          const raw = this.getDataValue('layoutConfigJson');
          if (typeof raw === 'string') {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          }
          return raw;
        }
      },
      changeSummary: { type: DataTypes.STRING(500), allowNull: true, field: 'change_summary' },
      createdBy: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        field: 'created_by',
        references: { model: tableNames.ADMIN_USERS, key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      }
    },
    {
      sequelize,
      modelName: 'CustomTemplateVersion',
      tableName: tableNames.CUSTOM_TEMPLATE_VERSIONS,
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: false,
      indexes: [
        { name: 'idx_custom_template_versions_template_version', fields: ['custom_template_id', 'version_number'], unique: true },
        { name: 'idx_custom_template_versions_custom_template_id', fields: ['custom_template_id'] },
        { name: 'idx_custom_template_versions_created_by', fields: ['created_by'] },
        { name: 'idx_custom_template_versions_created_at', fields: ['created_at'] }
      ]
    }
  );

  return CustomTemplateVersion;
}
