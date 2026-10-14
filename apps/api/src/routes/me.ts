import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { computeStreak, goalWeightWarning, isValidTimezone, profileUpdateSchema, todayInTz, type Profile } from "@wid/shared";
import type { AppDeps } from "../app";
import { badRequest } from "../lib/errors";
import { makeAuthenticate } from "../plugins/auth";

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d.toString()));

export async function meRoutes(app: FastifyInstance, { db, env }: AppDeps) {
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
}
