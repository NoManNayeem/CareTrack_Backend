const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Parses "90s" | "15m" | "8h" | "7d" into milliseconds. */
export function parseDuration(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) throw new Error(`Invalid duration "${value}" — expected e.g. "8h" or "7d"`);
  return Number(match[1]) * UNITS[match[2]!.toLowerCase()]!;
}
