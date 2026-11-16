// Coverage gates from ADR-0009 / ARCHITECTURE §12, shared by the root Vitest config
// and the coverage-gate self-test.

/** Packages whose logic must stay at ≥ 80 % line and branch coverage. */
export const GATED_PACKAGES = ["core", "schema", "storage", "protocol"];

const MINIMUM = { lines: 80, branches: 80 };

/**
 * Per-package thresholds keyed by source glob, so one weak package cannot hide
 * behind a well-tested one.
 * @param {string} prefix path prefix of the packages folder, relative to the Vitest root
 */
export function coverageThresholds(prefix = "packages") {
  return Object.fromEntries(
    GATED_PACKAGES.map((name) => [`${prefix}/${name}/src/**`, { ...MINIMUM }]),
  );
}
