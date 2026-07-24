import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { env } from '../../../config/environment.js';
import { ApiError } from '../../../utils/api-error.js';
import { AdminSession, AdminUser, type AdminUserRole } from '../../auth/index.js';
import { hashPassword, verifyPassword } from '../../../services/security/password.service.js';
import { signAccessToken } from '../../../services/security/jwt.service.js';
import { generateRefreshToken, getRefreshTokenExpiry, hashRefreshToken } from '../../../services/security/refresh-token.service.js';
import { hashRequestValue, writeAuthAuditLog, type AuditContext } from './auth-audit.service.js';
import { enforceMaxActiveSessionFamilies, revokeSessionFamily } from './auth-session-lifecycle.service.js';
import type { ChangePasswordInput, LoginInput, RefreshInput } from './auth.validation.js';

export interface AuthRequestContext {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  sessionId: string;
}

interface TokenPairInput {
  adminUser: AdminUser;
  session: AdminSession;
  refreshToken: string;
}

function toSafeAdmin(adminUser: AdminUser, sessionId: string): AuthenticatedAdmin {
  return {
    id: String(adminUser.id),
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
    sessionId
  };
}

function buildTokenResponse(input: TokenPairInput) {
  const admin = toSafeAdmin(input.adminUser, String(input.session.id));
  return {
    admin,
    access_token: signAccessToken({
      sub: admin.id,
      role: admin.role,
      session_id: admin.sessionId,
      token_type: 'access'
    }),
    refresh_token: input.refreshToken,
    token_type: 'Bearer' as const
  };
}

function withoutRefreshToken(tokenResponse: ReturnType<typeof buildTokenResponse>) {
  return {
    admin: tokenResponse.admin,
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type
  };
}

function isLocked(adminUser: AdminUser, now = new Date()): boolean {
  return Boolean(adminUser.lockedUntil && adminUser.lockedUntil > now);
}

async function audit(action: AuditContext['action'], context: AuthRequestContext, adminUserId?: string | null, metadata?: Record<string, unknown>) {
  await writeAuthAuditLog({
    action,
    adminUserId: adminUserId ?? null,
    requestId: context.requestId,
    ip: context.ip,
    userAgent: context.userAgent,
    metadata
  });
}

export function createAuthService() {
  return {
    async login(input: LoginInput, context: AuthRequestContext = {}) {
      const adminUser = await AdminUser.findOne({ where: { email: input.email } });
      if (!adminUser) {
        await audit('AUTH_LOGIN_FAILED', context, null, { reason: 'unknown_email' });
        throw new ApiError(401, 'Invalid email or password');
      }

      if (adminUser.status === 'inactive') {
        await audit('AUTH_LOGIN_FAILED', context, String(adminUser.id), { reason: 'inactive' });
        throw new ApiError(403, 'Admin account is inactive');
      }
      if (adminUser.status === 'blocked') {
        await audit('AUTH_LOGIN_FAILED', context, String(adminUser.id), { reason: 'blocked' });
        throw new ApiError(403, 'Admin account is blocked');
      }
      if (isLocked(adminUser)) {
        await audit('AUTH_LOGIN_FAILED', context, String(adminUser.id), { reason: 'locked' });
        throw new ApiError(423, 'Admin account is temporarily locked');
      }

      const validPassword = await verifyPassword(input.password, adminUser.passwordHash);
      if (!validPassword) {
        const failedAttempts = adminUser.failedLoginAttempts + 1;
        const lockedUntil = failedAttempts >= env.AUTH_MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + env.AUTH_LOCK_MINUTES * 60 * 1000)
          : null;
        await adminUser.update({ failedLoginAttempts: failedAttempts, lockedUntil });
        await audit('AUTH_LOGIN_FAILED', context, String(adminUser.id), { reason: 'invalid_password' });
        if (lockedUntil) await audit('AUTH_ACCOUNT_LOCKED', context, String(adminUser.id));
        throw new ApiError(401, 'Invalid email or password');
      }

      const refreshToken = generateRefreshToken();
      const sessionFamilyId = randomUUID();
      const session = await AdminSession.create({
        adminUserId: adminUser.id,
        sessionFamilyId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry(env.REFRESH_TOKEN_EXPIRES_IN_DAYS),
        revokedAt: null,
        replacedBySessionId: null,
        parentSessionId: null,
        ipHash: hashRequestValue(context.ip),
        userAgent: context.userAgent?.slice(0, 500) ?? null,
        lastUsedAt: new Date()
      });
      await adminUser.update({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
      const revokedSessionCount = await enforceMaxActiveSessionFamilies(String(adminUser.id), session);
      await audit('AUTH_LOGIN_SUCCESS', context, String(adminUser.id), { session_id: String(session.id), session_family_id: sessionFamilyId, revoked_session_count: revokedSessionCount });
      return buildTokenResponse({ adminUser, session, refreshToken });
    },

    async refresh(input: RefreshInput, context: AuthRequestContext = {}) {
      if (!input.refresh_token) throw new ApiError(401, 'Refresh token is required');
      const tokenHash = hashRefreshToken(input.refresh_token);
      const session = await AdminSession.findOne({ where: { refreshTokenHash: tokenHash }, include: [{ model: AdminUser, as: 'adminUser' }] });
      if (!session) {
        await audit('AUTH_REFRESH_REJECTED', context, null, { reason: 'missing_session' });
        throw new ApiError(401, 'Refresh token is invalid');
      }
      if (session.revokedAt) {
        await revokeSessionFamily(session);
        await audit('AUTH_REFRESH_REJECTED', context, String(session.adminUserId), {
          reason: 'revoked_session',
          suspected_reuse: true
        });
        throw new ApiError(401, 'Refresh token has been revoked');
      }
      if (session.expiresAt <= new Date()) {
        await session.update({ revokedAt: new Date() });
        await audit('AUTH_REFRESH_REJECTED', context, String(session.adminUserId), { reason: 'expired_session' });
        throw new ApiError(401, 'Refresh token has expired');
      }
      if (!session.adminUser || session.adminUser.status !== 'active') {
        await audit('AUTH_REFRESH_REJECTED', context, String(session.adminUserId), { reason: 'inactive_admin' });
        throw new ApiError(403, 'Admin account is not active');
      }

      const refreshToken = generateRefreshToken();
      const sessionFamilyId = session.sessionFamilyId ?? randomUUID();
      const replacement = await AdminSession.create({
        adminUserId: session.adminUserId,
        sessionFamilyId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry(env.REFRESH_TOKEN_EXPIRES_IN_DAYS),
        revokedAt: null,
        replacedBySessionId: null,
        parentSessionId: session.id,
        ipHash: hashRequestValue(context.ip) ?? session.ipHash,
        userAgent: context.userAgent?.slice(0, 500) ?? session.userAgent,
        lastUsedAt: new Date()
      });
      await session.update({ revokedAt: new Date(), replacedBySessionId: replacement.id, lastUsedAt: new Date() });
      await audit('AUTH_REFRESH_SUCCESS', context, String(session.adminUserId), { session_id: String(replacement.id), session_family_id: sessionFamilyId, parent_session_id: String(session.id) });
      return buildTokenResponse({ adminUser: session.adminUser, session: replacement, refreshToken });
    },

    async logout(sessionId: string, context: AuthRequestContext = {}) {
      const session = await AdminSession.findByPk(sessionId);
      if (session && !session.revokedAt) await revokeSessionFamily(session);
      await audit('AUTH_LOGOUT', context, session?.adminUserId ? String(session.adminUserId) : null, { session_id: sessionId });
      return { logged_out: true as const };
    },


    async logoutByRefreshToken(refreshToken: string | undefined, context: AuthRequestContext = {}) {
      if (!refreshToken) return { logged_out: true as const };
      const tokenHash = hashRefreshToken(refreshToken);
      const session = await AdminSession.findOne({ where: { refreshTokenHash: tokenHash } });
      if (session && !session.revokedAt) await revokeSessionFamily(session);
      await audit('AUTH_LOGOUT', context, session?.adminUserId ? String(session.adminUserId) : null, {
        session_id: session?.id ? String(session.id) : null,
        source: 'refresh_cookie'
      });
      return { logged_out: true as const };
    },
    async getCurrentAdmin(admin: AuthenticatedAdmin) {
      const adminUser = await AdminUser.findByPk(admin.id);
      if (!adminUser || adminUser.status !== 'active') throw new ApiError(401, 'Authentication is required');
      return {
        admin: {
          id: String(adminUser.id),
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          status: adminUser.status,
          last_login_at: adminUser.lastLoginAt,
          created_at: adminUser.createdAt
        }
      };
    },

    async changePassword(admin: AuthenticatedAdmin, input: ChangePasswordInput, context: AuthRequestContext = {}) {
      const adminUser = await AdminUser.findByPk(admin.id);
      if (!adminUser || adminUser.status !== 'active') throw new ApiError(401, 'Authentication is required');
      const validPassword = await verifyPassword(input.current_password, adminUser.passwordHash);
      if (!validPassword) throw new ApiError(401, 'Current password is invalid');

      await adminUser.update({ passwordHash: await hashPassword(input.new_password), passwordChangedAt: new Date() });
      await AdminSession.update({ revokedAt: new Date() }, { where: { adminUserId: admin.id, revokedAt: { [Op.is]: null } } });
      await audit('AUTH_PASSWORD_CHANGED', context, admin.id);
      return { password_changed: true as const };
    }
  };
}

export { withoutRefreshToken };
export type AuthService = ReturnType<typeof createAuthService>;







