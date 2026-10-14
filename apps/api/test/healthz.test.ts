import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
