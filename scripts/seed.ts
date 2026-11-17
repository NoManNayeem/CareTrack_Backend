/**
 * Seeds an admin account plus a realistic, reproducible dataset.
 *
 *   npm run seed            # wipe doctors/patients, then seed
 *   npm run seed -- --keep  # only upsert the admin user
 */
import { faker } from '@faker-js/faker';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/auth/user.model.js';
import { SPECIALIZATIONS, type Specialization } from '../src/modules/doctors/doctor.constants.js';
import { Doctor, doctorDerivedFields } from '../src/modules/doctors/doctor.model.js';
import type { Condition, Gender } from '../src/modules/patients/patient.constants.js';
import { Patient, patientDerivedFields } from '../src/modules/patients/patient.model.js';

const DOCTOR_COUNT = 48;
const DAY = 86_400_000;

const HOSPITALS = [
  'Riverside General Hospital',
  "St. Catherine's Medical Center",
  'Northgate Community Hospital',
  'Lakeview University Hospital',
  'Harborview Health',
  'Cedar Grove Medical Center',
  'Summit Regional Hospital',
];

const DIAGNOSES: Record<Specialization, string[]> = {
  Cardiology: [
    'Hypertension',
    'Atrial fibrillation',
    'Coronary artery disease',
    'Heart failure',
    'Angina',
  ],
  Dermatology: [
    'Psoriasis',
    'Atopic dermatitis',
    'Cellulitis',
    'Melanoma screening',
    'Acne vulgaris',
  ],
  Endocrinology: [
    'Type 2 diabetes',
    'Hypothyroidism',
    'Graves disease',
    'Type 1 diabetes',
    'Osteoporosis',
  ],
  Gastroenterology: ['Crohn disease', 'Ulcerative colitis', 'GERD', 'Pancreatitis', 'Cirrhosis'],
  'General Medicine': [
    'Influenza',
    'Pneumonia',
    'Dehydration',
    'Anemia',
    'Urinary tract infection',
  ],
  Nephrology: [
    'Chronic kidney disease',
    'Acute kidney injury',
    'Kidney stones',
    'Nephrotic syndrome',
  ],
  Neurology: ['Migraine', 'Epilepsy', 'Ischemic stroke', 'Parkinson disease', 'Multiple sclerosis'],
  'Obstetrics & Gynecology': [
    'Prenatal care',
    'Pre-eclampsia',
    'Endometriosis',
    'Gestational diabetes',
  ],
  Oncology: ['Breast cancer', 'Lung cancer', 'Lymphoma', 'Colorectal cancer', 'Leukemia'],
  Ophthalmology: ['Cataract', 'Glaucoma', 'Diabetic retinopathy', 'Macular degeneration'],
  Orthopedics: [
    'Hip fracture',
    'ACL tear',
    'Osteoarthritis',
    'Lumbar disc herniation',
    'Rotator cuff tear',
  ],
  Pediatrics: ['Bronchiolitis', 'Asthma', 'Otitis media', 'Gastroenteritis', 'Febrile seizure'],
  Psychiatry: ['Major depressive disorder', 'Generalized anxiety', 'Bipolar disorder', 'PTSD'],
  Pulmonology: [
    'COPD',
    'Asthma exacerbation',
    'Pulmonary embolism',
    'Sleep apnea',
    'Pulmonary fibrosis',
  ],
  Radiology: ['Imaging follow-up', 'Interventional procedure', 'Contrast reaction monitoring'],
  Urology: [
    'Benign prostatic hyperplasia',
    'Kidney stones',
    'Bladder infection',
    'Prostate cancer',
  ],
};

const CLINICAL_NOTES = [
  'Vitals stable overnight; continue current regimen.',
  'Follow-up imaging scheduled in two weeks.',
  'Reports reduced pain; mobilising with assistance.',
  'Medication dose adjusted after morning labs.',
  'Family briefed on the care plan.',
  'Monitor blood pressure every 4 hours.',
  'Awaiting specialist consult.',
  'Discharge planning in progress.',
  'Penicillin allergy documented.',
  'Tolerating oral diet; IV fluids discontinued.',
  'Physiotherapy twice daily.',
  'Repeat bloods in 48 hours.',
  'Referred to dietitian for nutritional review.',
  'Wound healing well; dressing changed.',
  'Oxygen weaned to room air.',
];

const MALE_ONLY = new Set(['Benign prostatic hyperplasia', 'Prostate cancer']);
const FEMALE_ONLY = new Set([
  'Prenatal care',
  'Pre-eclampsia',
  'Endometriosis',
  'Gestational diabetes',
]);

/** "+1 (212) 555-0199" — readable, and still matches the API's phone rule. */
function usPhone(): string {
  const area = faker.number.int({ min: 201, max: 989 });
  const exchange = faker.number.int({ min: 200, max: 999 });
  const line = faker.number.int({ min: 0, max: 9999 }).toString().padStart(4, '0');
  return `+1 (${area}) ${exchange}-${line}`;
}

function diagnosisFor(specialization: Specialization, gender: Gender): string {
  const options = DIAGNOSES[specialization].filter((d) =>
    gender === 'male' ? !FEMALE_ONLY.has(d) : gender === 'female' ? !MALE_ONLY.has(d) : true,
  );
  return faker.helpers.arrayElement(options.length ? options : DIAGNOSES[specialization]);
}

/** Weighted pick. */
function pick<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [value, weight] of entries) {
    if ((r -= weight) <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Older admissions are more likely to be discharged; recent ones skew acute. */
function conditionFor(daysAgo: number): Condition {
  if (daysAgo > 120)
    return pick([
      ['discharged', 62],
      ['stable', 22],
      ['recovering', 10],
      ['under_observation', 4],
      ['critical', 2],
    ]);
  if (daysAgo > 30)
    return pick([
      ['discharged', 30],
      ['stable', 32],
      ['recovering', 22],
      ['under_observation', 10],
      ['critical', 6],
    ]);
  return pick([
    ['stable', 26],
    ['recovering', 26],
    ['under_observation', 26],
    ['critical', 14],
    ['discharged', 8],
  ]);
}

function ageFor(specialization: Specialization): number {
  if (specialization === 'Pediatrics') return faker.number.int({ min: 0, max: 17 });
  if (specialization === 'Obstetrics & Gynecology') return faker.number.int({ min: 19, max: 44 });
  if (specialization === 'Cardiology' || specialization === 'Oncology')
    return faker.number.int({ min: 38, max: 88 });
  return faker.number.int({ min: 18, max: 85 });
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@caretrack.dev';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'CareTrack@2026';
  const name = process.env.SEED_ADMIN_NAME ?? 'Admin';
  await User.updateOne(
    { email },
    { $set: { name, email, role: 'admin', passwordHash: await hashPassword(password) } },
    { upsert: true },
  );
  console.warn(`✔ admin user   ${email}`);
}

async function seedData() {
  faker.seed(2026);
  const now = Date.now();

  await Promise.all([Doctor.deleteMany({}), Patient.deleteMany({})]);

  const usedEmails = new Set<string>();
  const doctors = Array.from({ length: DOCTOR_COUNT }, (_, i) => {
    const sex = faker.helpers.arrayElement(['female', 'male'] as const);
    const first = faker.person.firstName(sex);
    const last = faker.person.lastName();
    let email = faker.internet
      .email({ firstName: first, lastName: last, provider: 'caretrack-health.org' })
      .toLowerCase();
    while (usedEmails.has(email)) email = email.replace('@', `${faker.number.int(99)}@`);
    usedEmails.add(email);

    const specialization = SPECIALIZATIONS[i % SPECIALIZATIONS.length]!;
    const createdAt = new Date(
      now - faker.number.int({ min: 3, max: 540 }) * DAY - faker.number.int(DAY),
    );
    const base = {
      name: `Dr. ${first} ${last}`,
      specialization,
      hospital: faker.helpers.arrayElement(HOSPITALS),
      phone: usPhone(),
      email,
      createdAt,
      updatedAt: createdAt,
    };
    return { ...base, ...doctorDerivedFields(base) };
  });

  const insertedDoctors = await Doctor.insertMany(doctors);

  const patients = insertedDoctors.flatMap((doctor) => {
    const specialization = doctor.specialization as Specialization;
    // Uneven caseloads make "patients per doctor" meaningful.
    const count = Math.round(
      faker.number.float({ min: 6, max: 52 }) * (faker.datatype.boolean(0.2) ? 1.6 : 1),
    );
    const doctorAgeDays = Math.max(1, Math.floor((now - doctor.createdAt.getTime()) / DAY));

    return Array.from({ length: count }, () => {
      // Skew admissions towards recent dates so the timeline shows growth.
      const daysAgo = Math.floor(
        doctorAgeDays * Math.pow(faker.number.float({ min: 0, max: 1 }), 1.25),
      );
      const admissionDate = new Date(now - daysAgo * DAY - faker.number.int(DAY));
      const gender: Gender =
        specialization === 'Obstetrics & Gynecology'
          ? 'female'
          : pick<Gender>([
              ['female', 49],
              ['male', 49],
              ['other', 2],
            ]);
      const first = faker.person.firstName(gender === 'other' ? undefined : gender);
      const last = faker.person.lastName();
      const base = {
        name: `${first} ${last}`,
        age: ageFor(specialization),
        gender,
        phone: usPhone(),
        email: faker.datatype.boolean(0.7)
          ? faker.internet.email({ firstName: first, lastName: last }).toLowerCase()
          : undefined,
        condition: conditionFor(daysAgo),
        diagnosis: diagnosisFor(specialization, gender),
        admissionDate,
        notes: faker.datatype.boolean(0.35)
          ? faker.helpers.arrayElement(CLINICAL_NOTES)
          : undefined,
        doctor: doctor._id,
        createdAt: admissionDate,
        updatedAt: admissionDate,
      };
      return { ...base, ...patientDerivedFields(base) };
    });
  });

  await Patient.insertMany(patients, { lean: true });
  console.warn(`✔ doctors      ${insertedDoctors.length}`);
  console.warn(`✔ patients     ${patients.length}`);
}

async function main() {
  await connectDb(env.MONGODB_URI);
  await Promise.all([User.init(), Doctor.init(), Patient.init()]); // ensure indexes exist
  await seedAdmin();
  if (!process.argv.includes('--keep')) await seedData();
  await disconnectDb();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
