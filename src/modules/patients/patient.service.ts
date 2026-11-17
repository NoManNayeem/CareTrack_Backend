import { Types, type QueryFilter } from 'mongoose';
import { HttpError } from '../../lib/http-error.js';
import { buildPageMeta, type Paginated } from '../../lib/pagination.js';
import { searchTokensFilter } from '../../lib/search.js';
import { assertDoctorExists } from '../doctors/doctor.service.js';
import type { PatientSort } from './patient.constants.js';
import {
  Patient,
  PATIENT_PUBLIC_FIELDS,
  toPatientDto,
  type PatientAttrs,
  type PatientDto,
} from './patient.model.js';
import type { CreatePatientBody, ListPatientsQuery, UpdatePatientBody } from './patient.schema.js';

const SORTS: Record<PatientSort, Record<string, 1 | -1>> = {
  admitted_desc: { admissionDate: -1, _id: -1 },
  admitted_asc: { admissionDate: 1, _id: 1 },
  name_asc: { nameNormalized: 1, _id: 1 },
  name_desc: { nameNormalized: -1, _id: -1 },
};

const DOCTOR_REF = { path: 'doctor', select: 'name specialization' } as const;

type PatientRow = Parameters<typeof toPatientDto>[0];

export function buildPatientFilter(
  query: Partial<Omit<ListPatientsQuery, 'page' | 'limit' | 'sort'>>,
  doctorId?: string,
): QueryFilter<PatientAttrs> {
  const filter: QueryFilter<PatientAttrs> = { ...searchTokensFilter(query.q) };

  const doctor = doctorId ?? query.doctor;
  if (doctor) filter.doctor = new Types.ObjectId(doctor);
  if (query.condition) filter.condition = { $in: query.condition };
  if (query.gender) filter.gender = { $in: query.gender };
  if (query.minAge !== undefined || query.maxAge !== undefined) {
    filter.age = {
      ...(query.minAge !== undefined && { $gte: query.minAge }),
      ...(query.maxAge !== undefined && { $lte: query.maxAge }),
    };
  }
  if (query.from || query.to) {
    filter.admissionDate = {
      ...(query.from && { $gte: query.from }),
      ...(query.to && { $lte: query.to }),
    };
  }
  return filter;
}

export async function listPatients(
  query: ListPatientsQuery,
  doctorId?: string,
): Promise<Paginated<PatientDto>> {
  const { page, limit, sort } = query;
  const filter = buildPatientFilter(query, doctorId);

  // Page + total run concurrently; both are served by the same compound index.
  const [rows, total] = await Promise.all([
    Patient.find(filter, PATIENT_PUBLIC_FIELDS)
      .sort(SORTS[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(DOCTOR_REF)
      .lean<PatientRow[]>(),
    Patient.countDocuments(filter),
  ]);

  return { data: rows.map(toPatientDto), meta: buildPageMeta(page, limit, total) };
}

async function findPatientDto(id: string): Promise<PatientDto> {
  const row = await Patient.findById(id, PATIENT_PUBLIC_FIELDS)
    .populate(DOCTOR_REF)
    .lean<PatientRow>();
  if (!row) throw HttpError.notFound('Patient');
  return toPatientDto(row);
}

export const getPatient = findPatientDto;

export async function createPatientForDoctor(
  doctorId: string,
  body: CreatePatientBody,
): Promise<PatientDto> {
  await assertDoctorExists(doctorId);
  const patient = await Patient.create({ ...body, doctor: doctorId });
  return findPatientDto(patient._id.toString());
}

export async function updatePatient(id: string, body: UpdatePatientBody): Promise<PatientDto> {
  const patient = await Patient.findById(id).select('+nameNormalized +searchTokens');
  if (!patient) throw HttpError.notFound('Patient');
  if (body.doctor && body.doctor !== patient.doctor.toString())
    await assertDoctorExists(body.doctor);

  // Load → assign → save so schema validators and derived-field hooks always run.
  patient.set(body);
  for (const key of ['email', 'notes'] as const) {
    if (key in body && body[key] === undefined) patient.set(key, undefined);
  }
  await patient.save();
  return findPatientDto(id);
}

export async function deletePatient(id: string): Promise<void> {
  const deleted = await Patient.findByIdAndDelete(id, { projection: { _id: 1 } });
  if (!deleted) throw HttpError.notFound('Patient');
}

/** Removes a patient only if they belong to the given doctor (ownership check). */
export async function deleteDoctorPatient(doctorId: string, patientId: string): Promise<void> {
  const { deletedCount } = await Patient.deleteOne({ _id: patientId, doctor: doctorId });
  if (deletedCount === 0) {
    await assertDoctorExists(doctorId);
    throw HttpError.notFound('Patient for this doctor');
  }
}
