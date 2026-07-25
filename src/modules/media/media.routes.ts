import { Router } from 'express';
import { MulterError } from 'multer';
import { ApiError } from '../../utils/api-error.js';
import { authenticateAdmin, requireRole } from '../../middlewares/auth/authenticate-admin.js';
import { createMediaController } from './media.controller.js';
import { mediaUploadLimitsBytes, uploadMediaFileMiddleware } from './media.validation.js';

export function createMediaRouter(): Router {
  const router = Router();
  const controller = createMediaController();

  router.get('/assets', authenticateAdmin, controller.list);
  router.get('/assets/trash', authenticateAdmin, controller.trashList);
  router.get('/assets/:id', authenticateAdmin, controller.detail);

  router.post('/assets', authenticateAdmin, requireRole('super_admin', 'editor', 'author'), (request, response, next) => {
    uploadMediaFileMiddleware(request, response, (error: unknown) => {
      if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new ApiError(413, `Image is too large. Maximum upload size is ${mediaUploadLimitsBytes.hero} bytes`));
        return;
      }
      if (error) {
        next(error);
        return;
      }
      void controller.upload(request, response, next);
    });
  });
  router.patch('/assets/:id', authenticateAdmin, requireRole('super_admin', 'editor', 'author'), controller.update);
  router.post('/assets/:id/restore', authenticateAdmin, requireRole('super_admin', 'editor', 'author'), controller.restore);
  router.delete('/assets/:id/permanent', authenticateAdmin, requireRole('super_admin', 'editor'), controller.permanentDelete);
  router.delete('/assets/:id', authenticateAdmin, requireRole('super_admin', 'editor', 'author'), controller.softDelete);

  return router;
}



