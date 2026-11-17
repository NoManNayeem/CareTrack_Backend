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
import { DOCTOR_SORTS, SPECIALIZATIONS } from './doctor.constants.js';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const createDoctorBody = z.strictObject({
  name: personName,
  specialization: z.enum(SPECIALIZATIONS, { error: 'Choose a specialization from the list' }),
  hospital: z
    .string()
    .trim()
    .min(2, { error: 'Hospital must be at least 2 characters' })
    .max(120, { error: 'Hospital must be at most 120 characters' }),
  phone,
  email,
});
export type CreateDoctorBody = z.infer<typeof createDoctorBody>;

export const listDoctorsQuery = z
  .object({
    q: searchTerm,
    specialization: listOf(z.enum(SPECIALIZATIONS)),
    hospital: listOf(z.string().max(120)),
    from: isoDate.optional(),
    to: isoDate.optional().transform((d) => (d ? endOfDay(d) : d)),
    sort: z.enum(DOCTOR_SORTS).default('newest'),
    ...paginationQuery,
  })
  .superRefine(refineDateRange);
export type ListDoctorsQuery = z.infer<typeof listDoctorsQuery>;

export const doctorIdParams = z.object({ id: objectId });
export const doctorPatientParams = z.object({ id: objectId, patientId: objectId });
