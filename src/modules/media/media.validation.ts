import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/environment.js';
import { ApiError } from '../../utils/api-error.js';
import type { MediaPurpose } from './media.model.js';

export const mediaPurposes = ['avatar', 'thumbnail', 'card', 'content', 'hero'] as const;
export const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const mediaUploadLimitsBytes: Record<MediaPurpose, number> = {
  avatar: 2 * 1024 * 1024,
  thumbnail: 2 * 1024 * 1024,
  card: 3 * 1024 * 1024,
  content: 5 * 1024 * 1024,
  hero: 5 * 1024 * 1024
};

export const mediaUploadBodySchema = z.object({
  purpose: z.enum(mediaPurposes),
  client_id: z.string().regex(/^\d+$/).optional(),
  alt_text: z.string().trim().max(255).optional()
});

export type MediaUploadBody = z.infer<typeof mediaUploadBodySchema>;

export const mediaAssetStatuses = ['active', 'trashed', 'deleting', 'delete_failed', 'deleted'] as const;
export const mediaProviders = ['cloudflare_r2', 'cloudflare_images'] as const;
export const mediaSortFields = ['created_at', 'updated_at', 'original_file_name', 'purpose', 'status', 'file_size'] as const;
export const mediaTrashSortFields = ['trashed_at', 'purge_after', 'original_file_name', 'purpose', 'status', 'file_size'] as const;
export const mediaSortOrders = ['asc', 'desc'] as const;

const optionalNumericString = z.string().trim().regex(/^\d+$/).optional();

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(24).transform((value) => Math.min(value, 100)),
  search: z.string().trim().max(120).optional().transform((value) => value || undefined),
  purpose: z.enum(mediaPurposes).optional(),
  status: z.enum(mediaAssetStatuses).optional(),
  storage_provider: z.enum(mediaProviders).optional(),
  uploaded_by: optionalNumericString,
  sort_by: z.enum(mediaSortFields).default('created_at'),
  sort_order: z.enum(mediaSortOrders).default('desc')
});

export type MediaListQueryInput = z.infer<typeof mediaListQuerySchema>;

export const mediaTrashListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).default(24).transform((value) => Math.min(value, 100)),
  search: z.string().trim().max(120).optional().transform((value) => value || undefined),
  purpose: z.enum(mediaPurposes).optional(),
  uploaded_by: optionalNumericString,
  trashed_by: optionalNumericString,
  sort_by: z.enum(mediaTrashSortFields).default('trashed_at'),
  sort_order: z.enum(mediaSortOrders).default('desc')
});

export type MediaTrashListQueryInput = z.infer<typeof mediaTrashListQuerySchema>;

export const uploadMediaFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.floor(env.R2_MAX_FILE_SIZE_MB * 1024 * 1024), files: 1 },
  fileFilter(_request, file, callback) {
    if (!isAllowedMimeType(file.mimetype)) {
      callback(new ApiError(415, 'Unsupported image MIME type'));
      return;
    }
    callback(null, true);
  }
}).single('file');

export function validateMediaFile(file: Express.Multer.File | undefined, purpose: MediaPurpose): Express.Multer.File {
  if (!file) throw new ApiError(400, 'Image file is required');
  if (!isAllowedMimeType(file.mimetype)) {
    throw new ApiError(415, 'Unsupported image MIME type');
  }
  if (file.size > mediaUploadLimitsBytes[purpose]) {
    throw new ApiError(413, `Image is too large for ${purpose} uploads`);
  }
  if (file.size > env.R2_MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new ApiError(413, 'Image exceeds the configured R2 upload size limit');
  }
  if (!hasValidMagicBytes(file.buffer, file.mimetype)) {
    throw new ApiError(415, 'Image file signature does not match an allowed image type');
  }
  return file;
}

export function isAllowedMimeType(mimeType: string): boolean {
  const configuredTypes = env.R2_ALLOWED_IMAGE_TYPES.split(',').map((type) => type.trim()).filter(Boolean);
  return allowedImageMimeTypes.includes(mimeType as (typeof allowedImageMimeTypes)[number]) && configuredTypes.includes(mimeType);
}

export function hasValidMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buffer.length >= pngSignature.length && pngSignature.every((byte, index) => buffer[index] === byte);
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'image/avif') {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp' && buffer.subarray(8, 12).toString('ascii').includes('avif');
  }
  return false;
}

export function sanitizeOriginalFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).pop()?.trim() || 'upload';
  const sanitized = basename.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\s+/g, ' ').slice(0, 255);
  return sanitized || 'upload';
}




