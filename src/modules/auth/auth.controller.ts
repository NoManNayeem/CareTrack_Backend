import type { CookieOptions, Response } from 'express';
import { cookieSecure, env } from '../../config/env.js';
import { signSession } from '../../lib/jwt.js';
import { validated } from '../../middleware/validate.js';
import { loginBody } from './auth.schema.js';
import * as authService from './auth.service.js';

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'lax',
  path: '/',
};

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(env.COOKIE_NAME, token, { ...baseCookie, expires: expiresAt });
}

export const login = validated({ body: loginBody }, async ({ body }, _req, res) => {
  const user = await authService.authenticateCredentials(body);
  const { token, expiresAt } = await signSession({ id: user.id, role: user.role });
  setSessionCookie(res, token, expiresAt);
  res.set('Cache-Control', 'no-store').json({ data: { user, expiresAt } });
});

export const logout = validated({}, (_input, _req, res) => {
  res.clearCookie(env.COOKIE_NAME, baseCookie);
  res.status(204).end();
});

export const me = validated({}, async (_input, req, res) => {
  const user = await authService.getUserById(req.user!.id);
  res.set('Cache-Control', 'no-store').json({ data: { user } });
});
