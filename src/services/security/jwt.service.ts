import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/environment.js';
import { ApiError } from '../../utils/api-error.js';
import type { AdminUserRole } from '../../modules/auth/index.js';

export interface AccessTokenClaims {
  sub: string;
  role: AdminUserRole;
  session_id: string;
  token_type: 'access';
}

interface JwtPayload extends AccessTokenClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function parseDurationSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error('Invalid JWT_ACCESS_EXPIRES_IN');
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400;
  return amount * multiplier;
}

function sign(input: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(input).digest('base64url');
}

export function signAccessToken(claims: AccessTokenClaims, now = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: JwtPayload = {
    ...claims,
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    iat,
    exp: iat + parseDurationSeconds(env.JWT_ACCESS_EXPIRES_IN)
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAccessToken(token: string, now = new Date()): AccessTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new ApiError(401, 'Access token is invalid');
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new ApiError(401, 'Access token is invalid');

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as JwtPayload;
  } catch (error) {
    throw new ApiError(401, 'Access token is invalid', undefined, error);
  }

  if (payload.iss !== env.JWT_ISSUER || payload.aud !== env.JWT_AUDIENCE) throw new ApiError(401, 'Access token is invalid');
  if (payload.token_type !== 'access') throw new ApiError(401, 'Access token is invalid');
  if (!payload.sub || !payload.role || !payload.session_id) throw new ApiError(401, 'Access token is invalid');
  if (payload.exp <= Math.floor(now.getTime() / 1000)) throw new ApiError(401, 'Access token has expired');

  return { sub: String(payload.sub), role: payload.role, session_id: String(payload.session_id), token_type: 'access' };
}
