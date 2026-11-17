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
  // The companion is tested as its production build, served like the desktop backend will.
  webServer: {
    command:
      "pnpm exec turbo run build --filter=@dungeon-manager/companion... && pnpm --filter @dungeon-manager/companion preview",
    cwd: repoRoot,
    url: "http://localhost:4174/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
