import { AI_LIMITS } from "@wid/shared";
import type { Db } from "../db";
import type { Env } from "../env";
import { HttpError, tooMany } from "../lib/errors";

export type Feature = keyof typeof AI_LIMITS;
const FEATURE_NAME: Record<Feature, string> = { scale: "scale_read", coach: "coach", recipe: "recipe" };

/** USD per million tokens (input, output). Estimates only; unknown models fall back to the Sonnet rate. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [1, 5],
  "claude-sonnet-5-5": [3, 15],
  "claude-opus-5-5": [15, 75],
};
export const estimateCostUsd = (model: string, inTok: number, outTok: number) => {
  const [i, o] = PRICES[model] ?? [3, 15];
  return (inTok * i + outTok * o) / 1_000_000;
};

const DAY_MS = 24 * 3600 * 1000;
const RESTING = "AI features are resting until tomorrow. Everything else still works.";

export class AiGate {
  constructor(private db: Db, private env: Env, private warn: (msg: string) => void = () => {}) {}

  /** Throws 503 if no key is configured or today's spend cap is reached; 429 if the user's daily limit is used up. */
  async check(userId: string, feature: Feature): Promise<void> {
    const since = new Date(Date.now() - DAY_MS);
    const [used, spend] = await Promise.all([
      this.db.aiUsage.count({ where: { userId, feature: FEATURE_NAME[feature], createdAt: { gt: since }, status: { in: ["ok", "error"] } } }),
      this.db.aiUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gt: since } } }),
    ]);
    if (Number(spend._sum.costUsd ?? 0) >= this.env.AI_DAILY_BUDGET_USD) {
      this.warn(`AI daily budget of $${this.env.AI_DAILY_BUDGET_USD} reached`);
      throw new HttpError(503, "AI_RESTING", RESTING);
    }
    if (used >= AI_LIMITS[feature]) {
      throw tooMany(`You've used today's ${AI_LIMITS[feature]} ${feature === "scale" ? "scale reads" : feature === "coach" ? "coach reads" : "recipes"}. Try again tomorrow.`);
    }
  }

  async log(userId: string, feature: Feature, model: string, r: { inputTokens: number; outputTokens: number }, startedAt: number, status: string) {
    try {
      await this.db.aiUsage.create({
        data: {
          userId, feature: FEATURE_NAME[feature], model, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
          costUsd: estimateCostUsd(model, r.inputTokens, r.outputTokens).toFixed(6), latencyMs: Date.now() - startedAt, status,
        },
      });
    } catch (e) {
      this.warn(`ai_usage log failed: ${(e as Error).message}`);
    }
  }
}
