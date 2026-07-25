import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { AdminSession, AdminUser } from '../src/modules/auth/index.js';
import { AuditLog } from '../src/modules/auth/audit-log.model.js';
import { sampleCustomTemplateConfig } from '../src/modules/blogs/custom-templates/custom-template.sample.js';
import { CustomTemplate, CustomTemplateVersion } from '../src/modules/custom-templates/custom-template.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';

function token(role: 'super_admin' | 'editor' | 'author' | 'viewer' = 'super_admin', id = '1') {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id, role, status: 'active', name: 'Admin', email: 'admin@example.com' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: id, revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  return signAccessToken({ sub: id, role, session_id: '10', token_type: 'access' });
}

function version(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '50', customTemplateId: '30', versionNumber: 1, schemaVersion: 1, layoutConfigJson: sampleCustomTemplateConfig, changeSummary: null, createdBy: '1', createdAt: new Date(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates: any) => Object.assign(data, updates)) } as any;
}

function template(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '30', name: 'Healthcare Layout', description: null, status: 'draft', statusBeforeArchive: null, ownerId: '1', currentVersionId: '50', lockVersion: 1, createdBy: '1', updatedBy: '1', activatedAt: null, activatedBy: null, archivedAt: null, archivedBy: null, restoredAt: null, restoredBy: null, createdAt: new Date(), updatedAt: new Date(), owner: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' }, currentVersion: version(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates: any) => Object.assign(data, updates)) } as any;
}

const lockTransaction = { LOCK: { UPDATE: 'UPDATE' } };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback(lockTransaction));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  vi.spyOn(BlogVersion, 'count').mockResolvedValue(0 as never);
});

describe('custom template routes', () => {
  it('requires authentication', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/custom-templates');
    expect(response.status).toBe(401);
  });

  it('lists Custom Templates for an authenticated admin', async () => {
    vi.spyOn(CustomTemplate, 'findAndCountAll').mockResolvedValue({ rows: [template()], count: 1 } as never);
    const response = await request(createApp(async () => undefined)).get('/api/v1/custom-templates').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({ name: 'Healthcare Layout' });
  });

  it('rejects create for a viewer role', async () => {
    const response = await request(createApp(async () => undefined))
      .post('/api/v1/custom-templates')
      .set('Authorization', `Bearer ${token('viewer')}`)
      .send({ name: 'X', layout_config_json: sampleCustomTemplateConfig });
    expect(response.status).toBe(403);
  });

  it('creates a Custom Template for an author', async () => {
    vi.spyOn(CustomTemplate, 'create').mockResolvedValue(template({ currentVersionId: null }) as never);
    vi.spyOn(CustomTemplateVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template() as never);
    const response = await request(createApp(async () => undefined))
      .post('/api/v1/custom-templates')
      .set('Authorization', `Bearer ${token('author')}`)
      .send({ name: 'Healthcare Layout', layout_config_json: sampleCustomTemplateConfig });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: 'Healthcare Layout', status: 'draft' });
  });

  it('returns a controlled 400 for an invalid Custom Template ID', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/custom-templates/not-an-id').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(400);
  });

  it('returns 409 CUSTOM_TEMPLATE_VERSION_CONFLICT with safe metadata on a lock mismatch', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ lockVersion: 3 }) as never);
    const response = await request(createApp(async () => undefined))
      .post('/api/v1/custom-templates/30/versions')
      .set('Authorization', `Bearer ${token('editor')}`)
      .send({ layout_config_json: sampleCustomTemplateConfig, expected_lock_version: 1 });
    expect(response.status).toBe(409);
    expect(response.body.data).toMatchObject({ code: 'CUSTOM_TEMPLATE_VERSION_CONFLICT', lock_version: 3 });
    expect(response.body.data.layout_config_json).toBeUndefined();
  });

  it('restricts permanent delete to super_admin', async () => {
    const response = await request(createApp(async () => undefined))
      .delete('/api/v1/custom-templates/30')
      .set('Authorization', `Bearer ${token('editor')}`);
    expect(response.status).toBe(403);
  });

  it('rejects permanent delete when the Custom Template is still in use', async () => {
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(template({ status: 'archived' }) as never);
    vi.spyOn(BlogVersion, 'count').mockResolvedValue(2 as never);
    const response = await request(createApp(async () => undefined))
      .delete('/api/v1/custom-templates/30')
      .set('Authorization', `Bearer ${token('super_admin')}`);
    expect(response.status).toBe(409);
    expect(response.body.data).toMatchObject({ code: 'CUSTOM_TEMPLATE_IN_USE' });
  });
});
