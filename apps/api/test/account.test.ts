import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInTz } from "@wid/shared";
import { buildApp } from "../src/app";
import { MemoryMailer } from "../src/mailer";
import { MemoryStorage } from "../src/storage";
import { hasDb, testEnv } from "./helpers";

const db = new PrismaClient();
const mailer = new MemoryMailer();
const app = buildApp({ db, env: testEnv(), mailer, storage: new MemoryStorage() });
let n = 0;
const nextIp = () => `10.2.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `ac-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;
const PW = "correct horse battery";
const call = (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object | undefined, remoteAddress: nextIp(), headers: { authorization: `Bearer ${token}` } });
async function newUser(displayName: string) {
  const email = uniq();
  const res = await app.inject({ method: "POST", url: "/auth/signup", remoteAddress: nextIp(), payload: { displayName, email, password: PW, acceptTerms: true } });
  const b = res.json();
  await db.user.update({ where: { id: b.user.id }, data: { emailVerifiedAt: new Date() } });
  return { token: b.accessToken as string, id: b.user.id as string, email };
}

describe.skipIf(!hasDb)("account export and deletion (integration)", () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.group.deleteMany({ where: { owner: { email: { endsWith: "@test.invalid" } } } });
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: "10.2." } } });
    await db.$disconnect();
  });

  it("emails a CSV export with formula-looking notes neutralised", async () => {
    const u = await newUser("Exporter");
    const day = new Date(`${todayInTz("UTC")}T00:00:00Z`);
    await db.weighIn.create({ data: { userId: u.id, entryDate: day, weightKg: "80.5", notes: "=HYPERLINK(\"x\"), ok" } });
    mailer.sent.length = 0;
    expect((await call("POST", "/me/export", u.token)).statusCode).toBe(202);
    const mail = mailer.sent.find((m) => m.to === u.email)!;
    const csv = mail.attachments![0]!.content;
    expect(csv.split("\n")[0]).toBe("date,weight_kg,ate_well,moved,slept_well,on_plan,mood,notes");
    expect(csv).toContain("80.5");
    expect(csv).toContain(`"'=HYPERLINK(""x""), ok"`);
  });

  it("requires the password, hands owned groups to the longest-standing member, and removes everything", async () => {
    const o = await newUser("Leaving");
    const a = await newUser("Heir");
    const solo = await newUser("Solo");
    const t = todayInTz("UTC");
    const mk = async (tok: string, name: string) => (await call("POST", "/groups", tok, { name, startDate: t, endDate: addDays(t, 10), scoring: "pct" })).json();
    const shared = await mk(o.token, "Shared");
    const alone = await mk(o.token, "Alone");
    await call("POST", "/groups/join", a.token, { code: shared.joinCode });
    await db.weighIn.create({ data: { userId: o.id, entryDate: new Date(`${t}T00:00:00Z`), weightKg: "90" } });
    void solo;

    expect((await call("DELETE", "/me", o.token, { password: "wrong password!!" })).statusCode).toBe(403);
    expect(await db.user.count({ where: { id: o.id } })).toBe(1);

    mailer.sent.length = 0;
    expect((await call("DELETE", "/me", o.token, { password: PW })).statusCode).toBe(204);
    expect(await db.user.count({ where: { id: o.id } })).toBe(0);
    expect(await db.weighIn.count({ where: { userId: o.id } })).toBe(0);
    expect(await db.group.count({ where: { id: alone.id } })).toBe(0);
    expect(await db.group.findUnique({ where: { id: shared.id } })).toMatchObject({ ownerId: a.id });
    expect(await db.groupMember.findUnique({ where: { groupId_userId: { groupId: shared.id, userId: a.id } } })).toMatchObject({ role: "owner" });
    expect(mailer.sent.some((m) => m.to === o.email && /deleted/.test(m.subject))).toBe(true);
    // The old token no longer works.
    expect((await call("GET", "/me", o.token)).statusCode).toBe(401);
  });
});
