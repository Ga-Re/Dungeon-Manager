// Settings shared by the E2E and visual Playwright configs.
import { join } from "node:path";

export const repoRoot = join(import.meta.dirname, "..", "..");

/** Specs live next to the code they test: `<package>/playwright/{e2e,visual}/*.spec.ts`. */
export const testIgnore = [
  "**/node_modules/**",
  "**/dist/**",
  "**/dist-e2e/**",
];
