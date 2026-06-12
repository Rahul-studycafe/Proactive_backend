export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: string[];

  constructor(
    statusCode: number,
    message: string,
    code = 'INTERNAL_SERVER_ERROR',
    details: string[] = [],
    stack = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
