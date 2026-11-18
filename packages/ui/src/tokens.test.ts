import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COLOR_PAIRS,
  THEMES,
  contrastRatio,
  tokensToCss,
  type ThemeName,
} from "./tokens.js";

const themeNames = Object.keys(THEMES) as ThemeName[];

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // WCAG example: #777777 on white is just below 4.5:1.
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#2a2219", "#efe6d2")).toBe(
      contrastRatio("#efe6d2", "#2a2219"),
    );
  });

  it("rejects colours that are not #rrggbb", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow(/#rrggbb/);
  });
});

describe.each(themeNames)("theme %s", (theme) => {
  it.each(COLOR_PAIRS)(
    "%s on %s reaches %s:1 (WCAG AA)",
    (foreground, background, minimum) => {
      const colors = THEMES[theme];
      expect(
        contrastRatio(colors[foreground], colors[background]),
      ).toBeGreaterThanOrEqual(minimum);
    },
  );
});

describe("tokensToCss", () => {
  const css = tokensToCss();

  it("defines every colour token for both themes", () => {
    for (const name of Object.keys(THEMES.parchment)) {
      expect(css.match(new RegExp(`--dm-${name}:`, "g"))).toHaveLength(3);
    }
  });

  it("defines the z-index layering contract (ADR-0011)", () => {
    expect(css).toContain("--dm-z-canvas: 0;");
    expect(css).toContain("--dm-z-overlay: 10;");
    expect(css).toContain("--dm-z-hud: 20;");
    expect(css).toContain("--dm-z-chrome: 30;");
    expect(css).toContain("--dm-z-popover: 40;");
    expect(css).toContain("--dm-z-modal: 50;");
  });

  it("is what styles/tokens.css contains (run `pnpm --filter @dungeon-manager/ui gen:tokens` after changing tokens.ts)", () => {
    const committed = readFileSync(
      new URL("../styles/tokens.css", import.meta.url),
      "utf8",
    );
    expect(committed).toBe(css);
  });
});
