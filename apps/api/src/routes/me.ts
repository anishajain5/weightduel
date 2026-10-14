import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app";
import { makeAuthenticate } from "../plugins/auth";

export async function meRoutes(app: FastifyInstance, { db, env }: AppDeps) {
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);
  // Minimal for M1; the full profile (PATCH, DELETE, export) arrives in M2/M7.
  app.get("/me", { preHandler: authenticate }, async (req) => {
    const u = req.user!;
    return { id: u.id, email: u.email, displayName: u.displayName, emailVerified: u.emailVerifiedAt !== null };
  });
}
