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
import type { AdminUser } from './admin-users.table.js';

export type MediaProvider = 'cloudflare_r2' | 'cloudflare_images';
export type MediaAssetStatus = 'active' | 'trashed' | 'deleting' | 'delete_failed' | 'deleted';
export type MediaPurpose = 'avatar' | 'thumbnail' | 'card' | 'content' | 'hero';

export interface MediaVariantRecord {
  key: string;
  url: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  mime_type: string;
}

export class MediaAsset extends Model<InferAttributes<MediaAsset>, InferCreationAttributes<MediaAsset>> {
  declare id: CreationOptional<string>;
  declare clientId: string | null;
  declare storageProvider: CreationOptional<MediaProvider>;
  declare bucketName: string | null;
  declare provider: CreationOptional<MediaProvider>;
  declare providerAssetId: string | null;
  declare originalObjectKey: string | null;
  declare variantsJson: Record<string, MediaVariantRecord> | null;
  declare originalUrl: string | null;
  declare purpose: MediaPurpose;
  declare originalFileName: string | null;
  declare originalFilename: string;
  declare mimeType: string;
  declare outputMimeType: string | null;
  declare sizeBytes: number;
  declare fileSize: number | null;
  declare width: number | null;
  declare height: number | null;
  declare altText: string | null;
  declare metadata: Record<string, unknown> | null;
  declare status: CreationOptional<MediaAssetStatus>;
  declare uploadedBy: string | null;
  declare trashedAt: Date | null;
  declare trashedBy: string | null;
  declare purgeAfter: Date | null;
  declare restoredAt: Date | null;
  declare restoredBy: string | null;
  declare deletedBy: string | null;
  declare deleteFailureReason: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
  declare uploadedByAdmin?: NonAttribute<AdminUser>;
  declare trashedByAdmin?: NonAttribute<AdminUser>;
  declare restoredByAdmin?: NonAttribute<AdminUser>;
  declare deletedByAdmin?: NonAttribute<AdminUser>;
}

export type MediaAssetAttributes = InferAttributes<MediaAsset>;
export type MediaAssetCreationAttributes = InferCreationAttributes<MediaAsset>;
export type MediaAssetInstance = MediaAsset;
export type MediaAssetStatic = typeof MediaAsset;

export function initializeMediaAssetTable(sequelize: Sequelize): typeof MediaAsset {
  if (sequelize.models.MediaAsset === MediaAsset) return MediaAsset;
  if (sequelize.models.MediaAsset) return sequelize.models.MediaAsset as typeof MediaAsset;

  MediaAsset.init(
    {
      id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      clientId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'client_id' },
      storageProvider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'cloudflare_r2', field: 'storage_provider' },
      bucketName: { type: DataTypes.STRING(255), allowNull: true, field: 'bucket_name' },
      provider: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'cloudflare_r2' },
      providerAssetId: { type: DataTypes.STRING(255), allowNull: true, field: 'provider_asset_id' },
      originalObjectKey: { type: DataTypes.STRING(1024), allowNull: true, field: 'original_object_key' },
      variantsJson: { type: DataTypes.JSON, allowNull: true, field: 'variants_json' },
      originalUrl: { type: DataTypes.STRING(2048), allowNull: true, field: 'original_url' },
      purpose: { type: DataTypes.STRING(40), allowNull: false },
      originalFileName: { type: DataTypes.STRING(255), allowNull: true, field: 'original_file_name' },
      originalFilename: { type: DataTypes.STRING(255), allowNull: false, field: 'original_filename' },
      mimeType: { type: DataTypes.STRING(120), allowNull: false, field: 'mime_type' },
      outputMimeType: { type: DataTypes.STRING(120), allowNull: true, field: 'output_mime_type' },
      sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
      fileSize: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'file_size' },
      width: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      height: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      altText: { type: DataTypes.STRING(255), allowNull: true, field: 'alt_text' },
      metadata: { type: DataTypes.JSON, allowNull: true },
      status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'active' },
      uploadedBy: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'uploaded_by' },
      trashedAt: { type: DataTypes.DATE, allowNull: true, field: 'trashed_at' },
      trashedBy: {
        type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'trashed_by',
        references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE'
      },
      purgeAfter: { type: DataTypes.DATE, allowNull: true, field: 'purge_after' },
      restoredAt: { type: DataTypes.DATE, allowNull: true, field: 'restored_at' },
      restoredBy: {
        type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'restored_by',
        references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE'
      },
      deletedBy: {
        type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'deleted_by',
        references: { model: tableNames.ADMIN_USERS, key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE'
      },
      deleteFailureReason: { type: DataTypes.TEXT, allowNull: true, field: 'delete_failure_reason' },
      createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
      updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
      deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' }
    },
    {
      sequelize,
      modelName: 'MediaAsset',
      tableName: tableNames.MEDIA_ASSETS,
      underscored: true,
      timestamps: true,
      paranoid: true,
      deletedAt: 'deleted_at',
      indexes: [
        { name: 'idx_media_assets_client_id', fields: ['client_id'] },
        { name: 'idx_media_assets_storage_provider', fields: ['storage_provider'] },
        { name: 'idx_media_assets_provider_asset_id', fields: ['provider', 'provider_asset_id'] },
        { name: 'idx_media_assets_original_object_key', fields: ['original_object_key'] },
        { name: 'idx_media_assets_purpose', fields: ['purpose'] },
        { name: 'idx_media_assets_status', fields: ['status'] },
        { name: 'idx_media_assets_trashed_at', fields: ['trashed_at'] },
        { name: 'idx_media_assets_purge_after', fields: ['purge_after'] }
      ]
    }
  );

  return MediaAsset;
}
