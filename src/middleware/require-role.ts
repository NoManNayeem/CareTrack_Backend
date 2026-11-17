import type { RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import type { Role } from '../modules/auth/user.model.js';

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (!roles.includes(req.user.role)) return next(HttpError.forbidden());
    next();
  };
