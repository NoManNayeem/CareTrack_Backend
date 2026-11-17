import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { HttpError } from '../lib/http-error.js';

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

export interface ValidatedInput<S extends Schemas> {
  body: Out<S['body']>;
  query: Out<S['query']>;
  params: Out<S['params']>;
}

export interface FieldIssue {
  location: 'body' | 'query' | 'params';
  field: string;
  message: string;
}

/**
 * Wraps a controller with Zod validation for body / query / params.
 * The handler receives fully-typed, parsed input — Express 5's req.query is a getter,
 * so parsed values are passed explicitly instead of being written back onto req.
 */
export function validated<S extends Schemas>(
  schemas: S,
  handler: (input: ValidatedInput<S>, req: Request, res: Response) => Promise<unknown> | unknown,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const issues: FieldIssue[] = [];
    const input = {} as Record<keyof Schemas, unknown>;

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        input[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({
            location,
            field: issue.path.join('.') || location,
            message: issue.message,
          });
        }
      }
    }

    if (issues.length) {
      return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed', issues));
    }

    await handler(input as unknown as ValidatedInput<S>, req, res);
  };
}
