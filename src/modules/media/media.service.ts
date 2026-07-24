import { randomUUID } from 'node:crypto';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { logger } from '../../config/logger.js';
import { initializeMediaAssociations } from '../../database/associations/index.js';
import { ApiError } from '../../utils/api-error.js';
import {
  buildR2PublicUrl,
  deleteR2Objects,
  generateR2ObjectKey,
  getR2Configuration,
  uploadR2Object,
  verifyR2ObjectsExist,
  type R2ObjectUploadResult,
  type R2VariantName
} from '../../services/integrations/cloudflare.service.js';
import { AdminUser } from '../auth/index.js';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';
import { MediaAsset, type MediaPurpose, type MediaVariantRecord } from './media.model.js';
import { processMediaImage, type ProcessedImageVariant } from './media-image.service.js';
import {
  mediaListQuerySchema,
  mediaTrashListQuerySchema,
  sanitizeOriginalFilename,
  validateMediaFile,
  type MediaListQueryInput,
  type MediaTrashListQueryInput,
  type MediaUploadBody
} from './media.validation.js';

interface UploadMediaAssetInput {
  file: Express.Multer.File | undefined;
  body: MediaUploadBody & { uploaded_by?: string };
}

export interface MediaActor {
  id: string;
  role: 'super_admin' | 'editor' | 'author' | 'viewer';
}

interface MediaAssetRepository {
  create(values: Record<string, unknown>): Promise<any>;
  findByPk(id: string, options?: Record<string, unknown>): Promise<any | null>;
  findAndCountAll?(options: Record<string, unknown>): Promise<{ rows: any[]; count: number | unknown[] }>;
  findAll?(options: Record<string, unknown>): Promise<any[]>;
}

interface PurgeOptions {
  now?: Date;
  batchSize?: number;
}

interface MediaServiceDependencies {
  repository?: MediaAssetRepository;
  uploadObject?: typeof uploadR2Object;
  deleteObjects?: typeof deleteR2Objects;
  verifyObjects?: typeof verifyR2ObjectsExist;
  imageProcessor?: typeof processMediaImage;
  auditWriter?: typeof writeAuthAuditLog;
  referenceChecker?: (id: string) => Promise<boolean>;
}

const storageProvider = 'cloudflare_r2';
const outputMimeType = 'image/webp';
const trashStatuses = ['trashed', 'delete_failed'] as const;
const mediaSortColumns = {
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  original_file_name: 'originalFileName',
  purpose: 'purpose',
  status: 'status',
  file_size: 'fileSize'
} as const;
const mediaTrashSortColumns = {
  trashed_at: 'trashedAt',
  purge_after: 'purgeAfter',
  original_file_name: 'originalFileName',
  purpose: 'purpose',
  status: 'status',
  file_size: 'fileSize'
} as const;

function toPlainAsset(asset: any): Record<string, any> {
  return typeof asset.get === 'function' ? asset.get({ plain: true }) : asset;
}

function normalizeVariants(value: unknown): Record<string, MediaVariantRecord> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, MediaVariantRecord>;
}

function publicVariantsFromRecord(variants: Record<string, MediaVariantRecord>) {
  return Object.fromEntries(
    Object.entries(variants).map(([name, variant]) => [
      name,
      {
        url: variant.url,
        width: variant.width,
        height: variant.height,
        size_bytes: variant.size_bytes,
        mime_type: variant.mime_type
      }
    ])
  );
}

function safeAdminSummary(plain: Record<string, any>, camelAlias: string, snakeAlias: string, rawField: string) {
  const admin = plain[camelAlias] ?? plain[snakeAlias];
  if (admin) {
    return {
      id: String(admin.id),
      name: admin.name,
      email: admin.email,
      role: admin.role
    };
  }
  const rawId = plain[rawField];
  return rawId ? { id: String(rawId) } : null;
}

function safeUploaderSummary(plain: Record<string, any>) {
  return safeAdminSummary(plain, 'uploadedByAdmin', 'uploaded_by_admin', 'uploadedBy') ?? (plain.uploaded_by ? { id: String(plain.uploaded_by) } : null);
}

function safeDeleteFailureReason(value: unknown): string | null {
  if (!value) return null;
  return String(value).replace(/[\r\n\t]+/g, ' ').slice(0, 500);
}

function dateValue(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysRemaining(purgeAfter: unknown): number | null {
  const date = dateValue(purgeAfter);
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

export function serializeMediaAsset(asset: any) {
  const plain = toPlainAsset(asset);
  const variants = normalizeVariants(plain.variantsJson ?? plain.variants_json);
  const fileSize = plain.fileSize ?? plain.file_size ?? plain.sizeBytes ?? plain.size_bytes;
  const purgeAfter = plain.purgeAfter ?? plain.purge_after ?? null;
  return {
    id: String(plain.id),
    purpose: plain.purpose,
    alt_text: plain.altText ?? plain.alt_text ?? null,
    original_file_name: plain.originalFileName ?? plain.original_file_name ?? plain.originalFilename,
    storage_provider: plain.storageProvider ?? plain.storage_provider ?? plain.provider,
    original_url: plain.originalUrl ?? plain.original_url ?? null,
    variants: publicVariantsFromRecord(variants),
    width: plain.width,
    height: plain.height,
    file_size: fileSize,
    size_bytes: plain.sizeBytes ?? plain.size_bytes ?? fileSize,
    mime_type: plain.mimeType ?? plain.mime_type,
    output_mime_type: plain.outputMimeType ?? plain.output_mime_type ?? outputMimeType,
    status: plain.status,
    uploaded_by: safeUploaderSummary(plain),
    trashed_by: safeAdminSummary(plain, 'trashedByAdmin', 'trashed_by_admin', 'trashedBy'),
    trashed_at: plain.trashedAt ?? plain.trashed_at ?? null,
    purge_after: purgeAfter,
    days_remaining: daysRemaining(purgeAfter),
    restored_at: plain.restoredAt ?? plain.restored_at ?? null,
    restored_by: safeAdminSummary(plain, 'restoredByAdmin', 'restored_by_admin', 'restoredBy'),
    deleted_at: plain.deletedAt ?? plain.deleted_at ?? null,
    deleted_by: safeAdminSummary(plain, 'deletedByAdmin', 'deleted_by_admin', 'deletedBy'),
    delete_failure: safeDeleteFailureReason(plain.deleteFailureReason ?? plain.delete_failure_reason),
    created_at: plain.createdAt ?? plain.created_at,
    updated_at: plain.updatedAt ?? plain.updated_at
  };
}

function buildSafeMetadata(file: Express.Multer.File, purpose: MediaPurpose, mediaObjectId: string): Record<string, unknown> {
  return {
    media_object_id: mediaObjectId,
    purpose,
    source_mime_type: file.mimetype,
    source_size_bytes: file.size,
    original_filename: sanitizeOriginalFilename(file.originalname)
  };
}

function createVariantRecord(upload: R2ObjectUploadResult, variant: ProcessedImageVariant): MediaVariantRecord {
  return {
    key: upload.key,
    url: upload.url,
    width: variant.width,
    height: variant.height,
    size_bytes: variant.sizeBytes,
    mime_type: variant.mimeType
  };
}

function collectR2Keys(asset: any): string[] {
  const plain = toPlainAsset(asset);
  const variants = normalizeVariants(plain.variantsJson ?? plain.variants_json);
  const keys = Object.values(variants).map((variant) => variant.key).filter(Boolean);
  const originalKey = plain.originalObjectKey ?? plain.original_object_key;
  if (originalKey) keys.push(originalKey);
  return [...new Set(keys)];
}

function normalizeCount(count: number | unknown[]): number {
  return Array.isArray(count) ? count.length : count;
}

function buildSearchWhere(where: Record<string, unknown>, search?: string) {
  if (!search) return;
  const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
  where[Op.or as unknown as string] = [
    { originalFileName: { [Op.like]: like } },
    { originalFilename: { [Op.like]: like } },
    { altText: { [Op.like]: like } },
    { purpose: { [Op.like]: like } }
  ];
}

function buildListWhere(query: MediaListQueryInput) {
  const where: Record<string, unknown> = { status: 'active' };
  if (query.purpose) where.purpose = query.purpose;
  if (query.storage_provider) where.storageProvider = query.storage_provider;
  if (query.uploaded_by) where.uploadedBy = query.uploaded_by;
  buildSearchWhere(where, query.search);
  return where;
}

function buildTrashWhere(query: MediaTrashListQueryInput) {
  const where: Record<string, unknown> = { status: { [Op.in]: [...trashStatuses] } };
  if (query.purpose) where.purpose = query.purpose;
  if (query.uploaded_by) where.uploadedBy = query.uploaded_by;
  if (query.trashed_by) where.trashedBy = query.trashed_by;
  buildSearchWhere(where, query.search);
  return where;
}

function applyMediaAssociations(): void {
  initializeMediaAssociations();
}

function includeAdmins() {
  applyMediaAssociations();
  const attributes = ['id', 'name', 'email', 'role'];
  return [
    { model: AdminUser, as: 'uploadedByAdmin', attributes, required: false },
    { model: AdminUser, as: 'trashedByAdmin', attributes, required: false },
    { model: AdminUser, as: 'restoredByAdmin', attributes, required: false },
    { model: AdminUser, as: 'deletedByAdmin', attributes, required: false }
  ];
}

function assertCanTrashOrRestore(actor: MediaActor, asset: any): void {
  if (actor.role === 'super_admin' || actor.role === 'editor') return;
  if (actor.role === 'author') {
    const plain = toPlainAsset(asset);
    if (String(plain.uploadedBy ?? plain.uploaded_by ?? '') === String(actor.id)) return;
  }
  throw new ApiError(403, 'Insufficient permissions');
}

function assertCanPermanentDelete(actor: MediaActor): void {
  if (actor.role === 'super_admin' || actor.role === 'editor') return;
  throw new ApiError(403, 'Insufficient permissions');
}

function purgeDate(now = new Date()): Date {
  return new Date(now.getTime() + env.MEDIA_TRASH_RETENTION_DAYS * 86_400_000);
}

function pagination(page: number, limit: number, totalItems: number) {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    page,
    limit,
    total_items: totalItems,
    total_pages: totalPages,
    has_next_page: page < totalPages,
    has_previous_page: page > 1
  };
}

async function isMediaReferencedByCurrentBlogVersion(mediaId: string): Promise<boolean> {
  const rows = await sequelize.query<{ referenced: number }>(
    `SELECT 1 AS referenced FROM blogs
      INNER JOIN blog_versions ON blog_versions.id IN (blogs.current_draft_version_id, blogs.current_published_version_id)
      WHERE blogs.status <> 'trashed' AND (
        blog_versions.featured_media_id = :mediaId OR
        JSON_SEARCH(blog_versions.blocks_json, 'one', :mediaId, NULL,
          '$.blocks.image_comparison.items[*].media_id', '$.blocks.expert_quote.media_id') IS NOT NULL
      ) LIMIT 1`,
    { replacements: { mediaId }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

export function createMediaService(dependencies: MediaServiceDependencies = {}) {
  const repository: MediaAssetRepository = dependencies.repository ?? {
    create: MediaAsset.create.bind(MediaAsset),
    findByPk: MediaAsset.findByPk.bind(MediaAsset),
    findAndCountAll: MediaAsset.findAndCountAll.bind(MediaAsset),
    findAll: MediaAsset.findAll.bind(MediaAsset)
  };
  const uploadObject = dependencies.uploadObject ?? uploadR2Object;
  const deleteObjects = dependencies.deleteObjects ?? deleteR2Objects;
  const verifyObjects = dependencies.verifyObjects ?? verifyR2ObjectsExist;
  const imageProcessor = dependencies.imageProcessor ?? processMediaImage;
  const auditWriter = dependencies.auditWriter ?? writeAuthAuditLog;
  const referenceChecker = dependencies.referenceChecker ?? (dependencies.repository ? async () => false : isMediaReferencedByCurrentBlogVersion);

  return {
    async listMediaAssets(rawQuery: unknown) {
      if (!repository.findAndCountAll) throw new ApiError(500, 'Media listing repository is unavailable');
      const query = mediaListQuerySchema.parse(rawQuery);
      const totalLimit = query.limit;
      const result = await repository.findAndCountAll({
        where: buildListWhere(query),
        include: includeAdmins(),
        limit: totalLimit,
        offset: (query.page - 1) * totalLimit,
        order: [[mediaSortColumns[query.sort_by], query.sort_order.toUpperCase()]],
        distinct: true
      });
      const totalItems = normalizeCount(result.count);
      return {
        items: result.rows.map((asset) => serializeMediaAsset(asset)),
        pagination: pagination(query.page, totalLimit, totalItems)
      };
    },

    async listTrashedMediaAssets(rawQuery: unknown) {
      if (!repository.findAndCountAll) throw new ApiError(500, 'Media trash listing repository is unavailable');
      const query = mediaTrashListQuerySchema.parse(rawQuery);
      const totalLimit = query.limit;
      const result = await repository.findAndCountAll({
        where: buildTrashWhere(query),
        include: includeAdmins(),
        limit: totalLimit,
        offset: (query.page - 1) * totalLimit,
        order: [[mediaTrashSortColumns[query.sort_by], query.sort_order.toUpperCase()]],
        distinct: true,
        paranoid: false
      });
      const totalItems = normalizeCount(result.count);
      return {
        items: result.rows.map((asset) => serializeMediaAsset(asset)),
        pagination: pagination(query.page, totalLimit, totalItems)
      };
    },

    async getMediaAsset(id: string) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Media asset ID is invalid');
      const asset = await repository.findByPk(id, { include: includeAdmins() });
      if (!asset) throw new ApiError(404, 'Media asset was not found');
      const plain = toPlainAsset(asset);
      if ((plain.deletedAt || plain.deleted_at) || plain.status !== 'active') throw new ApiError(404, 'Media asset was not found');
      return serializeMediaAsset(asset);
    },

    async uploadMediaAsset(input: UploadMediaAssetInput) {
      const file = validateMediaFile(input.file, input.body.purpose);
      const originalFileName = sanitizeOriginalFilename(file.originalname);
      const mediaObjectId = randomUUID();
      const uploadedKeys: string[] = [];
      const config = getR2Configuration();

      try {
        const processed = await imageProcessor(file.buffer);
        const uploadedVariants = new Map<R2VariantName, { upload: R2ObjectUploadResult; variant: ProcessedImageVariant }>();

        for (const variant of processed.variants) {
          const key = generateR2ObjectKey(mediaObjectId, variant.name);
          const upload = await uploadObject({
            key,
            body: variant.buffer,
            contentType: outputMimeType,
            metadata: {
              purpose: input.body.purpose,
              variant: variant.name,
              media_object_id: mediaObjectId
            }
          });
          uploadedKeys.push(key);
          uploadedVariants.set(variant.name, { upload, variant });
        }

        const originalUpload = uploadedVariants.get('original');
        if (!originalUpload) throw new ApiError(500, 'Processed original image variant is missing');

        const variantRecords = Object.fromEntries(
          [...uploadedVariants.entries()]
            .filter(([name]) => name !== 'original')
            .map(([name, value]) => [name, createVariantRecord(value.upload, value.variant)])
        );

        const asset = await repository.create({
          clientId: input.body.client_id ?? null,
          storageProvider,
          bucketName: config.bucketName,
          provider: storageProvider,
          providerAssetId: mediaObjectId,
          originalObjectKey: originalUpload.upload.key,
          variantsJson: variantRecords,
          originalUrl: buildR2PublicUrl(originalUpload.upload.key),
          purpose: input.body.purpose,
          originalFileName,
          originalFilename: originalFileName,
          mimeType: file.mimetype,
          outputMimeType,
          sizeBytes: file.size,
          fileSize: file.size,
          width: originalUpload.variant.width ?? processed.source.width,
          height: originalUpload.variant.height ?? processed.source.height,
          altText: input.body.alt_text ?? null,
          metadata: buildSafeMetadata(file, input.body.purpose, mediaObjectId),
          status: 'active',
          uploadedBy: input.body.uploaded_by ?? null
        });

        return serializeMediaAsset(asset);
      } catch (error) {
        if (uploadedKeys.length > 0) {
          try {
            await deleteObjects(uploadedKeys);
            logger.warn({ media_object_id: mediaObjectId, uploaded_key_count: uploadedKeys.length }, 'Cleaned up R2 objects after media upload failure');
          } catch (cleanupError) {
            logger.error(
              { err: cleanupError, media_object_id: mediaObjectId, uploaded_key_count: uploadedKeys.length },
              'Failed to clean up R2 objects after media upload failure'
            );
          }
        }

        if (error instanceof ApiError) throw error;
        throw new ApiError(500, 'Media asset could not be saved', undefined, error);
      }
    },

    async moveMediaAssetToTrash(id: string, actor: MediaActor) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Media asset ID is invalid');
      const asset = await repository.findByPk(id, { include: includeAdmins(), paranoid: false });
      if (!asset) throw new ApiError(404, 'Media asset was not found');
      assertCanTrashOrRestore(actor, asset);
      const plain = toPlainAsset(asset);
      if ((plain.deletedAt || plain.deleted_at) || plain.status === 'deleted') return { ...serializeMediaAsset(asset), already_deleted: true as const };
      if (plain.status === 'trashed') return { ...serializeMediaAsset(asset), already_trashed: true as const };
      if (plain.status !== 'active') throw new ApiError(409, 'Media asset cannot be moved to trash from its current state');

      const now = new Date();
      const updated = await asset.update({
        status: 'trashed',
        trashedAt: now,
        trashedBy: actor.id,
        purgeAfter: purgeDate(now),
        restoredAt: null,
        restoredBy: null,
        deleteFailureReason: null
      });
      return serializeMediaAsset(updated);
    },

    async softDeleteMediaAsset(id: string, actor?: MediaActor) {
      if (!actor) throw new ApiError(401, 'Authentication is required');
      return this.moveMediaAssetToTrash(id, actor);
    },

    async restoreMediaAsset(id: string, actor: MediaActor) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Media asset ID is invalid');
      const asset = await repository.findByPk(id, { include: includeAdmins(), paranoid: false });
      if (!asset) throw new ApiError(404, 'Media asset was not found');
      assertCanTrashOrRestore(actor, asset);
      const plain = toPlainAsset(asset);
      if (plain.status === 'active' && !(plain.deletedAt || plain.deleted_at)) return { ...serializeMediaAsset(asset), already_active: true as const };
      if ((plain.deletedAt || plain.deleted_at) || plain.status === 'deleted') throw new ApiError(409, 'Deleted media assets cannot be restored');
      if (plain.status !== 'trashed') throw new ApiError(409, 'Only trashed media assets can be restored');

      const keys = collectR2Keys(asset);
      if (keys.length > 0) {
        try {
          await verifyObjects(keys);
        } catch (error) {
          throw new ApiError(409, 'Media asset cannot be restored because storage objects are unavailable', undefined, error);
        }
      }

      const updated = await asset.update({
        status: 'active',
        trashedAt: null,
        trashedBy: null,
        purgeAfter: null,
        restoredAt: new Date(),
        restoredBy: actor.id,
        deleteFailureReason: null
      });
      return serializeMediaAsset(updated);
    },

    async permanentlyDeleteMediaAsset(id: string, actor: MediaActor) {
      if (!/^\d+$/.test(id)) throw new ApiError(400, 'Media asset ID is invalid');
      assertCanPermanentDelete(actor);
      const asset = await repository.findByPk(id, { include: includeAdmins(), paranoid: false });
      if (!asset) throw new ApiError(404, 'Media asset was not found');
      const plain = toPlainAsset(asset);
      if ((plain.deletedAt || plain.deleted_at) || plain.status === 'deleted') return { id, status: 'deleted' as const, already_deleted: true as const };
      if (plain.status === 'deleting') return { id, status: 'deleting' as const, already_deleting: true as const };
      if (!trashStatuses.includes(plain.status)) throw new ApiError(409, 'Only trashed media assets can be permanently deleted');
      if (await referenceChecker(id)) throw new ApiError(409, 'Media asset is in use by an active or published Blog and cannot be permanently deleted');

      const keys = collectR2Keys(asset);
      await asset.update({ status: 'deleting', deleteFailureReason: null });
      try {
        if (keys.length > 0) await deleteObjects(keys);
        const updated = await asset.update({
          status: 'deleted',
          deletedAt: new Date(),
          deletedBy: actor.id,
          deleteFailureReason: null
        });
        return { ...serializeMediaAsset(updated), deleted_object_count: keys.length };
      } catch (error) {
        await asset.update({ status: 'delete_failed', deletedAt: null, deleteFailureReason: 'Cloudflare R2 delete failed' });
        throw new ApiError(502, 'Permanent media deletion failed. You can retry from Trash.', undefined, error);
      }
    },

    async purgeExpiredTrashedMediaAssets(options: PurgeOptions = {}) {
      if (!repository.findAll) throw new ApiError(500, 'Media purge repository is unavailable');
      const now = options.now ?? new Date();
      const limit = Math.min(Math.max(options.batchSize ?? env.MEDIA_TRASH_PURGE_BATCH_SIZE, 1), 500);
      const assets = await repository.findAll({
        where: {
          status: 'trashed',
          purgeAfter: { [Op.lte]: now }
        },
        limit,
        order: [['purgeAfter', 'ASC']],
        paranoid: false
      });

      let purged = 0;
      let failed = 0;
      for (const asset of assets) {
        const id = String(toPlainAsset(asset).id);
        const keys = collectR2Keys(asset);
        await asset.update({ status: 'deleting', deleteFailureReason: null });
        try {
          if (keys.length > 0) await deleteObjects(keys);
          await asset.update({ status: 'deleted', deletedAt: now, deletedBy: null, deleteFailureReason: null });
          purged += 1;
          await auditWriter({ action: 'MEDIA_AUTO_PURGED', adminUserId: null, metadata: { media_asset_id: id, deleted_object_count: keys.length } });
        } catch (error) {
          failed += 1;
          await asset.update({ status: 'delete_failed', deletedAt: null, deleteFailureReason: 'Cloudflare R2 auto purge failed' });
          await auditWriter({ action: 'MEDIA_PERMANENT_DELETE_FAILED', adminUserId: null, metadata: { media_asset_id: id, automatic: true } }).catch(() => undefined);
          logger.warn({ err: error, media_asset_id: id }, 'Media trash auto purge failed');
        }
      }

      return { scanned: assets.length, purged, failed };
    },

    async deleteProviderAsset(objectKey: string) {
      await deleteObjects([objectKey]);
      return { storage_provider: storageProvider, object_key: objectKey, deleted: true as const };
    }
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
