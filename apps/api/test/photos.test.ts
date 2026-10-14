import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { todayInTz } from "@wid/shared";
import { buildApp } from "../src/app";
import { MemoryMailer } from "../src/mailer";
import { DbStorage } from "../src/storage";
import { hasDb, testEnv } from "./helpers";

const db = new PrismaClient();
const app = buildApp({ db, env: testEnv(), mailer: new MemoryMailer() });
let n = 0;
const nextIp = () => `10.6.${Math.floor(n / 250)}.${(n++ % 250) + 1}`;
const uniq = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@test.invalid`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");

function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, token?: string, payload?: unknown) {
  return app.inject({ method, url, payload: payload as object | undefined, remoteAddress: nextIp(), headers: token ? { authorization: `Bearer ${token}` } : {} });
}
const put = (url: string, body: Buffer, type = "image/jpeg") =>
  app.inject({ method: "PUT", url: pathOf(url), payload: body, remoteAddress: nextIp(), headers: { "content-type": type } });

describe.skipIf(!hasDb)("photos stored in the database (integration, real DB)", () => {
  beforeAll(() => app.ready());
  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { endsWith: "@test.invalid" } } });
    await db.rateEvent.deleteMany({ where: { key: { contains: "10.6." } } });
    await db.$disconnect();
  });

  it("uses DbStorage when R2 isn't configured", () => {
    const storage = (app as unknown as { storage?: unknown }).storage;
    expect(storage === undefined || storage instanceof DbStorage).toBe(true);
  });

  it("uploads, serves, and deletes a photo end to end, and rejects bad requests", async () => {
    const su = await call("POST", "/auth/signup", undefined, { displayName: "Pia", email: uniq(), password: "correct horse battery", acceptTerms: true });
    const token = su.json().accessToken as string;
    const d = todayInTz("UTC");

    const up = (await call("POST", "/uploads/photo-url", token, { contentType: "image/jpeg" })).json();
    expect(up.uploadUrl).toContain("/photos/upload?");

    expect((await put(up.uploadUrl.replace(/sig=[^&]+/, "sig=deadbeef"), JPEG)).statusCode).toBe(403); // bad signature
    expect((await put(up.uploadUrl, Buffer.from("not an image at all, just text"))).statusCode).toBe(400); // not an image
    expect((await put(up.uploadUrl, Buffer.concat([JPEG, Buffer.alloc(460_000)]))).statusCode).toBe(413); // too big
    expect((await put(up.uploadUrl, JPEG)).statusCode).toBe(200);
    expect((await put(up.uploadUrl, JPEG)).statusCode).toBe(409); // link is single-use

    expect((await call("PUT", `/weigh-ins/${d}`, token, { weightKg: 70, photoKey: up.key })).statusCode).toBe(200);
    const entry = (await call("GET", `/weigh-ins?from=${d}&to=${d}`, token)).json().entries[0];
    expect(entry.photoUrl).toContain("/photos/file?");

    const file = await app.inject({ method: "GET", url: pathOf(entry.photoUrl), remoteAddress: nextIp() });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/jpeg");
    expect(file.rawPayload.equals(JPEG)).toBe(true);
    expect((await app.inject({ method: "GET", url: pathOf(entry.photoUrl).replace(/sig=[^&]+/, "sig=00"), remoteAddress: nextIp() })).statusCode).toBe(403);

    expect((await call("DELETE", `/weigh-ins/${d}`, token)).statusCode).toBeLessThan(300);
    expect(await db.photo.count({ where: { key: up.key } })).toBe(0); // photo removed with its entry
  });
});
