/**
 * Design tokens of the DM window and companion (ADR-0011, ARCHITECTURE §15).
 *
 * The values live here as data so tests can check them (WCAG contrast) and
 * `styles/tokens.css` is generated from them (`pnpm --filter @dungeon-manager/ui gen:tokens`).
 * Apps only ever use the resulting CSS custom properties (`var(--dm-…)`).
 */

/** Colour roles; every theme defines all of them as `#rrggbb`. */
export type ColorToken =
  | "surface-chrome"
  | "surface-panel"
  | "surface-raised"
  | "surface-sunken"
  | "surface-canvas"
  | "text-primary"
  | "text-secondary"
  | "text-muted"
  | "text-on-chrome"
  | "text-on-chrome-muted"
  | "text-on-accent"
  | "border-strong"
  | "border-subtle"
  | "accent"
  | "accent-soft"
  | "accent-line"
  | "focus"
  | "danger"
  | "success";

/** Theme names; `parchment` is the default, `night` the dimmed variant for a dark room. */
export type ThemeName = "parchment" | "night";

/** Colour values per theme. */
export const THEMES: Record<ThemeName, Record<ColorToken, string>> = {
  parchment: {
    "surface-chrome": "#1e232d",
    "surface-panel": "#efe6d2",
    "surface-raised": "#f7f0e1",
    "surface-sunken": "#e2d5b9",
    "surface-canvas": "#16140f",
    "text-primary": "#2a2219",
    "text-secondary": "#54473a",
    "text-muted": "#625341",
    "text-on-chrome": "#ece5d5",
    "text-on-chrome-muted": "#a9a294",
    "text-on-accent": "#2a2219",
    "border-strong": "#3b3226",
    "border-subtle": "#c4b28c",
    accent: "#e2a62b",
    "accent-soft": "#f3d48a",
    "accent-line": "#9c6f17",
    focus: "#2a7f86",
    danger: "#9e3324",
    success: "#2e6034",
  },
  night: {
    "surface-chrome": "#12151b",
    "surface-panel": "#37312a",
    "surface-raised": "#423b32",
    "surface-sunken": "#2b2620",
    "surface-canvas": "#0d0c09",
    "text-primary": "#eee3cb",
    "text-secondary": "#cdbf9f",
    "text-muted": "#bcae92",
    "text-on-chrome": "#e6dfcf",
    "text-on-chrome-muted": "#9c9586",
    "text-on-accent": "#1c170f",
    "border-strong": "#9a8a6d",
    "border-subtle": "#5d5141",
    accent: "#d9a237",
    "accent-soft": "#4d3d1c",
    "accent-line": "#d0a24a",
    focus: "#5cb8be",
    danger: "#f09a86",
    success: "#8cc792",
  },
};

/**
 * Foreground/background pairs that must stay readable, with their WCAG AA minimum:
 * 4.5:1 for text, 3:1 for UI parts such as borders, tree lines and focus rings.
 */
export const COLOR_PAIRS: readonly (readonly [
  ColorToken,
  ColorToken,
  number,
])[] = [
  ["text-primary", "surface-panel", 4.5],
  ["text-primary", "surface-raised", 4.5],
  ["text-primary", "surface-sunken", 4.5],
  ["text-primary", "accent-soft", 4.5],
  ["text-secondary", "surface-panel", 4.5],
  ["text-secondary", "surface-raised", 4.5],
  ["text-secondary", "surface-sunken", 4.5],
  ["text-muted", "surface-panel", 4.5],
  ["text-muted", "surface-raised", 4.5],
  ["text-muted", "surface-sunken", 4.5],
  ["text-on-chrome", "surface-chrome", 4.5],
  ["text-on-chrome-muted", "surface-chrome", 4.5],
  ["text-on-accent", "accent", 4.5],
  ["danger", "surface-panel", 4.5],
  ["danger", "surface-raised", 4.5],
  ["success", "surface-panel", 4.5],
  ["success", "surface-raised", 4.5],
  ["border-strong", "surface-panel", 3],
  ["border-strong", "accent-soft", 3],
  ["accent-line", "surface-panel", 3],
  ["focus", "surface-panel", 3],
  ["focus", "surface-sunken", 3],
  ["focus", "surface-raised", 3],
  ["focus", "surface-chrome", 3],
  ["focus", "surface-canvas", 3],
];

/** Theme-dependent values that are not plain colours. */
const SHADOWS: Record<ThemeName, string> = {
  parchment: "0 2px 6px rgb(30 22 10 / 0.18)",
  night: "0 2px 8px rgb(0 0 0 / 0.45)",
};

/** Values shared by both themes: spacing (4/8 px grid), type, radii, layering, map overlays. */
const SHARED: Record<string, string> = {
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "24px",
  "space-6": "32px",
  // System fonts for now (DM decision 2026-11-18); real faces later by changing these only.
  "font-ui": 'system-ui, -apple-system, "Segoe UI", sans-serif',
  "font-heading": 'Georgia, "Times New Roman", serif',
  "font-mono": "ui-monospace, Menlo, Consolas, monospace",
  "font-size-xs": "0.75rem",
  "font-size-sm": "0.875rem",
  "font-size-md": "1rem",
  "font-size-lg": "1.125rem",
  "font-size-xl": "1.5rem",
  "radius-sm": "4px",
  "radius-md": "6px",
  "radius-lg": "8px",
  "radius-pill": "999px",
  "focus-width": "2px",
  // Layering contract (ADR-0011): canvas · overlays · HUD · ribbon/data panel · popovers · modals.
  "z-canvas": "0",
  "z-overlay": "10",
  "z-hud": "20",
  "z-chrome": "30",
  "z-popover": "40",
  "z-modal": "50",
  // Drawn over the map itself, so independent of the theme.
  "overlay-line": "#ffffff",
  "overlay-reveal-fill": "rgb(255 255 255 / 0.2)",
  "overlay-reveal-stroke": "rgb(255 255 255 / 0.35)",
  "overlay-hide-fill": "rgb(0 0 0 / 0.45)",
  "overlay-hide-stroke": "rgb(0 0 0 / 0.5)",
};

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a colour as #rrggbb, got "${hex}"`);
  }
  const [r, g, b] = [1, 3, 5].map((start) =>
    channel(Number.parseInt(hex.slice(start, start + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two `#rrggbb` colours (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function declarations(values: Record<string, string>, indent: string): string {
  return Object.entries(values)
    .map(([name, value]) => `${indent}--dm-${name}: ${value};`)
    .join("\n");
}

function themeBlock(theme: ThemeName, indent: string): string {
  return [
    declarations(THEMES[theme], indent),
    `${indent}--dm-shadow-panel: ${SHADOWS[theme]};`,
    `${indent}color-scheme: ${theme === "night" ? "dark" : "light"};`,
  ].join("\n");
}

/**
 * The token sheet as CSS: parchment by default; night when `data-dm-theme="night"` is set on
 * the root element, or when it is `"system"` and the OS prefers dark (the DM chooses in the
 * settings; ADR-0011).
 */
export function tokensToCss(): string {
  return `/* Generated from packages/ui/src/tokens.ts – do not edit by hand. */

:root {
${declarations(SHARED, "  ")}
${themeBlock("parchment", "  ")}
}

:root[data-dm-theme="night"] {
${themeBlock("night", "  ")}
}

@media (prefers-color-scheme: dark) {
  :root[data-dm-theme="system"] {
${themeBlock("night", "    ")}
  }
}
`;
}
