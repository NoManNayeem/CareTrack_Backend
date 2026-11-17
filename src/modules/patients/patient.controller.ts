import { validated } from '../../middleware/validate.js';
import { listPatientsQuery, patientIdParams, updatePatientBody } from './patient.schema.js';
import * as patientService from './patient.service.js';

export const list = validated({ query: listPatientsQuery }, async ({ query }, _req, res) => {
  res.json(await patientService.listPatients(query));
});

export const getById = validated({ params: patientIdParams }, async ({ params }, _req, res) => {
  res.json({ data: await patientService.getPatient(params.id) });
});

export const update = validated(
  { params: patientIdParams, body: updatePatientBody },
  async ({ params, body }, _req, res) => {
    res.json({ data: await patientService.updatePatient(params.id, body) });
  },
);

export const remove = validated({ params: patientIdParams }, async ({ params }, _req, res) => {
  await patientService.deletePatient(params.id);
  res.status(204).end();
});
