import { Op, type Transaction, type WhereOptions } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { ApiError } from '../../utils/api-error.js';
import { AdminUser, type AdminUserRole } from '../auth/index.js';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';
import { MediaAsset } from '../media/media.model.js';
import { Blog, type BlogStatus } from './blog.model.js';
import { BlogVersion } from './blog-version.model.js';
import { blogBlockCompletionErrors, collectBlogBlockMediaIds, customInstanceCompletionErrors, isEnabledBlogBlockComplete, normalizeBlogBlocks } from './blog-block.validation.js';
import type { BlogBlocksDocument } from './blog-block.types.js';
import {
  INTERNAL_CUSTOM_TEMPLATE_KEY,
  INTERNAL_CUSTOM_TEMPLATE_RENDERER_VERSION,
  isValidTemplateSnapshot,
  listBlogTemplates,
  normalizeStoredTemplate,
  resolveBlogTemplate,
  templateMetadata,
  type BlogTemplateSnapshot
} from './blog-template.registry.js';
import { assertUse } from '../custom-templates/custom-template.authorization.js';
import { CustomTemplate, CustomTemplateVersion } from '../custom-templates/custom-template.model.js';
import { validateCustomTemplateLayout } from './custom-templates/custom-template.validation.js';
import {
  blogListQuerySchema,
  blogTrashListQuerySchema,
  createBlogSchema,
  generateBlogHtmlFromJson,
  isBlogContentEmpty,
  normalizeBlogSlug,
  publicBlogListQuerySchema,
  sanitizeGeneratedBlogHtml,
  updateBlogSchema,
  type BlogListQuery,
  type CreateBlogInput,
  type UpdateBlogInput
} from './blog.validation.js';

export interface BlogActor { id: string; role: AdminUserRole }

const adminAttrs = ['id', 'name', 'email', 'role'];
const blogSortColumns: Record<string, string> = { created_at: 'createdAt', updated_at: 'updatedAt', published_at: 'publishedAt', status: 'status' };
const trashSortColumns: Record<string, string> = { created_at: 'createdAt', updated_at: 'updatedAt', published_at: 'publishedAt', status: 'status', trashed_at: 'trashedAt' };

function plain(model: any) { return typeof model?.get === 'function' ? model.get({ plain: true }) : model; }
function safeAdmin(admin: any) { const data = plain(admin); return data ? { id: String(data.id), name: data.name, email: data.email, role: data.role } : null; }
function mediaSummary(media: any) {
  const data = plain(media);
  if (!data) return null;
  const originalUrl = data.originalUrl ?? data.original_url ?? data.url ?? null;
  const variants = data.variantsJson ?? data.variants_json ?? {};
  let resolvedUrl = originalUrl;
  if (!resolvedUrl && variants && typeof variants === 'object') {
    const firstVariant = Object.values(variants)[0] as any;
    resolvedUrl = firstVariant?.url ?? null;
  }
  return {
    id: String(data.id),
    original_file_name: data.originalFileName ?? data.original_file_name ?? data.originalFilename ?? null,
    original_url: resolvedUrl,
    variants: variants ?? {},
    alt_text: data.altText ?? data.alt_text ?? null,
    status: data.status
  };
}

function hydrateBlogBlocksMedia(blocksDoc: any, mediaMap?: Map<string | number, any>): any {
  if (!blocksDoc) return blocksDoc;
  const blocks = blocksDoc.blocks ? { ...blocksDoc.blocks } : {};
  if (blocks.expert_quote) {
    const mediaId = blocks.expert_quote.media_id;
    const asset = mediaId ? (mediaMap?.get(String(mediaId)) ?? mediaMap?.get(Number(mediaId))) : null;
    const summary = mediaSummary(asset);
    let url = summary?.original_url ?? asset?.originalUrl ?? asset?.original_url ?? asset?.url ?? null;
    if (!url && typeof mediaId === 'string' && (mediaId.startsWith('http://') || mediaId.startsWith('https://') || mediaId.startsWith('/'))) {
      url = mediaId;
    }
    if (!url && blocks.expert_quote.profile_url) {
      url = blocks.expert_quote.profile_url;
    }
    blocks.expert_quote = {
      ...blocks.expert_quote,
      url,
      original_url: url,
      media: summary
    };
  }
  if (blocks.image_comparison && Array.isArray(blocks.image_comparison.items)) {
    blocks.image_comparison = {
      ...blocks.image_comparison,
      items: blocks.image_comparison.items.map((item: any) => {
        const mediaId = item.media_id;
        const asset = mediaId ? (mediaMap?.get(String(mediaId)) ?? mediaMap?.get(Number(mediaId))) : null;
        const summary = mediaSummary(asset);
        let url = summary?.original_url ?? asset?.originalUrl ?? asset?.original_url ?? asset?.url ?? null;
        if (!url && typeof mediaId === 'string' && (mediaId.startsWith('http://') || mediaId.startsWith('https://') || mediaId.startsWith('/'))) {
          url = mediaId;
        }
        return {
          ...item,
          url,
          original_url: url,
          media: summary
        };
      })
    };
  }

  let custom_instances = blocksDoc.custom_instances;
  if (custom_instances && typeof custom_instances === 'object') {
    const updatedCustom: Record<string, any> = {};
    for (const [key, instance] of Object.entries(custom_instances)) {
      if (!instance || typeof instance !== 'object') {
        updatedCustom[key] = instance;
        continue;
      }
      const inst = { ...(instance as any) };
      if (inst.componentKey === 'expert_quote' || inst.media_id !== undefined) {
        const mediaId = inst.media_id;
        const asset = mediaId ? (mediaMap?.get(String(mediaId)) ?? mediaMap?.get(Number(mediaId))) : null;
        const summary = mediaSummary(asset);
        let url = summary?.original_url ?? asset?.originalUrl ?? asset?.original_url ?? asset?.url ?? null;
        if (!url && typeof mediaId === 'string' && (mediaId.startsWith('http://') || mediaId.startsWith('https://') || mediaId.startsWith('/'))) {
          url = mediaId;
        }
        if (!url && inst.profile_url) {
          url = inst.profile_url;
        }
        inst.url = url;
        inst.original_url = url;
        inst.media = summary;
      }
      if (inst.componentKey === 'image_comparison' && Array.isArray(inst.items)) {
        inst.items = inst.items.map((item: any) => {
          const mediaId = item.media_id;
          const asset = mediaId ? (mediaMap?.get(String(mediaId)) ?? mediaMap?.get(Number(mediaId))) : null;
          const summary = mediaSummary(asset);
          let url = summary?.original_url ?? asset?.originalUrl ?? asset?.original_url ?? asset?.url ?? null;
          if (!url && typeof mediaId === 'string' && (mediaId.startsWith('http://') || mediaId.startsWith('https://') || mediaId.startsWith('/'))) {
            url = mediaId;
          }
          return {
            ...item,
            url,
            original_url: url,
            media: summary
          };
        });
      }
      updatedCustom[key] = inst;
    }
    custom_instances = updatedCustom;
  }

  return { ...blocksDoc, blocks, custom_instances };
}

async function buildMediaMapForBlogs(blogs: any[], transaction?: Transaction): Promise<Map<string | number, any>> {
  const map = new Map<string | number, any>();
  const mediaIds: Array<string | number> = [];

  function collectFromObj(obj: any) {
    if (!obj) return;
    const data = plain(obj);
    if (data?.blocksJson || data?.blocks_json) {
      try {
        const blocks = normalizeBlogBlocks(data.blocksJson ?? data.blocks_json);
        mediaIds.push(...collectBlogBlockMediaIds(blocks));
        // eslint-disable-next-line no-empty
      } catch {}
    }
    if (data?.currentDraftVersion || data?.current_draft_version) collectFromObj(data.currentDraftVersion ?? data.current_draft_version);
    if (data?.currentPublishedVersion || data?.current_published_version) collectFromObj(data.currentPublishedVersion ?? data.current_published_version);
  }

  for (const blogItem of blogs) {
    collectFromObj(blogItem);
  }

  const rawUnique = [...new Set(mediaIds.filter(Boolean))];
  if (rawUnique.length === 0) return map;
  const uniqueIds = [...new Set(rawUnique.flatMap((id) => {
    const str = String(id);
    const num = Number(id);
    return !isNaN(num) ? [str, num] : [str];
  }))];

  try {
    const assets = await MediaAsset.findAll({
      where: { id: { [Op.in]: uniqueIds } },
      paranoid: false,
      transaction
    });
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        const plainAsset = plain(asset);
        if (plainAsset && plainAsset.id !== undefined && plainAsset.id !== null) {
          map.set(String(plainAsset.id), plainAsset);
          map.set(Number(plainAsset.id), plainAsset);
        }
      }
    }
  } catch (error) {
    console.error('[buildMediaMapForBlogs error]:', error);
  }
  return map;
}

function versionSummary(version: any, includeContent = true, mediaMap?: Map<string | number, any>) {
  const data = plain(version);
  if (!data) return null;
  const snapshot = normalizeStoredTemplate(data);
  const rawBlocks = normalizeBlogBlocks(data.blocksJson ?? data.blocks_json);
  const hydratedBlocks = hydrateBlogBlocksMedia(rawBlocks, mediaMap);
  return {
    id: String(data.id),
    version_number: data.versionNumber ?? data.version_number,
    version_type: data.versionType ?? data.version_type,
    title: data.title,
    excerpt: data.excerpt,
    ...(includeContent ? { content_json: data.contentJson ?? data.content_json, content_html: data.contentHtml ?? data.content_html } : {}),
    blocks_json: hydratedBlocks,
    seo_title: data.seoTitle ?? data.seo_title,
    seo_description: data.seoDescription ?? data.seo_description,
    canonical_url: data.canonicalUrl ?? data.canonical_url,
    featured_media_id: data.featuredMediaId ?? data.featured_media_id ? String(data.featuredMediaId ?? data.featured_media_id) : null,
    template_key: snapshot.templateKey,
    template_version: snapshot.templateVersion,
    template: templateMetadata(snapshot),
    custom_template_id: snapshot.customTemplateId,
    custom_template_version_id: snapshot.customTemplateVersionId,
    ...(snapshot.templateKey === 'custom_template' ? { template_config_json: snapshot.invalid ? null : snapshot.templateConfigJson, template_invalid: Boolean(snapshot.invalid) } : {}),
    created_at: data.createdAt ?? data.created_at
  };
}

function hasUnpublishedChanges(blog: any) {
  const data = plain(blog);
  const draftId = data.currentDraftVersionId ?? data.current_draft_version_id;
  const publishedId = data.currentPublishedVersionId ?? data.current_published_version_id;
  return Boolean(draftId && publishedId && String(draftId) !== String(publishedId));
}

function hasUnpublishedTemplateChanges(blog: any) {
  const data = plain(blog);
  const draft = data.currentDraftVersion ?? data.current_draft_version;
  const published = data.currentPublishedVersion ?? data.current_published_version;
  if (!draft || !published) return false;
  const draftTemplate = normalizeStoredTemplate(plain(draft));
  const publishedTemplate = normalizeStoredTemplate(plain(published));
  return draftTemplate.templateKey !== publishedTemplate.templateKey || draftTemplate.templateVersion !== publishedTemplate.templateVersion;
}

function serializeBlog(blog: any, includeContent = false, mediaMap?: Map<string | number, any>) {
  const data = plain(blog);
  const draft = data.currentDraftVersion ?? data.current_draft_version;
  return {
    id: String(data.id),
    title: draft?.title ?? '',
    slug: data.slug,
    excerpt: draft?.excerpt ?? null,
    status: data.status,
    previous_status: data.statusBeforeTrash ?? data.status_before_trash ?? null,
    featured_media: mediaSummary(data.featuredMedia),
    author: safeAdmin(data.author),
    published_at: data.publishedAt ?? data.published_at ?? null,
    unpublished_at: data.unpublishedAt ?? data.unpublished_at ?? null,
    trashed_at: data.trashedAt ?? data.trashed_at ?? null,
    trashed_by: safeAdmin(data.trashedByAdmin),
    updated_at: data.updatedAt ?? data.updated_at,
    created_at: data.createdAt ?? data.created_at,
    has_unpublished_changes: hasUnpublishedChanges(data),
    has_unpublished_template_changes: hasUnpublishedTemplateChanges(data),
    ...(includeContent ? {
      draft_version: versionSummary(draft, true, mediaMap),
      published_version: versionSummary(data.currentPublishedVersion ?? data.current_published_version, true, mediaMap),
      creator: safeAdmin(data.creator),
      updater: safeAdmin(data.updater)
    } : {})
  };
}

function serializePublicBlog(blog: any, mediaMap?: Map<string | number, any>) {
  const data = plain(blog);
  const published = data.currentPublishedVersion ?? data.current_published_version;
  return {
    id: String(data.id),
    title: published?.title ?? '',
    slug: data.slug,
    excerpt: published?.excerpt ?? null,
    status: data.status,
    featured_media: mediaSummary(data.featuredMedia),
    author: safeAdmin(data.author),
    published_at: data.publishedAt ?? data.published_at ?? null,
    updated_at: data.updatedAt ?? data.updated_at,
    created_at: data.createdAt ?? data.created_at,
    published_version: versionSummary(published, true, mediaMap)
  };
}

function pagination(page: number, limit: number, totalItems: number) { const totalPages = Math.ceil(totalItems / limit); return { page, limit, total_items: totalItems, total_pages: totalPages, has_next_page: page < totalPages, has_previous_page: page > 1 }; }
function includeBlog() { return [
  { model: BlogVersion, as: 'currentDraftVersion', required: false },
  { model: BlogVersion, as: 'currentPublishedVersion', required: false },
  { model: AdminUser, as: 'author', attributes: adminAttrs, required: false },
  { model: AdminUser, as: 'creator', attributes: adminAttrs, required: false },
  { model: AdminUser, as: 'updater', attributes: adminAttrs, required: false },
  { model: AdminUser, as: 'trashedByAdmin', attributes: adminAttrs, required: false },
  { model: AdminUser, as: 'restoredByAdmin', attributes: adminAttrs, required: false },
  { model: MediaAsset, as: 'featuredMedia', required: false }
]; }
function canManageAll(actor: BlogActor) { return actor.role === 'super_admin' || actor.role === 'editor'; }
function assertCreate(actor: BlogActor) { if (['super_admin', 'editor', 'author'].includes(actor.role)) return; throw new ApiError(403, 'Insufficient permissions'); }
function assertView(actor: BlogActor, blog: any) { if (canManageAll(actor) || actor.role === 'viewer') return; const data = plain(blog); if (String(data.authorId ?? data.author_id) === String(actor.id)) return; throw new ApiError(403, 'Insufficient permissions'); }
function assertEdit(actor: BlogActor, blog: any) { if (canManageAll(actor)) return; const data = plain(blog); if (actor.role === 'author' && String(data.authorId ?? data.author_id) === String(actor.id) && ['draft', 'unpublished', 'published'].includes(data.status)) return; throw new ApiError(403, 'Insufficient permissions'); }
function assertPublish(actor: BlogActor) { if (canManageAll(actor)) return; throw new ApiError(403, 'Insufficient permissions'); }
function assertTrash(actor: BlogActor, blog: any) { if (canManageAll(actor)) return; const data = plain(blog); if (actor.role === 'author' && String(data.authorId ?? data.author_id) === String(actor.id) && data.status !== 'published') return; throw new ApiError(403, 'Insufficient permissions'); }
function assertRestore(actor: BlogActor) { if (canManageAll(actor)) return; throw new ApiError(403, 'Insufficient permissions'); }
async function ensureUniqueSlug(slug: string, exceptId?: string, transaction?: Transaction) { const where: WhereOptions = exceptId ? { slug, id: { [Op.ne]: exceptId } } : { slug }; const existing = await Blog.findOne({ where, transaction }); if (existing) throw new ApiError(409, 'Blog slug already exists'); }
async function validateFeaturedMedia(id?: string | null, transaction?: Transaction) { if (!id) return null; const media = await MediaAsset.findByPk(id, { transaction }); if (!media) throw new ApiError(422, 'Featured media was not found'); const data = plain(media); if (data.status !== 'active') throw new ApiError(422, 'Featured media must be active'); if (!(data.originalUrl ?? data.original_url)) throw new ApiError(422, 'Featured media does not have a public URL'); return media; }

async function validateBlockMedia(document: BlogBlocksDocument, transaction?: Transaction) {
  const references = document.blocks.image_comparison.items.map((item, index) => ({ id: item.media_id, field: `blocks_json.blocks.image_comparison.items.${index}.media_id` }));
  references.push({ id: document.blocks.expert_quote.media_id, field: 'blocks_json.blocks.expert_quote.media_id' });
  for (const [blockId, instance] of Object.entries(document.custom_instances ?? {})) {
    if (instance.componentKey === 'image_comparison') {
      instance.items.forEach((item, index) => references.push({ id: item.media_id, field: `blocks_json.custom_instances.${blockId}.items.${index}.media_id` }));
    } else if (instance.componentKey === 'expert_quote') {
      references.push({ id: instance.media_id, field: `blocks_json.custom_instances.${blockId}.media_id` });
    }
  }
  for (const reference of references) {
    if (!reference.id) continue;
    const media = await MediaAsset.findByPk(reference.id, { transaction, paranoid: false });
    const data = plain(media);
    if (!media || data.status !== 'active' || data.deletedAt || data.deleted_at || !(data.originalUrl ?? data.original_url)) {
      throw new ApiError(422, 'Some article sections need attention.', [{ field: reference.field, message: 'Selected media must be active and have a public URL.' }]);
    }
  }
}

function parseContentJson(value: unknown): unknown {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } }
  return value;
}

async function resolveBlogTemplateSelection(
  input: { template_key?: string; custom_template_id?: string | null },
  actor: BlogActor,
  transaction: Transaction
): Promise<BlogTemplateSnapshot> {
  if (input.template_key !== INTERNAL_CUSTOM_TEMPLATE_KEY) {
    return resolveBlogTemplate(input.template_key);
  }
  const customTemplateId = input.custom_template_id;
  if (!customTemplateId) throw new ApiError(422, 'custom_template_id is required when template_key is custom_template');
  const template = await CustomTemplate.findByPk(customTemplateId, { transaction });
  if (!template) throw new ApiError(422, 'Selected Custom Template was not found');
  const templateData = plain(template);
  assertUse({ id: actor.id, role: actor.role }, templateData);
  if (templateData.status !== 'active') throw new ApiError(409, 'Selected Custom Template is not active');
  const currentVersionId = templateData.currentVersionId ?? templateData.current_version_id;
  if (!currentVersionId) throw new ApiError(422, 'Selected Custom Template has no version to use');
  const version = await CustomTemplateVersion.findByPk(currentVersionId, { transaction });
  if (!version) throw new ApiError(422, 'Selected Custom Template has no version to use');
  const versionData = plain(version);
  const layout = validateCustomTemplateLayout(versionData.layoutConfigJson ?? versionData.layout_config_json);
  return {
    templateKey: INTERNAL_CUSTOM_TEMPLATE_KEY,
    templateVersion: INTERNAL_CUSTOM_TEMPLATE_RENDERER_VERSION,
    templateConfigJson: layout as unknown as Record<string, unknown>,
    customTemplateId: String(customTemplateId),
    customTemplateVersionId: String(currentVersionId)
  };
}

function versionPayload(input: CreateBlogInput | UpdateBlogInput, template: BlogTemplateSnapshot) {
  const contentJson = input.content_json != null ? parseContentJson(input.content_json) : null;
  const blocksJson = normalizeBlogBlocks(input.blocks_json);
  return {
    title: input.title,
    excerpt: input.excerpt ?? null,
    contentJson,
    contentHtml: contentJson ? sanitizeGeneratedBlogHtml(generateBlogHtmlFromJson(contentJson)) : null,
    seoTitle: input.seo_title ?? null,
    seoDescription: input.seo_description ?? null,
    canonicalUrl: input.canonical_url ?? null,
    featuredMediaId: input.featured_media_id ?? null,
    blocksJson,
    ...template
  };
}

function publishChecklist(version: any, blog: any) {
  const draft = plain(version); const blogData = plain(blog); const media = plain(blogData.featuredMedia);
  const blocks = normalizeBlogBlocks(draft.blocksJson ?? draft.blocks_json);
  const complete = (key: string, done: boolean, completeMessage: string, incompleteMessage: string, warning = false) => ({ key, status: done ? 'complete' : warning ? 'warning' : 'incomplete', message: done ? completeMessage : incompleteMessage });
  const items = [
    complete('template', isValidTemplateSnapshot(draft), 'Article template selected', 'Select a valid article template'),
    complete('title', Boolean(draft.title?.trim()), 'Title is complete', 'Add a title'),
    complete('slug', Boolean(blogData.slug?.trim()), 'Slug is complete', 'Add a slug'),
    complete('excerpt', Boolean(draft.excerpt?.trim()), 'Excerpt is complete', 'Add an excerpt'),
    complete('content', !isBlogContentEmpty(draft.contentJson ?? draft.content_json), 'Content is complete', 'Add blog content'),
    complete('featured_media', Boolean(blogData.featuredMediaId ?? blogData.featured_media_id), 'Featured image is complete', 'Select an active featured image'),
    complete('featured_media_alt_text', Boolean(media?.altText?.trim() ?? media?.alt_text?.trim()), 'Featured image alt text is complete', 'Add alt text to the selected featured image'),
    complete('seo_title', Boolean(draft.seoTitle?.trim() ?? draft.seo_title?.trim()), 'SEO title is complete', 'SEO title is recommended', true),
    complete('seo_description', Boolean(draft.seoDescription?.trim() ?? draft.seo_description?.trim()), 'SEO description is complete', 'SEO description is recommended', true),
    complete('canonical_url', Boolean(draft.canonicalUrl?.trim() ?? draft.canonical_url?.trim()), 'Canonical URL is complete', 'Canonical URL is optional', true)
  ];
  const snapshot = normalizeStoredTemplate(draft);
  if (snapshot.templateKey === 'template_1' && snapshot.templateVersion === 2) {
    const blockItems = [
      ['disclaimer', 'Medical disclaimer is complete', 'Medical disclaimer must be enabled and contain text'],
      ['key_takeaways', 'Key Takeaways are complete', 'Complete the enabled Key Takeaways section'],
      ['image_comparison', 'Image Comparison is complete', 'Complete the enabled Image Comparison section'],
      ['numbered_list', 'Numbered List is complete', 'Complete the enabled Numbered List section'],
      ['expert_quote', 'Expert Quote is complete', 'Complete the enabled Expert Quote section'],
      ['medical_cta', 'Medical CTA is complete', 'Complete the enabled Medical CTA section'],
      ['faq', 'FAQ is complete', 'Complete the enabled FAQ section']
    ] as const;
    for (const [key, completeMessage, incompleteMessage] of blockItems) {
      const block = blocks.blocks[key];
      const enabled = key === 'disclaimer' || ('enabled' in block && block.enabled);
      items.push(complete(`block_${key}`, !enabled || isEnabledBlogBlockComplete(blocks, key), completeMessage, incompleteMessage));
    }
    items.push(complete('block_hero_category', Boolean(blocks.blocks.hero.category), 'Hero category is complete', 'Hero category is recommended', true));
    items.push(complete('block_hero_breadcrumb', blocks.blocks.hero.breadcrumb.length > 0, 'Hero breadcrumb is complete', 'Hero breadcrumb is recommended', true));
    items.push(complete('block_hero_reviewer', Boolean(blocks.blocks.hero.reviewer.name), 'Medical reviewer is complete', 'Medical reviewer is recommended', true));
    items.push(complete('block_hero_reading_time', Boolean(blocks.blocks.hero.reading_time_minutes), 'Reading time is complete', 'Reading time is recommended', true));
    if (blocks.blocks.expert_quote.enabled) items.push(complete('block_expert_avatar', Boolean(blocks.blocks.expert_quote.media_id), 'Expert avatar is complete', 'Expert avatar is optional', true));
  } else if (snapshot.templateKey === 'custom_template' && !snapshot.invalid) {
    const instanceErrors = customInstanceCompletionErrors(blocks);
    for (const [blockId, instance] of Object.entries(blocks.custom_instances ?? {})) {
      const label = instance.componentKey.replace(/_/g, ' ');
      const done = !instanceErrors.some((error) => error.field.startsWith(`blocks_json.custom_instances.${blockId}.`));
      items.push(complete(`block_${blockId}`, done, `${label} is complete`, `Complete the ${label} section`));
    }
  }
  return { ready: !items.some((entry) => entry.status === 'incomplete'), items };
}
function publishReady(version: any, blog: any) {
  const checklist = publishChecklist(version, blog);
  if (!checklist.ready) {
    const draft = plain(version);
    const blocks = normalizeBlogBlocks(draft.blocksJson ?? draft.blocks_json);
    const snapshot = normalizeStoredTemplate(draft);
    const blockErrors = snapshot.templateKey === 'custom_template' ? customInstanceCompletionErrors(blocks) : blogBlockCompletionErrors(blocks);
    throw new ApiError(422, checklist.items.filter((item) => item.status === 'incomplete').map((item) => item.message).join('. '), blockErrors);
  }
}
function listWhere(query: BlogListQuery, actor: BlogActor, trashed = false) { const where: Record<string | symbol, unknown> = trashed ? { status: 'trashed' } : { status: { [Op.ne]: 'trashed' } }; if (!trashed && query.status) where.status = query.status; if (query.author_id && canManageAll(actor)) where.authorId = query.author_id; if (query.has_featured_image === 'true') where.featuredMediaId = { [Op.ne]: null }; if (query.has_featured_image === 'false') where.featuredMediaId = null; if (actor.role === 'author') where.authorId = actor.id; if (query.search) { const like = `%${query.search.replace(/[%_\\]/g, '\\$&')}%`; where[Op.or] = [{ slug: { [Op.like]: like } }, { '$currentDraftVersion.title$': { [Op.like]: like } }, { '$currentDraftVersion.excerpt$': { [Op.like]: like } }]; } return where; }

export function createBlogService() {
  return {
    listTemplates() { return listBlogTemplates(); },

    async createBlog(raw: unknown, actor: BlogActor) {
      assertCreate(actor);
      const input = createBlogSchema.parse(raw);
      const slug = normalizeBlogSlug(input.slug || input.title);
      return sequelize.transaction(async (transaction) => {
        const template = await resolveBlogTemplateSelection(input, actor, transaction);
        await ensureUniqueSlug(slug, undefined, transaction);
        await validateFeaturedMedia(input.featured_media_id, transaction);
        await validateBlockMedia(normalizeBlogBlocks(input.blocks_json), transaction);
        const blog = await Blog.create({ slug, status: 'draft', authorId: actor.id, featuredMediaId: input.featured_media_id ?? null, createdBy: actor.id, updatedBy: actor.id }, { transaction });
        const draft = await BlogVersion.create({ blogId: blog.id, versionNumber: 1, versionType: 'draft', ...versionPayload(input, template), title: input.title, createdBy: actor.id } as any, { transaction });
        await blog.update({ currentDraftVersionId: draft.id }, { transaction });
        await writeAuthAuditLog({ action: 'BLOG_CREATED', adminUserId: actor.id, metadata: { blog_id: blog.id, slug, template_key: template.templateKey, template_version: template.templateVersion } }, transaction);
        return this.getBlog(String(blog.id), actor, transaction);
      });
    },

    async listBlogs(raw: unknown, actor: BlogActor) {
      const query = blogListQuerySchema.parse(raw); const include = includeBlog();
      const result = await Blog.findAndCountAll({ where: listWhere(query, actor), include, subQuery: false, limit: query.limit, offset: (query.page - 1) * query.limit, order: (query.sort_by === 'title' ? [[{ model: BlogVersion, as: 'currentDraftVersion' }, 'title', query.sort_order.toUpperCase()]] : [[blogSortColumns[query.sort_by], query.sort_order.toUpperCase()]]) as any, distinct: true });
      const mediaMap = await buildMediaMapForBlogs(result.rows);
      return { items: result.rows.map((blog) => serializeBlog(blog, true, mediaMap)), pagination: pagination(query.page, query.limit, Array.isArray(result.count) ? result.count.length : result.count) };
    },

    async listTrashedBlogs(raw: unknown, actor: BlogActor) {
      const query = blogTrashListQuerySchema.parse(raw); const include = includeBlog();
      const result = await Blog.findAndCountAll({ where: listWhere({ ...query, status: undefined } as BlogListQuery, actor, true), include, subQuery: false, limit: query.limit, offset: (query.page - 1) * query.limit, order: (query.sort_by === 'title' ? [[{ model: BlogVersion, as: 'currentDraftVersion' }, 'title', query.sort_order.toUpperCase()]] : [[trashSortColumns[query.sort_by], query.sort_order.toUpperCase()]]) as any, distinct: true });
      const mediaMap = await buildMediaMapForBlogs(result.rows);
      return { items: result.rows.map((blog) => serializeBlog(blog, false, mediaMap)), pagination: pagination(query.page, query.limit, Array.isArray(result.count) ? result.count.length : result.count) };
    },

    async getBlog(id: string, actor: BlogActor, transaction?: Transaction) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid');
      const blog = await Blog.findByPk(id, { include: includeBlog(), transaction });
      if (!blog) throw new ApiError(404, 'Blog was not found');
      assertView(actor, blog);
      if (blog.status === 'trashed') throw new ApiError(404, 'Blog was not found');
      const mediaMap = await buildMediaMapForBlogs([blog], transaction);
      return serializeBlog(blog, true, mediaMap);
    },

    async updateBlog(id: string, raw: unknown, actor: BlogActor) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid');
      const input = updateBlogSchema.parse(raw);
      return sequelize.transaction(async (transaction) => {
        const blog = await Blog.findByPk(id, { include: includeBlog(), transaction });
        if (!blog) throw new ApiError(404, 'Blog was not found');
        assertEdit(actor, blog);
        if (blog.status === 'trashed') throw new ApiError(409, 'Trashed blogs cannot be edited');
        const updates: Record<string, unknown> = { updatedBy: actor.id };
        if (input.slug) { const slug = normalizeBlogSlug(input.slug); await ensureUniqueSlug(slug, id, transaction); updates.slug = slug; }
        if (input.featured_media_id !== undefined) { await validateFeaturedMedia(input.featured_media_id, transaction); updates.featuredMediaId = input.featured_media_id; }
        await blog.update(updates, { transaction });
        if (!blog.currentDraftVersionId) throw new ApiError(500, 'Blog draft version is missing');
        const draft = await BlogVersion.findByPk(blog.currentDraftVersionId, { transaction });
        if (!draft) throw new ApiError(500, 'Blog draft version is missing');
        const oldTemplate = normalizeStoredTemplate(plain(draft));
        const nextTemplate = input.template_key ? await resolveBlogTemplateSelection(input, actor, transaction) : oldTemplate;
        const nextBlocks = normalizeBlogBlocks(input.blocks_json === undefined ? draft.blocksJson : input.blocks_json);
        await validateBlockMedia(nextBlocks, transaction);
        const payload = versionPayload({
          ...plain(draft),
          ...input,
          title: input.title ?? draft.title,
          excerpt: input.excerpt ?? draft.excerpt,
          content_json: input.content_json ?? draft.contentJson,
          seo_title: input.seo_title ?? draft.seoTitle,
          seo_description: input.seo_description ?? draft.seoDescription,
          canonical_url: input.canonical_url ?? draft.canonicalUrl,
          featured_media_id: input.featured_media_id ?? draft.featuredMediaId,
          blocks_json: nextBlocks
        } as any, nextTemplate);
        await draft.update(payload as any, { transaction });
        const templateChanged = oldTemplate.templateKey !== nextTemplate.templateKey || oldTemplate.templateVersion !== nextTemplate.templateVersion;
        if (templateChanged) {
          await writeAuthAuditLog({ action: 'BLOG_TEMPLATE_CHANGED', adminUserId: actor.id, metadata: { blog_id: blog.id, old_template_key: oldTemplate.templateKey, old_template_version: oldTemplate.templateVersion, new_template_key: nextTemplate.templateKey, new_template_version: nextTemplate.templateVersion, administrator_id: actor.id, changed_at: new Date().toISOString() } }, transaction);
        }
        await writeAuthAuditLog({ action: 'BLOG_UPDATED', adminUserId: actor.id, metadata: { blog_id: blog.id, slug: updates.slug ?? blog.slug, changed_fields: Object.keys(input) } }, transaction);
        return this.getBlog(id, actor, transaction);
      });
    },

    async getPublishChecklist(id: string, actor: BlogActor) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid');
      const blog = await Blog.findByPk(id, { include: includeBlog() });
      if (!blog) throw new ApiError(404, 'Blog was not found');
      assertView(actor, blog);
      if (!blog.currentDraftVersionId) throw new ApiError(500, 'Blog draft version is missing');
      const draft = await BlogVersion.findByPk(blog.currentDraftVersionId);
      if (!draft) throw new ApiError(500, 'Blog draft version is missing');
      return publishChecklist(draft, blog);
    },

    async publishBlog(id: string, actor: BlogActor) {
      assertPublish(actor);
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid');
      return sequelize.transaction(async (transaction) => {
        const blog = await Blog.findByPk(id, { include: includeBlog(), transaction });
        if (!blog) throw new ApiError(404, 'Blog was not found');
        if (blog.status === 'trashed') throw new ApiError(409, 'Trashed blogs cannot be published');
        if (!blog.currentDraftVersionId) throw new ApiError(500, 'Blog draft version is missing');
        const draft = await BlogVersion.findByPk(blog.currentDraftVersionId, { transaction });
        if (!draft) throw new ApiError(500, 'Blog draft version is missing');
        const blocks = normalizeBlogBlocks(draft.blocksJson);
        await validateBlockMedia(blocks, transaction);
        if (!draft.blocksJson) await draft.update({ blocksJson: blocks }, { transaction });
        await validateFeaturedMedia(blog.featuredMediaId, transaction);
        publishReady(draft, blog);
        const template = normalizeStoredTemplate(plain(draft));
        const latest = await BlogVersion.max('versionNumber', { where: { blogId: blog.id }, transaction }) as number | null;
        const versionNumber = (latest ?? 1) + 1;
        const published = await BlogVersion.create({
          blogId: blog.id,
          versionNumber,
          versionType: 'published',
          title: draft.title,
          excerpt: draft.excerpt,
          contentJson: draft.contentJson,
          contentHtml: draft.contentHtml,
          seoTitle: draft.seoTitle,
          seoDescription: draft.seoDescription,
          canonicalUrl: draft.canonicalUrl,
          featuredMediaId: blog.featuredMediaId,
          blocksJson: blocks,
          ...template,
          createdBy: actor.id
        }, { transaction });
        const previousStatus = blog.status;
        await blog.update({ status: 'published', currentPublishedVersionId: published.id, publishedAt: blog.publishedAt ?? new Date(), unpublishedAt: null, updatedBy: actor.id }, { transaction });
        await writeAuthAuditLog({ action: previousStatus === 'published' ? 'BLOG_REPUBLISHED' : 'BLOG_PUBLISHED', adminUserId: actor.id, metadata: { blog_id: blog.id, slug: blog.slug, version_number: versionNumber, template_key: template.templateKey, template_version: template.templateVersion } }, transaction);
        return this.getBlog(id, actor, transaction);
      });
    },

    async unpublishBlog(id: string, actor: BlogActor) { assertPublish(actor); if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid'); const blog = await Blog.findByPk(id); if (!blog) throw new ApiError(404, 'Blog was not found'); if (blog.status === 'unpublished') return serializeBlog(await Blog.findByPk(id, { include: includeBlog() }), true); if (blog.status !== 'published') throw new ApiError(409, 'Only published blogs can be unpublished'); await blog.update({ status: 'unpublished', unpublishedAt: new Date(), updatedBy: actor.id }); await writeAuthAuditLog({ action: 'BLOG_UNPUBLISHED', adminUserId: actor.id, metadata: { blog_id: blog.id, slug: blog.slug } }); return this.getBlog(id, actor); },
    async moveBlogToTrash(id: string, actor: BlogActor) { if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid'); const blog = await Blog.findByPk(id, { include: includeBlog() }); if (!blog) throw new ApiError(404, 'Blog was not found'); assertTrash(actor, blog); if (blog.status === 'trashed') return serializeBlog(blog, true); const previousStatus = blog.status; await blog.update({ statusBeforeTrash: previousStatus, status: 'trashed', trashedAt: new Date(), trashedBy: actor.id, updatedBy: actor.id }); await writeAuthAuditLog({ action: 'BLOG_MOVED_TO_TRASH', adminUserId: actor.id, metadata: { blog_id: blog.id, slug: blog.slug, previous_status: previousStatus, new_status: 'trashed' } }); return serializeBlog(await Blog.findByPk(id, { include: includeBlog() }), true); },
    async restoreBlog(id: string, actor: BlogActor) { assertRestore(actor); if (!/^\d+$/.test(id)) throw new ApiError(400, 'Blog ID is invalid'); const blog = await Blog.findByPk(id, { include: includeBlog() }); if (!blog) throw new ApiError(404, 'Blog was not found'); if (blog.status !== 'trashed') return serializeBlog(blog, true); const previous = blog.statusBeforeTrash; const restoredStatus: BlogStatus = previous === 'published' ? 'unpublished' : (previous ?? 'draft'); await blog.update({ status: restoredStatus, statusBeforeTrash: null, trashedAt: null, trashedBy: null, restoredAt: new Date(), restoredBy: actor.id, updatedBy: actor.id }); await writeAuthAuditLog({ action: 'BLOG_RESTORED', adminUserId: actor.id, metadata: { blog_id: blog.id, slug: blog.slug, previous_status: previous, new_status: restoredStatus } }); return serializeBlog(await Blog.findByPk(id, { include: includeBlog() }), true); },

    async getPublicBlogBySlug(slug: string) {
      const normalizedSlug = slug.trim().toLowerCase();
      const blog = await Blog.findOne({
        where: { slug: normalizedSlug, status: 'published' },
        include: includeBlog()
      });
      if (!blog) throw new ApiError(404, 'Published blog post was not found');
      const data = plain(blog);
      if (!data.currentPublishedVersion && !data.current_published_version) {
        throw new ApiError(404, 'Published version is unavailable');
      }
      const mediaMap = await buildMediaMapForBlogs([blog]);
      return serializePublicBlog(blog, mediaMap);
    },

    async listPublicBlogs(rawQuery: unknown) {
      const query = publicBlogListQuerySchema.parse(rawQuery);
      const include = includeBlog();
      const where: Record<string | symbol, unknown> = { status: 'published' };
      if (query.search) {
        const like = `%${query.search.replace(/[%_\\]/g, '\\$&')}%`;
        where[Op.or] = [
          { slug: { [Op.like]: like } },
          { '$currentPublishedVersion.title$': { [Op.like]: like } },
          { '$currentPublishedVersion.excerpt$': { [Op.like]: like } }
        ];
      }
      const sortCol = query.sort_by === 'title'
        ? [[{ model: BlogVersion, as: 'currentPublishedVersion' }, 'title', query.sort_order.toUpperCase()]]
        : [[query.sort_by === 'published_at' ? 'publishedAt' : 'createdAt', query.sort_order.toUpperCase()]];

      const result = await Blog.findAndCountAll({
        where,
        include,
        subQuery: false,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        order: sortCol as any,
        distinct: true
      });

      const mediaMap = await buildMediaMapForBlogs(result.rows);

      return {
        items: result.rows.map((blog) => serializePublicBlog(blog, mediaMap)),
        pagination: pagination(query.page, query.limit, Array.isArray(result.count) ? result.count.length : result.count)
      };
    }
  };
}
export type BlogService = ReturnType<typeof createBlogService>;
