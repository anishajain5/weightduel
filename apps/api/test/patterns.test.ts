import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInTz } from "@wid/shared";
import { hasDb, makeTestApp } from "./helpers";

const { app, db } = makeTestApp();
let n = 0;
const nextIp = () => `10.5.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `pt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;
const today = () => todayInTz("UTC");

function call(method: "GET" | "POST" | "PUT" | "PATCH", url: string, token: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as object | undefined, remoteAddress: nextIp(), headers: { authorization: `Bearer ${token}` } });
}
async function newUser(displayName: string) {
  const res = await app.inject({ method: "POST", url: "/auth/signup", remoteAddress: nextIp(), payload: { displayName, email: uniq(), password: "correct horse battery", acceptTerms: true } });
  const b = res.json();
  await db.user.update({ where: { id: b.user.id }, data: { emailVerifiedAt: new Date() } });
  return { token: b.accessToken as string, id: b.user.id as string };
}

describe.skipIf(!hasDb)("patterns (integration, real DB)", () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.group.deleteMany({ where: { owner: { email: { endsWith: "@test.invalid" } } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: "10.5." } } });
    await db.$disconnect();
  });

  it("requires auth and returns your own patterns without notes", async () => {
    expect((await app.inject({ method: "GET", url: "/patterns/me" })).statusCode).toBe(401);
    const a = await newUser("Ann");
    await call("PUT", `/weigh-ins/${today()}`, a.token, { weightKg: 80, ate: true, mood: 5, notes: "private-diary" });
    await call("PUT", `/weigh-ins/${addDays(today(), -1)}`, a.token, { weightKg: 80.4, ate: false });
    const res = await call("GET", "/patterns/me?days=30", a.token);
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("private-diary");
    const p = res.json();
    expect(p).toMatchObject({ isMe: true, displayName: "Ann", daysLogged: 2, to: today() });
    expect(p.days.at(-1)).toEqual({ date: today(), weightKg: 80, score: 2 });
    expect(p.habits).toHaveLength(4);
  });

  it("shares patterns only inside a group that shows actual weights", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const out = await newUser("Outsider");
    const g = (await call("POST", "/groups", a.token, { name: "P", startDate: today() })).json();
    await call("POST", "/groups/join", b.token, { code: g.joinCode });
    await call("PUT", `/weigh-ins/${today()}`, a.token, { weightKg: 90, ate: true });

    const hidden = await call("GET", `/patterns/${g.id}/${a.id}`, b.token);
    expect(hidden.statusCode).toBe(403);
    expect(hidden.json().error.code).toBe("PATTERNS_HIDDEN");

    await call("PATCH", `/groups/${g.id}`, a.token, { privacy: "actual" });
    const shown = await call("GET", `/patterns/${g.id}/${a.id}`, b.token);
    expect(shown.statusCode).toBe(200);
    expect(shown.json()).toMatchObject({ displayName: "Ann", isMe: false, daysLogged: 1 });

    expect((await call("GET", `/patterns/${g.id}/${a.id}`, out.token)).statusCode).toBe(404); // not in the group
    expect((await call("GET", `/patterns/${g.id}/${out.id}`, b.token)).statusCode).toBe(404); // subject not in the group
    expect((await call("GET", `/patterns/${g.id}/${b.id}`, b.token)).statusCode).toBe(200); // yourself, via a group
  });
});
