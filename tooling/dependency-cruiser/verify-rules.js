// Proves the boundary rules work: runs dependency-cruiser over fixtures that contain
// deliberate violations and fails unless every fixture reports exactly the expected rules.
// Run via `pnpm check` (script `check:boundary-rules`).
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
// Run the CLI through the current Node binary: works on Windows too (no .cmd shim, no PATH).
const depcruiseBin = join(
  here,
  "..",
  "..",
  "node_modules",
  "dependency-cruiser",
  "bin",
  "dependency-cruiser.mjs",
);
const fixtureRoot = join(here, "fixtures");

// Fixtures import packages that do not exist there, so `not-to-unresolvable` fires
// everywhere; it is covered by the real run over the repository instead.
const IGNORED_RULES = new Set(["not-to-unresolvable"]);

/** Fixture file → rules it must violate (and no others). */
const EXPECTED = {
  "packages/core/src/allowed.ts": [],
  "packages/core/src/helper.ts": [],
  "packages/core/src/imports-react.ts": ["core-only-schema"],
  "packages/core/src/imports-node-fs.ts": ["core-only-schema"],
  "packages/core/src/imports-storage.ts": ["core-only-schema"],
  // Workspace imports resolve to dist/; such targets must not be dropped.
  "packages/core/src/imports-built-package.ts": ["core-only-schema"],
  // Tests get the same allow-list plus Vitest; production code never gets Vitest.
  "packages/core/src/uses-vitest.test.ts": [],
  "packages/core/src/imports-node-fs.test.ts": ["core-only-schema-in-tests"],
  "packages/core/src/imports-vitest.ts": ["core-only-schema"],
  // polyclip-ts is allowed in core; fast-check only in its tests.
  "packages/core/src/imports-polyclip.ts": [],
  "packages/core/src/uses-fast-check.test.ts": [],
  "packages/core/src/imports-fast-check.ts": ["core-only-schema"],
  "packages/schema/src/imports-pixi.test.ts": ["schema-only-zod-in-tests"],
  "packages/core/src/cycle-a.ts": ["no-circular"],
  // depcruise reports a cycle once, at the module where it first enters it.
  "packages/core/src/cycle-b.ts": [],
  "packages/schema/src/imports-core.ts": ["schema-only-zod"],
  "packages/renderer/src/imports-react.ts": ["renderer-only-core-schema-pixi"],
  "packages/protocol/src/imports-ui.ts": ["protocol-only-core-schema"],
  "packages/protocol/src/imports-node-fs.ts": ["protocol-only-core-schema"],
  "packages/storage/src/imports-node-fs.ts": ["storage-only-core-schema"],
  "packages/storage/src/imports-renderer.ts": ["storage-only-core-schema"],
  "packages/storage/src/imports-fs-library.ts": ["storage-only-core-schema"],
  "packages/ui/src/imports-tauri.ts": ["ui-boundaries"],
  "packages/ui/src/imports-renderer-internals.ts": ["ui-boundaries"],
  "packages/ui/src/imports-renderer-built-internal.ts": ["ui-boundaries"],
  // Allowed edges must stay allowed (guards against rules that are too broad).
  "packages/ui/src/imports-renderer-entry.ts": [],
  "packages/ui/src/imports-react.ts": [],
  "packages/schema/src/imports-zod.ts": [],
  "packages/renderer/src/imports-pixi.ts": [],
  "packages/protocol/src/imports-core.ts": [],
  // Messages are validated with zod in protocol (ARCHITECTURE §7).
  "packages/protocol/src/imports-zod.ts": [],
  "packages/storage/src/imports-schema.ts": [],
  "packages/i18n/src/imports-app.ts": ["packages-not-to-apps"],
  "apps/companion/src/index.ts": [],
  "apps/desktop/src/imports-other-app.ts": ["apps-not-to-other-apps"],
  "apps/mobile/src/imports-renderer.ts": ["mobile-not-web-only"],
  "apps/mobile/src/imports-core.ts": [],
};

/** Same roots as the `boundaries` script: only src/ folders, so dist/ is a target, never a root. */
function sourceDirs() {
  return ["packages", "apps"].flatMap((group) =>
    readdirSync(join(fixtureRoot, group)).map((name) => `${group}/${name}/src`),
  );
}

function cruiseFixtures() {
  try {
    return execFileSync(
      process.execPath,
      [
        depcruiseBin,
        "--config",
        join(here, "config.js"),
        "--output-type",
        "json",
        ...sourceDirs(),
      ],
      { cwd: fixtureRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    // depcruise exits non-zero when it finds violations, which is the point here.
    if (typeof error.stdout === "string" && error.stdout.startsWith("{"))
      return error.stdout;
    throw error;
  }
}

const { summary, modules } = JSON.parse(cruiseFixtures());

/** @type {Map<string, Set<string>>} */
const actual = new Map(Object.keys(EXPECTED).map((file) => [file, new Set()]));
for (const violation of summary.violations) {
  if (IGNORED_RULES.has(violation.rule.name)) continue;
  const rules = actual.get(violation.from) ?? new Set();
  rules.add(violation.rule.name);
  actual.set(violation.from, rules);
}

const cruised = new Set(modules.map((module) => module.source));
const failures = [];
for (const [file, rules] of actual) {
  const expected = [...(EXPECTED[file] ?? [])].sort().join(", ") || "none";
  const got = [...rules].sort().join(", ") || "none";
  if (!cruised.has(file)) failures.push(`${file}: fixture was not cruised`);
  else if (expected !== got)
    failures.push(`${file}: expected ${expected}, got ${got}`);
}

if (failures.length > 0) {
  console.error(
    "Boundary rule verification failed:\n  " + failures.join("\n  "),
  );
  process.exit(1);
}
console.log(`Boundary rules verified against ${String(actual.size)} fixtures.`);
