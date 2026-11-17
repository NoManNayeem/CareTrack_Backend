import { Types, type PipelineStage, type QueryFilter } from 'mongoose';
import { HttpError } from '../../lib/http-error.js';
import { buildPageMeta, type Paginated } from '../../lib/pagination.js';
import { searchTokensFilter } from '../../lib/search.js';
import { CONDITIONS, type Condition } from '../patients/patient.constants.js';
import { Patient } from '../patients/patient.model.js';
import { SPECIALIZATIONS, type DoctorSort } from './doctor.constants.js';
import {
  Doctor,
  DOCTOR_PUBLIC_FIELDS,
  toDoctorDto,
  type DoctorAttrs,
  type DoctorDto,
  type DoctorLean,
} from './doctor.model.js';
import type { CreateDoctorBody, ListDoctorsQuery } from './doctor.schema.js';

const SORTS: Record<DoctorSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  name_asc: { nameNormalized: 1, _id: 1 },
  name_desc: { nameNormalized: -1, _id: -1 },
};

export interface DoctorListItem extends DoctorDto {
  patientCount: number;
}

export function buildDoctorFilter(
  query: Partial<Omit<ListDoctorsQuery, 'page' | 'limit' | 'sort'>>,
) {
  const filter: QueryFilter<DoctorAttrs> = { ...searchTokensFilter(query.q) };
  if (query.specialization) filter.specialization = { $in: query.specialization };
  if (query.hospital) filter.hospital = { $in: query.hospital };
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from && { $gte: query.from }),
      ...(query.to && { $lte: query.to }),
    };
  }
  return filter;
}

export async function listDoctors(query: ListDoctorsQuery): Promise<Paginated<DoctorListItem>> {
  const { page, limit, sort } = query;
  const filter = buildDoctorFilter(query);

  const pipeline: PipelineStage[] = [
    { $match: filter },
    { $sort: SORTS[sort] },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    // Patient counts are computed for the current page only (≤ limit lookups), each one an
    // index-only COUNT on { doctor: 1, admissionDate: -1 } — no denormalised counter to drift.
    {
      $lookup: {
        from: Patient.collection.name,
        localField: '_id',
        foreignField: 'doctor',
        pipeline: [{ $count: 'n' }],
        as: 'patientStats',
      },
    },
    {
      $project: {
        ...DOCTOR_PUBLIC_FIELDS,
        patientCount: { $ifNull: [{ $first: '$patientStats.n' }, 0] },
      },
    },
  ];

  const [rows, total] = await Promise.all([
    Doctor.aggregate<DoctorLean & { patientCount: number }>(pipeline),
    Doctor.countDocuments(filter),
  ]);

  return {
    data: rows.map((row) => ({ ...toDoctorDto(row), patientCount: row.patientCount })),
    meta: buildPageMeta(page, limit, total),
  };
}

export interface DoctorDetail extends DoctorDto {
  stats: {
    totalPatients: number;
    byCondition: Record<Condition, number>;
    lastAdmissionAt: Date | null;
  };
}

export async function getDoctor(id: string): Promise<DoctorDetail> {
  const doctorId = new Types.ObjectId(id);
  const [doctor, byCondition, latest] = await Promise.all([
    Doctor.findById(doctorId, DOCTOR_PUBLIC_FIELDS).lean<DoctorLean>(),
    Patient.aggregate<{ _id: Condition; count: number }>([
      { $match: { doctor: doctorId } },
      { $group: { _id: '$condition', count: { $sum: 1 } } },
    ]),
    Patient.findOne({ doctor: doctorId }, { admissionDate: 1 })
      .sort({ admissionDate: -1 })
      .lean<{ admissionDate: Date }>(),
  ]);

  if (!doctor) throw HttpError.notFound('Doctor');

  const counts = Object.fromEntries(CONDITIONS.map((c) => [c, 0])) as Record<Condition, number>;
  for (const { _id, count } of byCondition) counts[_id] = count;

  return {
    ...toDoctorDto(doctor),
    stats: {
      totalPatients: byCondition.reduce((sum, c) => sum + c.count, 0),
      byCondition: counts,
      lastAdmissionAt: latest?.admissionDate ?? null,
    },
  };
}

/** Cheap existence check (`_id` index, no document fetch). */
export async function assertDoctorExists(id: string): Promise<void> {
  if (!(await Doctor.exists({ _id: id }))) throw HttpError.notFound('Doctor');
}

export async function createDoctor(body: CreateDoctorBody): Promise<DoctorListItem> {
  const doctor = await Doctor.create(body);
  return { ...toDoctorDto(doctor.toObject()), patientCount: 0 };
}

export async function getDoctorFacets() {
  // DISTINCT_SCAN over { hospital: 1, createdAt: -1 } — no collection scan.
  const hospitals = await Doctor.distinct('hospital');
  return {
    specializations: [...SPECIALIZATIONS],
    hospitals: hospitals.sort((a, b) => a.localeCompare(b)),
  };
}
