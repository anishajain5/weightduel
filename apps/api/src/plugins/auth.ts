import type { FastifyReply, FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import type { Db } from "../db";

export interface RequestUser {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: RequestUser;
  }
}

export function makeAuthenticate(db: Db, jwtSecret: string) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();
    const userId = await verifyAccessToken(token, jwtSecret);
    if (!userId) throw unauthorized("TOKEN_EXPIRED", "Session expired");
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, emailVerifiedAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw unauthorized();
    req.user = { id: user.id, email: user.email, displayName: user.displayName, emailVerifiedAt: user.emailVerifiedAt };
  };
}

/** Use after authenticate on routes that need a verified email (creating/joining groups). */
export async function requireVerified(req: FastifyRequest, _reply: FastifyReply) {
  if (!req.user?.emailVerifiedAt) throw forbidden("EMAIL_NOT_VERIFIED", "Verify your email first");
}
