import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination.js';
import {
  endOfDay,
  isoDate,
  listOf,
  objectId,
  personName,
  phone,
  refineDateRange,
  searchTerm,
} from '../../lib/schemas.js';
import { CONDITIONS, GENDERS, PATIENT_SORTS } from './patient.constants.js';

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === '' ? undefined : v))
  .pipe(z.email({ error: 'Enter a valid email address' }).optional())
  .optional();

const optionalNotes = z
  .string()
  .trim()
  .max(1000, { error: 'Notes must be at most 1000 characters' })
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const admissionDate = isoDate.refine((d) => d.getTime() <= Date.now() + 60_000, {
  error: 'Admission date cannot be in the future',
});

const patientFields = {
  name: personName,
  age: z.coerce
    .number({ error: 'Age must be a number' })
    .int({ error: 'Age must be a whole number' })
    .min(0, { error: 'Age cannot be negative' })
    .max(130, { error: 'Age looks too high' }),
  gender: z.enum(GENDERS, { error: 'Choose a gender' }),
  phone,
  email: optionalEmail,
  condition: z.enum(CONDITIONS, { error: 'Choose a condition' }),
  diagnosis: z
    .string()
    .trim()
    .min(2, { error: 'Diagnosis must be at least 2 characters' })
    .max(120, { error: 'Diagnosis must be at most 120 characters' }),
  admissionDate,
  notes: optionalNotes,
};

/** Body for POST /doctors/:id/patients — the doctor comes from the URL. */
export const createPatientBody = z.strictObject(patientFields);
export type CreatePatientBody = z.infer<typeof createPatientBody>;

/** Body for PATCH /patients/:id — any subset of fields, optionally re-assigning the doctor. */
export const updatePatientBody = z
  .strictObject({ ...patientFields, doctor: objectId })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { error: 'Provide at least one field to update' });
export type UpdatePatientBody = z.infer<typeof updatePatientBody>;

export const listPatientsQuery = z
  .object({
    q: searchTerm,
    condition: listOf(z.enum(CONDITIONS)),
    gender: listOf(z.enum(GENDERS)),
    doctor: objectId.optional(),
    minAge: z.coerce.number().int().min(0).max(130).optional(),
    maxAge: z.coerce.number().int().min(0).max(130).optional(),
    from: isoDate.optional(),
    to: isoDate.optional().transform((d) => (d ? endOfDay(d) : d)),
    sort: z.enum(PATIENT_SORTS).default('admitted_desc'),
    ...paginationQuery,
  })
  .superRefine(refineDateRange)
  .superRefine((v, ctx) => {
    if (v.minAge !== undefined && v.maxAge !== undefined && v.minAge > v.maxAge) {
      ctx.addIssue({ code: 'custom', path: ['minAge'], message: 'minAge must be ≤ maxAge' });
    }
  });
export type ListPatientsQuery = z.infer<typeof listPatientsQuery>;

/** The doctor-scoped list uses the same filters minus `doctor`. */
export const listDoctorPatientsQuery = listPatientsQuery;

export const patientIdParams = z.object({ id: objectId });
