// Shared ESLint flat config for the whole workspace (ADR-0009: TypeScript strict, no `any`).
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * Builds the workspace ESLint config.
 * @param {string} rootDir absolute path of the repository root (for type-aware linting)
 */
export function createConfig(rootDir) {
  return defineConfig(
    globalIgnores([
      "**/dist/",
      // Build output of the DM-window E2E harness (T-130a).
      "**/dist-e2e/",
      "**/coverage/",
      "**/.turbo/",
      "**/target/",
      // Deliberately broken projects used by tooling self-tests.
      "tooling/*/fixtures/",
      "test-results/",
      "playwright-report/",
    ]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: rootDir },
      },
    },
    {
      // Plain JS is only used for tooling scripts and configs running on Node.
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: {
          console: "readonly",
          process: "readonly",
          fetch: "readonly",
          setTimeout: "readonly",
        },
      },
    },
  );
}
