import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimit } from '../../middleware/rate-limit.js';
import * as auth from './auth.controller.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, auth.login);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', authenticate, auth.me);
