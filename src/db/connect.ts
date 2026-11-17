import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);

type Cache = { promise: Promise<typeof mongoose> | null };

// Serverless functions re-use the module scope between warm invocations, so the
// connection promise is cached on globalThis to avoid opening a pool per request.
const globalForMongoose = globalThis as unknown as { __mongoose?: Cache };
const cache: Cache = (globalForMongoose.__mongoose ??= { promise: null });

export function connectDb(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);

  cache.promise ??= mongoose
    .connect(uri, {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
      autoIndex: true,
    })
    .then((conn) => {
      logger.info({ db: conn.connection.name }, 'MongoDB connected');
      return conn;
    })
    .catch((error: unknown) => {
      cache.promise = null; // allow a retry on the next request
      throw error;
    });

  return cache.promise;
}

export async function disconnectDb(): Promise<void> {
  cache.promise = null;
  await mongoose.disconnect();
}
