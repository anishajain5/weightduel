import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers";

describe("GET /healthz", () => {
  it("returns ok", async () => {
    const { app } = makeTestApp();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
