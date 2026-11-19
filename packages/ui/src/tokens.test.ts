import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COLOR_PAIRS,
  HUD,
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

describe("tool windows over the map", () => {
  /** A translucent chip over a white map: the worst case for light text. */
  const overWhite = (chip: { rgb: readonly number[]; alpha: number }) =>
    `#${chip.rgb
      .map((channel) =>
        Math.round(channel * chip.alpha + 255 * (1 - chip.alpha))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

  it.each(["row", "row-hover", "row-selected"] as const)(
    "text stays readable on the %s chip over a white map",
    (chip) => {
      expect(
        contrastRatio(HUD.text, overWhite(HUD[chip])),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(HUD["text-muted"], overWhite(HUD[chip])),
      ).toBeGreaterThanOrEqual(4.5);
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

  it("is the workshop theme by default and parchment on request or for a light OS (ADR-0015)", () => {
    const root = css.slice(0, css.indexOf(':root[data-dm-theme="parchment"]'));
    expect(root).toContain(
      `--dm-surface-panel: ${THEMES.workshop["surface-panel"]};`,
    );
    expect(root).toContain("color-scheme: dark;");
    expect(css).toMatch(
      /:root\[data-dm-theme="parchment"\] \{[^}]*color-scheme: light;/,
    );
    expect(css).toMatch(
      /@media \(prefers-color-scheme: light\) \{\s*:root\[data-dm-theme="system"\]/,
    );
  });

  it("uses one type family for labels and headings (ADR-0015)", () => {
    expect(css).not.toMatch(/--dm-font-heading:[^;]*(?<!sans-)serif;/);
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
