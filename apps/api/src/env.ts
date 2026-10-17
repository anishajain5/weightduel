import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  /** Where the Expo web app is hosted, e.g. https://app.example.com. Enables the web reset link. */
  WEB_APP_URL: z.string().url().optional(),
  /** Comma-separated extra browser origins allowed by CORS. */
  CORS_ORIGINS: z.string().default(""),
  APP_SCHEME: z.string().default("weighinduel"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
  AI_MODEL_SMART: z.string().default("claude-sonnet-5-5"),
  AI_DAILY_BUDGET_USD: z.coerce.number().default(5),
  /** Set to "false" to mark new accounts verified at signup and skip the verification email (early development). */
  REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return schema.parse(source);
}
