import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { ApiError } from '../../utils/api-error.js';
import { INTERNAL_CUSTOM_TEMPLATE_KEY, storedBlogTemplateKeys } from './blog-template.registry.js';

export const blogStatuses = ['draft', 'published', 'unpublished', 'trashed'] as const;
export const blogSortFields = ['created_at', 'updated_at', 'published_at', 'title', 'status'] as const;
export const blogSortOrders = ['asc', 'desc'] as const;
export const reservedBlogSlugs = ['create', 'edit', 'new', 'trash', 'preview', 'api', 'admin', 'login'] as const;
const optionalTrimmed = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null);
const optionalNumericString = z.string().trim().regex(/^\d+$/).optional();
const contentJsonSchema = z.unknown().optional().nullable();
const editorExtensions = [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }), Link.configure({ protocols: ['http', 'https'], openOnClick: false })];
const allowedNodes = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule', 'hardBreak']);
const allowedMarks = new Set(['bold', 'italic', 'link']);
const baseBlogSchema = z.object({ title: z.string().trim().min(3).max(180), slug: z.string().trim().max(191).optional(), excerpt: optionalTrimmed(500), content_json: contentJsonSchema, content_html: z.unknown().optional().nullable(), featured_media_id: optionalNumericString.nullable(), seo_title: optionalTrimmed(70), seo_description: optionalTrimmed(170), canonical_url: z.string().trim().url().max(2048).optional().nullable().transform((value) => value || null), template_key: z.enum(storedBlogTemplateKeys).optional(), custom_template_id: optionalNumericString.nullable(), blocks_json: z.unknown().optional().nullable() }).strict();
function assertTemplateSelection(value: { template_key?: string; custom_template_id?: string | null }, context: z.RefinementCtx) {
  if (value.template_key === INTERNAL_CUSTOM_TEMPLATE_KEY && !value.custom_template_id) {
    context.addIssue({ code: 'custom', path: ['custom_template_id'], message: 'custom_template_id is required when template_key is custom_template' });
  }
  if (value.template_key && value.template_key !== INTERNAL_CUSTOM_TEMPLATE_KEY && value.custom_template_id) {
    context.addIssue({ code: 'custom', path: ['custom_template_id'], message: 'custom_template_id must not be set for a system template_key' });
  }
  if (value.custom_template_id && value.template_key !== INTERNAL_CUSTOM_TEMPLATE_KEY && value.template_key === undefined) {
    context.addIssue({ code: 'custom', path: ['custom_template_id'], message: 'custom_template_id requires template_key to be set to custom_template' });
  }
}
export const createBlogSchema = baseBlogSchema.superRefine(assertTemplateSelection);
const forbiddenUpdateFields = ['author_id', 'created_by', 'updated_by', 'published_at', 'trashed_at', 'status', 'current_draft_version_id', 'current_published_version_id', 'created_at', 'updated_at'] as const;
export const updateBlogSchema = baseBlogSchema.partial().superRefine((value, context) => {
  for (const field of forbiddenUpdateFields) if (field in value) context.addIssue({ code: 'custom', path: [field], message: `${field} cannot be updated directly` });
  if (Object.keys(value).length === 0) context.addIssue({ code: 'custom', message: 'At least one editable field is required' });
  assertTemplateSelection(value, context);
});
export const blogListQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).default(20).transform((value) => Math.min(value, 100)), search: z.string().trim().max(120).optional().transform((value) => value || undefined), status: z.enum(blogStatuses).optional(), author_id: optionalNumericString, has_featured_image: z.enum(['true', 'false']).optional(), sort_by: z.enum(blogSortFields).default('updated_at'), sort_order: z.enum(blogSortOrders).default('desc') });
export const blogTrashListQuerySchema = blogListQuerySchema.extend({ sort_by: z.enum(['trashed_at', 'updated_at', 'title']).default('trashed_at') }).omit({ status: true, has_featured_image: true });
export const publicBlogListQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).default(20).transform((value) => Math.min(value, 100)), search: z.string().trim().max(120).optional().transform((value) => value || undefined), sort_by: z.enum(['published_at', 'title', 'created_at']).default('published_at'), sort_order: z.enum(['asc', 'desc']).default('desc') });
export type CreateBlogInput = z.infer<typeof createBlogSchema>; export type UpdateBlogInput = z.infer<typeof updateBlogSchema>; export type BlogListQuery = z.infer<typeof blogListQuerySchema>; export type BlogTrashListQuery = z.infer<typeof blogTrashListQuerySchema>; export type PublicBlogListQuery = z.infer<typeof publicBlogListQuerySchema>;
export type TipTapDocument = { type: 'doc'; content?: TipTapNode[] }; type TipTapNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; content?: TipTapNode[] };
function invalid(message: string): never { throw new ApiError(422, message); }
function validHttpUrl(value: unknown): boolean { try { const url = new URL(String(value)); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; } }
/** Handles the case where content_json is stored as a double-encoded JSON string in the DB. */
function parseTipTapValue(value: unknown): unknown { if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } } return value; }
function validateNode(node: unknown, isRoot = false): asserts node is TipTapNode { if (!node || typeof node !== 'object' || Array.isArray(node)) invalid('content_json contains an invalid editor node'); const value = node as TipTapNode; if (typeof value.type !== 'string' || !allowedNodes.has(value.type) || (isRoot && value.type !== 'doc')) invalid(`Unsupported editor node: ${String(value.type)}`); if (!isRoot && value.type === 'doc') invalid('Document nodes cannot be nested'); if (value.type === 'text' && typeof value.text !== 'string') invalid('Text nodes require text'); if (value.type === 'heading' && ![2, 3, 4].includes(Number(value.attrs?.level))) invalid('Headings must use levels 2, 3, or 4'); if (value.type === 'orderedList' && value.attrs) { const keys = Object.keys(value.attrs); if (keys.some((k) => k !== 'start')) invalid(`Unsupported attributes on orderedList`); } else if (value.type === 'listItem' && value.attrs) { const keys = Object.keys(value.attrs); if (keys.some((k) => k !== 'closed')) invalid(`Unsupported attributes on listItem`); } else if (value.type !== 'heading' && value.attrs && Object.keys(value.attrs).length) { invalid(`Unsupported attributes on ${value.type}`); } if (value.marks) { if (!Array.isArray(value.marks)) invalid('Editor marks must be an array'); for (const mark of value.marks) { if (!mark || typeof mark.type !== 'string' || !allowedMarks.has(mark.type)) invalid(`Unsupported editor mark: ${String(mark?.type)}`); if (mark.type === 'link' && !validHttpUrl(mark.attrs?.href)) invalid('Links must use an HTTP or HTTPS URL'); if (mark.type !== 'link' && mark.attrs && Object.keys(mark.attrs).length) invalid(`Unsupported attributes on ${mark.type}`); } } if (value.content !== undefined) { if (!Array.isArray(value.content)) invalid('Editor node content must be an array'); value.content.forEach((child) => validateNode(child)); } }
export function validateBlogEditorJson(value: unknown): TipTapDocument { validateNode(parseTipTapValue(value), true); return parseTipTapValue(value) as TipTapDocument; }
export function isBlogContentEmpty(value: unknown): boolean { try { const parsed = parseTipTapValue(value); const doc = validateBlogEditorJson(parsed); const visit = (node: TipTapNode): boolean => Boolean(node.text?.trim()) || Boolean(node.content?.some(visit)); return !visit(doc); } catch { return true; } }
export function generateBlogHtmlFromJson(value: unknown): string { return generateHTML(validateBlogEditorJson(parseTipTapValue(value)), editorExtensions); }
export function sanitizeGeneratedBlogHtml(value: string): string { return sanitizeHtml(value, { allowedTags: ['p', 'br', 'strong', 'em', 'ol', 'ul', 'li', 'a', 'blockquote', 'h2', 'h3', 'h4', 'hr'], allowedAttributes: { a: ['href', 'target', 'rel'] }, allowedSchemes: ['http', 'https'], transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true) } }); }
export function sanitizeBlogHtml(value?: string | null): string | null { return value ? sanitizeGeneratedBlogHtml(value) : null; }
export function normalizeBlogSlug(input: string): string { const slug = input.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''); if (!slug) throw new ApiError(422, 'Blog slug is required'); if (reservedBlogSlugs.includes(slug as (typeof reservedBlogSlugs)[number])) throw new ApiError(409, 'Blog slug is reserved'); return slug; }
