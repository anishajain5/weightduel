import { describe, expect, it } from "vitest";
import { computePatterns, habitEffect, scoreBand, weekStartOf, weeklyTable, type DayEntry } from "./index";

const e = (date: string, weightKg: number | null, o: Partial<DayEntry> = {}): DayEntry => ({
  date, weightKg, ate: null, moved: null, slept: null, intent: null, mood: null, ...o,
});

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-10-14")).toBe("2026-10-12"); // Wednesday
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12"); // Monday
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12"); // Sunday
  });
});

describe("scoreBand", () => {
  it("bands 0-1 poor, 2-3 mid, 4-5 good", () => {
    expect([0, 1, 2, 3, 4, 5].map(scoreBand)).toEqual(["poor", "poor", "mid", "mid", "good", "good"]);
  });
});

describe("habitEffect", () => {
  // Days that "moved" are followed by -0.3 kg/day; skipped days by +0.1 kg/day.
  const entries = [
    e("2026-10-01", 80.0, { moved: true }),
    e("2026-10-02", 79.7, { moved: true }),
    e("2026-10-03", 79.4, { moved: true }),
    e("2026-10-04", 79.1, { moved: false }),
    e("2026-10-05", 79.2, { moved: false }),
    e("2026-10-06", 79.3, { moved: false }),
    e("2026-10-07", 79.4, { moved: null }),
  ];
  it("compares average daily change after doing vs skipping the habit", () => {
    const r = habitEffect(entries, "moved");
    expect(r.avgDid).toBeCloseTo(-0.3, 2);
    expect(r.avgSkipped).toBeCloseTo(0.1, 2);
    expect(r.gapKgPerWeek).toBe(2.8); // (0.1 - -0.3) * 7
    expect(r.verdict).toBe("good");
    expect(r.hitRate).toBeCloseTo(0.5, 5); // 3 true of 6 answered
  });
  it("needs at least 2 pairs on each side", () => {
    expect(habitEffect(entries.slice(0, 4), "moved").verdict).toBe("need_more");
    expect(habitEffect(entries, "ate")).toMatchObject({ verdict: "need_more", hitRate: null });
  });
  it("ignores pairs more than 4 days apart", () => {
    const sparse = [e("2026-10-01", 80, { ate: true }), e("2026-10-10", 70, { ate: true }), e("2026-10-11", 70, { ate: false }), e("2026-10-20", 60, { ate: false })];
    expect(habitEffect(sparse, "ate").verdict).toBe("need_more");
  });
  it("calls tiny gaps 'small' and negative gaps 'none'", () => {
    const flat = (did: number, skip: number) => [
      e("2026-10-01", 80, { ate: true }), e("2026-10-02", 80 + did, { ate: true }), e("2026-10-03", 80 + 2 * did, { ate: false }),
      e("2026-10-04", 80 + 2 * did + skip, { ate: false }), e("2026-10-05", 80 + 2 * did + 2 * skip, { ate: false }),
    ];
    // pairs: d1->d2 (did), d2->d3 (did), d3->d4 (skip), d4->d5 (skip)
    expect(habitEffect(flat(0, 0.01), "ate").verdict).toBe("small");
    expect(habitEffect(flat(0.2, -0.2), "ate").verdict).toBe("none"); // doing it was followed by gains
  });
});

describe("weeklyTable", () => {
  it("computes days logged, consistency and week-over-week change", () => {
    const rows = weeklyTable([
      e("2026-10-05", 81, { ate: true, moved: true }), // Mon wk1: score 2
      e("2026-10-07", 80.5, { ate: true, moved: false, mood: 4 }), // Wed wk1: score 2
      e("2026-10-12", 79.5, { ate: true }), // Mon wk2: score 1
      e("2026-10-13", null), // wk2: no score
    ]);
    expect(rows).toEqual([
      { weekStart: "2026-10-05", daysLogged: 2, consistency: 0.4, changeKg: null }, // 4 / (2*5)
      { weekStart: "2026-10-12", daysLogged: 2, consistency: 0.2, changeKg: -1 }, // 1/5 ; 79.5 - 80.5
    ]);
  });
});

describe("computePatterns", () => {
  it("restricts to the range and builds the overlay series", () => {
    const p = computePatterns([e("2026-09-01", 90), e("2026-10-01", 80, { ate: true, mood: 5 }), e("2026-10-02", null)], "2026-10-01", "2026-10-31");
    expect(p.days).toEqual([{ date: "2026-10-01", weightKg: 80, score: 2 }, { date: "2026-10-02", weightKg: null, score: null }]);
    expect(p.daysLogged).toBe(2);
    expect(p.habits).toHaveLength(4);
  });
});
