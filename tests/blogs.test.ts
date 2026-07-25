import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { AdminSession, AdminUser } from '../src/modules/auth/index.js';
import { AuditLog } from '../src/modules/auth/audit-log.model.js';
import { Blog } from '../src/modules/blogs/blog.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { sampleCustomTemplateConfig } from '../src/modules/blogs/custom-templates/custom-template.sample.js';
import { CustomTemplate, CustomTemplateVersion } from '../src/modules/custom-templates/custom-template.model.js';
import { MediaAsset } from '../src/modules/media/media.model.js';
import { generateBlogHtmlFromJson, isBlogContentEmpty, normalizeBlogSlug, sanitizeGeneratedBlogHtml, validateBlogEditorJson } from '../src/modules/blogs/blog.validation.js';
import { createBlogService } from '../src/modules/blogs/blog.service.js';
import { signAccessToken } from '../src/services/security/jwt.service.js';

function token(role: 'super_admin' | 'editor' | 'author' | 'viewer' = 'super_admin', id = '1') {
  vi.spyOn(AdminUser, 'findByPk').mockResolvedValue({ id, role, status: 'active', name: 'Admin', email: 'admin@example.com' } as never);
  vi.spyOn(AdminSession, 'findByPk').mockResolvedValue({ id: '10', adminUserId: id, revokedAt: null, expiresAt: new Date(Date.now() + 100000) } as never);
  return signAccessToken({ sub: id, role, session_id: '10', token_type: 'access' });
}
function blog(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '9', slug: 'eye-care', status: 'draft', authorId: '1', featuredMediaId: '5', currentDraftVersionId: '20', currentPublishedVersionId: null, publishedAt: null, unpublishedAt: null, trashedAt: null, trashedBy: null, restoredAt: null, restoredBy: null, createdBy: '1', updatedBy: '1', createdAt: new Date(), updatedAt: new Date(), currentDraftVersion: version(), currentPublishedVersion: null, author: { id: '1', name: 'Admin', email: 'admin@example.com', role: 'super_admin' }, featuredMedia: media(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any;
}
function version(overrides: Record<string, unknown> = {}) { const data: any = { id: '20', blogId: '9', versionNumber: 1, versionType: 'draft', title: 'Eye Care', excerpt: 'Helpful excerpt', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] }, contentHtml: '<p>body</p>', seoTitle: 'SEO', seoDescription: 'Description', canonicalUrl: null, featuredMediaId: '5', templateKey: 'template_1', templateVersion: 1, templateConfigJson: { layout: 'single_column', regions: ['featured_image', 'article_title', 'excerpt', 'article_metadata', 'article_content'] }, createdBy: '1', createdAt: new Date(), ...overrides }; return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any; }
function media(overrides: Record<string, unknown> = {}) { const data: any = { id: '5', status: 'active', originalUrl: 'https://media.example.com/image.webp', originalFileName: 'image.webp', variantsJson: {}, altText: 'Eye care image', ...overrides }; return { ...data, get: () => data }; }

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback({}));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
});

describe('blog validation', () => {
  it('normalizes slugs and rejects reserved slugs', () => {
    expect(normalizeBlogSlug(' Eye Care Tips! ')).toBe('eye-care-tips');
    expect(() => normalizeBlogSlug('trash')).toThrow('Blog slug is reserved');
  });
  it('validates TipTap JSON, renders sanitized HTML, and detects empty content', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Safe body', marks: [{ type: 'bold' }] }] }] };
    expect(validateBlogEditorJson(doc)).toEqual(doc);
    expect(sanitizeGeneratedBlogHtml(generateBlogHtmlFromJson(doc))).toContain('<strong>Safe body</strong>');
    expect(isBlogContentEmpty({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(() => validateBlogEditorJson({ type: 'doc', content: [{ type: 'image' }] })).toThrow('Unsupported editor node');
    expect(() => validateBlogEditorJson({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'underline' }] }] }] })).toThrow('Unsupported editor mark');
    expect(() => validateBlogEditorJson({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] })).toThrow('HTTP or HTTPS');
  });
});

describe('blog service foundation', () => {
  it('creates a draft blog and initial draft version in one transaction', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care', excerpt: 'Helpful excerpt', content_json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] }, content_html: '<script>ignored</script>', featured_media_id: '5' }, { id: '1', role: 'editor' })).resolves.toMatchObject({ slug: 'eye-care', draft_version: expect.any(Object) });
    expect(Blog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', createdBy: '1' }), expect.anything());
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionType: 'draft', versionNumber: 1 }), expect.anything());
  });
  it('rejects duplicate slugs and trashed featured media', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care' }, { id: '1', role: 'editor' })).rejects.toThrow('Blog slug already exists');
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media({ status: 'trashed' }) as never);
    await expect(service.createBlog({ title: 'Eye Care', featured_media_id: '5' }, { id: '1', role: 'editor' })).rejects.toThrow('Featured media');
  });
  it('publishes by creating an immutable published snapshot', async () => {
    const draft = version(); const existing = blog({ status: 'draft', currentDraftVersion: draft });
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(existing as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(BlogVersion, 'max').mockResolvedValue(1 as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version({ id: '21', versionNumber: 2, versionType: 'published' }) as never);
    const service = createBlogService();
    await expect(service.publishBlog('9', { id: '1', role: 'editor' })).resolves.toMatchObject({ status: 'published' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionType: 'published', versionNumber: 2 }), expect.anything());
  });
  it('moves to trash and restores previous published blogs as unpublished', async () => {
    const published = blog({ status: 'published' }); vi.spyOn(Blog, 'findByPk').mockResolvedValue(published as never);
    const service = createBlogService();
    await expect(service.moveBlogToTrash('9', { id: '1', role: 'editor' })).resolves.toMatchObject({ status: 'trashed' });
    const trashed = blog({ status: 'trashed', statusBeforeTrash: 'published' }); vi.spyOn(Blog, 'findByPk').mockResolvedValue(trashed as never);
    await expect(service.restoreBlog('9', { id: '1', role: 'editor' })).resolves.toMatchObject({ status: 'unpublished' });
  });
  it('returns draft and published content JSON in the blog list response', async () => {
    const draftDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'draft body' }] }] };
    const publishedDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'published body' }] }] };
    vi.spyOn(Blog, 'findAndCountAll').mockResolvedValue({
      rows: [blog({
        currentDraftVersion: version({ contentJson: draftDoc }),
        currentPublishedVersion: version({ id: '21', versionType: 'published', contentJson: publishedDoc }),
        currentPublishedVersionId: '21'
      })],
      count: 1
    } as never);

    const result = await createBlogService().listBlogs({}, { id: '1', role: 'editor' });

    expect(result.items[0]).toMatchObject({
      draft_version: { content_json: draftDoc },
      published_version: { content_json: publishedDoc }
    });
  });

  it('creates blog with active Custom Template snapshotting layout_config_json and version IDs', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);

    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue({ id: '100', status: 'active', currentVersionId: '200', ownerId: '1' } as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue({ id: '200', customTemplateId: '100', layoutConfigJson: sampleCustomTemplateConfig } as never);

    const service = createBlogService();
    await service.createBlog({ title: 'Custom Blog', template_key: 'custom_template', custom_template_id: '100' }, { id: '1', role: 'editor' });

    expect(BlogVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'custom_template',
        templateVersion: 1,
        customTemplateId: '100',
        customTemplateVersionId: '200',
        templateConfigJson: sampleCustomTemplateConfig
      }),
      expect.anything()
    );
  });
});

describe('blog routes', () => {
  it('requires authentication and keeps /trash before /:id', async () => {
    expect((await request(createApp(async () => undefined)).get('/api/v1/blogs')).status).toBe(401);
    const access = token();
    vi.spyOn(Blog, 'findAndCountAll').mockResolvedValue({ rows: [], count: 0 } as never);
    const trash = await request(createApp(async () => undefined)).get('/api/v1/blogs/trash').set('Authorization', `Bearer ${access}`);
    expect(trash.status).toBe(200);
    expect(trash.body.message).toBe('Blog trash fetched');
  });
  it('keeps invalid blog IDs on the detail route controlled', async () => {
    const response = await request(createApp(async () => undefined)).get('/api/v1/blogs/not-id').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Blog ID is invalid');
  });
});
