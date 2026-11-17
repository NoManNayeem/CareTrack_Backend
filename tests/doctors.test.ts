import { beforeEach, describe, expect, it } from 'vitest';
import { api, createDoctor, createPatient, doctorInput, loginCookie, ORIGIN } from './helpers.js';

let cookie: string;
beforeEach(async () => {
  cookie = await loginCookie();
});

const get = (path: string) => api().get(path).set('Cookie', cookie);
const post = (path: string, body: object) =>
  api().post(path).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

describe('POST /doctors', () => {
  it('creates a doctor and normalises the email', async () => {
    const res = await post(
      '/api/v1/doctors',
      doctorInput({ email: '  Jane.Doe@Example.COM ' }),
    ).expect(201);
    expect(res.body.data).toMatchObject({ email: 'jane.doe@example.com', patientCount: 0 });
    expect(res.headers.location).toBe(`/api/v1/doctors/${res.body.data.id}`);
    expect(res.body.data.searchTokens).toBeUndefined();
  });

  it('returns field-level validation errors', async () => {
    const res = await post('/api/v1/doctors', {
      name: 'A',
      specialization: 'Astrology',
      phone: 'abc',
    }).expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['email', 'hospital', 'name', 'phone', 'specialization']);
  });

  it('rejects unknown fields', async () => {
    await post('/api/v1/doctors', { ...doctorInput(), role: 'superuser' }).expect(400);
  });

  it('returns 409 for a duplicate email', async () => {
    const input = doctorInput();
    await post('/api/v1/doctors', input).expect(201);
    const res = await post('/api/v1/doctors', {
      ...input,
      email: input.email.toUpperCase(),
    }).expect(409);
    expect(res.body.error.details[0].field).toBe('email');
  });
});

describe('GET /doctors', () => {
  it('paginates with accurate meta and per-row patient counts', async () => {
    const doctors = await Promise.all(Array.from({ length: 12 }, () => createDoctor()));
    await Promise.all([createPatient(doctors[0]!._id), createPatient(doctors[0]!._id)]);

    const res = await get('/api/v1/doctors?limit=5&page=3&sort=oldest').expect(200);
    expect(res.body.meta).toEqual({
      page: 3,
      limit: 5,
      total: 12,
      totalPages: 3,
      hasNextPage: false,
      hasPrevPage: true,
    });
    expect(res.body.data).toHaveLength(2);

    const first = await get('/api/v1/doctors?limit=1&sort=oldest').expect(200);
    expect(first.body.data[0].patientCount).toBe(2);
  });

  it('searches by any name word prefix, email and phone digits', async () => {
    await createDoctor({
      name: 'Dr. Sofía Ramírez',
      email: 'sofia@clinic.dev',
      phone: '+1 (212) 555-0199',
    });
    await createDoctor({ name: 'Dr. Omar Haddad' });

    const byLastName = await get('/api/v1/doctors?q=rami').expect(200);
    expect(byLastName.body.data.map((d: { name: string }) => d.name)).toEqual([
      'Dr. Sofía Ramírez',
    ]);

    const accentInsensitive = await get('/api/v1/doctors?q=sofia%20ram').expect(200);
    expect(accentInsensitive.body.meta.total).toBe(1);

    expect((await get('/api/v1/doctors?q=sofia@cl').expect(200)).body.meta.total).toBe(1);
    expect((await get('/api/v1/doctors?q=1212555').expect(200)).body.meta.total).toBe(1);
    expect((await get('/api/v1/doctors?q=.*').expect(200)).body.meta.total).toBe(0); // regex-escaped
  });

  it('filters by specialization, hospital and created date', async () => {
    await createDoctor({ specialization: 'Neurology', hospital: 'Harborview Health' });
    await createDoctor({ specialization: 'Oncology', hospital: 'Harborview Health' });
    await createDoctor({ specialization: 'Neurology', hospital: 'Lakeview University Hospital' });

    const neuro = await get('/api/v1/doctors?specialization=Neurology').expect(200);
    expect(neuro.body.meta.total).toBe(2);

    const combined = await get(
      '/api/v1/doctors?specialization=Neurology,Oncology&hospital=Harborview%20Health',
    );
    expect(combined.body.meta.total).toBe(2);

    const future = await get('/api/v1/doctors?from=2999-01-01').expect(200);
    expect(future.body.meta.total).toBe(0);

    const today = new Date().toISOString().slice(0, 10);
    const inclusive = await get(`/api/v1/doctors?from=${today}&to=${today}`).expect(200);
    expect(inclusive.body.meta.total).toBe(3);
  });

  it('rejects invalid query parameters', async () => {
    const res = await get('/api/v1/doctors?limit=1000&sort=random').expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['limit', 'sort']);

    // Cross-field rules run once the individual fields are valid
    const range = await get('/api/v1/doctors?from=2026-02-01&to=2026-01-01').expect(400);
    expect(range.body.error.details[0]).toMatchObject({ location: 'query', field: 'from' });
  });
});

describe('GET /doctors/:id and facets', () => {
  it('returns the profile with condition stats', async () => {
    const doctor = await createDoctor();
    await createPatient(doctor._id, { condition: 'critical', admissionDate: '2026-09-01' });
    await createPatient(doctor._id, { condition: 'stable', admissionDate: '2026-10-15' });

    const res = await get(`/api/v1/doctors/${doctor.id}`).expect(200);
    expect(res.body.data.stats.totalPatients).toBe(2);
    expect(res.body.data.stats.byCondition).toMatchObject({
      critical: 1,
      stable: 1,
      discharged: 0,
    });
    expect(res.body.data.stats.lastAdmissionAt).toBe('2026-10-15T00:00:00.000Z');
  });

  it('404s for unknown ids and 400s for malformed ids', async () => {
    await get('/api/v1/doctors/6650f0f0f0f0f0f0f0f0f0f0').expect(404);
    await get('/api/v1/doctors/not-an-id').expect(400);
  });

  it('lists distinct hospitals for the filter UI', async () => {
    await createDoctor({ hospital: 'B Hospital' });
    await createDoctor({ hospital: 'A Hospital' });
    await createDoctor({ hospital: 'A Hospital' });
    const res = await get('/api/v1/doctors/facets').expect(200);
    expect(res.body.data.hospitals).toEqual(['A Hospital', 'B Hospital']);
    expect(res.body.data.specializations).toContain('Cardiology');
  });
});

describe("a doctor's patients", () => {
  it('adds, lists and removes patients under a doctor', async () => {
    const doctor = await createDoctor();
    const created = await post(`/api/v1/doctors/${doctor.id}/patients`, {
      name: 'Rafi Ahmed',
      age: 33,
      gender: 'male',
      phone: '+880 1711 000000',
      email: '',
      condition: 'under_observation',
      diagnosis: 'Migraine',
      admissionDate: '2026-11-01',
    }).expect(201);
    expect(created.body.data.doctor).toMatchObject({ id: doctor.id, name: doctor.name });
    expect(created.body.data.email).toBeNull();

    const list = await get(`/api/v1/doctors/${doctor.id}/patients`).expect(200);
    expect(list.body.meta.total).toBe(1);

    await api()
      .delete(`/api/v1/doctors/${doctor.id}/patients/${created.body.data.id}`)
      .set('Cookie', cookie)
      .expect(204);
    expect((await get(`/api/v1/doctors/${doctor.id}/patients`)).body.meta.total).toBe(0);
  });

  it("refuses to delete another doctor's patient", async () => {
    const [a, b] = await Promise.all([createDoctor(), createDoctor()]);
    const patient = await createPatient(b._id);
    await api()
      .delete(`/api/v1/doctors/${a.id}/patients/${patient.id}`)
      .set('Cookie', cookie)
      .expect(404);
    expect((await get(`/api/v1/patients/${patient.id}`)).status).toBe(200);
  });

  it('404s when adding a patient to an unknown doctor', async () => {
    const res = await post('/api/v1/doctors/6650f0f0f0f0f0f0f0f0f0f0/patients', {
      name: 'Nobody Here',
      age: 30,
      gender: 'female',
      phone: '+1 555 123 4567',
      condition: 'stable',
      diagnosis: 'Influenza',
      admissionDate: '2026-11-01',
    });
    expect(res.status).toBe(404);
  });
});
