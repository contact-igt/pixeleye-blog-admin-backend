import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { AuditLog } from '../src/modules/auth/audit-log.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { sampleCustomTemplateConfig } from '../src/modules/blogs/custom-templates/custom-template.sample.js';
import { CustomTemplate, CustomTemplateVersion } from '../src/modules/custom-templates/custom-template.model.js';
import { createCustomTemplateService } from '../src/modules/custom-templates/custom-template.service.js';

const lockTransaction = { LOCK: { UPDATE: 'UPDATE' } };

function version(overrides: Record<string, unknown> = {}) {
  const data: any = {
    id: '50', customTemplateId: '30', versionNumber: 1, schemaVersion: 1,
    layoutConfigJson: sampleCustomTemplateConfig, changeSummary: 'Initial version',
    createdBy: '1', createdAt: new Date(), createdByAdmin: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' },
    ...overrides
  };
  return { ...data, get: () => data, update: vi.fn(async (updates: any) => Object.assign(data, updates)) } as any;
}

function template(overrides: Record<string, unknown> = {}) {
  const data: any = {
    id: '30', name: 'Healthcare Layout', description: null, status: 'draft', statusBeforeArchive: null,
    ownerId: '1', currentVersionId: '50', lockVersion: 1, createdBy: '1', updatedBy: '1',
    activatedAt: null, activatedBy: null, archivedAt: null, archivedBy: null, restoredAt: null, restoredBy: null,
    createdAt: new Date(), updatedAt: new Date(),
    owner: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' },
    currentVersion: version(),
    ...overrides
  };
  return {
    ...data,
    get: () => data,
    update: vi.fn(async (updates: any) => Object.assign(data, updates)),
    destroy: vi.fn(async () => undefined)
  } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback(lockTransaction));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  vi.spyOn(BlogVersion, 'count').mockResolvedValue(0 as never);
});

describe('Custom Template creation', () => {
  it('creates a Custom Template with an initial version 1 inside one transaction', async () => {
    vi.spyOn(CustomTemplate, 'create').mockResolvedValue(template({ currentVersionId: null }) as never);
    vi.spyOn(CustomTemplateVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template() as never);
    const service = createCustomTemplateService();
    const result = await service.createCustomTemplate({ name: 'Healthcare Layout', layout_config_json: sampleCustomTemplateConfig }, { id: '1', role: 'editor' });
    expect(result).toMatchObject({ name: 'Healthcare Layout', status: 'draft' });
    expect(CustomTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 1, schemaVersion: 1 }), expect.anything());
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'CUSTOM_TEMPLATE_CREATED' }), expect.anything());
  });

  it('rejects an invalid layout configuration before any row is created', async () => {
    const createSpy = vi.spyOn(CustomTemplate, 'create');
    const service = createCustomTemplateService();
    await expect(service.createCustomTemplate({ name: 'Bad Layout', layout_config_json: { schemaVersion: 1 } }, { id: '1', role: 'editor' })).rejects.toThrow();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects creation for a viewer', async () => {
    const service = createCustomTemplateService();
    await expect(service.createCustomTemplate({ name: 'X', layout_config_json: sampleCustomTemplateConfig }, { id: '1', role: 'viewer' })).rejects.toThrow('Insufficient permissions');
  });
});

describe('Custom Template versioning', () => {
  it('creates version 2, advances the current pointer, and increments lock_version', async () => {
    const existing = template();
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(existing as never);
    vi.spyOn(CustomTemplateVersion, 'max').mockResolvedValue(1 as never);
    vi.spyOn(CustomTemplateVersion, 'create').mockResolvedValue(version({ id: '51', versionNumber: 2 }) as never);
    const service = createCustomTemplateService();
    await service.saveCustomTemplateVersion('30', { layout_config_json: sampleCustomTemplateConfig, expected_lock_version: 1 }, { id: '1', role: 'editor' });
    expect(CustomTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 2 }), expect.anything());
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ currentVersionId: '51', lockVersion: 2 }), expect.anything());
  });

  it('returns a 409 CUSTOM_TEMPLATE_VERSION_CONFLICT when expected_lock_version does not match', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ lockVersion: 2 }) as never);
    const service = createCustomTemplateService();
    await expect(
      service.saveCustomTemplateVersion('30', { layout_config_json: sampleCustomTemplateConfig, expected_lock_version: 1 }, { id: '1', role: 'editor' })
    ).rejects.toMatchObject({ statusCode: 409, data: expect.objectContaining({ code: 'CUSTOM_TEMPLATE_VERSION_CONFLICT', lock_version: 2 }) });
  });

  it('rejects editing an archived Custom Template', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ status: 'archived' }) as never);
    const service = createCustomTemplateService();
    await expect(
      service.saveCustomTemplateVersion('30', { layout_config_json: sampleCustomTemplateConfig, expected_lock_version: 1 }, { id: '1', role: 'editor' })
    ).rejects.toThrow('Archived');
  });
});

describe('Custom Template lifecycle', () => {
  it('activates a draft Custom Template when its current version is valid', async () => {
    const draft = template({ status: 'draft' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(version() as never);
    const service = createCustomTemplateService();
    await service.activateCustomTemplate('30', { expected_lock_version: 1 }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', lockVersion: 2 }), expect.anything());
  });

  it('cannot activate a Custom Template with no current version', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ currentVersionId: null, currentVersion: null }) as never);
    const service = createCustomTemplateService();
    await expect(service.activateCustomTemplate('30', { expected_lock_version: 1 }, { id: '1', role: 'editor' })).rejects.toThrow('no version to activate');
  });

  it('archives an active Custom Template, preserving status_before_archive', async () => {
    const active = template({ status: 'active' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(active as never);
    const service = createCustomTemplateService();
    await service.archiveCustomTemplate('30', { expected_lock_version: 1 }, { id: '1', role: 'editor' });
    expect(active.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived', statusBeforeArchive: 'active', lockVersion: 2 }), expect.anything());
  });

  it('restores an archived Custom Template to its previous status', async () => {
    const archived = template({ status: 'archived', statusBeforeArchive: 'active' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(archived as never);
    const service = createCustomTemplateService();
    await service.restoreCustomTemplate('30', { expected_lock_version: 1 }, { id: '1', role: 'editor' });
    expect(archived.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', statusBeforeArchive: null, lockVersion: 2 }), expect.anything());
  });
});

describe('Custom Template permissions', () => {
  it('allows an author to edit only their own Custom Template', async () => {
    const owned = template({ ownerId: '2' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(owned as never);
    const service = createCustomTemplateService();
    await expect(service.updateCustomTemplateMetadata('30', { name: 'New Name', expected_lock_version: 1 }, { id: '1', role: 'author' })).rejects.toThrow('Insufficient permissions');
    const own = template({ ownerId: '1' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(own as never);
    await expect(service.updateCustomTemplateMetadata('30', { name: 'New Name', expected_lock_version: 1 }, { id: '1', role: 'author' })).resolves.toMatchObject({ name: 'New Name' });
  });

  it('lets super_admin and editor manage any Custom Template', async () => {
    const owned = template({ ownerId: '2' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(owned as never);
    const service = createCustomTemplateService();
    await expect(service.updateCustomTemplateMetadata('30', { name: 'Renamed', expected_lock_version: 1 }, { id: '1', role: 'editor' })).resolves.toMatchObject({ name: 'Renamed' });
  });
});

describe('Custom Template duplication', () => {
  it('duplicates a Custom Template into a new owned draft starting at version 1', async () => {
    const source = template({ ownerId: '1' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValueOnce(source as never).mockResolvedValueOnce(template({ id: '31', name: 'Copy of Healthcare Layout', ownerId: '1' }) as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(version() as never);
    vi.spyOn(CustomTemplate, 'create').mockResolvedValue(template({ id: '31', name: 'Copy of Healthcare Layout', ownerId: '1', currentVersionId: null }) as never);
    vi.spyOn(CustomTemplateVersion, 'create').mockResolvedValue(version({ id: '52', customTemplateId: '31' }) as never);
    const service = createCustomTemplateService();
    const result = await service.duplicateCustomTemplate('30', {}, { id: '1', role: 'author' });
    expect(result).toMatchObject({ name: 'Copy of Healthcare Layout' });
    expect(CustomTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: '1', status: 'draft', lockVersion: 1 }), expect.anything());
    expect(CustomTemplateVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 1 }), expect.anything());
    expect(plainOf(source).name).toBe('Healthcare Layout');
  });
});

describe('Custom Template permanent delete protection', () => {
  it('rejects permanent delete for an active Custom Template', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ status: 'active' }) as never);
    const service = createCustomTemplateService();
    await expect(service.permanentlyDeleteCustomTemplate('30', { id: '1', role: 'super_admin' })).rejects.toThrow('archived');
  });

  it('rejects permanent delete when referenced by Blog versions', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ status: 'archived' }) as never);
    vi.spyOn(BlogVersion, 'count').mockResolvedValue(1 as never);
    const service = createCustomTemplateService();
    await expect(service.permanentlyDeleteCustomTemplate('30', { id: '1', role: 'super_admin' })).rejects.toMatchObject({ statusCode: 409, data: expect.objectContaining({ code: 'CUSTOM_TEMPLATE_IN_USE' }) });
  });

  it('rejects permanent delete for non super_admin actors', async () => {
    const service = createCustomTemplateService();
    await expect(service.permanentlyDeleteCustomTemplate('30', { id: '1', role: 'editor' })).rejects.toThrow('Insufficient permissions');
  });

  it('permanently deletes an archived, unused Custom Template', async () => {
    const archived = template({ status: 'archived' });
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(archived as never);
    vi.spyOn(CustomTemplateVersion, 'destroy').mockResolvedValue(1 as never);
    const service = createCustomTemplateService();
    await expect(service.permanentlyDeleteCustomTemplate('30', { id: '1', role: 'super_admin' })).resolves.toMatchObject({ id: '30' });
    expect(archived.destroy).toHaveBeenCalled();
  });
});

function plainOf(model: any) { return model.get(); }
