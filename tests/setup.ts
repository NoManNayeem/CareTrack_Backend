import { afterAll, afterEach, beforeAll, inject } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = inject('mongoUri');
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.FRONTEND_URL = 'http://localhost:3000';

// Imported lazily so the env vars above are in place before config/env.ts is evaluated.
beforeAll(async () => {
  const { connectDb } = await import('../src/db/connect.js');
  const mongoose = (await import('mongoose')).default;
  await connectDb();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterEach(async () => {
  const mongoose = (await import('mongoose')).default;
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  const { disconnectDb } = await import('../src/db/connect.js');
  await disconnectDb();
});
