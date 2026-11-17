import { Doctor } from '../doctors/doctor.model.js';
import { CONDITIONS, type Condition } from '../patients/patient.constants.js';
import { Patient } from '../patients/patient.model.js';
import type { Granularity, OverviewQuery } from './analytics.schema.js';
import { autoGranularity, bucketRange } from './time-buckets.js';

const AGE_BOUNDARIES = [0, 18, 30, 45, 60, 75, 131];
const AGE_LABELS = ['0–17', '18–29', '30–44', '45–59', '60–74', '75+'];

export interface Overview {
  range: { from: Date; to: Date; previousFrom: Date; previousTo: Date; granularity: Granularity };
  totals: {
    doctors: number;
    patients: number;
    critical: number;
    admissions: number;
    previousAdmissions: number;
    doctorsAdded: number;
    avgPatientsPerDoctor: number;
  };
  byCondition: Array<{ condition: Condition; count: number }>;
  timeline: Array<{ date: Date; admissions: number; critical: number; doctorsAdded: number }>;
  topDoctors: Array<{ id: string; name: string; specialization: string; patients: number }>;
  bySpecialization: Array<{ specialization: string; doctors: number; patients: number }>;
  ageBands: Array<{ band: string; count: number }>;
}

/**
 * Dashboard aggregation.
 *
 * Deliberately NOT one big $facet: $facet sub-pipelines cannot use indexes, so every
 * facet would run over a full collection scan. Instead each metric is a small,
 * index-backed query and they all run concurrently — total latency ≈ the slowest one.
 */
export async function getOverview(query: OverviewQuery): Promise<Overview> {
  const { from, to } = query;
  const unit = query.granularity ?? autoGranularity(from, to);
  const span = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(from.getTime() - span - 1);
  const inRange = { $gte: from, $lte: to };

  const [
    doctors,
    patients,
    conditionCounts,
    admissions,
    previousAdmissions,
    doctorsAdded,
    patientTimeline,
    doctorTimeline,
    topDoctors,
    specialization,
    ageBands,
  ] = await Promise.all([
    Doctor.estimatedDocumentCount(), // O(1) collection metadata
    Patient.estimatedDocumentCount(),
    // One COUNT_SCAN per condition on { condition: 1, admissionDate: -1 }
    Promise.all(CONDITIONS.map((condition) => Patient.countDocuments({ condition }))),
    Patient.countDocuments({ admissionDate: inRange }),
    Patient.countDocuments({ admissionDate: { $gte: previousFrom, $lte: previousTo } }),
    Doctor.countDocuments({ createdAt: inRange }),
    Patient.aggregate<{ _id: Date; admissions: number; critical: number }>([
      { $match: { admissionDate: inRange } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$admissionDate', unit, startOfWeek: 'monday' } },
          admissions: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$condition', 'critical'] }, 1, 0] } },
        },
      },
    ]),
    Doctor.aggregate<{ _id: Date; count: number }>([
      { $match: { createdAt: inRange } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$createdAt', unit, startOfWeek: 'monday' } },
          count: { $sum: 1 },
        },
      },
    ]),
    Patient.aggregate<{ _id: unknown; name: string; specialization: string; patients: number }>([
      { $sort: { doctor: 1 } }, // lets the planner walk { doctor: 1, … } (covered)
      { $group: { _id: '$doctor', patients: { $sum: 1 } } },
      { $sort: { patients: -1, _id: 1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: Doctor.collection.name,
          localField: '_id',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, specialization: 1 } }],
          as: 'doctor',
        },
      },
      { $unwind: '$doctor' },
      { $project: { patients: 1, name: '$doctor.name', specialization: '$doctor.specialization' } },
    ]),
    Promise.all([
      Doctor.aggregate<{ _id: string; doctors: number }>([
        { $group: { _id: '$specialization', doctors: { $sum: 1 } } },
      ]),
      Patient.aggregate<{ _id: string; patients: number }>([
        { $sort: { doctor: 1 } },
        { $group: { _id: '$doctor', patients: { $sum: 1 } } },
        {
          $lookup: {
            from: Doctor.collection.name,
            localField: '_id',
            foreignField: '_id',
            pipeline: [{ $project: { specialization: 1 } }],
            as: 'doctor',
          },
        },
        { $unwind: '$doctor' },
        { $group: { _id: '$doctor.specialization', patients: { $sum: '$patients' } } },
      ]),
    ]),
    Patient.aggregate<{ _id: number; count: number }>([
      {
        $bucket: {
          groupBy: '$age',
          boundaries: AGE_BOUNDARIES,
          default: 131,
          output: { count: { $sum: 1 } },
        },
      },
    ]),
  ]);

  // ── shape the results ────────────────────────────────────────────────
  const byCondition = CONDITIONS.map((condition, i) => ({
    condition,
    count: conditionCounts[i] ?? 0,
  }));

  const patientBuckets = new Map(patientTimeline.map((b) => [b._id.getTime(), b]));
  const doctorBuckets = new Map(doctorTimeline.map((b) => [b._id.getTime(), b.count]));
  const timeline = bucketRange(from, to, unit).map((date) => {
    const p = patientBuckets.get(date.getTime());
    return {
      date,
      admissions: p?.admissions ?? 0,
      critical: p?.critical ?? 0,
      doctorsAdded: doctorBuckets.get(date.getTime()) ?? 0,
    };
  });

  const [doctorsBySpec, patientsBySpec] = specialization;
  const patientsMap = new Map(patientsBySpec.map((s) => [s._id, s.patients]));
  const bySpecialization = doctorsBySpec
    .map((s) => ({
      specialization: s._id,
      doctors: s.doctors,
      patients: patientsMap.get(s._id) ?? 0,
    }))
    .sort((a, b) => b.patients - a.patients || a.specialization.localeCompare(b.specialization));

  const ageMap = new Map(ageBands.map((b) => [b._id, b.count]));

  return {
    range: { from, to, previousFrom, previousTo, granularity: unit },
    totals: {
      doctors,
      patients,
      critical: byCondition.find((c) => c.condition === 'critical')?.count ?? 0,
      admissions,
      previousAdmissions,
      doctorsAdded,
      avgPatientsPerDoctor: doctors ? Math.round((patients / doctors) * 10) / 10 : 0,
    },
    byCondition,
    timeline,
    topDoctors: topDoctors.map((d) => ({
      id: String(d._id),
      name: d.name,
      specialization: d.specialization,
      patients: d.patients,
    })),
    bySpecialization,
    ageBands: AGE_LABELS.map((band, i) => ({ band, count: ageMap.get(AGE_BOUNDARIES[i]!) ?? 0 })),
  };
}
