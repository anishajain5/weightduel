import Fastify from "fastify";
import { ZodError } from "zod";
import type { Db } from "./db";
import type { Env } from "./env";
import { HttpError } from "./lib/errors";
import { createMailer, type Mailer } from "./mailer";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { resetPageRoutes } from "./routes/reset-page";

export interface AppDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
}

export function buildApp(input: { db: Db; env: Env; mailer?: Mailer }) {
  const app = Fastify({ logger: input.env.NODE_ENV !== "test", trustProxy: input.env.NODE_ENV === "production" });
  const deps: AppDeps = { db: input.db, env: input.env, mailer: input.mailer ?? createMailer(input.env, app.log) };

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      if (err.extra?.retryAfterSec) reply.header("Retry-After", String(err.extra.retryAfterSec));
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, ...err.extra } });
    }
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.code(400).send({ error: { code: "VALIDATION", message: first?.message ?? "Invalid input" } });
    }
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: "BAD_REQUEST", message: e.message ?? "Bad request" } });
    }
    app.log.error(err);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });

  app.get("/healthz", async () => ({ status: "ok", time: new Date().toISOString() }));

  void app.register(async (i) => authRoutes(i, deps));
  void app.register(async (i) => resetPageRoutes(i, deps));
  void app.register(async (i) => meRoutes(i, deps));

  return app;
}
