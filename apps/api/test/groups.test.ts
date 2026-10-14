import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, JOIN_CODE_RE, todayInTz } from "@wid/shared";
import { hasDb, makeTestApp } from "./helpers";

const { app, db } = makeTestApp();
const PW = "correct horse battery";
let n = 0;
const nextIp = () => `10.7.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;
const today = () => todayInTz("UTC");

function call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as object | undefined, remoteAddress: nextIp(), headers: { authorization: `Bearer ${token}` } });
}

async function newUser(displayName: string, verify = true) {
  const res = await app.inject({
    method: "POST", url: "/auth/signup", remoteAddress: nextIp(),
    payload: { displayName, email: uniq(), password: PW, acceptTerms: true },
  });
  const b = res.json();
  if (verify) await db.user.update({ where: { id: b.user.id }, data: { emailVerifiedAt: new Date() } });
  return { token: b.accessToken as string, id: b.user.id as string };
}
const weigh = (t: string, date: string, body: object) => call("PUT", `/weigh-ins/${date}`, t, body);

describe.skipIf(!hasDb)("groups (integration, real DB)", () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.group.deleteMany({ where: { owner: { email: { endsWith: "@test.invalid" } } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: "10.7." } } });
    await db.$disconnect();
  });

  it("requires a verified email to create or join, and auth to do anything", async () => {
    expect((await app.inject({ method: "GET", url: "/groups" })).statusCode).toBe(401);
    const u = await newUser("Una", false);
    const res = await call("POST", "/groups", u.token, { name: "Nope" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await call("POST", "/groups/join", u.token, { code: "ABC234" })).statusCode).toBe(403);
  });

  it("creates, previews, joins, lists, and enforces full / ended / bad code", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const c = await newUser("Cy");
    const created = await call("POST", "/groups", a.token, { name: "  Spring Duel ", maxMembers: 2 });
    expect(created.statusCode).toBe(201);
    const g = created.json();
    expect(g).toMatchObject({ name: "Spring Duel", role: "owner", scoring: "pct", privacy: "pct_only", photosVisible: true, memberCount: 1 });
    expect(g.joinCode).toMatch(JOIN_CODE_RE);
    expect(g.shareLink).toBe(`http://localhost:3000/join/${g.joinCode}`);
    expect(g.allowedModes).toEqual(["pct"]);

    const preview = await call("GET", `/groups/preview/${g.joinCode.toLowerCase()}`, b.token);
    expect(preview.json()).toMatchObject({ name: "Spring Duel", ownerName: "Ann", memberCount: 1, alreadyMember: false, status: "active" });
    expect((await call("GET", "/groups/preview/ZZZZZZ", b.token)).statusCode).toBe(404);

    const joined = await call("POST", "/groups/join", b.token, { code: g.joinCode });
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toMatchObject({ role: "member", memberCount: 2 });
    expect((await call("POST", "/groups/join", b.token, { code: g.joinCode })).statusCode).toBe(200); // idempotent

    const full = await call("POST", "/groups/join", c.token, { code: g.joinCode });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe("GROUP_FULL");
    expect((await call("POST", "/groups/join", c.token, { code: "nope" })).statusCode).toBe(400);

    const mine = (await call("GET", "/groups", b.token)).json().groups;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: g.id, role: "member" });
    // Outsiders can't read it (404, not 403, so ids don't leak).
    expect((await call("GET", `/groups/${g.id}`, c.token)).statusCode).toBe(404);
    expect((await call("GET", `/groups/${g.id}/leaderboard`, c.token)).statusCode).toBe(404);
    expect((await call("GET", `/groups/${g.id}/feed`, c.token)).statusCode).toBe(404);
  });

  it("ranks by % lost, hides weights under pct_only, never leaks notes, and honours privacy changes", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const start = addDays(today(), -2);
    const g = (await call("POST", "/groups", a.token, { name: "Race", startDate: start })).json();
    await call("POST", "/groups/join", b.token, { code: g.joinCode });

    await weigh(a.token, start, { weightKg: 100, ate: true, notes: "top-secret-note" });
    await weigh(a.token, today(), { weightKg: 95, ate: true, moved: true, mood: 5 });
    await weigh(b.token, start, { weightKg: 90 });
    await weigh(b.token, today(), { weightKg: 90 });

    const lb = (await call("GET", `/groups/${g.id}/leaderboard`, b.token)).json();
    expect(lb.rows.map((r: { displayName: string }) => r.displayName)).toEqual(["Ann", "Bo"]);
    expect(lb.rows[0]).toMatchObject({ rank: 1, pctLost: 5, lostKg: null, weightKg: null, isMe: false });
    expect(lb.rows[1]).toMatchObject({ rank: 2, pctLost: 0, weightKg: 90, isMe: true });
    expect(lb.leadLine).toBe("Ann leads by 5% of starting weight.");
    expect(lb.rows[0].daysLogged).toBe(2);
    expect(lb.rows[0].streak).toBeGreaterThanOrEqual(1);

    expect((await call("GET", `/groups/${g.id}/series?mode=weight`, b.token)).statusCode).toBe(403);
    const series = (await call("GET", `/groups/${g.id}/series?mode=pct`, b.token)).json();
    const annLine = series.lines.find((l: { displayName: string }) => l.displayName === "Ann");
    expect(annLine.points).toEqual([{ date: start, value: 0 }, { date: today(), value: 5 }]);

    const feedRes = await call("GET", `/groups/${g.id}/feed`, b.token);
    const feed = feedRes.json();
    expect(feed.items).toHaveLength(4);
    expect(feedRes.body).not.toContain("top-secret-note");
    const annToday = feed.items.find((i: { displayName: string; date: string }) => i.displayName === "Ann" && i.date === today());
    expect(annToday).toMatchObject({ weightKg: null, ate: true, moved: true, score: 3 }); // 2 habits + mood 5

    // Owner switches to showing actual weights.
    expect((await call("PATCH", `/groups/${g.id}`, b.token, { privacy: "actual" })).statusCode).toBe(403);
    expect((await call("PATCH", `/groups/${g.id}`, a.token, { privacy: "actual" })).json().allowedModes).toEqual(["lost", "pct", "weight"]);
    const lb2 = (await call("GET", `/groups/${g.id}/leaderboard`, b.token)).json();
    expect(lb2.rows[0]).toMatchObject({ weightKg: 95, lostKg: 5, pctLost: 5 });
    const w = (await call("GET", `/groups/${g.id}/series?mode=weight`, b.token)).json();
    expect(w.lines.find((l: { displayName: string }) => l.displayName === "Ann").points.at(-1)).toEqual({ date: today(), value: 95 });
  });

  it("shows scale photos to members only when the group allows it", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const g = (await call("POST", "/groups", a.token, { name: "Photos", startDate: today() })).json();
    await call("POST", "/groups/join", b.token, { code: g.joinCode });
    const up = (await call("POST", "/uploads/photo-url", a.token, { contentType: "image/jpeg" })).json();
    await weigh(a.token, today(), { weightKg: 70, photoKey: up.key });
    const seen = (await call("GET", `/groups/${g.id}/feed`, b.token)).json().items[0];
    expect(seen.photoUrl).toBeTruthy();
    await call("PATCH", `/groups/${g.id}`, a.token, { photosVisible: false });
    const hidden = (await call("GET", `/groups/${g.id}/feed`, b.token)).json().items[0];
    expect(hidden.photoUrl).toBeNull();
    expect((await call("GET", `/groups/${g.id}/feed`, a.token)).json().items[0].photoUrl).toBeTruthy(); // you always see your own
  });

  it("lets only the owner manage; regenerate, remove, transfer, leave and end work", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const c = await newUser("Cy");
    const g = (await call("POST", "/groups", a.token, { name: "Manage", startDate: today() })).json();
    await call("POST", "/groups/join", b.token, { code: g.joinCode });
    await call("POST", "/groups/join", c.token, { code: g.joinCode });

    expect((await call("POST", `/groups/${g.id}/regenerate-code`, b.token)).statusCode).toBe(403);
    const regen = (await call("POST", `/groups/${g.id}/regenerate-code`, a.token)).json();
    expect(regen.joinCode).not.toBe(g.joinCode);
    expect((await call("GET", `/groups/preview/${g.joinCode}`, b.token)).statusCode).toBe(404); // old code is dead

    expect((await call("DELETE", `/groups/${g.id}/members/${c.id}`, b.token)).statusCode).toBe(403);
    expect((await call("DELETE", `/groups/${g.id}/members/${c.id}`, a.token)).statusCode).toBe(200);
    expect((await call("GET", `/groups/${g.id}`, c.token)).statusCode).toBe(404); // removed member lost access
    expect((await call("GET", `/groups/${g.id}`, a.token)).json().memberCount).toBe(2);

    expect((await call("POST", `/groups/${g.id}/transfer`, a.token, { userId: c.id })).statusCode).toBe(400); // c is no longer a member
    const tr = await call("POST", `/groups/${g.id}/transfer`, a.token, { userId: b.id });
    expect(tr.json().role).toBe("member");
    expect((await call("GET", `/groups/${g.id}`, b.token)).json()).toMatchObject({ role: "owner", ownerName: "Bo" });

    // New owner leaves -> ownership falls to the remaining member.
    expect((await call("POST", `/groups/${g.id}/leave`, b.token)).statusCode).toBe(200);
    expect((await call("GET", `/groups/${g.id}`, a.token)).json()).toMatchObject({ role: "owner", memberCount: 1 });

    // Ending freezes the group and blocks joins / edits.
    await weigh(a.token, today(), { weightKg: 80 });
    const ended = await call("POST", `/groups/${g.id}/end`, a.token);
    expect(ended.json()).toMatchObject({ status: "ended", endDate: today(), winner: { displayName: "Ann" } });
    expect((await call("POST", "/groups/join", c.token, { code: regen.joinCode })).json().error.code).toBe("GROUP_ENDED");
    expect((await call("PATCH", `/groups/${g.id}`, a.token, { name: "x" })).statusCode).toBe(409);
    expect((await call("GET", `/groups/${g.id}/leaderboard`, a.token)).json().status).toBe("ended"); // still readable
  });

  it("finalizes automatically once the end date has passed", async () => {
    const a = await newUser("Ann");
    const b = await newUser("Bo");
    const start = addDays(today(), -6);
    const end = addDays(today(), -1);
    const g = (await call("POST", "/groups", a.token, { name: "Done", startDate: start, endDate: today() })).json();
    await call("POST", "/groups/join", b.token, { code: g.joinCode });
    await db.group.update({ where: { id: g.id }, data: { endDate: new Date(`${end}T00:00:00Z`) } }); // the end date "passes"
    await weigh(a.token, start, { weightKg: 100 });
    await weigh(a.token, end, { weightKg: 98 });
    await weigh(b.token, start, { weightKg: 100 });
    await weigh(b.token, end, { weightKg: 95 });
    await weigh(b.token, today(), { weightKg: 60 }); // after the end: must not count

    const lb = (await call("GET", `/groups/${g.id}/leaderboard`, a.token)).json();
    expect(lb.status).toBe("ended");
    expect(lb.rows[0]).toMatchObject({ displayName: "Bo", rank: 1, pctLost: 5 });
    expect((await call("GET", `/groups/${g.id}`, a.token)).json().winner).toMatchObject({ displayName: "Bo" });
    const bad = await call("POST", "/groups", a.token, { name: "Bad", startDate: today(), endDate: addDays(today(), -1) });
    expect(bad.statusCode).toBe(400);
  });

  it("serves a join-link landing page", async () => {
    const ok = await app.inject({ method: "GET", url: "/join/abc234" });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("weighinduel://join?code=ABC234");
    const bad = await app.inject({ method: "GET", url: `/join/${encodeURIComponent('"><script>x</script>')}` });
    expect(bad.body).not.toContain("<script>x");
  });
});
