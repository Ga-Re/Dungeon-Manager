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

/**
 * Theme names (ADR-0015): `workshop` is the dark default, `parchment` the light theme.
 */
export type ThemeName = "workshop" | "parchment";

/** Colour values per theme. */
export const THEMES: Record<ThemeName, Record<ColorToken, string>> = {
  workshop: {
    "surface-chrome": "#14171c",
    "surface-panel": "#22272f",
    "surface-raised": "#2c323c",
    "surface-sunken": "#181c22",
    "surface-canvas": "#111418",
    "text-primary": "#e6e9ee",
    "text-secondary": "#b9c0ca",
    "text-muted": "#9aa3af",
    "text-on-chrome": "#eef0f3",
    "text-on-chrome-muted": "#9aa3af",
    "text-on-accent": "#1b1f26",
    "border-strong": "#8b95a4",
    "border-subtle": "#363d48",
    accent: "#d9a441",
    "accent-soft": "#3f331b",
    "accent-line": "#d9a441",
    focus: "#5cb8be",
    danger: "#f09a86",
    success: "#8fcf9a",
  },
  parchment: {
    "surface-chrome": "#20242b",
    "surface-panel": "#efe8da",
    "surface-raised": "#f8f4ec",
    "surface-sunken": "#e6dcc8",
    "surface-canvas": "#16140f",
    "text-primary": "#2b2620",
    "text-secondary": "#4f473b",
    "text-muted": "#5e5546",
    "text-on-chrome": "#eceef1",
    "text-on-chrome-muted": "#a3a9b3",
    "text-on-accent": "#2b2620",
    "border-strong": "#6b5e48",
    "border-subtle": "#cdbfa3",
    accent: "#e2a62b",
    "accent-soft": "#f1dca8",
    "accent-line": "#8a5a12",
    focus: "#2a7f86",
    danger: "#9e3324",
    success: "#2e6034",
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
  ["text-muted", "accent-soft", 4.5],
  ["text-on-chrome-muted", "surface-canvas", 4.5],
  ["accent", "surface-chrome", 4.5],
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
  ["focus", "accent-soft", 3],
];

/** Theme-dependent values that are not plain colours. */
const SHADOWS: Record<ThemeName, string> = {
  workshop: "0 2px 8px rgb(0 0 0 / 0.4)",
  parchment: "0 2px 8px rgb(30 22 10 / 0.14)",
};

/**
 * Values shared by both themes: spacing (a 4/8 grid in quarter rems of the base size), type,
 * radii, layering, map overlays. `ui-base-size` is the DM window's root size (T-162); other apps
 * using these tokens keep their own root size.
 */
const SHARED: Record<string, string> = {
  // Sizes scale with the DM window's base size (T-162): rem, set from `ui-base-size` × the
  // DM's interface size. Hairlines and radii stay in px.
  "ui-base-size": "14px",
  "space-1": "0.25rem",
  "space-2": "0.5rem",
  "space-3": "0.75rem",
  "space-4": "1rem",
  "space-5": "1.5rem",
  "space-6": "2rem",
  // System fonts for now (DM decision 2026-11-18); real faces later by changing these only.
  // One family for labels and headings (ADR-0015); captions are small uppercase.
  "font-ui": 'system-ui, -apple-system, "Segoe UI", sans-serif',
  "font-heading": 'system-ui, -apple-system, "Segoe UI", sans-serif',
  "font-mono": "ui-monospace, Menlo, Consolas, monospace",
  "font-size-xs": "max(10px, 0.75rem)",
  "font-size-sm": "0.875rem",
  "font-size-md": "1rem",
  "font-size-lg": "1.125rem",
  "font-size-xl": "1.5rem",
  "radius-sm": "2px",
  "radius-md": "3px",
  "radius-lg": "4px",
  "radius-pill": "999px",
  "focus-width": "2px",
  // Layering contract (ADR-0011): canvas · overlays · HUD · ribbon/data panel · command panels
  // (above every panel, ADR-0021) · popovers · modals.
  "z-canvas": "0",
  "z-overlay": "10",
  "z-hud": "20",
  "z-chrome": "30",
  "z-command": "35",
  "z-popover": "40",
  "z-modal": "50",
  // Behind a modal dialog, in both themes.
  backdrop: "rgb(0 0 0 / 0.5)",
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
    `${indent}color-scheme: ${theme === "workshop" ? "dark" : "light"};`,
  ].join("\n");
}

/**
 * The token sheet as CSS: workshop (dark) by default; parchment when `data-dm-theme="parchment"`
 * is set on the root element, or when it is `"system"` and the OS prefers light (the DM chooses
 * in the settings; ADR-0015).
 */
export function tokensToCss(): string {
  return `/* Generated from packages/ui/src/tokens.ts – do not edit by hand. */

:root {
${declarations(SHARED, "  ")}
${themeBlock("workshop", "  ")}
}

:root[data-dm-theme="parchment"] {
${themeBlock("parchment", "  ")}
}

@media (prefers-color-scheme: light) {
  :root[data-dm-theme="system"] {
${themeBlock("parchment", "    ")}
  }
}
`;
}
