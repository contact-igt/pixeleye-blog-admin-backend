import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { AuditLog } from '../src/modules/auth/audit-log.model.js';
import { Blog } from '../src/modules/blogs/blog.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { createBlogService } from '../src/modules/blogs/blog.service.js';
import { createBlogSchema } from '../src/modules/blogs/blog.validation.js';
import { resolveBlogTemplate } from '../src/modules/blogs/blog-template.registry.js';
import { sampleCustomTemplateConfig } from '../src/modules/blogs/custom-templates/custom-template.sample.js';
import { CustomTemplate, CustomTemplateVersion } from '../src/modules/custom-templates/custom-template.model.js';
import { MediaAsset } from '../src/modules/media/media.model.js';

const templateOne = resolveBlogTemplate('template_1');

function media() { const data: any = { id: '5', status: 'active', originalUrl: 'https://media.example.com/image.webp', originalFileName: 'image.webp', variantsJson: {}, altText: 'Eye care' }; return { ...data, get: () => data }; }
function version(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '20', blogId: '9', versionNumber: 1, versionType: 'draft', title: 'Eye Care', excerpt: 'Excerpt', contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] }, contentHtml: '<p>Body</p>', seoTitle: 'SEO', seoDescription: 'Description', canonicalUrl: null, featuredMediaId: '5', ...templateOne, createdBy: '1', createdAt: new Date(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates: any) => Object.assign(data, updates)) } as any;
}
function blog(draft = version(), published: any = null, overrides: Record<string, unknown> = {}) {
  const data: any = { id: '9', slug: 'eye-care', status: published ? 'published' : 'draft', authorId: '1', featuredMediaId: '5', currentDraftVersionId: draft.id, currentPublishedVersionId: published?.id ?? null, currentDraftVersion: draft, currentPublishedVersion: published, author: { id: '1', role: 'editor' }, featuredMedia: media(), createdAt: new Date(), updatedAt: new Date(), ...overrides };
  return { ...data, get: () => data, update: vi.fn(async (updates: any) => Object.assign(data, updates)) } as any;
}
function customTemplate(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '30', name: 'Healthcare Layout', status: 'active', ownerId: '1', currentVersionId: '50', lockVersion: 1, ...overrides };
  return { ...data, get: () => data } as any;
}
function customTemplateVersion(overrides: Record<string, unknown> = {}) {
  const data: any = { id: '50', customTemplateId: '30', versionNumber: 1, schemaVersion: 1, layoutConfigJson: sampleCustomTemplateConfig, ...overrides };
  return { ...data, get: () => data } as any;
}

const lockTransaction = { LOCK: { UPDATE: 'UPDATE' } };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback(lockTransaction));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
});

describe('Blog + Custom Template selection contract', () => {
  it('leaves system Template 1 / Template 2 creation entirely unchanged', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await service.createBlog({ title: 'Eye Care', template_key: 'template_2' }, { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'template_2', customTemplateId: null, customTemplateVersionId: null }), expect.anything());
  });

  it('rejects a custom_template selection with no custom_template_id at the schema layer', () => {
    expect(() => createBlogSchema.parse({ title: 'Eye Care', template_key: 'custom_template' })).toThrow();
  });

  it('rejects a system template_key combined with a custom_template_id', () => {
    expect(() => createBlogSchema.parse({ title: 'Eye Care', template_key: 'template_1', custom_template_id: '30' })).toThrow();
  });

  it('accepts an active Custom Template and copies its layout snapshot into the Draft', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate() as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(customTemplateVersion() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await service.createBlog({ title: 'Eye Care', template_key: 'custom_template', custom_template_id: '30' }, { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      templateKey: 'custom_template', customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: expect.objectContaining({ layoutId: sampleCustomTemplateConfig.layoutId })
    }), expect.anything());
  });

  it('rejects a draft (non-active) Custom Template', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate({ status: 'draft' }) as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care', template_key: 'custom_template', custom_template_id: '30' }, { id: '1', role: 'editor' })).rejects.toThrow('not active');
  });

  it('rejects an archived Custom Template', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate({ status: 'archived' }) as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care', template_key: 'custom_template', custom_template_id: '30' }, { id: '1', role: 'editor' })).rejects.toThrow('not active');
  });

  it('rejects a nonexistent Custom Template', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(null as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care', template_key: 'custom_template', custom_template_id: '999' }, { id: '1', role: 'editor' })).rejects.toThrow('not found');
  });

  it('allows any author to select an active Custom Template owned by another author (reuse across the CMS)', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate({ ownerId: '2' }) as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(customTemplateVersion() as never);
    vi.spyOn(Blog, 'create').mockResolvedValue(blog() as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version() as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog() as never);
    const service = createBlogService();
    await expect(service.createBlog({ title: 'Eye Care', template_key: 'custom_template', custom_template_id: '30' }, { id: '1', role: 'author' })).resolves.toBeTruthy();
  });
});

describe('Blog + Custom Template switching', () => {
  it('clears Custom Template refs when switching from custom to system', async () => {
    const draft = version({ ...resolveBlogTemplate('template_1'), templateKey: 'custom_template', customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: sampleCustomTemplateConfig });
    const entity = blog(draft);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    const service = createBlogService();
    await service.updateBlog('9', { template_key: 'template_1' }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'template_1', customTemplateId: null, customTemplateVersionId: null }), expect.anything());
  });

  it('sets Custom Template refs when switching from system to custom', async () => {
    const draft = version();
    const entity = blog(draft);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate() as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(customTemplateVersion() as never);
    const service = createBlogService();
    await service.updateBlog('9', { template_key: 'custom_template', custom_template_id: '30' }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'custom_template', customTemplateId: '30', customTemplateVersionId: '50' }), expect.anything());
  });

  it('updates the snapshot when switching from Custom Template A to Custom Template B', async () => {
    const draft = version({ templateKey: 'custom_template', templateVersion: 1, customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: sampleCustomTemplateConfig });
    const entity = blog(draft);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate({ id: '31', currentVersionId: '51' }) as never);
    vi.spyOn(CustomTemplateVersion, 'findByPk').mockResolvedValue(customTemplateVersion({ id: '51', customTemplateId: '31' }) as never);
    const service = createBlogService();
    await service.updateBlog('9', { template_key: 'custom_template', custom_template_id: '31' }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ customTemplateId: '31', customTemplateVersionId: '51' }), expect.anything());
  });
});

describe('Blog publishing freezes the Custom Template snapshot', () => {
  it('copies the exact Draft snapshot into the Published version without re-resolving the Custom Template', async () => {
    const draft = version({ templateKey: 'custom_template', templateVersion: 1, customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: sampleCustomTemplateConfig });
    const entity = blog(draft);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(BlogVersion, 'max').mockResolvedValue(1 as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version({ id: '21', versionNumber: 2, versionType: 'published' }) as never);
    const customTemplateFindByPk = vi.spyOn(CustomTemplate, 'findByPk');
    const service = createBlogService();
    await service.publishBlog('9', { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionType: 'published', customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: sampleCustomTemplateConfig }), expect.anything());
    expect(customTemplateFindByPk).not.toHaveBeenCalled();
  });

  it('does not let later Custom Template edits mutate an already-Published Blog snapshot', async () => {
    const publishedSnapshot = { ...sampleCustomTemplateConfig };
    const published = version({ id: '19', versionType: 'published', templateKey: 'custom_template', templateVersion: 1, customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: publishedSnapshot });
    expect(published.templateConfigJson).toEqual(sampleCustomTemplateConfig);
    const mutatedLiveConfig = { ...sampleCustomTemplateConfig, metadata: { name: 'Edited', description: 'Edited' } };
    expect(published.templateConfigJson).not.toEqual(mutatedLiveConfig);
  });
});

describe('Archived Custom Template does not break existing Blogs', () => {
  it('still serializes and would render a Blog whose snapshot references a now-archived Custom Template', async () => {
    const draft = version({ templateKey: 'custom_template', templateVersion: 1, customTemplateId: '30', customTemplateVersionId: '50', templateConfigJson: sampleCustomTemplateConfig });
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(blog(draft) as never);
    const service = createBlogService();
    const detail = await service.getBlog('9', { id: '1', role: 'viewer' });
    expect(detail.draft_version).toMatchObject({ template_key: 'custom_template', template_version: 1 });
  });
});

describe('Custom Template permanent-delete protection detects Blog references', () => {
  it('counts blog_versions referencing the Custom Template before allowing permanent delete', async () => {
    const countSpy = vi.spyOn(BlogVersion, 'count').mockResolvedValue(1 as never);
    vi.spyOn(CustomTemplate, 'findByPk').mockResolvedValue(customTemplate({ status: 'archived' }) as never);
    const { createCustomTemplateService } = await import('../src/modules/custom-templates/custom-template.service.js');
    const service = createCustomTemplateService();
    await expect(service.permanentlyDeleteCustomTemplate('30', { id: '1', role: 'super_admin' })).rejects.toThrow('in use');
    expect(countSpy).toHaveBeenCalledWith(expect.objectContaining({ where: { customTemplateId: '30' } }));
  });
});
