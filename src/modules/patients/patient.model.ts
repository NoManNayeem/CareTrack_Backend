import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import { normalizeText } from '../../lib/normalize.js';
import { buildSearchTokens } from '../../lib/search.js';
import { CONDITIONS, GENDERS } from './patient.constants.js';

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, required: true, enum: GENDERS },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    condition: { type: String, required: true, enum: CONDITIONS },
    diagnosis: { type: String, required: true, trim: true, maxlength: 120 },
    admissionDate: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    nameNormalized: { type: String, required: true, select: false },
    searchTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true, versionKey: false },
);

export function patientDerivedFields(p: {
  name: string;
  diagnosis: string;
  email?: string | null;
  phone: string;
}) {
  return {
    nameNormalized: normalizeText(p.name),
    searchTokens: buildSearchTokens({
      words: [p.name, p.diagnosis],
      emails: [p.email],
      phones: [p.phone],
    }),
  };
}

patientSchema.pre('validate', function () {
  Object.assign(this, patientDerivedFields(this));
});

/* ESR-ordered compound indexes — see README "Indexing strategy". */
patientSchema.index({ doctor: 1, admissionDate: -1 }); //      a doctor's patients, patients-per-doctor
patientSchema.index({ condition: 1, admissionDate: -1 }); //   condition filter, condition breakdown
patientSchema.index({ gender: 1, admissionDate: -1 }); //      gender filter
patientSchema.index({ admissionDate: -1, _id: -1 }); //        default list, date stats & timeline
patientSchema.index({ nameNormalized: 1, _id: 1 }); //         A→Z / Z→A sort
patientSchema.index({ searchTokens: 1 }); //                   multikey prefix search

export type PatientAttrs = InferSchemaType<typeof patientSchema>;
export type PatientLean = PatientAttrs & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const Patient = model('Patient', patientSchema);

export const PATIENT_PUBLIC_FIELDS = {
  name: 1,
  age: 1,
  gender: 1,
  phone: 1,
  email: 1,
  condition: 1,
  diagnosis: 1,
  admissionDate: 1,
  notes: 1,
  doctor: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export interface PatientDoctorRef {
  id: string;
  name: string;
  specialization: string;
}

export interface PatientDto {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string | null;
  condition: string;
  diagnosis: string;
  admissionDate: Date;
  notes: string | null;
  doctor: PatientDoctorRef | null;
  createdAt: Date;
  updatedAt: Date;
}

type PopulatedDoctor = { _id: Types.ObjectId; name: string; specialization: string };

export function toPatientDto(
  p: Omit<PatientLean, 'doctor' | 'nameNormalized' | 'searchTokens'> & {
    doctor: Types.ObjectId | PopulatedDoctor | null;
  },
): PatientDto {
  const doc = p.doctor && 'name' in p.doctor ? p.doctor : null;
  return {
    id: p._id.toString(),
    name: p.name,
    age: p.age,
    gender: p.gender,
    phone: p.phone,
    email: p.email ?? null,
    condition: p.condition,
    diagnosis: p.diagnosis,
    admissionDate: p.admissionDate,
    notes: p.notes ?? null,
    doctor: doc
      ? { id: doc._id.toString(), name: doc.name, specialization: doc.specialization }
      : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
