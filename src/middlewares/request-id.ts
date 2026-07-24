import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header('x-request-id');
  const safeRequestId = /^[A-Za-z0-9._:-]{1,128}$/;
  const id = incoming && safeRequestId.test(incoming) ? incoming : `req_${randomUUID()}`;
  request.requestId = id;
  response.setHeader('x-request-id', id);
  next();
}
