import * as Sentry from "@sentry/node";
import { buildApp } from "./app";
import { createDb } from "./db";
import { loadEnv } from "./env";
import { startScheduler } from "./notify/scheduler";

const env = loadEnv();
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: 0 });

const db = createDb();
const app = buildApp({ db, env });

app.listen({ port: env.PORT, host: "0.0.0.0" }).then(() => {
  if (env.SCHEDULER_ENABLED) {
    startScheduler({ db, notifier: app.notifier, jobs: app.groupJobs, log: app.log });
    app.log.info("notification scheduler started (every 5 minutes)");
  }
}).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
