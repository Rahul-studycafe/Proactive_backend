import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { ZodSchema } from 'zod';

import { ApiError } from '../common/errors/api-error';

export type ValidationSource = 'body' | 'query' | 'params';

export const validateRequest = <T>(
  schema: ZodSchema<T>,
  source: ValidationSource = 'body',
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req[source]);

    if (!parsed.success) {
      const details = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      next(new ApiError(400, 'Request validation failed', 'VALIDATION_ERROR', details));
      return;
    }

    if (source === 'query') {
      _res.locals.validatedQuery = parsed.data;
      next();
      return;
    }

    req[source] = parsed.data as Request[ValidationSource];
    next();
  };
};
