export interface HabitEntry {
  ate: boolean | null;
  moved: boolean | null;
  slept: boolean | null;
  intent: boolean | null;
  mood: number | null;
}

/** Daily score: count of true habits, +1 if mood >= 4. Null if nothing was filled in. */
export function dailyScore(e: HabitEntry): number | null {
  const habits = [e.ate, e.moved, e.slept, e.intent];
  if (habits.every((h) => h === null) && e.mood === null) return null;
  return habits.filter((h) => h === true).length + (e.mood !== null && e.mood >= 4 ? 1 : 0);
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Progress against a baseline. Positive = lost weight. */
export function progress(baselineKg: number, currentKg: number): { lostKg: number; pctLost: number } {
  return { lostKg: round(baselineKg - currentKg, 1), pctLost: round(((baselineKg - currentKg) / baselineKg) * 100, 2) };
}

export interface Viewer {
  /** Active member of the group? */
  isMember: boolean;
}
export interface Permission {
  allowed: boolean;
  weights: boolean;
  photos: boolean;
  /** Habit/pattern data (BRD 4.8: only when group shows actual weights, or it's yourself). */
  patterns: boolean;
}
const NONE: Permission = { allowed: false, weights: false, photos: false, patterns: false };

/**
 * Pure core of canView(viewer, subject, groupId): the viewer can see the subject only if
 * they are the subject, or both are active members of the group; what they see depends on the group's settings.
 * Notes are never visible to anyone but the owner of the entry, regardless of this result.
 */
export function viewPermission(opts: {
  viewerId: string;
  subjectId: string;
  viewerIsMember: boolean;
  subjectIsMember: boolean;
  privacy: "pct_only" | "actual";
  photosVisible: boolean;
}): Permission {
  if (opts.viewerId === opts.subjectId) return { allowed: true, weights: true, photos: true, patterns: true };
  if (!opts.viewerIsMember || !opts.subjectIsMember) return NONE;
  const actual = opts.privacy === "actual";
  return { allowed: true, weights: actual, photos: opts.photosVisible, patterns: actual };
}
