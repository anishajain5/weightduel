import { Prisma, PrismaClient } from "@prisma/client";

export type Db = PrismaClient;

export function createDb(): Db {
  return new PrismaClient();
}

/** Retry on CockroachDB serialization failures (SQLSTATE 40001 / Prisma P2034). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const retriable =
        (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") ||
        (e instanceof Error && /40001|restart transaction/i.test(e.message));
      if (!retriable || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 25 * 2 ** i));
    }
  }
}
