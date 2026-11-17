import type { Granularity } from './analytics.schema.js';

const DAY = 86_400_000;

/** Mirrors MongoDB's $dateTrunc (UTC, weeks start on Monday). */
export function truncateUtc(date: Date, unit: Granularity): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  if (unit === 'month') return new Date(Date.UTC(y, m, 1));
  const day = new Date(Date.UTC(y, m, d));
  if (unit === 'week') {
    const offset = (day.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(day.getTime() - offset * DAY);
  }
  return day;
}

export function addUnit(date: Date, unit: Granularity): Date {
  if (unit === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return new Date(date.getTime() + (unit === 'week' ? 7 : 1) * DAY);
}

/** Picks a readable bucket size: ≤ ~62 points on the chart. */
export function autoGranularity(from: Date, to: Date): Granularity {
  const days = (to.getTime() - from.getTime()) / DAY;
  if (days <= 62) return 'day';
  if (days <= 210) return 'week';
  return 'month';
}

/** Every bucket start between from and to, so charts have no gaps. */
export function bucketRange(from: Date, to: Date, unit: Granularity): Date[] {
  const buckets: Date[] = [];
  for (let cursor = truncateUtc(from, unit); cursor <= to; cursor = addUnit(cursor, unit)) {
    buckets.push(cursor);
  }
  return buckets;
}
