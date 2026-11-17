/**
 * Guards the indexing strategy: the hot list/search/filter queries must be answered by an
 * index scan, and sorted list queries must take their order from the index (no blocking SORT).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Types } from 'mongoose';
import { Doctor } from '../src/modules/doctors/doctor.model.js';
import { buildDoctorFilter } from '../src/modules/doctors/doctor.service.js';
import { Patient } from '../src/modules/patients/patient.model.js';
import { buildPatientFilter } from '../src/modules/patients/patient.service.js';
import { createDoctor, createPatient } from './helpers.js';

type Stage = { stage: string; inputStage?: Stage; inputStages?: Stage[]; indexName?: string };

function stages(plan: Stage): Stage[] {
  return [
    plan,
    ...(plan.inputStage ? stages(plan.inputStage) : []),
    ...(plan.inputStages ?? []).flatMap(stages),
  ];
}

async function plan(query: { explain: (v: string) => Promise<unknown> }) {
  const explained = (await query.explain('queryPlanner')) as {
    queryPlanner: { winningPlan: Stage };
  };
  const winning = explained.queryPlanner.winningPlan;
  const all = stages((winning as { queryPlan?: Stage }).queryPlan ?? winning);
  return { names: all.map((s) => s.stage), indexes: all.map((s) => s.indexName).filter(Boolean) };
}

let doctorId: Types.ObjectId;

beforeEach(async () => {
  const doctors = await Promise.all(Array.from({ length: 10 }, () => createDoctor()));
  doctorId = doctors[0]!._id;
  await Promise.all(
    doctors.flatMap((d, i) =>
      Array.from({ length: 5 }, (_, j) =>
        createPatient(d._id, {
          condition: ['stable', 'critical', 'recovering'][j % 3],
          admissionDate: new Date(Date.UTC(2026, i % 12, j + 1)).toISOString(),
        }),
      ),
    ),
  );
});

const cases: Array<[string, () => { explain: (v: string) => Promise<unknown> }, string]> = [
  [
    'doctors: default newest-first list',
    () => Doctor.find({}).sort({ createdAt: -1, _id: -1 }).limit(10),
    'createdAt_-1__id_-1',
  ],
  [
    'doctors: specialization + date range, newest first',
    () =>
      Doctor.find(
        buildDoctorFilter({ specialization: ['Cardiology'], from: new Date('2020-01-01') }),
      )
        .sort({ createdAt: -1 })
        .limit(10),
    'specialization_1_createdAt_-1',
  ],
  [
    'doctors: A→Z',
    () => Doctor.find({}).sort({ nameNormalized: 1, _id: 1 }).limit(10),
    'nameNormalized_1__id_1',
  ],
  [
    'patients: default list',
    () => Patient.find({}).sort({ admissionDate: -1, _id: -1 }).limit(10),
    'admissionDate_-1__id_-1',
  ],
  [
    "patients: a doctor's patients, newest first",
    () =>
      Patient.find(buildPatientFilter({}, doctorId.toString()))
        .sort({ admissionDate: -1 })
        .limit(10),
    'doctor_1_admissionDate_-1',
  ],
  [
    'patients: condition + date range',
    () =>
      Patient.find(
        buildPatientFilter({
          condition: ['critical'],
          from: new Date('2026-01-01'),
          to: new Date('2026-12-31'),
        }),
      )
        .sort({ admissionDate: -1 })
        .limit(10),
    'condition_1_admissionDate_-1',
  ],
];

describe('query plans', () => {
  it.each(cases)('%s → IXSCAN, no in-memory SORT', async (_name, query, expectedIndex) => {
    const { names, indexes } = await plan(query());
    expect(names).toContain('IXSCAN');
    expect(names).not.toContain('COLLSCAN');
    expect(names).not.toContain('SORT');
    expect(indexes).toContain(expectedIndex);
  });

  it('search uses the multikey searchTokens index', async () => {
    const { names, indexes } = await plan(
      Patient.find(buildPatientFilter({ q: 'patient num' })).limit(10),
    );
    expect(names).not.toContain('COLLSCAN');
    expect(indexes).toContain('searchTokens_1');
  });

  it('counting a single condition is an index-only COUNT_SCAN', async () => {
    const explained = (await Patient.collection
      .find({ condition: 'critical' })
      .explain('queryPlanner')) as { queryPlanner: { winningPlan: Stage } };
    const names = stages(explained.queryPlanner.winningPlan).map((s) => s.stage);
    expect(names).not.toContain('COLLSCAN');
  });
});
