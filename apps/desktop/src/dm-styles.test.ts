import { findHardCodedValues } from "@dungeon-manager/ui";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("DM window styles", () => {
  it("use design tokens instead of hard-coded colours, spacing, fonts and z-indices (ADR-0011)", () => {
    const css = readFileSync(new URL("./dm.css", import.meta.url), "utf8");
    expect(findHardCodedValues(css)).toEqual([]);
  });
});
