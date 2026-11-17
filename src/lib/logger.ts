import { pino } from 'pino';
import { env } from '../config/env.js';

// Pretty, colourised logs only for local development. On Vercel (or any production host)
// logs stay JSON, and pino-pretty (a dev dependency) is never loaded.
const pretty = env.NODE_ENV === 'development' && !process.env.VERCEL;

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  ...(pretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
    : {}),
});
