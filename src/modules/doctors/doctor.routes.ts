import { Router } from 'express';
import * as doctors from './doctor.controller.js';

export const doctorRouter = Router();

doctorRouter.get('/', doctors.list);
doctorRouter.post('/', doctors.create);
doctorRouter.get('/facets', doctors.facets);
doctorRouter.get('/:id', doctors.getById);
doctorRouter.get('/:id/patients', doctors.listPatients);
doctorRouter.post('/:id/patients', doctors.addPatient);
doctorRouter.delete('/:id/patients/:patientId', doctors.removePatient);
