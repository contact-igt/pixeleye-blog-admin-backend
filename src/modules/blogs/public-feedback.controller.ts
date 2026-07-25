import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { sendSuccess } from '../../utils/api-response.js';
import { submitFeedback, getFeedbackSummaryForPublishedVersion, hashVisitorKey, hashUserAgent } from './feedback.service.js';
import { z } from 'zod';

const feedbackPayloadSchema = z.object({
  response: z.enum(['yes', 'no'], { message: 'Response must be "yes" or "no"' })
}).strict();

function getOrCreateVisitorKey(request: Request): string {
  const cookieName = 'feedback_visitor_id';
  let visitorId = request.cookies?.[cookieName];

  if (!visitorId) {
    visitorId = randomBytes(32).toString('hex');
  }

  return visitorId;
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
        response.cookie('feedback_visitor_id', visitorKey, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
          path: '/'
        });

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
