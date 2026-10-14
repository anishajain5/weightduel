/** Entry dates are plain "YYYY-MM-DD" strings in the user's local calendar. */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The user's current calendar date in their time zone (falls back to UTC for a bad zone). */
export function todayInTz(tz: string, now: Date = new Date()): string {
  const zone = isValidTimezone(tz) ? tz : "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b - a). Both are calendar dates, so DST never matters. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const MAX_BACKFILL_DAYS = 14;

/** Valid log dates: not in the future, and at most 14 days back (4.6). */
export function checkLogDate(date: string, today: string): "ok" | "future" | "too_old" | "invalid" {
  if (!isValidDateStr(date)) return "invalid";
  if (date > today) return "future";
  if (daysBetween(date, today) > MAX_BACKFILL_DAYS) return "too_old";
  return "ok";
}

/**
 * Streak = consecutive days with any entry (FR-LOG-5). It stays alive through today:
 * if you haven't logged yet today, yesterday's run still counts.
 */
export function computeStreak(entryDates: Iterable<string>, today: string): number {
  const set = new Set(entryDates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
