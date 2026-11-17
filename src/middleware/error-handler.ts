import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { isProduction } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

interface MongoDuplicateKeyError {
  code: number;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKey(err: unknown): err is MongoDuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof mongoose.Error.CastError) {
    return HttpError.badRequest(`Invalid value for "${err.path}"`);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      location: 'body' as const,
      field: e.path,
      message: e.message,
    }));
    return new HttpError(400, 'VALIDATION_ERROR', 'Validation failed', details);
  }

  if (isDuplicateKey(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return HttpError.conflict(`A record with this ${field} already exists`, [
      { location: 'body', field, message: `This ${field} is already in use` },
    ]);
  }

  // body-parser errors
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') return HttpError.badRequest('Malformed JSON body');
  if (type === 'entity.too.large')
    return new HttpError(413, 'BAD_REQUEST', 'Request body too large');

  return new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong on our side');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const httpError = toHttpError(err);

  if (httpError.status >= 500) {
    (req.log ?? logger).error({ err }, 'Unhandled error');
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(httpError.details !== undefined && { details: httpError.details }),
      ...(!isProduction && httpError.status >= 500 && err instanceof Error && { stack: err.stack }),
    },
  });
};
