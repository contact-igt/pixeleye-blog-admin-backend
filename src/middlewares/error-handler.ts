import type { ErrorRequestHandler } from 'express';
import { UniqueConstraintError, ValidationError } from 'sequelize';
import { ZodError } from 'zod';
import { env } from '../config/environment.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/api-error.js';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  let statusCode = 500;
  let message = 'An unexpected error occurred';
  let errors: Array<{ field?: string; message: string }> | undefined;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errors = error.errors;
  } else if (error instanceof UniqueConstraintError) {
    statusCode = 409;
    message = 'A record with the provided value already exists';
  } else if (error instanceof ValidationError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = error.errors.map((item) => ({ field: item.path ?? undefined, message: item.message }));
  } else if (error instanceof ZodError) {
    statusCode = 422;
    message = 'Validation failed';
    errors = error.issues.map((issue) => ({ field: issue.path.join('.') || undefined, message: issue.message }));
  } else if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    message = 'Request body contains invalid JSON';
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 413
  ) {
    statusCode = 413;
    message = 'Request body is too large';
  }

  logger.error(
    { err: error, request_id: request.requestId, method: request.method, route: request.originalUrl },
    'Request failed'
  );

  response.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    request_id: request.requestId,
    ...(env.NODE_ENV !== 'production' && statusCode === 500 ? { debug: error instanceof Error ? error.message : 'Unknown error' } : {})
  });
};
