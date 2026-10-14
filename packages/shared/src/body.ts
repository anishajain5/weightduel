/** BMI from kg and cm; null when height is missing or implausible. */
export function bmi(weightKg: number, heightCm: number | null | undefined): number | null {
  if (!heightCm || heightCm < 90 || heightCm > 250) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export const UNDERWEIGHT_BMI = 18.5;

/** Wellbeing guardrail (section 10): goal weights that imply BMI < 18.5 get a gentle warning. */
export function goalWeightWarning(goalKg: number, heightCm: number | null | undefined): string | null {
  const b = bmi(goalKg, heightCm);
  if (b !== null && b < UNDERWEIGHT_BMI) {
    return "That goal weight is below the healthy range for your height. Consider talking with a doctor or dietitian about a goal that's right for you.";
  }
  return null;
}
