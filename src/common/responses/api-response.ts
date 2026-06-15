import { type Response } from 'express';

export const sendSuccess = (
  res: Response,
  statusCode: number,
  message: string,
  data: unknown = {},
): Response => {
  const requestId = res.locals.requestId as string | undefined;

  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta: {
      requestId,
      service: 'Proactive-backend',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
};

export const sendError = (
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details: string[] = [],
): Response => {
  const requestId = res.locals.requestId as string | undefined;

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      requestId,
      service: 'Proactive-backend',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
};
