// Module boundaries from ARCHITECTURE.md §4, enforced by dependency-cruiser.
// Paths are relative to the directory depcruise runs in (the repository root,
// or a fixture root in verify-rules.js).

/** Matches a workspace package, whether resolved to its folder or left unresolved by name. */
const pkg = (...names) => {
  const group = `(${names.join("|")})`;
  return `^packages/${group}/|^@dungeon-manager/${group}(/|$)`;
};

/** Matches a third-party npm module, resolved (inside node_modules) or unresolved. */
const npm = (...patterns) => {
  const group = `(${patterns.join("|")})`;
  return `(^|/)node_modules/${group}(/|$)|^${group}(/|$)`;
};

const PIXI = npm("pixi\\.js", "@pixi/[^/]+");
const TAURI = npm("@tauri-apps/[^/]+");
const EXPO = npm("expo", "expo-[^/]+", "@expo/[^/]+");
const ZOD = npm("zod");
const APPS = "^apps/";

/** Every package except the listed ones (to forbid workspace edges not in the "may depend on" column). */
const ALL_PACKAGES = [
  "core",
  "schema",
  "protocol",
  "storage",
  "renderer",
  "ui",
  "i18n",
  "test-fixtures",
];
const otherPackages = (...allowed) =>
  pkg(...ALL_PACKAGES.filter((name) => !allowed.includes(name)));

const forbid = (name, comment, from, to) => ({
  name,
  comment,
  severity: "error",
  from,
  to,
});

// Co-located unit tests (src/.../name.test.ts), see ARCHITECTURE §12.
const TEST_FILE = "\\.test\\.tsx?$";
// Test-only tools (dev dependencies, never shipped).
const VITEST = npm("vitest", "fast-check");
// Pure polygon boolean operations for fog of war (DM-approved, T-102a).
const POLYCLIP = npm("polyclip-ts");

/**
 * Allow-list rule for a package's production code, plus a twin rule for its tests:
 * tests get exactly the same allow-list and may additionally import Vitest.
 */
const allowOnly = (name, comment, packageName, allowed) => [
  forbid(
    name,
    comment,
    { path: `^packages/${packageName}/`, pathNot: TEST_FILE },
    { pathNot: allowed },
  ),
  forbid(
    `${name}-in-tests`,
    `${comment} Tests may additionally import Vitest.`,
    { path: `^packages/${packageName}/.*${TEST_FILE}` },
    { pathNot: `${allowed}|${VITEST}` },
  ),
];

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    // core, schema, renderer, protocol and storage are allow-listed: anything not listed is a violation,
    // including Node built-ins, browser libraries and unresolvable modules.
    ...allowOnly(
      "core-only-schema",
      "core is pure: it may only depend on schema and polyclip-ts (no I/O, no UI, no platform APIs).",
      "core",
      `${pkg("core", "schema")}|${POLYCLIP}`,
    ),
    ...allowOnly(
      "schema-only-zod",
      "schema may only depend on zod.",
      "schema",
      `${pkg("schema")}|${ZOD}`,
    ),
    ...allowOnly(
      "renderer-only-core-schema-pixi",
      "renderer may only depend on core, schema and PixiJS.",
      "renderer",
      `${pkg("renderer", "core", "schema")}|${PIXI}`,
    ),

    ...allowOnly(
      "protocol-only-core-schema",
      "protocol may only depend on core, schema and zod for message validation (no UI, renderer or I/O). Approved libraries are added here explicitly.",
      "protocol",
      `${pkg("protocol", "core", "schema")}|${ZOD}`,
    ),
    ...allowOnly(
      "storage-only-core-schema",
      "storage may only depend on core and schema (no UI, renderer or real FS; use the injected adapter). Approved libraries are added here explicitly.",
      "storage",
      pkg("storage", "core", "schema"),
    ),

    // ui uses many web libraries, so it is deny-listed per the "must NOT depend on" column.
    // Its public renderer entry point is allowed (ARCHITECTURE §4); anything deeper is an internal.
    forbid(
      "ui-boundaries",
      "ui may depend on core, schema, i18n and React; not on Tauri, Expo or renderer internals.",
      { path: "^packages/ui/" },
      {
        path: [
          otherPackages("ui", "core", "schema", "i18n", "renderer"),
          "^packages/renderer/|^@dungeon-manager/renderer/",
          TAURI,
          EXPO,
        ],
        pathNot: "^packages/renderer/dist/index\\.(js|d\\.ts)$",
      },
    ),
    forbid(
      "packages-not-to-apps",
      "Packages must never import from apps.",
      { path: "^packages/" },
      { path: APPS },
    ),
    forbid(
      "apps-not-to-other-apps",
      "Apps must not import from other apps.",
      { path: "^apps/([^/]+)/" },
      { path: "^apps/", pathNot: "^apps/$1/" },
    ),
    forbid(
      "mobile-not-web-only",
      "apps/mobile must not import the web-only renderer or ui packages.",
      { path: "^apps/mobile/" },
      { path: pkg("renderer", "ui") },
    ),

    // General hygiene.
    forbid(
      "no-circular",
      "Circular dependencies make modules hard to reason about.",
      {},
      { circular: true },
    ),
    forbid(
      "not-to-unresolvable",
      "Imports must resolve (missing dependency or typo).",
      {},
      { couldNotResolve: true },
    ),
  ],
  options: {
    // Only src/ folders are cruised (see the `boundaries` script). Workspace imports resolve
    // to a package's dist/, which must stay a visible target so the rules above can match it;
    // excluding dist/ would silently drop those edges.
    doNotFollow: { path: ["node_modules", "/dist/"] },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".d.ts"],
    },
  },
};
