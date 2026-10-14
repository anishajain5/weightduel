import type { Db } from "../db";

/** DB-backed sliding window so limits survive restarts and work across instances. */
export class RateLimiter {
  constructor(private db: Db) {}

  async count(key: string, windowSec: number): Promise<number> {
    return this.db.rateEvent.count({
      where: { key, createdAt: { gt: new Date(Date.now() - windowSec * 1000) } },
    });
  }

  async hit(key: string): Promise<void> {
    await this.db.rateEvent.create({ data: { key } });
  }

  /** True if `key` already has >= max events in the window. */
  async isLimited(key: string, max: number, windowSec: number): Promise<boolean> {
    return (await this.count(key, windowSec)) >= max;
  }

  async prune(olderThanSec = 24 * 3600): Promise<void> {
    await this.db.rateEvent.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - olderThanSec * 1000) } },
    });
  }
}
