import { z } from "zod";
import { DATE_RE } from "./dates";
import { MAX_KG, MIN_KG } from "./units";

export const dateSchema = z.string().regex(DATE_RE, "Use YYYY-MM-DD");

const tri = z.boolean().nullable().optional();

/** Body of PUT /weigh-ins/:date. Weight is canonical kg (FR-LOG-2). Omitted fields are cleared. */
export const weighInInputSchema = z
  .object({
    weightKg: z.number().min(MIN_KG, `Weight must be at least ${MIN_KG} kg`).max(MAX_KG, `Weight must be at most ${MAX_KG} kg`).nullable().optional(),
    photoKey: z.string().max(200).nullable().optional(),
    ate: tri,
    moved: tri,
    slept: tri,
    intent: tri,
    mood: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(500, "Notes can be up to 500 characters").nullable().optional(),
  })
  .strict();

export type WeighInInput = z.infer<typeof weighInInputSchema>;

export interface WeighIn {
  date: string;
  weightKg: number | null;
  photoKey: string | null;
  /** Short-lived signed URL for the photo, when there is one. */
  photoUrl: string | null;
  ate: boolean | null;
  moved: boolean | null;
  slept: boolean | null;
  intent: boolean | null;
  mood: number | null;
  notes: string | null;
}

/** True if the entry holds nothing worth saving. */
export function isEmptyEntry(i: WeighInInput): boolean {
  return (
    i.weightKg == null && i.photoKey == null && i.ate == null && i.moved == null && i.slept == null &&
    i.intent == null && i.mood == null && !(i.notes && i.notes.trim())
  );
}

export const photoUploadRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50),
    unit: z.enum(["kg", "lb"]),
    goalWeightKg: z.number().min(MIN_KG).max(MAX_KG).nullable(),
    heightCm: z.number().min(90).max(250).nullable(),
    timezone: z.string().max(64),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").nullable(),
    quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    recipePrefs: z.record(z.boolean()).nullable(),
    avatarKey: z.string().max(200).nullable(),
    /** Set true when the user finishes onboarding. */
    onboarded: z.literal(true),
  })
  .partial()
  .strict();

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface Profile {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  unit: "kg" | "lb";
  goalWeightKg: number | null;
  heightCm: number | null;
  timezone: string;
  reminderTime: string | null;
  quietStart: string;
  quietEnd: string;
  recipePrefs: Record<string, boolean> | null;
  avatarKey: string | null;
  onboarded: boolean;
  /** First weigh-in ever, used for "change since start". */
  startWeightKg: number | null;
  streak: number;
  today: string;
  goalWarning: string | null;
}
