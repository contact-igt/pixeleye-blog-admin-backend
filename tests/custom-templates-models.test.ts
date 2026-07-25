import { describe, expect, it } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { initializeCustomTemplateAssociations } from '../src/database/associations/index.js';
import { initializeCustomTemplateModels } from '../src/database/models/index.js';
import { tableNames } from '../src/database/table-names.js';
import { CustomTemplateVersion as CentralCustomTemplateVersion } from '../src/database/tables/custom-template-versions.table.js';
import { CustomTemplate as CentralCustomTemplate } from '../src/database/tables/custom-templates.table.js';
import { CustomTemplate as CompatibilityCustomTemplate, CustomTemplateVersion as CompatibilityCustomTemplateVersion } from '../src/modules/custom-templates/custom-template.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';

describe('central CustomTemplate and CustomTemplateVersion models', () => {
  it('initializes both models once and preserves exact compatibility identity', () => {
    const first = initializeCustomTemplateModels(sequelize);
    const second = initializeCustomTemplateModels(sequelize);

    expect(first.CustomTemplate).toBe(CentralCustomTemplate);
    expect(first.CustomTemplateVersion).toBe(CentralCustomTemplateVersion);
    expect(second.CustomTemplate).toBe(first.CustomTemplate);
    expect(second.CustomTemplateVersion).toBe(first.CustomTemplateVersion);
    expect(sequelize.models.CustomTemplate).toBe(CentralCustomTemplate);
    expect(sequelize.models.CustomTemplateVersion).toBe(CentralCustomTemplateVersion);
    expect(CompatibilityCustomTemplate).toBe(CentralCustomTemplate);
    expect(CompatibilityCustomTemplateVersion).toBe(CentralCustomTemplateVersion);
  });

  it('preserves model and physical table identities', () => {
    expect(CentralCustomTemplate.name).toBe('CustomTemplate');
    expect(CentralCustomTemplate.tableName).toBe(tableNames.CUSTOM_TEMPLATES);
    expect(CentralCustomTemplateVersion.name).toBe('CustomTemplateVersion');
    expect(CentralCustomTemplateVersion.tableName).toBe(tableNames.CUSTOM_TEMPLATE_VERSIONS);
  });

  it('maps every migration-backed CustomTemplate field without paranoid deletion', () => {
    const attributes = CentralCustomTemplate.getAttributes();
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
      'id', 'name', 'description', 'status', 'statusBeforeArchive', 'ownerId', 'currentVersionId',
      'lockVersion', 'createdBy', 'updatedBy', 'activatedAt', 'activatedBy', 'archivedAt', 'archivedBy',
      'restoredAt', 'restoredBy', 'createdAt', 'updatedAt'
    ]));
    expect(attributes.statusBeforeArchive.field).toBe('status_before_archive');
    expect(attributes.ownerId.field).toBe('owner_id');
    expect(attributes.lockVersion.field).toBe('lock_version');
    expect(attributes.lockVersion.defaultValue).toBe(1);
    expect(attributes.status.defaultValue).toBe('draft');
    expect(CentralCustomTemplate.options.timestamps).toBe(true);
    expect(CentralCustomTemplate.options.paranoid).toBeFalsy();
    expect(attributes.deletedAt).toBeUndefined();
    expect(attributes.ownerId.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
    expect((attributes.ownerId as any).onDelete).toBe('RESTRICT');
  });

  it('preserves CustomTemplate indexes', () => {
    const indexes = CentralCustomTemplate.options.indexes?.map((index) => index.name);
    expect(indexes).toEqual(expect.arrayContaining([
      'idx_custom_templates_status', 'idx_custom_templates_owner_id', 'idx_custom_templates_name', 'idx_custom_templates_current_version_id'
    ]));
  });

  it('maps append-only CustomTemplateVersion fields and created_at only', () => {
    const attributes = CentralCustomTemplateVersion.getAttributes();
    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
      'id', 'customTemplateId', 'versionNumber', 'schemaVersion', 'layoutConfigJson', 'changeSummary', 'createdBy', 'created_at'
    ]));
    expect(attributes.layoutConfigJson.type.constructor.name).toBe('JSONTYPE');
    expect(attributes.layoutConfigJson.allowNull).toBe(false);
    expect(CentralCustomTemplateVersion.options.timestamps).toBe(true);
    expect(CentralCustomTemplateVersion.options.createdAt).toBe('created_at');
    expect(CentralCustomTemplateVersion.options.updatedAt).toBe(false);
    expect(attributes.updated_at).toBeUndefined();
  });

  it('preserves CustomTemplateVersion indexes including the unique composite index', () => {
    const indexes = CentralCustomTemplateVersion.options.indexes;
    const names = indexes?.map((index) => index.name);
    expect(names).toEqual(expect.arrayContaining([
      'idx_custom_template_versions_template_version', 'idx_custom_template_versions_custom_template_id',
      'idx_custom_template_versions_created_by', 'idx_custom_template_versions_created_at'
    ]));
    const unique = indexes?.find((index) => index.name === 'idx_custom_template_versions_template_version');
    expect(unique?.unique).toBe(true);
    expect(unique?.fields).toEqual(['custom_template_id', 'version_number']);
  });

  it('registers all associations once, including BlogVersion cross-domain associations', () => {
    const first = initializeCustomTemplateAssociations(sequelize);
    const second = initializeCustomTemplateAssociations(sequelize);

    expect(first.CustomTemplate.associations.currentVersion).toBe(second.CustomTemplate.associations.currentVersion);
    expect(Object.keys(CentralCustomTemplate.associations)).toEqual(expect.arrayContaining([
      'owner', 'creator', 'updater', 'activatedByAdmin', 'archivedByAdmin', 'restoredByAdmin', 'currentVersion', 'versions'
    ]));
    expect(Object.keys(CentralCustomTemplateVersion.associations)).toEqual(expect.arrayContaining(['template', 'createdByAdmin']));
    expect(Object.keys(BlogVersion.associations)).toEqual(expect.arrayContaining(['customTemplate', 'customTemplateVersion']));
    expect(CentralCustomTemplate.associations.currentVersion.target).toBe(CentralCustomTemplateVersion);
    expect(BlogVersion.associations.customTemplate.target).toBe(CentralCustomTemplate);
    expect(BlogVersion.associations.customTemplateVersion.target).toBe(CentralCustomTemplateVersion);
  });
});
