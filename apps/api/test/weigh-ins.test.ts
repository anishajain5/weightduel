import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInTz } from "@wid/shared";
import { hasDb, makeTestApp } from "./helpers";

const { app, db, storage } = makeTestApp();
const PW = "correct horse battery";
let n = 0;
const nextIp = () => `10.8.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `w-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;

function call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    payload: payload as object | undefined,
    remoteAddress: nextIp(),
    headers: { authorization: `Bearer ${token}` },
  });
}

async function newUser() {
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    remoteAddress: nextIp(),
    payload: { displayName: "Wes", email: uniq(), password: PW, acceptTerms: true },
  });
  const b = res.json();
  return { token: b.accessToken as string, id: b.user.id as string };
}

const today = () => todayInTz("UTC");

describe.skipIf(!hasDb)("weigh-ins and profile (integration, real DB)", () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: ":10.8." } } });
    await db.$disconnect();
  });

  it("requires authentication", async () => {
    expect((await app.inject({ method: "GET", url: "/weigh-ins" })).statusCode).toBe(401);
    expect((await app.inject({ method: "PUT", url: `/weigh-ins/${today()}`, payload: { weightKg: 80 } })).statusCode).toBe(401);
  });

  it("creates, reads and updates one entry per date", async () => {
    const { token } = await newUser();
    const d = today();
    const first = await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 82.4, ate: true, mood: 4, notes: "  felt good " });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ date: d, weightKg: 82.4, ate: true, mood: 4, notes: "felt good", moved: null });

    await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 82.0, moved: false });
    const list = (await call("GET", `/weigh-ins?from=${d}&to=${d}`, token)).json().entries;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ weightKg: 82, moved: false, ate: null, mood: null }); // PUT replaces the entry
  });

  it("saves context without a weight, but rejects an empty entry", async () => {
    const { token } = await newUser();
    const d = today();
    expect((await call("PUT", `/weigh-ins/${d}`, token, { slept: true })).json()).toMatchObject({ weightKg: null, slept: true });
    const empty = await call("PUT", `/weigh-ins/${addDays(d, -1)}`, token, { notes: "   " });
    expect(empty.json().error.code).toBe("EMPTY_ENTRY");
  });

  it("enforces the 25-300 kg range and field limits", async () => {
    const { token } = await newUser();
    const d = today();
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 24.9 })).statusCode).toBe(400);
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 300.1 })).statusCode).toBe(400);
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 80, mood: 6 })).statusCode).toBe(400);
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 80, notes: "x".repeat(501) })).statusCode).toBe(400);
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 80, userId: "someone" })).statusCode).toBe(400); // unknown field
    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 25 })).statusCode).toBe(200);
  });

  it("allows today back to 14 days, rejects future and older dates", async () => {
    const { token } = await newUser();
    const d = today();
    expect((await call("PUT", `/weigh-ins/${addDays(d, -14)}`, token, { weightKg: 80 })).statusCode).toBe(200);
    expect((await call("PUT", `/weigh-ins/${addDays(d, -15)}`, token, { weightKg: 80 })).json().error.code).toBe("TOO_OLD");
    expect((await call("PUT", `/weigh-ins/${addDays(d, 1)}`, token, { weightKg: 80 })).json().error.code).toBe("FUTURE_DATE");
    expect((await call("PUT", `/weigh-ins/2026-02-30`, token, { weightKg: 80 })).json().error.code).toBe("INVALID_DATE");
  });

  it("computes 'today' in the user's time zone", async () => {
    const { token } = await newUser();
    expect((await call("PATCH", "/me", token, { timezone: "Not/AZone" })).statusCode).toBe(400);
    // UTC+14 is always a calendar day ahead of UTC for part of the day, and never behind it.
    await call("PATCH", "/me", token, { timezone: "Pacific/Kiritimati" });
    const kiri = todayInTz("Pacific/Kiritimati");
    expect((await call("PUT", `/weigh-ins/${kiri}`, token, { weightKg: 80 })).statusCode).toBe(200);
    expect((await call("GET", "/me", token)).json().today).toBe(kiri);
    // UTC-12 (Etc/GMT+12) can be a day behind: its "tomorrow" must be rejected even if UTC is already there.
    await call("PATCH", "/me", token, { timezone: "Etc/GMT+12" });
    const behind = todayInTz("Etc/GMT+12");
    expect((await call("PUT", `/weigh-ins/${addDays(behind, 1)}`, token, { weightKg: 80 })).json().error.code).toBe("FUTURE_DATE");
  });

  it("never shows one user's entries to another", async () => {
    const a = await newUser();
    const b = await newUser();
    await call("PUT", `/weigh-ins/${today()}`, a.token, { weightKg: 91.1 });
    expect((await call("GET", "/weigh-ins", b.token)).json().entries).toEqual([]);
    expect((await call("DELETE", `/weigh-ins/${today()}`, b.token)).statusCode).toBe(204); // no-op for B
    expect((await call("GET", "/weigh-ins", a.token)).json().entries).toHaveLength(1);
  });

  it("handles photos: pre-signed URL, ownership check, replace and delete cleanup", async () => {
    const a = await newUser();
    const b = await newUser();
    const d = today();

    const up = (await call("POST", "/uploads/photo-url", a.token, { contentType: "image/jpeg" })).json();
    expect(up.key).toMatch(new RegExp(`^photos/${a.id}/[0-9a-f-]+\\.jpg$`));
    expect(up.uploadUrl).toContain(up.key);

    const bUp = (await call("POST", "/uploads/photo-url", b.token, {})).json();
    expect((await call("PUT", `/weigh-ins/${d}`, a.token, { weightKg: 80, photoKey: bUp.key })).json().error.code).toBe("INVALID_PHOTO");

    const saved = (await call("PUT", `/weigh-ins/${d}`, a.token, { weightKg: 80, photoKey: up.key })).json();
    expect(saved.photoUrl).toContain("sig=");

    const up2 = (await call("POST", "/uploads/photo-url", a.token, {})).json();
    await call("PUT", `/weigh-ins/${d}`, a.token, { weightKg: 80, photoKey: up2.key });
    await new Promise((r) => setTimeout(r, 50));
    expect(storage.removed).toContain(up.key); // replaced photo deleted

    expect((await call("DELETE", `/weigh-ins/${d}`, a.token)).statusCode).toBe(204);
    expect(storage.removed).toContain(up2.key);
    expect((await call("GET", "/weigh-ins", a.token)).json().entries).toEqual([]);
  });

  it("profile: updates, goal-weight guardrail, onboarding flag, streak, start weight", async () => {
    const { token } = await newUser();
    const d = today();
    const initial = (await call("GET", "/me", token)).json();
    expect(initial).toMatchObject({ unit: "kg", onboarded: false, streak: 0, startWeightKg: null, goalWarning: null });

    const withGoal = (await call("PATCH", "/me", token, { unit: "lb", goalWeightKg: 48, heightCm: 170, reminderTime: "07:30" })).json();
    expect(withGoal).toMatchObject({ unit: "lb", goalWeightKg: 48, heightCm: 170, reminderTime: "07:30" });
    expect(withGoal.goalWarning).toMatch(/below the healthy range/);
    expect((await call("PATCH", "/me", token, { goalWeightKg: 65 })).json().goalWarning).toBeNull();

    expect((await call("PATCH", "/me", token, { reminderTime: "25:00" })).statusCode).toBe(400);
    expect((await call("PATCH", "/me", token, { email: "x@y.co" })).statusCode).toBe(400); // not editable here
    expect((await call("PATCH", "/me", token, { onboarded: true })).json().onboarded).toBe(true);

    await call("PUT", `/weigh-ins/${addDays(d, -1)}`, token, { weightKg: 90 });
    await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 89.2 });
    const me = (await call("GET", "/me", token)).json();
    expect(me.streak).toBe(2);
    expect(me.startWeightKg).toBe(90);
  });
});
