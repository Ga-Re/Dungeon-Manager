// Deliberately under-covered project: coverage-gate.test.js expects this run to fail.
import { defineConfig } from "vitest/config";
import { coverageThresholds } from "../../coverage.js";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text-summary"],
      thresholds: coverageThresholds(),
    },
  },
});
