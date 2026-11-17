/** Lower-cases and strips diacritics so "José" and "jose" share one index key. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapes user input so it can be embedded in a RegExp literally. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Anchored prefix regex. An anchored, case-sensitive regex on a normalized field
 * can be answered with an index range scan (IXSCAN) instead of a collection scan.
 */
export function prefixRegex(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}`);
}
