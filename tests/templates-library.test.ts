import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { AdminSession, AdminUser } from '../src/modules/auth/index.js';
import { createTemplateService } from '../src/modules/templates/template.service.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';

function authToken(role: 'super_admin' | 'editor' | 'author' | 'viewer' = 'super_admin') {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role, status: 'active', name: 'Admin', email: 'admin@example.com' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: '1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  return signAccessToken({ sub: '1', role, session_id: '10', token_type: 'access' });
}

beforeEach(() => vi.restoreAllMocks());

describe('Templates Library API', () => {
  it('returns exactly two read-only system templates with actual query results', async () => {
    vi.spyOn(sequelize, 'query')
      .mockResolvedValueOnce([{ draft_count: '3', published_count: '2', total_blog_count: '4' }] as never)
      .mockResolvedValueOnce([{ draft_count: '1', published_count: '5', total_blog_count: '5' }] as never);
    const response = await request(createApp(async () => undefined)).get('/api/v1/templates').set('Authorization', `Bearer ${authToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Templates fetched successfully');
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.items).toEqual([
      expect.objectContaining({ key: 'template_1', type: 'system', is_editable: false, is_deletable: false, usage: { draft_count: 3, published_count: 2, total_blog_count: 4 } }),
      expect.objectContaining({ key: 'template_2', type: 'system', is_editable: false, is_deletable: false, usage: { draft_count: 1, published_count: 5, total_blog_count: 5 } })
    ]);
  });

  it('uses distinct current-version counts and excludes trashed Blogs', async () => {
    const query = vi.spyOn(sequelize, 'query').mockResolvedValue([{ draft_count: 2, published_count: 2, total_blog_count: 3 }] as never);
    const result = await createTemplateService().getTemplate('template_1');
    expect(result.usage).toEqual({ draft_count: 2, published_count: 2, total_blog_count: 3 });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('COUNT(DISTINCT');
    expect(sql).toContain('current_draft_version_id');
    expect(sql).toContain('current_published_version_id');
    expect(sql).toContain("blogs.status <> 'trashed'");
  });

  it.each(['template_1', 'template_2'])('returns safe details for %s without raw executable config', async (templateKey) => {
    vi.spyOn(sequelize, 'query').mockResolvedValue([{ draft_count: 0, published_count: 0, total_blog_count: 0 }] as never);
    const response = await request(createApp(async () => undefined)).get(`/api/v1/templates/${templateKey}`).set('Authorization', `Bearer ${authToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ key: templateKey, type: 'system', is_editable: false, is_deletable: false, regions: expect.any(Array), supported_behaviors: expect.any(Array) });
    expect(response.body.data).not.toHaveProperty('config');
    expect(response.body.data).not.toHaveProperty('template_config_json');
  });

  it('returns a safe 404 for an invalid template key', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/templates/unknown').set('Authorization', `Bearer ${authToken()}`);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Template was not found');
  });

  it('allows Viewer reads and exposes no mutation routes', async () => {
    vi.spyOn(sequelize, 'query').mockResolvedValue([{ draft_count: 0, published_count: 0, total_blog_count: 0 }] as never);
    const token = authToken('viewer');
    expect((await request(createApp(async () => undefined)).get('/api/v1/templates').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    for (const method of ['post', 'patch', 'delete'] as const) {
      const result = await request(createApp(async () => undefined))[method]('/api/v1/templates/template_1').set('Authorization', `Bearer ${token}`).send({});
      expect(result.status).toBe(404);
    }
  });

  it('keeps the existing protected Blog templates endpoint compatible', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/blogs/templates').set('Authorization', `Bearer ${authToken('viewer')}`);
    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { key: string }) => item.key)).toEqual(['template_1', 'template_2']);
  });
});

