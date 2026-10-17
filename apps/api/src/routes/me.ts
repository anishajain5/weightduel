import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeStreak, goalWeightWarning, isValidTimezone, profileUpdateSchema, todayInTz, type Profile } from "@wid/shared";
import type { AppDeps } from "../app";
import { withRetry } from "../db";
import { badRequest, HttpError } from "../lib/errors";
import { verifyPassword } from "../lib/password";
import { RateLimiter } from "../lib/ratelimit";
import { makeAuthenticate } from "../plugins/auth";

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d.toString()));

/** CSV cell; leading = + - @ is neutralised so spreadsheets never run user text as a formula. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });

export async function meRoutes(app: FastifyInstance, { db, env, mailer, storage }: AppDeps) {
  const limiter = new RateLimiter(db);
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);

  async function profileFor(userId: string): Promise<Profile> {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const today = todayInTz(u.timezone);
    const [dates, first] = await Promise.all([
      db.weighIn.findMany({ where: { userId }, select: { entryDate: true }, orderBy: { entryDate: "desc" }, take: 800 }),
      db.weighIn.findFirst({ where: { userId, weightKg: { not: null } }, orderBy: { entryDate: "asc" }, select: { weightKg: true } }),
    ]);
    const goal = num(u.goalWeightKg);
    const height = num(u.heightCm);
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      displayName: u.displayName,
      unit: u.unit,
      goalWeightKg: goal,
      heightCm: height,
      timezone: u.timezone,
      reminderTime: u.reminderTime,
      quietStart: u.quietStart,
      quietEnd: u.quietEnd,
      recipePrefs: (u.recipePrefs as Record<string, boolean> | null) ?? null,
      avatarKey: u.avatarKey,
      onboarded: u.onboardedAt !== null,
      startWeightKg: first ? num(first.weightKg) : null,
      streak: computeStreak(dates.map((d) => d.entryDate.toISOString().slice(0, 10)), today),
      today,
      goalWarning: goal !== null ? goalWeightWarning(goal, height) : null,
    };
  }

  app.get("/me", { preHandler: authenticate }, async (req) => profileFor(req.user!.id));

  app.patch("/me", { preHandler: authenticate }, async (req) => {
    const { onboarded, recipePrefs, ...rest } = profileUpdateSchema.parse(req.body);
    if (rest.timezone !== undefined && !isValidTimezone(rest.timezone)) throw badRequest("VALIDATION", "Unknown time zone");
    await db.user.update({
      where: { id: req.user!.id },
      data: {
        ...rest,
        ...(recipePrefs !== undefined ? { recipePrefs: recipePrefs ?? Prisma.DbNull } : {}),
        ...(onboarded ? { onboardedAt: new Date() } : {}),
      },
    });
    return profileFor(req.user!.id);
  });

  // FR-PRIV: export all of your weigh-ins as CSV, emailed to the account address.
  app.post("/me/export", { preHandler: authenticate }, async (req, reply) => {
    const id = req.user!.id;
    const key = `export:${id}`;
    if (await limiter.isLimited(key, 3, 24 * 3600)) throw new HttpError(429, "RATE_LIMITED", "You can request an export 3 times a day.");
    await limiter.hit(key);
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    const rows = await db.weighIn.findMany({ where: { userId: id }, orderBy: { entryDate: "asc" } });
    const head = ["date", "weight_kg", "ate_well", "moved", "slept_well", "on_plan", "mood", "notes"];
    const csv = [head.join(",")]
      .concat(rows.map((r) => [r.entryDate.toISOString().slice(0, 10), num(r.weightKg), r.ate, r.moved, r.slept, r.intent, r.mood, r.notes].map(cell).join(",")))
      .join("\n");
    await mailer.send({
      to: u.email,
      subject: "Your Weigh-In Duel data export",
      text: `Hi ${u.displayName},\n\nYour ${rows.length} weigh-in entries are attached as a CSV file.\n\nIf you didn't request this, change your password.`,
      attachments: [{ filename: "weigh-in-duel-export.csv", content: csv, contentType: "text/csv" }],
    });
    return reply.code(202).send({ sent: true, entries: rows.length });
  });

  // FR-PRIV: hard delete. Owned groups pass to the longest-standing member, or end with nobody left.
  app.delete("/me", { preHandler: authenticate }, async (req, reply) => {
    const { password } = deleteAccountSchema.parse(req.body);
    const id = req.user!.id;
    const u = await db.user.findUniqueOrThrow({ where: { id } });
    const key = `delete:${id}`;
    if (await limiter.isLimited(key, 5, 3600)) throw new HttpError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
    if (!(await verifyPassword(u.passwordHash, password))) {
      await limiter.hit(key);
      throw new HttpError(403, "WRONG_PASSWORD", "That password isn't right.");
    }
    const photoKeys = (await db.weighIn.findMany({ where: { userId: id, photoKey: { not: null } }, select: { photoKey: true } })).map((w) => w.photoKey!);
    await withRetry(() => db.$transaction(async (tx) => {
      const owned = await tx.group.findMany({ where: { ownerId: id }, select: { id: true } });
      for (const g of owned) {
        const heir = await tx.groupMember.findFirst({ where: { groupId: g.id, userId: { not: id }, leftAt: null }, orderBy: { joinedAt: "asc" } });
        if (heir) {
          await tx.group.update({ where: { id: g.id }, data: { ownerId: heir.userId } });
          await tx.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: heir.userId } }, data: { role: "owner" } });
        } else {
          await tx.group.delete({ where: { id: g.id } });
        }
      }
      await tx.group.updateMany({ where: { winnerUserId: id }, data: { winnerUserId: null } });
      await tx.user.delete({ where: { id } });
    }));
    await Promise.allSettled(photoKeys.map((k) => storage.remove(k)));
    await mailer.send({
      to: u.email,
      subject: "Your Weigh-In Duel account was deleted",
      text: `Hi ${u.displayName},\n\nYour account and all of its data have been deleted. If this wasn't you, contact support right away.`,
    }).catch(() => {});
    return reply.code(204).send();
  });
}
