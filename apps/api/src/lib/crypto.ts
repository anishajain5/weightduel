import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 32 random bytes, URL-safe. Used for refresh and reset tokens. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Keyed hash so a leaked DB alone cannot be used to brute-force 6-digit codes. */
export function hashSecret(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
