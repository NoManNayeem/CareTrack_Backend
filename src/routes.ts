import { Router } from 'express';
import mongoose from 'mongoose';
import { connectDb } from './db/connect.js';
import { authenticate } from './middleware/authenticate.js';
import { ensureDb } from './middleware/ensure-db.js';
import { requireRole } from './middleware/require-role.js';
import { analyticsRouter } from './modules/analytics/analytics.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { doctorRouter } from './modules/doctors/doctor.routes.js';
import { patientRouter } from './modules/patients/patient.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', async (_req, res) => {
  const db = await connectDb()
    .then(() => mongoose.connection.db?.admin().ping())
    .then(() => 'up' as const)
    .catch(() => 'down' as const);
  res
    .status(db === 'up' ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json({ status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) });
});

apiRouter.use(ensureDb);

apiRouter.use('/auth', authRouter);

// Every resource below requires a valid session AND the admin role.
const protectedRouter = Router();
protectedRouter.use(authenticate, requireRole('admin'));
protectedRouter.use('/doctors', doctorRouter);
protectedRouter.use('/patients', patientRouter);
protectedRouter.use('/analytics', analyticsRouter);

apiRouter.use(protectedRouter);
