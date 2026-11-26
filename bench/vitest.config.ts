import { defineConfig } from "vitest/config";

// Benchmarks run on demand only (bun run bench), one file at a time for stable timings
export default defineConfig({
  test: {
    include: ["bench/**/*.perf.ts"],
    fileParallelism: false,
    testTimeout: 600_000,
  },
});
