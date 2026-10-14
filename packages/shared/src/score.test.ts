import { describe, expect, it } from "vitest";
import { allowedModes, dailyScore, progress, viewPermission } from "./index";

const e = (o: Partial<Parameters<typeof dailyScore>[0]> = {}) => ({ ate: null, moved: null, slept: null, intent: null, mood: null, ...o });

describe("dailyScore", () => {
  it("is null when nothing was filled in", () => expect(dailyScore(e())).toBeNull());
  it("counts true habits, plus 1 for mood >= 4", () => {
    expect(dailyScore(e({ ate: true, moved: false, slept: true }))).toBe(2);
    expect(dailyScore(e({ ate: true, mood: 4 }))).toBe(2);
    expect(dailyScore(e({ ate: true, moved: true, slept: true, intent: true, mood: 5 }))).toBe(5);
    expect(dailyScore(e({ mood: 3 }))).toBe(0);
  });
});

describe("progress", () => {
  it("is positive when weight dropped", () => expect(progress(100, 95)).toEqual({ lostKg: 5, pctLost: 5 }));
  it("is negative when weight rose", () => expect(progress(80, 82).pctLost).toBe(-2.5));
});

describe("allowedModes", () => {
  it("hides weight and the non-scoring metric under pct_only", () => {
    expect(allowedModes("pct_only", "pct")).toEqual(["pct"]);
    expect(allowedModes("pct_only", "abs")).toEqual(["lost"]);
    expect(allowedModes("actual", "pct")).toEqual(["lost", "pct", "weight"]);
  });
});

describe("viewPermission", () => {
  const base = { viewerId: "a", subjectId: "b", viewerIsMember: true, subjectIsMember: true, privacy: "pct_only" as const, photosVisible: true };
  it("always lets you see yourself", () => {
    expect(viewPermission({ ...base, subjectId: "a", viewerIsMember: false, subjectIsMember: false })).toMatchObject({ allowed: true, weights: true, patterns: true });
  });
  it("denies non-members and former members", () => {
    expect(viewPermission({ ...base, viewerIsMember: false }).allowed).toBe(false);
    expect(viewPermission({ ...base, subjectIsMember: false }).allowed).toBe(false);
  });
  it("hides weights and patterns under pct_only", () => {
    expect(viewPermission(base)).toEqual({ allowed: true, weights: false, photos: true, patterns: false });
  });
  it("shows weights and patterns under actual, photos follow the group switch", () => {
    expect(viewPermission({ ...base, privacy: "actual", photosVisible: false })).toEqual({ allowed: true, weights: true, photos: false, patterns: true });
  });
});
