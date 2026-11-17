import { Router } from 'express';
import * as analytics from './analytics.controller.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', analytics.overview);
