import type { Types } from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { User } from '../src/modules/auth/user.model.js';
import { Doctor } from '../src/modules/doctors/doctor.model.js';
import { Patient } from '../src/modules/patients/patient.model.js';

export const api = () => request(app);

export const ADMIN = { email: 'admin@caretrack.dev', password: 'Correct-Horse-9' };
export const ORIGIN = 'http://localhost:3000';

export async function createAdmin() {
  return User.create({
    name: 'Admin',
    email: ADMIN.email,
    passwordHash: await hashPassword(ADMIN.password),
    role: 'admin',
  });
}

/** Logs in and returns the session cookie header. */
export async function loginCookie(): Promise<string> {
  await createAdmin();
  const res = await api().post('/api/v1/auth/login').set('Origin', ORIGIN).send(ADMIN).expect(200);
  const cookies = res.headers['set-cookie'] as unknown as string[];
  return cookies[0]!.split(';')[0]!;
}

let seq = 0;
export function doctorInput(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `Dr. Test Person${seq}`,
    specialization: 'Cardiology',
    hospital: 'Riverside General Hospital',
    phone: `+1 555 000 ${String(1000 + seq)}`,
    email: `doctor${seq}@caretrack.dev`,
    ...overrides,
  };
}

export function patientInput(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `Patient Number${seq}`,
    age: 40,
    gender: 'female',
    phone: `+1 555 111 ${String(1000 + seq)}`,
    condition: 'stable',
    diagnosis: 'Hypertension',
    admissionDate: '2026-10-01',
    ...overrides,
  };
}

export async function createDoctor(overrides: Record<string, unknown> = {}) {
  return new Doctor(doctorInput(overrides)).save();
}

export async function createPatient(
  doctorId: Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return new Patient({ ...patientInput(overrides), doctor: doctorId }).save();
}
