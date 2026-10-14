import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  AI_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
  AI_DAILY_BUDGET_USD: z.coerce.number().default(5),
  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
