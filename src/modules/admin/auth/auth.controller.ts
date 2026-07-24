import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../../utils/api-response.js';
import { ApiError } from '../../../utils/api-error.js';
import { createAuthService, type AuthService, type AuthRequestContext, withoutRefreshToken } from './auth.service.js';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.validation.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './auth-cookie.service.js';

function getContext(request: Request): AuthRequestContext {
  return {
    requestId: request.requestId,
    ip: request.ip,
    userAgent: request.header('user-agent') ?? undefined
  };
}

export function createAuthController(service: AuthService = createAuthService()) {
  return {
    async login(request: Request, response: Response, next: NextFunction) {
      try {
        const result = await service.login(loginSchema.parse(request.body), getContext(request));
        setRefreshCookie(response, request, result.refresh_token);
        return sendSuccess(response, 'Admin logged in', withoutRefreshToken(result), 200);
      } catch (error) {
        next(error);
      }
    },

    async refresh(request: Request, response: Response, next: NextFunction) {
      try {
        const body = refreshSchema.parse(request.body ?? {});
        const result = await service.refresh(
          { refresh_token: body.refresh_token ?? readRefreshCookie(request) },
          getContext(request)
        );
        setRefreshCookie(response, request, result.refresh_token);
        return sendSuccess(response, 'Admin session refreshed', withoutRefreshToken(result), 200);
      } catch (error) {
        next(error);
      }
    },

    async logout(request: Request, response: Response, next: NextFunction) {
      try {
        const result = request.authenticatedAdmin
          ? await service.logout(request.authenticatedAdmin.sessionId, getContext(request))
          : await service.logoutByRefreshToken(readRefreshCookie(request), getContext(request));
        clearRefreshCookie(response, request);
        return sendSuccess(response, 'Admin logged out', result, 200);
      } catch (error) {
        clearRefreshCookie(response, request);
        next(error);
      }
    },

    async me(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        return sendSuccess(response, 'Authenticated admin profile', await service.getCurrentAdmin(request.authenticatedAdmin));
      } catch (error) {
        next(error);
      }
    },

    async changePassword(request: Request, response: Response, next: NextFunction) {
      try {
        if (!request.authenticatedAdmin) throw new ApiError(401, 'Authentication is required');
        const result = await service.changePassword(
          request.authenticatedAdmin,
          changePasswordSchema.parse(request.body),
          getContext(request)
        );
        return sendSuccess(response, 'Password changed', result, 200);
      } catch (error) {
        next(error);
      }
    }
  };
}
