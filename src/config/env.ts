import { createHmac } from 'node:crypto';
import { z } from 'zod';

/** Live addresses used when running on Vercel without explicit settings. */
const VERCEL_FRONTEND_URL = 'https://caretrackfrontend.vercel.app';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  COOKIE_NAME: z.string().default('ct_session'),
  // Defaults to true in production. Set to "false" only for plain-http local Docker runs.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  FRONTEND_URL: z
    .string()
    .default(process.env.VERCEL ? VERCEL_FRONTEND_URL : 'http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Zero-config deploys: when JWT_SECRET isn't set, derive one from MONGODB_URI (HMAC-SHA256).
 * It is then exactly as secret as the database password and never stored in the repo.
 * A dedicated JWT_SECRET is still recommended, so rotating the DB password doesn't sign everyone out.
 */
function withDerivedSecret(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (source.JWT_SECRET || !source.MONGODB_URI) return source;
  console.warn(
    'JWT_SECRET is not set: deriving it from MONGODB_URI. Set a dedicated JWT_SECRET in production.',
  );
  const derived = createHmac('sha256', 'caretrack-session-signing')
    .update(source.MONGODB_URI)
    .digest('hex');
  return { ...source, JWT_SECRET: derived };
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(withDerivedSecret(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const cookieSecure = env.COOKIE_SECURE ?? isProduction;
