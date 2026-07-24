import { describe, expect, it } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { initializeAuthAssociations, initializeBlogAssociations, initializeMediaAssociations } from '../src/database/associations/index.js';
import { initializeAuthModels, initializeMediaModels } from '../src/database/models/index.js';
import { tableNames } from '../src/database/table-names.js';
import { MediaAsset as CentralMediaAsset } from '../src/database/tables/media-assets.table.js';
import { AdminUser } from '../src/modules/auth/index.js';
import { Blog, BlogVersion } from '../src/modules/blogs/index.js';
import { MediaAsset as CompatibilityMediaAsset } from '../src/modules/media/media.model.js';

describe('central MediaAsset model', () => {
  it('initializes exactly once and preserves compatibility identity', () => {
    const first = initializeMediaModels(sequelize);
    const second = initializeMediaModels(sequelize);

    expect(first.MediaAsset).toBe(CentralMediaAsset);
    expect(second.MediaAsset).toBe(first.MediaAsset);
    expect(sequelize.models.MediaAsset).toBe(CentralMediaAsset);
    expect(CompatibilityMediaAsset).toBe(CentralMediaAsset);
    expect(CentralMediaAsset.name).toBe('MediaAsset');
    expect(CentralMediaAsset.tableName).toBe(tableNames.MEDIA_ASSETS);
  });

  it('preserves migration-backed attributes and lifecycle mappings', () => {
    const attributes = CentralMediaAsset.getAttributes();

    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
      'storageProvider', 'bucketName', 'originalObjectKey', 'variantsJson', 'originalUrl',
      'outputMimeType', 'originalFileName', 'fileSize', 'width', 'height', 'altText',
      'purpose', 'status', 'uploadedBy', 'trashedAt', 'trashedBy', 'purgeAfter',
      'restoredAt', 'restoredBy', 'deletedBy', 'deleteFailureReason',
      'createdAt', 'updatedAt', 'deletedAt'
    ]));
    expect(attributes.storageProvider.field).toBe('storage_provider');
    expect(attributes.originalObjectKey.field).toBe('original_object_key');
    expect(attributes.variantsJson.type.constructor.name).toBe('JSONTYPE');
    expect(attributes.uploadedBy.field).toBe('uploaded_by');
    expect(attributes.deleteFailureReason.field).toBe('delete_failure_reason');
    expect(attributes.createdAt.field).toBe('created_at');
    expect(attributes.updatedAt.field).toBe('updated_at');
    expect(attributes.deletedAt.field).toBe('deleted_at');
    expect(CentralMediaAsset.options.paranoid).toBe(true);
  });

  it('preserves indexes and migration-backed lifecycle foreign keys', () => {
    const indexNames = CentralMediaAsset.options.indexes?.map((index) => index.name);
    const attributes = CentralMediaAsset.getAttributes();

    expect(indexNames).toEqual(expect.arrayContaining([
      'idx_media_assets_client_id',
      'idx_media_assets_storage_provider',
      'idx_media_assets_provider_asset_id',
      'idx_media_assets_original_object_key',
      'idx_media_assets_purpose',
      'idx_media_assets_status',
      'idx_media_assets_trashed_at',
      'idx_media_assets_purge_after'
    ]));
    expect(attributes.trashedBy.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
    expect(attributes.restoredBy.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
    expect(attributes.deletedBy.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
    expect(attributes.uploadedBy.references).toBeUndefined();
  });

  it('registers Media/Auth associations idempotently with preserved aliases', () => {
    const first = initializeMediaAssociations(sequelize);
    const second = initializeMediaAssociations(sequelize);

    expect(first.MediaAsset.associations.uploadedByAdmin).toBe(second.MediaAsset.associations.uploadedByAdmin);
    expect(CentralMediaAsset.associations.uploadedByAdmin.as).toBe('uploadedByAdmin');
    expect(CentralMediaAsset.associations.trashedByAdmin.as).toBe('trashedByAdmin');
    expect(CentralMediaAsset.associations.restoredByAdmin.as).toBe('restoredByAdmin');
    expect(CentralMediaAsset.associations.deletedByAdmin.as).toBe('deletedByAdmin');
    expect(AdminUser.associations.mediaAssets.as).toBe('mediaAssets');
  });

  it('keeps Auth idempotent and Blog-owned media associations intact', () => {
    const authFirst = initializeAuthModels(sequelize);
    const authSecond = initializeAuthModels(sequelize);
    const associationFirst = initializeAuthAssociations(sequelize);
    const associationSecond = initializeAuthAssociations(sequelize);
    initializeBlogAssociations(sequelize);

    expect(authFirst.AdminUser).toBe(authSecond.AdminUser);
    expect(associationFirst.AdminUser.associations.sessions).toBe(associationSecond.AdminUser.associations.sessions);
    expect(Blog.associations.featuredMedia.target).toBe(CentralMediaAsset);
    expect(BlogVersion.associations.featuredMedia.target).toBe(CentralMediaAsset);
  });
});
