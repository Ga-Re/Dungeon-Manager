// Proves the coverage gate works: a project below the threshold must fail Vitest.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "vitest";

const fixture = join(import.meta.dirname, "fixtures", "under-covered");

test("coverage below the threshold fails the run", { timeout: 60_000 }, () => {
  const result = spawnSync("vitest", ["run", "--coverage", "--root", fixture], {
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const output = result.stdout + result.stderr;

  expect(output).toMatch(/1 passed/);
  expect(output).toMatch(
    /Coverage for (lines|branches) .* does not meet "packages\/core\/src\/\*\*" threshold/,
  );
  expect(result.status).not.toBe(0);
});
