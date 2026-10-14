import { z } from "zod";

export const RECIPE_PREFS = [
  { key: "vegetarian", label: "Vegetarian", prompt: "vegetarian (no meat or fish)" },
  { key: "eggs_ok", label: "Eggs ok", prompt: "eggs are fine" },
  { key: "high_protein", label: "High protein", prompt: "high protein" },
  { key: "under_30", label: "Under 30 min", prompt: "ready in under 30 minutes" },
  { key: "indian", label: "Indian flavours", prompt: "Indian flavours" },
] as const;
export const RECIPE_PREF_KEYS = RECIPE_PREFS.map((p) => p.key) as string[];

export const CRAVING_CHIPS = ["Pizza", "Burger and fries", "Chocolate", "Biryani", "Ice cream", "Pasta alfredo"];

export const recipeRequestSchema = z.object({
  craving: z.string().trim().min(2).max(60),
  prefs: z.record(z.boolean()).optional(),
  /** Name of a recipe the user didn't want, for "Give me a different one". */
  exclude: z.string().trim().max(120).optional(),
});
export type RecipeRequest = z.infer<typeof recipeRequestSchema>;

const n = (max: number) => z.number().finite().min(0).max(max);

export const recipeSchema = z.object({
  name: z.string().min(1).max(120),
  pitch: z.string().min(1).max(300),
  servings: z.number().int().min(1).max(20),
  minutes: z.number().int().min(1).max(600),
  ingredients: z.array(z.string().min(1).max(200)).min(1).max(40),
  steps: z.array(z.string().min(1).max(500)).min(1).max(30),
  per_serving: z.object({ calories: n(3000), protein_g: n(300), carbs_g: n(500), fat_g: n(300), fiber_g: n(100) }),
  usual_version_calories: n(5000),
  tip: z.string().max(400).default(""),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const saveRecipeSchema = z.object({ craving: z.string().trim().min(1).max(60), recipe: recipeSchema });
export interface SavedRecipe { id: string; craving: string; recipe: Recipe; createdAt: string }

export const scaleReadRequestSchema = z.object({ photoKey: z.string().min(1).max(200) });
export interface ScaleReading { weight: number | null; unit: "kg" | "lb" | null; confidence: "high" | "low" }
/** Weight converted into the user's own unit (server-side, so the app just shows it). */
export interface ScaleReadResponse extends ScaleReading { weightInUserUnit: number | null }

export const AI_LIMITS = { scale: 15, coach: 3, recipe: 10 } as const;
