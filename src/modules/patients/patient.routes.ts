import { Router } from 'express';
import * as patients from './patient.controller.js';

export const patientRouter = Router();

patientRouter.get('/', patients.list);
patientRouter.get('/:id', patients.getById);
patientRouter.patch('/:id', patients.update);
patientRouter.delete('/:id', patients.remove);
