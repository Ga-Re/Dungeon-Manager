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

const REACT = npm(
  "react",
  "react-dom",
  "react-native",
  "@testing-library/react",
);
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

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    // core and schema are allow-listed: anything not listed is a violation,
    // including Node built-ins, browser libraries and unresolvable modules.
    forbid(
      "core-only-schema",
      "core is pure: it may only depend on schema (no I/O, no UI, no platform APIs).",
      { path: "^packages/core/" },
      { pathNot: pkg("core", "schema") },
    ),
    forbid(
      "schema-only-zod",
      "schema may only depend on zod.",
      { path: "^packages/schema/" },
      { pathNot: `${pkg("schema")}|${ZOD}` },
    ),
    forbid(
      "renderer-only-core-schema-pixi",
      "renderer may only depend on core, schema and PixiJS.",
      { path: "^packages/renderer/" },
      { pathNot: `${pkg("renderer", "core", "schema")}|${PIXI}` },
    ),

    // The other packages are deny-listed per the "must NOT depend on" column.
    forbid(
      "protocol-boundaries",
      "protocol may depend on core and schema only; no UI, renderer or I/O.",
      { path: "^packages/protocol/" },
      {
        path: [
          otherPackages("protocol", "core", "schema"),
          REACT,
          PIXI,
          TAURI,
          EXPO,
        ],
      },
    ),
    forbid(
      "storage-boundaries",
      "storage may depend on core and schema only; no UI, renderer, and no real FS (use the injected adapter).",
      { path: "^packages/storage/" },
      {
        path: [
          otherPackages("storage", "core", "schema"),
          REACT,
          PIXI,
          TAURI,
          EXPO,
        ],
      },
    ),
    forbid(
      "ui-boundaries",
      "ui may depend on core, schema, i18n and React; not on Tauri, Expo or renderer internals.",
      { path: "^packages/ui/" },
      {
        path: [
          otherPackages("ui", "core", "schema", "i18n", "renderer"),
          "^packages/renderer/src/|^@dungeon-manager/renderer/",
          TAURI,
          EXPO,
        ],
      },
    ),
    forbid(
      "no-io-in-pure-packages",
      "protocol and storage must not use Node built-ins (I/O goes through injected adapters).",
      { path: "^packages/(protocol|storage)/" },
      { dependencyTypes: ["core"] },
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
