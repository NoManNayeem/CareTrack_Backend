import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { verifySession } from '../lib/jwt.js';

/** Reads the session from the HTTP-only cookie (browser) or a Bearer token (API clients). */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const cookieToken: unknown = req.cookies?.[env.COOKIE_NAME];
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = typeof cookieToken === 'string' && cookieToken ? cookieToken : bearer;

  if (!token) return next(HttpError.unauthorized());

  const user = await verifySession(token);
  if (!user) return next(HttpError.unauthorized('Your session has expired. Please sign in again.'));

  req.user = user;
  next();
};
