import type { FastifyInstance } from "fastify";
import { addDays, computePatterns, todayInTz, viewPermission, type DayEntry, type PatternsResponse } from "@wid/shared";
import type { AppDeps } from "../app";
import { forbidden, HttpError } from "../lib/errors";
import { makeAuthenticate } from "../plugins/auth";

const UUID = /^[0-9a-f-]{36}$/i;
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));

export async function patternRoutes(app: FastifyInstance, { db, env }: AppDeps) {
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);

  const rangeDays = (q: unknown) => Math.min(Math.max(parseInt((q as { days?: string }).days ?? "90", 10) || 90, 7), 365);

  async function build(subjectId: string, viewerId: string, days: number): Promise<PatternsResponse> {
    const u = await db.user.findUnique({ where: { id: subjectId }, select: { id: true, displayName: true, timezone: true, deletedAt: true } });
    if (!u || u.deletedAt) throw new HttpError(404, "NOT_FOUND", "Not found");
    const to = todayInTz(u.timezone);
    const from = addDays(to, -(days - 1));
    const rows = await db.weighIn.findMany({
      where: { userId: subjectId, entryDate: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      select: { entryDate: true, weightKg: true, ate: true, moved: true, slept: true, intent: true, mood: true }, // never notes
      orderBy: { entryDate: "asc" },
    });
    const entries: DayEntry[] = rows.map((r) => ({
      date: r.entryDate.toISOString().slice(0, 10),
      weightKg: num(r.weightKg),
      ate: r.ate, moved: r.moved, slept: r.slept, intent: r.intent, mood: r.mood,
    }));
    return { ...computePatterns(entries, from, to), userId: u.id, displayName: u.displayName, isMe: subjectId === viewerId };
  }

  app.get("/patterns/me", { preHandler: authenticate }, async (req) => build(req.user!.id, req.user!.id, rangeDays(req.query)));

  /** Another member's patterns: only through a shared group whose privacy shows actual weights (canView). */
  app.get("/patterns/:groupId/:userId", { preHandler: authenticate }, async (req) => {
    const { groupId, userId } = req.params as { groupId: string; userId: string };
    const viewerId = req.user!.id;
    if (!UUID.test(groupId) || !UUID.test(userId)) throw new HttpError(404, "NOT_FOUND", "Not found");
    const g = await db.group.findUnique({
      where: { id: groupId },
      select: { privacy: true, photosVisible: true, members: { where: { leftAt: null }, select: { userId: true } } },
    });
    const isMember = (id: string) => !!g?.members.some((m) => m.userId === id);
    if (!g || !isMember(viewerId)) throw new HttpError(404, "NOT_FOUND", "Not found");
    const perm = viewPermission({
      viewerId, subjectId: userId, viewerIsMember: true, subjectIsMember: isMember(userId), privacy: g.privacy, photosVisible: g.photosVisible,
    });
    if (!perm.allowed) throw new HttpError(404, "NOT_FOUND", "Not found");
    if (!perm.patterns) throw forbidden("PATTERNS_HIDDEN", "This competition only shares % lost, not detailed patterns");
    return build(userId, viewerId, rangeDays(req.query));
  });
}
