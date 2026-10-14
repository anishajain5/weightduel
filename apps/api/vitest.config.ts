import { defineConfig } from "vitest/config";

export default defineConfig({
  // Integration tests talk to a remote CockroachDB cluster; allow for network latency.
  test: { testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
