import { z } from 'zod';
import { endOfDay, isoDate } from '../../lib/schemas.js';

export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

const MAX_SPAN_MS = 3 * 366 * 86_400_000;

export const overviewQuery = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional().transform((d) => (d ? endOfDay(d) : d)),
    granularity: z.enum(GRANULARITIES).optional(),
  })
  .transform(({ from, to, granularity }) => {
    const end = to ?? endOfDay(new Date());
    const start =
      from ?? new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
    return { from: start, to: end, granularity };
  })
  .superRefine((v, ctx) => {
    if (v.from > v.to)
      ctx.addIssue({ code: 'custom', path: ['from'], message: '"from" must be before "to"' });
    if (v.to.getTime() - v.from.getTime() > MAX_SPAN_MS) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Date range cannot exceed 3 years' });
    }
  });
export type OverviewQuery = z.infer<typeof overviewQuery>;
