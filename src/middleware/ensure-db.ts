import type { RequestHandler } from 'express';
import { connectDb } from '../db/connect.js';
import { HttpError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export const ensureDb: RequestHandler = async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    next(
      new HttpError(503, 'SERVICE_UNAVAILABLE', 'Database is unavailable. Please retry shortly.'),
    );
  }
};
