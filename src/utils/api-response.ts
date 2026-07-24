import type { Response } from 'express';

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Array<{ field?: string; message: string }>;
  request_id?: string;
}

export function sendSuccess<T>(response: Response, message: string, data: T, status = 200): Response {
  return response.status(status).json({ success: true, message, data } satisfies ApiEnvelope<T>);
}

