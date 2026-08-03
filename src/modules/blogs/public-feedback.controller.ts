import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { env } from '../../config/environment.js';
import { readCookie } from '../admin/auth/auth-cookie.service.js';
import { sendSuccess } from '../../utils/api-response.js';
import { submitFeedback, getFeedbackSummaryForPublishedVersion, hashVisitorKey, hashUserAgent } from './feedback.service.js';
import { z } from 'zod';

const FEEDBACK_VISITOR_COOKIE = 'feedback_visitor_id';

const feedbackPayloadSchema = z.object({
  response: z.enum(['yes', 'no'], { message: 'Response must be "yes" or "no"' })
}).strict();

function isLocalHostname(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function getRequestHostname(request: Request): string {
  return request.hostname || request.headers.host?.split(':')[0] || '';
}

function getVisitorCookieOptions(request: Request): CookieOptions {
  let sameSite: CookieOptions['sameSite'] = 'lax';
  try {
    const website = new URL(env.PUBLIC_WEBSITE_URL);
    const requestHostname = getRequestHostname(request);
    const isSameSite = website.hostname === requestHostname || isLocalHostname(website.hostname) || isLocalHostname(requestHostname);
    sameSite = isSameSite ? 'lax' : env.NODE_ENV === 'production' ? 'none' : 'lax';
  } catch {
    sameSite = 'lax';
  }

  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    path: '/'
  };
}

function getOrCreateVisitorKey(request: Request): string {
  return readCookie(request, FEEDBACK_VISITOR_COOKIE) || randomBytes(32).toString('hex');
}

function extractUserAgent(request: Request): string | undefined {
  return request.get('user-agent');
}

export function createPublicFeedbackController() {
  return {
    async submit(request: Request, response: Response, next: NextFunction) {
      try {
        const slug = String(request.params.slug ?? '').trim();
        if (!slug) {
          return sendSuccess(response, 'Invalid request', { success: false, error: 'Missing blog slug' }, 400);
        }

        const payload = feedbackPayloadSchema.parse(request.body);
        const visitorKey = getOrCreateVisitorKey(request);
        const userAgent = extractUserAgent(request);

        const visitorKeyHash = hashVisitorKey(visitorKey);
        const userAgentHash = userAgent ? hashUserAgent(userAgent) : undefined;

        const result = await submitFeedback(slug, payload.response, visitorKeyHash, userAgentHash);

        // Set visitor cookie
        response.cookie(FEEDBACK_VISITOR_COOKIE, visitorKey, getVisitorCookieOptions(request));

        return sendSuccess(response, 'Feedback submitted', result.data);
      } catch (error) {
        next(error);
      }
    },

    async getSummary(request: Request, response: Response, next: NextFunction) {
      try {
        const slug = String(request.params.slug ?? '').trim();
        if (!slug) {
          return sendSuccess(response, 'Invalid request', { success: false, error: 'Missing blog slug' }, 400);
        }

        const summary = await getFeedbackSummaryForPublishedVersion(slug);
        return sendSuccess(response, 'Feedback summary retrieved', summary);
      } catch (error) {
        next(error);
      }
    }
  };
}
