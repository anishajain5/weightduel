import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInTz } from "@wid/shared";
import { buildApp } from "../src/app";
import { MemoryMailer } from "../src/mailer";
import { inQuietHours } from "../src/notify/notifier";
import { FakePush } from "../src/notify/push";
import { runTick } from "../src/notify/scheduler";
import { MemoryStorage } from "../src/storage";
import { hasDb, testEnv } from "./helpers";

const db = new PrismaClient();
const push = new FakePush();
const mailer = new MemoryMailer();
const app = buildApp({ db, env: testEnv(), mailer, storage: new MemoryStorage(), push });
const deps = { db, get notifier() { return app.notifier; }, get jobs() { return app.groupJobs; }, log: { error: (o: unknown) => console.error(o), info: () => {} } };
let n = 0;
const nextIp = () => `10.3.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `nt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;
const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object | undefined, remoteAddress: nextIp(), headers: { authorization: `Bearer ${token}` } });
async function newUser(displayName: string) {
  const res = await app.inject({ method: "POST", url: "/auth/signup", remoteAddress: nextIp(), payload: { displayName, email: uniq(), password: "correct horse battery", acceptTerms: true } });
  const b = res.json();
  await db.user.update({ where: { id: b.user.id }, data: { emailVerifiedAt: new Date() } });
  return { token: b.accessToken as string, id: b.user.id as string };
}
let tokenN = 0;
const expoToken = () => `ExponentPushToken[test-${Date.now()}-${tokenN++}]`;

describe("quiet hours", () => {
  it("wraps past midnight and respects the user's time zone", () => {
    const t = new Date("2026-10-17T18:00:00Z"); // 23:30 in Kolkata, 18:00 in UTC
    expect(inQuietHours(t, "Asia/Kolkata", "22:00", "07:00")).toBe(true);
    expect(inQuietHours(t, "UTC", "22:00", "07:00")).toBe(false);
    expect(inQuietHours(new Date("2026-10-17T03:00:00Z"), "UTC", "22:00", "07:00")).toBe(true);
    expect(inQuietHours(new Date("2026-10-17T07:00:00Z"), "UTC", "22:00", "07:00")).toBe(false);
  });
});

describe.skipIf(!hasDb)("notifications (integration, real DB, fake push)", { timeout: 240_000 }, () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.group.deleteMany({ where: { owner: { email: { endsWith: "@test.invalid" } } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: "10.3." } } });
    await db.$disconnect();
  });

  it("registers tokens, sends the daily reminder exactly once, and respects quiet hours", async () => {
    const a = await newUser("Ann");
    const tok = expoToken();
    expect((await call("POST", "/push-tokens", a.token, { token: tok, platform: "ios" })).statusCode).toBe(204);
    expect((await call("POST", "/push-tokens", a.token, { token: "nope", platform: "ios" })).statusCode).toBe(400);
    await call("PATCH", "/me", a.token, { reminderTime: "08:00", timezone: "UTC" });

    const at = new Date("2026-10-17T08:05:00Z");
    push.sent.length = 0;
    await runTick(deps, at);
    const mine = () => push.sent.filter((m) => m.to === tok);
    expect(mine().map((m) => m.title)).toEqual(["Time to weigh in"]);
    await runTick(deps, new Date("2026-10-17T08:10:00Z")); // next tick, same day
    expect(mine()).toHaveLength(1);

    // Not due yet / already logged => nothing.
    const b = await newUser("Bo");
    const tokB = expoToken();
    await call("POST", "/push-tokens", b.token, { token: tokB, platform: "android" });
    await call("PATCH", "/me", b.token, { reminderTime: "09:00", timezone: "UTC" });
    await call("PUT", `/weigh-ins/2026-10-17`, b.token, { weightKg: 70 }).catch(() => {});
    await db.weighIn.upsert({ where: { userId_entryDate: { userId: b.id, entryDate: new Date("2026-10-17T00:00:00Z") } }, create: { userId: b.id, entryDate: new Date("2026-10-17T00:00:00Z"), weightKg: "70" }, update: { weightKg: "70" } });
    await runTick(deps, new Date("2026-10-17T09:05:00Z"));
    expect(push.sent.filter((m) => m.to === tokB)).toHaveLength(0);

    // Quiet hours: reminder at 23:00 is recorded but not pushed.
    await call("PATCH", "/me", a.token, { reminderTime: "23:00" });
    push.sent.length = 0;
    await runTick(deps, new Date("2026-10-18T23:05:00Z"));
    expect(mine()).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: a.id, type: "daily_reminder" } })).toBe(2);
  });

  it("removes tokens Expo reports as dead", async () => {
    const a = await newUser("Dead");
    const tok = expoToken();
    await call("POST", "/push-tokens", a.token, { token: tok, platform: "ios" });
    push.invalid.add(tok);
    await app.notifier.send({ userId: a.id, type: "member_joined", title: "t", body: "b", dedupeKey: `t:${tok}` }, new Date("2026-10-17T12:00:00Z"));
    expect(await db.pushToken.count({ where: { expoToken: tok } })).toBe(0);
  });

  it("respects per-type prefs, fills the inbox, and marks read", async () => {
    const a = await newUser("Inbox");
    const tok = expoToken();
    await call("POST", "/push-tokens", a.token, { token: tok, platform: "ios" });
    const prefs = (await call("GET", "/notification-prefs", a.token)).json().prefs;
    expect(prefs.find((p: { type: string }) => p.type === "digest")).toMatchObject({ push: false });
    expect(prefs.find((p: { type: string }) => p.type === "competition")).toMatchObject({ push: true, email: true });

    await call("PUT", "/notification-prefs", a.token, { prefs: [{ type: "member_joined", push: false, email: false }] });
    push.sent.length = 0;
    await app.notifier.send({ userId: a.id, type: "member_joined", title: "Hi", body: "Cy joined", url: "/group/x", dedupeKey: `p:${tok}` }, new Date("2026-10-17T12:00:00Z"));
    expect(push.sent.filter((m) => m.to === tok)).toHaveLength(0); // push off...
    const inbox = (await call("GET", "/notifications", a.token)).json();
    expect(inbox).toMatchObject({ unread: 1, items: [{ title: "Hi", data: { url: "/group/x" }, read: false }] }); // ...still in the inbox
    await call("POST", "/notifications/read", a.token, {});
    expect((await call("GET", "/notifications", a.token)).json().unread).toBe(0);
  });

  it("emails competition updates with a working unsubscribe link", async () => {
    const a = await newUser("Mail");
    mailer.sent.length = 0;
    await app.notifier.send({ userId: a.id, type: "competition", title: "Duel ended", body: "Bo won", dedupeKey: `m:${a.id}` });
    expect(mailer.sent).toHaveLength(1);
    const link = /(http\S+\/unsubscribe\S+)/.exec(mailer.sent[0]!.text)![1]!;
    const u = new URL(link);
    const ok = await app.inject({ method: "GET", url: u.pathname + u.search, remoteAddress: nextIp() });
    expect(ok.statusCode).toBe(200);
    mailer.sent.length = 0;
    await app.notifier.send({ userId: a.id, type: "competition", title: "Again", body: "x", dedupeKey: `m2:${a.id}` });
    expect(mailer.sent).toHaveLength(0);
    const bad = await app.inject({ method: "GET", url: `/unsubscribe?u=${a.id}&t=competition&sig=bad`, remoteAddress: nextIp() });
    expect(bad.statusCode).toBe(400);
  });

  it("notifies the owner on join, then competition start, ending soon, ended with winner, and rank drops", async () => {
    const o = await newUser("Owner");
    const j = await newUser("Joiner");
    const t = todayInTz("UTC");
    const g = (await call("POST", "/groups", o.token, { name: "Duel", startDate: t, endDate: addDays(t, 3), scoring: "pct" })).json();
    await call("POST", "/groups/join", j.token, { code: g.joinCode });
    const joined = await db.notification.findFirst({ where: { userId: o.id, type: "member_joined" } });
    expect(joined).toMatchObject({ body: "Joiner joined Duel" });

    // Owner leads at first, then Joiner overtakes.
    const day = (offset: number) => new Date(`${addDays(t, offset)}T00:00:00Z`);
    const w = (userId: string, kg: string, off = 0) =>
      db.weighIn.upsert({ where: { userId_entryDate: { userId, entryDate: day(off) } }, create: { userId, entryDate: day(off), weightKg: kg }, update: { weightKg: kg } });
    await w(o.id, "100"); await w(j.id, "100");
    await runTick(deps, new Date(`${t}T12:00:00Z`)); // start + ending-soon (3 days) notices; ranks recorded
    expect(await db.notification.count({ where: { userId: j.id, type: "competition" } })).toBe(2);

    // Ties have no stable order, so pin who led before the next check.
    await db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: o.id } }, data: { lastRank: 1 } });
    await db.groupMember.update({ where: { groupId_userId: { groupId: g.id, userId: j.id } }, data: { lastRank: 2 } });
    await w(o.id, "99"); await w(j.id, "95");
    await runTick(deps, new Date(`${t}T13:00:00Z`));
    const drop = await db.notification.findFirst({ where: { userId: o.id, type: "overtaken" } });
    expect(drop?.body).toContain("Joiner moved ahead of you");

    // End date passes: group is frozen and everyone hears the winner.
    await db.group.update({ where: { id: g.id }, data: { endDate: day(-1) } });
    await runTick(deps, new Date(`${t}T12:00:00Z`));
    const ended = await db.notification.findFirst({ where: { userId: o.id, title: "Duel has ended" } });
    expect(ended).toBeTruthy();
    expect((await db.group.findUnique({ where: { id: g.id } }))?.status).toBe("ended");
  });
});
