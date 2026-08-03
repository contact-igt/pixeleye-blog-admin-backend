import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { ApiError } from '../../utils/api-error.js';
import { createMediaService, type MediaService } from './media.service.js';
import { writeAuthAuditLog } from '../admin/auth/auth-audit.service.js';
import { mediaUploadBodySchema, mediaUpdateBodySchema } from './media.validation.js';
import { logger } from '../../config/logger.js';

function disablePrivateResponseCaching(response: Response): void {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function currentActor(request: Request) {
  if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
  return {
    id: request.authenticatedAdmin.id,
    role: request.authenticatedAdmin.role
  };
}

export function createMediaController(
  service: MediaService = createMediaService(),
  auditWriter: typeof writeAuthAuditLog = writeAuthAuditLog
) {
  return {
    async list(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        disablePrivateResponseCaching(response);
        const result = await service.listMediaAssets(request.query);
        return sendSuccess(response, 'Media assets fetched', result);
      } catch (error) {
        next(error);
      }
    },

    async trashList(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        disablePrivateResponseCaching(response);
        const result = await service.listTrashedMediaAssets(request.query);
        return sendSuccess(response, 'Media trash fetched', result);
      } catch (error) {
        next(error);
      }
    },

    async detail(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        disablePrivateResponseCaching(response);
        const asset = await service.getMediaAsset(String(request.params.id ?? ''));
        return sendSuccess(response, 'Media asset fetched', asset);
      } catch (error) {
        next(error);
      }
    },

    async upload(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        disablePrivateResponseCaching(response);
        const body = mediaUploadBodySchema.parse(request.body);
        const asset = await service.uploadMediaAsset({
          file: request.file,
          body: { ...body, uploaded_by: request.authenticatedAdmin.id }
        });
        await auditWriter({
          action: 'MEDIA_ASSET_UPLOADED',
          adminUserId: request.authenticatedAdmin.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: { media_asset_id: asset.id, purpose: asset.purpose }
        }).catch((auditError) => {
          logger.error(
            { err: auditError, request_id: request.requestId, media_asset_id: asset.id },
            'Media upload succeeded but audit logging failed'
          );
        });
        return sendSuccess(response, 'Media asset uploaded successfully.', asset, 201);
      } catch (error) {
        next(error);
      }
    },

    async update(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = currentActor(request);
        const body = mediaUpdateBodySchema.parse(request.body);
        const asset = await service.updateMediaAsset(String(request.params.id ?? ''), body, actor);
        await writeAuthAuditLog({
          action: 'MEDIA_ASSET_UPDATED',
          adminUserId: actor.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: { media_asset_id: asset.id }
        });
        return sendSuccess(response, 'Media asset updated', asset);
      } catch (error) {
        next(error);
      }
    },

    async softDelete(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = currentActor(request);
        const result = await service.moveMediaAssetToTrash(String(request.params.id ?? ''), actor);
        await writeAuthAuditLog({
          action: 'MEDIA_MOVED_TO_TRASH',
          adminUserId: actor.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: {
            media_asset_id: result.id,
            already_trashed: 'already_trashed' in result ? result.already_trashed : false,
            purge_after: result.purge_after
          }
        });
        return sendSuccess(response, 'Media asset moved to trash', result);
      } catch (error) {
        next(error);
      }
    },

    async restore(request: Request, response: Response, next: NextFunction) {
      try {
        const actor = currentActor(request);
        const result = await service.restoreMediaAsset(String(request.params.id ?? ''), actor);
        await writeAuthAuditLog({
          action: 'MEDIA_RESTORED',
          adminUserId: actor.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: { media_asset_id: result.id, already_active: 'already_active' in result ? result.already_active : false }
        });
        return sendSuccess(response, 'Media asset restored', result);
      } catch (error) {
        next(error);
      }
    },

    async permanentDelete(request: Request, response: Response, next: NextFunction) {
      const mediaAssetId = String(request.params.id ?? '');
      try {
        const actor = currentActor(request);
        await writeAuthAuditLog({
          action: 'MEDIA_PERMANENT_DELETE_STARTED',
          adminUserId: actor.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: { media_asset_id: mediaAssetId }
        });
        const result = await service.permanentlyDeleteMediaAsset(mediaAssetId, actor);
        await writeAuthAuditLog({
          action: 'MEDIA_PERMANENTLY_DELETED',
          adminUserId: actor.id,
          requestId: request.requestId,
          ip: request.ip,
          userAgent: request.header('user-agent') ?? undefined,
          metadata: {
            media_asset_id: result.id,
            deleted_object_count: 'deleted_object_count' in result ? result.deleted_object_count : 0,
            already_deleted: 'already_deleted' in result ? result.already_deleted : false
          }
        });
        return sendSuccess(response, 'Media asset permanently deleted', result);
      } catch (error) {
        if (request.authenticatedAdmin) {
          await writeAuthAuditLog({
            action: 'MEDIA_PERMANENT_DELETE_FAILED',
            adminUserId: request.authenticatedAdmin.id,
            requestId: request.requestId,
            ip: request.ip,
            userAgent: request.header('user-agent') ?? undefined,
            metadata: { media_asset_id: mediaAssetId }
          }).catch(() => undefined);
        }
        next(error);
      }
    }
  };
}

