import { describe, expect, it } from "vitest";
import { fromKg, isValidKg, toKg } from "./units";

describe("units", () => {
  it("converts lb to kg with 1 decimal", () => {
    expect(toKg(180, "lb")).toBe(81.6);
    expect(toKg(80, "kg")).toBe(80);
  });
  it("converts kg to lb", () => {
    expect(fromKg(81.6, "lb")).toBe(179.9);
  });
  it("validates range 25-300 kg", () => {
    expect(isValidKg(24.9)).toBe(false);
    expect(isValidKg(25)).toBe(true);
    expect(isValidKg(300.1)).toBe(false);
  });
});
