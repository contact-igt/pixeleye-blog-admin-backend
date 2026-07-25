import { Op } from 'sequelize';
import { Blog } from '../blogs/blog.model.js';
import { BlogVersion } from '../blogs/blog-version.model.js';
import { MediaAsset } from '../media/media.model.js';
import { CustomTemplate } from '../custom-templates/custom-template.model.js';
import { AdminUser } from '../auth/index.js';
import { listBlogTemplates } from '../blogs/blog-template.registry.js';

function formatTrackedBytes(value?: number | null): string {
  const bytes = Number(value ?? 0);
  if (!bytes || bytes <= 0) return '0 Bytes';
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export interface DashboardStats {
  blogs: {
    total: number;
    published: number;
    draft: number;
    trashed: number;
  };
  media: {
    total_active: number;
    tracked_storage_bytes: number;
    tracked_storage_formatted: string;
    missing_alt_text_count: number;
    trashed_count: number;
  };
  templates: {
    system_count: number;
    custom_active: number;
    custom_draft: number;
    custom_archived: number;
  };
  recent_blogs: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    created_at: string;
    updated_at: string;
    featured_media?: {
      id: string;
      original_url: string;
    } | null;
    author?: {
      id: string;
      name: string;
    } | null;
  }>;
  recent_media: Array<{
    id: string;
    original_file_name: string;
    purpose: string;
    alt_text: string | null;
    original_url: string | null;
    variants: Record<string, { url: string }>;
    file_size: number | null;
    created_at: string;
  }>;
}

export function createDashboardService() {
  return {
    async getDashboardStats(): Promise<DashboardStats> {
      const [
        publishedBlogsCount,
        draftBlogsCount,
        trashedBlogsCount,
        activeMediaCount,
        storageBytesSum,
        missingAltCount,
        trashedMediaCount,
        activeCustomTemplatesCount,
        draftCustomTemplatesCount,
        archivedCustomTemplatesCount,
        recentBlogRows,
        recentMediaRows
      ] = await Promise.all([
        Blog.count({ where: { status: 'published' } }),
        Blog.count({ where: { status: 'draft' } }),
        Blog.count({ where: { status: 'trashed' } }),
        MediaAsset.count({ where: { status: 'active' } }),
        MediaAsset.sum('fileSize', { where: { status: 'active' } }),
        MediaAsset.count({
          where: {
            status: 'active',
            [Op.or]: [
              { altText: null },
              { altText: '' }
            ]
          }
        }),
        MediaAsset.count({ where: { status: { [Op.in]: ['trashed', 'deleting', 'delete_failed'] } } }),
        CustomTemplate.count({ where: { status: 'active' } }),
        CustomTemplate.count({ where: { status: 'draft' } }),
        CustomTemplate.count({ where: { status: 'archived' } }),
        Blog.findAll({
          limit: 5,
          order: [['updatedAt', 'DESC']],
          attributes: ['id', 'slug', 'status', 'createdAt', 'updatedAt'],
          include: [
            { model: BlogVersion, as: 'currentDraftVersion', attributes: ['id', 'title', 'excerpt'] },
            { model: AdminUser, as: 'author', attributes: ['id', 'name'] },
            { model: MediaAsset, as: 'featuredMedia', attributes: ['id', 'originalUrl'] }
          ]
        }),
        MediaAsset.findAll({
          where: { status: 'active' },
          limit: 6,
          order: [['createdAt', 'DESC']],
          attributes: ['id', 'originalFileName', 'purpose', 'altText', 'originalUrl', 'variantsJson', 'fileSize', 'createdAt']
        })
      ]);

      const trackedBytes = Number(storageBytesSum ?? 0);
      const systemTemplateCount = listBlogTemplates().length;

      return {
        blogs: {
          total: publishedBlogsCount + draftBlogsCount + trashedBlogsCount,
          published: publishedBlogsCount,
          draft: draftBlogsCount,
          trashed: trashedBlogsCount
        },
        media: {
          total_active: activeMediaCount,
          tracked_storage_bytes: trackedBytes,
          tracked_storage_formatted: formatTrackedBytes(trackedBytes),
          missing_alt_text_count: missingAltCount,
          trashed_count: trashedMediaCount
        },
        templates: {
          system_count: systemTemplateCount,
          custom_active: activeCustomTemplatesCount,
          custom_draft: draftCustomTemplatesCount,
          custom_archived: archivedCustomTemplatesCount
        },
        recent_blogs: recentBlogRows.map((blog: any) => {
          const draft = blog.currentDraftVersion;
          return {
            id: String(blog.id),
            title: draft?.title ?? 'Untitled Article',
            slug: blog.slug,
            status: blog.status,
            created_at: blog.createdAt,
            updated_at: blog.updatedAt,
            featured_media: blog.featuredMedia
              ? { id: String(blog.featuredMedia.id), original_url: blog.featuredMedia.originalUrl }
              : null,
            author: blog.author ? { id: String(blog.author.id), name: blog.author.name } : null
          };
        }),
        recent_media: recentMediaRows.map((asset: any) => ({
          id: String(asset.id),
          original_file_name: asset.originalFileName,
          purpose: asset.purpose,
          alt_text: asset.altText ?? null,
          original_url: asset.originalUrl ?? null,
          variants: asset.variantsJson ?? {},
          file_size: asset.fileSize ? Number(asset.fileSize) : null,
          created_at: asset.createdAt
        }))
      };
    }
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
