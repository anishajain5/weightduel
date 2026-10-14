import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import {
  changeEmailSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  type AuthResponse,
  type AuthUser,
} from "@wid/shared";
import type { AppDeps } from "../app";
import { withRetry } from "../db";
import { badRequest, conflict, tooMany, unauthorized } from "../lib/errors";
import { hashSecret, randomToken, safeEqual, sixDigitCode } from "../lib/crypto";
import { fakeVerify, hashPassword, verifyPassword } from "../lib/password";
import { signAccessToken } from "../lib/jwt";
import { RateLimiter } from "../lib/ratelimit";
import {
  changeEmailCodeMail,
  emailChangedMail,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from "../mailer/templates";
import { makeAuthenticate } from "../plugins/auth";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const CODE_TTL = 15 * MIN;
const RESET_TTL = 30 * MIN;
const REFRESH_TTL = 30 * DAY;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;

type UserRow = { id: string; email: string; displayName: string; emailVerifiedAt: Date | null };

const toAuthUser = (u: UserRow): AuthUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  emailVerified: u.emailVerifiedAt !== null,
});

export async function authRoutes(app: FastifyInstance, { db, env, mailer }: AppDeps) {
  const limiter = new RateLimiter(db);
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);
  const h = (v: string) => hashSecret(v, env.JWT_SECRET);
  const ip = (req: FastifyRequest) => req.ip;

  async function issueSession(user: UserRow, deviceLabel?: string): Promise<AuthResponse> {
    const refreshToken = randomToken();
    await db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: h(refreshToken),
        deviceLabel: deviceLabel ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL),
      },
    });
    return { user: toAuthUser(user), accessToken: await signAccessToken(user.id, env.JWT_SECRET), refreshToken };
  }

  const revokeAll = (userId: string) =>
    db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  /** Replaces any outstanding token of this purpose and returns the plain code. */
  async function createCode(userId: string, purpose: "verify" | "change_email", newEmail?: string) {
    const code = sixDigitCode();
    await db.$transaction([
      db.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      db.emailToken.create({
        data: { userId, purpose, tokenHash: h(code), newEmail: newEmail ?? null, expiresAt: new Date(Date.now() + CODE_TTL) },
      }),
    ]);
    return code;
  }

  /** Checks a 6-digit code. Attempts are incremented atomically *before* comparing. */
  async function consumeCode(userId: string, purpose: "verify" | "change_email", code: string, newEmail?: string) {
    const token = await db.emailToken.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() }, ...(newEmail ? { newEmail } : {}) },
      orderBy: { createdAt: "desc" },
    });
    if (!token) throw badRequest("CODE_EXPIRED", "That code has expired. Request a new one.");
    const bumped = await db.emailToken.updateMany({
      where: { id: token.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 0) throw badRequest("TOO_MANY_ATTEMPTS", "Too many wrong codes. Request a new one.");
    if (!safeEqual(token.tokenHash, h(code))) throw badRequest("INVALID_CODE", "That code isn't right.");
    const used = await db.emailToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw badRequest("CODE_EXPIRED", "That code has expired. Request a new one.");
    return token;
  }

  const sendQuietly = (mail: Parameters<typeof mailer.send>[0]) =>
    mailer.send(mail).catch((err) => app.log.error({ err, subject: mail.subject }, "mail send failed"));

  // ---- sign up -------------------------------------------------------------
  app.post("/auth/signup", async (req, reply) => {
    const body = signupSchema.parse(req.body);
    if (await limiter.isLimited(`signup:ip:${ip(req)}`, 20, 3600)) throw tooMany();
    await limiter.hit(`signup:ip:${ip(req)}`);

    const passwordHash = await hashPassword(body.password);
    let user;
    try {
      user = await db.user.create({
        data: { email: body.email, passwordHash, displayName: body.displayName, timezone: body.timezone ?? "UTC" },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("EMAIL_IN_USE", "An account with that email already exists");
      }
      throw e;
    }
    const code = await createCode(user.id, "verify");
    await sendQuietly(verifyEmailMail(user.email, user.displayName, code));
    return reply.code(201).send(await issueSession(user, body.deviceLabel));
  });

  // ---- email verification ---------------------------------------------------
  app.post("/auth/verify-email", { preHandler: authenticate }, async (req) => {
    const { code } = verifyEmailSchema.parse(req.body);
    const user = req.user!;
    if (user.emailVerifiedAt) return { verified: true };
    await consumeCode(user.id, "verify", code);
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { verified: true };
  });

  app.post("/auth/resend-code", { preHandler: authenticate }, async (req) => {
    const user = req.user!;
    if (user.emailVerifiedAt) throw badRequest("ALREADY_VERIFIED", "Your email is already verified");
    const last = await db.emailToken.findFirst({
      where: { userId: user.id, purpose: "verify" },
      orderBy: { createdAt: "desc" },
    });
    if (last) {
      const wait = RESEND_COOLDOWN_SEC - Math.floor((Date.now() - last.createdAt.getTime()) / 1000);
      if (wait > 0) throw tooMany(`Wait ${wait}s before requesting another code`, wait);
    }
    const code = await createCode(user.id, "verify");
    await sendQuietly(verifyEmailMail(user.email, user.displayName, code));
    return { sent: true };
  });

  // ---- login / sessions -----------------------------------------------------
  app.post("/auth/login", async (req) => {
    const body = loginSchema.parse(req.body);
    const ipKey = `login:ip:${ip(req)}`;
    const failKey = `login:fail:${body.email}`;
    if ((await limiter.isLimited(ipKey, 20, 900)) || (await limiter.isLimited(failKey, 5, 900))) {
      throw tooMany("Too many attempts. Try again in 15 minutes.", 900);
    }
    await limiter.hit(ipKey);

    const user = await db.user.findUnique({ where: { email: body.email } });
    const ok = user && !user.deletedAt ? await verifyPassword(user.passwordHash, body.password) : (await fakeVerify(body.password), false);
    if (!user || !ok) {
      await limiter.hit(failKey);
      throw unauthorized("INVALID_CREDENTIALS", "Email or password is incorrect");
    }
    return issueSession(user, body.deviceLabel);
  });

  app.post("/auth/refresh", async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const row = await db.refreshToken.findFirst({ where: { tokenHash: h(refreshToken) }, include: { user: true } });
    if (!row) throw unauthorized("INVALID_REFRESH", "Please sign in again");
    if (row.revokedAt) {
      // A rotated-out token was replayed: assume theft and end every session.
      await revokeAll(row.userId);
      throw unauthorized("INVALID_REFRESH", "Please sign in again");
    }
    if (row.expiresAt < new Date() || row.user.deletedAt) throw unauthorized("INVALID_REFRESH", "Please sign in again");
    const claimed = await db.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw unauthorized("INVALID_REFRESH", "Please sign in again");
    return issueSession(row.user, row.deviceLabel ?? undefined);
  });

  app.post("/auth/logout", async (req, reply) => {
    const { refreshToken } = logoutSchema.parse(req.body);
    await db.refreshToken.updateMany({
      where: { tokenHash: h(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return reply.code(204).send();
  });

  app.post("/auth/logout-all", { preHandler: authenticate }, async (req, reply) => {
    await revokeAll(req.user!.id);
    return reply.code(204).send();
  });

  // ---- forgot / reset password ------------------------------------------------
  const GENERIC_RESET = { message: "If an account exists, we've sent a reset link." };

  app.post("/auth/forgot-password", async (req) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    const key = `reset:${email}`;
    const limited = await limiter.isLimited(key, 3, 3600);
    await limiter.hit(key);
    if (limited) return GENERIC_RESET; // same response: no signal to the caller

    const user = await db.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return GENERIC_RESET;

    const token = randomToken();
    await db.$transaction([
      db.emailToken.updateMany({ where: { userId: user.id, purpose: "reset", usedAt: null }, data: { usedAt: new Date() } }),
      db.emailToken.create({
        data: { userId: user.id, purpose: "reset", tokenHash: h(token), expiresAt: new Date(Date.now() + RESET_TTL) },
      }),
    ]);
    void sendQuietly(resetPasswordMail(user.email, `${env.APP_BASE_URL}/reset?token=${token}`));
    return GENERIC_RESET;
  });

  app.post("/auth/reset-password", async (req) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const row = await db.emailToken.findFirst({
      where: { tokenHash: h(token), purpose: "reset", usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!row || row.user.deletedAt) throw badRequest("INVALID_TOKEN", "This reset link is invalid or has expired.");
    const passwordHash = await hashPassword(newPassword);

    await withRetry(() =>
      db.$transaction(async (tx) => {
        const used = await tx.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
        if (used.count === 0) throw badRequest("INVALID_TOKEN", "This reset link is invalid or has expired.");
        await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
        await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }),
    );
    void sendQuietly(passwordChangedMail(row.user.email));
    return { reset: true };
  });

  // ---- change password / email --------------------------------------------------
  app.post("/auth/change-password", { preHandler: authenticate }, async (req) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const userId = req.user!.id;
    const key = `pwchange:${userId}`;
    if (await limiter.isLimited(key, 5, 900)) throw tooMany();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      await limiter.hit(key);
      throw badRequest("WRONG_PASSWORD", "Current password is incorrect");
    }
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await revokeAll(userId);
    void sendQuietly(passwordChangedMail(user.email));
    return issueSession(user);
  });

  app.post("/auth/change-email", { preHandler: authenticate }, async (req) => {
    const body = changeEmailSchema.parse(req.body);
    const me = req.user!;
    if (body.newEmail === me.email) throw badRequest("SAME_EMAIL", "That is already your email");

    if ("password" in body) {
      const key = `emailchange:${me.id}`;
      if (await limiter.isLimited(key, 5, 900)) throw tooMany();
      const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
      if (!(await verifyPassword(user.passwordHash, body.password))) {
        await limiter.hit(key);
        throw badRequest("WRONG_PASSWORD", "Password is incorrect");
      }
      if (await db.user.findUnique({ where: { email: body.newEmail } })) {
        throw conflict("EMAIL_IN_USE", "An account with that email already exists");
      }
      const code = await createCode(me.id, "change_email", body.newEmail);
      await sendQuietly(changeEmailCodeMail(body.newEmail, code));
      return { sent: true };
    }

    await consumeCode(me.id, "change_email", body.code, body.newEmail);
    try {
      await db.user.update({ where: { id: me.id }, data: { email: body.newEmail, emailVerifiedAt: new Date() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw conflict("EMAIL_IN_USE", "An account with that email already exists");
      }
      throw e;
    }
    void sendQuietly(emailChangedMail(me.email, body.newEmail));
    return { email: body.newEmail };
  });
}
