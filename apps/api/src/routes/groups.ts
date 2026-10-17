import type { FastifyInstance, FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import {
  addDays,
  allowedModes,
  computeStreak,
  createGroupSchema,
  dailyScore,
  JOIN_CODE_ALPHABET,
  joinGroupSchema,
  normalizeJoinCode,
  JOIN_CODE_RE,
  progress,
  todayInTz,
  transferSchema,
  updateGroupSchema,
  viewPermission,
  type FeedItem,
  type GroupDetail,
  type GroupPreview,
  type GroupSeries,
  type GroupSummary,
  type LeaderRow,
  type Leaderboard,
  type SeriesMode,
} from "@wid/shared";
import { randomInt } from "node:crypto";
import type { AppDeps } from "../app";
import { withRetry } from "../db";
import { badRequest, conflict, forbidden, HttpError, tooMany } from "../lib/errors";
import { RateLimiter } from "../lib/ratelimit";
import { makeAuthenticate, requireVerified } from "../plugins/auth";

const ds = (d: Date) => d.toISOString().slice(0, 10);
const D = (s: string) => new Date(`${s}T00:00:00Z`);
const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()));
const notFound = (what = "Competition") => new HttpError(404, "NOT_FOUND", `${what} not found`);

type GroupFull = Prisma.GroupGetPayload<{
  include: {
    owner: { select: { id: true; displayName: true; timezone: true } };
    members: { where: { leftAt: null }; include: { user: { select: { id: true; displayName: true } } } };
  };
}>;
const groupInclude = {
  owner: { select: { id: true, displayName: true, timezone: true } },
  members: { where: { leftAt: null }, include: { user: { select: { id: true, displayName: true } } }, orderBy: { joinedAt: "asc" } },
} satisfies Prisma.GroupInclude;

interface Standing {
  userId: string;
  displayName: string;
  baselineKg: number | null;
  currentKg: number | null;
  daysLogged: number;
  streak: number;
}

const newCode = () => Array.from({ length: 6 }, () => JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]).join("");

export interface GroupJobs {
  /** Freezes every active competition whose end date has passed (the scheduler calls this). */
  finalizeDue(): Promise<void>;
  /** Current ranking (1 = leading) of members who have a score. */
  ranks(groupId: string): Promise<{ userId: string; rank: number; displayName: string }[]>;
}
declare module "fastify" {
  interface FastifyInstance {
    groupJobs: GroupJobs;
  }
}

export async function groupRoutes(app: FastifyInstance, { db, env, storage, notifier }: AppDeps) {
  const authenticate = makeAuthenticate(db, env.JWT_SECRET);
  const verified = [authenticate, requireVerified];
  const limiter = new RateLimiter(db);

  const groupToday = (g: GroupFull) => todayInTz(g.owner.timezone);
  const asOfFor = (g: GroupFull) => {
    const today = groupToday(g);
    return g.endDate && ds(g.endDate) < today ? ds(g.endDate) : today;
  };
  const shareLink = (code: string) => `${env.APP_BASE_URL.replace(/\/$/, "")}/join/${code}`;

  async function loadGroup(id: string): Promise<GroupFull> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const g = await db.group.findUnique({ where: { id }, include: groupInclude });
    if (!g) throw notFound();
    return g;
  }

  /** Loads the group and asserts the requester is an active member (404 otherwise, so ids don't leak). */
  async function loadForMember(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    const g = await finalizeIfDue(await loadGroup(id));
    const me = g.members.find((m) => m.userId === req.user!.id);
    if (!me) throw notFound();
    return { g, me };
  }

  async function loadForOwner(req: FastifyRequest) {
    const r = await loadForMember(req);
    if (r.me.role !== "owner") throw forbidden("NOT_OWNER", "Only the owner can do that");
    return r;
  }

  /** Per-member baseline / current weight / activity, resolving baselines lazily (BRD 4.5). */
  async function standingsFor(g: GroupFull, asOf: string): Promise<Standing[]> {
    const start = ds(g.startDate);
    const low = addDays(start, -3) < addDays(asOf, -120) ? addDays(start, -3) : addDays(asOf, -120);
    const ids = g.members.map((m) => m.userId);
    const rows = await db.weighIn.findMany({
      where: { userId: { in: ids }, entryDate: { gte: D(low), lte: D(asOf) } },
      select: { userId: true, entryDate: true, weightKg: true },
      orderBy: { entryDate: "asc" },
    });
    const byUser = new Map<string, { date: string; kg: number | null }[]>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push({ date: ds(r.entryDate), kg: num(r.weightKg) });
      byUser.set(r.userId, list);
    }
    const updates: Promise<unknown>[] = [];
    const out = g.members.map((m): Standing => {
      const entries = byUser.get(m.userId) ?? [];
      const weights = entries.filter((e) => e.kg !== null) as { date: string; kg: number }[];
      let baselineKg = num(m.baselineKg);
      let baselineDate = m.baselineDate ? ds(m.baselineDate) : null;
      if (baselineKg === null) {
        const near = weights.filter((e) => e.date <= start && e.date >= addDays(start, -3)).at(-1);
        const first = weights.find((e) => e.date >= ds(m.joinedAt));
        const pick = near ?? first;
        if (pick) {
          baselineKg = pick.kg;
          baselineDate = pick.date;
          updates.push(
            db.groupMember.update({
              where: { groupId_userId: { groupId: g.id, userId: m.userId } },
              data: { baselineKg: pick.kg, baselineDate: D(pick.date) },
            }),
          );
        }
      }
      const current = baselineKg === null ? null : [...weights].reverse().find((e) => e.date >= (baselineDate ?? start))?.kg ?? baselineKg;
      return {
        userId: m.userId,
        displayName: m.user.displayName,
        baselineKg,
        currentKg: current,
        daysLogged: entries.filter((e) => e.date >= start).length,
        streak: computeStreak(entries.map((e) => e.date), asOf),
      };
    });
    await Promise.all(updates);
    return out;
  }

  const scoreOf = (g: GroupFull, s: Standing) => {
    if (s.baselineKg === null || s.currentKg === null) return null;
    const p = progress(s.baselineKg, s.currentKg);
    return g.scoring === "pct" ? p.pctLost : p.lostKg;
  };

  /** Freezes the leaderboard and picks a winner once the end date has passed. */
  async function finalizeIfDue(g: GroupFull): Promise<GroupFull> {
    if (g.status !== "active" || !g.endDate || ds(g.endDate) >= groupToday(g)) return g;
    const standings = await standingsFor(g, ds(g.endDate));
    const ranked = standings.map((s) => ({ s, v: scoreOf(g, s) })).filter((x) => x.v !== null).sort((a, b) => b.v! - a.v!);
    await db.group.updateMany({
      where: { id: g.id, status: "active" },
      data: { status: "ended", winnerUserId: ranked[0]?.s.userId ?? null },
    });
    return loadGroup(g.id);
  }

  app.decorate("groupJobs", {
    async finalizeDue() {
      const groups = await db.group.findMany({ where: { status: "active", endDate: { lt: new Date(Date.now() + 36 * 3600 * 1000) } }, select: { id: true } });
      for (const { id } of groups) await finalizeIfDue(await loadGroup(id));
    },
    async ranks(groupId: string) {
      const g = await loadGroup(groupId);
      const today = groupToday(g);
      const standings = await standingsFor(g, g.endDate && ds(g.endDate) < today ? ds(g.endDate) : today);
      return standings
        .map((s) => ({ s, v: scoreOf(g, s) }))
        .filter((x) => x.v !== null)
        .sort((a, b) => b.v! - a.v!)
        .map((x, i) => ({ userId: x.s.userId, rank: i + 1, displayName: x.s.displayName }));
    },
  } satisfies GroupJobs);

  function summary(g: GroupFull, role: "owner" | "member"): GroupSummary {
    return {
      id: g.id,
      name: g.name,
      role,
      status: g.status,
      memberCount: g.members.length,
      startDate: ds(g.startDate),
      endDate: g.endDate ? ds(g.endDate) : null,
      scoring: g.scoring,
    };
  }

  function detail(g: GroupFull, role: "owner" | "member"): GroupDetail {
    const winner = g.winnerUserId ? g.members.find((m) => m.userId === g.winnerUserId) : undefined;
    return {
      ...summary(g, role),
      ownerId: g.ownerId,
      ownerName: g.owner.displayName,
      maxMembers: g.maxMembers,
      privacy: g.privacy,
      photosVisible: g.photosVisible,
      joinCode: g.joinCode,
      shareLink: shareLink(g.joinCode),
      allowedModes: allowedModes(g.privacy, g.scoring),
      winner: winner ? { userId: winner.userId, displayName: winner.user.displayName } : null,
      members: g.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role, joinedAt: m.joinedAt.toISOString() })),
    };
  }

  async function createWithUniqueCode<T>(make: (code: string) => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await make(newCode());
      } catch (e) {
        if (i < 6 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
  }

  // ---------- create / list / read ----------

  app.post("/groups", { preHandler: verified }, async (req, reply) => {
    const userId = req.user!.id;
    const input = createGroupSchema.parse(req.body ?? {});
    const key = `group-create:${userId}`;
    if (await limiter.isLimited(key, 10, 86_400)) throw tooMany("You've created a lot of competitions today. Try again tomorrow.");
    const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const start = input.startDate ?? todayInTz(u.timezone);
    if (input.endDate && input.endDate < start) throw badRequest("VALIDATION", "End date must be on or after the start date");
    const g = await createWithUniqueCode((joinCode) =>
      db.group.create({
        data: {
          name: input.name,
          ownerId: userId,
          joinCode,
          startDate: D(start),
          endDate: input.endDate ? D(input.endDate) : null,
          scoring: input.scoring,
          maxMembers: input.maxMembers,
          privacy: input.privacy,
          photosVisible: input.photosVisible,
          members: { create: { userId, role: "owner" } },
        },
        include: groupInclude,
      }),
    );
    await limiter.hit(key);
    return reply.code(201).send(detail(g, "owner"));
  });

  app.get("/groups", { preHandler: authenticate }, async (req) => {
    const memberships = await db.groupMember.findMany({
      where: { userId: req.user!.id, leftAt: null },
      include: { group: { include: groupInclude } },
      orderBy: { joinedAt: "desc" },
    });
    const groups: GroupSummary[] = [];
    for (const m of memberships) {
      const g = await finalizeIfDue(m.group);
      groups.push(summary(g, m.role));
    }
    return { groups };
  });

  app.get("/groups/preview/:code", { preHandler: authenticate }, async (req) => {
    const userId = req.user!.id;
    const key = `group-code:${userId}`;
    if (await limiter.isLimited(key, 15, 900)) throw tooMany("Too many code attempts. Try again in a few minutes.");
    const code = normalizeJoinCode((req.params as { code: string }).code);
    if (!JOIN_CODE_RE.test(code)) {
      await limiter.hit(key);
      throw notFound("That code");
    }
    const g = await db.group.findUnique({ where: { joinCode: code }, include: groupInclude });
    if (!g) {
      await limiter.hit(key);
      throw notFound("That code");
    }
    const out: GroupPreview = {
      name: g.name,
      ownerName: g.owner.displayName,
      memberCount: g.members.length,
      maxMembers: g.maxMembers,
      startDate: ds(g.startDate),
      scoring: g.scoring,
      status: g.status === "ended" || (g.endDate !== null && ds(g.endDate) < todayInTz(g.owner.timezone)) ? "ended" : "active",
      alreadyMember: g.members.some((m) => m.userId === userId),
    };
    return out;
  });

  app.post("/groups/join", { preHandler: verified }, async (req) => {
    const userId = req.user!.id;
    const { code } = joinGroupSchema.parse(req.body ?? {});
    const key = `group-code:${userId}`;
    if (await limiter.isLimited(key, 15, 900)) throw tooMany("Too many code attempts. Try again in a few minutes.");
    const found = await db.group.findUnique({ where: { joinCode: code }, include: groupInclude });
    if (!found) {
      await limiter.hit(key);
      throw notFound("That code");
    }
    const g = await finalizeIfDue(found);
    if (g.status === "ended") throw conflict("GROUP_ENDED", "This competition has ended");
    const existing = g.members.find((m) => m.userId === userId);
    if (existing) return detail(g, existing.role);
    await withRetry(() =>
      db.$transaction(async (tx) => {
        const count = await tx.groupMember.count({ where: { groupId: g.id, leftAt: null } });
        if (count >= g.maxMembers) throw conflict("GROUP_FULL", "This competition is full");
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId: g.id, userId } },
          create: { groupId: g.id, userId },
          update: { leftAt: null, joinedAt: new Date(), role: "member", baselineKg: null, baselineDate: null },
        });
      }),
    );
    const joined = await loadGroup(g.id);
    const who = joined.members.find((m) => m.userId === userId)?.user.displayName ?? "Someone";
    // Best effort: a failed notification must never fail the join.
    await notifier.send({
      userId: g.ownerId, type: "member_joined", title: "New member", body: `${who} joined ${g.name}`,
      url: `/group/${g.id}`, dedupeKey: `member_joined:${g.id}:${userId}:${Date.now()}`,
    }).catch((e) => app.log.error({ err: e }, "member_joined notify failed"));
    return detail(joined, "member");
  });

  app.get("/groups/:id", { preHandler: authenticate }, async (req) => {
    const { g, me } = await loadForMember(req);
    return detail(g, me.role);
  });

  // ---------- owner management ----------

  app.patch("/groups/:id", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForOwner(req);
    if (g.status === "ended") throw conflict("GROUP_ENDED", "This competition has ended");
    const patch = updateGroupSchema.parse(req.body ?? {});
    if (patch.endDate && patch.endDate < ds(g.startDate)) throw badRequest("VALIDATION", "End date must be on or after the start date");
    if (patch.maxMembers !== undefined && patch.maxMembers < g.members.length) throw badRequest("VALIDATION", "Max members is below the current member count");
    await db.group.update({
      where: { id: g.id },
      data: {
        name: patch.name,
        privacy: patch.privacy,
        photosVisible: patch.photosVisible,
        maxMembers: patch.maxMembers,
        endDate: patch.endDate === undefined ? undefined : patch.endDate === null ? null : D(patch.endDate),
      },
    });
    return detail(await loadGroup(g.id), "owner");
  });

  app.post("/groups/:id/regenerate-code", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForOwner(req);
    if (g.status === "ended") throw conflict("GROUP_ENDED", "This competition has ended");
    await createWithUniqueCode((joinCode) => db.group.update({ where: { id: g.id }, data: { joinCode } }));
    return detail(await loadGroup(g.id), "owner");
  });

  app.delete("/groups/:id/members/:userId", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForOwner(req);
    const { userId } = req.params as { userId: string };
    if (userId === req.user!.id) throw badRequest("VALIDATION", "Use Leave to remove yourself");
    const target = g.members.find((m) => m.userId === userId);
    if (!target) throw notFound("Member");
    await db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId } }, data: { leftAt: new Date() } });
    return { ok: true };
  });

  app.post("/groups/:id/transfer", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForOwner(req);
    const { userId } = transferSchema.parse(req.body ?? {});
    if (userId === req.user!.id || !g.members.some((m) => m.userId === userId)) throw badRequest("VALIDATION", "Pick another active member");
    await withRetry(() =>
      db.$transaction([
        db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: req.user!.id } }, data: { role: "member" } }),
        db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId } }, data: { role: "owner" } }),
        db.group.update({ where: { id: g.id }, data: { ownerId: userId } }),
      ]),
    );
    return detail(await loadGroup(g.id), "member");
  });

  app.post("/groups/:id/end", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForOwner(req);
    if (g.status === "ended") return detail(g, "owner");
    const today = groupToday(g);
    const endDate = g.endDate && ds(g.endDate) < today ? ds(g.endDate) : today;
    const frozen = { ...g, endDate: D(endDate) } as GroupFull;
    const ranked = (await standingsFor(frozen, endDate))
      .map((s) => ({ s, v: scoreOf(g, s) }))
      .filter((x) => x.v !== null)
      .sort((a, b) => b.v! - a.v!);
    await db.group.update({ where: { id: g.id }, data: { status: "ended", endDate: D(endDate), winnerUserId: ranked[0]?.s.userId ?? null } });
    return detail(await loadGroup(g.id), "owner");
  });

  app.post("/groups/:id/leave", { preHandler: authenticate }, async (req) => {
    const { g, me } = await loadForMember(req);
    const userId = req.user!.id;
    if (me.role === "owner") {
      const successor = g.members.find((m) => m.userId !== userId); // members are ordered by joinedAt: longest-standing first
      if (successor && g.status === "active") {
        await withRetry(() =>
          db.$transaction([
            db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId } }, data: { leftAt: new Date(), role: "member" } }),
            db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: successor.userId } }, data: { role: "owner" } }),
            db.group.update({ where: { id: g.id }, data: { ownerId: successor.userId } }),
          ]),
        );
        return { ok: true };
      }
      if (!successor && g.status === "active") {
        await db.group.update({ where: { id: g.id }, data: { status: "ended", endDate: D(groupToday(g)) } });
      }
    }
    await db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId } }, data: { leftAt: new Date() } });
    return { ok: true };
  });

  // ---------- race ----------

  app.get("/groups/:id/leaderboard", { preHandler: authenticate }, async (req): Promise<Leaderboard> => {
    const { g } = await loadForMember(req);
    const viewerId = req.user!.id;
    const asOf = asOfFor(g);
    const standings = await standingsFor(g, asOf);
    const rows: LeaderRow[] = standings.map((s) => {
      const perm = viewPermission({
        viewerId, subjectId: s.userId, viewerIsMember: true, subjectIsMember: true, privacy: g.privacy, photosVisible: g.photosVisible,
      });
      const p = s.baselineKg !== null && s.currentKg !== null ? progress(s.baselineKg, s.currentKg) : null;
      // pct_only: others see only the metric the group scores on; never weights.
      const showPct = p !== null && (perm.weights || g.scoring === "pct");
      const showKg = p !== null && (perm.weights || g.scoring === "abs");
      return {
        userId: s.userId,
        displayName: s.displayName,
        isMe: s.userId === viewerId,
        rank: null,
        pctLost: showPct ? p!.pctLost : null,
        lostKg: showKg ? p!.lostKg : null,
        weightKg: perm.weights ? s.currentKg : null,
        daysLogged: s.daysLogged,
        streak: s.streak,
      };
    });
    const scores = new Map(standings.map((s) => [s.userId, scoreOf(g, s)]));
    const ranked = rows.filter((r) => scores.get(r.userId) !== null).sort((a, b) => scores.get(b.userId)! - scores.get(a.userId)! || a.displayName.localeCompare(b.displayName));
    let rank = 0;
    ranked.forEach((r, i) => {
      if (i === 0 || scores.get(r.userId) !== scores.get(ranked[i - 1]!.userId)) rank = i + 1;
      r.rank = rank;
    });
    const unranked = rows.filter((r) => r.rank === null).sort((a, b) => a.displayName.localeCompare(b.displayName));
    let leadLine: string | null = null;
    if (ranked.length >= 2) {
      const gap = Math.round((scores.get(ranked[0]!.userId)! - scores.get(ranked[1]!.userId)!) * 100) / 100;
      if (gap > 0) leadLine = `${ranked[0]!.displayName} leads by ${g.scoring === "pct" ? `${gap}% of starting weight` : `${gap} kg`}.`;
      else leadLine = `${ranked[0]!.displayName} and ${ranked[1]!.displayName} are tied.`;
    }
    return { status: g.status, asOf, rows: [...ranked, ...unranked], leadLine };
  });

  app.get("/groups/:id/series", { preHandler: authenticate }, async (req): Promise<GroupSeries> => {
    const { g } = await loadForMember(req);
    const mode = ((req.query as { mode?: string }).mode ?? allowedModes(g.privacy, g.scoring)[0]) as SeriesMode;
    if (!["lost", "pct", "weight"].includes(mode)) throw badRequest("VALIDATION", "Unknown mode");
    if (!allowedModes(g.privacy, g.scoring).includes(mode)) throw forbidden("MODE_NOT_ALLOWED", "This competition doesn't show that view");
    const asOf = asOfFor(g);
    const standings = await standingsFor(g, asOf);
    const start = ds(g.startDate);
    const rows = await db.weighIn.findMany({
      where: { userId: { in: g.members.map((m) => m.userId) }, weightKg: { not: null }, entryDate: { gte: D(addDays(start, -3)), lte: D(asOf) } },
      select: { userId: true, entryDate: true, weightKg: true },
      orderBy: { entryDate: "asc" },
    });
    const lines = standings.map((s) => {
      const base = g.members.find((m) => m.userId === s.userId)?.baselineDate;
      const from = base ? ds(base) : start;
      const points =
        s.baselineKg === null
          ? []
          : rows
              .filter((r) => r.userId === s.userId && ds(r.entryDate) >= from)
              .map((r) => {
                const kg = num(r.weightKg)!;
                const p = progress(s.baselineKg!, kg);
                return { date: ds(r.entryDate), value: mode === "weight" ? kg : mode === "lost" ? p.lostKg : p.pctLost };
              });
      return { userId: s.userId, displayName: s.displayName, isMe: s.userId === req.user!.id, points };
    });
    return { mode, from: start, to: asOf, lines };
  });

  app.get("/groups/:id/feed", { preHandler: authenticate }, async (req) => {
    const { g } = await loadForMember(req);
    const viewerId = req.user!.id;
    const q = req.query as { before?: string; limit?: string };
    const limit = Math.min(Math.max(parseInt(q.limit ?? "30", 10) || 30, 1), 50);
    const asOf = asOfFor(g);
    const before = q.before && /^\d{4}-\d{2}-\d{2}$/.test(q.before) ? q.before : addDays(asOf, 1);
    const rows = await db.weighIn.findMany({
      where: { userId: { in: g.members.map((m) => m.userId) }, entryDate: { gte: g.startDate, lt: D(before), lte: D(asOf) } },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    const names = new Map(g.members.map((m) => [m.userId, m.user.displayName]));
    const items: FeedItem[] = [];
    for (const r of rows) {
      const perm = viewPermission({
        viewerId, subjectId: r.userId, viewerIsMember: true, subjectIsMember: true, privacy: g.privacy, photosVisible: g.photosVisible,
      });
      let photoUrl: string | null = null;
      if (r.photoKey && perm.photos) {
        try {
          photoUrl = await storage.createReadUrl(r.photoKey);
        } catch (err) {
          req.log.warn({ err }, "could not sign feed photo url");
        }
      }
      items.push({
        userId: r.userId,
        displayName: names.get(r.userId) ?? "Member",
        isMe: r.userId === viewerId,
        date: ds(r.entryDate),
        weightKg: perm.weights ? num(r.weightKg) : null,
        ate: r.ate,
        moved: r.moved,
        slept: r.slept,
        intent: r.intent,
        score: dailyScore(r),
        photoUrl,
      }); // notes are deliberately never included
    }
    return { items, nextBefore: items.length === limit ? items[items.length - 1]!.date : null };
  });
}
