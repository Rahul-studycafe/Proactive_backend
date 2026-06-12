import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { sendError } from '../utils/ApiResponse';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof ApiError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  // Handle Mongoose/Mongo Errors gracefully
  if (err.name === 'ValidationError') {
    return sendError(res, 400, 'VALIDATION_ERROR', err.message, Object.values(err.errors || {}).map((e: any) => e.message));
  }

  if (err.code === 11000) {
    return sendError(res, 409, 'DUPLICATE_KEY_ERROR', 'A record with that value already exists', [err.message]);
  }

  // Fallback for unknown errors
  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'Something went wrong on the server', [err.message]);
};