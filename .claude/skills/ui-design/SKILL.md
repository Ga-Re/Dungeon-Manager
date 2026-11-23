---
name: ui-design
description: Governs UI/UX design decisions, spatial layout, component styling, and visual consistency across Dungeon Manager. Invoke this skill automatically whenever creating or modifying React components, CSS, layouts, toolbars, panels, icons, or answering design and UX questions.
---

# Dungeon Manager UI/UX Design Skill

You are responsible for enforcing and evolving the visual design and spatial ergonomics of Dungeon Manager (`@dungeon-manager/ui`, `apps/desktop`, `apps/companion`). Every UI change or design proposal must strictly adhere to this guide.

## 1. Core Design Philosophy: "CAD Ergonomics meets Tabletop Fantasy"

Dungeon Manager combines two distinct paradigms:

1. **Spatial Architecture (Autodesk Fusion 360 Paradigm):**
   - **Dockable panels (ADR-0017, T-172a):** below the fixed title bar and ribbon, the window is made of dockview panels the DM resizes, moves, docks and hides (View menu). New tool areas become panels (`PANELS` in `panel-layout.tsx`), not fixed zones or floating overlays.
   - **Map-First Viewport (ADR-0014):** The `MapView` (PixiJS + `<video>` layer) fills its map panel exactly, with zero wasted margins; nothing permanent covers it.
   - **Data Panel (`#1`, left in the default layout):** the source the DM drags from (catalogue). Cmd/Ctrl+B shows or hides it so the DM can maximize map space during play.
   - **Contextual Ribbon Toolbar (full-width Top Bar below the title bar, docked, `#2` & `#4`):** Grouped by workflow mode (e.g., _Scene_, _Fog of War_, _Tokens_, _Display/Projection_) with clear primary icon buttons and dropdown sub-menus.
   - **Browser panel (`#3`, right column in the default layout):** a compact tree view of the open document (Map Layer, Video Layer, Fog Shapes, Tokens, Notes) with quick visibility (`eye`) toggles; Eigenschaften (inspector) below it.
   - **Floating Navigation & Display Dock (Bottom Center, `#8`):** Houses zoom, pan, fit-to-screen, rotation controls (`90°`), and live `PlayerFeed` projection status.
   - **Radial / Marking Context Menu (Right-Click, `#6`):** Fast, cursor-centered access to frequent actions (Undo/Redo, Reveal/Hide Fog, Rotate, Reset View).

2. **Visual Aesthetic (Professional CAD look with a fantasy accent, ADR-0015):**
   - **Surfaces:** Two themes from tokens: the default dark "workshop" (slate surfaces, gold accent) and a reduced light "parchment". Panels are flat with thin borders; floating parts over the map use a small header bar and, where possible, a transparent body (Fusion-style browser).
   - **Tree Views & Lists:** File and entity trees use one of two `TreeList` variants: `guides` (vertical/horizontal connector lines with node markers) for trees inside panels, and `compact` (disclosure chevrons, no lines, rows on translucent chips) for tool windows over the map such as the scene browser (T-158). Clear sans-serif labels and one line-icon set.
   - **Professional, restrained finish:** follow ADR-0011 "Design references" and ADR-0015 – no illustrative decoration, one line-icon set, one sans-serif family for labels and headings (no serif), small uppercase captions and tabs, monospace only for file names and values, thin borders, small radii, soft low shadows only on floating parts, 4/8 spacing grid in quarter rems of the base size (ADR-0016), one accent for active/selected states.
   - **Readability First:** Usability in a dim room first. Maintain high contrast (WCAG AA minimum) in both themes; text over the map needs a scrim or shadow.

## 2. Design System Architecture & Rules

1. **Centralized Tokens & Primitives (`@dungeon-manager/ui`):**
   - Never hardcode hex colors, spacing, z-indices, or font stacks inside `apps/desktop` or `apps/companion`.
   - Define and consume CSS custom properties (`--dm-surface-*`, `--dm-border-*`, `--dm-text-*`, `--dm-accent-*`, `--dm-space-*`, `--dm-font-*`, `--dm-z-*`) from `@dungeon-manager/ui`.
   - Reusable layout primitives (FloatingPanel, RibbonToolbar, TreeList, IconButton, RadialMenu) belong in `packages/ui` whenever shared or generic.
2. **Z-Index Layering Contract:**
   - `0`: Map Canvas (`packages/renderer` PixiJS + HTML5 video layer)
   - `10`: Canvas overlays (`FogPreview`, measurement guides)
   - `20`: Floating HUD elements (Scene Browser, Bottom Navigation Dock)
   - `30`: Top Ribbon Toolbar & Collapsible Data Panel
   - `35`: Command panels of ribbon tools, one layer above every panel (ADR-0021)
   - `40`: Context / Radial Menus & Popovers
   - `50`: Modals & Critical Prompts (`MapChangeChoice`, error dialogs)
3. **Strict Architectural Boundaries:**
   - `packages/ui` may only import `react`, `@dungeon-manager/core`, `@dungeon-manager/schema`, `@dungeon-manager/i18n`, and `@dungeon-manager/renderer` (public entry only). Never import `@tauri-apps/*` in `packages/ui` (enforced by `dependency-cruiser`).
   - All user-facing labels, tooltips, and `aria-label` attributes MUST go through `@dungeon-manager/i18n` (`de` primary, `en` secondary — ADR 0008).
   - Testing follows ARCHITECTURE §12: component tests (Vitest + React Testing Library) for every non-trivial component, Playwright E2E for user-facing flows, and unit tests for pure helper logic. There is no fixed coverage gate for UI.

## 3. Workflow When Invoked

Whenever you are asked a design question or tasked with building/modifying UI:

1. **Check Current State:** Inspect `packages/ui/src/`, `apps/desktop/src/styles.css`, and the relevant component in `apps/desktop/src/dm/` or `apps/desktop/src/player/`.
2. **Map to Fusion 360 Zones:** Decide which spatial zone the feature belongs to (a panel, the Top Ribbon, the map panel's Bottom Dock, or the Radial Menu). Do not invent ad-hoc inline forms that push the canvas around.
3. **Apply Styling via Tokens:** Use the theme tokens (both themes) and the shared primitives. If a token does not exist yet because the design is still evolving, propose and add the CSS custom property to the root token sheet first.
4. **Verify Accessibility & Tests:** Ensure semantic HTML (`role`, `aria-label` via `t(...)`), keyboard navigation, and update Vitest / Playwright visual tests if layout or golden screenshots (`pnpm test:visual`) are affected.
