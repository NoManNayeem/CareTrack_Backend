import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import { parseDuration } from './duration.js';
import type { AuthUser } from '../types/express.js';
import { ROLES, type Role } from '../modules/auth/user.model.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'caretrack-api';
const AUDIENCE = 'caretrack-web';
const ALG = 'HS256';

export const sessionTtlMs = parseDuration(env.JWT_EXPIRES_IN);

export async function signSession(user: AuthUser): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALG, typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

export async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALG],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const role = payload.role as Role;
    if (!payload.sub || !ROLES.includes(role)) return null;
    return { id: payload.sub, role };
  } catch {
    return null;
  }
}
