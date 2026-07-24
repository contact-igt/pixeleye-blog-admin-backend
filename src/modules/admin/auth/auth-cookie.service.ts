import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../../config/environment.js';

export const refreshCookieName = 'pe_refresh_token';

function isLocalHostname(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function getRequestHostname(request: Request): string {
  return request.hostname || request.headers.host?.split(':')[0] || '';
}

function getSameSite(request: Request): CookieOptions['sameSite'] {
  try {
    const frontend = new URL(env.ADMIN_FRONTEND_URL);
    const requestHostname = getRequestHostname(request);
    if (frontend.hostname === requestHostname || isLocalHostname(frontend.hostname) || isLocalHostname(requestHostname)) return 'lax';
    return env.NODE_ENV === 'production' ? 'none' : 'lax';
  } catch {
    return 'lax';
  }
}

export function getRefreshCookieOptions(request: Request): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: getSameSite(request),
    path: `${env.API_PREFIX}/auth`,
    maxAge: env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000
  };
}

export function setRefreshCookie(response: Response, request: Request, refreshToken: string): void {
  response.cookie(refreshCookieName, refreshToken, getRefreshCookieOptions(request));
}

export function clearRefreshCookie(response: Response, request: Request): void {
  const options = getRefreshCookieOptions(request);
  response.clearCookie(refreshCookieName, { ...options, maxAge: undefined });
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.header('cookie');
  if (!header) return undefined;
  const cookies = header.split(';').map((part) => part.trim());
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator === -1) continue;
    const key = cookie.slice(0, separator);
    const value = cookie.slice(separator + 1);
    if (key === name) return decodeURIComponent(value);
  }
  return undefined;
}

export function readRefreshCookie(request: Request): string | undefined {
  return readCookie(request, refreshCookieName);
}
