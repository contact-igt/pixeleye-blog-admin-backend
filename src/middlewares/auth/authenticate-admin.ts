import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../utils/api-error.js';
import { AdminSession, AdminUser, type AdminUserRole } from '../../modules/auth/index.js';
import { verifyAccessToken } from '../../services/security/jwt.service.js';

function readBearerToken(request: Request): string {
  const authorization = request.header('authorization');
  if (!authorization) throw new ApiError(401, 'Authentication is required');
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) throw new ApiError(401, 'Authentication is required');
  return token;
}

export async function authenticateAdmin(request: Request, _response: Response, next: NextFunction): Promise<void> {
  try {
    const claims = verifyAccessToken(readBearerToken(request));
    const [adminUser, session] = await Promise.all([
      AdminUser.findByPk(claims.sub),
      AdminSession.findByPk(claims.session_id)
    ]);

    if (!adminUser || !session || String(session.adminUserId) !== String(adminUser.id) || session.revokedAt) {
      throw new ApiError(401, 'Authentication is required');
    }
    if (session.expiresAt <= new Date()) throw new ApiError(401, 'Authentication is required');
    if (adminUser.status !== 'active') throw new ApiError(403, 'Admin account is not active');

    request.authenticatedAdmin = {
      id: String(adminUser.id),
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      sessionId: String(session.id)
    };
    next();
  } catch (error) {
    next(error);
  }
}


export async function optionalAuthenticateAdmin(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (!request.header('authorization')) {
    next();
    return;
  }
  await authenticateAdmin(request, response, next);
}
export function requireActiveAdmin(request: Request, _response: Response, next: NextFunction): void {
  if (!request.authenticatedAdmin) {
    next(new ApiError(401, 'Authentication is required'));
    return;
  }
  next();
}

export function requireRole(...allowedRoles: AdminUserRole[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const admin = request.authenticatedAdmin;
    if (!admin) {
      next(new ApiError(401, 'Authentication is required'));
      return;
    }
    if (admin.role === 'super_admin' || allowedRoles.includes(admin.role)) {
      next();
      return;
    }
    next(new ApiError(403, 'Insufficient permissions'));
  };
}

