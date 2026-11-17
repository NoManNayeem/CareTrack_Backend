import { validated } from '../../middleware/validate.js';
import { createPatientBody, listDoctorPatientsQuery } from '../patients/patient.schema.js';
import * as patientService from '../patients/patient.service.js';
import {
  createDoctorBody,
  doctorIdParams,
  doctorPatientParams,
  listDoctorsQuery,
} from './doctor.schema.js';
import * as doctorService from './doctor.service.js';

export const list = validated({ query: listDoctorsQuery }, async ({ query }, _req, res) => {
  res.json(await doctorService.listDoctors(query));
});

export const facets = validated({}, async (_input, _req, res) => {
  res
    .set('Cache-Control', 'private, max-age=60')
    .json({ data: await doctorService.getDoctorFacets() });
});

export const create = validated({ body: createDoctorBody }, async ({ body }, _req, res) => {
  const doctor = await doctorService.createDoctor(body);
  res.status(201).location(`/api/v1/doctors/${doctor.id}`).json({ data: doctor });
});

export const getById = validated({ params: doctorIdParams }, async ({ params }, _req, res) => {
  res.json({ data: await doctorService.getDoctor(params.id) });
});

export const listPatients = validated(
  { params: doctorIdParams, query: listDoctorPatientsQuery },
  async ({ params, query }, _req, res) => {
    // 404 for unknown doctors rather than an empty page
    await doctorService.assertDoctorExists(params.id);
    res.json(await patientService.listPatients(query, params.id));
  },
);

export const addPatient = validated(
  { params: doctorIdParams, body: createPatientBody },
  async ({ params, body }, _req, res) => {
    const patient = await patientService.createPatientForDoctor(params.id, body);
    res.status(201).location(`/api/v1/patients/${patient.id}`).json({ data: patient });
  },
);

export const removePatient = validated(
  { params: doctorPatientParams },
  async ({ params }, _req, res) => {
    await patientService.deleteDoctorPatient(params.id, params.patientId);
    res.status(204).end();
  },
);
