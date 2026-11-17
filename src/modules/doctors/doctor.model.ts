import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import { normalizeText } from '../../lib/normalize.js';
import { buildSearchTokens } from '../../lib/search.js';
import { SPECIALIZATIONS } from './doctor.constants.js';

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    specialization: { type: String, required: true, enum: SPECIALIZATIONS },
    hospital: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    // Derived fields (maintained by the pre-validate hook, never exposed in the API)
    nameNormalized: { type: String, required: true, select: false },
    searchTokens: { type: [String], default: [], select: false },
  },
  { timestamps: true, versionKey: false },
);

export function doctorDerivedFields(d: { name: string; email: string; phone: string }) {
  return {
    nameNormalized: normalizeText(d.name),
    searchTokens: buildSearchTokens({ words: [d.name], emails: [d.email], phones: [d.phone] }),
  };
}

doctorSchema.pre('validate', function () {
  Object.assign(this, doctorDerivedFields(this));
});

/*
 * Index design follows the ESR rule (Equality → Sort → Range) so every list view is
 * answered by an index scan with the sort order coming from the index itself.
 */
doctorSchema.index({ createdAt: -1, _id: -1 }); //                 default list / date range
doctorSchema.index({ specialization: 1, createdAt: -1 }); //       filter by specialization
doctorSchema.index({ hospital: 1, createdAt: -1 }); //             filter by hospital + facets
doctorSchema.index({ nameNormalized: 1, _id: 1 }); //              A→Z / Z→A sort
doctorSchema.index({ searchTokens: 1 }); //                        multikey prefix search

export type DoctorAttrs = InferSchemaType<typeof doctorSchema>;
export type DoctorLean = DoctorAttrs & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export const Doctor = model('Doctor', doctorSchema);

/** Public projection — never leak derived/search fields. */
export const DOCTOR_PUBLIC_FIELDS = {
  name: 1,
  specialization: 1,
  hospital: 1,
  phone: 1,
  email: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export interface DoctorDto {
  id: string;
  name: string;
  specialization: string;
  hospital: string;
  phone: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toDoctorDto(
  d: Pick<DoctorLean, '_id' | keyof typeof DOCTOR_PUBLIC_FIELDS>,
): DoctorDto {
  return {
    id: d._id.toString(),
    name: d.name,
    specialization: d.specialization,
    hospital: d.hospital,
    phone: d.phone,
    email: d.email,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
