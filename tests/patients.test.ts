import { beforeEach, describe, expect, it } from 'vitest';
import { api, createDoctor, createPatient, loginCookie, ORIGIN } from './helpers.js';

let cookie: string;
beforeEach(async () => {
  cookie = await loginCookie();
});

const get = (path: string) => api().get(path).set('Cookie', cookie);
const patch = (path: string, body: object) =>
  api().patch(path).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

describe('GET /patients', () => {
  it('filters by condition, gender, doctor, age and admission date', async () => {
    const [d1, d2] = await Promise.all([createDoctor(), createDoctor()]);
    await Promise.all([
      createPatient(d1._id, {
        condition: 'critical',
        gender: 'male',
        age: 70,
        admissionDate: '2026-09-10',
      }),
      createPatient(d1._id, {
        condition: 'stable',
        gender: 'female',
        age: 30,
        admissionDate: '2026-10-10',
      }),
      createPatient(d2._id, {
        condition: 'critical',
        gender: 'female',
        age: 55,
        admissionDate: '2026-11-10',
      }),
    ]);

    const total = async (qs: string) =>
      (await get(`/api/v1/patients?${qs}`).expect(200)).body.meta.total;

    expect(await total('condition=critical')).toBe(2);
    expect(await total('condition=critical&gender=female')).toBe(1);
    expect(await total(`doctor=${d1.id}`)).toBe(2);
    expect(await total('minAge=50&maxAge=60')).toBe(1);
    expect(await total('from=2026-10-01&to=2026-10-31')).toBe(1);
    expect(await total('to=2026-10-10')).toBe(2); // "to" is inclusive of the whole day
  });

  it('sorts by admission date (default newest first) and embeds the doctor', async () => {
    const doctor = await createDoctor();
    await createPatient(doctor._id, { name: 'Older Case', admissionDate: '2026-01-01' });
    await createPatient(doctor._id, { name: 'Newer Case', admissionDate: '2026-06-01' });

    const res = await get('/api/v1/patients').expect(200);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual([
      'Newer Case',
      'Older Case',
    ]);
    expect(res.body.data[0].doctor).toEqual({
      id: doctor.id,
      name: doctor.name,
      specialization: doctor.specialization,
    });

    const az = await get('/api/v1/patients?sort=name_asc').expect(200);
    expect(az.body.data[0].name).toBe('Newer Case');
  });

  it('searches name, diagnosis and phone', async () => {
    const doctor = await createDoctor();
    await createPatient(doctor._id, {
      name: 'Nusrat Jahan',
      diagnosis: 'Type 2 diabetes',
      phone: '+1 646 555 0101',
    });
    await createPatient(doctor._id, { name: 'Tom Baker', diagnosis: 'Asthma' });

    const names = async (q: string) =>
      (await get(`/api/v1/patients?q=${encodeURIComponent(q)}`)).body.data.map(
        (p: { name: string }) => p.name,
      );

    expect(await names('jah')).toEqual(['Nusrat Jahan']);
    expect(await names('diab')).toEqual(['Nusrat Jahan']);
    expect(await names('1646')).toEqual(['Nusrat Jahan']);
    expect(await names('nusrat asthma')).toEqual([]);
  });
});

describe('PATCH /patients/:id', () => {
  it('updates fields, keeps search tokens in sync and can reassign the doctor', async () => {
    const [d1, d2] = await Promise.all([createDoctor(), createDoctor()]);
    const patient = await createPatient(d1._id, { name: 'Initial Name' });

    const res = await patch(`/api/v1/patients/${patient.id}`, {
      name: 'Renamed Person',
      condition: 'recovering',
      doctor: d2.id,
    }).expect(200);
    expect(res.body.data).toMatchObject({ name: 'Renamed Person', condition: 'recovering' });
    expect(res.body.data.doctor.id).toBe(d2.id);

    expect((await get('/api/v1/patients?q=renamed')).body.meta.total).toBe(1);
    expect((await get('/api/v1/patients?q=initial')).body.meta.total).toBe(0);
  });

  it('clears optional fields when an empty string is sent', async () => {
    const doctor = await createDoctor();
    const patient = await createPatient(doctor._id, { email: 'old@x.dev', notes: 'Something' });
    const res = await patch(`/api/v1/patients/${patient.id}`, { email: '', notes: '' }).expect(200);
    expect(res.body.data.email).toBeNull();
    expect(res.body.data.notes).toBeNull();
  });

  it('validates input and rejects empty updates', async () => {
    const doctor = await createDoctor();
    const patient = await createPatient(doctor._id);
    await patch(`/api/v1/patients/${patient.id}`, {}).expect(400);
    const res = await patch(`/api/v1/patients/${patient.id}`, {
      age: -4,
      condition: 'zombie',
    }).expect(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'age',
      'condition',
    ]);
    await patch(`/api/v1/patients/${patient.id}`, { doctor: '6650f0f0f0f0f0f0f0f0f0f0' }).expect(
      404,
    );
  });
});

describe('DELETE /patients/:id', () => {
  it('deletes and then 404s', async () => {
    const doctor = await createDoctor();
    const patient = await createPatient(doctor._id);
    await api().delete(`/api/v1/patients/${patient.id}`).set('Cookie', cookie).expect(204);
    await api().delete(`/api/v1/patients/${patient.id}`).set('Cookie', cookie).expect(404);
  });
});
