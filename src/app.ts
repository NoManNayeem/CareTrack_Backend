import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type RequestHandler } from 'express';
import * as helmetModule from 'helmet';
import type { HelmetOptions } from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { originCheck } from './middleware/origin-check.js';
import { apiRouter } from './routes.js';

// helmet's CommonJS typings declare `export default` in ESM syntax, so CommonJS-mode compilers
// (Vercel's builder) see only the module namespace. Both of its runtime builds expose `.default`.
type Helmet = (options?: HelmetOptions) => RequestHandler;
const helmet = ((helmetModule as { default?: unknown }).default ?? helmetModule) as Helmet;

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Behind Vercel's edge (and the Next.js rewrite proxy) — trust X-Forwarded-* for req.ip/req.secure.
  app.set('trust proxy', true);

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );
  app.use(originCheck);

  app.get('/', (_req, res) => {
    res.json({ name: 'CareTrack API', version: 'v1', health: '/api/v1/health' });
  });
  app.use('/api/v1', apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

const app = createApp();
export default app;
