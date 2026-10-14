import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, makeTestApp } from "./helpers";

const { app, db, mailer } = makeTestApp();
const PW = "correct horse battery";
let ipCounter = 0;
const nextIp = () => `10.9.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const uniq = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;

type Opts = { ip?: string; token?: string };
function post(url: string, payload: unknown, o: Opts = {}) {
  return app.inject({
    method: "POST",
    url,
    payload: payload as object,
    remoteAddress: o.ip ?? nextIp(),
    headers: o.token ? { authorization: `Bearer ${o.token}` } : {},
  });
}
const codeFrom = (to: string) => /\b(\d{6})\b/.exec(mailer.last(to)!.text)![1]!;
const tokenFrom = (to: string) => /token=([\w-]+)/.exec(mailer.last(to)!.text)![1]!;

async function signup(email = uniq(), ip?: string) {
  const res = await post("/auth/signup", { displayName: "Tess", email, password: PW, acceptTerms: true }, { ip });
  return { res, email, body: res.json() };
}

describe.skipIf(!hasDb)("auth (integration, real DB)", () => {
  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({
      where: { OR: [{ key: { contains: "@test.invalid" } }, { key: { contains: ":10.9." } }] },
    });
    await db.$disconnect();
  });

  it("signs up, verifies by code, and /me reflects it", async () => {
    const { res, email, body } = await signup();
    expect(res.statusCode).toBe(201);
    expect(body.user.emailVerified).toBe(false);
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const bad = await post("/auth/verify-email", { code: "000000" }, { token: body.accessToken });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("INVALID_CODE");

    const ok = await post("/auth/verify-email", { code: codeFrom(email) }, { token: body.accessToken });
    expect(ok.json()).toEqual({ verified: true });
    const me = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${body.accessToken}` } });
    expect(me.json().emailVerified).toBe(true);
  });

  it("stores the password as argon2id and never the plain text", async () => {
    const { email } = await signup();
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(u.passwordHash).not.toContain(PW);
  });

  it("rejects duplicate email and weak passwords", async () => {
    const { email } = await signup();
    const dup = await post("/auth/signup", { displayName: "X", email: email.toUpperCase(), password: PW, acceptTerms: true });
    expect(dup.statusCode).toBe(409);
    const weak = await post("/auth/signup", { displayName: "X", email: uniq(), password: "password123", acceptTerms: true });
    expect(weak.statusCode).toBe(400);
  });

  it("locks the code after 5 wrong attempts, even if the right code follows", async () => {
    const { email, body } = await signup();
    const right = codeFrom(email);
    const wrong = right === "111111" ? "222222" : "111111";
    for (let i = 0; i < 5; i++) {
      expect((await post("/auth/verify-email", { code: wrong }, { token: body.accessToken })).json().error.code).toBe("INVALID_CODE");
    }
    const res = await post("/auth/verify-email", { code: right }, { token: body.accessToken });
    expect(res.json().error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("enforces a 60s cooldown on resend-code", async () => {
    const { body } = await signup();
    const res = await post("/auth/resend-code", {}, { token: body.accessToken });
    expect(res.statusCode).toBe(429);
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("gives the same error for unknown email and wrong password, then locks out after 5 failures", async () => {
    const { email } = await signup();
    const ip = nextIp();
    const unknown = await post("/auth/login", { email: uniq(), password: PW }, { ip });
    const wrong = await post("/auth/login", { email, password: "nope-nope-nope" }, { ip });
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json().error.message).toBe("Email or password is incorrect");

    for (let i = 0; i < 3; i++) await post("/auth/login", { email, password: "nope-nope-nope" }, { ip: nextIp() });
    // 4 failures so far + this one = 5
    await post("/auth/login", { email, password: "nope-nope-nope" }, { ip: nextIp() });
    const locked = await post("/auth/login", { email, password: PW }, { ip: nextIp() });
    expect(locked.statusCode).toBe(429);
  });

  it("rotates refresh tokens and kills every session if an old one is replayed", async () => {
    const { email } = await signup();
    const login = (await post("/auth/login", { email, password: PW })).json();
    const r1 = login.refreshToken;
    const rotated = await post("/auth/refresh", { refreshToken: r1 });
    expect(rotated.statusCode).toBe(200);
    const r2 = rotated.json().refreshToken;
    expect(r2).not.toBe(r1);

    expect((await post("/auth/refresh", { refreshToken: r1 })).statusCode).toBe(401); // replay
    expect((await post("/auth/refresh", { refreshToken: r2 })).statusCode).toBe(401); // family revoked
  });

  it("logout revokes the token; logout-all revokes every device", async () => {
    const { email } = await signup();
    const a = (await post("/auth/login", { email, password: PW })).json();
    const b = (await post("/auth/login", { email, password: PW })).json();
    expect((await post("/auth/logout", { refreshToken: a.refreshToken })).statusCode).toBe(204);
    expect((await post("/auth/refresh", { refreshToken: a.refreshToken })).statusCode).toBe(401);

    const c = (await post("/auth/login", { email, password: PW })).json();
    expect((await post("/auth/logout-all", {}, { token: c.accessToken })).statusCode).toBe(204);
    expect((await post("/auth/refresh", { refreshToken: b.refreshToken })).statusCode).toBe(401);
  });

  it("forgot/reset: end to end, single use, revokes old sessions", async () => {
    const { email, body } = await signup();
    const NEW = "a brand new passphrase";

    const f = await post("/auth/forgot-password", { email });
    expect(f.statusCode).toBe(200);
    const token = tokenFrom(email);
    const stored = await db.emailToken.findFirstOrThrow({ where: { purpose: "reset", user: { email } } });
    expect(stored.tokenHash).not.toContain(token); // stored hashed

    expect((await post("/auth/reset-password", { token, newPassword: "short" })).statusCode).toBe(400);
    expect((await post("/auth/reset-password", { token, newPassword: NEW })).statusCode).toBe(200);
    expect(mailer.last(email)!.subject).toMatch(/password was changed/i);

    expect((await post("/auth/reset-password", { token, newPassword: "yet another passphrase" })).statusCode).toBe(400); // single use
    expect((await post("/auth/refresh", { refreshToken: body.refreshToken })).statusCode).toBe(401); // old session dead
    expect((await post("/auth/login", { email, password: PW })).statusCode).toBe(401);
    expect((await post("/auth/login", { email, password: NEW })).statusCode).toBe(200);
  });

  it("forgot-password reveals nothing and is limited to 3/hour per email", async () => {
    const ghost = uniq();
    const before = mailer.sent.length;
    const r = await post("/auth/forgot-password", { email: ghost });
    const { email } = await signup();
    const real = await post("/auth/forgot-password", { email });
    expect(r.json()).toEqual(real.json());
    expect(mailer.sent.length).toBe(before + 2); // signup code + 1 reset (none for ghost)

    await post("/auth/forgot-password", { email });
    await post("/auth/forgot-password", { email });
    const count = mailer.sent.filter((m) => m.to === email && /reset/i.test(m.subject)).length;
    expect(count).toBe(3);
    await post("/auth/forgot-password", { email });
    expect(mailer.sent.filter((m) => m.to === email && /reset/i.test(m.subject)).length).toBe(3);
  });

  it("rejects an expired reset token", async () => {
    const { email } = await signup();
    await post("/auth/forgot-password", { email });
    const token = tokenFrom(email);
    await db.emailToken.updateMany({ where: { purpose: "reset", user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await post("/auth/reset-password", { token, newPassword: "a brand new passphrase" });
    expect(res.json().error.code).toBe("INVALID_TOKEN");
  });

  it("change-password needs the current password and returns a fresh session", async () => {
    const { email, body } = await signup();
    const bad = await post("/auth/change-password", { currentPassword: "wrong-wrong", newPassword: "another good passphrase" }, { token: body.accessToken });
    expect(bad.json().error.code).toBe("WRONG_PASSWORD");
    const ok = await post("/auth/change-password", { currentPassword: PW, newPassword: "another good passphrase" }, { token: body.accessToken });
    expect(ok.statusCode).toBe(200);
    expect((await post("/auth/refresh", { refreshToken: body.refreshToken })).statusCode).toBe(401);
    expect((await post("/auth/login", { email, password: "another good passphrase" })).statusCode).toBe(200);
  });

  it("change-email: code goes to the new address; login works with it afterwards", async () => {
    const { email, body } = await signup();
    const next = uniq();
    const s1 = await post("/auth/change-email", { newEmail: next, password: PW }, { token: body.accessToken });
    expect(s1.statusCode).toBe(200);
    const code = codeFrom(next);
    expect((await post("/auth/change-email", { newEmail: next, code: code === "123456" ? "654321" : "123456" }, { token: body.accessToken })).statusCode).toBe(400);
    expect((await post("/auth/change-email", { newEmail: next, code }, { token: body.accessToken })).json()).toEqual({ email: next });
    expect((await post("/auth/login", { email, password: PW })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: next, password: PW })).statusCode).toBe(200);
  });

  it("protected routes need a valid bearer token", async () => {
    expect((await app.inject({ method: "GET", url: "/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/me", headers: { authorization: "Bearer garbage" } })).statusCode).toBe(401);
  });

  it("serves the reset fallback page and refuses odd tokens", async () => {
    const ok = await app.inject({ method: "GET", url: "/reset?token=" + "a".repeat(43) });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toContain("text/html");
    expect(ok.body).toContain("weighinduel://reset?token=");
    const evil = await app.inject({ method: "GET", url: '/reset?token="><script>alert(1)</script>' });
    expect(evil.body).not.toContain("alert(1)");
  });
});
