import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import { addDays, computePatterns, computeStreak, todayInTz, type DayEntry } from "@wid/shared";
import type { Db } from "../db";
import type { Notifier } from "./notifier";

/** How long after its scheduled minute a job may still fire (covers a restart or a slow tick). */
const CATCH_UP_MIN = 30;

function localParts(now: Date, tz: string): { date: string; min: number; dow: number } {
  const date = todayInTz(tz, now);
  let hm: string;
  let dow: number;
  try {
    hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now).replace("24:", "00:");
    dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  } catch {
    hm = now.toISOString().slice(11, 16);
    dow = now.getUTCDay();
  }
  return { date, min: Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)), dow };
}
const due = (nowMin: number, atMin: number) => nowMin >= atMin && nowMin < atMin + CATCH_UP_MIN;
const hhmm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const D = (d: string) => new Date(`${d}T00:00:00Z`);

export interface SchedulerDeps {
  db: Db;
  notifier: Notifier;
  jobs: FastifyInstance["groupJobs"];
  log: { error(o: unknown, m?: string): void; info(o: unknown, m?: string): void };
}

/**
 * One scheduler pass. Every notification carries a dedupe key (type + user + local date, etc.), so
 * running this twice, or again after a restart, never sends anything twice (FR-NOT-4).
 */
export async function runTick(d: SchedulerDeps, now = new Date()): Promise<void> {
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      d.log.error({ err, job: name }, "scheduler job failed");
    }
  };
  await step("finalize", () => d.jobs.finalizeDue());
  await step("personal", () => personalJobs(d, now));
  await step("groups", () => groupJobs(d, now));
}

async function personalJobs({ db, notifier }: SchedulerDeps, now: Date) {
  const users = await db.user.findMany({
    where: { deletedAt: null, pushTokens: { some: {} } },
    select: { id: true, displayName: true, timezone: true, reminderTime: true },
  });
  if (!users.length) return;
  const ids = users.map((u) => u.id);
  const since = D(addDays(todayInTz("UTC", now), -70));
  const rows = await db.weighIn.findMany({
    where: { userId: { in: ids }, entryDate: { gte: since }, weightKg: { not: null } },
    select: { userId: true, entryDate: true, weightKg: true, ate: true, moved: true, slept: true, intent: true, mood: true },
    orderBy: { entryDate: "asc" },
  });
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);

  for (const u of users) {
    const lp = localParts(now, u.timezone);
    const mine = byUser.get(u.id) ?? [];
    const dates = mine.map((r) => r.entryDate.toISOString().slice(0, 10));
    const loggedToday = dates.includes(lp.date);

    if (u.reminderTime && !loggedToday && due(lp.min, hhmm(u.reminderTime))) {
      await notifier.send({ userId: u.id, type: "daily_reminder", title: "Time to weigh in", body: "Log today's weight and how your day went.", url: "/", dedupeKey: `daily_reminder:${u.id}:${lp.date}` }, now);
    }
    if (!loggedToday && due(lp.min, 20 * 60)) {
      const streak = computeStreak(dates, lp.date);
      if (streak >= 3) {
        await notifier.send({ userId: u.id, type: "streak_risk", title: `Keep your ${streak}-day streak`, body: "You haven't logged today. A quick weigh-in keeps it alive.", url: "/", dedupeKey: `streak_risk:${u.id}:${lp.date}` }, now);
      }
    }
    if (lp.dow === 0 && due(lp.min, 18 * 60)) {
      const from = addDays(lp.date, -6);
      const entries: DayEntry[] = mine
        .filter((r) => r.entryDate.toISOString().slice(0, 10) >= from)
        .map((r) => ({ date: r.entryDate.toISOString().slice(0, 10), weightKg: Number(r.weightKg), ate: r.ate, moved: r.moved, slept: r.slept, intent: r.intent, mood: r.mood }));
      const p = computePatterns(entries, from, lp.date);
      const prev = mine.filter((r) => r.entryDate.toISOString().slice(0, 10) < from).at(-1);
      const last = entries.filter((e) => e.weightKg !== null).at(-1);
      const change = last && prev ? Math.round((last.weightKg! - Number(prev.weightKg)) * 10) / 10 : null;
      const consistency = p.weeks.at(-1)?.consistency;
      const body =
        p.daysLogged === 0
          ? "You didn't log this week. A fresh week starts tomorrow."
          : `You logged ${p.daysLogged} of 7 days` +
            (consistency != null ? `, ${Math.round(consistency * 100)}% habit consistency` : "") +
            (change !== null ? `, weight ${change > 0 ? "+" : ""}${change} kg vs last week` : "") + ".";
      await notifier.send({ userId: u.id, type: "weekly_recap", title: "Your week", body, url: "/why", dedupeKey: `weekly_recap:${u.id}:${lp.date}` }, now);
    }
  }

  // Group digest (off by default): "4 of 6 logged today" at 9 pm local, only for people who turned it on.
  const optedIn = await db.notificationPref.findMany({ where: { type: "digest", push: true, userId: { in: ids } }, select: { userId: true } });
  for (const { userId } of optedIn) {
    const u = users.find((x) => x.id === userId)!;
    const lp = localParts(now, u.timezone);
    if (!due(lp.min, 21 * 60)) continue;
    const memberships = await db.groupMember.findMany({
      where: { userId, leftAt: null, group: { status: "active" } },
      select: { group: { select: { id: true, name: true, members: { where: { leftAt: null }, select: { userId: true } } } } },
    });
    for (const { group } of memberships) {
      const logged = await db.weighIn.count({ where: { userId: { in: group.members.map((m) => m.userId) }, entryDate: D(lp.date), weightKg: { not: null } } });
      await notifier.send({ userId, type: "digest", title: group.name, body: `${logged} of ${group.members.length} logged today`, url: `/group/${group.id}`, dedupeKey: `digest:${group.id}:${userId}:${lp.date}` }, now);
    }
  }
}

async function groupJobs({ db, notifier, jobs, log }: SchedulerDeps, now: Date) {
  const horizon = D(addDays(todayInTz("UTC", now), -3));
  const groups = await db.group.findMany({
    where: { OR: [{ status: "active" }, { status: "ended", endDate: { gte: horizon } }] },
    select: {
      id: true, name: true, status: true, startDate: true, endDate: true, winnerUserId: true,
      owner: { select: { timezone: true } },
      members: { where: { leftAt: null }, select: { userId: true, lastRank: true, user: { select: { displayName: true } } } },
    },
  });
  for (const g of groups) {
    const lp = localParts(now, g.owner.timezone);
    const start = g.startDate.toISOString().slice(0, 10);
    const end = g.endDate?.toISOString().slice(0, 10) ?? null;
    const url = `/group/${g.id}`;
    const everyone = (type: "competition", title: string, body: string, key: string) =>
      Promise.all(g.members.map((m) => notifier.send({ userId: m.userId, type, title, body, url, dedupeKey: `${key}:${g.id}:${m.userId}` }, now)));

    if (g.status === "active" && start === lp.date && lp.min >= 8 * 60) {
      await everyone("competition", `${g.name} starts today`, "Weigh in today to set your starting point.", "comp_start");
    }
    if (g.status === "active" && end && end === addDays(lp.date, 3) && lp.min >= 9 * 60) {
      await everyone("competition", `${g.name} ends in 3 days`, "Last chance to move up the leaderboard.", "comp_soon");
    }
    if (g.status === "ended") {
      const winner = g.members.find((m) => m.userId === g.winnerUserId)?.user.displayName;
      await everyone("competition", `${g.name} has ended`, winner ? `${winner} won. See the final standings.` : "See the final standings.", "comp_ended");
      continue;
    }
    // Overtaken: compare the current ranking with the last one we saw.
    if (g.status === "active" && start <= lp.date && g.members.length > 1) {
      try {
        const ranks = await jobs.ranks(g.id);
        for (const r of ranks) {
          const m = g.members.find((x) => x.userId === r.userId);
          if (!m) continue;
          if (m.lastRank !== null && r.rank > m.lastRank) {
            const passer = ranks.find((x) => x.rank === r.rank - 1);
            await notifier.send({
              userId: r.userId, type: "overtaken", title: "You've been overtaken",
              body: `${passer?.displayName ?? "Someone"} moved ahead of you in ${g.name}. You're now #${r.rank}.`,
              url, dedupeKey: `overtaken:${g.id}:${r.userId}:${r.rank}:${lp.date}:${m.lastRank}`,
            }, now);
          }
          if (m.lastRank !== r.rank) await db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: r.userId } }, data: { lastRank: r.rank } });
        }
      } catch (err) {
        log.error({ err, group: g.id }, "rank check failed");
      }
    }
  }
}

/** Runs a pass every 5 minutes (FR-NOT-4). Single instance only; overlapping passes are skipped. */
export function startScheduler(d: SchedulerDeps) {
  let running = false;
  const task = cron.schedule("*/5 * * * *", async () => {
    if (running) return;
    running = true;
    try {
      await runTick(d);
    } finally {
      running = false;
    }
  });
  return () => task.stop();
}
