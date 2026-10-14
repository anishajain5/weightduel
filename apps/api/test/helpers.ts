import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app";
import { loadEnv } from "../src/env";
import { MemoryMailer } from "../src/mailer";
import { MemoryStorage } from "../src/storage";

export function testEnv() {
  return loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://u:p@localhost:26257/x",
    JWT_SECRET: "test-secret-test-secret-test-secret-test-secret",
    APP_BASE_URL: "http://localhost:3000",
  });
}

export function makeTestApp() {
  const db = new PrismaClient();
  const mailer = new MemoryMailer();
  const storage = new MemoryStorage();
  const app = buildApp({ db, env: testEnv(), mailer, storage });
  return { app, db, mailer, storage };
}

/** True when a real database is configured (integration tests run only then). */
export const hasDb = Boolean(process.env.DATABASE_URL);
