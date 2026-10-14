import type { FastifyInstance } from "fastify";
import {
  addDays,
  checkLogDate,
  dateSchema,
  isEmptyEntry,
  isValidDateStr,
  photoUploadRequestSchema,
  todayInTz,
  weighInInputSchema,
  type WeighIn,
} from "@wid/shared";
import type { WeighIn as Row } from "@prisma/client";
import type { AppDeps } from "../app";
import { badRequest, tooMany } from "../lib/errors";
import { RateLimiter } from "../lib/ratelimit";
import { makeAuthenticate } from "../plugins/auth";
import { newPhotoKey, photoKeyPrefix, type PhotoStorage } from "../storage";

const MAX_RANGE_DAYS = 400;

const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

export async function presentWeighIn(r: Row, storage: PhotoStorage, log: { warn(o: unknown, m?: string): void }): Promise<WeighIn> {
  let photoUrl: string | null = null;
  if (r.photoKey) {
    try {
      photoUrl = await storage.createReadUrl(r.photoKey);
    } catch (err) {
      log.warn({ err }, "could not sign photo url");
    }
  }
  return {
    date: toDateStr(r.entryDate),
    weightKg: num(r.weightKg),
    photoKey: r.photoKey,
    photoUrl,
    ate: r.ate,
    moved: r.moved,
    slept: r.slept,
    intent: r.intent,
    mood: r.mood,
    notes: r.notes,
  };
}

export async function weighInRoutes(app: FastifyInstance, { db, env, storage }: AppDeps) {
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);
  const limiter = new RateLimiter(db);

  const userToday = async (userId: string) => {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    return todayInTz(u.timezone);
  };

  app.post("/uploads/photo-url", { preHandler: authenticate }, async (req) => {
    const { contentType } = photoUploadRequestSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const key = `upload:${userId}`;
    if (await limiter.isLimited(key, 40, 86_400)) throw tooMany("Daily photo upload limit reached");
    const photoKey = newPhotoKey(userId, contentType);
    const uploadUrl = await storage.createUploadUrl(photoKey, contentType);
    await limiter.hit(key);
    return { uploadUrl, key: photoKey, contentType, expiresInSec: 300 };
  });

  app.get("/weigh-ins", { preHandler: authenticate }, async (req) => {
    const q = req.query as { from?: string; to?: string };
    const today = await userToday(req.user!.id);
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -89);
    if (!isValidDateStr(from) || !isValidDateStr(to)) throw badRequest("VALIDATION", "from and to must be YYYY-MM-DD");
    if (from > to) throw badRequest("VALIDATION", "from must not be after to");
    if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) {
      throw badRequest("VALIDATION", `Range can be at most ${MAX_RANGE_DAYS} days`);
    }
    const rows = await db.weighIn.findMany({
      where: { userId: req.user!.id, entryDate: { gte: toDate(from), lte: toDate(to) } },
      orderBy: { entryDate: "asc" },
    });
    return { entries: await Promise.all(rows.map((r) => presentWeighIn(r, storage, app.log))) };
  });

  app.put("/weigh-ins/:date", { preHandler: authenticate }, async (req) => {
    const date = dateSchema.parse((req.params as { date: string }).date);
    const input = weighInInputSchema.parse(req.body);
    const userId = req.user!.id;

    const verdict = checkLogDate(date, await userToday(userId));
    if (verdict === "invalid") throw badRequest("INVALID_DATE", "That isn't a valid date");
    if (verdict === "future") throw badRequest("FUTURE_DATE", "You can't log a future date");
    if (verdict === "too_old") throw badRequest("TOO_OLD", "You can only backfill the last 14 days");

    if (isEmptyEntry(input)) throw badRequest("EMPTY_ENTRY", "Add a weight, a habit, a mood or a note");
    if (input.photoKey && !input.photoKey.startsWith(photoKeyPrefix(userId))) {
      throw badRequest("INVALID_PHOTO", "That photo doesn't belong to you");
    }

    const existing = await db.weighIn.findUnique({ where: { userId_entryDate: { userId, entryDate: toDate(date) } } });
    const data = {
      weightKg: input.weightKg ?? null,
      photoKey: input.photoKey ?? null,
      ate: input.ate ?? null,
      moved: input.moved ?? null,
      slept: input.slept ?? null,
      intent: input.intent ?? null,
      mood: input.mood ?? null,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    };
    const row = await db.weighIn.upsert({
      where: { userId_entryDate: { userId, entryDate: toDate(date) } },
      create: { userId, entryDate: toDate(date), ...data },
      update: data,
    });
    if (existing?.photoKey && existing.photoKey !== data.photoKey) {
      void storage.remove(existing.photoKey).catch((err) => app.log.warn({ err }, "old photo cleanup failed"));
    }
    return presentWeighIn(row, storage, app.log);
  });

  app.delete("/weigh-ins/:date", { preHandler: authenticate }, async (req, reply) => {
    const date = dateSchema.parse((req.params as { date: string }).date);
    if (!isValidDateStr(date)) throw badRequest("INVALID_DATE", "That isn't a valid date");
    const userId = req.user!.id;
    const existing = await db.weighIn.findUnique({ where: { userId_entryDate: { userId, entryDate: toDate(date) } } });
    if (existing) {
      await db.weighIn.delete({ where: { id: existing.id } });
      if (existing.photoKey) {
        await storage.remove(existing.photoKey).catch((err) => app.log.warn({ err }, "photo cleanup failed"));
      }
    }
    return reply.code(204).send();
  });
}
