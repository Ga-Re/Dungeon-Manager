// E2E tests (ARCHITECTURE §12). Run with `pnpm test:e2e`.
import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { repoRoot, testIgnore } from "./shared.js";

export default defineConfig({
  testDir: repoRoot,
  testMatch: "**/playwright/e2e/**/*.spec.ts",
  testIgnore,
  outputDir: join(repoRoot, "test-results", "e2e"),
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: join(repoRoot, "playwright-report", "e2e"),
      },
    ],
  ],
  forbidOnly: Boolean(process.env.CI),
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
