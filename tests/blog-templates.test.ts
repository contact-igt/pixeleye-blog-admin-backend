import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { AdminSession, AdminUser, AuditLog } from '../src/modules/auth/index.js';
import { Blog } from '../src/modules/blogs/blog.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { createBlogService } from '../src/modules/blogs/blog.service.js';
import { blogTemplateKeys, isValidTemplateSnapshot, listBlogTemplates, normalizeStoredTemplate, resolveBlogTemplate } from '../src/modules/blogs/blog-template.registry.js';
import { createBlogSchema } from '../src/modules/blogs/blog.validation.js';
import { MediaAsset } from '../src/modules/media/media.model.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';

const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] };
const templateOne = resolveBlogTemplate('template_1');
const templateTwo = resolveBlogTemplate('template_2');

function version(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '20', blogId: '9', versionNumber: 1, versionType: 'draft', title: 'Eye Care', excerpt: 'Excerpt', contentJson: doc, contentHtml: '<p>Body</p>', seoTitle: 'SEO', seoDescription: 'Description', canonicalUrl: null, featuredMediaId: '5', ...templateOne, createdBy: '1', createdAt: new Date(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any;
}
function media() { const data: any = { id: '5', status: 'active', originalUrl: 'https://media.example.com/image.webp', originalFileName: 'image.webp', variantsJson: {}, altText: 'Eye care' }; return { ...data, get: () => data }; }
function blog(draft = version(), published: any = null, overrides: Record<string, unknown> = {}) {
  const data: any = { id: '9', slug: 'eye-care', status: published ? 'published' : 'draft', authorId: '1', featuredMediaId: '5', currentDraftVersionId: draft.id, currentPublishedVersionId: published?.id ?? null, currentDraftVersion: draft, currentPublishedVersion: published, author: { id: '1', role: 'editor' }, featuredMedia: media(), createdAt: new Date(), updatedAt: new Date(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any;
}
function token() {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id: '1', role: 'super_admin', status: 'active', name: 'Admin', email: 'admin@example.com' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: '1', revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  return signAccessToken({ sub: '1', role: 'super_admin', session_id: '10', token_type: 'access' });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback({}));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
});

describe('Blog system template registry', () => {
  it('contains exactly the two fixed system templates', () => {
    expect(blogTemplateKeys).toEqual(['template_1', 'template_2']);
    expect(listBlogTemplates()).toEqual([
      expect.objectContaining({ key: 'template_1', version: 2, layout: 'single_column' }),
      expect.objectContaining({ key: 'template_2', version: 1, layout: 'article_sidebar' })
    ]);
  });

  it('exposes Template 2 healthcare regions while keeping versions internal to its existing snapshot', () => {
    expect(listBlogTemplates().map(({ key, name }) => ({ key, name }))).toEqual([
      { key: 'template_1', name: 'Template 1' },
      { key: 'template_2', name: 'Template 2' }
    ]);
    expect(templateTwo.templateConfigJson.regions).toEqual(expect.arrayContaining(['hero', 'key_takeaways', 'article_content', 'table_of_contents', 'appointment_card', 'newsletter_card', 'faq', 'medical_disclaimer']));
    expect(Object.keys(templateTwo).sort()).toEqual(['customTemplateId', 'customTemplateVersionId', 'templateConfigJson', 'templateKey', 'templateVersion'].sort());
    expect(templateTwo.customTemplateId).toBeNull();
    expect(templateTwo.customTemplateVersionId).toBeNull();
  });

  it('defaults create validation to registry resolution and rejects unsupported or client-owned snapshot fields', () => {
    expect(resolveBlogTemplate(createBlogSchema.parse({ title: 'Eye Care' }).template_key).templateKey).toBe('template_1');
    expect(createBlogSchema.parse({ title: 'Eye Care', template_key: 'template_2' }).template_key).toBe('template_2');
    expect(() => createBlogSchema.parse({ title: 'Eye Care', template_key: 'custom' })).toThrow();
    expect(() => createBlogSchema.parse({ title: 'Eye Care', template_version: 99 })).toThrow();
    expect(() => createBlogSchema.parse({ title: 'Eye Care', template_config_json: {} })).toThrow();
  });

  it('serves the protected templates static route before /:id', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/blogs/templates').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[1]).toMatchObject({ key: 'template_2', version: 1 });
  });
});

describe('Blog template persistence', () => {
  it('creates template_1 by default and accepts template_2', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await service.createBlog({ title: 'Default Template' }, { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenLastCalledWith(expect.objectContaining({ templateKey: 'template_1', templateVersion: 2 }), expect.anything());
    await service.createBlog({ title: 'Sidebar Template', template_key: 'template_2' }, { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenLastCalledWith(expect.objectContaining({ templateKey: 'template_2', templateVersion: 1, templateConfigJson: expect.objectContaining({ layout: 'article_sidebar' }) }), expect.anything());
  });

  it('changes only the Draft template and records a template audit event', async () => {
    const draft = version();
    const published = version({ id: '19', versionType: 'published', ...templateOne });
    const entity = blog(draft, published);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    const audit = vi.spyOn(AuditLog, 'create');
    await createBlogService().updateBlog('9', { template_key: 'template_2' }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'template_2', templateVersion: 1 }), expect.anything());
    expect(published.templateKey).toBe('template_1');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'BLOG_TEMPLATE_CHANGED', entityId: '9', metadata: expect.objectContaining({ old_template_key: 'template_1', new_template_key: 'template_2' }) }), expect.anything());
  });

  it('publishes the exact Draft template snapshot without changing older Published versions', async () => {
    const draft = version({ ...templateTwo });
    const oldPublished = version({ id: '19', versionType: 'published', ...templateOne });
    const entity = blog(draft, oldPublished);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(BlogVersion, 'max').mockResolvedValue(2 as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version({ id: '21', versionNumber: 3, versionType: 'published', ...templateTwo }) as never);
    await createBlogService().publishBlog('9', { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionType: 'published', versionNumber: 3, templateKey: 'template_2', templateVersion: 1, templateConfigJson: templateTwo.templateConfigJson }), expect.anything());
    expect(oldPublished.templateKey).toBe('template_1');
  });

  it('adds template validity to the publish checklist and serializes Draft/Published templates', async () => {
    const draft = version({ ...templateTwo });
    const published = version({ id: '19', versionType: 'published', ...templateOne });
    const entity = blog(draft, published);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    const service = createBlogService();
    const checklist = await service.getPublishChecklist('9', { id: '1', role: 'viewer' });
    expect(checklist.items[0]).toEqual({ key: 'template', status: 'complete', message: 'Article template selected' });
    const detail = await service.getBlog('9', { id: '1', role: 'viewer' });
    expect(detail).toMatchObject({ has_unpublished_template_changes: true, draft_version: { template_key: 'template_2' }, published_version: { template_key: 'template_1' } });
  });
});

describe('Blog template migration', () => {
  it('adds, backfills, constrains, indexes, and reverses template fields safely', async () => {
    const migration = await import('../src/database/migrations/20260723000100-add-blog-version-templates.cjs');
    const calls: Array<{ method: string; args: any[] }> = [];
    const queryInterface = new Proxy({}, { get: (_target, method: string) => (...args: any[]) => { calls.push({ method, args }); return Promise.resolve(); } });
    const Sequelize = { STRING: (size: number) => ({ type: 'STRING', size }), INTEGER: { UNSIGNED: 'INTEGER_UNSIGNED' }, JSON: 'JSON' };
    await migration.default.up(queryInterface as any, Sequelize as any);
    expect(calls.filter((call) => call.method === 'addColumn')).toHaveLength(3);
    expect(calls.find((call) => call.method === 'bulkUpdate')?.args[1]).toMatchObject({ template_key: 'template_1', template_version: 1 });
    expect(calls.filter((call) => call.method === 'changeColumn')).toHaveLength(3);
    await migration.default.down(queryInterface as any);
    expect(calls.filter((call) => call.method === 'removeColumn').map((call) => call.args[1])).toEqual(['template_config_json', 'template_version', 'template_key']);
  });
});

describe('Template flow regression coverage', () => {
  it('restores a saved Template 2 selection on detail reload', async () => {
    const draft = version({ ...templateTwo });
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog(draft) as never);
    const detail = await createBlogService().getBlog('9', { id: '1', role: 'viewer' });
    expect(detail.draft_version).toMatchObject({ template_key: 'template_2', template_version: 1 });
  });

  it('switches Template 2 back to Template 1 while preserving all Draft content and Published data', async () => {
    const draft = version({ ...templateTwo });
    const published = version({ id: '19', versionType: 'published', ...templateTwo });
    const entity = blog(draft, published);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    await createBlogService().updateBlog('9', { template_key: 'template_1' }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Eye Care', excerpt: 'Excerpt', contentJson: doc, contentHtml: '<p>Body</p>', featuredMediaId: '5',
      seoTitle: 'SEO', seoDescription: 'Description', templateKey: 'template_1', templateVersion: 2
    }), expect.anything());
    expect(published).toMatchObject({ templateKey: 'template_2', templateVersion: 1, contentJson: doc });
  });

  it('preserves Draft and Published template pointers through unpublish, trash, and restore', async () => {
    const draft = version({ ...templateOne });
    const published = version({ id: '19', versionType: 'published', ...templateTwo });
    const entity = blog(draft, published, { status: 'published' });
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    const service = createBlogService();
    await service.unpublishBlog('9', { id: '1', role: 'editor' });
    await service.moveBlogToTrash('9', { id: '1', role: 'editor' });
    await service.restoreBlog('9', { id: '1', role: 'editor' });
    expect(entity.currentDraftVersionId).toBe('20');
    expect(entity.currentPublishedVersionId).toBe('19');
    expect(draft.templateKey).toBe('template_1');
    expect(published.templateKey).toBe('template_2');
  });
});


describe('Stored template JSON normalization', () => {
  it('preserves template_2 when MySQL returns template_config_json as a JSON string', () => {
    const stored = {
      templateKey: 'template_2',
      templateVersion: 1,
      templateConfigJson: JSON.stringify(templateTwo.templateConfigJson)
    };
    expect(normalizeStoredTemplate(stored)).toEqual(templateTwo);
    expect(isValidTemplateSnapshot(stored)).toBe(true);
  });

  it('serializes a string-backed Template 2 Draft as template_2 in Blog detail', async () => {
    const draft = version({
      templateKey: 'template_2',
      templateVersion: 1,
      templateConfigJson: JSON.stringify(templateTwo.templateConfigJson)
    });
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog(draft) as never);
    const detail = await createBlogService().getBlog('9', { id: '1', role: 'viewer' });
    expect(detail.draft_version).toMatchObject({ template_key: 'template_2', template_version: 1 });
  });

  it('rejects malformed stored JSON safely', () => {
    const stored = { templateKey: 'template_2', templateVersion: 1, templateConfigJson: '{invalid' };
    expect(isValidTemplateSnapshot(stored)).toBe(false);
    expect(normalizeStoredTemplate(stored).templateKey).toBe('template_1');
  });
});
