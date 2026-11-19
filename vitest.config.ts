import { defineConfig } from "vitest/config";

export default defineConfig({
  // Each test file packs the plugins it renders; packing many in parallel can pass 5 s
  test: {
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
    testTimeout: 30000,
  },
});
