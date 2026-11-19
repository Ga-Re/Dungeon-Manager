# ADR-0011: UI design system – canvas-first CAD-style layout with a fantasy parchment theme

- **Status:** partly replaced by ADR-0014 & ADR-0015
- **Date:** 2026-11-18
- **Deciders:** DM (product owner), agent

## Context
The DM window has grown task by task (T-105 to T-108b): `LibraryPanel`, `CampaignPanel`, `OpenScenePanel`, `FogToolbar`, `MapView` and `MapChangeChoice` are stacked vertically in a padded `<main>`, and the map canvas gets a fixed `60vh`. Styling lives in one `apps/desktop/src/styles.css` (~110 lines) with hard-coded hex colours and `system-ui`; `packages/ui` is still an empty placeholder (ARCHITECTURE §3).

Coming stages add many more controls to the same window (SPEC 2.1: player-view preview, next-scene preview, tokens, initiative, sound, light, scenes, camera). Without a layout model every new panel pushes the map further down, and every task invents its own spacing and colours.

Constraints:
- The map is the DM's primary workspace and must stay as large as possible during play (SPEC 2.1).
- The game runs in a **dim room**; the DM glances at the notebook between turns. Contrast and legibility beat decoration.
- The player window shows **no controls** (SPEC 2.2) – any design system applies to the DM window and the companion only.
- UI strings go through i18n, German first (ADR-0008); keyboard support on desktop, sensible touch targets on mobile (CLAUDE.md).
- `packages/ui` may be used by desktop and companion, **not** by `apps/mobile` (ARCHITECTURE §4).
- Performance budgets (ARCHITECTURE §11) – HUD elements float over a PixiJS canvas and a 4K `<video>` (ADR-0010); they must not cost player-view frames.
- Public repository: no licensed fonts, textures or icons may be committed.

## Options considered
1. **Keep the current approach** (stacked panels, ad-hoc CSS per task) – zero effort now, no new concepts. Con: the canvas shrinks with every feature; inconsistent look; colours and z-indices duplicated across components; restyling later touches every component at once.
2. **Canvas-first layout, neutral dark "pro tool" theme** – the spatial model of CAD tools (full-window viewport, collapsible side drawer, mode-grouped top ribbon, floating overlays), styled with plain neutral dark tokens. Pros: maximal map space, low design effort, easy to keep high contrast. Con: generic; does not support the tabletop atmosphere the DM wants for an at-the-table tool.
3. **Canvas-first layout (as in 2) plus a tactile fantasy theme via design tokens** – same spatial model, with warm stone/parchment surfaces framed by dark iron/slate borders, tree views with connector lines, thematic icons. All colours, spacing, fonts and z-indices are CSS custom properties defined once in `@dungeon-manager/ui`. Pros: maximal map space *and* a coherent identity; the theme is swappable because components only consume tokens. Cons: more design effort; textures and serif fonts need self-made or freely licensed (CC0/OFL) assets bundled locally; light parchment surfaces can glare in a dim room and must be used sparingly.
4. **Adopt a third-party component library / CSS framework** (e.g. Mantine, Radix + Tailwind) – ready-made accessible primitives (menus, dialogs, focus handling). Cons: new dependencies to vet and maintain; their default look fights a custom fantasy theme; does not by itself decide the layout question. Could still be added later for individual primitives (e.g. accessible popovers) if writing them ourselves proves costly – each such addition is a separate dependency decision.

## Decision
Option 3. The layout model fixes the real problem (the canvas losing space with each feature), and the token layer makes the fantasy look a theme on top of it rather than something baked into each component. The binding rules live in `.claude/skills/ui-design/SKILL.md`; in short:

- **Zones (DM window):** the map viewport fills the whole window; a collapsible left data panel (library, campaign); a top ribbon grouped by workflow mode (scene, fog, tokens, display); a floating scene browser (top left); a floating navigation/display dock (bottom centre: zoom, fit, rotation, player-feed status); a cursor-centred context menu on right-click. New features are placed in one of these zones – no inline forms that resize the canvas.
- **Tokens:** `--dm-surface-*`, `--dm-border-*`, `--dm-text-*`, `--dm-accent-*`, `--dm-space-*`, `--dm-font-*`, `--dm-z-*` defined in `@dungeon-manager/ui`; apps never hard-code colours, spacing, fonts or z-indices.
- **Layering contract:** 0 map canvas/video · 10 canvas overlays (fog preview, measurement) · 20 floating HUD (scene browser, dock) · 30 ribbon and data panel · 40 context menus/popovers · 50 modals.
- **Readability first:** WCAG AA contrast minimum on every surface. Panels use light parchment with dark ink; the window chrome (title bar, tabs) is dark slate/navy. Because light panels glare in a dim room, the tokens also define a dimmed "night" variant of the parchment surfaces that the DM can switch to; both variants must pass AA.
- **Shared primitives** (`FloatingPanel`, `RibbonToolbar`, `TreeList`, `IconButton`, `ContextMenu`) live in `packages/ui` once a second consumer exists or they are generic.
- The "Fusion 360" reference describes a layout pattern only; we do not copy its icons, artwork or branding.

### Design references (DM mock-ups, 2026-11-18)
The DM supplied three rough mock-ups (an illustrated file tree, a parchment "browser" tree panel and a ribbon toolbar). They are **inspiration, not the final design**; the final design must look more professional and restrained. The images are not committed (they contain third-party setting names and a placeholder brand); this section records what we take from them.

Adopted:
- **Tree panel:** vertical/horizontal connector lines with small round node markers; bold folder rows with disclosure triangles; a filter field and an item-count badge in the panel header; per-row trailing actions (visibility eye, remove) and small metadata badges (e.g. size, type, role); the selected row as an accent-filled, bordered row.
- **Ribbon:** a dark title bar with app actions (save, undo, redo) and document tabs with an unsaved-changes dot; below it a parchment ribbon with a workspace selector, mode tabs (one per workflow mode) and tool groups with captions and dropdown carets; the active tool as an accent-filled button.
- **Palette direction:** warm parchment surfaces, dark ink text and borders, one amber/gold accent for active and selected states, a muted teal for focus and secondary emphasis.

Refined for a professional look:
- No illustrative decoration (chests, candles, gems, ornate frames); the fantasy feel comes from palette, typography and a very subtle paper grain at most.
- One consistent line-icon set at a single stroke weight instead of emoji or mixed pictograms.
- Typography: a sans-serif for UI labels, a serif only for panel and section headings, monospace only for file names and technical values; sentence case for labels, all-caps only for small group captions.
- Thin borders and soft, low shadows instead of thick hard-offset "sticker" shadows; a strict 4/8 px spacing grid and a fixed type scale.
- Colour is never the only signal (e.g. token roles get a text label or shape as well as a colour).
- The tools shown in the ribbon mock-up (walls, doors, terrain, 2.5D iso, sprites) illustrate the pattern; they do not add scope beyond SPEC.md.

## Consequences
- **Easier:** placing new controls (each has a zone), keeping the map large during play, consistent look across DM window and companion, re-theming later by changing tokens only.
- **Harder:** an initial restructuring of `DmApp` into the zone layout touches every existing panel; existing E2E selectors and any DM-window screenshots must be updated in that task.
- **Player window unaffected:** it keeps its chrome-free black fullscreen view.
- **Companion:** uses the same tokens and primitives, but phone screens do not fit the zone layout; it gets its own single-column layout with large touch targets.
- **Mobile app:** cannot import `packages/ui` (ARCHITECTURE §4). Sharing the theme with Expo needs the token *values* in a platform-neutral form (e.g. a plain TS/JSON token file the CSS is generated from). Deferred until the mobile UI work starts; tracked as a follow-up task.
- **Assets:** any texture, font or icon set must be self-made, CC0 or OFL, bundled locally (offline-first) and listed with its source. Each external font or icon package is a dependency decision for the DM.
- **Performance:** translucent HUD panels over the canvas must avoid expensive effects (`backdrop-filter` blur, large animated shadows) unless the benchmark scene (ARCHITECTURE §11) shows no regression. The DM window shares the GPU with the player view.
- **Testing:** layout and theme changes are covered by component tests and Playwright E2E; DM-window screenshot tests are added for the zone layout. The coverage rule stays as in ARCHITECTURE §12 (no fixed gate for UI); the `ui-design` skill's earlier "100 % unit test coverage" demand was aligned with §12 when this ADR was accepted, because 100 % on React components mostly produces brittle tests.
- **Follow-up tasks:** T-129 (token sheet and base primitives in `packages/ui`), T-130 (DM window zone layout), T-131 (fog tools in the ribbon, bottom dock), T-132 (platform-neutral token source for mobile).
