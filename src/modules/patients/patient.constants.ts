export const CONDITIONS = [
  'stable',
  'recovering',
  'under_observation',
  'critical',
  'discharged',
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const GENDERS = ['female', 'male', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const PATIENT_SORTS = ['admitted_desc', 'admitted_asc', 'name_asc', 'name_desc'] as const;
export type PatientSort = (typeof PATIENT_SORTS)[number];
