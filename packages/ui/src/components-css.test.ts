import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findHardCodedValues } from "./style-lint.js";

describe("styles/components.css", () => {
  it("uses tokens except for deliberate tree geometry", () => {
    const css = readFileSync(
      new URL("../styles/components.css", import.meta.url),
      "utf8",
    );
    // Deliberate tree geometry: the 1px left padding aligns the toggle box with the guide line,
    // and z-index 1 only lifts the junction dot above its own stub (local, not the layering contract).
    expect(
      findHardCodedValues(css).map((finding) => finding.replace(/^\d+: /, "")),
    ).toEqual(["padding: 0 var(--dm-space-2) 0 1px", "z-index: 1"]);
  });
});
