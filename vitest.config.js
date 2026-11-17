import { defineConfig } from "vitest/config";
import { coverageThresholds } from "./tooling/vitest/coverage.js";

const exclude = ["**/node_modules/**", "**/dist/**", "**/fixtures/**"];

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "{apps,packages}/*/src/**/*.test.ts",
            "tooling/*/*.test.js",
          ],
          exclude,
        },
      },
      {
        // React component tests (*.test.tsx) run in jsdom.
        extends: true,
        test: {
          name: "component",
          include: ["{apps,packages}/*/src/**/*.test.tsx"],
          exclude,
          environment: "jsdom",
          setupFiles: ["./tooling/vitest/setup-dom.js"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/*.test-data.ts"],
      reporter: ["text-summary", "html"],
      thresholds: coverageThresholds(),
    },
  },
});
