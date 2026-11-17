import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence-in-depth on top of SameSite=Lax cookies: browsers always attach an
 * Origin header to cross-site state-changing requests, so reject any that are not ours.
 * Requests without an Origin (curl, server-to-server) carry no ambient browser cookies.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !env.FRONTEND_URL.includes(origin.replace(/\/$/, ''))) {
    return next(HttpError.forbidden('Cross-origin request blocked'));
  }
  next();
};
