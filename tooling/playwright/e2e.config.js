// E2E tests (ARCHITECTURE §12). Run with `pnpm test:e2e`.
import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { repoRoot, testIgnore } from "./shared.js";

// Companion production build served by `vite preview` (port set in apps/companion/vite.config.js).
const COMPANION_URL = "http://localhost:4174/";
// DM-window harness (T-130a) served by `vite preview` (port set in apps/desktop/vite.config.js).
const DM_HARNESS_URL = "http://localhost:4175/e2e.html";

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
  // Specs that load the companion use relative URLs; file:// fixtures are unaffected.
  use: { baseURL: COMPANION_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    // The companion is tested as its production build, served like the desktop backend will.
    {
      command:
        "pnpm exec turbo run build --filter=@dungeon-manager/companion... && pnpm --filter @dungeon-manager/companion preview",
      cwd: repoRoot,
      url: COMPANION_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    // The DM window runs as a browser build with in-memory platform services (no Tauri).
    {
      command:
        "pnpm exec turbo run build --filter=@dungeon-manager/desktop^... && pnpm --filter @dungeon-manager/desktop build:e2e && pnpm --filter @dungeon-manager/desktop preview:e2e",
      cwd: repoRoot,
      url: DM_HARNESS_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
