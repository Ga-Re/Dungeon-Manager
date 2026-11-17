// Screenshot tests (ARCHITECTURE §12). They must run inside the pinned Docker image so
// fonts and GPU emulation are identical everywhere: use `pnpm test:visual`, never run directly.
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { repoRoot, testIgnore } from "./shared.js";

export default defineConfig({
  testDir: repoRoot,
  testMatch: "**/playwright/visual/**/*.spec.ts",
  testIgnore,
  outputDir: join(repoRoot, "test-results", "visual"),
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: join(repoRoot, "playwright-report", "visual"),
      },
    ],
  ],
  forbidOnly: Boolean(process.env.CI),
  // Golden screenshots live in test-fixtures (ARCHITECTURE §3), mirroring the spec path.
  snapshotPathTemplate:
    "{testDir}/packages/test-fixtures/golden/{testFilePath}/{arg}{ext}",
  // Pixel-exact: the pinned image renders deterministically, and small colour shifts
  // (e.g. fog opacity) are exactly what these tests must catch.
  expect: { toHaveScreenshot: { maxDiffPixels: 0, threshold: 0 } },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 640, height: 360 },
        deviceScaleFactor: 1,
        // WebGL for the renderer through SwiftShader: software rendering is slow but identical
        // on every machine, which pixel-exact goldens need.
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
  ],
});
