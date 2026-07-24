export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errors?: Array<{ field?: string; message: string }>,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'ApiError';
  }
}
