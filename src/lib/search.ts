import { normalizeText, prefixRegex } from './normalize.js';

const MAX_TERMS = 5;

/** Splits free text into normalized word tokens. */
export function wordTokens(...parts: Array<string | null | undefined>): string[] {
  return parts
    .filter((p): p is string => Boolean(p))
    .flatMap((p) => normalizeText(p).split(/[^\p{L}\p{N}]+/u))
    .filter(Boolean);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Builds the multikey `searchTokens` array stored on each document:
 * every name/keyword word, the full lowercase email, and the phone digits.
 * A single multikey index on this array serves "starts-with" search across all of them.
 */
export function buildSearchTokens(input: {
  words: Array<string | null | undefined>;
  emails?: Array<string | null | undefined>;
  phones?: Array<string | null | undefined>;
}): string[] {
  const tokens = new Set<string>(wordTokens(...input.words));
  for (const email of input.emails ?? []) if (email) tokens.add(email.trim().toLowerCase());
  for (const phone of input.phones ?? []) {
    const digits = phone ? digitsOnly(phone) : '';
    if (digits) tokens.add(digits);
  }
  return [...tokens];
}

/**
 * Turns a user query into an index-friendly filter: each whitespace-separated term must
 * prefix-match at least one token ("jo smi" → name "John Smith").
 * Anchored regexes on the multikey index resolve to bounded IXSCAN ranges.
 */
export function searchTokensFilter(
  q: string | undefined,
): { searchTokens: { $all: RegExp[] } } | undefined {
  if (!q) return undefined;
  const terms = q
    .trim()
    .split(/\s+/)
    .map((term) => {
      if (term.includes('@')) return term.toLowerCase();
      if (/^[\d()+\-.]+$/.test(term)) return digitsOnly(term);
      return normalizeText(term).replace(/[^\p{L}\p{N}]+/gu, '');
    })
    .filter(Boolean)
    .slice(0, MAX_TERMS);
  // A query made only of symbols matches nothing (rather than silently matching everything).
  return { searchTokens: { $all: terms.map(prefixRegex) } };
}
