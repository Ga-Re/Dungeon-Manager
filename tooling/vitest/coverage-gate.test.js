// Proves the coverage gate works: a project below the threshold must fail Vitest.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

const fixture = join(import.meta.dirname, "fixtures", "under-covered");
// Run the CLI through the current Node binary: works on Windows too (no .cmd shim, no PATH).
const vitestBin = join(
  dirname(createRequire(import.meta.url).resolve("vitest/package.json")),
  "vitest.mjs",
);

test("coverage below the threshold fails the run", { timeout: 60_000 }, () => {
  const result = spawnSync(
    process.execPath,
    [vitestBin, "run", "--coverage", "--root", fixture],
    {
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    },
  );
  const output = result.stdout + result.stderr;

  expect(output).toMatch(/1 passed/);
  expect(output).toMatch(
    /Coverage for (lines|branches) .* does not meet "packages\/core\/src\/\*\*" threshold/,
  );
  expect(result.status).toBe(1);
});
