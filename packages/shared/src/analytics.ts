import { addDays, daysBetween } from "./dates";
import { dailyScore } from "./score";

export type Habit = "ate" | "moved" | "slept" | "intent";
export const HABITS: { key: Habit; label: string }[] = [
  { key: "ate", label: "Ate healthy" },
  { key: "moved", label: "Exercised" },
  { key: "slept", label: "Slept well" },
  { key: "intent", label: "Intentional about choices" },
];

export interface DayEntry {
  date: string;
  weightKg: number | null;
  ate: boolean | null;
  moved: boolean | null;
  slept: boolean | null;
  intent: boolean | null;
  mood: number | null;
}

export type Verdict = "good" | "small" | "none" | "need_more";

export interface HabitRow {
  habit: Habit;
  label: string;
  /** Share of days (with an answer) the habit was true, 0..1. Null if never answered. */
  hitRate: number | null;
  /** Average kg/day change after days you did it / skipped it. Null when not enough pairs. */
  avgDid: number | null;
  avgSkipped: number | null;
  /** (avgSkipped - avgDid) * 7: kg per week the habit is "worth". Positive = good. */
  gapKgPerWeek: number | null;
  verdict: Verdict;
}

export interface WeekRow {
  /** Monday of the week (YYYY-MM-DD). */
  weekStart: string;
  daysLogged: number;
  /** Sum of daily scores / (days with a score * 5), 0..1. Null if no scored days. */
  consistency: number | null;
  /** Last weight of this week minus last weight before it. Null if either is missing. */
  changeKg: number | null;
}

export interface OverlayDay {
  date: string;
  weightKg: number | null;
  score: number | null;
}

export interface Patterns {
  from: string;
  to: string;
  days: OverlayDay[];
  habits: HabitRow[];
  weeks: WeekRow[];
  daysLogged: number;
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Score colour band for the overlay bars: good 4-5, mid 2-3, poor 0-1. */
export const scoreBand = (s: number): "good" | "mid" | "poor" => (s >= 4 ? "good" : s >= 2 ? "mid" : "poor");

/** Monday of the week containing `date` (dates are already in the user's time zone). */
export function weekStartOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/**
 * Next-day change pairs: consecutive weigh-ins 1 to 4 days apart, rate = (w[i+1] - w[i]) / days.
 * Each pair is attributed to the habit answer on the earlier day.
 */
export function habitEffect(entries: DayEntry[], habit: Habit): HabitRow {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const answered = sorted.filter((e) => e[habit] !== null);
  const hitRate = answered.length ? answered.filter((e) => e[habit] === true).length / answered.length : null;

  const weighed = sorted.filter((e) => e.weightKg !== null);
  const did: number[] = [];
  const skipped: number[] = [];
  for (let i = 0; i < weighed.length - 1; i++) {
    const a = weighed[i]!;
    const b = weighed[i + 1]!;
    const gap = daysBetween(a.date, b.date);
    if (gap < 1 || gap > 4 || a[habit] === null) continue;
    const rate = (b.weightKg! - a.weightKg!) / gap;
    (a[habit] ? did : skipped).push(rate);
  }
  const label = HABITS.find((h) => h.key === habit)!.label;
  if (did.length < 2 || skipped.length < 2) {
    return { habit, label, hitRate, avgDid: null, avgSkipped: null, gapKgPerWeek: null, verdict: "need_more" };
  }
  const avgDid = avg(did);
  const avgSkipped = avg(skipped);
  const gap = (avgSkipped - avgDid) * 7;
  return {
    habit,
    label,
    hitRate,
    avgDid: round(avgDid, 3),
    avgSkipped: round(avgSkipped, 3),
    gapKgPerWeek: round(gap, 2),
    verdict: gap > 0.15 ? "good" : gap < -0.15 ? "none" : "small",
  };
}

export function weeklyTable(entries: DayEntry[]): WeekRow[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const byWeek = new Map<string, DayEntry[]>();
  for (const e of sorted) {
    const w = weekStartOf(e.date);
    byWeek.set(w, [...(byWeek.get(w) ?? []), e]);
  }
  const rows: WeekRow[] = [];
  let prevWeight: number | null = null;
  for (const [weekStart, es] of [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const scores = es.map(dailyScore).filter((s): s is number => s !== null);
    const weights = es.filter((e) => e.weightKg !== null);
    const last = weights.length ? weights[weights.length - 1]!.weightKg! : null;
    rows.push({
      weekStart,
      daysLogged: es.length,
      consistency: scores.length ? round(scores.reduce((a, b) => a + b, 0) / (scores.length * 5), 3) : null,
      changeKg: last !== null && prevWeight !== null ? round(last - prevWeight, 1) : null,
    });
    if (last !== null) prevWeight = last;
  }
  return rows;
}

export function computePatterns(entries: DayEntry[], from: string, to: string): Patterns {
  const inRange = entries.filter((e) => e.date >= from && e.date <= to);
  const sorted = [...inRange].sort((a, b) => a.date.localeCompare(b.date));
  return {
    from,
    to,
    days: sorted.map((e) => ({ date: e.date, weightKg: e.weightKg, score: dailyScore(e) })),
    habits: HABITS.map((h) => habitEffect(inRange, h.key)),
    weeks: weeklyTable(inRange),
    daysLogged: inRange.length,
  };
}

export interface PatternsResponse extends Patterns {
  userId: string;
  displayName: string;
  isMe: boolean;
}
