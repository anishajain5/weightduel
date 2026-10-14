import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { Db } from "./db";
import type { Env } from "./env";
import { HttpError } from "./lib/errors";
import { createMailer, type Mailer } from "./mailer";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { weighInRoutes } from "./routes/weigh-ins";
import { groupRoutes } from "./routes/groups";
import { joinPageRoutes } from "./routes/join-page";
import { createStorage, type PhotoStorage } from "./storage";
import { resetPageRoutes } from "./routes/reset-page";

export interface AppDeps {
  db: Db;
  env: Env;
  mailer: Mailer;
  storage: PhotoStorage;
}

export function buildApp(input: { db: Db; env: Env; mailer?: Mailer; storage?: PhotoStorage }) {
  const app = Fastify({ logger: input.env.NODE_ENV !== "test", trustProxy: input.env.NODE_ENV === "production" });
  const deps: AppDeps = { db: input.db, env: input.env, mailer: input.mailer ?? createMailer(input.env, app.log),
    storage: input.storage ?? createStorage(input.env),
  };

  // Browser origins allowed to call the API (the Expo web app). Native apps send no Origin.
  const origins = new Set(
    [input.env.WEB_APP_URL, ...input.env.CORS_ORIGINS.split(",")]
      .map((o) => o?.trim().replace(/\/$/, ""))
      .filter((o): o is string => !!o),
  );
  if (input.env.NODE_ENV !== "production") {
    ["http://localhost:8081", "http://localhost:19006"].forEach((o) => origins.add(o));
  }
  void app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.has(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    exposedHeaders: ["Retry-After"],
    maxAge: 600,
  });

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
  void app.register(async (i) => weighInRoutes(i, deps));
  void app.register(async (i) => groupRoutes(i, deps));
  void app.register(async (i) => joinPageRoutes(i, deps));

  return app;
}
