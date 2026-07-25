import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { createDefaultBlogBlocks } from '../src/modules/blogs/blog-block.types.js';
import { Blog } from '../src/modules/blogs/blog.model.js';

function publicPublishedBlog(overrides: Record<string, unknown> = {}) {
  const publishedVersionData: any = {
    id: '100',
    blogId: '10',
    versionNumber: 2,
    versionType: 'published',
    title: 'Published Eye Care Tips',
    excerpt: 'Public excerpt',
    contentJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Public content' }] }] },
    contentHtml: '<p>Public content</p>',
    seoTitle: 'Public Eye Care',
    seoDescription: 'Public SEO Description',
    canonicalUrl: 'https://example.com/blog/eye-care-tips',
    featuredMediaId: '5',
    templateKey: 'template_2',
    templateVersion: 1,
    templateConfigJson: { layout: 'article_sidebar', regions: ['hero', 'article_content'] },
    blocksJson: createDefaultBlogBlocks(),
    createdBy: '1',
    createdAt: new Date()
  };

  const data: any = {
    id: '10',
    slug: 'eye-care-tips',
    status: 'published',
    authorId: '1',
    featuredMediaId: '5',
    currentDraftVersionId: '100',
    currentPublishedVersionId: '100',
    publishedAt: new Date('2026-07-24T10:00:00Z'),
    unpublishedAt: null,
    trashedAt: null,
    trashedBy: null,
    restoredAt: null,
    restoredBy: null,
    createdBy: '1',
    updatedBy: '1',
    createdAt: new Date('2026-07-24T09:00:00Z'),
    updatedAt: new Date('2026-07-24T10:00:00Z'),
    currentDraftVersion: publishedVersionData,
    currentPublishedVersion: publishedVersionData,
    author: { id: '1', name: 'Dr. John Doe', email: 'john@example.com', role: 'author' },
    featuredMedia: { id: '5', status: 'active', originalUrl: 'https://media.example.com/banner.jpg', altText: 'Banner alt' },
    ...overrides
  };

  return {
    ...data,
    get: () => data
  } as any;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(sequelize, 'transaction').mockImplementation(async (callback: any) => callback({}));
});

describe('Public Blog APIs', () => {
  it('fetches a single published blog by slug without authentication', async () => {
    const mockBlog = publicPublishedBlog();
    vi.spyOn(Blog, 'findOne').mockResolvedValue(mockBlog);

    const app = createApp(vi.fn().mockResolvedValue(true));
    const response = await request(app).get('/api/v1/public/blogs/eye-care-tips');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.slug).toBe('eye-care-tips');
    expect(response.body.data.published_version.template_key).toBe('template_2');
    expect(response.body.data.published_version.title).toBe('Published Eye Care Tips');
    expect(response.body.data.author.name).toBe('Dr. John Doe');
  });

  it('lists published blogs publicly without authentication', async () => {
    const mockBlog = publicPublishedBlog();
    vi.spyOn(Blog, 'findAndCountAll').mockResolvedValue({ count: 1, rows: [mockBlog] } as any);

    const app = createApp(vi.fn().mockResolvedValue(true));
    const response = await request(app).get('/api/v1/public/blogs?page=1&limit=10');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].slug).toBe('eye-care-tips');
    expect(response.body.data.pagination.total_items).toBe(1);
  });

  it('returns 404 when public blog slug is not found or not published', async () => {
    vi.spyOn(Blog, 'findOne').mockResolvedValue(null);

    const app = createApp(vi.fn().mockResolvedValue(true));
    const response = await request(app).get('/api/v1/public/blogs/non-existent-slug');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });
});
