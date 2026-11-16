import { defineConfig } from "vitest/config";
import { coverageThresholds } from "./tooling/vitest/coverage.js";

export default defineConfig({
  test: {
    include: [
      "{apps,packages,tooling}/*/src/**/*.test.{ts,tsx}",
      "tooling/*/*.test.js",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/fixtures/**"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text-summary", "html"],
      thresholds: coverageThresholds(),
    },
  },
});
