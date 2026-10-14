export type Unit = "kg" | "lb";

const LB_PER_KG = 2.2046226218;

/** Weight is stored canonically in kg with 1 decimal (FR-LOG-2). */
export const MIN_KG = 25;
export const MAX_KG = 300;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function toKg(value: number, unit: Unit): number {
  return round1(unit === "kg" ? value : value / LB_PER_KG);
}

export function fromKg(kg: number, unit: Unit): number {
  return round1(unit === "kg" ? kg : kg * LB_PER_KG);
}

export function isValidKg(kg: number): boolean {
  return Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG;
}
