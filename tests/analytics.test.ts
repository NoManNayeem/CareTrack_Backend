import { beforeEach, describe, expect, it } from 'vitest';
import {
  autoGranularity,
  bucketRange,
  truncateUtc,
} from '../src/modules/analytics/time-buckets.js';
import { api, createDoctor, createPatient, loginCookie } from './helpers.js';

let cookie: string;
beforeEach(async () => {
  cookie = await loginCookie();
});

describe('GET /analytics/overview', () => {
  it('aggregates totals, condition mix, gap-free timeline, top doctors and specialities', async () => {
    const cardio = await createDoctor({ name: 'Dr. Heart Expert', specialization: 'Cardiology' });
    const neuro = await createDoctor({ name: 'Dr. Brain Expert', specialization: 'Neurology' });
    await Promise.all([
      createPatient(cardio._id, { condition: 'critical', admissionDate: '2026-11-02', age: 70 }),
      createPatient(cardio._id, { condition: 'stable', admissionDate: '2026-11-02', age: 10 }),
      createPatient(cardio._id, { condition: 'stable', admissionDate: '2026-11-05', age: 35 }),
      createPatient(neuro._id, { condition: 'recovering', admissionDate: '2026-10-20', age: 50 }),
    ]);

    const res = await api()
      .get('/api/v1/analytics/overview?from=2026-11-01&to=2026-11-07')
      .set('Cookie', cookie)
      .expect(200);
    const d = res.body.data;

    expect(d.range.granularity).toBe('day');
    expect(d.totals).toMatchObject({
      doctors: 2,
      patients: 4,
      critical: 1,
      admissions: 3,
      previousAdmissions: 0,
    });
    expect(d.byCondition).toContainEqual({ condition: 'stable', count: 2 });

    expect(d.timeline).toHaveLength(7); // one bucket per day, zero-filled
    expect(d.timeline[1]).toMatchObject({
      date: '2026-11-02T00:00:00.000Z',
      admissions: 2,
      critical: 1,
    });
    expect(d.timeline[0].admissions).toBe(0);

    expect(d.topDoctors[0]).toMatchObject({ id: cardio.id, name: 'Dr. Heart Expert', patients: 3 });
    expect(d.bySpecialization[0]).toEqual({
      specialization: 'Cardiology',
      doctors: 1,
      patients: 3,
    });
    expect(d.ageBands.find((b: { band: string }) => b.band === '0–17').count).toBe(1);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
  });

  it('works on an empty database', async () => {
    const res = await api().get('/api/v1/analytics/overview').set('Cookie', cookie).expect(200);
    expect(res.body.data.totals.patients).toBe(0);
    expect(res.body.data.timeline).toHaveLength(30);
  });

  it('validates the range', async () => {
    await api()
      .get('/api/v1/analytics/overview?from=2026-05-01&to=2026-01-01')
      .set('Cookie', cookie)
      .expect(400);
    await api()
      .get('/api/v1/analytics/overview?from=2010-01-01&to=2026-01-01')
      .set('Cookie', cookie)
      .expect(400);
  });
});

describe('time buckets', () => {
  it('truncates weeks to Monday and months to the 1st (UTC)', () => {
    expect(truncateUtc(new Date('2026-11-19T15:00:00Z'), 'week').toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
    expect(truncateUtc(new Date('2026-11-19T15:00:00Z'), 'month').toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });

  it('chooses granularity by span', () => {
    expect(autoGranularity(new Date('2026-01-01'), new Date('2026-01-31'))).toBe('day');
    expect(autoGranularity(new Date('2026-01-01'), new Date('2026-05-01'))).toBe('week');
    expect(autoGranularity(new Date('2025-01-01'), new Date('2026-01-01'))).toBe('month');
  });

  it('produces contiguous buckets', () => {
    const months = bucketRange(new Date('2026-01-15'), new Date('2026-04-02'), 'month');
    expect(months.map((m) => m.toISOString().slice(0, 7))).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });
});
