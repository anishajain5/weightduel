import type { IncomingMessage, ServerResponse } from "node:http";
import * as Sentry from "@sentry/node";
import { buildApp } from "./app";
import { createDb } from "./db";
import { loadEnv } from "./env";
import { runTick } from "./notify/scheduler";

/**
 * Vercel entry: the whole API runs as one function behind `/api/*`.
 * The web app is served as static files from the same origin, so there is no CORS to configure.
 */
const env = loadEnv();
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });

const db = createDb();
const app = buildApp({ db, env });

// Vercel Cron replaces the in-process scheduler (it sends `Authorization: Bearer $CRON_SECRET`).
app.get("/internal/cron", async (req, reply) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "No." } });
  await runTick({ db, notifier: app.notifier, jobs: app.groupJobs, log: app.log });
  return { ok: true };
});

const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  if (req.url?.startsWith("/api")) req.url = req.url.slice(4) || "/";
  app.server.emit("request", req, res);
}
