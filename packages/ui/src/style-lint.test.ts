import { describe, expect, it } from "vitest";
import { findHardCodedValues } from "./style-lint.js";

describe("findHardCodedValues", () => {
  it("accepts declarations that only use tokens or neutral keywords", () => {
    const css = `
      .a { color: var(--dm-text-primary); background: transparent; border: 1px solid var(--dm-border-subtle); }
      .b { padding: var(--dm-space-2) var(--dm-space-3); margin: 0; gap: var(--dm-space-1); inset: 0; }
      .c { font-family: var(--dm-font-ui); font: inherit; z-index: var(--dm-z-hud); }
      .d { margin: 0 auto; padding-left: calc(var(--dm-space-2) * 2); color: currentColor; }
    `;
    expect(findHardCodedValues(css)).toEqual([]);
  });

  it("reports colour literals", () => {
    expect(
      findHardCodedValues(
        ".a { color: #fff; }\n.b { fill: rgba(0, 0, 0, 0.4); }\n.c { stroke: white; }",
      ),
    ).toEqual([
      "1: color: #fff",
      "2: fill: rgba(0, 0, 0, 0.4)",
      "3: stroke: white",
    ]);
  });

  it("reports literal spacing, fonts and z-indices", () => {
    expect(
      findHardCodedValues(
        ".a {\n  padding: 0.5rem 0.75rem;\n  gap: 8px;\n  font-family: system-ui, sans-serif;\n  z-index: 1;\n}",
      ),
    ).toEqual([
      "2: padding: 0.5rem 0.75rem",
      "3: gap: 8px",
      "4: font-family: system-ui, sans-serif",
      "5: z-index: 1",
    ]);
  });

  it("reports negative lengths, literal fallbacks, font shorthands and font sizes", () => {
    expect(
      findHardCodedValues(
        ".a { margin: -4px; }\n.b { color: var(--dm-text, #fff); }\n.c { font: 14px/1.4 serif; }\n.d { font-size: 13px; }",
      ),
    ).toEqual([
      "1: margin: -4px",
      "2: color: var(--dm-text, #fff)",
      "3: font: 14px/1.4 serif",
      "4: font-size: 13px",
    ]);
  });

  it("accepts nested token fallbacks", () => {
    expect(
      findHardCodedValues(".a { color: var(--dm-a, var(--dm-b)); }"),
    ).toEqual([]);
  });

  it("ignores comments and custom property definitions", () => {
    expect(
      findHardCodedValues("/* color: #fff; */\n:root { --local: #fff; }"),
    ).toEqual([]);
  });
});
