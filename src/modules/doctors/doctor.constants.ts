export const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'General Medicine',
  'Nephrology',
  'Neurology',
  'Obstetrics & Gynecology',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
  'Urology',
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];

export const DOCTOR_SORTS = ['newest', 'oldest', 'name_asc', 'name_desc'] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];
