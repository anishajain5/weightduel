import { describe, expect, it } from "vitest";
import { changeEmailSchema, emailSchema, passwordSchema, signupSchema } from "./auth";

describe("auth schemas", () => {
  it("normalises email", () => {
    expect(emailSchema.parse("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("rejects short and common passwords", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("Password123").success).toBe(false);
    expect(passwordSchema.safeParse("correct horse battery").success).toBe(true);
  });
  it("requires accepting terms", () => {
    const base = { displayName: "A", email: "a@b.co", password: "correct horse battery" };
    expect(signupSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
  });
  it("accepts both change-email steps", () => {
    expect(changeEmailSchema.safeParse({ newEmail: "x@y.co", password: "pw" }).success).toBe(true);
    expect(changeEmailSchema.safeParse({ newEmail: "x@y.co", code: "123456" }).success).toBe(true);
    expect(changeEmailSchema.safeParse({ newEmail: "x@y.co", code: "12" }).success).toBe(false);
  });
});
