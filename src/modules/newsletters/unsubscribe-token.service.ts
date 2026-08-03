import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/environment.js';
import { ApiError } from '../../utils/api-error.js';

const TOKEN_VERSION = 'v1';

function sign(input: string): string {
  return createHmac('sha256', env.NEWSLETTER_HASH_SECRET).update(input).digest('base64url');
}

/**
 * A stateless, self-verifying unsubscribe token: HMAC-signed over the subscriber ID using
 * the server-side NEWSLETTER_HASH_SECRET. Deterministic so it can be regenerated at
 * email-render time (worker, admin resend, campaign send) without ever needing to persist
 * or recover a raw random secret.
 */
export function createUnsubscribeToken(subscriberId: string | number): string {
  const payload = `${TOKEN_VERSION}.${subscriberId}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string): { subscriberId: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(404, 'Unsubscribe link is invalid');
  const [version, subscriberId, signature] = parts as [string, string, string];
  if (version !== TOKEN_VERSION || !subscriberId || !signature) throw new ApiError(404, 'Unsubscribe link is invalid');

  const expected = Buffer.from(sign(`${version}.${subscriberId}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError(404, 'Unsubscribe link is invalid');
  }

  return { subscriberId };
}
