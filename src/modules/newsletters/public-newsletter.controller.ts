import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response.js';
import {
  subscribeEmailWithEmailDelivery,
  verifyEmailAddress,
  unsubscribeEmailAddress
} from './newsletter-subscription.service.js';

const subscribePayloadSchema = z.object({
  email: z.string().email('Invalid email format'),
  source: z.string().optional(),
  consent: z.boolean(),
  consent_version: z.string().optional(),
  consent_text: z.string().optional()
}).strict();

const verifyPayloadSchema = z.object({
  token: z.string()
}).strict();

const unsubscribePayloadSchema = z.object({
  token: z.string()
}).strict();

export function createPublicNewsletterController() {
  return {
    async subscribe(request: Request, response: Response, next: NextFunction) {
      try {
        const payload = subscribePayloadSchema.parse(request.body);
        const result = await subscribeEmailWithEmailDelivery({
          email: payload.email,
          source: payload.source || 'website',
          consent: payload.consent,
          consent_version: payload.consent_version,
          consent_text: payload.consent_text
        });

        return sendSuccess(response, result.message, { success: result.success });
      } catch (error) {
        next(error);
      }
    },

    async verify(request: Request, response: Response, next: NextFunction) {
      try {
        const payload = verifyPayloadSchema.parse(request.body);
        const result = await verifyEmailAddress(payload.token);

        return sendSuccess(response, result.message, { success: result.success, email: result.email });
      } catch (error) {
        next(error);
      }
    },

    async unsubscribe(request: Request, response: Response, next: NextFunction) {
      try {
        const payload = unsubscribePayloadSchema.parse(request.body);
        const result = await unsubscribeEmailAddress(payload.token);

        return sendSuccess(response, result.message, { success: result.success });
      } catch (error) {
        next(error);
      }
    }
  };
}
