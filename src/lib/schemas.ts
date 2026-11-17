import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine((v) => isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), {
  error: 'Invalid id',
});

export const idParams = z.object({ id: objectId });

/** Accepts YYYY-MM-DD or a full ISO timestamp. */
export const isoDate = z.coerce.date({ error: 'Invalid date' });

/** Optional trimmed search string; empty strings are treated as "no search". */
export const searchTerm = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Comma separated or repeated query params → string[] */
export function listOf<T extends z.ZodType<string, string>>(item: T) {
  const array = z.array(item).optional() as unknown as z.ZodType<
    Array<z.output<T>> | undefined,
    string[] | undefined
  >;
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const list = (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean);
      return list.length ? list : undefined;
    })
    .pipe(array);
}

export const phone = z
  .string()
  .trim()
  .min(7, { error: 'Phone number is too short', abort: true })
  .max(20, { error: 'Phone number is too long' })
  .regex(/^\+?[\d\s\-()]+$/, {
    error: 'Phone number may only contain digits, spaces, +, - and ()',
  });

export const personName = z
  .string()
  .trim()
  .min(2, { error: 'Name must be at least 2 characters' })
  .max(80, { error: 'Name must be at most 80 characters' });

/** Shared date-range refinement for list queries. */
export function refineDateRange<T extends { from?: Date; to?: Date }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['from'], message: '"from" must be before "to"' });
  }
}

/** Make an inclusive end-of-day bound when the client sends a plain date. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    d.setUTCHours(23, 59, 59, 999);
  }
  return d;
}
