import { describe, expect, it } from 'vitest';
import { sequelize } from '../src/config/database.js';
import { initializeBlogAssociations } from '../src/database/associations/index.js';
import { initializeAuthModels, initializeBlogModels, initializeMediaModels } from '../src/database/models/index.js';
import { tableNames } from '../src/database/table-names.js';
import { BlogVersion as CentralBlogVersion } from '../src/database/tables/blog-versions.table.js';
import { Blog as CentralBlog } from '../src/database/tables/blogs.table.js';
import { BlogVersion as CompatibilityBlogVersion } from '../src/modules/blogs/blog-version.model.js';
import { Blog as CompatibilityBlog } from '../src/modules/blogs/blog.model.js';

describe('central Blog and BlogVersion models', () => {
  it('initializes both models once and preserves exact compatibility identity', () => {
    const first = initializeBlogModels(sequelize);
    const second = initializeBlogModels(sequelize);

    expect(first.Blog).toBe(CentralBlog);
    expect(first.BlogVersion).toBe(CentralBlogVersion);
    expect(second.Blog).toBe(first.Blog);
    expect(second.BlogVersion).toBe(first.BlogVersion);
    expect(sequelize.models.Blog).toBe(CentralBlog);
    expect(sequelize.models.BlogVersion).toBe(CentralBlogVersion);
    expect(CompatibilityBlog).toBe(CentralBlog);
    expect(CompatibilityBlogVersion).toBe(CentralBlogVersion);
  });

  it('preserves model and physical table identities', () => {
    expect(CentralBlog.name).toBe('Blog');
    expect(CentralBlog.tableName).toBe(tableNames.BLOGS);
    expect(CentralBlogVersion.name).toBe('BlogVersion');
    expect(CentralBlogVersion.tableName).toBe(tableNames.BLOG_VERSIONS);
  });

  it('maps every migration-backed Blog field and timestamp without paranoid deletion', () => {
    const attributes = CentralBlog.getAttributes();

    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
      'id', 'slug', 'status', 'statusBeforeTrash', 'authorId', 'featuredMediaId',
      'currentDraftVersionId', 'currentPublishedVersionId', 'publishedAt', 'unpublishedAt',
      'trashedAt', 'trashedBy', 'restoredAt', 'restoredBy', 'createdBy', 'updatedBy',
      'createdAt', 'updatedAt'
    ]));
    expect(attributes.statusBeforeTrash.field).toBe('status_before_trash');
    expect(attributes.currentDraftVersionId.field).toBe('current_draft_version_id');
    expect(attributes.currentPublishedVersionId.field).toBe('current_published_version_id');
    expect(attributes.createdAt.field).toBe('created_at');
    expect(attributes.updatedAt.field).toBe('updated_at');
    expect(attributes.slug.unique).toBe(true);
    expect(CentralBlog.options.timestamps).toBe(true);
    expect(CentralBlog.options.paranoid).toBe(false);
    expect(attributes.deletedAt).toBeUndefined();
  });

  it('preserves Blog indexes and migration-backed foreign-key metadata', () => {
    const attributes = CentralBlog.getAttributes();
    const indexes = CentralBlog.options.indexes?.map((index) => index.name);

    expect(indexes).toEqual(expect.arrayContaining([
      'idx_blogs_slug', 'idx_blogs_status', 'idx_blogs_author_id',
      'idx_blogs_featured_media_id', 'idx_blogs_published_at',
      'idx_blogs_trashed_at', 'idx_blogs_created_at'
    ]));
    expect(attributes.authorId.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
    expect(attributes.featuredMediaId.references).toMatchObject({ model: tableNames.MEDIA_ASSETS, key: 'id' });
    expect(attributes.currentDraftVersionId.references).toMatchObject({ model: tableNames.BLOG_VERSIONS, key: 'id' });
    expect(attributes.currentPublishedVersionId.references).toMatchObject({ model: tableNames.BLOG_VERSIONS, key: 'id' });
  });

  it('maps append-only BlogVersion fields, JSON columns, and created_at only', () => {
    const attributes = CentralBlogVersion.getAttributes();

    expect(Object.keys(attributes)).toEqual(expect.arrayContaining([
      'id', 'blogId', 'versionNumber', 'versionType', 'title', 'excerpt',
      'contentJson', 'contentHtml', 'seoTitle', 'seoDescription', 'canonicalUrl',
      'featuredMediaId', 'templateKey', 'templateVersion', 'templateConfigJson',
      'blocksJson', 'createdBy', 'created_at'
    ]));
    expect(attributes.contentJson.type.constructor.name).toBe('JSONTYPE');
    expect(attributes.templateConfigJson.type.constructor.name).toBe('JSONTYPE');
    expect(attributes.blocksJson.type.constructor.name).toBe('JSONTYPE');
    expect(attributes.blocksJson.allowNull).toBe(true);
    expect(CentralBlogVersion.options.timestamps).toBe(true);
    expect(CentralBlogVersion.options.createdAt).toBe('created_at');
    expect(CentralBlogVersion.options.updatedAt).toBe(false);
    expect(attributes.updated_at).toBeUndefined();
  });

  it('preserves BlogVersion indexes and foreign-key metadata', () => {
    const attributes = CentralBlogVersion.getAttributes();
    const indexes = CentralBlogVersion.options.indexes?.map((index) => index.name);

    expect(indexes).toEqual(expect.arrayContaining([
      'idx_blog_versions_blog_id', 'idx_blog_versions_template',
      'idx_blog_versions_version_type', 'idx_blog_versions_version_number',
      'idx_blog_versions_created_at'
    ]));
    expect(attributes.blogId.references).toMatchObject({ model: tableNames.BLOGS, key: 'id' });
    expect(attributes.featuredMediaId.references).toMatchObject({ model: tableNames.MEDIA_ASSETS, key: 'id' });
    expect(attributes.createdBy.references).toMatchObject({ model: tableNames.ADMIN_USERS, key: 'id' });
  });

  it('registers all existing aliases once across the cyclic relationships', () => {
    const first = initializeBlogAssociations(sequelize);
    const second = initializeBlogAssociations(sequelize);

    expect(first.Blog.associations.author).toBe(second.Blog.associations.author);
    expect(Object.keys(CentralBlog.associations)).toEqual(expect.arrayContaining([
      'author', 'creator', 'updater', 'trashedByAdmin', 'restoredByAdmin',
      'featuredMedia', 'versions', 'currentDraftVersion', 'currentPublishedVersion'
    ]));
    expect(Object.keys(CentralBlogVersion.associations)).toEqual(expect.arrayContaining([
      'blog', 'creator', 'featuredMedia'
    ]));
    expect(CentralBlog.associations.currentDraftVersion.target).toBe(CentralBlogVersion);
    expect(CentralBlog.associations.currentPublishedVersion.target).toBe(CentralBlogVersion);
    expect(CentralBlogVersion.associations.blog.target).toBe(CentralBlog);
  });

  it('leaves Auth and Media model initialization idempotent', () => {
    expect(initializeAuthModels(sequelize).AdminUser).toBe(initializeAuthModels(sequelize).AdminUser);
    expect(initializeMediaModels(sequelize).MediaAsset).toBe(initializeMediaModels(sequelize).MediaAsset);
  });
});
