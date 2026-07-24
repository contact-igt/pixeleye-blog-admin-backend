import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { AuditLog } from '../src/modules/auth/audit-log.model.js';
import { Blog } from '../src/modules/blogs/blog.model.js';
import { BlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { MediaAsset } from '../src/modules/media/media.model.js';
import { blogBlockCompletionErrors, collectBlogBlockMediaIds, normalizeBlogBlocks, validateBlogBlocks } from '../src/modules/blogs/blog-block.validation.js';
import { createDefaultBlogBlocks } from '../src/modules/blogs/blog-block.types.js';
import { createBlogService } from '../src/modules/blogs/blog.service.js';
import { resolveBlogTemplate } from '../src/modules/blogs/blog-template.registry.js';
import { createMediaService } from '../src/modules/media/media.service.js';

const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }] };
function media(status = 'active') {
  const data = { id: '5', status, originalUrl: 'https://media.example.com/image.webp', altText: 'Eye care', variantsJson: {} };
  return { ...data, get: () => data };
}
function version(overrides: Record<string, unknown> = {}) {
  const data: Record<string, any> = {
    id: '20', blogId: '9', versionNumber: 1, versionType: 'draft', title: 'Eye Care', excerpt: 'Helpful excerpt',
    contentJson: content, contentHtml: '<p>Body</p>', seoTitle: 'SEO', seoDescription: 'Description', canonicalUrl: null,
    featuredMediaId: '5', ...resolveBlogTemplate('template_1'), blocksJson: createDefaultBlogBlocks(), createdBy: '1', createdAt: new Date(),
    ...overrides
  };
  return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any;
}
function blog(draft = version(), published: any = null) {
  const data: Record<string, any> = {
    id: '9', slug: 'eye-care', status: published ? 'published' : 'draft', authorId: '1', featuredMediaId: '5',
    currentDraftVersionId: draft.id, currentPublishedVersionId: published?.id ?? null, currentDraftVersion: draft,
    currentPublishedVersion: published, featuredMedia: media(), author: { id: '1', role: 'editor' },
    createdAt: new Date(), updatedAt: new Date()
  };
  return { ...data, get: () => data, update: vi.fn(async (updates) => Object.assign(data, updates)) } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback({}));
  vi.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
});

describe('Blog block document', () => {
  it('normalizes legacy NULL and validates the controlled default', () => {
    expect(normalizeBlogBlocks(null)).toEqual(createDefaultBlogBlocks());
    expect(validateBlogBlocks(createDefaultBlogBlocks())).toEqual(createDefaultBlogBlocks());
  });

  it('rejects unsupported versions, unknown blocks and unsafe URLs with field paths', () => {
    expect(() => validateBlogBlocks({ ...createDefaultBlogBlocks(), schema_version: 2 })).toThrow('article sections');
    const unknown = createDefaultBlogBlocks() as any;
    unknown.blocks.script = { javascript: 'alert(1)' };
    expect(() => validateBlogBlocks(unknown)).toThrow('article sections');
    const unsafe = createDefaultBlogBlocks();
    unsafe.blocks.expert_quote.profile_url = 'javascript:alert(1)';
    try { validateBlogBlocks(unsafe); } catch (error: any) {
      expect(error.errors[0].field).toBe('blocks_json.blocks.expert_quote.profile_url');
    }
  });

  it('allows incomplete disabled blocks and reports every enabled incomplete block at publish time', () => {
    const document = createDefaultBlogBlocks();
    expect(blogBlockCompletionErrors(document)).toEqual([]);
    document.blocks.key_takeaways.enabled = true;
    document.blocks.image_comparison.enabled = true;
    document.blocks.numbered_list.enabled = true;
    document.blocks.expert_quote.enabled = true;
    document.blocks.medical_cta.enabled = true;
    document.blocks.faq.enabled = true;
    const fields = blogBlockCompletionErrors(document).map((error) => error.field);
    expect(fields).toEqual(expect.arrayContaining([
      'blocks_json.blocks.key_takeaways.items',
      'blocks_json.blocks.image_comparison.items',
      'blocks_json.blocks.numbered_list.items',
      'blocks_json.blocks.expert_quote.quote',
      'blocks_json.blocks.medical_cta.primary',
      'blocks_json.blocks.faq.items'
    ]));
  });

  it('collects comparison and expert media IDs without duplicates', () => {
    const document = createDefaultBlogBlocks();
    document.blocks.image_comparison.items = [{ media_id: '5', title: '', description: '' }, { media_id: '5', title: '', description: '' }];
    document.blocks.expert_quote.media_id = '6';
    expect(collectBlogBlockMediaIds(document)).toEqual(['5', '6']);
  });
});

describe('Blog block persistence', () => {
  it('creates a Draft with normalized defaults when blocks_json is omitted', async () => {
    const entity = blog();
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);
    vi.spyOn(Blog, 'create').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(entity.currentDraftVersion as never);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    await createBlogService().createBlog({ title: 'Eye Care' }, { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ blocksJson: createDefaultBlogBlocks() }), expect.anything());
  });

  it('updates Draft blocks, returns them on detail, and leaves Published blocks unchanged', async () => {
    const draft = version();
    const publishedBlocks = createDefaultBlogBlocks();
    publishedBlocks.blocks.feedback.prompt = 'Published prompt';
    const published = version({ id: '19', versionType: 'published', blocksJson: publishedBlocks });
    const entity = blog(draft, published);
    const next = createDefaultBlogBlocks();
    next.blocks.key_takeaways = { enabled: true, heading: 'Key Takeaways', items: ['Real persisted item'] };
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    const detail = await createBlogService().updateBlog('9', { blocks_json: next }, { id: '1', role: 'editor' });
    expect(draft.update).toHaveBeenCalledWith(expect.objectContaining({ blocksJson: next }), expect.anything());
    expect(detail.draft_version.blocks_json.blocks.key_takeaways.items).toEqual(['Real persisted item']);
    expect(detail.published_version.blocks_json.blocks.feedback.prompt).toBe('Published prompt');
  });

  it('copies exact normalized blocks into a new immutable Published snapshot', async () => {
    const blocks = createDefaultBlogBlocks();
    blocks.blocks.faq = { enabled: true, heading: 'Questions', items: [{ question: 'When?', answer: 'Today.' }] };
    const draft = version({ blocksJson: blocks });
    const oldPublished = version({ id: '19', versionType: 'published', blocksJson: createDefaultBlogBlocks() });
    const entity = blog(draft, oldPublished);
    vi.spyOn(Blog, 'findByPk').mockResolvedValue(entity as never);
    vi.spyOn(BlogVersion, 'findByPk').mockResolvedValue(draft as never);
    vi.spyOn(MediaAsset, 'findByPk').mockResolvedValue(media() as never);
    vi.spyOn(BlogVersion, 'max').mockResolvedValue(2 as never);
    vi.spyOn(BlogVersion, 'create').mockResolvedValue(version({ id: '21', versionNumber: 3, versionType: 'published', blocksJson: blocks }) as never);
    await createBlogService().publishBlog('9', { id: '1', role: 'editor' });
    expect(BlogVersion.create).toHaveBeenCalledWith(expect.objectContaining({ versionType: 'published', versionNumber: 3, blocksJson: blocks }), expect.anything());
    expect(oldPublished.blocksJson.blocks.faq.enabled).toBe(false);
  });
});

describe('Blog block migration and media protection', () => {
  it('adds and removes only blocks_json', async () => {
    const migration = await import('../src/database/migrations/20260724000100-add-blog-version-blocks.cjs');
    const calls: Array<{ method: string; args: any[] }> = [];
    const queryInterface = new Proxy({}, { get: (_target, method: string) => (...args: any[]) => { calls.push({ method, args }); return Promise.resolve(); } });
    await migration.default.up(queryInterface as any, { JSON: 'JSON' } as any);
    await migration.default.down(queryInterface as any);
    expect(calls).toEqual([
      expect.objectContaining({ method: 'addColumn', args: ['blog_versions', 'blocks_json', expect.objectContaining({ allowNull: true })] }),
      expect.objectContaining({ method: 'removeColumn', args: ['blog_versions', 'blocks_json'] })
    ]);
  });

  it('blocks permanent deletion when a current Draft or Published version references media', async () => {
    const asset = { ...media('trashed'), update: vi.fn() };
    const repository = { create: vi.fn(), findByPk: vi.fn(async () => asset) };
    const service = createMediaService({ repository, referenceChecker: vi.fn(async () => true) } as any);
    await expect(service.permanentlyDeleteMediaAsset('5', { id: '1', role: 'editor' })).rejects.toThrow('in use');
    expect(asset.update).not.toHaveBeenCalled();
  });
});
