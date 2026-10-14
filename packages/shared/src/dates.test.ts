import { describe, expect, it } from "vitest";
import { addDays, checkLogDate, computeStreak, daysBetween, isValidDateStr, todayInTz } from "./dates";
import { bmi, goalWeightWarning } from "./body";

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDateStr("2026-02-28")).toBe(true);
    expect(isValidDateStr("2026-02-30")).toBe(false);
    expect(isValidDateStr("26-1-1")).toBe(false);
  });
  it("computes 'today' in the user's zone around midnight", () => {
    const t = new Date("2026-10-13T20:30:00Z"); // 02:00 on the 14th in Kolkata, 16:30 on the 13th in New York
    expect(todayInTz("Asia/Kolkata", t)).toBe("2026-10-14");
    expect(todayInTz("America/New_York", t)).toBe("2026-10-13");
    expect(todayInTz("Not/AZone", t)).toBe("2026-10-13");
  });
  it("handles DST changes (calendar math, not 24h blocks)", () => {
    // US clocks go back on 2026-11-01; the 25-hour day must still be one day.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    const justBefore = new Date("2026-11-02T04:59:00Z"); // 23:59 EST on Nov 1
    expect(todayInTz("America/New_York", justBefore)).toBe("2026-11-01");
    expect(todayInTz("America/New_York", new Date("2026-11-02T05:01:00Z"))).toBe("2026-11-02");
  });
  it("limits log dates to today and 14 days back", () => {
    const today = "2026-10-14";
    expect(checkLogDate("2026-10-14", today)).toBe("ok");
    expect(checkLogDate("2026-09-30", today)).toBe("ok");
    expect(checkLogDate("2026-09-29", today)).toBe("too_old");
    expect(checkLogDate("2026-10-15", today)).toBe("future");
    expect(checkLogDate("nope", today)).toBe("invalid");
  });
});

describe("streak", () => {
  const today = "2026-10-14";
  it("counts consecutive days through today", () => {
    expect(computeStreak(["2026-10-14", "2026-10-13", "2026-10-12"], today)).toBe(3);
  });
  it("stays alive if today isn't logged yet", () => {
    expect(computeStreak(["2026-10-13", "2026-10-12"], today)).toBe(2);
  });
  it("breaks on a gap and is zero when stale", () => {
    expect(computeStreak(["2026-10-14", "2026-10-12"], today)).toBe(1);
    expect(computeStreak(["2026-10-10"], today)).toBe(0);
    expect(computeStreak([], today)).toBe(0);
  });
});

describe("goal weight guardrail", () => {
  it("warns below BMI 18.5 only when height is known", () => {
    expect(bmi(60, 170)).toBe(20.8);
    expect(goalWeightWarning(50, 170)).toMatch(/below the healthy range/);
    expect(goalWeightWarning(60, 170)).toBeNull();
    expect(goalWeightWarning(40, null)).toBeNull();
  });
});
